import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Quickstart for owners" };

export default function Owners() {
  return (
    <>
      <h1>Quickstart for owners</h1>
      <p className="lead">Create a mandate: a budget an agent can spend only with the sellers you allow, within the limits you set.</p>

      <h2>Prerequisites</h2>
      <ul>
        <li>
          A wallet on Aevum testnet with tUSD8 to deposit and a little tQDAY for gas. Get both from the{" "}
          <a href="https://faucet.qday.info">QDay faucet</a>.
        </li>
        <li>The agent&apos;s address: the address of the key your agent signs with.</li>
        <li>The address of each seller the agent may pay.</li>
      </ul>

      <h2>Create a mandate in the dashboard</h2>
      <ol>
        <li>
          Open <Link href="/app/new">New mandate</Link> and connect your wallet.
        </li>
        <li>Enter a name, the agent&apos;s address, the limits (per call, per day, in total), how many days it&apos;s valid, and a deposit.</li>
        <li>Add the sellers the agent may pay.</li>
        <li>
          Click <strong>Approve and create mandate</strong> and confirm the two transactions in your wallet: one lets the contract take the
          deposit, the other creates the mandate.
        </li>
      </ol>
      <p>Give your agent the mandate&apos;s id and the AgentMandate address. Its page shows both, with every payment and refusal as it happens.</p>

      <h2>Create a mandate in code</h2>
      <Code title="create-mandate.ts">{`
import { createWalletClient, erc20Abi, http, parseUnits, parseEventLogs, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { aevumTestnet, agentMandateAbi, TUSD8_ADDRESS } from "@standeva/agentmeter";

const MANDATE = "0xAgentMandateAddress";
const owner = createWalletClient({
  account: privateKeyToAccount(process.env.OWNER_KEY as \`0x\${string}\`),
  chain: aevumTestnet,
  transport: http(),
});
const client = createPublicClient({ chain: aevumTestnet, transport: http() });
const deposit = parseUnits("5", 6);

// 1. Let the contract take the deposit.
await owner.writeContract({
  address: TUSD8_ADDRESS, abi: erc20Abi, functionName: "approve", args: [MANDATE, deposit], type: "legacy",
});

// 2. Create, name and fund the mandate.
const hash = await owner.writeContract({
  address: MANDATE,
  abi: agentMandateAbi,
  functionName: "createNamedMandate",
  args: [
    "Research agent",
    "0xAgentAddress",
    "0x0000000000000000000000000000000000000000",  // standard Ethereum signatures
    "0x",
    {
      maxSinglePayment: parseUnits("0.05", 6),   // per call
      maxPeriodSpend: parseUnits("1", 6),         // per period
      maxTotalSpend: parseUnits("3", 6),          // in total
      period: 86400,                              // one day
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 30 * 86400),
    },
    ["0xSellerAddress"],
    deposit,
  ],
  type: "legacy",
});

const receipt = await client.waitForTransactionReceipt({ hash });
const [created] = parseEventLogs({ abi: agentMandateAbi, logs: receipt.logs, eventName: "MandateCreated" });
console.log("Mandate id:", created.args.mandateId);
`}</Code>
      <Callout>
        <p>Aevum testnet accepts legacy (type 0) transactions. Pass <code>type: &quot;legacy&quot;</code> to viem.</p>
      </Callout>

      <h2>Control it</h2>
      <ul>
        <li><strong>Top up or withdraw:</strong> <code>deposit</code> and <code>withdraw</code>. You can withdraw unspent funds at any time.</li>
        <li><strong>Change the rules:</strong> <code>setLimits</code> and <code>setPayee</code>. Changes apply to the next payment.</li>
        <li><strong>Stop the agent:</strong> <code>revoke</code>, which is permanent.</li>
      </ul>
      <p>Each is a button on the mandate&apos;s page in the dashboard.</p>

      <h2>Next steps</h2>
      <ul>
        <li><Link href="/docs/concepts">How AgentMeter works</Link>: the rules every payment must pass.</li>
        <li><Link href="/docs/guides/keys">Rotate or revoke an agent key</Link>.</li>
        <li><Link href="/docs/contract">AgentMandate contract reference</Link>.</li>
      </ul>
    </>
  );
}
