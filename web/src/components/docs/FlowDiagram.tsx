/**
 * The x402 "mandate" payment flow as a sequence diagram: four lanes, numbered messages.
 * Plain SVG (no client JavaScript), drawn in the site's colors, and it scales to any width.
 */
const LANES = [
  { x: 90, title: "Agent", sub: "signs only" },
  { x: 330, title: "Seller API", sub: "paywall()" },
  { x: 570, title: "Facilitator", sub: "pays gas" },
  { x: 810, title: "AgentMandate", sub: "on Aevum" },
];

type Msg = { from: number; to: number; label: string; note?: string; tone?: "money" | "receipt" | "reply" };

const MSGS: Msg[] = [
  { from: 0, to: 1, label: "GET /v1/price" },
  { from: 1, to: 0, label: "402 + PAYMENT-REQUIRED", note: "price, seller, network", tone: "reply" },
  { from: 0, to: 1, label: "GET /v1/price + PAYMENT-SIGNATURE", note: "signed for this one request" },
  { from: 1, to: 2, label: "POST /verify, then /settle" },
  { from: 2, to: 3, label: "settle(payment, signature)" },
  { from: 3, to: 2, label: "rules pass: tUSD8 to the seller", note: "or refused, and nobody is paid", tone: "money" },
  { from: 2, to: 1, label: "settlement + transaction", tone: "reply" },
  { from: 1, to: 0, label: "200 + data + PAYMENT-RESPONSE", tone: "reply" },
  { from: 1, to: 3, label: "attest(paymentId, hash of the answer)", note: "the on-chain receipt", tone: "receipt" },
];

const TOP = 92;
const STEP = 58;

export function FlowDiagram() {
  const height = TOP + MSGS.length * STEP + 30;
  const color = (t?: Msg["tone"]) => (t === "money" ? "var(--green)" : t === "receipt" ? "#4b5fd0" : t === "reply" ? "var(--ink-2)" : "var(--ink)");
  return (
    <figure className="flow-diagram">
      <svg viewBox={`0 0 900 ${height}`} role="img" aria-labelledby="flow-title flow-desc">
        <title id="flow-title">The payment flow</title>
        <desc id="flow-desc">
          The agent requests a paid resource, gets 402 with a price, signs a payment and repeats the request. The seller asks the facilitator to
          verify and settle; the facilitator calls settle on AgentMandate, which checks the rules and pays the seller. The seller answers with
          the data and records a hash of the answer on-chain.
        </desc>
        <defs>
          {["ink", "ink2", "green", "blue"].map((k) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={k === "ink" ? "var(--ink)" : k === "ink2" ? "var(--ink-2)" : k === "green" ? "var(--green)" : "#4b5fd0"} />
            </marker>
          ))}
        </defs>

        {LANES.map((l) => (
          <g key={l.title}>
            <rect x={l.x - 78} y={14} width={156} height={50} rx={8} fill="var(--paper-2)" stroke="var(--ink)" strokeWidth={1.5} />
            <text x={l.x} y={36} textAnchor="middle" className="fd-lane">
              {l.title}
            </text>
            <text x={l.x} y={54} textAnchor="middle" className="fd-sub">
              {l.sub}
            </text>
            <line x1={l.x} y1={64} x2={l.x} y2={height - 12} stroke="var(--rule)" strokeWidth={2} strokeDasharray="4 5" />
          </g>
        ))}

        {MSGS.map((m, i) => {
          const y = TOP + i * STEP;
          const x1 = LANES[m.from].x;
          const x2 = LANES[m.to].x;
          const dir = x2 > x1 ? 1 : -1;
          const mid = (x1 + x2) / 2;
          const marker = m.tone === "money" ? "green" : m.tone === "receipt" ? "blue" : m.tone === "reply" ? "ink2" : "ink";
          return (
            <g key={i}>
              <line
                x1={x1 + dir * 6}
                y1={y}
                x2={x2 - dir * 8}
                y2={y}
                stroke={color(m.tone)}
                strokeWidth={m.tone === "money" ? 2.5 : 1.75}
                strokeDasharray={m.tone === "reply" ? "6 4" : undefined}
                markerEnd={`url(#arrow-${marker})`}
              />
              <circle cx={x1} cy={y} r={11} fill={color(m.tone)} />
              <text x={x1} y={y + 4} textAnchor="middle" className="fd-no">
                {i + 1}
              </text>
              <text x={mid} y={y - 9} textAnchor="middle" className="fd-label" fill={color(m.tone)}>
                {m.label}
              </text>
              {m.note && (
                <text x={mid} y={y + 19} textAnchor="middle" className="fd-note">
                  {m.note}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="small quiet">
        Solid arrows are requests, dashed arrows are replies. Step 6 is where the owner&apos;s rules are enforced: if one fails, the contract
        refuses and no money moves.
      </figcaption>
    </figure>
  );
}
