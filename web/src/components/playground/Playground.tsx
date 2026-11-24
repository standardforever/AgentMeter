"use client";

import { createPayingFetch, type PayEvent } from "@agentmeter/sdk";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { erc20Abi, formatUnits, parseEventLogs, type Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useAccount } from "wagmi";
import { agentMandateAbi } from "@aevum-kit/aevum";
import { allowedSellers, payments, useChainEvents } from "@/lib/chainEvents";
import { playground } from "@/lib/env";
import { amount, dateTime, duration, ratio, refusalText, short } from "@/lib/format";
import { useMandate, useSend, useToken } from "@/lib/mandate";
import { useNetwork } from "@/lib/network";
import { Actions } from "../dashboard/Actions";
import { CheckIcon, StopIcon } from "../Icons";
import { Meter, Notice, TxLink, TxStatus } from "../ui";
import { WalletButton } from "../WalletButton";
import { playActions, type PlayAction } from "./actions";

const SCAM_SELLER: Address = "0x000000000000000000000000000000000000bad1";
const ZERO: Address = "0x0000000000000000000000000000000000000000";
const STORE = "agentmeter:playground";

type Mode = "demo" | "own";
type Own = { id: string; key: Hex };
type Step = { tone: "info" | "good" | "bad"; title: string; detail?: string };
type Run = {
  id: number;
  action: PlayAction;
  label: string;
  status: "running" | "paid" | "refused" | "error";
  steps: Step[];
  paymentId?: Hex;
  transaction?: string;
  reason?: string;
  answer?: string;
};

function loadOwn(contract: string | undefined): Own | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(`${STORE}:${contract}`) ?? "null") as Own | null;
    return v?.id && v.key ? v : undefined;
  } catch {
    return undefined;
  }
}
function saveOwn(contract: string | undefined, own: Own | undefined) {
  try {
    if (own) localStorage.setItem(`${STORE}:${contract}`, JSON.stringify(own));
    else localStorage.removeItem(`${STORE}:${contract}`);
  } catch {
    // Storage blocked: the playground still works for this visit.
  }
}

export function Playground() {
  const cfg = playground;
  const { net } = useNetwork();
  const [mode, setMode] = useState<Mode>("demo");
  const [own, setOwn] = useState<Own>();
  useEffect(() => setOwn(loadOwn(net.mandate)), [net.mandate]);

  if (!cfg || !net.mandate) {
    return (
      <Notice>
        The Playground isn&apos;t set up on this site yet. Locally, run <code>make local-stack</code> again and restart <code>make dev</code>.
      </Notice>
    );
  }

  const mandateId = mode === "demo" ? cfg.mandateId : own ? BigInt(own.id) : undefined;
  const agentKey = mode === "demo" ? cfg.demoKey : own?.key;

  return (
    <>
      <div className="pg-modes" role="tablist" aria-label="Budget">
        <button type="button" role="tab" aria-selected={mode === "demo"} onClick={() => setMode("demo")}>
          Demo budget
          <span>No wallet needed</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "own"} onClick={() => setMode("own")}>
          Your own budget
          <span>Set the rules yourself</span>
        </button>
      </div>

      {mode === "own" && !own ? (
        <CreateOwn
          onCreated={(o) => {
            saveOwn(net.mandate, o);
            setOwn(o);
          }}
        />
      ) : mandateId !== undefined && agentKey ? (
        <Bench
          key={`${mode}:${mandateId}`}
          mode={mode}
          mandateId={mandateId}
          agentKey={agentKey}
          onForget={() => {
            saveOwn(net.mandate, undefined);
            setOwn(undefined);
          }}
        />
      ) : null}
    </>
  );
}

/** The three columns: what to make the agent do, what happened, and the budget. */
function Bench({ mode, mandateId, agentKey, onForget }: { mode: Mode; mandateId: bigint; agentKey: Hex; onForget: () => void }) {
  const cfg = playground!;
  const { net } = useNetwork();
  const { events, refresh } = useChainEvents();
  const { address } = useAccount();
  const { mandate, remaining, state } = useMandate(mandateId);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const actions = useMemo(() => playActions(cfg.sellerUrl, cfg.rogueUrl), [cfg.sellerUrl, cfg.rogueUrl]);
  const agent = useMemo(() => privateKeyToAccount(agentKey), [agentKey]);
  const sellers = useMemo(() => allowedSellers(events, mandateId), [events, mandateId]);
  const receipts = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of payments(events)) m.set(p.paymentId.toLowerCase(), Boolean(p.responseHash));
    return m;
  }, [events]);
  const isOwner = Boolean(address && mandate && mandate.owner.toLowerCase() === address.toLowerCase());
  const scamAllowed = sellers.some((s) => s.address.toLowerCase() === SCAM_SELLER);

  function update(id: number, change: (r: Run) => Run) {
    setRuns((all) => all.map((r) => (r.id === id ? change(r) : r)));
  }

  async function play(action: PlayAction) {
    setBusy(true);
    for (const [i, req] of action.requests.entries()) {
      const id = nextId.current++;
      const label = action.requests.length > 1 ? `${action.title} (${i + 1} of ${action.requests.length})` : action.title;
      setRuns((all) => [{ id, action, label, status: "running" as const, steps: [] }, ...all].slice(0, 30));
      const add = (s: Step) => update(id, (r) => ({ ...r, steps: [...r.steps, s] }));
      const payingFetch = createPayingFetch({
        agent,
        chainId: net.chain.id,
        mandate: net.mandate!,
        mandateId,
        onEvent: (e: PayEvent) => {
          if (e.type === "request") add({ tone: "info", title: `Asked the API: ${pathOf(e.url)}` });
          if (e.type === "payment-required")
            add({ tone: "info", title: `The API answered 402 Payment Required: ${fmt(e.offer.amount)} tUSD8 to ${short(e.offer.payTo)}` });
          if (e.type === "signed")
            add({
              tone: "info",
              title: `The agent signed a payment from mandate #${e.payment.mandateId}`,
              detail: [
                `mandateId    ${e.payment.mandateId}`,
                `payee        ${e.payment.payee}`,
                `amount       ${e.payment.amount} (${fmt(e.payment.amount.toString())} tUSD8)`,
                `resourceHash ${e.payment.resourceHash}`,
                `nonce        ${e.payment.nonce}`,
                `deadline     ${new Date(Number(e.payment.deadline) * 1000).toLocaleTimeString()}`,
              ].join("\n"),
            });
        },
      });
      try {
        const res = await payingFetch(req.url, req.init);
        if (res.paid) {
          update(id, (r) => ({
            ...r,
            status: "paid",
            paymentId: res.paid?.paymentId,
            transaction: res.paid?.transaction,
            answer: res.rawBody,
            steps: [...r.steps, { tone: "good", title: "The contract checked every rule and paid the seller" }],
          }));
        } else if (res.refused) {
          update(id, (r) => ({
            ...r,
            status: "refused",
            reason: res.refused,
            steps: [...r.steps, { tone: "bad", title: `The contract refused: ${refusalText(res.refused)}. Nothing was paid.` }],
          }));
        } else {
          update(id, (r) => ({ ...r, status: "error", reason: `The API answered ${res.status}` }));
        }
      } catch {
        update(id, (r) => ({ ...r, status: "error", reason: "Couldn't reach the example API. Is it running?" }));
      }
      refresh();
    }
    setBusy(false);
  }

  const l = mandate?.limits;
  const now = Math.floor(Date.now() / 1000);
  const start = mandate ? Number(mandate.periodStart) : 0;
  const period = l ? Number(l.period) : 1;
  const periodEnd = start + period * (Math.floor((now - start) / period) + 1);
  const spentToday = l && remaining ? l.maxPeriodSpend - remaining.period : 0n;

  return (
    <div className="pg">
      <section className="pg-col pg-actions" aria-labelledby="pg-do">
        <h2 id="pg-do">Make the agent…</h2>
        <p className="small quiet">
          {mode === "demo" ? "Using the shared demo budget." : "Using your own budget."} The agent&apos;s key is a test key that only lives in
          this page.
        </p>
        <div className="pg-buttons">
          {actions.map((a) => (
            <button key={a.key} type="button" className={`pg-action ${a.key === "scam" || a.key === "report" ? "risky" : ""}`} onClick={() => void play(a)} disabled={busy}>
              <strong>{a.title}</strong>
              <span>{a.note}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="pg-col pg-log" aria-labelledby="pg-what" aria-live="polite">
        <h2 id="pg-what">What happened</h2>
        {runs.length === 0 ? (
          <p className="pg-empty">Click a button. Each step of the payment appears here as it happens.</p>
        ) : (
          <ol className="pg-runs">
            {runs.map((r, idx) => (
              <li key={r.id} className={`pg-run ${r.status}`}>
                <div className="pg-run-head">
                  <strong>{r.label}</strong>
                  <span className={`pg-verdict ${r.status}`}>
                    {r.status === "running" ? (
                      "Working…"
                    ) : r.status === "paid" ? (
                      <>
                        <CheckIcon className="inline-icon" /> Paid
                      </>
                    ) : r.status === "refused" ? (
                      <>
                        <StopIcon className="inline-icon" /> Refused
                      </>
                    ) : (
                      "Error"
                    )}
                  </span>
                </div>
                <ol className="pg-steps">
                  {r.steps.map((s, i) => (
                    <li key={i} className={s.tone}>
                      {s.title}
                      {s.detail && (
                        <details>
                          <summary>See what was signed</summary>
                          <pre>{s.detail}</pre>
                        </details>
                      )}
                    </li>
                  ))}
                </ol>
                {r.status === "paid" && (
                  <div className="pg-result">
                    <p>{r.action.lesson.paid}</p>
                    {r.answer &&
                      (idx === 0 ? (
                        <pre className="pg-answer">{pretty(r.answer)}</pre>
                      ) : (
                        <details className="pg-more">
                          <summary>See the answer</summary>
                          <pre className="pg-answer">{pretty(r.answer)}</pre>
                        </details>
                      ))}
                    <p className="small">
                      {r.transaction && <>Transaction <TxLink hash={r.transaction as Hex} /> · </>}
                      {r.paymentId && receipts.get(r.paymentId.toLowerCase()) ? (
                        <Link href={`/app/r/${r.paymentId}`}>Receipt recorded on-chain</Link>
                      ) : (
                        <span className="quiet">Recording the receipt…</span>
                      )}
                    </p>
                  </div>
                )}
                {r.status === "refused" && (
                  <div className="pg-result">
                    <p>{refusalLesson(r.action, r.reason)}</p>
                    <p className="small quiet">
                      Reason from the contract: <code>{r.reason}</code>
                    </p>
                  </div>
                )}
                {r.status === "error" && <p className="small pg-result">{r.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="pg-col pg-budget" aria-labelledby="pg-budget">
        <h2 id="pg-budget">The budget</h2>
        {mandate && l && remaining ? (
          <>
            <p className="small quiet">
              Mandate #{mandateId.toString()} · {state === "revoked" ? "revoked" : state === "expired" ? "expired" : `${amount(l.maxSinglePayment)} per call`}
            </p>
            <div className="meters">
              <Meter
                name="Today"
                hint={state === "active" ? `Resets in ${duration(periodEnd - now)}` : undefined}
                used={amount(spentToday)}
                of={amount(l.maxPeriodSpend)}
                ratio={ratio(spentToday, l.maxPeriodSpend)}
                left={`${amount(remaining.period)} left today`}
              />
              <Meter
                name="In total"
                hint={`Ends ${dateTime(Number(l.expiresAt))}`}
                used={amount(mandate.totalSpent)}
                of={amount(l.maxTotalSpend)}
                ratio={ratio(mandate.totalSpent, l.maxTotalSpend)}
                left={`${amount(remaining.total)} left`}
              />
              <Meter
                name="Escrow"
                hint="Paid to sellers so far"
                used={amount(mandate.totalSpent)}
                of={amount(mandate.totalSpent + remaining.balance)}
                ratio={ratio(mandate.totalSpent, mandate.totalSpent + remaining.balance)}
                left={`${amount(remaining.balance)} tUSD8 left`}
              />
            </div>
            <h3 className="pg-sub">Allowed sellers</h3>
            <ul className="pg-sellers">
              <li className="good">
                <CheckIcon className="inline-icon" /> The example API <span className="hash">{short(cfg.seller)}</span>
              </li>
              <li className={scamAllowed ? "good" : "bad"}>
                {scamAllowed ? <CheckIcon className="inline-icon" /> : <StopIcon className="inline-icon" />} The scam API{" "}
                <span className="hash">{short(SCAM_SELLER)}</span> {scamAllowed ? "(you allowed it)" : "(not allowed)"}
              </li>
            </ul>
            {mode === "own" && isOwner && (
              <OwnerControls id={mandateId} scamAllowed={scamAllowed} revoked={state === "revoked"} sellers={sellers.map((s) => s.address)} onForget={onForget} />
            )}
            {mode === "own" && !isOwner && (
              <Notice tone="warn">
                Connect the wallet that created this budget to change its rules.{" "}
                <button type="button" className="linklike" onClick={onForget}>
                  Start over with a new budget
                </button>
              </Notice>
            )}
            {mode === "demo" && (
              <p className="small quiet">
                This budget is shared by everyone trying the Playground. Switch to <strong>Your own budget</strong> to change the rules.
              </p>
            )}
          </>
        ) : (
          <p className="small quiet">Loading the budget…</p>
        )}
      </section>
    </div>
  );
}

/** Rule changes for the visitor's own budget, so they can see each one change the next result. */
function OwnerControls({ id, scamAllowed, revoked, sellers, onForget }: { id: bigint; scamAllowed: boolean; revoked: boolean; sellers: Address[]; onForget: () => void }) {
  const { mandate, remaining } = useMandate(id);
  const tx = useSend();
  if (!mandate || !remaining) return null;
  return (
    <div className="pg-controls">
      <h3 className="pg-sub">Change the rules</h3>
      {!revoked && (
        <button type="button" className="btn small quiet" disabled={tx.busy} onClick={() => void tx.mandateCall("setPayee", [id, SCAM_SELLER, !scamAllowed])}>
          {scamAllowed ? "Remove the scam seller" : "Allow the scam seller"}
        </button>
      )}
      <Actions id={id} limits={mandate.limits} balance={remaining.balance} agent={mandate.agent} revoked={revoked} sellers={sellers} />
      <TxStatus phase={tx.phase} error={tx.error} hash={tx.hash} doneText="Updated. Try the agent again." />
      <button type="button" className="linklike small" onClick={onForget}>
        Start over with a new budget
      </button>
    </div>
  );
}

/** Creates the visitor's own small budget, with a fresh test agent key kept in this browser. */
function CreateOwn({ onCreated }: { onCreated: (own: Own) => void }) {
  const cfg = playground!;
  const { net } = useNetwork();
  const { isConnected } = useAccount();
  const { token, balance, allowance, refetch } = useToken();
  const tx = useSend();
  const [step, setStep] = useState<"idle" | "approve" | "create">("idle");
  const deposit = 500000n; // 0.50 tUSD8
  const limits = { maxSinglePayment: 50000n, maxPeriodSpend: 80000n, maxTotalSpend: 500000n, period: 86400 };

  async function create() {
    if (!token || !net.mandate) return;
    const key = generatePrivateKey();
    const agent = privateKeyToAccount(key).address;
    if ((allowance ?? 0n) < deposit) {
      setStep("approve");
      const ok = await tx.send(token, erc20Abi as Abi, "approve", [net.mandate, deposit]);
      await refetch();
      if (!ok) return setStep("idle");
    }
    setStep("create");
    const receipt = await tx.mandateCall("createNamedMandate", [
      "Playground",
      agent,
      ZERO,
      "0x",
      { ...limits, expiresAt: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400) },
      [cfg.seller],
      deposit,
    ]);
    setStep("idle");
    if (!receipt) return;
    const created = parseEventLogs({ abi: agentMandateAbi, logs: receipt.logs, eventName: "MandateCreated" })[0];
    if (created) onCreated({ id: created.args.mandateId.toString(), key });
  }

  const short0 = balance !== undefined && balance < deposit;
  return (
    <div className="pg-create">
      <h2>Create your own budget</h2>
      <p>
        You&apos;ll own a small mandate and can change its rules while you play: allow the scam seller, raise the per-call cap, or revoke it
        and watch the agent get refused.
      </p>
      <dl className="pg-terms">
        <div>
          <dt>Deposit</dt>
          <dd>0.50 tUSD8</dd>
        </div>
        <div>
          <dt>Per call</dt>
          <dd>0.05</dd>
        </div>
        <div>
          <dt>Per day</dt>
          <dd>0.08</dd>
        </div>
        <div>
          <dt>Valid for</dt>
          <dd>7 days</dd>
        </div>
      </dl>
      <p className="small quiet">
        A new test key is created for the agent and kept in this browser only. You can withdraw whatever is left at any time.
      </p>
      {!isConnected ? (
        <div className="row">
          <WalletButton />
          <span className="small quiet">Connect a wallet with a little tUSD8 and tQDAY on {net.label}.</span>
        </div>
      ) : (
        <>
          {short0 && <Notice tone="warn">This wallet has {amount(balance!)} tUSD8. You need 0.50 to create the budget.</Notice>}
          <button type="button" className="btn" disabled={tx.busy || short0} onClick={() => void create()}>
            {step === "approve" ? "Approving…" : step === "create" ? "Creating…" : "Create my budget"}
          </button>
          <TxStatus phase={tx.phase} error={tx.error} hash={tx.hash} doneText="Created." />
        </>
      )}
    </div>
  );
}

/** The action's own lesson when it was refused for the reason it demonstrates; otherwise what actually stopped it. */
function refusalLesson(action: PlayAction, reason: string | undefined) {
  const name = (reason ?? "").replace(/^mandate_/, "");
  if (action.expects === name) return action.lesson.refused;
  const why: Record<string, string> = {
    ExceedsPeriodBudget: "Today's budget is already used up, so the contract refuses every payment until it resets.",
    ExceedsTotalBudget: "The total budget is used up, so the contract refuses every payment.",
    MandateIsRevoked: "The owner revoked this budget, so the agent can't spend from it anymore.",
    InsufficientBalance: "There isn't enough tUSD8 left in escrow for this payment.",
    MandateExpired: "This budget has expired.",
  };
  return why[name] ?? (action.expects ? `The contract refused it: ${refusalText(reason)}.` : action.lesson.refused);
}

const fmt = (units: string) => formatUnits(BigInt(units), 6);

function pathOf(url: string) {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function pretty(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2).slice(0, 600);
  } catch {
    return body.slice(0, 600);
  }
}
