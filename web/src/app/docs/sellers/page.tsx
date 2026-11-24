import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Quickstart for sellers" };

export default function Sellers() {
  return (
    <>
      <h1>Quickstart for sellers</h1>
      <p className="lead">
        Charge AI agents per request for your API. Payments settle in tUSD8 before your handler runs, and each response gets an on-chain
        receipt.
      </p>

      <h2>Prerequisites</h2>
      <ul>
        <li>Node.js 20 or later and an Express app.</li>
        <li>
          A wallet to receive payments, with a little tQDAY for recording receipts. Get test tokens from the{" "}
          <a href="https://faucet.qday.info">QDay faucet</a>.
        </li>
        <li>
          A facilitator URL. Run your own in one command: <Link href="/docs/guides/facilitator">Run a facilitator</Link>.
        </li>
        <li>
          The AgentMandate contract address. See <Link href="/docs/reference/networks">Networks</Link>.
        </li>
      </ul>

      <h2>1. Install the SDK</h2>
      <Code title="terminal">{`npm install @standeva/agentmeter viem express`}</Code>

      <h2>2. Add the paywall</h2>
      <p>
        <code>paywall</code> is Express middleware. Without a payment it answers <code>402</code> with your price; with a valid payment it
        settles it through the facilitator, then calls your handler. <code>createReceipts</code> sends the response and records its hash
        on-chain.
      </p>
      <Code title="server.ts">{`
import express from "express";
import { privateKeyToAccount } from "viem/accounts";
import { TUSD8_ADDRESS } from "@standeva/agentmeter";
import { paywall, createReceipts, type PaywallConfig } from "@standeva/agentmeter/server";

const seller = privateKeyToAccount(process.env.SELLER_KEY as \`0x\${string}\`);
const mandateContract = "0xAgentMandateAddress";

const config: PaywallConfig = {
  facilitatorUrl: "http://localhost:4021",
  network: "eip155:44005",   // Aevum testnet
  asset: TUSD8_ADDRESS,
  decimals: 6,
  payTo: seller.address,
  mandateContract,
};

const receipts = createReceipts({ account: seller, mandateContract });

const app = express();

app.get(
  "/v1/weather",
  paywall(config, { price: "0.02", description: "Current weather for a city" }),
  (req, res) => receipts.send(res, { city: req.query.city, tempC: 31 }),
);

app.listen(4020);
`}</Code>

      <h2>3. Test the price</h2>
      <Code title="terminal">{`curl -i "http://localhost:4020/v1/weather?city=Lagos"`}</Code>
      <Code title="response">{`
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbiI6Miwi...

{"x402Version":2,"error":"PAYMENT-SIGNATURE header is required","accepts":[{"scheme":"mandate","amount":"20000",...}]}
`}</Code>
      <p>
        The price is bound to the exact path and query, so a payment for <code>?city=Lagos</code> can&apos;t be reused for another city.
      </p>

      <h2>4. Get allowed by owners</h2>
      <p>An agent can only pay sellers its owner has allowed. Owners can add you in two ways:</p>
      <ul>
        <li>
          From your allow link, <code>/app/allow?seller=&lt;your address&gt;</code> on the AgentMeter dashboard, which lists their mandates
          with an <strong>Allow this seller</strong> button. The <Link href="/app/seller">Get paid</Link> page shows your link.
        </li>
        <li>
          On-chain, with <code>setPayee(mandateId, yourAddress, true)</code>.
        </li>
      </ul>

      <h2>5. Receive a payment</h2>
      <p>
        Point an agent at your endpoint, as in the <Link href="/docs/agents">Quickstart for agents</Link>. The request settles, your
        handler runs, and the payment appears on your <Link href="/app/seller">Get paid</Link> page with its receipt.
      </p>
      <Callout tone="warn">
        <p>
          Hash and send the same bytes. <code>receipts.send</code> does this for you; if you write the response yourself, attest the exact body
          you sent.
        </p>
      </Callout>

      <h2>Next steps</h2>
      <ul>
        <li><Link href="/docs/reference/server">SDK server reference</Link>: every option of <code>paywall</code> and <code>createReceipts</code>.</li>
        <li><Link href="/docs/guides/receipts">Record and verify receipts</Link>.</li>
        <li><Link href="/docs/guides/facilitator">Run a facilitator</Link> in production.</li>
      </ul>
    </>
  );
}
