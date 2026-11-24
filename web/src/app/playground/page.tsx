import type { Metadata } from "next";
import Link from "next/link";
import { Playground } from "@/components/playground/Playground";
import { ChainEventsProvider } from "@/lib/chainEvents";
import "../app/app.css";
import "./playground.css";

export const metadata: Metadata = {
  title: "Playground",
  description: "Make a test AI agent pay for API calls from a budget, and watch the contract allow or refuse each one. No code, no wallet.",
};

export default function PlaygroundPage() {
  return (
    <ChainEventsProvider>
      <div className="shell pg-shell">
        <header className="pg-intro">
          <h1>Playground</h1>
          <p className="lead">
            A test agent with a budget. Tell it what to buy and watch each payment go through the contract: paid when it fits the rules,
            refused when it doesn&apos;t. Every payment here is a real transaction on the test network.
          </p>
          <p className="small quiet">
            Want to do this from code? <Link href="/docs/quickstart">Read the quickstart</Link>.
          </p>
        </header>
        <Playground />
      </div>
    </ChainEventsProvider>
  );
}
