import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Handle refused payments" };

export default function Refusals() {
  return (
    <>
      <h1>Handle refused payments</h1>
      <p className="lead">
        When a payment breaks a mandate&apos;s rules, no money moves and the paying fetch returns the reason. Use it to decide what your agent
        does next.
      </p>

      <h2>Detect a refusal</h2>
      <p>
        <code>payingFetch</code> never throws for a refused payment. It resolves with <code>refused</code> set to a reason string and{" "}
        <code>status</code> set to <code>402</code>.
      </p>
      <Code title="agent.ts">{`
const res = await payingFetch(url);

if (res.refused) {
  // e.g. "mandate_ExceedsPeriodBudget"
  return handleRefusal(res.refused);
}
`}</Code>

      <h2>Decide what to do</h2>
      <table className="docs-table">
        <thead>
          <tr><th>Reason</th><th>Cause</th><th>Recommended action</th></tr>
        </thead>
        <tbody>
          <tr><td><code>mandate_PayeeNotAllowed</code></td><td>The seller isn&apos;t on the allowlist</td><td>Don&apos;t retry. Use an allowed seller, or ask the owner to allow this one.</td></tr>
          <tr><td><code>mandate_ExceedsSinglePayment</code></td><td>The price is above the per-call cap</td><td>Don&apos;t retry. Use a cheaper endpoint.</td></tr>
          <tr><td><code>mandate_ExceedsPeriodBudget</code></td><td>The current period&apos;s budget is used up</td><td>Retry after the period resets.</td></tr>
          <tr><td><code>mandate_ExceedsTotalBudget</code></td><td>The lifetime budget is used up</td><td>Stop paying; the owner must raise the limit.</td></tr>
          <tr><td><code>mandate_InsufficientBalance</code></td><td>The mandate needs a top-up</td><td>Notify the owner.</td></tr>
          <tr><td><code>mandate_MandateIsRevoked</code>, <code>mandate_MandateExpired</code></td><td>The mandate is no longer usable</td><td>Stop paying.</td></tr>
          <tr><td><code>mandate_InvalidAgentSignature</code></td><td>The agent&apos;s key was replaced</td><td>Load the new key.</td></tr>
          <tr><td><code>seller wants a different mandate contract</code>, <code>price is for a different resource</code></td><td>The seller&apos;s offer doesn&apos;t match</td><td>Treat the seller as untrusted.</td></tr>
          <tr><td><code>unexpected_settle_error</code></td><td>The facilitator couldn&apos;t submit the payment</td><td>Retry later. A retried payment is never paid twice.</td></tr>
        </tbody>
      </table>

      <h2>Tell the model</h2>
      <p>
        If the agent is an LLM using tools, return refusals as tool results rather than errors, so the model can explain the situation or
        choose another tool.
      </p>
      <Code title="tools.ts">{`
async function getPrice(pair: string): Promise<string> {
  const res = await payingFetch(\`https://api.example.com/v1/price?pair=\${pair}\`);
  if (res.refused) return \`Payment refused (\${res.refused}). Don't call this tool again for now.\`;
  return JSON.stringify(res.body);
}
`}</Code>

      <h2>See refusals as the owner</h2>
      <p>
        Refused payments never reach the chain. The facilitator records them, and the dashboard shows each one on the mandate&apos;s page with
        its reason. To read them yourself, use <Link href="/docs/facilitator">GET /activity</Link>.
      </p>
      <p>
        All reasons are listed in <Link href="/docs/errors">Errors</Link>.
      </p>
    </>
  );
}
