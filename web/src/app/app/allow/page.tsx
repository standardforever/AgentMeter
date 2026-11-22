"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { isAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { allowedSellers, mandateIdsOwnedBy, useChainEvents } from "@/lib/chainEvents";
import { short } from "@/lib/format";
import { sellerKey, setLabel, useLabels } from "@/lib/labels";
import { useMandate, useSend } from "@/lib/mandate";
import { useNetwork } from "@/lib/network";
import { CheckIcon } from "@/components/Icons";
import { Notice, StateMark, TxStatus } from "@/components/ui";

/** Opened from a seller's share link: the owner picks which of their mandates may pay this seller. */
export default function AllowPage() {
  return (
    <Suspense fallback={<p className="quiet">Loading…</p>}>
      <Allow />
    </Suspense>
  );
}

function Allow() {
  const params = useSearchParams();
  const raw = params.get("seller") ?? "";
  const seller = isAddress(raw) ? (raw as Address) : undefined;
  const { address } = useAccount();
  const { events } = useChainEvents();
  const { sellerName } = useLabels();
  const [name, setName] = useState("");
  const ids = useMemo(() => mandateIdsOwnedBy(events, address), [events, address]);
  const tx = useSend();
  const [busyId, setBusyId] = useState<bigint>();

  if (!seller) {
    return (
      <section className="gate">
        <h1>No seller in this link</h1>
        <p className="lead">The link should end with ?seller= and an address. Ask the seller to copy it again from their Get paid page.</p>
        <Link className="btn" href="/app">
          Your mandates
        </Link>
      </section>
    );
  }

  async function allow(id: bigint) {
    setBusyId(id);
    if (name.trim()) setLabel(sellerKey(seller!), name);
    await tx.mandateCall("setPayee", [id, seller!, true]);
    setBusyId(undefined);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Allow a seller</h1>
          <p className="lead">Choose which of your mandates may pay this seller. Your limits still apply to every payment.</p>
        </div>
      </div>

      <section className="panel allow-seller">
        <div className="allow-who">
          <span className="field-label">Seller</span>
          <span className="hash">{seller}</span>
          {sellerName(seller) && <span className="small quiet">Saved as {sellerName(seller)}</span>}
        </div>
        {!sellerName(seller) && (
          <label className="field">
            <span className="field-label">Name (optional)</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Price API" maxLength={40} />
            <span className="field-hint">Saved in this browser only.</span>
          </label>
        )}
        <Notice>Only allow sellers you trust to charge fairly. Each payment is still capped by the mandate&apos;s per-call, daily and total limits.</Notice>
      </section>

      {ids.length === 0 ? (
        <div className="panel empty-state" style={{ marginTop: 28 }}>
          <h2>You have no mandates yet</h2>
          <p>Create one with this seller already on its allowed list.</p>
          <Link className="btn" href={`/app/new?seller=${seller}`}>
            Create a mandate for this seller
          </Link>
        </div>
      ) : (
        <ul className="mandate-list" style={{ marginTop: 28 }}>
          {ids.map((id) => (
            <AllowRow key={id.toString()} id={id} seller={seller} busy={tx.busy} working={busyId === id && tx.busy} onAllow={() => allow(id)} />
          ))}
        </ul>
      )}
      <div style={{ marginTop: 16 }}>
        <TxStatus phase={tx.phase} error={tx.error} hash={tx.hash} doneText="Seller allowed. Agents on that mandate can pay them now." />
      </div>
    </>
  );
}

function AllowRow({ id, seller, busy, working, onAllow }: { id: bigint; seller: Address; busy: boolean; working: boolean; onAllow: () => void }) {
  const { net } = useNetwork();
  const { events } = useChainEvents();
  const { mandateName } = useLabels();
  const { mandate, state } = useMandate(id);
  const allowed = useMemo(() => allowedSellers(events, id).some((s) => s.address.toLowerCase() === seller.toLowerCase()), [events, id, seller]);
  const isAgent = mandate?.agent.toLowerCase() === seller.toLowerCase();

  return (
    <li>
      <div className="allow-row">
        <span className="mandate-no figure">{id.toString().padStart(4, "0")}</span>
        <span className="mandate-main">
          <Link className="mandate-name" href={`/app/m/${id}`}>
            {mandateName(net.mandate, id)}
          </Link>
          <StateMark state={state} />
        </span>
        <span className="allow-action">
          {allowed ? (
            <span className="status good">
              <CheckIcon /> Already allowed
            </span>
          ) : isAgent ? (
            <span className="small field-error">This is the mandate&apos;s own agent ({short(seller)}), not a seller.</span>
          ) : state === "active" ? (
            <button type="button" className="btn small" disabled={busy} onClick={onAllow}>
              {working ? "Allowing…" : "Allow this seller"}
            </button>
          ) : (
            <span className="small quiet">Not active</span>
          )}
        </span>
      </div>
    </li>
  );
}
