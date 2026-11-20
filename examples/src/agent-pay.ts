/**
 * One paid request through an AgentMandate, end to end:
 *   1. AGENT signs an EIP-712 Payment (off-chain, free; the agent holds no tUSD8 and no tQDAY).
 *   2. FACILITATOR checks it with verify() (the x402 "verify" step), then submits settle() and pays gas.
 *
 *   MANDATE_ADDRESS=0x... MANDATE_ID=1 PAYEE=0x... pnpm example agent-pay
 *   AMOUNT=0.01 RESOURCE="GET /v1/price" pnpm example agent-pay
 *   PAYEE=0x<not allowlisted> pnpm example agent-pay   # watch the mandate refuse it
 */
import { createWalletClient, formatUnits, http, keccak256, parseUnits, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { aevumTestnet, erc20Abi, txUrl } from "@aevum-kit/aevum";
import { connect, requiredAddress, requiredKey } from "./env";
import { agentMandateAbi, paymentTypedData, reasonName, type Payment } from "./mandate";

const { client, chain, rpcUrl } = await connect();
const mandate = requiredAddress("MANDATE_ADDRESS");
const payee = requiredAddress("PAYEE");
const mandateId = BigInt(process.env.MANDATE_ID ?? "1");
const agent = privateKeyToAccount(requiredKey("AGENT_KEY"));
const facilitator = createWalletClient({
  account: privateKeyToAccount(requiredKey("FACILITATOR_KEY")),
  chain,
  transport: http(rpcUrl),
});

const token = await client.readContract({ address: mandate, abi: agentMandateAbi, functionName: "token" });
const decimals = await client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
const resource = process.env.RESOURCE ?? "GET /v1/price?pair=BTC-USD";
const request = `${resource} @ ${new Date().toISOString()}`;

const payment: Payment = {
  mandateId,
  payee,
  amount: parseUnits(process.env.AMOUNT ?? "0.01", decimals),
  resourceHash: keccak256(toHex(resource)),
  requestHash: keccak256(toHex(request)),
  nonce: keccak256(toHex(`${agent.address}-${Date.now()}-${Math.random()}`)),
  deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
};

// 1. The agent signs. This is all the agent ever does.
const signature = await agent.signTypedData(paymentTypedData(chain.id, mandate, payment));
console.log(`Agent ${agent.address} signed ${formatUnits(payment.amount, decimals)} tUSD8 to ${payee}`);

// 2. The facilitator verifies first: a refused payment never costs gas.
const [ok, reason] = await client.readContract({
  address: mandate,
  abi: agentMandateAbi,
  functionName: "verify",
  args: [payment, signature],
});
if (!ok) {
  console.log(`Refused by the mandate: ${await reasonName(reason)}`);
  process.exit(1);
}

const call = {
  account: facilitator.account,
  address: mandate,
  abi: agentMandateAbi,
  functionName: "settle",
  args: [payment, signature],
} as const;
const { result: paymentId } = await client.simulateContract(call);
const hash = await facilitator.writeContract({ ...call, type: "legacy" });
const receipt = await client.waitForTransactionReceipt({ hash });

const [, periodLeft, totalLeft, balance] = await client.readContract({
  address: mandate,
  abi: agentMandateAbi,
  functionName: "remaining",
  args: [mandateId],
});
console.log(`Settled: ${receipt.status} in block ${receipt.blockNumber}, paymentId ${paymentId}`);
console.log(chain.id === aevumTestnet.id ? txUrl(hash) : `tx ${hash}`);
console.log(
  `Left today ${formatUnits(periodLeft, decimals)} · left in total ${formatUnits(totalLeft, decimals)} · in escrow ${formatUnits(balance, decimals)}`,
);
