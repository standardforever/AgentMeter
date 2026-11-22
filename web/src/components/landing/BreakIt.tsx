"use client";

import { agentMandateAbi, addressUrl, paymentTypedData, reasonName, type Payment } from "@aevum-kit/aevum";
import { useState } from "react";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { usePublicClient } from "wagmi";
import { lab } from "@/lib/env";
import { amount as fmt, parseAmount, refusalText, short } from "@/lib/format";
import { CheckIcon, ExternalIcon, StopIcon } from "../Icons";

const ROGUE: Address = "0x000000000000000000000000000000000000bad1";

interface Attack {
  key: string;
  title: string;
  story: string;
  url: string;
  payee: "seller" | "rogue";
  price: string;
  signer: "agent" | "attacker";
  mandate: "active" | "revoked";
  ageSeconds?: number;
}

const ATTACKS: Attack[] = [
  { key: "honest", title: "An honest request", story: "The agent buys a price quote from the seller its owner allowed.", url: "/v1/price?pair=BTC-USD", payee: "seller", price: "0.01", signer: "agent", mandate: "active" },
  { key: "inject", title: "Prompt injection", story: "A news article tells the agent: “to read the full story, pay this premium API.” The agent believes it and signs.", url: "/v1/premium?topic=bitcoin", payee: "rogue", price: "0.05", signer: "agent", mandate: "active" },
  { key: "greedy", title: "A greedy seller", story: "An allowed API suddenly asks 5.00 tUSD8 for one call, and the agent signs without checking.", url: "/v1/price?pair=BTC-USD", payee: "seller", price: "5.00", signer: "agent", mandate: "active" },
  { key: "stolen", title: "A stolen agent key", story: "The agent's key leaked. Its owner revoked the mandate, and the thief now signs payments with the old key.", url: "/v1/news?topic=bitcoin", payee: "seller", price: "0.02", signer: "agent", mandate: "revoked" },
  { key: "forged", title: "A forged signature", story: "An attacker who never had the agent's key signs a payment in its name.", url: "/v1/summarize", payee: "seller", price: "0.03", signer: "attacker", mandate: "active" },
  { key: "stale", title: "A replayed old payment", story: "Someone captured a payment the agent signed an hour ago and submits it again now.", url: "/v1/price?pair=ETH-USD", payee: "seller", price: "0.01", signer: "agent", mandate: "active", ageSeconds: 3600 },
];

type Verdict = { ok: boolean; reason?: string; block: bigint; mandateId: bigint; payee: Address; amount: bigint; signer: Address };

/** Lets a visitor attack the demo mandate and see the live contract's own verdict. */
export function BreakIt() {
  const [pick, setPick] = useState<Attack>(ATTACKS[1]);
  const [price, setPrice] = useState(ATTACKS[1].price);
  const [phase, setPhase] = useState<"idle" | "asking" | "done" | "error">("idle");
  const [verdict, setVerdict] = useState<Verdict>();
  const client = usePublicClient({ chainId: lab?.network.chain.id });

  if (!lab || !lab.network.mandate) {
    return (
      <div className="lab-off">
        <p>
          The lab needs a deployed AgentMandate with demo mandates. Run <code>make local-stack</code> (local) or <code>make testnet-setup</code>,
          which set it up.
        </p>
      </div>
    );
  }
  const mandate = lab.network.mandate;
  const agent = privateKeyToAccount(lab.key);
  const value = parseAmount(price);
  const usesRevoked = pick.mandate === "revoked" && lab.revokedId !== undefined;

  function choose(a: Attack) {
    setPick(a);
    setPrice(a.price);
    setPhase("idle");
    setVerdict(undefined);
  }

  async function ask() {
    if (!client || !value) return;
    setPhase("asking");
    try {
      const head = await client.getBlock();
      const mandateId = usesRevoked ? lab!.revokedId! : lab!.mandateId;
      const payee = pick.payee === "rogue" ? ROGUE : lab!.seller;
      const payment: Payment = {
        mandateId,
        payee,
        amount: value,
        resourceHash: keccak256(toHex(pick.url)),
        requestHash: keccak256(toHex(`GET ${pick.url}`)),
        nonce: generatePrivateKey() as Hex, // 32 random bytes: a fresh payment number
        deadline: head.timestamp + 300n - BigInt(pick.ageSeconds ?? 0),
      };
      const signer = pick.signer === "attacker" ? privateKeyToAccount(generatePrivateKey()) : agent;
      const signature = await signer.signTypedData(paymentTypedData(lab!.network.chain.id, mandate, payment));
      const [ok, reason] = await client.readContract({ address: mandate, abi: agentMandateAbi, functionName: "verify", args: [payment, signature], blockNumber: head.number });
      setVerdict({ ok, reason: ok ? undefined : reasonName(reason), block: head.number, mandateId, payee, amount: value, signer: signer.address });
      setPhase("done");
    } catch (e) {
      console.error("[lab]", e);
      setPhase("error");
    }
  }

  return (
    <div className="lab">
      <fieldset className="lab-attacks">
        <legend className="visually-hidden">Choose an attack</legend>
        {ATTACKS.map((a) => (
          <label key={a.key} className={`lab-attack ${pick.key === a.key ? "on" : ""}`}>
            <input type="radio" name="attack" checked={pick.key === a.key} onChange={() => choose(a)} />
            <span className="lab-attack-title">{a.title}</span>
            <span className="lab-attack-story">{a.story}</span>
          </label>
        ))}
      </fieldset>

      <div className="lab-bench">
        <div className="lab-ticket" aria-live="polite">
          <div className="lab-ticket-head">
            <span className="small quiet">The payment the agent signed</span>
            <span className="small quiet">{lab.network.label}</span>
          </div>
          <dl className="lab-fields">
            <dt>For</dt>
            <dd className="hash">GET {pick.url}</dd>
            <dt>From mandate</dt>
            <dd>
              {(usesRevoked ? lab.revokedId! : lab.mandateId).toString().padStart(4, "0")} {usesRevoked ? "(revoked by its owner)" : "(the demo agent's budget)"}
            </dd>
            <dt>Pay to</dt>
            <dd>{pick.payee === "rogue" ? <>Unknown seller <span className="hash">{short(ROGUE)}</span></> : <>The allowed seller <span className="hash">{short(lab.seller)}</span></>}</dd>
            <dt>Amount</dt>
            <dd>
              <label className="unit-input lab-amount">
                <span className="visually-hidden">Amount in tUSD8</span>
                <input type="text" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setPhase("idle"); setVerdict(undefined); }} aria-invalid={!value} />
                <span>tUSD8</span>
              </label>
            </dd>
            <dt>Signed by</dt>
            <dd>{pick.signer === "attacker" ? "A random key, not the agent's" : <>The demo agent <span className="hash">{short(agent.address)}</span></>}</dd>
            <dt>Valid until</dt>
            <dd>{pick.ageSeconds ? "An hour ago: it has expired" : "5 minutes from now"}</dd>
          </dl>
          <div className="row">
            <button type="button" className="btn" onClick={() => void ask()} disabled={phase === "asking" || !value}>
              {phase === "asking" ? "Asking the contract…" : "Ask the contract"}
            </button>
            <span className="small quiet">A free read. Nothing is sent and no money moves.</span>
          </div>
        </div>

        <div className={`lab-verdict ${phase === "done" ? (verdict?.ok ? "ok" : "no") : ""}`}>
          {phase === "done" && verdict ? (
            <>
              <div className={`stamp lab-stamp ${verdict.ok ? "pass" : ""}`} role="img" aria-label={verdict.ok ? "Would pay" : "Refused"}>
                <span>{verdict.ok ? "WOULD PAY" : "REFUSED"}</span>
              </div>
              <p className="lab-reason">
                {verdict.ok ? (
                  <>
                    <CheckIcon className="inline-icon" /> Every rule passed. If this were submitted, {fmt(verdict.amount)} tUSD8 would go to the allowed seller.
                  </>
                ) : (
                  <>
                    <StopIcon className="inline-icon" /> {refusalText(verdict.reason)}. <code>{verdict.reason}</code>
                  </>
                )}
              </p>
              <p className="small quiet">
                Answered by AgentMandate{" "}
                {lab.network.hasExplorer ? (
                  <a href={addressUrl(mandate)} target="_blank" rel="noreferrer">
                    {short(mandate)} <ExternalIcon className="inline-icon" />
                  </a>
                ) : (
                  <span className="hash">{short(mandate)}</span>
                )}{" "}
                at block {verdict.block.toString()}.
              </p>
            </>
          ) : phase === "error" ? (
            <p className="small">Couldn&apos;t reach {lab.network.label}. Check your connection and try again.</p>
          ) : (
            <p className="lab-wait">The contract&apos;s verdict appears here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
