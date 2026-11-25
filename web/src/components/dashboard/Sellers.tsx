"use client";

import { useState } from "react";
import { isAddress, type Address } from "viem";
import { relative, short } from "@/lib/format";
import { sellerKey, setLabel, useLabels } from "@/lib/labels";
import { useSend } from "@/lib/mandate";
import { TxStatus } from "../ui";

/** The allowlist: the only addresses this mandate's agent can ever pay. */
export function Sellers({ id, sellers, agent, canEdit }: { id: bigint; sellers: { address: Address; since?: number }[]; agent?: Address; canEdit: boolean }) {
  const { sellerName } = useLabels();
  const tx = useSend();
  const [addr, setAddr] = useState("");
  const [name, setName] = useState("");
  const [busyAddr, setBusyAddr] = useState<string>();
  const valid = isAddress(addr.trim());
  const already = valid && sellers.some((s) => s.address.toLowerCase() === addr.trim().toLowerCase());
  const isAgent = valid && agent?.toLowerCase() === addr.trim().toLowerCase();

  async function add() {
    const a = addr.trim() as Address;
    setBusyAddr(a);
    if (name.trim()) setLabel(sellerKey(a), name);
    const ok = await tx.mandateCall("setPayee", [id, a, true]);
    if (ok) {
      setAddr("");
      setName("");
    }
    setBusyAddr(undefined);
  }

  async function remove(a: Address) {
    setBusyAddr(a);
    await tx.mandateCall("setPayee", [id, a, false]);
    setBusyAddr(undefined);
  }

  return (
    <section className="panel" aria-labelledby="sellers-title">
      <div className="panel-head">
        <h2 id="sellers-title">Allowed sellers</h2>
        <span className="small quiet">{sellers.length === 1 ? "1 seller" : `${sellers.length} sellers`}</span>
      </div>
      <p className="small quiet" style={{ marginBottom: 14 }}>
        Your agent can only pay these addresses. A payment to anyone else is refused, even if the agent is tricked into signing it.
      </p>
      {sellers.length === 0 ? (
        <p className="small">No sellers allowed: every payment will be refused until you add one.</p>
      ) : (
        <ul className="seller-list">
          {sellers.map((s) => (
            <li key={s.address}>
              <span>
                <span className="seller-name">{sellerName(s.address) ?? `Seller ${short(s.address)}`}</span>
                <span className="seller-addr hash">{s.address}</span>
                {s.since && <span className="seller-addr">Allowed {relative(s.since)}</span>}
              </span>
              {canEdit && (
                <button type="button" className="btn small danger quiet" disabled={tx.busy} onClick={() => remove(s.address)}>
                  {busyAddr === s.address && tx.busy ? "Removing" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="add-seller"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !already && !isAgent) void add();
          }}
        >
          <label className="field">
            <span className="field-label">Address</span>
            <input type="text" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" aria-invalid={addr !== "" && (!valid || already || isAgent)} spellCheck={false} />
          </label>
          <label className="field">
            <span className="field-label">Name (optional)</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Price API" />
          </label>
          <button type="submit" className="btn" disabled={!valid || already || isAgent || tx.busy}>
            Allow seller
          </button>
          <span className="field-hint" style={{ gridColumn: "1 / -1" }}>Names are saved in this browser only.</span>
          {addr !== "" && !valid && <span className="field-error">That isn&apos;t a valid address.</span>}
          {already && <span className="field-error">This seller is already allowed.</span>}
          {isAgent && (
            <span className="field-error">That&apos;s this mandate&apos;s agent. A seller must be a different address: an agent paying itself could move money out freely.</span>
          )}
        </form>
      )}
      <div style={{ marginTop: 12 }}>
        <TxStatus phase={tx.phase} error={tx.error} hash={tx.hash} doneText="Allowed sellers updated." />
      </div>
    </section>
  );
}
