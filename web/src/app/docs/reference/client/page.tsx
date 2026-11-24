import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "SDK: client" };

export default function ClientRef() {
  return (
    <>
      <h1>SDK: client</h1>
      <p className="lead">
        Pay for x402 resources from a mandate. Import from <code>@agentmeter/sdk</code>. Runs in Node.js 20+ and modern browsers.
      </p>

      <h2>createPayingFetch</h2>
      <Code title="signature">{`
function createPayingFetch(options: PayingFetchOptions): (url: string, init?: RequestInit) => Promise<PaidCall>
`}</Code>
      <p>
        Returns a function that behaves like <code>fetch</code>. If the response is <code>402</code> with a <code>mandate</code> offer for
        the configured network, it signs a payment and repeats the request once with a <code>PAYMENT-SIGNATURE</code> header.
      </p>

      <h3>PayingFetchOptions</h3>
      <Code title="type">{`
type PayingFetchOptions = {
  agent: LocalAccount;            // the agent's viem account; used only to sign
  chainId: number;                // chain to pay on, e.g. 44005 for Aevum testnet
  mandate: Address;               // the AgentMandate contract address
  mandateId: bigint;              // the mandate to spend from
  decimals?: number;              // token decimals, for log output. Default 6
  log?: (line: string) => void;   // optional logger. Default: none
};
`}</Code>

      <h3>PaidCall</h3>
      <Code title="type">{`
type PaidCall = {
  url: string;
  status: number;                 // final HTTP status
  body: unknown;                  // parsed JSON, or text if the body isn't JSON
  rawBody: string;                // the body exactly as received; hash this to verify a receipt
  paid?: {                        // set when a payment settled
    amount: string;               // token base units
    payTo: Address;               // the seller
    transaction: string;          // settlement transaction hash
    paymentId?: Hex;              // the receipt id
  };
  refused?: string;               // set when payment was required but didn't go through
};
`}</Code>

      <h3>Behavior</h3>
      <ul>
        <li>Responses other than <code>402</code> are returned as they are, with no payment.</li>
        <li>
          Before signing, it checks that the offer names the same AgentMandate contract and that its <code>resourceHash</code> matches the
          requested path and query. If either doesn&apos;t match, it returns <code>refused</code> without signing.
        </li>
        <li>
          Each payment has a random 32-byte nonce and a deadline of now plus the offer&apos;s <code>maxTimeoutSeconds</code>.
        </li>
        <li>It doesn&apos;t check the mandate&apos;s limits. The contract does, and refusals are returned in <code>refused</code>.</li>
        <li>It never throws for a refused payment. Network errors from <code>fetch</code> are thrown as usual.</li>
      </ul>

      <h3>Example</h3>
      <Code title="agent.ts">{`
import { createPayingFetch } from "@agentmeter/sdk";
import { privateKeyToAccount } from "viem/accounts";

const payingFetch = createPayingFetch({
  agent: privateKeyToAccount(process.env.AGENT_KEY as \`0x\${string}\`),
  chainId: 44005,
  mandate: "0xAgentMandateAddress",
  mandateId: 1n,
});

const res = await payingFetch("https://api.example.com/v1/news?topic=bitcoin");
`}</Code>
      <p>
        Refusal reasons are listed in <Link href="/docs/errors">Errors</Link>.
      </p>
    </>
  );
}
