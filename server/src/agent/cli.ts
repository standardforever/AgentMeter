/**
 * Run the AI agent from the terminal.
 *
 *   pnpm --filter server agent -- --question "How are BTC and ETH doing?"
 *   pnpm --filter server agent -- --question "..." --gullible     # obeys instructions hidden in API results
 *   pnpm --filter server agent -- --url http://localhost:4030/v1/premium   # one paid call to any URL
 *
 * env: AGENT_KEY (signs only; holds nothing), MANDATE_ADDRESS, MANDATE_ID, SELLER_URL, RPC_URL,
 *      ANTHROPIC_API_KEY (optional: Claude decides which APIs to call), AGENT_MODEL (optional)
 */
import { parseArgs } from "node:util";
import { formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { aevumTestnet, agentMandateAbi, txUrl } from "@aevum-kit/aevum";
import { connect, requiredAddress, requiredKey } from "../env";
import { claudeBrain, ruleBrain, type Tools } from "./brain";
import { createPayingFetch, type PaidCall } from "./payingFetch";

const { values } = parseArgs({
  options: {
    question: { type: "string" },
    url: { type: "string" },
    gullible: { type: "boolean", default: process.env.GULLIBLE === "1" },
    "no-llm": { type: "boolean", default: false },
  },
});

const { client, chain } = await connect();
const mandate = requiredAddress("MANDATE_ADDRESS");
const mandateId = BigInt(process.env.MANDATE_ID ?? "1");
const agent = privateKeyToAccount(requiredKey("AGENT_KEY"));
const sellerUrl = (process.env.SELLER_URL ?? "http://localhost:4020").replace(/\/$/, "");
const link = (hash: string) => (chain.id === aevumTestnet.id ? txUrl(hash as `0x${string}`) : hash);

const log = (line: string) => console.log(`  ${line}`);
const payingFetch = createPayingFetch({ agent, chainId: chain.id, mandate, mandateId, log });

let spent = 0n;
async function call(url: string, init?: RequestInit): Promise<PaidCall> {
  const result = await payingFetch(url, init);
  if (result.paid) {
    spent += BigInt(result.paid.amount);
    log(`paid ${formatUnits(BigInt(result.paid.amount), 6)} tUSD8 · tx ${link(result.paid.transaction)}`);
  } else if (result.refused) {
    log(`refused: ${result.refused}`);
  }
  return result;
}

const tools: Tools = {
  getPrice: (pair) => call(`${sellerUrl}/v1/price?pair=${encodeURIComponent(pair)}`),
  getNews: (topic) => call(`${sellerUrl}/v1/news?topic=${encodeURIComponent(topic)}`),
  summarize: (text) =>
    call(`${sellerUrl}/v1/summarize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }),
  fetchUrl: (url) => call(url),
};

console.log(`Agent ${agent.address} · mandate #${mandateId} on ${mandate}`);

if (values.url) {
  const result = await tools.fetchUrl(values.url);
  if (!result.refused) console.log(`\nResponse: ${result.rawBody}`);
} else {
  const question = values.question ?? "How are bitcoin and ethereum doing today?";
  const useClaude = Boolean(process.env.ANTHROPIC_API_KEY) && !values["no-llm"];
  console.log(`Question: ${question}`);
  console.log(`Brain: ${useClaude ? `Claude (${process.env.AGENT_MODEL ?? "claude-haiku-5-5"})` : "rule-based"}${values.gullible ? " · GULLIBLE" : ""}\n`);
  const brain = useClaude ? claudeBrain : ruleBrain;
  const answer = await brain(question, { tools, log, gullible: Boolean(values.gullible) });
  console.log(`\nAnswer: ${answer}`);
}

const [, periodLeft, totalLeft, balance] = await client.readContract({
  address: mandate,
  abi: agentMandateAbi,
  functionName: "remaining",
  args: [mandateId],
});
const f = (v: bigint) => formatUnits(v, 6);
console.log(`\nSpent this run ${f(spent)} tUSD8 · left today ${f(periodLeft)} · left in total ${f(totalLeft)} · in escrow ${f(balance)}`);
