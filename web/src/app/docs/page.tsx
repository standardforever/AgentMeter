import type { Metadata } from "next";
import Link from "next/link";
import { FlowDiagram } from "@/components/docs/FlowDiagram";

export const metadata: Metadata = { title: "Docs" };

export default function DocsHome() {
  return (
    <>
      <h1>AgentMeter</h1>
      <p className="lead">
        Let AI agents pay for APIs per request, in stablecoins on QDay Aevum, within spending limits enforced on-chain.
      </p>
      <p>
        AgentMeter extends the <a href="https://x402.org">x402</a> payment protocol with spending mandates. An owner deposits tUSD8 into a
        mandate and sets its rules. The agent signs a payment for each request it makes; the AgentMandate contract pays the seller only if
        the payment follows every rule. The agent never holds funds, so an agent that is tricked or misbehaves can&apos;t spend more than the
        owner allowed.
      </p>

      <h2>The payment flow</h2>
      <FlowDiagram />
      <ol>
        <li>The agent requests a paid resource.</li>
        <li>The seller answers <code>402 Payment Required</code> with its price.</li>
        <li>The agent signs a payment for that request and sends the request again.</li>
        <li>The seller sends the payment to a facilitator, which submits it to the AgentMandate contract.</li>
        <li>The contract checks the mandate&apos;s rules and, if they pass, transfers tUSD8 from the mandate to the seller.</li>
        <li>The seller returns the resource and records a hash of it on-chain as a receipt.</li>
      </ol>

      <h2>Roles</h2>
      <ul>
        <li>
          <strong>Owner:</strong> creates and funds mandates, sets their rules, and can change or revoke them at any time.
        </li>
        <li>
          <strong>Agent:</strong> signs payments. Its key holds no tokens and pays no gas.
        </li>
        <li>
          <strong>Seller:</strong> prices its API routes and receives payments.
        </li>
        <li>
          <strong>Facilitator:</strong> checks signed payments and submits them on-chain, paying the gas. It can&apos;t change a payment or
          pay anyone the owner didn&apos;t allow.
        </li>
      </ul>

      <h2>What to read next</h2>
      <div className="docs-cards">
        <Link href="/playground">
          <strong>Try it without code</strong>
          <span>Make a test agent pay, get refused, and change its rules in the browser.</span>
        </Link>
        <Link href="/docs/agents">
          <strong>Quickstart for agents</strong>
          <span>Make an AI agent pay for API calls from a mandate.</span>
        </Link>
        <Link href="/docs/sellers">
          <strong>Quickstart for sellers</strong>
          <span>Charge AI agents per request for your API.</span>
        </Link>
        <Link href="/docs/owners">
          <strong>Quickstart for owners</strong>
          <span>Create a mandate and control what an agent can spend.</span>
        </Link>
        <Link href="/docs/concepts">
          <strong>How AgentMeter works</strong>
          <span>Mandates, spending rules, payments and receipts in detail.</span>
        </Link>
      </div>
    </>
  );
}
