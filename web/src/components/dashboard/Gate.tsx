"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { payments, useChainEvents } from "@/lib/chainEvents";
import { amount } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useNetwork } from "@/lib/network";
import { Cheque } from "../Cheque";
import { WalletButton } from "../WalletButton";
import { Notice } from "../ui";

/**
 * Pages anyone can read without a wallet. Everything on a blockchain is public, so a mandate's
 * budget, payments, refusals and receipts can be shown to any visitor; only changing a mandate
 * needs its owner's wallet.
 */
const READ_ONLY = /^\/app\/(m\/|r\/|seller)/;

/** Everything the dashboard needs before it can show anything: a contract, a wallet (for owner pages), the history. */
export function Gate({ children }: { children: ReactNode }) {
  const { net } = useNetwork();
  const { isConnected } = useAccount();
  const { status, progress, error } = useChainEvents();
  const readOnly = READ_ONLY.test(usePathname() ?? "");

  if (!net.mandate) {
    return (
      <section className="gate">
        <h1>No AgentMandate on {net.label} yet</h1>
        <p className="lead">The dashboard needs the address of a deployed AgentMandate contract.</p>
        <ol className="plain-steps">
          <li>
            Deploy it: <code>make deploy-mandate-aevum ACCOUNT=your-keystore</code> (or <code>make local-stack</code> for a local copy).
          </li>
          <li>
            Put the address and its deploy block in <code>web/.env.local</code>: <code>NEXT_PUBLIC_MANDATE_AEVUM</code> and{" "}
            <code>NEXT_PUBLIC_MANDATE_DEPLOY_BLOCK_AEVUM</code>.
          </li>
          <li>Restart the dashboard.</li>
        </ol>
      </section>
    );
  }

  if (!isConnected && !readOnly) {
    return (
      <>
        <section className="gate gate-connect">
          <div className="stack" style={{ ["--gap" as string]: "20px" }}>
            <h1>Connect the wallet that owns your mandates</h1>
            <p className="lead">
              You&apos;ll see each mandate&apos;s budget, every payment your agents made, and every payment the contract refused. Connecting
              doesn&apos;t send anything.
            </p>
            <WalletButton />
          </div>
          <Cheque
            number={0}
            title="Your first mandate"
            agent="0x…"
            sellers={2}
            perCall="0.05"
            perDay="1.00"
            total="3.00"
            escrow="5.00"
            owner="you"
            expires="30 days from today"
            className="gate-cheque"
          />
        </section>
        <LiveMandates />
      </>
    );
  }

  if (status === "error") {
    return (
      <section className="gate">
        <Notice tone="bad">{error} Check that the network is reachable, then reload.</Notice>
      </section>
    );
  }

  if (status === "loading") {
    return (
      <section className="gate" aria-busy="true">
        <h1>Reading the contract&apos;s history</h1>
        <div className="meter-row" style={{ maxWidth: 520 }}>
          <div className="meter-name">Loaded</div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="meter-figure">
            <strong>{Math.round(progress * 100)}%</strong>
          </div>
        </div>
        <p className="quiet small">Every payment, refusal and rule change is read from the chain. This takes a few seconds.</p>
      </section>
    );
  }

  return <>{children}</>;
}

/** No wallet? Every mandate on the contract is public: let visitors open one and look around. */
function LiveMandates() {
  const { net } = useNetwork();
  const { status, events } = useChainEvents();
  const { mandateName } = useLabels();
  const rows = useMemo(() => {
    const revoked = new Set(events.filter((e) => e.eventName === "MandateRevoked").map((e) => String((e.args as { mandateId: bigint }).mandateId)));
    const paid = payments(events);
    return events
      .filter((e) => e.eventName === "MandateCreated")
      .map((e) => (e.args as { mandateId: bigint }).mandateId)
      .reverse()
      .map((id) => {
        const mine = paid.filter((p) => p.mandateId === id);
        return { id, revoked: revoked.has(String(id)), count: mine.length, spent: mine.reduce((s, p) => s + p.amount, 0n) };
      })
      .sort((a, b) => Number(a.revoked) - Number(b.revoked) || b.count - a.count);
  }, [events]);

  return (
    <section className="live-mandates" aria-labelledby="live-mandates-title">
      <div className="panel-head">
        <h2 id="live-mandates-title">Or look around: live mandates on {net.label}</h2>
        <span className="small quiet">Read-only. No wallet needed.</span>
      </div>
      {status !== "ready" ? (
        <p className="quiet small">Loading mandates from the chain…</p>
      ) : rows.length === 0 ? (
        <p className="quiet small">No mandates on this contract yet.</p>
      ) : (
        <ul className="live-mandate-list">
          {rows.slice(0, 6).map((r) => (
            <li key={r.id.toString()}>
              <Link href={`/app/m/${r.id}`} className={`live-mandate${r.revoked ? " revoked" : ""}`}>
                <span className="mandate-no figure">{r.id.toString().padStart(4, "0")}</span>
                <span className="live-mandate-name">
                  {mandateName(net.mandate, r.id)}
                  {r.revoked && <span className="status bad">Revoked</span>}
                </span>
                <span className="small quiet">
                  {r.count} {r.count === 1 ? "payment" : "payments"} · {amount(r.spent)} tUSD8
                </span>
                <span className="live-mandate-go" aria-hidden="true">
                  View →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
