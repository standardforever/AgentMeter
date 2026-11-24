import type { Metadata } from "next";
import Link from "next/link";
import { defaultNetwork } from "@/lib/env";

export const metadata: Metadata = { title: "AgentMandate contract" };

type Row = [string, string, string];

const owner: Row[] = [
  ["createMandate(agent, verifier, verifierKey, limits, payees[], initialDeposit)", "Anyone (becomes owner)", "Create a mandate, allow its sellers and pull the deposit. Returns the id."],
  ["createNamedMandate(name, agent, verifier, verifierKey, limits, payees[], initialDeposit)", "Anyone (becomes owner)", "Same, plus a name"],
  ["setName(mandateId, name)", "Owner", "Name or rename; empty clears. At most 64 bytes."],
  ["setLimits(mandateId, limits)", "Owner", "Replace the limits"],
  ["setPayee(mandateId, payee, allowed)", "Owner", "Add or remove a seller"],
  ["setAgent(mandateId, agent, verifier, verifierKey)", "Owner", "Replace the agent key; old signatures stop working"],
  ["revoke(mandateId)", "Owner", "Stop all spending, permanently"],
  ["withdraw(mandateId, amount, to)", "Owner", "Send unspent tUSD8 to an address"],
  ["deposit(mandateId, amount)", "Anyone", "Add tUSD8 (approve first)"],
  ["depositWithAuthorization(mandateId, from, amount, auth)", "Anyone", "Gasless top-up with an EIP-3009 authorization signed by from"],
];

const settlement: Row[] = [
  ["verify(payment, signature) → (ok, reason)", "Anyone (view)", "Would this payment settle now? reason is the error selector, or 0x00000000"],
  ["settle(payment, signature) → paymentId", "Anyone", "Check every rule and pay. Idempotent."],
  ["attest(paymentId, responseHash)", "The payment's payee", "Record the response hash, once"],
];

const views: Row[] = [
  ["getMandate(mandateId)", "Mandate", "owner, agent, verifier, revoked, periodStart, periodSpent, totalSpent, balance, limits"],
  ["remaining(mandateId)", "(singlePayment, period, total, balance)", "What can still be spent, accounting for a rolled-over period"],
  ["isAllowedPayee(mandateId, payee)", "bool", "Whether a seller is allowed"],
  ["receiptOf(paymentId)", "Receipt", "mandateId, payee, amount, paidAt, resourceHash, requestHash, responseHash"],
  ["isSettled(paymentId)", "bool", "Whether a payment was paid"],
  ["nonceUsed(mandateId, nonce)", "bool", "Whether a nonce was used"],
  ["paymentDigest(payment)", "bytes32", "The EIP-712 digest, which is the paymentId"],
  ["verifierKeyOf(mandateId)", "bytes", "The agent's public key for a custom verifier"],
  ["depositNonce(mandateId, salt)", "bytes32", "The EIP-3009 nonce to sign for depositWithAuthorization"],
  ["mandateCount()", "uint256", "Number of mandates created"],
  ["token()", "address", "tUSD8"],
];

const events: [string, string][] = [
  ["MandateCreated(mandateId, owner, agent, verifier, limits)", "A mandate was created"],
  ["MandateNamed(mandateId, name)", "It was named or renamed; the latest wins"],
  ["PayeeSet(mandateId, payee, allowed)", "A seller was allowed or removed"],
  ["LimitsUpdated(mandateId, limits)", "Limits changed"],
  ["AgentSet(mandateId, agent, verifier, verifierKey)", "The agent key changed"],
  ["Deposited(mandateId, from, amount)", "tUSD8 added"],
  ["Withdrawn(mandateId, to, amount)", "tUSD8 withdrawn"],
  ["MandateRevoked(mandateId)", "Revoked"],
  ["PaymentSettled(paymentId, mandateId, payee, amount, resourceHash, requestHash)", "A payment was paid"],
  ["ResultAttested(paymentId, payee, responseHash)", "A receipt got its response hash"],
];

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="docs-table">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]}>
            <td><code>{r[0]}</code></td>
            {r.slice(1).map((c, i) => (
              <td key={i}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Contract() {
  return (
    <>
      <h1>AgentMandate contract</h1>
      <p className="lead">
        The on-chain escrow and rule engine. Solidity 0.8.24, Shanghai EVM. The ABI is exported by the SDK as <code>agentMandateAbi</code>.
      </p>
      <p>
        {defaultNetwork.mandate ? (
          <>
            Deployed at <code>{defaultNetwork.mandate}</code> on {defaultNetwork.label}.
          </>
        ) : (
          <>No deployment is configured for this site.</>
        )}
      </p>

      <h2>Owner and funding</h2>
      <Table head={["Function", "Caller", "Description"]} rows={owner} />

      <h2>Settlement</h2>
      <Table head={["Function", "Caller", "Description"]} rows={settlement} />

      <h2>Views</h2>
      <Table head={["Function", "Returns", "Description"]} rows={views} />

      <h2>Events</h2>
      <Table head={["Event", "Emitted when"]} rows={events} />

      <h2>Structs</h2>
      <Table
        head={["Struct", "Fields"]}
        rows={[
          ["Limits", "uint128 maxSinglePayment, uint128 maxPeriodSpend, uint128 maxTotalSpend, uint32 period, uint64 expiresAt"],
          ["Payment", "uint256 mandateId, address payee, uint256 amount, bytes32 resourceHash, bytes32 requestHash, bytes32 nonce, uint64 deadline"],
          ["Receipt", "uint256 mandateId, address payee, uint128 amount, uint64 paidAt, bytes32 resourceHash, bytes32 requestHash, bytes32 responseHash"],
          ["Authorization", "uint256 validAfter, uint256 validBefore, bytes32 salt, uint8 v, bytes32 r, bytes32 s"],
        ]}
      />

      <h2>Errors</h2>
      <p>
        See <Link href="/docs/errors">Errors and reasons</Link>.
      </p>

      <h2>Custom signature schemes</h2>
      <p>
        A mandate may name a <code>verifier</code> implementing <code>IAgentVerifier.isValidSignature(publicKey, digest, signature)</code>. The
        contract then calls it with <code>verifierKeyOf(mandateId)</code> instead of ECDSA recovery, and treats a revert as an invalid
        signature. <code>MLDSA65Verifier</code> targets ML-DSA-65 (public key 1,952 bytes, signature 3,309 bytes) and rejects everything
        until Aevum&apos;s precompile is available.
      </p>
    </>
  );
}
