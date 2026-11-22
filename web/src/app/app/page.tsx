"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { allowedSellers, mandateIdsOwnedBy, payments, useChainEvents } from "@/lib/chainEvents";
import { amount, ratio } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useMandate } from "@/lib/mandate";
import { useNetwork } from "@/lib/network";
import { Notice, StateMark } from "@/components/ui";
import { useTestWallet } from "@/components/WalletButton";

export default function MandatesPage() {
  const { address } = useAccount();
  const testWallet = useTestWallet();
  const { events } = useChainEvents();
  const ids = useMemo(() => mandateIdsOwnedBy(events, address), [events, address]);
  const revoked = useMemo(() => new Set(events.filter((e) => e.eventName === "MandateRevoked").map((e) => String((e.args as { mandateId: bigint }).mandateId))), [events]);
  const ordered = useMemo(() => [...ids].sort((a, b) => Number(revoked.has(String(a))) - Number(revoked.has(String(b)))), [ids, revoked]);
  const paid = useMemo(() => payments(events).filter((p) => ids.includes(p.mandateId)), [events, ids]);
  const spentTotal = paid.reduce((s, p) => s + p.amount, 0n);
  const today = Date.now() / 1000 - 86400;
  const last24 = paid.filter((p) => (p.time ?? 0) >= today);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Your mandates</h1>
          <p className="lead">Each mandate is a budget one AI agent can spend, only with the sellers you allow.</p>
        </div>
        <Link className="btn" href="/app/new">
          New mandate
        </Link>
      </div>

      {ids.length > 0 && (
        <dl className="kpis">
          <div>
            <dt>Mandates</dt>
            <dd className="figure">{ids.length}</dd>
          </div>
          <div>
            <dt>Payments, last 24 hours</dt>
            <dd className="figure">{last24.length}</dd>
          </div>
          <div>
            <dt>Spent, last 24 hours</dt>
            <dd className="figure">
              {amount(last24.reduce((s, p) => s + p.amount, 0n))} <span className="unit">tUSD8</span>
            </dd>
          </div>
          <div>
            <dt>Spent in total</dt>
            <dd className="figure">
              {amount(spentTotal)} <span className="unit">tUSD8</span>
            </dd>
          </div>
        </dl>
      )}

      {ids.length === 0 ? (
        <div className="panel empty-state">
          <h2>No mandates yet</h2>
          <p>Create one to give an AI agent a budget: who it may pay, how much per call, per day and in total.</p>
          {testWallet.suggest && (
            <Notice>
              Looking for the sample mandates? They belong to the local test wallet.{" "}
              <button type="button" className="linklike" onClick={() => void testWallet.use()}>
                Switch to the local test wallet
              </button>
            </Notice>
          )}
          <Link className="btn" href="/app/new">
            Create your first mandate
          </Link>
        </div>
      ) : (
        <ul className="mandate-list">
          {ordered.map((id) => (
            <MandateRow key={id.toString()} id={id} />
          ))}
        </ul>
      )}
    </>
  );
}

function MandateRow({ id }: { id: bigint }) {
  const { net } = useNetwork();
  const { mandate, remaining, state } = useMandate(id);
  const { events } = useChainEvents();
  const { mandateName } = useLabels();
  const count = useMemo(() => payments(events, id).length, [events, id]);
  const sellers = useMemo(() => allowedSellers(events, id).length, [events, id]);
  const dayLimit = mandate?.limits.maxPeriodSpend ?? 0n;
  const spentToday = remaining ? dayLimit - remaining.period : 0n;

  return (
    <li>
      <Link href={`/app/m/${id}`} className={`mandate-row ${state ?? ""}`}>
        <span className="mandate-no figure">{id.toString().padStart(4, "0")}</span>
        <span className="mandate-main">
          <span className="mandate-name">{mandateName(net.mandate, id)}</span>
          <StateMark state={state} />
        </span>
        <span className="mandate-meter">
          <span className="dim">Today</span>
          <span className="meter-track" aria-hidden="true">
            <span className="meter-fill" style={{ width: `${ratio(spentToday, dayLimit) * 100}%` }} />
          </span>
          <span className="small">
            {amount(spentToday)} of {amount(dayLimit)}
          </span>
        </span>
        <span className="mandate-fig">
          <span className="dim">In escrow</span>
          <span className="figure">{amount(remaining?.balance)}</span>
        </span>
        <span className="mandate-fig">
          <span className="dim">Payments</span>
          <span className="figure">{count}</span>
        </span>
        <span className="mandate-fig">
          <span className="dim">Sellers</span>
          <span className="figure">{sellers}</span>
        </span>
      </Link>
    </li>
  );
}
