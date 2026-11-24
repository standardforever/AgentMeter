import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Deploy AgentMandate" };

export default function Deploy() {
  return (
    <>
      <h1>Deploy AgentMandate</h1>
      <p className="lead">
        Deploy your own AgentMandate contract to Aevum testnet, with example mandates and services, from the AgentMeter repository.
      </p>

      <h2>Prerequisites</h2>
      <ul>
        <li>A clone of the repository with dependencies installed. See <Link href="/docs/quickstart">Run the example stack</Link>.</li>
        <li><a href="https://book.getfoundry.sh/getting-started/installation">Foundry</a>.</li>
      </ul>

      <h2>1. Create test wallets</h2>
      <Code title="terminal">{`make testnet-setup`}</Code>
      <p>
        Creates five test keys (owner, facilitator, seller, agent, demo agent) in <code>.env.testnet</code>, which is excluded from git, and
        prints the owner address with the funds it needs. Then it stops.
      </p>

      <h2>2. Fund the owner</h2>
      <p>
        From the <a href="https://faucet.qday.info">QDay faucet</a>, request tQDAY and tUSD8 for the owner address. It needs at least 4.00
        tUSD8 and about 0.07 tQDAY. The script forwards gas to the facilitator and seller wallets.
      </p>

      <h2>3. Deploy</h2>
      <Code title="terminal">{`make testnet-setup`}</Code>
      <p>
        Deploys AgentMandate, creates an example mandate and the two demo mandates used by the landing page, and writes the settings for the
        services and the dashboard. Completed steps are skipped, so it&apos;s safe to run again. It ends by printing the contract address and
        its explorer link.
      </p>

      <h2>4. Start the services</h2>
      <Code title="terminal">{`
make testnet-run     # facilitator on 4021, example API on 4020, rogue API on 4030
make dev             # dashboard on 3000
`}</Code>
      <p>
        <code>testnet-run</code> warns when the facilitator or seller wallet is low on gas; run <code>make testnet-setup</code> again to top
        them up.
      </p>

      <h2>Deploy the contract only</h2>
      <Code title="terminal">{`
cd contracts
forge script script/DeployMandate.s.sol --rpc-url https://rpc-test.qday.info --broadcast --legacy --private-key $OWNER_KEY
`}</Code>
      <p>The constructor takes the payment token. The script uses tUSD8.</p>

      <h2>Host the dashboard</h2>
      <p>
        Deploy the <code>web</code> directory to any Next.js host, such as Vercel, and set the <code>NEXT_PUBLIC_*</code> variables printed
        by <code>make testnet-setup</code>. The dashboard reads the chain directly; only the refusals list needs a reachable facilitator
        (<code>NEXT_PUBLIC_FACILITATOR_URL</code>).
      </p>
      <Callout tone="warn">
        <p>
          Use test wallets only, and never commit <code>.env</code> files. The Aevum explorer can&apos;t verify contracts yet; publish the
          address and the commit you deployed instead.
        </p>
      </Callout>
    </>
  );
}
