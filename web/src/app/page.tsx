import Link from "next/link";
import { BreakIt } from "@/components/landing/BreakIt";
import { HeroReplay } from "@/components/landing/HeroReplay";
import { LiveStats } from "@/components/landing/LiveStats";
import { WithClaude } from "@/components/landing/WithClaude";
import { CheckIcon } from "@/components/Icons";
import { OwnerPreview } from "@/components/landing/OwnerPreview";
import { ChainEventsProvider } from "@/lib/chainEvents";
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

const sellerCode = `import { paywall, createReceipts } from "@standeva/agentmeter/server";

app.get(
  "/v1/price",
  paywall(config, { price: "0.01", description: "BTC price" }),
  (req, res) => receipts.send(res, { pair: "BTC-USD", price: 97012.5 }),
);`;

const agentCode = `import { createPayingFetch } from "@standeva/agentmeter";

const payingFetch = createPayingFetch({
  agent: privateKeyToAccount(AGENT_KEY), // signs only
  chainId: 44005,
  mandate: MANDATE_ADDRESS,
  mandateId: 1n,
});

const res = await payingFetch("https://api.example.com/v1/price");
// res.paid: what it paid, or res.refused: why not`;

const aevum: [string, string][] = [
  [
    "Paid in a stablecoin",
    "Prices and budgets are in tUSD8, so an owner thinks in dollars, not gas. The agent never holds money and never pays gas: the seller's payment service submits each payment.",
  ],
  [
    "Checked in public",
    "The rules, every payment and every answer's fingerprint live on-chain. Anyone can audit what an agent bought, and prove an answer is the one that was paid for.",
  ],
  [
    "Ready for post-quantum keys",
    "QDay is building toward post-quantum signatures. A mandate's signature check is pluggable, and an ML-DSA-65 adapter is ready for Aevum's precompile. Today, agents sign with standard Ethereum keys.",
  ],
];

export default function Landing() {
  return (
    <ChainEventsProvider>
      <section className="hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <h1>Your AI agent can be tricked. Its budget can&apos;t.</h1>
            <p className="lead">
              AgentMeter gives each AI agent a spending mandate on Aevum: which APIs it may pay, and how much per call, per day and in total.
              The contract checks every payment before money moves, so a confused or prompt-injected agent still can&apos;t overspend.
            </p>
            <div className="row hero-cta">
              <a className="btn big" href="#lab">
                Try to break it
              </a>
              <Link className="btn quiet big" href="/playground">
                Open the Playground
              </Link>
            </div>
            <LiveStats />
          </div>
          <HeroReplay />
        </div>
      </section>

      <section id="lab" className="section">
        <div className="shell">
          <div className="lab-head">
            <h2>Try to break it</h2>
            <p className="lead section-lead">
              Pick an attack. Your browser signs the payment as a demo agent, then asks the live AgentMandate contract whether it would pay.
              The verdict is the contract&apos;s own answer.
            </p>
          </div>
          <BreakIt />
        </div>
      </section>

      <WithClaude />

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
              <span className="w-h">PAYMENT-REQUIRED:</span> {"{ scheme: \"mandate\",\n  network: \"eip155:44005\",\n  amount: \"10000\", payTo: \"0x24C0…65cC\" }"}
              {"\n\n"}
              <span className="w-out">GET /v1/price?pair=BTC-USD</span>
              {"\n"}
              <span className="w-h">PAYMENT-SIGNATURE:</span> {"{ payment, signature }"}
              {"\n\n"}
              <span className="w-in">HTTP/1.1 200 OK</span>
              {"\n"}
              <span className="w-h">PAYMENT-RESPONSE:</span> {"{ success: true,\n  transaction: \"0x55df…e1ad\" }"}
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

      <section id="owner" className="section">
        <div className="shell owner-grid">
          <div className="owner-copy">
            <h2>Every payment and every refusal, in one place</h2>
            <p className="lead section-lead">
              The owner&apos;s dashboard reads everything from the chain: what&apos;s left today and in total, every payment with its receipt,
              and every payment the contract refused, with the reason. Top up, change a limit or revoke the agent in one click.
            </p>
            <p className="small quiet">This is the live dashboard of the busiest mandate on the contract, not a screenshot.</p>
          </div>
          <OwnerPreview />
        </div>
      </section>

      <section id="start" className="section">
        <div className="shell">
          <h2>Where to start</h2>
          <p className="lead start-lead">
            Not ready to write code? The <Link href="/playground">Playground</Link> gives you a test agent and a budget in the browser: make it
            pay, try to scam it, change its rules, and watch the contract decide.
          </p>
          <div className="paths">
            <article className="path">
              <h3>You run an AI agent</h3>
              <p>Create a mandate, give your agent three settings, and watch every payment it makes. Change the limits or revoke it in one click.</p>
              <pre className="code" aria-label="Example: an agent that pays per request">
                <code>{agentCode}</code>
              </pre>
              <Link className="btn" href="/app/new">
                Create a mandate
              </Link>
            </article>
            <article className="path">
              <h3>You sell an API</h3>
              <p>
                Put a price on any route. Your handler only runs after the money has moved, and each answer gets a receipt. Send owners a link that
                lets them allow you in one step.
              </p>
              <pre className="code" aria-label="Example: a paid API route">
                <code>{sellerCode}</code>
              </pre>
              <Link className="btn quiet" href="/app/seller">
                Open the seller view
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section id="aevum" className="section">
        <div className="shell">
          <h2>Why it runs on Aevum</h2>
          <div className="aevum-points">
            {aevum.map(([title, text]) => (
              <div key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
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
    </ChainEventsProvider>
  );
}
