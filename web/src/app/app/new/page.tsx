"use client";

import { agentMandateAbi, erc20Abi } from "@aevum-kit/aevum";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { isAddress, parseEventLogs, type Abi, type Address } from "viem";
import { useAccount } from "wagmi";
import { amount, parseAmount, short } from "@/lib/format";
import { mandateKey, sellerKey, setLabel } from "@/lib/labels";
import { useSend, useToken } from "@/lib/mandate";
import { useNetwork } from "@/lib/network";
import { Cheque } from "@/components/Cheque";
import { CheckIcon, ClockIcon } from "@/components/Icons";
import { Notice, StateMark, TxStatus } from "@/components/ui";
import { useTestWallet } from "@/components/WalletButton";

type SellerRow = { address: string; name: string };

export default function NewMandatePage() {
  return (
    <Suspense fallback={<p className="quiet">Loading…</p>}>
      <NewMandate />
    </Suspense>
  );
}

const SAME_ADDRESS = "The agent and a seller can't be the same address. The agent's address belongs to the key that signs payments; a seller's is where an API gets paid.";

function NewMandate() {
  const router = useRouter();
  const params = useSearchParams();
  const testWallet = useTestWallet();
  const { net } = useNetwork();
  const { address: owner } = useAccount();
  const { token, balance, allowance, refetch } = useToken();
  const tx = useSend();

  const [name, setName] = useState("");
  const [agent, setAgent] = useState("");
  const [perCall, setPerCall] = useState("0.05");
  const [perDay, setPerDay] = useState("1");
  const [total, setTotal] = useState("3");
  const [days, setDays] = useState("30");
  const [deposit, setDeposit] = useState("5");
  // Opened from a seller's "allow me" link: start with that seller on the list.
  const [sellers, setSellers] = useState<SellerRow[]>(() => {
    const s = params.get("seller") ?? "";
    return [{ address: isAddress(s) ? s : "", name: "" }];
  });
  const [step, setStep] = useState<"form" | "approve" | "create">("form");
  const [tried, setTried] = useState(false);

  const a = parseAmount(perCall);
  const b = parseAmount(perDay);
  const c = parseAmount(total);
  const dep = deposit.trim() === "" ? 0n : parseAmount(deposit);
  const d = Number(days);
  const validSellers = sellers.filter((s) => isAddress(s.address.trim()));
  const badSeller = sellers.some((s) => s.address.trim() !== "" && !isAddress(s.address.trim()));
  const isAgent = (s: SellerRow) => isAddress(agent.trim()) && s.address.trim().toLowerCase() === agent.trim().toLowerCase();
  const sameAsAgent = sellers.some(isAgent);
  const noTokensHere = testWallet.suggest && balance === 0n;

  const problems: string[] = [];
  if (!isAddress(agent.trim())) problems.push("Enter the agent's address.");
  if (owner && agent.trim().toLowerCase() === owner.toLowerCase()) problems.push("Use a separate address for the agent, not your own wallet.");
  if (!a || !b || !c) problems.push("Every limit needs a positive amount.");
  else if (a > b) problems.push("Per call can't be more than per day.");
  else if (b > c) problems.push("Per day can't be more than the total.");
  if (!Number.isInteger(d) || d < 1) problems.push("Valid for must be at least 1 day.");
  if (dep === undefined) problems.push("The deposit must be an amount, or empty.");
  if (dep && balance !== undefined && dep > balance) problems.push(`You have ${amount(balance)} tUSD8: the deposit is more than that.`);
  if (badSeller) problems.push("One of the seller addresses isn't valid.");
  if (sameAsAgent) problems.push(SAME_ADDRESS);
  if (validSellers.length === 0) problems.push("Allow at least one seller, or every payment will be refused.");

  const needsApproval = Boolean(dep && dep > 0n && (allowance ?? 0n) < dep);

  async function create() {
    setTried(true);
    if (problems.length || !token || !net.mandate) return;
    if (needsApproval) {
      setStep("approve");
      const ok = await tx.send(token, erc20Abi as Abi, "approve", [net.mandate, dep!]);
      await refetch();
      if (!ok) return setStep("form");
    }
    setStep("create");
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + d * 86400);
    const receipt = await tx.mandateCall("createMandate", [
      agent.trim() as Address,
      "0x0000000000000000000000000000000000000000",
      "0x",
      { maxSinglePayment: a!, maxPeriodSpend: b!, maxTotalSpend: c!, period: 86400, expiresAt },
      validSellers.map((s) => s.address.trim() as Address),
      dep ?? 0n,
    ]);
    if (!receipt) return setStep("form");
    const created = parseEventLogs({ abi: agentMandateAbi, logs: receipt.logs, eventName: "MandateCreated" })[0];
    if (!created) return setStep("form");
    const id = created.args.mandateId;
    if (name.trim()) setLabel(mandateKey(net.mandate, id), name);
    for (const s of validSellers) if (s.name.trim()) setLabel(sellerKey(s.address.trim()), s.name);
    router.push(`/app/m/${id}`);
  }

  const busy = tx.busy;
  const expires = new Date(Date.now() + (Number.isInteger(d) && d > 0 ? d : 0) * 86400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New mandate</h1>
          <p className="lead">Give one AI agent a budget: who it may pay, and how much per call, per day and in total.</p>
        </div>
      </div>

      <div className="create-grid">
        <form
          className="create-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <fieldset className="fieldset">
            <legend>The agent</legend>
            <label className="field">
              <span className="field-label">Name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Research agent" />
              <span className="field-hint">Saved in this browser only.</span>
            </label>
            <label className="field">
              <span className="field-label">Agent address</span>
              <input
                type="text"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="0x…"
                spellCheck={false}
                aria-invalid={(tried || agent !== "") && !isAddress(agent.trim())}
              />
              <span className="field-hint">The address of the key your agent signs with. It needs no tUSD8 and no gas.</span>
            </label>
          </fieldset>

          <fieldset className="fieldset">
            <legend>Limits</legend>
            <div className="grid-3">
              <Amount label="Per call" value={perCall} onChange={setPerCall} />
              <Amount label="Per day" value={perDay} onChange={setPerDay} />
              <Amount label="In total" value={total} onChange={setTotal} />
            </div>
            <div className="grid-2">
              <label className="field">
                <span className="field-label">Valid for</span>
                <span className="unit-input">
                  <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
                  <span>days</span>
                </span>
              </label>
              <Amount label="Deposit now" value={deposit} onChange={setDeposit} hint={`In your wallet: ${amount(balance)} tUSD8`} />
            </div>
            {noTokensHere && (
              <Notice tone="warn">
                This wallet has no tUSD8 on the {net.label.toLowerCase()}. The local test wallet has some, and owns the sample mandates.{" "}
                <button type="button" className="linklike" onClick={() => void testWallet.use()}>
                  Switch to the local test wallet
                </button>
              </Notice>
            )}
          </fieldset>

          <fieldset className="fieldset">
            <legend>Allowed sellers</legend>
            <p className="field-hint">The only addresses the agent can pay. You can change this later.</p>
            {sellers.map((s, i) => (
              <div className="grid-2" key={i}>
                <label className="field">
                  <span className="field-label">Seller address</span>
                  <input
                    type="text"
                    value={s.address}
                    placeholder="0x…"
                    spellCheck={false}
                    aria-invalid={s.address !== "" && (!isAddress(s.address.trim()) || isAgent(s))}
                    onChange={(e) => setSellers((rows) => rows.map((r, j) => (j === i ? { ...r, address: e.target.value } : r)))}
                  />
                  {isAgent(s) && <span className="field-error">Same as the agent. Use the API&apos;s own address.</span>}
                </label>
                <label className="field">
                  <span className="field-label">Name (optional)</span>
                  <input
                    type="text"
                    value={s.name}
                    placeholder="Price API"
                    onChange={(e) => setSellers((rows) => rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                  />
                </label>
              </div>
            ))}
            <div className="row">
              <button type="button" className="btn small quiet" onClick={() => setSellers((r) => [...r, { address: "", name: "" }])}>
                Add another seller
              </button>
              {sellers.length > 1 && (
                <button type="button" className="linklike small" onClick={() => setSellers((r) => r.slice(0, -1))}>
                  Remove the last one
                </button>
              )}
            </div>
          </fieldset>

          {tried && problems.length > 0 && (
            <Notice tone="warn">
              <ul style={{ margin: 0, paddingLeft: "1.1em" }}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Notice>
          )}

          <div className="stack" style={{ ["--gap" as string]: "12px" }}>
            {needsApproval && (
              <ol className="steps-tx" aria-label="Transactions">
                <li className={step === "create" ? "done" : ""}>
                  {step === "create" ? <CheckIcon /> : <ClockIcon />} 1. Approve the contract to take {amount(dep ?? 0n)} tUSD8
                </li>
                <li>
                  <ClockIcon /> 2. Create the mandate and deposit
                </li>
              </ol>
            )}
            <TxStatus phase={tx.phase} error={tx.error} hash={tx.hash} doneText={step === "approve" ? "Approved." : "Mandate created. Opening it…"} />
            <div className="row">
              <button type="submit" className="btn" disabled={busy || !owner}>
                {busy ? (step === "approve" ? "Approving…" : "Creating…") : needsApproval ? "Approve and create mandate" : "Create mandate"}
              </button>
              {!owner && <span className="small quiet">Connect your wallet first.</span>}
            </div>
          </div>
        </form>

        <aside className="preview" aria-label="Preview">
          <span className="small quiet">Preview</span>
          <Cheque
            number="New"
            title={name || "Unnamed mandate"}
            status={<StateMark state="active" />}
            agent={isAddress(agent.trim()) ? short(agent.trim()) : "0x…"}
            sellers={validSellers.length}
            perCall={a ? amount(a) : "–"}
            perDay={b ? amount(b) : "–"}
            total={c ? amount(c) : "–"}
            escrow={dep ? amount(dep) : "0.00"}
            owner={owner ? "You" : "–"}
            expires={expires}
          />
          <p className="small quiet">
            At most {b ? amount(b) : "–"} tUSD8 a day and {c ? amount(c) : "–"} in total can leave this mandate, whatever the agent signs. You can top up,
            withdraw or revoke at any time.
          </p>
        </aside>
      </div>
    </>
  );
}

function Amount({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const invalid = value.trim() !== "" && parseAmount(value) === undefined;
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="unit-input">
        <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid} />
        <span>tUSD8</span>
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
