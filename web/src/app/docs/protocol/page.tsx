import type { Metadata } from "next";
import { Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Payment scheme" };

export default function Protocol() {
  return (
    <>
      <h1>Payment scheme</h1>
      <p className="lead">
        AgentMeter uses x402 version 2 over HTTP, with a payment scheme named <code>mandate</code>: the payer is a mandate&apos;s escrow, not
        the agent&apos;s wallet.
      </p>

      <h2>Sequence</h2>
      <ol>
        <li>Client requests a resource with no payment.</li>
        <li>Server answers <code>402</code> with <code>PAYMENT-REQUIRED</code>.</li>
        <li>Client signs a <code>Payment</code> and repeats the request with <code>PAYMENT-SIGNATURE</code>.</li>
        <li>Server calls the facilitator&apos;s <code>/verify</code> and <code>/settle</code>.</li>
        <li>On success the server answers with the resource and <code>PAYMENT-RESPONSE</code>; otherwise <code>402</code> with the reason.</li>
      </ol>

      <h2>Headers</h2>
      <p>Each header carries base64-encoded JSON.</p>
      <table className="docs-table">
        <thead>
          <tr><th>Header</th><th>Direction</th><th>Body</th></tr>
        </thead>
        <tbody>
          <tr><td><code>PAYMENT-REQUIRED</code></td><td>Server → client, with 402</td><td><code>PaymentRequired</code></td></tr>
          <tr><td><code>PAYMENT-SIGNATURE</code></td><td>Client → server</td><td><code>PaymentPayload</code></td></tr>
          <tr><td><code>PAYMENT-RESPONSE</code></td><td>Server → client, with 2xx</td><td><code>SettleResponse</code></td></tr>
        </tbody>
      </table>

      <h2>PaymentRequired</h2>
      <Code title="PAYMENT-REQUIRED (decoded)">{`
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": { "url": "/v1/price?pair=BTC-USD", "description": "Price of a crypto pair", "mimeType": "application/json" },
  "accepts": [
    {
      "scheme": "mandate",
      "network": "eip155:44005",
      "amount": "10000",
      "asset": "0x456569838f1d43009A91ebA4263147Afd7233483",
      "payTo": "0xSellerAddress",
      "maxTimeoutSeconds": 120,
      "extra": {
        "mandateContract": "0xAgentMandateAddress",
        "resourceHash": "0x…"
      }
    }
  ]
}
`}</Code>
      <table className="docs-table">
        <thead>
          <tr><th>Field</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td>amount</td><td>Price in token base units</td></tr>
          <tr><td>payTo</td><td>The seller address to be paid</td></tr>
          <tr><td>maxTimeoutSeconds</td><td>How long a signed payment for this offer may stay valid</td></tr>
          <tr><td>extra.mandateContract</td><td>The AgentMandate the payment must be for</td></tr>
          <tr><td>extra.resourceHash</td><td><code>keccak256(utf8(path + query))</code>, for example of <code>/v1/price?pair=BTC-USD</code></td></tr>
        </tbody>
      </table>

      <h2>PaymentPayload</h2>
      <Code title="PAYMENT-SIGNATURE (decoded)">{`
{
  "x402Version": 2,
  "resource": { "url": "/v1/price?pair=BTC-USD", "description": "…" },
  "accepted": { …the offer the client chose, unchanged… },
  "payload": {
    "payment": {
      "mandateId": "1",
      "payee": "0xSellerAddress",
      "amount": "10000",
      "resourceHash": "0x…",
      "requestHash": "0x…",
      "nonce": "0x…32 bytes…",
      "deadline": "1795300000"
    },
    "signature": "0x…65 bytes…"
  }
}
`}</Code>
      <p>Integers are sent as decimal strings. <code>accepted</code> must equal the server&apos;s offer, or the facilitator rejects it.</p>

      <h2>EIP-712 signature</h2>
      <Code title="typed data">{`
domain: {
  name: "AgentMandate",
  version: "1",
  chainId: 44005,
  verifyingContract: <AgentMandate address>
}

Payment(uint256 mandateId,address payee,uint256 amount,bytes32 resourceHash,bytes32 requestHash,bytes32 nonce,uint64 deadline)
`}</Code>
      <p>
        The SDK&apos;s <code>paymentTypedData(chainId, mandate, payment)</code> builds this for viem&apos;s{" "}
        <code>signTypedData</code>. The digest is the <code>paymentId</code>; the contract&apos;s <code>paymentDigest(payment)</code> returns
        the same value.
      </p>

      <h2>SettleResponse</h2>
      <Code title="PAYMENT-RESPONSE (decoded)">{`
{
  "success": true,
  "payer": "mandate #1",
  "transaction": "0x…",
  "network": "eip155:44005",
  "amount": "10000",
  "extensions": { "mandate": { "paymentId": "0x…" } }
}
`}</Code>

      <h2>Hashes</h2>
      <table className="docs-table">
        <thead>
          <tr><th>Hash</th><th>Computed as</th><th>Set by</th></tr>
        </thead>
        <tbody>
          <tr><td>resourceHash</td><td><code>keccak256(utf8(path + query))</code></td><td>Server, checked by client and facilitator</td></tr>
          <tr><td>requestHash</td><td>Any 32 bytes identifying the request. The sample client hashes method, URL, body and time.</td><td>Client</td></tr>
          <tr><td>responseHash</td><td><code>keccak256(utf8(exact response body))</code></td><td>Server, via <code>attest</code></td></tr>
        </tbody>
      </table>
    </>
  );
}
