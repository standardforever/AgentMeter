import type { Metadata } from "next";
import { Callout } from "@/components/docs/Code";

export const metadata: Metadata = { title: "How AgentMeter works" };

const rules: [string, string, string][] = [
  ["1", "The mandate exists", "UnknownMandate"],
  ["2", "The mandate isn't revoked", "MandateIsRevoked"],
  ["3", "The mandate hasn't expired", "MandateExpired"],
  ["4", "The payment's deadline hasn't passed", "PaymentExpired"],
  ["5", "The amount is above zero", "ZeroAmount"],
  ["6", "The seller is on the mandate's allowlist", "PayeeNotAllowed"],
  ["7", "The amount is within the per-call cap", "ExceedsSinglePayment"],
  ["8", "Within the current period's budget", "ExceedsPeriodBudget"],
  ["9", "Within the lifetime budget", "ExceedsTotalBudget"],
  ["10", "The mandate holds enough tUSD8", "InsufficientBalance"],
  ["11", "The nonce hasn't been used", "NonceAlreadyUsed"],
  ["12", "Signed by the mandate's agent", "InvalidAgentSignature"],
];

export default function Concepts() {
  return (
    <>
      <h1>How AgentMeter works</h1>
      <p className="lead">Mandates, the rules every payment must pass, payments, receipts, and who can do what.</p>

      <h2>Mandate</h2>
      <p>
        A mandate is a budget for one agent, held in escrow by the <code>AgentMandate</code> contract. Each has a numeric id, starting at 1.
        It records:
      </p>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>owner</td><td>The address that created it. Only the owner can change or withdraw from it.</td></tr>
          <tr><td>agent</td><td>The address whose signatures may spend from it.</td></tr>
          <tr><td>verifier</td><td>Optional contract that checks a non-ECDSA signature (for example ML-DSA-65). <code>address(0)</code> means a normal Ethereum key.</td></tr>
          <tr><td>limits</td><td>Per-call, per-period and lifetime caps, the period length and the expiry. See below.</td></tr>
          <tr><td>allowlist</td><td>The sellers this mandate may pay.</td></tr>
          <tr><td>balance</td><td>tUSD8 held for this mandate and not yet paid out.</td></tr>
          <tr><td>periodSpent, totalSpent</td><td>What has been paid in the current period and overall.</td></tr>
          <tr><td>revoked</td><td>Set by the owner. Permanent.</td></tr>
          <tr><td>name</td><td>Optional label, stored as a public <code>MandateNamed</code> event.</td></tr>
        </tbody>
      </table>

      <h3>Limits</h3>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Limit</th>
            <th>Type</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>maxSinglePayment</td><td>uint128</td><td>The most one payment may be</td></tr>
          <tr><td>maxPeriodSpend</td><td>uint128</td><td>The most that may be paid in one period</td></tr>
          <tr><td>maxTotalSpend</td><td>uint128</td><td>The most that may ever be paid</td></tr>
          <tr><td>period</td><td>uint32</td><td>Period length in seconds; <code>86400</code> is one day</td></tr>
          <tr><td>expiresAt</td><td>uint64</td><td>Unix time after which no payment is accepted</td></tr>
        </tbody>
      </table>
      <p>
        Limits must satisfy <code>0 &lt; maxSinglePayment ≤ maxPeriodSpend ≤ maxTotalSpend</code>, <code>period &gt; 0</code> and{" "}
        <code>expiresAt</code> in the future, otherwise the call reverts with <code>InvalidLimits</code>.
      </p>
      <p>
        <strong>Periods</strong> start at the mandate&apos;s creation time and stay aligned to it. A mandate created at 10:00 with a one-day
        period has periods from 10:00 to 10:00. When a payment arrives after a period ends, the contract starts the period that contains the
        current time and resets <code>periodSpent</code>.
      </p>

      <h3>Amounts</h3>
      <p>
        tUSD8 has 6 decimals. All amounts on-chain and in the protocol are integers in base units: <code>10000</code> is 0.01 tUSD8 and{" "}
        <code>1000000</code> is 1.00 tUSD8.
      </p>

      <h2>The rules</h2>
      <p>
        <code>settle()</code> checks these in order and reverts with the first that fails. <code>verify()</code> runs the same checks without
        changing state and returns the error&apos;s selector instead of reverting.
      </p>
      <table className="docs-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Check</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {rules.map(([n, check, err]) => (
            <tr key={n}>
              <td>{n}</td>
              <td>{check}</td>
              <td><code>{err}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Because checking stops at the first failure, a payment that breaks several rules reports the earliest one. For example, 5.00 to an
        allowed seller with a 0.05 per-call cap reports <code>ExceedsSinglePayment</code> even if it also exceeds the daily budget.
      </p>

      <h2>Payment</h2>
      <p>
        A payment is an EIP-712 message the agent signs for one request. Signing is free and happens off-chain. The contract identifies a
        payment by its EIP-712 digest, called the <code>paymentId</code>.
      </p>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>mandateId</td><td>uint256</td><td>The mandate to spend from</td></tr>
          <tr><td>payee</td><td>address</td><td>The seller to pay</td></tr>
          <tr><td>amount</td><td>uint256</td><td>tUSD8 base units</td></tr>
          <tr><td>resourceHash</td><td>bytes32</td><td><code>keccak256</code> of the path and query that was priced</td></tr>
          <tr><td>requestHash</td><td>bytes32</td><td>A fingerprint of this exact request, chosen by the agent</td></tr>
          <tr><td>nonce</td><td>bytes32</td><td>Random; each nonce can be used once per mandate</td></tr>
          <tr><td>deadline</td><td>uint64</td><td>Unix time after which the payment is invalid</td></tr>
        </tbody>
      </table>
      <p>
        Settling is idempotent: submitting an already-settled payment returns its <code>paymentId</code> without paying again.
      </p>

      <h2>Receipt</h2>
      <p>
        Every settled payment stores a receipt: mandate, seller, amount, time, <code>resourceHash</code>, <code>requestHash</code>, and a{" "}
        <code>responseHash</code>. The seller sets <code>responseHash</code> once with <code>attest()</code>, as <code>keccak256</code> of the
        exact response body. Anyone holding the response can hash it and compare, which proves it&apos;s the answer that was paid for. It
        doesn&apos;t prove the answer is correct.
      </p>

      <h2>Facilitator</h2>
      <p>
        A facilitator is the service a seller uses to check and submit payments, as in standard x402. In AgentMeter it calls{" "}
        <code>verify</code> and <code>settle</code> on the AgentMandate contract and pays the gas. It never holds tokens: the contract moves
        tUSD8 from the mandate directly to the seller. Because the contract enforces the rules, a facilitator can delay or refuse to submit a
        payment, but can&apos;t change one or pay anyone else.
      </p>

      <h2>Roles and permissions</h2>
      <table className="docs-table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Can</th>
            <th>Needs</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Owner</td><td>Create, name, deposit, withdraw, set limits, set sellers, set agent, revoke</td><td>tUSD8 to deposit, tQDAY for gas</td></tr>
          <tr><td>Agent</td><td>Sign payments</td><td>Only a key: no tokens, no gas</td></tr>
          <tr><td>Facilitator</td><td>Submit signed payments (<code>settle</code>)</td><td>tQDAY for gas</td></tr>
          <tr><td>Seller</td><td>Receive payments, <code>attest</code> its responses</td><td>tQDAY for gas to attest</td></tr>
          <tr><td>Anyone</td><td><code>deposit</code> into any mandate, read everything</td><td>&nbsp;</td></tr>
        </tbody>
      </table>
      <Callout>
        <p>
          <code>settle</code> is callable by anyone, not only the facilitator. That&apos;s safe: it only executes what the agent signed, to
          sellers the owner allowed, within the limits.
        </p>
      </Callout>
    </>
  );
}
