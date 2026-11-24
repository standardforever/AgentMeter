import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Facilitator HTTP API" };

export default function Facilitator() {
  return (
    <>
      <h1>Facilitator HTTP API</h1>
      <p className="lead">
        The facilitator checks payments and submits them to AgentMandate, paying the gas. It never holds tUSD8: money moves from the
        mandate straight to the seller.
      </p>

      <p>
        To run one, see <Link href="/docs/guides/facilitator">Run a facilitator</Link>. All request and response bodies are JSON. Errors are
        returned with HTTP 200 and a reason field, as in x402.
      </p>

      <h2>GET /supported</h2>
      <Code title="response">{`
{
  "kinds": [{ "x402Version": 2, "scheme": "mandate", "network": "eip155:44005", "extra": { "mandateContract": "0x…" } }],
  "extensions": [],
  "signers": { "eip155:*": ["0xFacilitatorAddress"] }
}
`}</Code>

      <h2>POST /verify</h2>
      <p>Checks a payment without sending anything. Costs no gas.</p>
      <Code title="request">{`
{
  "x402Version": 2,
  "paymentPayload": { …PaymentPayload… },
  "paymentRequirements": { …the server's offer… }
}
`}</Code>
      <Code title="response">{`
{ "isValid": true, "payer": "mandate #1" }

{ "isValid": false, "invalidReason": "mandate_PayeeNotAllowed", "invalidMessage": "PayeeNotAllowed", "payer": "mandate #1" }
`}</Code>
      <p>Checks, in order:</p>
      <ol>
        <li><code>x402Version</code> is 2, the scheme is <code>mandate</code>, the network and token are the ones it settles.</li>
        <li><code>extra.mandateContract</code> is its AgentMandate.</li>
        <li>The <code>accepted</code> offer equals the requirements: amount, payTo, asset and resourceHash.</li>
        <li>The signed payment pays <code>payTo</code>, exactly <code>amount</code>, for <code>resourceHash</code>.</li>
        <li>The contract&apos;s <code>verify(payment, signature)</code> passes. Its errors are reported as <code>mandate_&lt;Error&gt;</code>.</li>
      </ol>

      <h2>POST /settle</h2>
      <p>Same request body as <code>/verify</code>. Repeats the checks, simulates <code>settle()</code>, sends it and waits for the receipt.</p>
      <Code title="response">{`
{
  "success": true,
  "payer": "mandate #1",
  "transaction": "0x…",
  "network": "eip155:44005",
  "amount": "10000",
  "extensions": { "mandate": { "paymentId": "0x…" } }
}

{ "success": false, "errorReason": "mandate_ExceedsPeriodBudget", "transaction": "", "network": "eip155:44005" }
`}</Code>

      <h2>GET /activity</h2>
      <p>
        Recent paid and refused attempts, newest first. Refused payments never reach the chain, so this is where dashboards read them. Kept
        in memory (up to 500); it resets when the facilitator restarts. Allows cross-origin requests.
      </p>
      <table className="docs-table">
        <thead>
          <tr><th>Query</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>mandateId</code></td><td>Only this mandate&apos;s attempts</td></tr>
          <tr><td><code>limit</code></td><td>Default 100, at most 500</td></tr>
        </tbody>
      </table>
      <Code title="response">{`
{
  "mandateContract": "0x…",
  "network": "eip155:44005",
  "items": [
    {
      "at": 1795300000000,
      "mandateId": "1",
      "payee": "0x…",
      "amount": "50000",
      "resource": "/v1/premium?topic=solana",
      "outcome": "refused",
      "reason": "mandate_PayeeNotAllowed"
    }
  ]
}
`}</Code>
      <p>Paid items also have <code>transaction</code> and <code>paymentId</code>.</p>
    </>
  );
}
