"use client";

import { erc20Abi } from "@aevum-kit/aevum";
import { useState } from "react";
import { isAddress, type Abi, type Address } from "viem";
import { useAccount } from "wagmi";
import { amount, parseAmount } from "@/lib/format";
import { mandateKey, setLabel, useLabels } from "@/lib/labels";
import { useSend, useToken } from "@/lib/mandate";
import { useNetwork } from "@/lib/network";
import { Modal, Notice, TxStatus } from "../ui";

type Limits = { maxSinglePayment: bigint; maxPeriodSpend: bigint; maxTotalSpend: bigint; period: number; expiresAt: bigint };
type Dialog = "topup" | "withdraw" | "limits" | "agent" | "revoke" | "rename" | null;

export function Actions({ id, limits, balance, agent, revoked, sellers = [] }: { id: bigint; limits: Limits; balance: bigint; agent: Address; revoked: boolean; sellers?: Address[] }) {
  const [open, setOpen] = useState<Dialog>(null);
  const close = () => setOpen(null);
  return (
    <div className="actions" aria-label="Manage this mandate">
      {!revoked && (
        <>
          <button type="button" className="btn" onClick={() => setOpen("topup")}>
            Top up
          </button>
          <button type="button" className="btn quiet" onClick={() => setOpen("limits")}>
            Change limits
          </button>
          <button type="button" className="btn quiet" onClick={() => setOpen("agent")}>
            Change agent
          </button>
        </>
      )}
      <button type="button" className="btn quiet" onClick={() => setOpen("withdraw")} disabled={balance === 0n}>
        Withdraw
      </button>
      <button type="button" className="btn quiet" onClick={() => setOpen("rename")}>
        Rename
      </button>
      {!revoked && (
        <button type="button" className="btn danger quiet" onClick={() => setOpen("revoke")}>
          Revoke
        </button>
      )}
      {revoked && <p className="actions-note">Revoked mandates can&apos;t spend again. Withdraw what&apos;s left, or create a new mandate.</p>}

      {open === "topup" && <TopUp id={id} onClose={close} />}
      {open === "withdraw" && <Withdraw id={id} balance={balance} onClose={close} />}
      {open === "limits" && <ChangeLimits id={id} limits={limits} onClose={close} />}
      {open === "agent" && <ChangeAgent id={id} agent={agent} sellers={sellers} onClose={close} />}
      {open === "revoke" && <Revoke id={id} onClose={close} />}
      {open === "rename" && <Rename id={id} onClose={close} />}
    </div>
  );
}

function AmountField({ label, value, onChange, hint, invalid }: { label: string; value: string; onChange: (v: string) => void; hint?: string; invalid?: boolean }) {
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

function TopUp({ id, onClose }: { id: bigint; onClose: () => void }) {
  const { net } = useNetwork();
  const { token, balance, allowance, refetch } = useToken();
  const tx = useSend();
  const [value, setValue] = useState("1");
  const amt = parseAmount(value);
  const tooMuch = amt !== undefined && balance !== undefined && amt > balance;
  const needsApproval = amt !== undefined && (allowance ?? 0n) < amt;

  async function go() {
    if (!amt || !token) return;
    if (needsApproval) {
      const ok = await tx.send(token, erc20Abi as Abi, "approve", [net.mandate!, amt]);
      await refetch();
      if (!ok) return;
    }
    const done = await tx.mandateCall("deposit", [id, amt]);
    if (done) onClose();
  }

  return (
    <Modal title="Top up the escrow" onClose={onClose}>
      <p className="small">tUSD8 moves from your wallet into this mandate. The agent still can&apos;t spend more than its limits.</p>
      <AmountField label="Amount" value={value} onChange={setValue} invalid={value !== "" && (!amt || tooMuch)} hint={`In your wallet: ${amount(balance)} tUSD8`} />
      {tooMuch && <Notice tone="bad">That&apos;s more than your wallet holds.</Notice>}
      {needsApproval && !tooMuch && amt && <p className="small quiet">Two steps: approve the contract to take {amount(amt)} tUSD8, then deposit.</p>}
      <TxStatus phase={tx.phase} error={tx.error} hash={tx.hash} doneText="Deposited." />
      <div className="modal-actions">
        <button type="button" className="btn quiet" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={!amt || tooMuch || tx.busy} onClick={go}>
          {needsApproval ? "Approve and top up" : "Top up"}
        </button>
      </div>
    </Modal>
  );
}

function Withdraw({ id, balance, onClose }: { id: bigint; balance: bigint; onClose: () => void }) {
  const { address } = useAccount();
  const tx = useSend();
  const [value, setValue] = useState(amount(balance).replace(/,/g, ""));
  const amt = parseAmount(value);
  const tooMuch = amt !== undefined && amt > balance;
  return (
    <Modal title="Withdraw from escrow" onClose={onClose}>
      <p className="small">tUSD8 goes back to your wallet. The agent can keep spending whatever stays in escrow, within its limits.</p>
      <AmountField label="Amount" value={value} onChange={setValue} invalid={value !== "" && (!amt || tooMuch)} hint={`In escrow: ${amount(balance)} tUSD8`} />
      {tooMuch && <Notice tone="bad">That&apos;s more than the mandate holds.</Notice>}
      <TxStatus phase={tx.phase} error={tx.error} hash={tx.hash} doneText="Withdrawn." />
      <div className="modal-actions">
        <button type="button" className="btn quiet" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn"
          disabled={!amt || tooMuch || tx.busy || !address}
          onClick={async () => {
            if (await tx.mandateCall("withdraw", [id, amt!, address!])) onClose();
          }}
        >
          Withdraw
        </button>
      </div>
    </Modal>
  );
}

function ChangeLimits({ id, limits, onClose }: { id: bigint; limits: Limits; onClose: () => void }) {
  const tx = useSend();
  const [perCall, setPerCall] = useState(amount(limits.maxSinglePayment));
  const [perDay, setPerDay] = useState(amount(limits.maxPeriodSpend).replace(/,/g, ""));
  const [total, setTotal] = useState(amount(limits.maxTotalSpend).replace(/,/g, ""));
  const daysLeft = Math.max(1, Math.round((Number(limits.expiresAt) - Date.now() / 1000) / 86400));
  const [days, setDays] = useState(String(daysLeft));
  const a = parseAmount(perCall);
  const b = parseAmount(perDay);
  const c = parseAmount(total);
  const d = Number(days);
  const problem =
    !a || !b || !c || !Number.isInteger(d) || d < 1
      ? "Fill in every limit with a positive number."
      : a > b
        ? "Per call can't be more than per day."
        : b > c
          ? "Per day can't be more than the total."
          : undefined;

  return (
    <Modal title="Change limits" onClose={onClose}>
      <p className="small">New limits apply to the agent&apos;s next payment. What it has already spent still counts.</p>
      <div className="grid-3">
        <AmountField label="Per call" value={perCall} onChange={setPerCall} />
        <AmountField label="Per day" value={perDay} onChange={setPerDay} />
        <AmountField label="In total" value={total} onChange={setTotal} />
      </div>
      <label className="field">
        <span className="field-label">Valid for (days from now)</span>
        <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
      </label>
      {problem && <Notice tone="warn">{problem}</Notice>}
      <TxStatus phase={tx.phase} error={tx.error} hash={tx.hash} doneText="Limits updated." />
      <div className="modal-actions">
        <button type="button" className="btn quiet" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn"
          disabled={Boolean(problem) || tx.busy}
          onClick={async () => {
            const expiresAt = BigInt(Math.floor(Date.now() / 1000) + d * 86400);
            const ok = await tx.mandateCall("setLimits", [id, { maxSinglePayment: a!, maxPeriodSpend: b!, maxTotalSpend: c!, period: limits.period, expiresAt }]);
            if (ok) onClose();
          }}
        >
          Save limits
        </button>
      </div>
    </Modal>
  );
}

function ChangeAgent({ id, agent, sellers, onClose }: { id: bigint; agent: Address; sellers: Address[]; onClose: () => void }) {
  const tx = useSend();
  const [value, setValue] = useState("");
  const valid = isAddress(value.trim());
  const isSeller = valid && sellers.some((s) => s.toLowerCase() === value.trim().toLowerCase());
  return (
    <Modal title="Change agent" onClose={onClose}>
      <p className="small">
        Use this if the agent&apos;s key leaked or you&apos;re replacing the agent. The old key stops working at once, payments it already signed
        included. The money stays in the mandate.
      </p>
      <p className="small quiet">
        Current agent: <span className="hash">{agent}</span>
      </p>
      <label className="field">
        <span className="field-label">New agent address</span>
        <input type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0x…" aria-invalid={value !== "" && (!valid || isSeller)} spellCheck={false} />
        {isSeller && <span className="field-error">That's one of this mandate's allowed sellers. The agent and a seller must be different addresses: an agent paying itself would let it move money out freely.</span>}
      </label>
      <TxStatus phase={tx.phase} error={tx.error} hash={tx.hash} doneText="Agent changed." />
      <div className="modal-actions">
        <button type="button" className="btn quiet" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn"
          disabled={!valid || isSeller || tx.busy}
          onClick={async () => {
            if (await tx.mandateCall("setAgent", [id, value.trim() as Address, "0x0000000000000000000000000000000000000000", "0x"])) onClose();
          }}
        >
          Change agent
        </button>
      </div>
    </Modal>
  );
}

function Revoke({ id, onClose }: { id: bigint; onClose: () => void }) {
  const tx = useSend();
  return (
    <Modal title="Revoke this mandate?" onClose={onClose}>
      <p>
        The agent stops at once: every payment after this is refused, including ones it already signed. You can&apos;t undo a revoke. The tUSD8
        in escrow stays yours to withdraw.
      </p>
      <TxStatus phase={tx.phase} error={tx.error} hash={tx.hash} doneText="Revoked." />
      <div className="modal-actions">
        <button type="button" className="btn quiet" onClick={onClose}>
          Keep it running
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={tx.busy}
          onClick={async () => {
            if (await tx.mandateCall("revoke", [id])) onClose();
          }}
        >
          Revoke mandate
        </button>
      </div>
    </Modal>
  );
}

function Rename({ id, onClose }: { id: bigint; onClose: () => void }) {
  const { net } = useNetwork();
  const { mandateName } = useLabels();
  const [value, setValue] = useState(mandateName(net.mandate, id));
  return (
    <Modal title="Rename" onClose={onClose}>
      <p className="small">Names are saved in this browser only. They aren&apos;t on the blockchain.</p>
      <label className="field">
        <span className="field-label">Name</span>
        <input type="text" value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} />
      </label>
      <div className="modal-actions">
        <button type="button" className="btn quiet" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setLabel(mandateKey(net.mandate!, id), value);
            onClose();
          }}
        >
          Save name
        </button>
      </div>
    </Modal>
  );
}
