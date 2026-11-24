import type { Metadata } from "next";

export const metadata: Metadata = { title: "Errors" };

const contract: [string, string, string][] = [
  ["UnknownMandate", "settle, verify, owner functions, deposit", "No mandate with this id"],
  ["MandateIsRevoked", "settle, verify", "The owner revoked the mandate"],
  ["MandateExpired", "settle, verify", "Past the mandate's expiresAt"],
  ["PaymentExpired", "settle, verify", "Past the payment's deadline"],
  ["ZeroAmount", "settle, verify, deposit, withdraw", "Amount is zero"],
  ["PayeeNotAllowed", "settle, verify", "The seller isn't on the allowlist"],
  ["ExceedsSinglePayment", "settle, verify", "Above maxSinglePayment"],
  ["ExceedsPeriodBudget", "settle, verify", "Would exceed maxPeriodSpend in the current period"],
  ["ExceedsTotalBudget", "settle, verify", "Would exceed maxTotalSpend"],
  ["InsufficientBalance", "settle, verify, withdraw", "Not enough tUSD8 in the mandate"],
  ["NonceAlreadyUsed", "settle, verify", "This nonce was used by an earlier payment"],
  ["InvalidAgentSignature", "settle, verify", "Not signed by the mandate's current agent"],
  ["NotOwner", "owner functions", "The caller isn't the mandate's owner"],
  ["InvalidLimits", "create, setLimits", "Limits must satisfy 0 < perCall ≤ perPeriod ≤ total, period > 0, expiry in the future"],
  ["ZeroAddress", "create, setAgent, withdraw", "An address is zero"],
  ["EmptyVerifierKey", "create, setAgent", "A custom verifier needs the agent's public key"],
  ["NameTooLong", "createNamedMandate, setName", "Name longer than 64 bytes"],
  ["UnknownPayment", "attest", "No settled payment with this id"],
  ["NotPayee", "attest", "Only the payment's seller can attest"],
  ["AlreadyAttested", "attest", "The receipt already has a response hash"],
  ["EmptyResponseHash", "attest", "The response hash is zero"],
];

const facilitator: [string, string][] = [
  ["mandate_<Error>", "The contract refused the payment; <Error> is one of the contract errors above"],
  ["invalid_x402_version", "x402Version isn't 2"],
  ["invalid_payload", "Missing fields, or the payment can't be parsed"],
  ["unsupported_scheme", "The scheme isn't mandate"],
  ["invalid_network", "Not the network this facilitator settles on"],
  ["invalid_payment_requirements", "Wrong token or contract, or the accepted offer differs from the server's"],
  ["invalid_mandate_payload_recipient_mismatch", "The signed payment pays someone other than payTo"],
  ["invalid_mandate_payload_value_mismatch", "The signed amount differs from the price"],
  ["invalid_mandate_payload_resource_mismatch", "The signed resourceHash differs from the priced resource"],
  ["payment_already_settled", "This signed payment was already settled. A copy can't buy the resource again: the agent signs a new payment"],
  ["unexpected_verify_error", "The facilitator couldn't check the payment (for example, the RPC failed)"],
  ["unexpected_settle_error", "The transaction failed or reverted; check the facilitator's gas balance and logs"],
];

const client: [string, string][] = [
  ['no "mandate" offer on <network>', "The server doesn't accept this scheme on the client's chain"],
  ["seller wants a different mandate contract", "The offer names another AgentMandate"],
  ["price is for a different resource", "The offer's resourceHash doesn't match the URL requested"],
  ["PAYMENT-SIGNATURE header is required", "Returned by the paywall in the first 402; not an error"],
];

export default function Errors() {
  return (
    <>
      <h1>Errors</h1>
      <p className="lead">Every reason a payment or a call can fail, where it comes from, and what it means.</p>

      <h2>Contract errors</h2>
      <p>
        Custom Solidity errors. <code>settle</code> and owner functions revert with them; <code>verify</code> returns the error&apos;s
        4-byte selector as <code>reason</code>. The SDK&apos;s <code>reasonName(selector)</code> converts a selector to its
        name.
      </p>
      <table className="docs-table">
        <thead>
          <tr><th>Error</th><th>From</th><th>Meaning</th></tr>
        </thead>
        <tbody>
          {contract.map(([e, from, meaning]) => (
            <tr key={e}><td><code>{e}</code></td><td>{from}</td><td>{meaning}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Facilitator reasons</h2>
      <p>
        In <code>invalidReason</code> from <code>/verify</code> and <code>errorReason</code> from <code>/settle</code>. The paywall passes
        them to the client as the <code>error</code> of a new <code>402</code>, and <code>payingFetch</code> returns them as{" "}
        <code>refused</code>.
      </p>
      <table className="docs-table">
        <thead>
          <tr><th>Reason</th><th>Meaning</th></tr>
        </thead>
        <tbody>
          {facilitator.map(([r, m]) => (
            <tr key={r}><td><code>{r}</code></td><td>{m}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Client and paywall</h2>
      <table className="docs-table">
        <thead>
          <tr><th>Message</th><th>Meaning</th></tr>
        </thead>
        <tbody>
          {client.map(([r, m]) => (
            <tr key={r}><td><code>{r}</code></td><td>{m}</td></tr>
          ))}
          <tr><td>HTTP <code>502</code></td><td>The paywall couldn&apos;t reach the facilitator. No money moved.</td></tr>
        </tbody>
      </table>
    </>
  );
}
