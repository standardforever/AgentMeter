"use client";

import { addressUrl } from "@aevum-kit/aevum";
import { useMemo } from "react";
import { ChainEventsProvider, payments, useChainEvents } from "@/lib/chainEvents";
import { amount, short } from "@/lib/format";
import { useNetwork } from "@/lib/network";
import { ExternalIcon } from "../Icons";

/** Real activity on the deployed contract: proof the system runs, not a mock-up. */
export function LiveStats() {
  return (
    <ChainEventsProvider>
      <Stats />
    </ChainEventsProvider>
  );
}

function Stats() {
  const { net } = useNetwork();
  const { status, events } = useChainEvents();
  const s = useMemo(() => {
    const paid = payments(events);
    return {
      mandates: events.filter((e) => e.eventName === "MandateCreated").length,
      payments: paid.length,
      volume: paid.reduce((t, p) => t + p.amount, 0n),
      receipts: paid.filter((p) => p.responseHash).length,
    };
  }, [events]);
  if (status === "no-contract" || status === "error" || !net.mandate) return null;
  const ready = status === "ready";
  const fig = (v: string | number) => (ready ? v : "–");

  return (
    <section className="live" aria-labelledby="live-title">
      <div className="shell live-inner">
        <h2 id="live-title" className="live-title">
          <i aria-hidden="true" /> Live on {net.label}
        </h2>
        <dl className="live-figures">
          <div>
            <dt>Mandates</dt>
            <dd className="figure">{fig(s.mandates)}</dd>
          </div>
          <div>
            <dt>Paid requests</dt>
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
        </dl>
        {net.hasExplorer ? (
          <a className="small live-link" href={addressUrl(net.mandate)} target="_blank" rel="noreferrer">
            Contract {short(net.mandate)} <ExternalIcon className="inline-icon" />
          </a>
        ) : (
          <span className="small quiet live-link">
            Contract <span className="hash">{short(net.mandate)}</span>
          </span>
        )}
      </div>
    </section>
  );
}
