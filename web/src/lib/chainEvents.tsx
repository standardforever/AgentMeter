"use client";

/**
 * Reads every event AgentMandate has emitted, once, then keeps up with new blocks.
 *
 * Why one scanner instead of a query per screen: Aevum's RPC answers at most 1,000 blocks per
 * eth_getLogs call. Scanning the contract once from its deploy block, then only asking for the new
 * blocks every few seconds, keeps the dashboard live while sending very few requests. Every screen
 * derives what it needs (mandates, sellers, payments, receipts) from this one list.
 */
import { agentMandateAbi, MAX_LOG_RANGE } from "@aevum-kit/aevum";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { parseEventLogs, type Address, type Chain, type Hex, type Log } from "viem";
import { usePublicClient } from "wagmi";
import { useNetwork } from "./network";

type MandateLog = ReturnType<typeof parseEventLogs<typeof agentMandateAbi>>[number];

export type ChainEvent = MandateLog & { time?: number };

type Status = "no-contract" | "loading" | "ready" | "error";

interface ChainEventsState {
  status: Status;
  /** 0..1 while the first scan runs. */
  progress: number;
  events: ChainEvent[];
  contract?: Address;
  error?: string;
  /** Check for new blocks now (call after sending a transaction). */
  refresh: () => void;
}

const Ctx = createContext<ChainEventsState | null>(null);
const POLL_MS = 3000;
/** Without a deploy block, look back this far (about 2 days at 1 block per second). */
const FALLBACK_LOOKBACK = 200_000n;

/** Re-read this many recent blocks from the RPC after loading history from the explorer, in case it lags. */
const EXPLORER_LAG_BLOCKS = 300n;
const EXPLORER_MAX_PAGES = 40;

/**
 * The contract's whole event history from the chain's Blockscout explorer, a few requests in total.
 * Scanning the RPC instead takes one request per 1,000 blocks since the deploy, which grows every day.
 * Returns undefined if the chain has no explorer or the explorer fails, so the caller can fall back.
 */
async function historyFromExplorer(chain: Chain, contract: Address): Promise<Log[] | undefined> {
  const base = chain.blockExplorers?.default.url;
  if (!base) return undefined;
  try {
    const logs: Log[] = [];
    let params: Record<string, string | number> | null = {};
    for (let page = 0; params && page < EXPLORER_MAX_PAGES; page++) {
      const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
      const res = await fetch(`${base}/api/v2/addresses/${contract}/logs${query ? `?${query}` : ""}`);
      if (!res.ok) return undefined;
      const body = (await res.json()) as {
        items: { address: string | { hash: string }; topics: (Hex | null)[]; data: Hex; block_number: number; block_hash: Hex; transaction_hash: Hex; index: number }[];
        next_page_params: Record<string, string | number> | null;
      };
      for (const i of body.items) {
        logs.push({
          address: (typeof i.address === "string" ? i.address : i.address.hash) as Address,
          topics: i.topics.filter((t): t is Hex => !!t) as [Hex, ...Hex[]],
          data: i.data,
          blockNumber: BigInt(i.block_number),
          blockHash: i.block_hash,
          transactionHash: i.transaction_hash,
          logIndex: i.index,
          transactionIndex: null,
          removed: false,
        } as unknown as Log);
      }
      params = body.next_page_params;
    }
    if (params) return undefined; // more history than we're willing to page through: use the RPC scan
    return logs.sort((a, b) => (a.blockNumber! === b.blockNumber! ? a.logIndex! - b.logIndex! : a.blockNumber! < b.blockNumber! ? -1 : 1));
  } catch {
    return undefined;
  }
}

export function ChainEventsProvider({ children }: { children: ReactNode }) {
  const { net } = useNetwork();
  const client = usePublicClient({ chainId: net.chain.id });
  const contract = net.mandate;
  const [state, setState] = useState<Omit<ChainEventsState, "refresh">>({ status: contract ? "loading" : "no-contract", progress: 0, events: [] });
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    if (!client || !contract) {
      setState({ status: "no-contract", progress: 0, events: [] });
      return;
    }
    let stopped = false;
    let scanned: bigint | undefined;
    const events: ChainEvent[] = [];
    const seen = new Set<string>();
    const times = new Map<bigint, number>();
    /** Keep only events we don't have yet (the explorer and the RPC catch-up can overlap). */
    const fresh = (list: ChainEvent[]) =>
      list.filter((e) => {
        const key = `${e.transactionHash}:${e.logIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    setState({ status: "loading", progress: 0, events: [], contract });

    async function stamp(list: ChainEvent[]) {
      const blocks = [...new Set(list.map((e) => e.blockNumber).filter((b) => !times.has(b)))];
      for (let i = 0; i < blocks.length; i += 8) {
        await Promise.all(
          blocks.slice(i, i + 8).map(async (blockNumber) => {
            const block = await client!.getBlock({ blockNumber });
            times.set(blockNumber, Number(block.timestamp));
          }),
        );
      }
      for (const e of list) e.time = times.get(e.blockNumber);
    }

    async function scan(from: bigint, to: bigint, initial: boolean) {
      const total = to - from + 1n;
      for (let start = from; start <= to && !stopped; start += MAX_LOG_RANGE) {
        const end = start + MAX_LOG_RANGE - 1n > to ? to : start + MAX_LOG_RANGE - 1n;
        const logs = await client!.getLogs({ address: contract, fromBlock: start, toBlock: end });
        const parsed = fresh(parseEventLogs({ abi: agentMandateAbi, logs }) as ChainEvent[]);
        await stamp(parsed);
        events.push(...parsed);
        scanned = end;
        if (initial) {
          const progress = total > 0n ? Number(((end - from + 1n) * 100n) / total) / 100 : 1;
          setState((s) => ({ ...s, progress, events: [...events] }));
        } else if (parsed.length) {
          setState((s) => ({ ...s, events: [...events] }));
        }
      }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      if (stopped) return;
      try {
        const head = await client!.getBlockNumber();
        if (scanned === undefined) {
          const start = net.deployBlock > 0n ? net.deployBlock : head > FALLBACK_LOOKBACK ? head - FALLBACK_LOOKBACK : 0n;
          const history = net.hasExplorer ? await historyFromExplorer(net.chain, contract!) : undefined;
          if (history) {
            const parsed = fresh(parseEventLogs({ abi: agentMandateAbi, logs: history }) as ChainEvent[]);
            await stamp(parsed);
            events.push(...parsed);
            // The explorer can lag a little: re-read the last few minutes from the RPC (duplicates are skipped).
            const from = head > start + EXPLORER_LAG_BLOCKS ? head - EXPLORER_LAG_BLOCKS : start;
            await scan(from, head, true);
          } else {
            await scan(start, head, true);
          }
          if (!stopped) setState((s) => ({ ...s, status: "ready", progress: 1 }));
        } else if (head > scanned) {
          await scan(scanned + 1n, head, false);
        }
      } catch (e) {
        console.error("[events] scan failed", e);
        if (scanned === undefined && !stopped) setState((s) => ({ ...s, status: "error", error: "Couldn't read the contract's history from the network." }));
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    }
    wake.current = () => {
      if (timer) clearTimeout(timer);
      void tick();
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, contract, net.deployBlock]);

  const refresh = useCallback(() => wake.current(), []);
  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The scanner's state if this component is inside a ChainEventsProvider, otherwise undefined. */
export function useOptionalChainEvents(): ChainEventsState | undefined {
  return useContext(Ctx) ?? undefined;
}

export function useChainEvents(): ChainEventsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChainEvents must be used inside <ChainEventsProvider>");
  return ctx;
}

/* ------------------------------------------------------------------ selectors */

type Named<N extends ChainEvent["eventName"]> = Extract<ChainEvent, { eventName: N }>;

const is =
  <N extends ChainEvent["eventName"]>(name: N) =>
  (e: ChainEvent): e is Named<N> =>
    e.eventName === name;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function mandateIdsOwnedBy(events: ChainEvent[], owner: Address | undefined): bigint[] {
  if (!owner) return [];
  return events
    .filter(is("MandateCreated"))
    .filter((e) => same(e.args.owner, owner))
    .map((e) => e.args.mandateId)
    .reverse();
}

export function createdAt(events: ChainEvent[], id: bigint): number | undefined {
  return events.filter(is("MandateCreated")).find((e) => e.args.mandateId === id)?.time;
}

/** The current allowlist, folded from PayeeSet events (latest value per seller wins). */
export function allowedSellers(events: ChainEvent[], id: bigint): { address: Address; since?: number }[] {
  const current = new Map<string, { address: Address; allowed: boolean; since?: number }>();
  for (const e of events.filter(is("PayeeSet"))) {
    if (e.args.mandateId !== id) continue;
    current.set(e.args.payee.toLowerCase(), { address: e.args.payee, allowed: e.args.allowed, since: e.time });
  }
  return [...current.values()].filter((p) => p.allowed).map(({ address, since }) => ({ address, since }));
}

export interface PaidPayment {
  paymentId: Hex;
  mandateId: bigint;
  payee: Address;
  amount: bigint;
  resourceHash: Hex;
  requestHash: Hex;
  responseHash?: Hex;
  attestedAt?: number;
  time?: number;
  txHash: Hex;
  blockNumber: bigint;
}

export function payments(events: ChainEvent[], id?: bigint): PaidPayment[] {
  const attested = new Map<string, Named<"ResultAttested">>();
  for (const e of events.filter(is("ResultAttested"))) attested.set(e.args.paymentId, e);
  return events
    .filter(is("PaymentSettled"))
    .filter((e) => id === undefined || e.args.mandateId === id)
    .map((e) => {
      const a = attested.get(e.args.paymentId);
      return {
        paymentId: e.args.paymentId,
        mandateId: e.args.mandateId,
        payee: e.args.payee,
        amount: e.args.amount,
        resourceHash: e.args.resourceHash,
        requestHash: e.args.requestHash,
        responseHash: a?.args.responseHash,
        attestedAt: a?.time,
        time: e.time,
        txHash: e.transactionHash,
        blockNumber: e.blockNumber,
      };
    })
    .reverse();
}

export function isRevokedEvent(events: ChainEvent[], id: bigint): number | undefined {
  return events.filter(is("MandateRevoked")).find((e) => e.args.mandateId === id)?.time;
}

export function funding(events: ChainEvent[], id: bigint) {
  return events
    .filter((e): e is Named<"Deposited"> | Named<"Withdrawn"> => e.eventName === "Deposited" || e.eventName === "Withdrawn")
    .filter((e) => e.args.mandateId === id)
    .map((e) => ({ kind: e.eventName, amount: e.args.amount, time: e.time, txHash: e.transactionHash }));
}

/* ------------------------------------------------------------------ seller side */

/** Every payment made to one seller, newest first, across all mandates. */
export function paymentsTo(events: ChainEvent[], payee: Address | undefined): PaidPayment[] {
  if (!payee) return [];
  return payments(events).filter((p) => same(p.payee, payee));
}

/** The mandates whose allowlist currently includes this seller: the agents that can pay it. */
export function mandatesAllowing(events: ChainEvent[], payee: Address | undefined): { mandateId: bigint; since?: number }[] {
  if (!payee) return [];
  const current = new Map<bigint, { allowed: boolean; since?: number }>();
  for (const e of events.filter(is("PayeeSet"))) {
    if (!same(e.args.payee, payee)) continue;
    current.set(e.args.mandateId, { allowed: e.args.allowed, since: e.time });
  }
  return [...current.entries()].filter(([, v]) => v.allowed).map(([mandateId, v]) => ({ mandateId, since: v.since }));
}

/** Addresses that have been paid or allowed on this contract, most paid first: quick picks for the seller view. */
export function knownSellers(events: ChainEvent[]): { address: Address; paid: number }[] {
  const seen = new Map<string, { address: Address; paid: number }>();
  for (const e of events) {
    if (e.eventName !== "PaymentSettled" && e.eventName !== "PayeeSet") continue;
    const a = (e.args as { payee: Address }).payee;
    const entry = seen.get(a.toLowerCase()) ?? { address: a, paid: 0 };
    if (e.eventName === "PaymentSettled") entry.paid++;
    seen.set(a.toLowerCase(), entry);
  }
  return [...seen.values()].sort((x, y) => y.paid - x.paid);
}

/** Each mandate's latest on-chain name (from MandateNamed). An empty name means the owner cleared it. */
export function mandateNames(events: ChainEvent[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const e of events) {
    if (e.eventName !== "MandateNamed") continue;
    const { mandateId, name } = e.args as { mandateId: bigint; name: string };
    names.set(mandateId.toString(), name.trim());
  }
  return names;
}
