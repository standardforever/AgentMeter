import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "SDK: server" };

export default function ServerRef() {
  return (
    <>
      <h1>SDK: server</h1>
      <p className="lead">
        Charge for Express routes, record receipts and run a facilitator. Import from <code>@agentmeter/sdk/server</code>. Requires Node.js
        20+ and <code>express</code> 5.
      </p>

      <h2>paywall</h2>
      <Code title="signature">{`
function paywall(config: PaywallConfig, price: Price): RequestHandler
`}</Code>
      <p>Express middleware that charges for the route it guards.</p>
      <Code title="types">{`
type PaywallConfig = {
  facilitatorUrl: string;     // base URL of the facilitator
  network: string;            // CAIP-2 network id, e.g. "eip155:44005"
  asset: Address;             // the payment token, e.g. TUSD8_ADDRESS
  decimals: number;           // token decimals: 6 for tUSD8
  payTo: Address;             // the address that receives payments
  mandateContract: Address;   // the AgentMandate contract the facilitator settles on
};

type Price = {
  price: string;              // decimal amount in tokens, e.g. "0.01"
  description: string;        // shown to clients in the 402 response
};
`}</Code>
      <ul>
        <li>
          Without a <code>PAYMENT-SIGNATURE</code> header: responds <code>402</code> with a <code>PAYMENT-REQUIRED</code> header and the
          same requirements as JSON. The price is bound to the request&apos;s path and query.
        </li>
        <li>
          With one: calls the facilitator&apos;s <code>/verify</code>, then <code>/settle</code>. If either refuses, responds{" "}
          <code>402</code> with the reason in <code>error</code>.
        </li>
        <li>
          On success: sets <code>PAYMENT-RESPONSE</code>, stores the <code>SettleResponse</code> in <code>res.locals.settlement</code> and
          calls the next handler.
        </li>
        <li>If the facilitator is unreachable: responds <code>502</code>. No payment is made.</li>
      </ul>

      <h2>createReceipts</h2>
      <Code title="signature">{`
function createReceipts(options: ReceiptsOptions): {
  send(res: Response, data: unknown): void;
  attest(paymentId: Hex, body: string): Promise<Hex>;
}

type ReceiptsOptions = {
  account: LocalAccount;          // the seller; must be the payment's payee and hold gas
  mandateContract: Address;
  chain?: Chain;                  // default: Aevum testnet
  rpcUrl?: string;                // default: the chain's public RPC
  onError?: (error: unknown, paymentId: Hex) => void;   // default: console.error
};
`}</Code>
      <ul>
        <li>
          <code>send</code> responds with <code>data</code> as JSON, then attests <code>keccak256</code> of that exact body for the
          request&apos;s payment. For unpaid requests it only responds.
        </li>
        <li>
          <code>attest</code> records a receipt for any settled payment and resolves with the transaction hash. Attestations are sent one at
          a time.
        </li>
      </ul>

      <h2>createFacilitator</h2>
      <Code title="signature">{`
function createFacilitator(options: FacilitatorOptions): Promise<{ app: Express; network: string; address: Address }>

type FacilitatorOptions = {
  account: LocalAccount;          // sends settlements and pays their gas
  mandateContract: Address;
  chain?: Chain;                  // default: Aevum testnet
  rpcUrl?: string;                // default: the chain's public RPC
  activityLimit?: number;         // attempts kept for GET /activity. Default 500
  log?: (line: string) => void;   // default: console.log
};
`}</Code>
      <p>
        Returns an Express app serving the <Link href="/docs/facilitator">Facilitator HTTP API</Link>. Settlements are simulated before
        they&apos;re sent and are sent one at a time.
      </p>

      <h2>runFacilitator</h2>
      <Code title="signature">{`
function runFacilitator(env?: Record<string, string | undefined>): Promise<void>
`}</Code>
      <p>
        Starts a facilitator from environment variables: <code>MANDATE_ADDRESS</code>, <code>FACILITATOR_KEY</code>,{" "}
        <code>RPC_URL</code> and <code>FACILITATOR_PORT</code>. The <code>agentmeter-facilitator</code> command calls it.
      </p>

      <h2>checkRequest</h2>
      <Code title="signature">{`
function checkRequest(body: FacilitatorRequest, ctx: CheckContext): CheckResult

type CheckContext = { network: string; asset: Address; mandateContract: Address };
type CheckResult = { ok: true; payment: Payment } | { ok: false; reason: string; message: string };
`}</Code>
      <p>
        The facilitator&apos;s off-chain checks, as a pure function: the offer matches the requirements, and the signed payment pays the right
        seller, the right amount, for the right resource. Use it if you build your own facilitator.
      </p>
    </>
  );
}
