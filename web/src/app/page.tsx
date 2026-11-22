import Link from "next/link";
import { HeroReplay } from "@/components/landing/HeroReplay";
import { CheckIcon } from "@/components/Icons";
import "./landing.css";

const steps = [
  {
    title: "The agent asks",
    text: "Your AI agent calls a paid API like any other: a normal web request.",
  },
  {
    title: "The API names its price",
    text: "Instead of data, it answers 402 Payment Required, with the amount, the seller and the network in a PAYMENT-REQUIRED header.",
  },
  {
    title: "The agent signs a payment",
    text: "For this one request only. The agent holds no money and pays no gas: it only signs.",
  },
  {
    title: "The mandate checks every rule",
    text: "The seller's payment service submits the signature. AgentMandate pays only if every one of your rules passes.",
  },
  {
    title: "The API answers",
    text: "Data comes back with a receipt. The seller records a fingerprint of the answer on-chain, so anyone can audit what was bought.",
  },
];

const rules: [string, string][] = [
  ["The seller is on your allowed list", "PayeeNotAllowed"],
  ["The price is within your per-call cap", "ExceedsSinglePayment"],
  ["Today's spending stays within the daily budget", "ExceedsPeriodBudget"],
  ["Lifetime spending stays within the total", "ExceedsTotalBudget"],
  ["There is enough left in escrow", "InsufficientBalance"],
  ["You haven't revoked the mandate", "MandateIsRevoked"],
  ["The mandate hasn't expired", "MandateExpired"],
  ["The signed payment hasn't expired", "PaymentExpired"],
  ["The payment number hasn't been used before", "NonceAlreadyUsed"],
  ["It was signed by this mandate's agent", "InvalidAgentSignature"],
];

const roadmap: [string, string][] = [
  ["A Payment Agent with maxSinglePayment, maxDailySpend and allowedRecipients", "The same limits, with the same names, enforced by the contract"],
  ["Agents paying per request with x402", "x402 version 2 with a mandate payment scheme, settled on Aevum"],
  ["An Agent Registry that records the results of agents' actions", "Every paid answer's fingerprint recorded on-chain, linked to its payment"],
  ["ML-DSA-65 post-quantum signatures in Phase 2", "A pluggable signature slot with an ML-DSA-65 adapter, waiting for QDay's precompile"],
];

const sellerCode = `import { paywall } from "./paywall";

app.get(
  "/v1/price",
  paywall(config, { price: "0.01", description: "BTC price" }),
  (req, res) => sendPaid(res, { pair: "BTC-USD", price: 97012.5 }),
);`;

export default function Landing() {
  return (
    <>
      <section className="hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <h1>Let AI agents pay per request. Never past the limits you set.</h1>
            <p className="lead">
              AgentMeter gives an AI agent a spending mandate on QDay. The agent pays for APIs one call at a time, in tUSD8. Every payment is
              checked on-chain against your rules, so a confused or prompt-injected agent still can&apos;t overspend.
            </p>
            <div className="row hero-cta">
              <Link className="btn" href="/app">
                Open the dashboard
              </Link>
              <a className="btn quiet" href="#how">
                See how a paid request works
              </a>
            </div>
            <p className="small quiet">Running on QDay&apos;s Aevum testnet with test tokens.</p>
          </div>
          <HeroReplay />
        </div>
      </section>

      <section id="how" className="section">
        <div className="shell how-grid">
          <div>
            <h2>How a paid request works</h2>
            <p className="lead section-lead">Five steps, about a second, and you keep the last word on every one.</p>
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={s.title}>
                  <span className="step-no figure">{i + 1}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <figure className="wire" aria-label="What the agent and the API send each other">
            <figcaption className="small quiet">What travels over the wire</figcaption>
            <pre>
              <span className="w-out">GET /v1/price?pair=BTC-USD</span>
              {"\n\n"}
              <span className="w-in">HTTP/1.1 402 Payment Required</span>
              {"\n"}
              <span className="w-h">PAYMENT-REQUIRED:</span> {"{ scheme: \"mandate\",\n  network: \"eip155:44005\",\n  amount: \"10000\", payTo: \"0x8B4f…4dB0\" }"}
              {"\n\n"}
              <span className="w-out">GET /v1/price?pair=BTC-USD</span>
              {"\n"}
              <span className="w-h">PAYMENT-SIGNATURE:</span> {"{ payment, signature }"}
              {"\n\n"}
              <span className="w-in">HTTP/1.1 200 OK</span>
              {"\n"}
              <span className="w-h">PAYMENT-RESPONSE:</span> {"{ success: true,\n  transaction: \"0x9d9f…6087\" }"}
              {"\n\n"}
              {"{ \"pair\": \"BTC-USD\", \"price\": 97012.5 }"}
            </pre>
          </figure>
        </div>
      </section>

      <section id="rules" className="section rules-section">
        <div className="shell rules-grid">
          <div>
            <h2>The checks before any money moves</h2>
            <p className="lead section-lead">
              The checks live in the contract, not in the agent. A prompt-injected agent can sign anything it likes. If the payment breaks one
              of your rules, the contract refuses it and nobody is paid.
            </p>
          </div>
          <ul className="rule-list">
            {rules.map(([rule, code]) => (
              <li key={code}>
                <CheckIcon className="rule-icon" />
                <span>{rule}</span>
                <code className="quiet">{code}</code>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="sellers" className="section">
        <div className="shell sellers-grid">
          <div>
            <h2>Charge AI agents per call</h2>
            <p className="lead section-lead">Put a price on any API route. Your handler only runs after the money has moved.</p>
            <ul className="plain-list">
              <li>Paid in tUSD8 straight from the agent&apos;s mandate to your address.</li>
              <li>A receipt with the transaction hash rides back in the PAYMENT-RESPONSE header.</li>
              <li>Your payment service also checks the agent paid the right amount, to you, for this exact request.</li>
              <li>Track your earnings and receipts, and send owners a link that lets them allow you in one step.</li>
            </ul>
            <Link className="btn quiet" href="/app/seller" style={{ marginTop: 20 }}>
              Open the seller view
            </Link>
          </div>
          <pre className="code" aria-label="Example: a paid API route">
            <code>{sellerCode}</code>
          </pre>
        </div>
      </section>

      <section id="qday" className="section">
        <div className="shell">
          <h2>Built for QDay&apos;s roadmap</h2>
          <p className="lead section-lead">QDay plans agent payments for its mainnet in early 2027. AgentMeter runs that design on Aevum today.</p>
          <div className="table-scroll">
            <table className="ledger roadmap">
              <thead>
                <tr>
                  <th scope="col">What QDay plans</th>
                  <th scope="col">What AgentMeter does on Aevum today</th>
                </tr>
              </thead>
              <tbody>
                {roadmap.map(([plan, today]) => (
                  <tr key={plan}>
                    <td>{plan}</td>
                    <td>{today}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section closing">
        <div className="shell closing-inner">
          <h2>Give your agent a budget it can&apos;t argue with.</h2>
          <Link className="btn" href="/app/new">
            Create a mandate
          </Link>
        </div>
      </section>
    </>
  );
}
