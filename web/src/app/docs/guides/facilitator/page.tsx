import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Run a facilitator" };

export default function RunFacilitator() {
  return (
    <>
      <h1>Run a facilitator</h1>
      <p className="lead">
        The facilitator checks signed payments and submits them to AgentMandate, paying the gas. Run it as a standalone service or inside
        your own app.
      </p>

      <h2>Prerequisites</h2>
      <ul>
        <li>Node.js 20 or later.</li>
        <li>A dedicated wallet with tQDAY for gas. It never needs tUSD8.</li>
        <li>The AgentMandate contract address.</li>
      </ul>

      <h2>Run it as a service</h2>
      <Code title="terminal">{`
MANDATE_ADDRESS=0xAgentMandateAddress \\
FACILITATOR_KEY=0xYourGasWalletKey \\
npx -p @standeva/agentmeter agentmeter-facilitator
`}</Code>
      <table className="docs-table">
        <thead>
          <tr><th>Variable</th><th>Required</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>MANDATE_ADDRESS</code></td><td>Yes</td><td>The AgentMandate contract to settle on</td></tr>
          <tr><td><code>FACILITATOR_KEY</code></td><td>Yes</td><td>Private key of the gas wallet</td></tr>
          <tr><td><code>RPC_URL</code></td><td>No</td><td>Default <code>https://rpc-test.qday.info</code></td></tr>
          <tr><td><code>FACILITATOR_PORT</code></td><td>No</td><td>Default <code>4021</code></td></tr>
        </tbody>
      </table>
      <p>
        Check it&apos;s running with <code>curl http://localhost:4021/supported</code>.
      </p>

      <h2>Run it inside your app</h2>
      <p><code>createFacilitator</code> returns an Express app you can mount or listen on.</p>
      <Code title="facilitator.ts">{`
import { privateKeyToAccount } from "viem/accounts";
import { createFacilitator } from "@standeva/agentmeter/server";

const { app } = await createFacilitator({
  account: privateKeyToAccount(process.env.FACILITATOR_KEY as \`0x\${string}\`),
  mandateContract: "0xAgentMandateAddress",
});

app.listen(4021);
`}</Code>

      <h2>Operate it</h2>
      <ul>
        <li>
          <strong>Gas:</strong> each settlement costs about 250,000 gas. Monitor the wallet&apos;s tQDAY balance; when it runs out, settlements
          fail with <code>unexpected_settle_error</code> and no money moves.
        </li>
        <li>
          <strong>Ordering:</strong> settlements are sent one at a time, so concurrent requests never reuse a transaction nonce.
        </li>
        <li>
          <strong>Activity feed:</strong> <code>GET /activity</code> keeps the latest 500 paid and refused attempts in memory, and allows
          cross-origin reads so a dashboard can show refusals. It resets on restart.
        </li>
      </ul>
      <Callout tone="warn">
        <p>Use a dedicated wallet for the facilitator and keep its key out of source control.</p>
      </Callout>

      <p>
        Endpoints are documented in the <Link href="/docs/facilitator">Facilitator HTTP API</Link>.
      </p>
    </>
  );
}
