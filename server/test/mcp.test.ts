/**
 * The MCP server: protocol handshake, the tool list, each tool against a fake chain and fake APIs,
 * and a real stdio session with the server process.
 * Run: pnpm --filter server test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { Address, Hex } from "viem";
import { callTool, createMcpHandler, explainRefusal, MCP_TOOLS, type McpDeps } from "@standeva/agentmeter/mcp";
import { encodeHeader, resourceHashOf, responseHashOf, SCHEME, type PaidCall, type PaymentRequired } from "@standeva/agentmeter";

const MANDATE: Address = "0x1111111111111111111111111111111111111111";
const SELLER: Address = "0x000000000000000000000000000000000000bEEF";
const STRANGER: Address = "0x000000000000000000000000000000000000bad1";
const AGENT: Address = "0x2222222222222222222222222222222222222222";
const URL_PRICE = "https://api.example.com/v1/price?pair=BTC-USD";
const PAYMENT_ID: Hex = `0x${"ab".repeat(32)}`;
const ANSWER = '{"pair":"BTC-USD","price":97012.5}';

/** A 402 response like the paywall sends. */
function paywalled(amount: string, payTo: Address = SELLER, mandateContract: Address = MANDATE): Response {
  const required: PaymentRequired = {
    x402Version: 2,
    resource: { url: "/v1/price?pair=BTC-USD", description: "BTC price" },
    accepts: [
      {
        scheme: SCHEME,
        network: "eip155:44005",
        amount,
        asset: "0x456569838f1d43009A91ebA4263147Afd7233483",
        payTo,
        maxTimeoutSeconds: 120,
        extra: { mandateContract, resourceHash: resourceHashOf("/v1/price?pair=BTC-USD") },
      },
    ],
  } as PaymentRequired;
  return new Response(JSON.stringify(required), { status: 402, headers: { "PAYMENT-REQUIRED": encodeHeader(required) } });
}

type ChainState = { revoked?: boolean; allowed?: Address[]; remaining?: [bigint, bigint, bigint, bigint]; agent?: Address; responseHash?: Hex };

function deps(state: ChainState = {}, http: (url: string) => Response = () => paywalled("10000"), paid?: Partial<PaidCall>): McpDeps & { paidCalls: string[] } {
  const paidCalls: string[] = [];
  return {
    paidCalls,
    mandate: MANDATE,
    mandateId: 1n,
    agent: AGENT,
    chainId: 44005,
    explorer: "https://explorer-test.qday.info",
    fetch: (async (url: string) => http(url)) as typeof fetch,
    payingFetch: async (url: string) => {
      paidCalls.push(url);
      return { url, status: 200, body: JSON.parse(ANSWER), rawBody: ANSWER, paid: { amount: "10000", payTo: SELLER, transaction: "0xfeed", paymentId: PAYMENT_ID }, ...paid };
    },
    reader: {
      async readContract({ functionName, args }: { functionName: string; args: unknown[] }) {
        if (functionName === "getMandate") {
          return { owner: STRANGER, agent: state.agent ?? AGENT, revoked: !!state.revoked, limits: { expiresAt: 4_000_000_000n } };
        }
        if (functionName === "remaining") return state.remaining ?? [50_000n, 1_000_000n, 3_000_000n, 2_000_000n];
        if (functionName === "isAllowedPayee") return (state.allowed ?? [SELLER]).some((a) => a.toLowerCase() === String(args[1]).toLowerCase());
        if (functionName === "receiptOf") {
          return { paidAt: args[0] === PAYMENT_ID ? 1n : 0n, payee: SELLER, amount: 10_000n, responseHash: state.responseHash ?? responseHashOf(ANSWER) };
        }
        throw new Error(`unexpected read ${functionName}`);
      },
    },
  };
}
const textOf = (r: { content: { text: string }[] }) => r.content.map((c) => c.text).join("\n");

test("handshake: initialize echoes the client's protocol version and offers tools", async () => {
  const handle = createMcpHandler(async () => deps());
  const res: any = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
  assert.equal(res.result.protocolVersion, "2025-06-18");
  assert.deepEqual(res.result.capabilities, { tools: {} });
  assert.equal(res.result.serverInfo.name, "agentmeter");
  assert.equal(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }), undefined, "notifications get no reply");
});

test("tools/list returns the four tools with input schemas", async () => {
  const res: any = await createMcpHandler(async () => deps())({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(res.result.tools.map((t: any) => t.name), ["check_price", "pay_and_fetch", "mandate_budget", "verify_receipt"]);
  for (const t of MCP_TOOLS) assert.equal(t.inputSchema.type, "object");
});

test("unknown methods get a JSON-RPC error", async () => {
  const res: any = await createMcpHandler(async () => deps())({ jsonrpc: "2.0", id: 3, method: "resources/list" });
  assert.equal(res.error.code, -32601);
});

test("check_price: an allowed seller within the caps would be paid", async () => {
  const out = textOf((await callTool(deps(), "check_price", { url: URL_PRICE })) as any);
  assert.match(out, /Price: 0\.01 tUSD8/);
  assert.match(out, /Would pay: yes/);
});

test("check_price: a stranger, an over-cap price and a revoked mandate are each explained", async () => {
  const stranger = textOf((await callTool(deps({}, () => paywalled("10000", STRANGER)), "check_price", { url: URL_PRICE })) as any);
  assert.match(stranger, /isn't on the allowed list/);
  const greedy = textOf((await callTool(deps({}, () => paywalled("500000")), "check_price", { url: URL_PRICE })) as any);
  assert.match(greedy, /above the per-call cap \(0\.05\)/);
  const revoked = textOf((await callTool(deps({ revoked: true }), "check_price", { url: URL_PRICE })) as any);
  assert.match(revoked, /revoked/);
});

test("check_price: a free URL says so", async () => {
  const out = textOf((await callTool(deps({}, () => new Response("ok", { status: 200 })), "check_price", { url: URL_PRICE })) as any);
  assert.match(out, /free/);
});

test("pay_and_fetch: pays and returns the answer, the transaction link and the paymentId", async () => {
  const d = deps();
  const out = textOf((await callTool(d, "pay_and_fetch", { url: URL_PRICE })) as any);
  assert.deepEqual(d.paidCalls, [URL_PRICE]);
  assert.match(out, /Paid 0\.01 tUSD8/);
  assert.match(out, /explorer-test\.qday\.info\/tx\/0xfeed/);
  assert.match(out, new RegExp(`paymentId: ${PAYMENT_ID}`));
  assert.ok(out.includes(ANSWER));
});

test("pay_and_fetch: max_price stops an expensive call before anything is signed", async () => {
  const d = deps({}, () => paywalled("500000"));
  const out = textOf((await callTool(d, "pay_and_fetch", { url: URL_PRICE, max_price: "0.05" })) as any);
  assert.match(out, /above your max_price/);
  assert.deepEqual(d.paidCalls, [], "payingFetch was never called");
});

test("pay_and_fetch: a refusal is reported in plain words as an error", async () => {
  const r: any = await callTool(deps({}, undefined, { refused: "mandate_PayeeNotAllowed", paid: undefined, status: 402 }), "pay_and_fetch", { url: URL_PRICE });
  assert.equal(r.isError, true);
  assert.match(textOf(r), /nothing was paid: PayeeNotAllowed: this seller isn't on the mandate's allowed list/);
});

test("mandate_budget: shows the four numbers and warns when the key isn't the mandate's agent", async () => {
  const out = textOf((await callTool(deps(), "mandate_budget")) as any);
  assert.match(out, /Per call: up to 0\.05/);
  assert.match(out, /Left today: 1/);
  assert.match(out, /Left in total: 3/);
  assert.match(out, /In escrow: 2/);
  assert.doesNotMatch(out, /Warning/);
  const wrong = textOf((await callTool(deps({ agent: STRANGER }), "mandate_budget")) as any);
  assert.match(wrong, /Warning: this mandate's agent is/);
});

test("verify_receipt: the exact answer matches, a changed one doesn't", async () => {
  const ok = textOf((await callTool(deps(), "verify_receipt", { payment_id: PAYMENT_ID, answer: ANSWER })) as any);
  assert.match(ok, /^Matches/);
  const bad = textOf((await callTool(deps(), "verify_receipt", { payment_id: PAYMENT_ID, answer: ANSWER.replace("97012.5", "97012.6") })) as any);
  assert.match(bad, /^Doesn't match/);
  const unknown = textOf((await callTool(deps(), "verify_receipt", { payment_id: `0x${"cd".repeat(32)}`, answer: ANSWER })) as any);
  assert.match(unknown, /No payment with that id/);
});

test("bad input is rejected without touching the network", async () => {
  const d = deps({}, () => {
    throw new Error("network touched");
  });
  assert.equal(((await callTool(d, "pay_and_fetch", { url: "not a url" })) as any).isError, true);
  assert.equal(((await callTool(d, "verify_receipt", { payment_id: "0x12", answer: "x" })) as any).isError, true);
  assert.equal(explainRefusal("mandate_ExceedsPeriodBudget"), "ExceedsPeriodBudget: today's budget is used up");
});

test("stdio: the real server process answers initialize and tools/list, and explains missing settings", async () => {
  const require = createRequire(import.meta.url);
  const bin = fileURLToPath(new URL("../src/bin/mcp.ts", `file://${require.resolve("@standeva/agentmeter/mcp")}`));
  const child = spawn(process.execPath, [...process.execArgv, bin], {
    env: { PATH: process.env.PATH ?? "" }, // no AGENT_KEY etc.
    stdio: ["pipe", "pipe", "pipe"],
  });
  const replies: any[] = [];
  let buf = "";
  const got = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out; got ${JSON.stringify(replies)}`)), 15000);
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        replies.push(JSON.parse(buf.slice(0, i)));
        buf = buf.slice(i + 1);
      }
      if (replies.length >= 3) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const send = (m: unknown) => child.stdin.write(`${JSON.stringify(m)}\n`);
  send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  send({ jsonrpc: "2.0", method: "notifications/initialized" });
  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "mandate_budget", arguments: {} } });
  await got;
  child.kill();
  const byId = Object.fromEntries(replies.map((r) => [r.id, r]));
  assert.equal(byId[1].result.serverInfo.name, "agentmeter");
  assert.equal(byId[2].result.tools.length, 4);
  assert.equal(byId[3].result.isError, true);
  assert.match(byId[3].result.content[0].text, /isn't configured: set AGENT_KEY/);
});
