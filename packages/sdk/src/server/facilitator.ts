import express, { type Express } from "express";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  isHex,
  type Address,
  type Chain,
  type Hex,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentMandateAbi } from "../abi.ts";
import { aevumTestnet, caip2 } from "../chain.ts";
import { reasonName, type Payment } from "../mandate.ts";
import { SCHEME, X402_VERSION, type FacilitatorRequest, type SettleResponse, type VerifyResponse } from "../x402.ts";
import { checkRequest, type CheckContext } from "./checks.ts";

export type FacilitatorOptions = {
  /** Sends settle transactions and pays their gas. Never holds the payment token. */
  account: LocalAccount;
  /** The AgentMandate contract to settle on. */
  mandateContract: Address;
  /** Default: Aevum testnet. */
  chain?: Chain;
  /** Default: the chain's public RPC. */
  rpcUrl?: string;
  /** How many recent attempts /activity keeps in memory. Default 500. */
  activityLimit?: number;
  /** Logger. Default: console.log. */
  log?: (line: string) => void;
};

/** One paid or refused attempt, as served by GET /activity. */
export type ActivityItem = {
  at: number;
  mandateId: string;
  payee: string;
  amount: string;
  resource?: string;
  outcome: "paid" | "refused";
  reason?: string;
  transaction?: string;
  paymentId?: string;
};

/** Refusal reason for a signed payment that has already been settled. */
export const ALREADY_SETTLED = "payment_already_settled";

type ContractReader = { readContract: (args: any) => Promise<unknown> };

/**
 * Has this exact signed payment already been settled? The contract's settle() is idempotent (a
 * second submission pays nothing and returns the same paymentId), which keeps facilitator retries
 * safe for the payer. But it would also report "paid" again, so a copied PAYMENT-SIGNATURE header
 * could fetch the paid resource a second time for free. The facilitator refuses such replays.
 */
export async function alreadySettled(client: ContractReader, mandateContract: Address, payment: Payment): Promise<boolean> {
  const paymentId = (await client.readContract({ address: mandateContract, abi: agentMandateAbi, functionName: "paymentDigest", args: [payment] })) as Hex;
  return (await client.readContract({ address: mandateContract, abi: agentMandateAbi, functionName: "isSettled", args: [paymentId] })) as boolean;
}

/**
 * An x402 facilitator for the "mandate" scheme, as an Express app:
 * GET /supported, POST /verify, POST /settle, GET /activity.
 */
export async function createFacilitator({
  account,
  mandateContract,
  chain = aevumTestnet,
  rpcUrl,
  activityLimit = 500,
  log = console.log,
}: FacilitatorOptions): Promise<{ app: Express; network: string; address: Address }> {
  const transport = http(rpcUrl ?? chain.rpcUrls.default.http[0]);
  const client = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account, chain, transport });
  const network = caip2(chain.id);
  const asset = await client.readContract({ address: mandateContract, abi: agentMandateAbi, functionName: "token" });
  const ctx: CheckContext = { network, asset, mandateContract };

  type Verified = { ok: false; response: VerifyResponse } | { ok: true; response: VerifyResponse; payment: Payment; signature: Hex };

  async function verify(body: FacilitatorRequest): Promise<Verified> {
    const checked = checkRequest(body, ctx);
    if (!checked.ok) return { ok: false, response: { isValid: false, invalidReason: checked.reason, invalidMessage: checked.message } };
    const payment = checked.payment;
    const payer = `mandate #${payment.mandateId}`;
    const signature = body.paymentPayload.payload.signature;
    if (await alreadySettled(client, mandateContract, payment)) {
      return { ok: false, response: { isValid: false, invalidReason: ALREADY_SETTLED, invalidMessage: "this payment was already used; sign a new one", payer } };
    }
    const [ok, reason] = await client.readContract({
      address: mandateContract,
      abi: agentMandateAbi,
      functionName: "verify",
      args: [payment, signature],
    });
    if (!ok) {
      const name = reasonName(reason);
      return { ok: false, response: { isValid: false, invalidReason: `mandate_${name}`, invalidMessage: name, payer } };
    }
    return { ok: true, response: { isValid: true, payer }, payment, signature };
  }

  // Refused payments never reach the chain, so this in-memory feed is where dashboards read them.
  const activity: ActivityItem[] = [];
  function record(body: FacilitatorRequest, entry: Pick<ActivityItem, "outcome" | "reason" | "transaction" | "paymentId">) {
    const p = body?.paymentPayload?.payload?.payment;
    if (!p?.mandateId) return;
    activity.unshift({
      at: Date.now(),
      mandateId: String(p.mandateId),
      payee: String(p.payee),
      amount: String(p.amount),
      resource: body.paymentPayload.resource?.url,
      ...entry,
    });
    activity.length = Math.min(activity.length, activityLimit);
  }

  // One transaction at a time, so concurrent settles never reuse a nonce.
  let queue: Promise<unknown> = Promise.resolve();
  const serially = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/supported", (_req, res) => {
    res.json({
      kinds: [{ x402Version: X402_VERSION, scheme: SCHEME, network, extra: { mandateContract } }],
      extensions: [],
      signers: { "eip155:*": [account.address] },
    });
  });

  app.get("/activity", (req, res) => {
    const mandateId = typeof req.query.mandateId === "string" ? req.query.mandateId : undefined;
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, activityLimit);
    res.json({ mandateContract, network, items: activity.filter((a) => !mandateId || a.mandateId === mandateId).slice(0, limit) });
  });

  app.post("/verify", async (req, res) => {
    try {
      const { response } = await verify(req.body);
      log(`verify  ${response.isValid ? "ok" : `refused: ${response.invalidReason}`}`);
      if (!response.isValid) record(req.body, { outcome: "refused", reason: response.invalidReason });
      res.json(response);
    } catch (err) {
      log(`verify error: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      res.json({ isValid: false, invalidReason: "unexpected_verify_error" } satisfies VerifyResponse);
    }
  });

  app.post("/settle", async (req, res) => {
    const fail = (errorReason: string, errorMessage?: string, payer?: string): SettleResponse => ({
      success: false,
      errorReason,
      errorMessage,
      payer,
      transaction: "",
      network,
    });
    try {
      const checked = await verify(req.body);
      if (!checked.ok) {
        const r = checked.response;
        log(`settle  refused: ${r.invalidReason}`);
        record(req.body, { outcome: "refused", reason: r.invalidReason });
        return res.json(fail(r.invalidReason ?? "invalid_payload", r.invalidMessage, r.payer));
      }
      const { payment, signature, response } = checked;
      const result = await serially(async () => {
        // Checked again inside the queue: two requests carrying the same payment can both pass
        // verify() before the first one settles. Only the first may be served.
        if (await alreadySettled(client, mandateContract, payment)) return { replay: true as const };
        const call = { address: mandateContract, abi: agentMandateAbi, functionName: "settle", args: [payment, signature] } as const;
        // Simulate first: a payment that would revert fails here, for free, and we learn its paymentId.
        const { result: paymentId } = await client.simulateContract({ ...call, account });
        const hash = await wallet.writeContract({ ...call, type: "legacy" });
        const receipt = await client.waitForTransactionReceipt({ hash });
        return { paymentId, hash, status: receipt.status };
      });
      if ("replay" in result) {
        log(`settle  refused: ${ALREADY_SETTLED}`);
        record(req.body, { outcome: "refused", reason: ALREADY_SETTLED });
        return res.json(fail(ALREADY_SETTLED, "this payment was already used; sign a new one", response.payer));
      }
      if (result.status !== "success") {
        return res.json({ ...fail("unexpected_settle_error", "transaction reverted"), transaction: result.hash });
      }
      log(`settle  paid ${payment.amount} to ${payment.payee}  ${result.hash}`);
      record(req.body, { outcome: "paid", transaction: result.hash, paymentId: result.paymentId });
      res.json({
        success: true,
        payer: response.payer,
        transaction: result.hash,
        network,
        amount: payment.amount.toString(),
        extensions: { mandate: { paymentId: result.paymentId } },
      } satisfies SettleResponse);
    } catch (err) {
      log(`settle error: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      res.json(fail("unexpected_settle_error", err instanceof Error ? err.message.split("\n")[0] : undefined));
    }
  });

  return { app, network, address: account.address };
}

/**
 * Start a facilitator from environment variables:
 * MANDATE_ADDRESS (required), FACILITATOR_KEY (required), RPC_URL, FACILITATOR_PORT (default 4021).
 */
export async function runFacilitator(env: Record<string, string | undefined> = process.env) {
  const mandate = env.MANDATE_ADDRESS?.trim();
  const rawKey = env.FACILITATOR_KEY?.trim();
  if (!mandate || !isAddress(mandate)) throw new Error("Set MANDATE_ADDRESS to the AgentMandate contract address.");
  const key = (rawKey && !rawKey.startsWith("0x") ? `0x${rawKey}` : rawKey) as Hex | undefined;
  if (!key || !isHex(key) || key.length !== 66) throw new Error("Set FACILITATOR_KEY to a 32-byte hex private key.");
  const rpcUrl = env.RPC_URL?.trim() || aevumTestnet.rpcUrls.default.http[0];
  const port = Number(env.FACILITATOR_PORT ?? 4021);

  // Aevum testnet, or any other EVM chain the RPC serves (for example a local fork).
  const id = await createPublicClient({ transport: http(rpcUrl) }).getChainId();
  const chain =
    id === aevumTestnet.id
      ? aevumTestnet
      : defineChain({ id, name: `Chain ${id}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } });

  const { app, network, address } = await createFacilitator({ account: privateKeyToAccount(key), mandateContract: mandate, chain, rpcUrl });
  app.listen(port, () => {
    console.log(`Facilitator on http://localhost:${port}  ·  ${network}  ·  AgentMandate ${mandate}`);
    console.log(`Gas wallet ${address}`);
  });
}
