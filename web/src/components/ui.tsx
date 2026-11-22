"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import { txUrl } from "@aevum-kit/aevum";
import { short } from "@/lib/format";
import type { MandateState } from "@/lib/mandate";
import { useNetwork } from "@/lib/network";
import { CheckIcon, ClockIcon, DotIcon, ExternalIcon, StopIcon, WarnIcon } from "./Icons";

/** State of a mandate as icon + words (never color alone). */
export function StateMark({ state }: { state: MandateState | undefined }) {
  if (state === "active")
    return (
      <span className="status good">
        <DotIcon /> Active
      </span>
    );
  if (state === "revoked")
    return (
      <span className="status bad">
        <StopIcon /> Revoked
      </span>
    );
  if (state === "expired")
    return (
      <span className="status warn">
        <ClockIcon /> Expired
      </span>
    );
  return <span className="status idle">Loading</span>;
}

export function Paid() {
  return (
    <span className="status good">
      <CheckIcon /> Paid
    </span>
  );
}

export function Refused({ children }: { children?: ReactNode }) {
  return (
    <span className="status bad">
      <StopIcon /> {children ?? "Refused"}
    </span>
  );
}

export function Notice({ tone = "idle", children }: { tone?: "idle" | "good" | "warn" | "bad"; children: ReactNode }) {
  const Icon = tone === "good" ? CheckIcon : tone === "bad" ? StopIcon : tone === "warn" ? WarnIcon : ClockIcon;
  return (
    <div className={`notice ${tone === "idle" ? "" : tone}`} role={tone === "bad" ? "alert" : "status"}>
      <Icon />
      <div>{children}</div>
    </div>
  );
}

/** One row of a meter list: name, bar, figure. Severity shifts at 75% and 100%. */
export function Meter({ name, hint, used, of, ratio, label }: { name: string; hint?: string; used: string; of: string; ratio: number; label?: string }) {
  const tone = ratio >= 1 ? "bad" : ratio >= 0.75 ? "warn" : "";
  return (
    <div className={`meter-row ${tone}`}>
      <div className="meter-name">
        {name}
        {hint && <small>{hint}</small>}
      </div>
      <div className="meter-track" role="meter" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
        <div className="meter-fill" style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 1.5 : 0)}%` }} />
      </div>
      <div className="meter-figure">
        <strong>{used}</strong> <span className="quiet">of {of}</span>
        {label && (
          <div className="small" style={{ color: tone === "bad" ? "var(--stamp)" : tone === "warn" ? "var(--warn)" : "var(--ink-3)" }}>
            {tone === "bad" ? <StopIcon className="inline-icon" /> : tone === "warn" ? <WarnIcon className="inline-icon" /> : null} {label}
          </div>
        )}
      </div>
    </div>
  );
}

/** A transaction hash: explorer link on the testnet, plain text on a local chain. */
export function TxLink({ hash }: { hash: Hex | string }) {
  const { net } = useNetwork();
  if (!net.hasExplorer) return <span className="hash" title={hash}>{short(hash, 8, 6)}</span>;
  return (
    <a className="hash" href={txUrl(hash)} target="_blank" rel="noreferrer" title="Open in the QDay explorer">
      {short(hash, 8, 6)} <ExternalIcon className="inline-icon" />
    </a>
  );
}

/** Where a transaction is: waiting for the wallet, being mined, done, or failed with a reason. */
export function TxStatus({ phase, error, hash, doneText }: { phase: string; error?: string; hash?: Hex; doneText: string }) {
  if (phase === "wallet") return <Notice>Confirm in your wallet.</Notice>;
  if (phase === "mining")
    return (
      <Notice>
        Sent. Waiting for it to be included{hash ? <> (<TxLink hash={hash} />)</> : null}.
      </Notice>
    );
  if (phase === "done")
    return (
      <Notice tone="good">
        {doneText} {hash && <TxLink hash={hash} />}
      </Notice>
    );
  if (phase === "error" && error) return <Notice tone="bad">{error}</Notice>;
  return null;
}

/** An accessible dialog: focus moves in, Escape closes, focus returns to what opened it. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, button, textarea")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Copy a value, with a short confirmation in the button itself. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn small quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          // Clipboard blocked: the value is on screen to copy by hand.
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
