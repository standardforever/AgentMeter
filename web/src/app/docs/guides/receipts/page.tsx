import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Record and verify receipts" };

export default function Receipts() {
  return (
    <>
      <h1>Record and verify receipts</h1>
      <p className="lead">
        A receipt ties a payment to the exact response that was sold. Sellers record it; anyone holding the response can verify it.
      </p>

      <h2>How receipts work</h2>
      <p>
        Every settled payment has an on-chain receipt with its mandate, seller, amount and time. After answering, the seller calls{" "}
        <code>attest(paymentId, responseHash)</code>, where <code>responseHash</code> is the <code>keccak256</code> hash of the response body.
        Only the payment&apos;s seller can attest, and only once.
      </p>

      <h2>Record receipts as a seller</h2>
      <p>
        Use <code>createReceipts</code> and send paid responses with <code>receipts.send</code>. It sends the JSON body, then attests a hash of
        those exact bytes in the background, so the buyer doesn&apos;t wait.
      </p>
      <Code title="server.ts">{`
import { createReceipts } from "@agentmeter/sdk/server";

const receipts = createReceipts({ account: seller, mandateContract });

app.get("/v1/price", paywall(config, { price: "0.01", description: "BTC price" }), (req, res) =>
  receipts.send(res, { pair: "BTC-USD", price: 97012.5 }),
);
`}</Code>
      <p>
        To attest a response you send yourself, call <code>receipts.attest(paymentId, body)</code> with the payment id from{" "}
        <code>res.locals.settlement.extensions.mandate.paymentId</code> and the exact body string.
      </p>
      <Callout>
        <p>Attesting costs gas, paid by the seller&apos;s account in tQDAY. Keep it funded.</p>
      </Callout>

      <h2>Verify a response as a buyer</h2>
      <p>
        Hash the response exactly as received and compare it with the receipt. <code>payingFetch</code> returns the raw body in{" "}
        <code>rawBody</code> and the payment id in <code>paid.paymentId</code>.
      </p>
      <Code title="verify.ts">{`
import { createPublicClient, http } from "viem";
import { aevumTestnet, agentMandateAbi, responseHashOf } from "@agentmeter/sdk";

const client = createPublicClient({ chain: aevumTestnet, transport: http() });

const res = await payingFetch(url);
const receipt = await client.readContract({
  address: MANDATE,
  abi: agentMandateAbi,
  functionName: "receiptOf",
  args: [res.paid!.paymentId!],
});

const matches = receipt.responseHash === responseHashOf(res.rawBody);
`}</Code>
      <p>
        In the dashboard, open a payment&apos;s receipt page and paste the response to run the same check.
      </p>
      <Callout tone="warn">
        <p>
          A matching receipt proves the seller committed to that response for that payment. It doesn&apos;t prove the response is correct.
        </p>
      </Callout>

      <p>
        See also <Link href="/docs/contract">receiptOf and attest</Link> in the contract reference.
      </p>
    </>
  );
}
