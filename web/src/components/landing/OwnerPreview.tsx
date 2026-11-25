"use client";

import Link from "next/link";
import { useMemo } from "react";
import { payments, useChainEvents } from "@/lib/chainEvents";
import { amount, ratio, relative, short } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useMandate } from "@/lib/mandate";
import { useNetwork } from "@/lib/network";
import { SpendChart } from "../dashboard/SpendChart";
import { CheckIcon, ClockIcon } from "../Icons";
import { Meter, StateMark, TxLink } from "../ui";

/**
 * "What the owner sees": the real dashboard for the busiest mandate on the contract, live, in a
 * browser frame. Not a screenshot: the meters, the chart and the payments are read from the chain.
 */
export function OwnerPreview() {
  const { net } = useNetwork();
  const { status, events } = useChainEvents();
  const { mandateName } = useLabels();
  const id = useMemo(() => {
    const paid = payments(events);
    const counts = new Map<bigint, number>();
    for (const p of paid) counts.set(p.mandateId, (counts.get(p.mandateId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [events]);
  const { mandate, remaining, state } = useMandate(id);
  const paid = useMemo(() => (id === undefined ? [] : payments(events, id)), [events, id]);

  if (!net.mandate || status === "error" || status === "no-contract") return null;
  const ready = status === "ready" && id !== undefined && mandate && remaining;
  const l = mandate?.limits;
  const spentToday = l && remaining ? l.maxPeriodSpend - remaining.period : 0n;
  const path = id !== undefined ? `/app/m/${id}` : "/app";

  return (
    <div className="owner-frame">
      <div className="owner-chrome" aria-hidden="true">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="owner-url">agentmeter{path}</span>
        <span className="owner-live">
          <i /> live
        </span>
      </div>
      {!ready || !l || !remaining || !mandate ? (
        <div className="owner-body owner-loading">
          <p className="quiet small">Reading the busiest mandate from the chain…</p>
        </div>
      ) : (
        <div className="owner-body">
          <div className="owner-title">
            <span className="mandate-no figure">{id!.toString().padStart(4, "0")}</span>
            <div>
              <h3>{mandateName(net.mandate, id!)}</h3>
              <span className="small quiet">
                Agent <span className="hash">{short(mandate.agent)}</span> · owner <span className="hash">{short(mandate.owner)}</span>
              </span>
            </div>
            <StateMark state={state} />
          </div>

          <div className="owner-panels">
            <div className="meters">
              <Meter name="Today" used={amount(spentToday)} of={amount(l.maxPeriodSpend)} ratio={ratio(spentToday, l.maxPeriodSpend)} />
              <Meter name="In total" used={amount(mandate.totalSpent)} of={amount(l.maxTotalSpend)} ratio={ratio(mandate.totalSpent, l.maxTotalSpend)} />
              <Meter
                name="Paid from escrow"
                used={amount(mandate.totalSpent)}
                of={amount(mandate.totalSpent + remaining.balance)}
                ratio={ratio(mandate.totalSpent, mandate.totalSpent + remaining.balance)}
                left={`${amount(remaining.balance)} tUSD8 left`}
              />
            </div>
            <div className="owner-chart">
              <span className="small quiet">Spending over time</span>
              <SpendChart payments={paid} />
            </div>
          </div>

          <ol className="owner-payments">
            {paid.slice(0, 4).map((p) => (
              <li key={p.paymentId}>
                <span className="owner-pay-icon">{p.responseHash ? <CheckIcon /> : <ClockIcon />}</span>
                <span>
                  Paid <strong>{amount(p.amount)}</strong> tUSD8 to <span className="hash">{short(p.payee)}</span>
                </span>
                <span className="small quiet">{p.responseHash ? "receipt recorded" : "receipt pending"}</span>
                <span className="small quiet">{p.time ? relative(p.time) : ""}</span>
                <TxLink hash={p.txHash} />
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="owner-foot">
        <span className="small quiet">Read-only. Anyone can open any mandate; only its owner can change it.</span>
        <Link className="btn small" href={path}>
          Open the full dashboard
        </Link>
      </div>
    </div>
  );
}
