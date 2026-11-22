"use client";

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { useChainEvents } from "@/lib/chainEvents";
import { useNetwork } from "@/lib/network";
import { Cheque } from "../Cheque";
import { WalletButton } from "../WalletButton";
import { Notice } from "../ui";

/** Everything the dashboard needs before it can show anything: a contract, a wallet, the history. */
export function Gate({ children }: { children: ReactNode }) {
  const { net } = useNetwork();
  const { isConnected } = useAccount();
  const { status, progress, error } = useChainEvents();

  if (!net.mandate) {
    return (
      <section className="gate">
        <h1>No AgentMandate on {net.label} yet</h1>
        <p className="lead">The dashboard needs the address of a deployed AgentMandate contract.</p>
        <ol className="plain-steps">
          <li>
            Deploy it: <code>make deploy-mandate-aevum ACCOUNT=your-keystore</code> (or <code>make local-stack</code> for a local copy).
          </li>
          <li>
            Put the address and its deploy block in <code>web/.env.local</code>: <code>NEXT_PUBLIC_MANDATE_AEVUM</code> and{" "}
            <code>NEXT_PUBLIC_MANDATE_DEPLOY_BLOCK_AEVUM</code>.
          </li>
          <li>Restart the dashboard.</li>
        </ol>
      </section>
    );
  }

  if (!isConnected) {
    return (
      <section className="gate gate-connect">
        <div className="stack" style={{ ["--gap" as string]: "20px" }}>
          <h1>Connect the wallet that owns your mandates</h1>
          <p className="lead">
            You&apos;ll see each mandate&apos;s budget, every payment your agents made, and every payment the contract refused. Connecting
            doesn&apos;t send anything.
          </p>
          <WalletButton />
        </div>
        <Cheque
          number={0}
          title="Your first mandate"
          agent="0x…"
          sellers={2}
          perCall="0.05"
          perDay="1.00"
          total="3.00"
          escrow="5.00"
          owner="you"
          expires="30 days from today"
          className="gate-cheque"
        />
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="gate">
        <Notice tone="bad">{error} Check that the network is reachable, then reload.</Notice>
      </section>
    );
  }

  if (status === "loading") {
    return (
      <section className="gate" aria-busy="true">
        <h1>Reading the contract&apos;s history</h1>
        <div className="meter-row" style={{ maxWidth: 520 }}>
          <div className="meter-name">Blocks scanned</div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="meter-figure">
            <strong>{Math.round(progress * 100)}%</strong>
          </div>
        </div>
        <p className="quiet small">The first visit reads every event since the contract was deployed. After that, only new blocks.</p>
      </section>
    );
  }

  return <>{children}</>;
}
