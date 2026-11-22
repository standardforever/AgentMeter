"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { allowedSellers, payments, useChainEvents } from "@/lib/chainEvents";
import { amount, dateTime, duration, ratio, short } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useFeed, useMandate } from "@/lib/mandate";
import { useNetwork } from "@/lib/network";
import { Cheque } from "@/components/Cheque";
import { Actions } from "@/components/dashboard/Actions";
import { Activity } from "@/components/dashboard/Activity";
import { Sellers } from "@/components/dashboard/Sellers";
import { SpendChart } from "@/components/dashboard/SpendChart";
import { Meter, Notice, StateMark } from "@/components/ui";

export default function MandatePage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id ?? "") ? BigInt(params.id) : undefined;
  const { net } = useNetwork();
  const { address } = useAccount();
  const { events } = useChainEvents();
  const { mandateName } = useLabels();
  const { mandate, remaining, state } = useMandate(id);
  const feed = useFeed(id);

  const paid = useMemo(() => (id === undefined ? [] : payments(events, id)), [events, id]);
  const sellers = useMemo(() => (id === undefined ? [] : allowedSellers(events, id)), [events, id]);

  if (id === undefined || state === "missing") {
    return (
      <section className="gate">
        <h1>No mandate {params.id}</h1>
        <p className="lead">It doesn&apos;t exist on {net.label}. Check the number, or go back to your mandates.</p>
        <Link className="btn" href="/app">
          Your mandates
        </Link>
      </section>
    );
  }
  if (!mandate || !remaining) return <p className="quiet">Loading mandate {id.toString()}…</p>;

  const isOwner = address?.toLowerCase() === mandate.owner.toLowerCase();
  const l = mandate.limits;
  const now = Date.now() / 1000;
  const spentToday = l.maxPeriodSpend - remaining.period;
  const start = Number(mandate.periodStart);
  const period = Number(l.period);
  const nextReset = start + period * (Math.floor((now - start) / period) + 1);
  const name = mandateName(net.mandate, id);
  const tooLow = remaining.balance < l.maxSinglePayment;
  const stamp = state === "revoked" ? { text: "REVOKED", detail: "Agent can no longer pay" } : state === "expired" ? { text: "EXPIRED", detail: "Past its end date" } : null;

  return (
    <>
      <div className="crumbs">
        <Link href="/app">Mandates</Link> / {id.toString().padStart(4, "0")}
      </div>
      <h1 className="visually-hidden">{name}</h1>

      <div className="mandate-top">
        <Cheque
          number={id.toString()}
          title={name}
          status={<StateMark state={state} />}
          agent={short(mandate.agent)}
          sellers={sellers.length}
          perCall={amount(l.maxSinglePayment)}
          perDay={amount(l.maxPeriodSpend)}
          total={amount(l.maxTotalSpend)}
          escrow={amount(remaining.balance)}
          owner={isOwner ? "You" : short(mandate.owner)}
          expires={dateTime(Number(l.expiresAt))}
          stamp={stamp}
        />
        {isOwner ? (
          <Actions id={id} limits={l} balance={remaining.balance} agent={mandate.agent} revoked={state === "revoked"} sellers={sellers.map((s) => s.address)} />
        ) : (
          <Notice>
            Owned by <span className="hash">{short(mandate.owner)}</span>. Only the owner can change it.
          </Notice>
        )}
      </div>

      <div className="mandate-grid">
        <section className="panel" aria-labelledby="budget-title">
          <div className="panel-head">
            <h2 id="budget-title">Budget</h2>
          </div>
          <div className="meters">
            <Meter
              name="Today"
              hint={state === "active" ? `Resets in ${duration(nextReset - now)}` : undefined}
              used={amount(spentToday)}
              of={amount(l.maxPeriodSpend)}
              ratio={ratio(spentToday, l.maxPeriodSpend)}
              left={`${amount(l.maxPeriodSpend - spentToday)} left today`}
              label={spentToday >= l.maxPeriodSpend ? "Used up: refusing until it resets" : undefined}
            />
            <Meter
              name="In total"
              hint={`Ends ${dateTime(Number(l.expiresAt))}`}
              used={amount(mandate.totalSpent)}
              of={amount(l.maxTotalSpend)}
              ratio={ratio(mandate.totalSpent, l.maxTotalSpend)}
              left={`${amount(l.maxTotalSpend - mandate.totalSpent)} left`}
              label={mandate.totalSpent >= l.maxTotalSpend ? "Used up" : undefined}
            />
            <Meter
              name="Escrow"
              hint="Paid to sellers so far"
              used={amount(mandate.totalSpent)}
              of={amount(mandate.totalSpent + remaining.balance)}
              ratio={tooLow ? 1 : ratio(mandate.totalSpent, mandate.totalSpent + remaining.balance)}
              left={`${amount(remaining.balance)} tUSD8 left`}
              label={tooLow ? "Too low for another payment: top up" : undefined}
            />
          </div>
        </section>
        <section className="panel" aria-labelledby="spend-title">
          <div className="panel-head">
            <h2 id="spend-title">Spending over time</h2>
            <span className="small quiet">
              {paid.length} {paid.length === 1 ? "payment" : "payments"}, {amount(mandate.totalSpent)} tUSD8
            </span>
          </div>
          <SpendChart payments={paid} />
        </section>
      </div>

      <div className="full">
        <Activity paid={paid} feed={feed.data?.items ?? []} feedOnline={feed.data?.online ?? false} />
      </div>

      <div className="mandate-grid">
        <Sellers id={id} sellers={sellers} agent={mandate.agent} canEdit={isOwner && state !== "revoked"} />
        <section className="panel" aria-labelledby="connect-title">
          <div className="panel-head">
            <h2 id="connect-title">Point an agent at this mandate</h2>
          </div>
          <p className="small" style={{ color: "var(--ink-2)" }}>
            Give your agent these settings. Its key only signs payments: it never holds tUSD8 and never pays gas, so a leaked key can spend
            only what this mandate allows, and you can change the agent above at any time.
          </p>
          <pre className="env-block">{`RPC_URL=${net.chain.rpcUrls.default.http[0]}
MANDATE_ADDRESS=${net.mandate}
MANDATE_ID=${id.toString()}
AGENT_KEY=<the key of ${short(mandate.agent)}>`}</pre>
          <p className="small quiet" style={{ marginTop: 10 }}>
            Then: <code>pnpm --filter server agent -- --question &quot;How is bitcoin doing?&quot;</code>
          </p>
        </section>
      </div>
    </>
  );
}
