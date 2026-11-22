"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PaidPayment } from "@/lib/chainEvents";
import { amount, clock, dateTime } from "@/lib/format";

/**
 * Cumulative spend over time: one series, so no legend (the panel title names it).
 * A step line, because spend jumps at each payment and stays flat in between.
 */
export function SpendChart({ payments, what = "spend" }: { payments: PaidPayment[]; what?: "spend" | "earnings" }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the container's real width, so axis text stays readable on a phone instead of shrinking.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const points = useMemo(() => {
    const sorted = [...payments].filter((p) => p.time).sort((a, b) => a.time! - b.time!);
    let total = 0n;
    return sorted.map((p) => ({ t: p.time!, total: (total += p.amount), p }));
  }, [payments]);

  if (points.length < 2) {
    return (
      <div ref={box}>
        <p className="quiet small">{what === "spend" ? "The chart appears after the agent's second payment." : "The chart appears after your second payment."}</p>
      </div>
    );
  }

  const W = width;
  const H = width < 480 ? 200 : 220;
  const pad = { l: 44, r: 16, t: 12, b: 28 };
  const t0 = points[0].t;
  // Run the line to the present, so a quiet hour reads as a flat line, not as nothing.
  const t1 = Math.max(points[points.length - 1].t, Math.floor(Date.now() / 1000), t0 + 60);
  const maxV = Number(points[points.length - 1].total);
  const niceMax = niceCeil(maxV);
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / niceMax) * (H - pad.t - pad.b);

  let d = `M${x(t0)} ${y(0)}`;
  for (const pt of points) d += ` H${x(pt.t).toFixed(1)} V${y(Number(pt.total)).toFixed(1)}`;
  d += ` H${x(t1).toFixed(1)}`;
  const ticks = [0, niceMax / 2, niceMax];
  const h = hover === null ? null : points[hover];

  return (
    <div className="chart" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Cumulative ${what}: ${amount(points[points.length - 1].total)} tUSD8 over ${points.length} payments`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          let best = 0;
          points.forEach((p, i) => {
            if (Math.abs(x(p.t) - px) < Math.abs(x(points[best].t) - px)) best = i;
          });
          setHover(best);
        }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">
              {amount(BigInt(Math.round(v)))}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 8} fontSize="11" fill="var(--ink-3)">
          {clock(t0)}
        </text>
        <text x={W - pad.r} y={H - 8} fontSize="11" fill="var(--ink-3)" textAnchor="end">
          now
        </text>
        <path d={d} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinejoin="round" />
        <circle cx={x(t1)} cy={y(Number(points[points.length - 1].total))} r={4} fill="var(--green)" stroke="var(--paper-2)" strokeWidth="2" />
        {h && <circle cx={x(h.t)} cy={y(Number(h.total))} r={5} fill="var(--green)" stroke="var(--paper-2)" strokeWidth="2" />}
        {h && <line x1={x(h.t)} x2={x(h.t)} y1={pad.t} y2={H - pad.b} stroke="var(--ink-3)" strokeDasharray="3 3" />}
        <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="transparent" />
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: `${(x(h.t) / W) * 100}%`, top: `${(y(Number(h.total)) / H) * 100}%` }}>
          {dateTime(h.t)}: +{amount(h.p.amount)}, {amount(h.total)} in total
        </div>
      )}
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}
