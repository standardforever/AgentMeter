import type { ReactNode } from "react";
import { Guilloche } from "./Guilloche";

export interface ChequeProps {
  number: string | number;
  title: string;
  /** Status mark on the right of the title (icon + words). */
  status?: ReactNode;
  agent: string;
  perCall: string;
  perDay: string;
  total: string;
  escrow: string;
  owner: string;
  expires: string;
  sellers: number;
  stamp?: { text: string; detail?: string } | null;
  children?: ReactNode;
  className?: string;
}

/** A mandate drawn as a cheque: the agent may write payments against it, within these terms. */
export function Cheque(p: ChequeProps) {
  const no = /^\d+$/.test(String(p.number)) ? String(p.number).padStart(4, "0") : String(p.number);
  return (
    <article className={`cheque ${p.className ?? ""}`} aria-label={`Mandate ${p.number}: ${p.title}`}>
      <Guilloche className="cheque-pattern" seed={Number(p.number) || 1} />
      <div className="cheque-stub">
        <div>
          <div className="dim">Mandate</div>
          <div className="no">{no}</div>
        </div>
        <div>
          <div className="dim">In escrow</div>
          <div className="figure" style={{ fontSize: "1.6rem" }}>
            {p.escrow}
          </div>
          <div className="dim">tUSD8</div>
        </div>
      </div>
      <div className="cheque-body">
        <div className="cheque-head">
          <div className="cheque-title">{p.title}</div>
          {!p.stamp && p.status}
        </div>
        <p className="small" style={{ color: "var(--ink-2)" }}>
          Agent <span className="hash">{p.agent}</span> may pay {p.sellers === 1 ? "the 1 allowed seller" : `any of the ${p.sellers} allowed sellers`}, up to:
        </p>
        <div className="cheque-terms">
          <div>
            <div className="dim">Per call</div>
            <div className="figure">{p.perCall}</div>
          </div>
          <div>
            <div className="dim">Per day</div>
            <div className="figure">{p.perDay}</div>
          </div>
          <div>
            <div className="dim">In total</div>
            <div className="figure">{p.total}</div>
          </div>
        </div>
        {p.children}
        <div className="cheque-foot">
          <span>Valid until {p.expires}</span>
          <span className="signature">
            {p.owner}
            <span className="dim" style={{ display: "block", fontFamily: "var(--font-body)", fontWeight: 400 }}>
              Owner
            </span>
          </span>
        </div>
      </div>
      {p.stamp && (
        <div className="stamp cheque-stamp" role="img" aria-label={`${p.stamp.text}${p.stamp.detail ? `: ${p.stamp.detail}` : ""}`}>
          <span style={{ fontSize: "2.4rem" }}>{p.stamp.text}</span>
          {p.stamp.detail && <small>{p.stamp.detail}</small>}
        </div>
      )}
    </article>
  );
}
