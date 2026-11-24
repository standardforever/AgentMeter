import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Run the example stack" };

export default function Quickstart() {
  return (
    <>
      <h1>Run the example stack</h1>
      <p className="lead">
        Run the contract, a facilitator, an example paid API, an AI agent and the dashboard on your machine, against a local copy of Aevum
        testnet. No faucet needed.
      </p>

      <h2>Prerequisites</h2>
      <ul>
        <li>Node.js 22 or later and pnpm 10.</li>
        <li><a href="https://book.getfoundry.sh/getting-started/installation">Foundry</a>.</li>
        <li>Network access to <code>https://rpc-test.qday.info</code>.</li>
      </ul>

      <h2>1. Clone and install</h2>
      <Code title="terminal">{`
git clone --recursive https://github.com/standardforever/AgentMeter.git
cd AgentMeter
pnpm install
`}</Code>

      <h2>2. Start a local copy of Aevum</h2>
      <Code title="terminal 1">{`make fork`}</Code>
      <p>Starts a local chain (id 440050) on port 8555, forked from Aevum testnet, with funded test accounts. Leave it running.</p>

      <h2>3. Deploy and start the services</h2>
      <Code title="terminal 2">{`make local-stack`}</Code>
      <p>
        Deploys AgentMandate, creates example mandates, starts a facilitator (port 4021), an example API (4020) and a rogue API (4030), and
        makes a few payments. Leave it running when it prints <code>Press Ctrl+C to stop the services.</code>
      </p>

      <h2>4. Open the dashboard</h2>
      <Code title="terminal 3">{`make dev`}</Code>
      <p>
        Open <code>http://localhost:3000/app</code> and click <strong>Use local test wallet</strong>, which owns the example mandates.
      </p>

      <h2>5. Make payments</h2>
      <Code title="terminal 4">{`
pnpm --filter server agent -- --question "How is bitcoin doing?" --no-llm
pnpm --filter server agent -- --question "Any solana news?" --no-llm --gullible
`}</Code>
      <p>
        The first pays the example API. The second follows an instruction injected into a news headline and tries to pay the rogue API; the
        contract refuses with <code>PayeeNotAllowed</code>. Both appear on mandate #1 in the dashboard within a few seconds.
      </p>
      <Callout>
        <p>
          Set <code>ANTHROPIC_API_KEY</code> in <code>server/.env</code> and omit <code>--no-llm</code> to let Claude choose which APIs to call.
        </p>
      </Callout>

      <h2>Next steps</h2>
      <ul>
        <li><Link href="/docs/concepts">How AgentMeter works</Link>.</li>
        <li><Link href="/docs/deploy">Deploy AgentMandate</Link> to Aevum testnet.</li>
      </ul>
    </>
  );
}
