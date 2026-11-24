import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "SDK: utilities" };

export default function UtilitiesRef() {
  return (
    <>
      <h1>SDK: utilities</h1>
      <p className="lead">Constants, the contract ABI, typed data and protocol helpers. Import from <code>@standeva/agentmeter</code>.</p>

      <h2>Constants</h2>
      <table className="docs-table">
        <thead>
          <tr><th>Name</th><th>Value</th></tr>
        </thead>
        <tbody>
          <tr><td><code>aevumTestnet</code></td><td>viem <code>Chain</code> for Aevum testnet (id 44005)</td></tr>
          <tr><td><code>TUSD8_ADDRESS</code></td><td><code>0x456569838f1d43009A91ebA4263147Afd7233483</code></td></tr>
          <tr><td><code>TUSD8_DECIMALS</code></td><td><code>6</code></td></tr>
          <tr><td><code>X402_VERSION</code></td><td><code>2</code></td></tr>
          <tr><td><code>SCHEME</code></td><td><code>&quot;mandate&quot;</code></td></tr>
          <tr><td><code>HEADER_REQUIRED</code>, <code>HEADER_SIGNATURE</code>, <code>HEADER_RESPONSE</code></td><td><code>PAYMENT-REQUIRED</code>, <code>PAYMENT-SIGNATURE</code>, <code>PAYMENT-RESPONSE</code></td></tr>
        </tbody>
      </table>

      <h2>agentMandateAbi</h2>
      <p>
        The AgentMandate ABI as a <code>const</code>, for typed reads, writes and event parsing with viem. See the{" "}
        <Link href="/docs/contract">contract reference</Link>.
      </p>

      <h2>paymentTypedData</h2>
      <Code title="signature">{`
function paymentTypedData(chainId: number, mandateContract: Address, payment: Payment): TypedData

type Payment = {
  mandateId: bigint;
  payee: Address;
  amount: bigint;        // token base units
  resourceHash: Hex;
  requestHash: Hex;
  nonce: Hex;            // 32 bytes
  deadline: bigint;      // unix seconds
};
`}</Code>
      <p>Returns the EIP-712 typed data for a payment, to pass to viem&apos;s <code>signTypedData</code>. Its hash is the payment id.</p>

      <h2>reasonName</h2>
      <Code title="signature">{`function reasonName(reason: Hex): string`}</Code>
      <p>
        Converts the 4-byte <code>reason</code> returned by the contract&apos;s <code>verify</code> into an error name, for example{" "}
        <code>&quot;PayeeNotAllowed&quot;</code>.
      </p>

      <h2>Hashes</h2>
      <Code title="signatures">{`
function resourceHashOf(pathAndQuery: string): Hex   // keccak256 of e.g. "/v1/price?pair=BTC-USD"
function responseHashOf(body: string): Hex           // keccak256 of a response body, for receipts
`}</Code>

      <h2>Headers</h2>
      <Code title="signatures">{`
function encodeHeader(value: unknown): string        // JSON, then base64
function decodeHeader<T>(value: string): T
function toWire(payment: Payment): WirePayment       // bigints as decimal strings
function fromWire(payment: WirePayment): Payment
function caip2(chainId: number): string              // "eip155:<chainId>"
`}</Code>
      <p>
        Message types (<code>PaymentRequired</code>, <code>PaymentRequirements</code>, <code>PaymentPayload</code>,{" "}
        <code>SettleResponse</code>, <code>VerifyResponse</code>) are described in <Link href="/docs/protocol">Payment scheme</Link>.
      </p>
    </>
  );
}
