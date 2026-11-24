import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Quickstart for agents" };

export default function Agents() {
  return (
    <>
      <h1>Quickstart for agents</h1>
      <p className="lead">Make an AI agent pay for API requests from a mandate. The agent signs payments; it never holds funds.</p>

      <h2>Prerequisites</h2>
      <ul>
        <li>Node.js 20 or later.</li>
        <li>A private key for the agent. It doesn&apos;t need any tokens.</li>
        <li>
          A mandate whose agent is that key&apos;s address, with the seller you&apos;ll call on its allowlist. See{" "}
          <Link href="/docs/owners">Quickstart for owners</Link>.
        </li>
        <li>
          The AgentMandate contract address. See <Link href="/docs/reference/networks">Networks</Link>.
        </li>
      </ul>

      <h2>1. Install the SDK</h2>
      <Code title="terminal">{`npm install @standeva/agentmeter viem`}</Code>

      <h2>2. Create a paying fetch</h2>
      <p>
        <code>createPayingFetch</code> returns a function with the same arguments as <code>fetch</code>. When a server answers{" "}
        <code>402</code>, it signs a payment from your mandate and repeats the request.
      </p>
      <Code title="agent.ts">{`
import { createPayingFetch } from "@standeva/agentmeter";
import { privateKeyToAccount } from "viem/accounts";

const payingFetch = createPayingFetch({
  agent: privateKeyToAccount(process.env.AGENT_KEY as \`0x\${string}\`),
  chainId: 44005,                       // Aevum testnet
  mandate: "0xAgentMandateAddress",     // the AgentMandate contract
  mandateId: 1n,                        // your mandate
});
`}</Code>

      <h2>3. Make a paid request</h2>
      <Code title="agent.ts">{`
const res = await payingFetch("https://api.example.com/v1/price?pair=BTC-USD");

if (res.refused) {
  console.log("Not paid:", res.refused);
} else {
  console.log(res.body);
  console.log("Paid", res.paid?.amount, "in", res.paid?.transaction);
}
`}</Code>
      <p>
        A successful paid request returns the response with <code>paid</code> set: the amount in token base units, the seller and the
        transaction hash. Requests that don&apos;t require payment pass through unchanged.
      </p>

      <h2>4. Test a refusal</h2>
      <p>
        Call a paid endpoint whose seller isn&apos;t on your mandate&apos;s allowlist. The contract refuses the payment, no money moves, and{" "}
        <code>res.refused</code> is <code>mandate_PayeeNotAllowed</code>.
      </p>
      <Callout>
        <p>
          The SDK doesn&apos;t check your limits or allowlist before signing; the contract does. A refused payment costs nothing and is
          reported in <code>refused</code> instead of throwing.
        </p>
      </Callout>

      <h2>Next steps</h2>
      <ul>
        <li>
          <Link href="/docs/guides/refusals">Handle refused payments</Link> in your agent&apos;s logic.
        </li>
        <li>
          <Link href="/docs/reference/client">SDK client reference</Link> for every option and field.
        </li>
        <li>
          <Link href="/docs/guides/keys">Rotate or revoke an agent key</Link>.
        </li>
      </ul>
    </>
  );
}
