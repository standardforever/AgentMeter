"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { isAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { isRevokedEvent, knownSellers, mandatesAllowing, paymentsTo, useChainEvents } from "@/lib/chainEvents";
import { facilitatorUrl } from "@/lib/env";
import { amount, relative, short } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import { useSellerFeed } from "@/lib/mandate";
import { useNetwork } from "@/lib/network";
import { Activity } from "@/components/dashboard/Activity";
import { SpendChart } from "@/components/dashboard/SpendChart";
import { CopyButton, Notice } from "@/components/ui";

export default function SellerPage() {
  return (
    <Suspense fallback={<p className="quiet">Loading…</p>}>
      <SellerView />
    </Suspense>
  );
}

function SellerView() {
  const router = useRouter();
  const params = useSearchParams();
  const { address: connected } = useAccount();
  const { net } = useNetwork();
  const { events } = useChainEvents();
  const { mandateName } = useLabels();

  // The seller is the address that gets paid. It is often a server's key rather than the wallet in
  // this browser, so any address can be looked up: payments on a blockchain are public anyway.
  const asked = params.get("address");
  const seller = (asked && isAddress(asked) ? asked : connected) as Address | undefined;
  const isYou = Boolean(seller && connected && seller.toLowerCase() === connected.toLowerCase());
  const [draft, setDraft] = useState(seller ?? "");
  useEffect(() => setDraft(seller ?? ""), [seller]);
  const view = (a: string) => router.replace(a.toLowerCase() === connected?.toLowerCase() ? "/app/seller" : `/app/seller?address=${a}`);

  const paid = useMemo(() => paymentsTo(events, seller), [events, seller]);
  const allowing = useMemo(
    () =>
      mandatesAllowing(events, seller)
        .map((m) => ({ ...m, revoked: isRevokedEvent(events, m.mandateId) !== undefined }))
        .sort((a, b) => Number(a.revoked) - Number(b.revoked)),
    [events, seller],
  );
  const canPay = allowing.filter((m) => !m.revoked).length;
  const picks = useMemo(() => knownSellers(events).filter((k) => k.address.toLowerCase() !== seller?.toLowerCase()).slice(0, 4), [events, seller]);
  const feed = useSellerFeed(seller);

  const total = paid.reduce((s, p) => s + p.amount, 0n);
  const dayAgo = Date.now() / 1000 - 86400;
  const today = paid.filter((p) => (p.time ?? 0) >= dayAgo);
  const withReceipt = paid.filter((p) => p.responseHash).length;
  const pending = paid.length - withReceipt;
  const byMandate = useMemo(() => {
    const m = new Map<string, bigint>();
    for (const p of paid) m.set(p.mandateId.toString(), (m.get(p.mandateId.toString()) ?? 0n) + p.amount);
    return m;
  }, [paid]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const allowLink = seller ? `${origin}/app/allow?seller=${seller}` : "";
  const rpc = net.chain.rpcUrls.default.http[0];
  const sellerEnv = `RPC_URL=${rpc}
MANDATE_ADDRESS=${net.mandate}
FACILITATOR_URL=${facilitatorUrl ?? "http://localhost:4021"}
SELLER_KEY=<the key of ${seller ? short(seller) : "your seller address"}>`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Get paid</h1>
          <p className="lead">Sell your API to AI agents and get paid per request in tUSD8. See what you&apos;ve earned and which agents can pay you.</p>
        </div>
      </div>

      <form
        className="seller-pick"
        onSubmit={(e) => {
          e.preventDefault();
          if (isAddress(draft.trim())) view(draft.trim());
        }}
      >
        <label className="field">
          <span className="field-label">Seller address</span>
          <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0x…" spellCheck={false} aria-invalid={draft !== "" && !isAddress(draft.trim())} />
          <span className="field-hint">
            {isYou ? "Your connected wallet. " : seller ? "Not your connected wallet: you're viewing it, not acting as it. " : ""}
            The address agents pay, usually your API server&apos;s key.
          </span>
        </label>
        <button type="submit" className="btn quiet" disabled={!isAddress(draft.trim()) || draft.trim().toLowerCase() === seller?.toLowerCase()}>
          View
        </button>
        {connected && !isYou && (
          <button type="button" className="linklike small" onClick={() => view(connected)}>
            Back to my wallet
          </button>
        )}
      </form>
      {picks.length > 0 && (
        <p className="pick-list small">
          <span className="quiet">Sellers on this contract:</span>
          {picks.map((k) => (
            <button key={k.address} type="button" className="chip" onClick={() => view(k.address)}>
              <span className="hash">{short(k.address)}</span> {k.paid} {k.paid === 1 ? "payment" : "payments"}
            </button>
          ))}
        </p>
      )}

      <dl className="kpis">
        <div>
          <dt>Earned in total</dt>
          <dd className="figure">
            {amount(total)} <span className="unit">tUSD8</span>
          </dd>
        </div>
        <div>
          <dt>Earned, last 24 hours</dt>
          <dd className="figure">
            {amount(today.reduce((s, p) => s + p.amount, 0n))} <span className="unit">tUSD8</span>
          </dd>
        </div>
        <div>
          <dt>Paid requests</dt>
          <dd className="figure">{paid.length}</dd>
        </div>
        <div>
          <dt>Answers with a receipt</dt>
          <dd className="figure">
            {withReceipt} <span className="unit">of {paid.length}</span>
          </dd>
        </div>
      </dl>

      {pending > 0 && (
        <Notice tone="warn">
          {pending === 1 ? "1 answer has" : `${pending} answers have`} no receipt yet, so buyers can&apos;t check {pending === 1 ? "it" : "them"}. Your server
          records receipts on its own after each paid answer: check that it&apos;s running and its key has a little tQDAY for gas.
        </Notice>
      )}

      <div className="mandate-grid">
        <section className="panel" aria-labelledby="allowing-title">
          <div className="panel-head">
            <h2 id="allowing-title">Who can pay you</h2>
            <span className="small quiet">{canPay === 1 ? "1 active mandate" : `${canPay} active mandates`}</span>
          </div>
          {allowing.length === 0 ? (
            <p className="small">
              No mandate allows this address yet, so no agent can pay it. Send an agent&apos;s owner your link below: it opens a page where they can allow
              you in one step.
            </p>
          ) : (
            <ul className="seller-list">
              {allowing.map((m) => (
                <li key={m.mandateId.toString()}>
                  <span>
                    <Link className="seller-name" href={`/app/m/${m.mandateId}`}>
                      {mandateName(net.mandate, m.mandateId)}
                    </Link>
                    <span className="seller-addr">
                      {m.revoked ? "Revoked: can no longer pay you" : m.since ? `Allowed you ${relative(m.since)}` : "Allows you"}
                    </span>
                  </span>
                  <span className="figure small">{amount(byMandate.get(m.mandateId.toString()) ?? 0n)} tUSD8</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel" aria-labelledby="earn-title">
          <div className="panel-head">
            <h2 id="earn-title">Earnings over time</h2>
            <span className="small quiet">
              {paid.length} {paid.length === 1 ? "payment" : "payments"}, {amount(total)} tUSD8
            </span>
          </div>
          <SpendChart payments={paid} what="earnings" />
        </section>
      </div>

      <div className="full">
        <Activity paid={paid} feed={feed.data?.items ?? []} feedOnline={feed.data?.online ?? false} view="seller" />
      </div>

      <div className="mandate-grid">
        <section className="panel" aria-labelledby="share-title">
          <div className="panel-head">
            <h2 id="share-title">Ask an owner to allow you</h2>
          </div>
          <p className="small" style={{ color: "var(--ink-2)" }}>
            An agent can only pay sellers its owner has allowed. Send this link to the owner: it opens their dashboard with your address filled in,
            and they choose which of their mandates may pay you.
          </p>
          <div className="share-link">
            <code className="hash">{allowLink || "Choose a seller address first"}</code>
            {allowLink && <CopyButton value={allowLink} label="Copy link" />}
          </div>
        </section>
        <section className="panel" aria-labelledby="setup-title">
          <div className="panel-head">
            <h2 id="setup-title">Charge for your API</h2>
          </div>
          <ol className="setup-steps small">
            <li>
              Put a price on each route you want paid. Your handler only runs after the payment settles on-chain.
              <pre className="env-block">{`app.get("/v1/price",
  paywall(config, { price: "0.01", description: "BTC price" }),
  (req, res) => sendPaid(res, { pair: "BTC-USD", price: 97012.5 }),
);`}</pre>
            </li>
            <li>
              Give your server these settings. Its key is the address agents pay, and it records a receipt for every answer.
              <pre className="env-block">{sellerEnv}</pre>
            </li>
            <li>
              Start it with <code>pnpm --filter server seller</code>, then send owners your link.
            </li>
          </ol>
        </section>
      </div>
    </>
  );
}
