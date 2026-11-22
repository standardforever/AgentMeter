"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { keccak256, toHex, type Hex } from "viem";
import { payments, useChainEvents } from "@/lib/chainEvents";
import { amount, dateTime, relative } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useFeed } from "@/lib/mandate";
import { useNetwork } from "@/lib/network";
import { Notice, Paid, TxLink } from "@/components/ui";

/** One payment's receipt, and a way to check an answer against the fingerprint the seller recorded. */
export default function ReceiptPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const { events } = useChainEvents();
  const { net } = useNetwork();
  const { mandateName, seller } = useLabels();
  const p = useMemo(() => payments(events).find((x) => x.paymentId.toLowerCase() === paymentId?.toLowerCase()), [events, paymentId]);
  const feed = useFeed(p?.mandateId);
  const resource = feed.data?.items.find((f) => f.paymentId?.toLowerCase() === paymentId?.toLowerCase())?.resource;
  const [answer, setAnswer] = useState("");
  const answerHash: Hex | undefined = answer ? keccak256(toHex(answer)) : undefined;

  if (!p) {
    return (
      <section className="gate">
        <h1>No such payment</h1>
        <p className="lead">This payment isn&apos;t on {net.label}. Check the link, or open the mandate&apos;s activity.</p>
        <Link className="btn" href="/app">
          Your mandates
        </Link>
      </section>
    );
  }

  const match = answerHash && p.responseHash ? answerHash === p.responseHash : undefined;

  return (
    <>
      <div className="crumbs">
        <Link href="/app">Mandates</Link> / <Link href={`/app/m/${p.mandateId}`}>{p.mandateId.toString().padStart(4, "0")}</Link> / Receipt
      </div>
      <div className="page-head">
        <div>
          <h1>Receipt</h1>
          <p className="lead">
            {mandateName(net.mandate, p.mandateId)} paid {seller(p.payee)} {p.time ? relative(p.time) : ""}.
          </p>
        </div>
      </div>

      <div className="receipt">
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
            <div>
              <div className="dim">Amount</div>
              <div className="figure receipt-amount">
                {amount(p.amount)} <span className="quiet small" style={{ fontFamily: "var(--font-body)" }}>tUSD8</span>
              </div>
            </div>
            <Paid />
          </div>
          <dl>
            <dt>Request</dt>
            <dd>{resource ? <span className="resource">{resource}</span> : <span className="quiet">Not known to this dashboard (only its fingerprint is on-chain)</span>}</dd>
            <dt>Seller</dt>
            <dd>
              {seller(p.payee)} <span className="hash quiet">{p.payee}</span>
            </dd>
            <dt>Paid at</dt>
            <dd>{p.time ? dateTime(p.time) : "–"}</dd>
            <dt>Transaction</dt>
            <dd>
              <TxLink hash={p.txHash} />
            </dd>
            <dt>Payment ID</dt>
            <dd className="hash">{p.paymentId}</dd>
            <dt>Request fingerprint</dt>
            <dd className="hash">{p.requestHash}</dd>
            <dt>Answer fingerprint</dt>
            <dd className="hash">{p.responseHash ?? <span className="quiet">The seller hasn&apos;t recorded it yet</span>}</dd>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Check an answer</h2>
          </div>
          <p className="small" style={{ color: "var(--ink-2)", marginBottom: 14 }}>
            After the seller answered, it recorded a fingerprint of the exact response on-chain. Paste the response body your agent received to
            check it&apos;s the one this payment bought. Any change, even one character, gives a different fingerprint.
          </p>
          <label className="field">
            <span className="field-label">Response body</span>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder='{"pair":"BTC-USD","price":97012.5,…}' spellCheck={false} />
          </label>
          <div style={{ marginTop: 14 }}>
            {!p.responseHash && answer && <Notice tone="warn">Nothing to compare with yet: the seller hasn&apos;t recorded this answer.</Notice>}
            {match === true && <Notice tone="good">Matches. This is exactly the answer the seller recorded for this payment.</Notice>}
            {match === false && (
              <Notice tone="bad">
                Doesn&apos;t match. Either the text was changed, or it&apos;s not the response to this payment. Check you pasted the whole body,
                unchanged.
              </Notice>
            )}
            {answerHash && <p className="small quiet hash" style={{ marginTop: 10 }}>Fingerprint of what you pasted: {answerHash}</p>}
          </div>
        </section>
      </div>
    </>
  );
}
