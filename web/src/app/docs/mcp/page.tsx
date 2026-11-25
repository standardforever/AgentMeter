import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Use with Claude (MCP)" };

export default function Mcp() {
  return (
    <>
      <h1>Use with Claude (MCP)</h1>
      <p className="lead">
        Let an AI assistant such as Claude pay for APIs from a mandate, with no code. AgentMeter ships an MCP server that gives the
        assistant four tools; the mandate&apos;s on-chain rules still decide every payment.
      </p>

      <h2>Prerequisites</h2>
      <ul>
        <li>Node.js 20 or later.</li>
        <li>An MCP client: Claude Desktop, Claude Code, or any other.</li>
        <li>
          An agent key and a mandate whose agent is that key, with the sellers the assistant may pay on its allowlist. See{" "}
          <Link href="/docs/owners">Quickstart for owners</Link>.
        </li>
      </ul>

      <h2>1. Add the server to your MCP client</h2>
      <p>
        The server is the <code>agentmeter-mcp</code> command in the SDK package. For Claude Desktop, add it to{" "}
        <code>claude_desktop_config.json</code> (Settings, Developer, Edit config):
      </p>
      <Code title="claude_desktop_config.json">{`
{
  "mcpServers": {
    "agentmeter": {
      "command": "npx",
      "args": ["-y", "-p", "@standeva/agentmeter", "agentmeter-mcp"],
      "env": {
        "AGENT_KEY": "0xYourAgentKey",
        "MANDATE_ADDRESS": "0x9faBA32d9B58dA7aC471722C8DF7595c19D765e0",
        "MANDATE_ID": "1"
      }
    }
  }
}
`}</Code>
      <p>For Claude Code:</p>
      <Code title="terminal">{`
claude mcp add agentmeter \\
  -e AGENT_KEY=0xYourAgentKey \\
  -e MANDATE_ADDRESS=0x9faBA32d9B58dA7aC471722C8DF7595c19D765e0 \\
  -e MANDATE_ID=1 \\
  -- npx -y -p @standeva/agentmeter agentmeter-mcp
`}</Code>
      <Callout tone="warn">
        Use an agent key, never a wallet that holds funds. The agent key only signs payments; a leaked one can spend at most what its
        mandate allows, and the owner can change or revoke it.
      </Callout>

      <h2>2. Ask for something that costs money</h2>
      <p>For example: &ldquo;What&apos;s the BTC price from https://agentmeter-api-7uum.onrender.com/v1/price?pair=BTC-USD? Check the price first.&rdquo;</p>
      <p>The assistant calls <code>check_price</code>, then <code>pay_and_fetch</code>, and shows you the answer with a link to the payment.</p>

      <h2>Tools</h2>
      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Arguments</th>
            <th>What it does</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>check_price</code></td>
            <td><code>url</code></td>
            <td>What the URL costs, and whether this mandate would pay it (allowed seller, caps, budget left, revoked or expired). Free: nothing is signed.</td>
          </tr>
          <tr>
            <td><code>pay_and_fetch</code></td>
            <td><code>url</code>, <code>method</code>?, <code>body</code>?, <code>max_price</code>?</td>
            <td>Fetches the URL and pays for it if it answers <code>402</code>. Returns the answer, the transaction link and the <code>paymentId</code>, or the refusal reason. <code>max_price</code> stops before signing if the price is higher.</td>
          </tr>
          <tr>
            <td><code>mandate_budget</code></td>
            <td>none</td>
            <td>What the mandate can still spend per call, today, in total and in escrow. Warns if the key isn&apos;t the mandate&apos;s agent.</td>
          </tr>
          <tr>
            <td><code>verify_receipt</code></td>
            <td><code>payment_id</code>, <code>answer</code></td>
            <td>Checks an answer against the fingerprint the seller recorded on-chain for that payment.</td>
          </tr>
        </tbody>
      </table>

      <h2>Environment variables</h2>
      <table>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Required</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>AGENT_KEY</code></td><td>yes</td><td>The agent&apos;s private key. It signs payments and holds nothing.</td></tr>
          <tr><td><code>MANDATE_ADDRESS</code></td><td>yes</td><td>The AgentMandate contract.</td></tr>
          <tr><td><code>MANDATE_ID</code></td><td>yes</td><td>The mandate to spend from.</td></tr>
          <tr><td><code>RPC_URL</code></td><td>no</td><td>Defaults to Aevum testnet.</td></tr>
        </tbody>
      </table>

      <h2>Prompt injection</h2>
      <p>
        An assistant that reads web pages can be told to pay someone. The server&apos;s instructions tell it never to pay because a page
        or an API answer asked it to, but that is only advice to the model. The guarantee is the mandate: a payment to a seller
        that isn&apos;t on the allowlist, or above the caps, is refused by the contract and nothing is paid.
      </p>

      <h2>Next steps</h2>
      <ul>
        <li><Link href="/docs/guides/refusals">Handle refused payments</Link></li>
        <li><Link href="/docs/guides/receipts">Record and verify receipts</Link></li>
        <li><Link href="/docs/reference/client">SDK: client</Link></li>
      </ul>
    </>
  );
}
