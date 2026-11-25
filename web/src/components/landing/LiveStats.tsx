"use client";

import { addressUrl } from "@aevum-kit/aevum";
import Link from "next/link";
import { useMemo } from "react";
import { payments, useChainEvents } from "@/lib/chainEvents";
import { amount, short } from "@/lib/format";
import { useNetwork } from "@/lib/network";
import { ExternalIcon } from "../Icons";

/**
 * Real activity on the deployed contract, under the hero's buttons: proof the system runs, not a mock-up.
 * Every figure is read from the chain when the page loads (needs a ChainEventsProvider above it).
 */
export function LiveStats() {
  const { net } = useNetwork();
  const { status, events } = useChainEvents();
  const s = useMemo(() => {
    const paid = payments(events);
    const created = events.filter((e) => e.eventName === "MandateCreated");
    // The mandate with the most payments makes the best first impression of the dashboard.
    const busiest = [...new Set(paid.map((p) => p.mandateId))].sort(
      (a, b) => paid.filter((p) => p.mandateId === b).length - paid.filter((p) => p.mandateId === a).length,
    )[0];
    return {
      mandates: created.length,
      payments: paid.length,
      volume: paid.reduce((t, p) => t + p.amount, 0n),
      receipts: paid.filter((p) => p.responseHash).length,
      showcase: busiest ?? (created[0]?.args as { mandateId: bigint } | undefined)?.mandateId,
    };
  }, [events]);
  if (status === "no-contract" || status === "error" || !net.mandate) return null;
  const ready = status === "ready";
  const fig = (v: string | number) => (ready ? v : "–");

  return (
    <div className="proof" aria-labelledby="proof-title">
      <p id="proof-title" className="proof-title">
        <i aria-hidden="true" /> Live on {net.label}
        {net.hasExplorer && (
          <a className="proof-contract" href={`${addressUrl(net.mandate)}?tab=contract`} target="_blank" rel="noreferrer">
            Verified contract {short(net.mandate)} <ExternalIcon className="inline-icon" />
          </a>
        )}
      </p>
      <dl className="proof-figures">
        <div>
          <dt>Payments settled</dt>
          <dd className="figure">{fig(s.payments)}</dd>
        </div>
        <div>
          <dt>Paid to sellers</dt>
          <dd className="figure">
            {fig(amount(s.volume))} <span className="unit">tUSD8</span>
          </dd>
        </div>
        <div>
          <dt>Answers with a receipt</dt>
          <dd className="figure">{fig(s.receipts)}</dd>
        </div>
        <div>
          <dt>Mandates</dt>
          <dd className="figure">{fig(s.mandates)}</dd>
        </div>
      </dl>
      {s.showcase !== undefined && (
        <Link className="proof-open" href={`/app/m/${s.showcase}`}>
          See a live mandate: its budget, payments and refusals <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}
