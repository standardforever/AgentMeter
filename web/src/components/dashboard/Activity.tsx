"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PaidPayment } from "@/lib/chainEvents";
import { facilitatorUrl } from "@/lib/env";
import { amount, clock, refusalText, relative, short } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useNetwork } from "@/lib/network";
import type { FeedItem } from "@/lib/mandate";
import { CheckIcon, ClockIcon } from "../Icons";
import { Paid, Refused } from "../ui";

type Row =
  | { kind: "paid"; key: string; time: number; p: PaidPayment; resource?: string }
  | { kind: "refused"; key: string; time: number; f: FeedItem };

type Filter = "all" | "paid" | "refused";

/**
 * Every payment attempted: paid ones from the chain, refused ones from the facilitator.
 * The owner sees who each payment went to; a seller (view="seller") sees which mandate paid it.
 */
export function Activity({ paid, feed, feedOnline, view = "owner" }: { paid: PaidPayment[]; feed: FeedItem[]; feedOnline: boolean; view?: "owner" | "seller" }) {
  const { seller, mandateName } = useLabels();
  const { net } = useNetwork();
  const forSeller = view === "seller";
  const counterparty = (payee: string, mandateId: bigint | string) => (forSeller ? mandateName(net.mandate, BigInt(mandateId)) : seller(payee));
  const [filter, setFilter] = useState<Filter>("all");
  const seen = useRef<Set<string> | null>(null);

  const rows = useMemo<Row[]>(() => {
    const resourceById = new Map(feed.filter((f) => f.paymentId).map((f) => [f.paymentId!.toLowerCase(), f.resource]));
    const list: Row[] = [
      ...paid.map((p) => ({ kind: "paid" as const, key: p.paymentId, time: p.time ?? 0, p, resource: resourceById.get(p.paymentId.toLowerCase()) })),
      ...feed.filter((f) => f.outcome === "refused").map((f, i) => ({ kind: "refused" as const, key: `r-${f.at}-${i}`, time: Math.floor(f.at / 1000), f })),
    ];
    return list.sort((a, b) => b.time - a.time);
  }, [paid, feed]);

  // Highlight rows that arrive while the page is open (not the ones there on first load).
  const fresh = useMemo(() => {
    if (seen.current === null) return new Set<string>();
    return new Set(rows.filter((r) => !seen.current!.has(r.key)).map((r) => r.key));
  }, [rows]);
  useEffect(() => {
    seen.current = new Set(rows.map((r) => r.key));
  }, [rows]);

  const shown = rows.filter((r) => filter === "all" || r.kind === filter);
  const refusedCount = rows.filter((r) => r.kind === "refused").length;

  return (
    <section className="panel" aria-labelledby="activity-title">
      <div className="panel-head">
        <h2 id="activity-title">Activity</h2>
        <div className="row">
          <span className={`feed-live ${facilitatorUrl && feedOnline ? "" : "off"}`} title="Refused payments come from the payment service, because they never reach the chain.">
            <i aria-hidden="true" />
            {facilitatorUrl && feedOnline ? "Live" : "Refusals unavailable"}
          </span>
          <div className="feed-filter" role="group" aria-label="Show">
            {(["all", "paid", "refused"] as Filter[]).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? `All ${rows.length}` : f === "paid" ? `Paid ${rows.length - refusedCount}` : `Refused ${refusedCount}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <p>
            {filter === "refused"
              ? forSeller
                ? "No refused attempts to pay you."
                : "Nothing refused. Every payment so far followed your rules."
              : forSeller
                ? "No payments yet. When an agent pays for one of your API calls, it appears here within a few seconds."
                : "No payments yet. When your agent pays for an API call, it appears here within a few seconds."}
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className={`ledger activity ${forSeller ? "seller-view" : ""}`}>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Request</th>
                <th scope="col">{forSeller ? "Paid by" : "Seller"}</th>
                <th scope="col" className="num">
                  tUSD8
                </th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 60).map((r) =>
                r.kind === "paid" ? (
                  <tr key={r.key} className={fresh.has(r.key) ? "fresh" : ""}>
                    <td title={relative(r.time)}>{clock(r.time)}</td>
                    <td>
                      <span className="resource">{r.resource ?? short(r.p.resourceHash, 10, 6)}</span>
                      {!r.resource && <span className="cell-sub">request fingerprint</span>}
                    </td>
                    <td>{counterparty(r.p.payee, r.p.mandateId)}</td>
                    <td className="num">{amount(r.p.amount)}</td>
                    <td>
                      <Link href={`/app/r/${r.p.paymentId}`} className="row" style={{ gap: 10 }}>
                        <Paid />
                        <span className="cell-sub" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                          {r.p.responseHash ? (
                            <>
                              <CheckIcon className="inline-icon" /> answer recorded
                            </>
                          ) : (
                            <>
                              <ClockIcon className="inline-icon" /> answer pending
                            </>
                          )}
                        </span>
                      </Link>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.key} className={`refused ${fresh.has(r.key) ? "fresh" : ""}`}>
                    <td title={relative(r.time)}>{clock(r.time)}</td>
                    <td>
                      <span className="resource">{r.f.resource ?? "unknown request"}</span>
                    </td>
                    <td>{counterparty(r.f.payee, r.f.mandateId)}</td>
                    <td className="num">{amount(BigInt(r.f.amount))}</td>
                    <td>
                      <Refused />
                      <span className="cell-sub">
                        {refusalText(r.f.reason)}
                        {forSeller && /PayeeNotAllowed/.test(r.f.reason ?? "") ? ": ask its owner to allow you" : ""}
                      </span>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {!facilitatorUrl && (
        <p className="small quiet" style={{ marginTop: 14 }}>
          Refused payments never reach the chain. Set NEXT_PUBLIC_FACILITATOR_URL to show them here.
        </p>
      )}
    </section>
  );
}
