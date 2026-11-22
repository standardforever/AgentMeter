"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cheque } from "../Cheque";
import { CheckIcon, ClockIcon, StopIcon } from "../Icons";

type RowState = "hidden" | "asked" | "signed" | "paid" | "refused";

interface Row {
  path: string;
  host: string;
  price: number;
  end: "paid" | "refused";
  note?: string;
}

const ROWS: Row[] = [
  { path: "GET /v1/price?pair=BTC-USD", host: "Price API", price: 0.01, end: "paid" },
  { path: "GET /v1/news?topic=bitcoin", host: "Price API", price: 0.02, end: "paid" },
  { path: "POST /v1/summarize", host: "Price API", price: 0.03, end: "paid" },
  {
    path: "GET /v1/premium?topic=bitcoin",
    host: "unknown seller 0x…bad1",
    price: 0.05,
    end: "refused",
    note: "A news headline told the agent to fetch this and pay.",
  },
];

const STEP_MS = 650;

/** Builds the replay: each row goes asked -> signed -> paid/refused, one row after another. */
function timeline() {
  const t: { at: number; row: number; state: RowState }[] = [];
  let at = 500;
  ROWS.forEach((r, row) => {
    t.push({ at, row, state: "asked" });
    t.push({ at: (at += STEP_MS), row, state: "signed" });
    t.push({ at: (at += STEP_MS), row, state: r.end });
    at += r.end === "refused" ? 0 : STEP_MS * 0.8;
  });
  return t;
}

const FINAL: RowState[] = ROWS.map((r) => r.end);

export function HeroReplay() {
  const [states, setStates] = useState<RowState[]>(FINAL);
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const play = useCallback(() => {
    timers.current.forEach(clearTimeout);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setStates(FINAL);
      return;
    }
    setStates(ROWS.map(() => "hidden"));
    setRunning(true);
    const steps = timeline();
    timers.current = steps.map((s) =>
      setTimeout(() => setStates((prev) => prev.map((v, i) => (i === s.row ? s.state : v))), s.at),
    );
    timers.current.push(setTimeout(() => setRunning(false), steps[steps.length - 1].at + 400));
  }, []);

  useEffect(() => {
    play();
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, [play]);

  const spent = ROWS.reduce((sum, r, i) => sum + (states[i] === "paid" ? r.price : 0), 0);
  const refused = states[3] === "refused";

  return (
    <div className="replay" aria-label="Replay: an AI agent paying for four API calls">
      <Cheque
        number={1}
        title="Research agent"
        agent="0x7402…D425"
        sellers={1}
        perCall="0.05"
        perDay="1.00"
        total="3.00"
        escrow={(5 - spent).toFixed(2)}
        owner="you.eth"
        expires="Dec 21, 2026"
        stamp={refused ? { text: "REFUSED", detail: "Seller not allowed" } : null}
        className={refused ? "stamped" : ""}
      >
        <div className="meter-row mini">
          <div className="meter-name">Spent today</div>
          <div className="meter-track" aria-hidden="true">
            <div className="meter-fill" style={{ width: `${(spent / 1) * 100}%` }} />
          </div>
          <div className="meter-figure">
            <strong>{spent.toFixed(2)}</strong> <span className="quiet">of 1.00</span>
          </div>
        </div>
      </Cheque>

      <div className="replay-log">
        <div className="replay-log-head">
          <span>The agent&apos;s requests</span>
          <button type="button" className="linklike small" onClick={play} disabled={running}>
            Replay
          </button>
        </div>
        <ol>
          {ROWS.map((r, i) => {
            const s = states[i];
            return (
              <li key={r.path} className={`replay-row ${s}`} aria-hidden={s === "hidden"}>
                <span className="replay-icon">
                  {s === "paid" ? <CheckIcon /> : s === "refused" ? <StopIcon /> : <ClockIcon />}
                </span>
                <span className="replay-req">
                  <code>{r.path}</code>
                  <span className="quiet small">{r.note ?? r.host}</span>
                </span>
                <span className="replay-state">
                  {s === "asked" && <>402: pay {r.price.toFixed(2)}</>}
                  {s === "signed" && <>Agent signed</>}
                  {s === "paid" && <>Paid {r.price.toFixed(2)}</>}
                  {s === "refused" && <>Refused</>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
