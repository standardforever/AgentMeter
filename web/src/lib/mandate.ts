"use client";

import { agentMandateAbi, erc20Abi } from "@aevum-kit/aevum";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Abi, Address, ContractFunctionArgs, ContractFunctionName, Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { useChainEvents } from "./chainEvents";
import { facilitatorUrl } from "./env";
import { explain } from "./errors";
import { useNetwork } from "./network";

const LIVE = { refetchInterval: 3000 } as const;

/** The mandate's stored state plus what it can still spend, refreshed every few seconds. */
export function useMandate(id: bigint | undefined) {
  const { net } = useNetwork();
  const address = net.mandate;
  const enabled = Boolean(address && id !== undefined);
  const q = useReadContracts({
    contracts: enabled
      ? [
          { address, abi: agentMandateAbi, functionName: "getMandate", args: [id!], chainId: net.chain.id },
          { address, abi: agentMandateAbi, functionName: "remaining", args: [id!], chainId: net.chain.id },
        ]
      : [],
    query: { enabled, ...LIVE },
  });
  const mandate = q.data?.[0]?.result;
  const rem = q.data?.[1]?.result;
  const exists = Boolean(mandate && mandate.owner !== "0x0000000000000000000000000000000000000000");
  const now = Math.floor(Date.now() / 1000);
  const expired = mandate ? Number(mandate.limits.expiresAt) <= now : false;
  return {
    mandate: exists ? mandate : undefined,
    remaining: rem ? { singlePayment: rem[0], period: rem[1], total: rem[2], balance: rem[3] } : undefined,
    state: !mandate ? undefined : !exists ? ("missing" as const) : mandate.revoked ? ("revoked" as const) : expired ? ("expired" as const) : ("active" as const),
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}

export type MandateState = "active" | "revoked" | "expired" | "missing";

/** The payment token the deployed contract uses, and the connected wallet's balance + allowance of it. */
export function useToken() {
  const { net } = useNetwork();
  const { address: owner } = useAccount();
  const token = useReadContract({
    address: net.mandate,
    abi: agentMandateAbi,
    functionName: "token",
    chainId: net.chain.id,
    query: { enabled: Boolean(net.mandate), staleTime: Infinity },
  }).data;
  const q = useReadContracts({
    contracts:
      token && owner && net.mandate
        ? [
            { address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], chainId: net.chain.id },
            { address: token, abi: erc20Abi, functionName: "allowance", args: [owner, net.mandate], chainId: net.chain.id },
          ]
        : [],
    query: { enabled: Boolean(token && owner), ...LIVE },
  });
  return { token, balance: q.data?.[0]?.result as bigint | undefined, allowance: q.data?.[1]?.result as bigint | undefined, refetch: q.refetch };
}

export interface FeedItem {
  at: number;
  mandateId: string;
  payee: string;
  amount: string;
  resource?: string;
  outcome: "paid" | "refused";
  reason?: string;
  transaction?: string;
  paymentId?: string;
}

/**
 * The facilitator's feed for one mandate: refused payments (they never reach the chain, so this is
 * the only place to see them) and the request URL behind each paid one (the chain only stores its
 * hash). Empty if no facilitator is configured, it's offline, or it serves another contract.
 */
export function useFeed(id: bigint | undefined) {
  return useActivity(id === undefined ? undefined : { mandateId: id.toString() });
}

/** The facilitator's feed for one seller: payments to it, and attempts that were refused (for example by an owner who hasn't allowed it yet). */
export function useSellerFeed(payee: Address | undefined) {
  return useActivity(payee ? { payee } : undefined);
}

function useActivity(filter: { mandateId: string } | { payee: Address } | undefined) {
  const { net } = useNetwork();
  const key = filter ? ("mandateId" in filter ? `m:${filter.mandateId}` : `s:${filter.payee.toLowerCase()}`) : undefined;
  return useQuery({
    queryKey: ["feed", facilitatorUrl, net.mandate, key],
    enabled: Boolean(facilitatorUrl && net.mandate && filter),
    refetchInterval: 3000,
    retry: false,
    queryFn: async (): Promise<{ online: boolean; items: FeedItem[] }> => {
      try {
        // The feed filters by mandate; for a seller, read the recent feed and keep its own rows.
        const query = filter && "mandateId" in filter ? `mandateId=${filter.mandateId}&limit=200` : "limit=500";
        const res = await fetch(`${facilitatorUrl}/activity?${query}`);
        if (!res.ok) return { online: false, items: [] };
        const body = (await res.json()) as { mandateContract: string; items: FeedItem[] };
        if (body.mandateContract.toLowerCase() !== net.mandate!.toLowerCase()) return { online: true, items: [] };
        const items = filter && "payee" in filter ? body.items.filter((i) => i.payee.toLowerCase() === filter.payee.toLowerCase()) : body.items;
        return { online: true, items };
      } catch {
        return { online: false, items: [] };
      }
    },
  });
}

type Fn = ContractFunctionName<typeof agentMandateAbi, "nonpayable">;

/**
 * Send one transaction and follow it to the end: wallet prompt -> mined -> events refreshed.
 * `run` resolves with the receipt, or undefined if it failed (the error is in `error`, in plain words).
 */
export function useSend() {
  const { net } = useNetwork();
  const client = usePublicClient({ chainId: net.chain.id });
  const { writeContractAsync } = useWriteContract();
  const { address: account } = useAccount();
  const { refresh } = useChainEvents();
  const [phase, setPhase] = useState<"idle" | "wallet" | "mining" | "done" | "error">("idle");
  const [error, setError] = useState<string>();
  const [hash, setHash] = useState<Hex>();

  const send = useCallback(
    async (to: Address, abi: Abi, functionName: string, args: readonly unknown[]) => {
      setError(undefined);
      setHash(undefined);
      setPhase("wallet");
      try {
        // Simulate first: a call that would revert fails here with a readable reason, for free.
        await client!.simulateContract({ address: to, abi, functionName, args, account } as never);
        const h = await writeContractAsync({ address: to, abi, functionName, args, chainId: net.chain.id } as never);
        setHash(h);
        setPhase("mining");
        const receipt = await client!.waitForTransactionReceipt({ hash: h });
        if (receipt.status !== "success") throw new Error("The transaction was reverted on-chain.");
        setPhase("done");
        refresh();
        return receipt;
      } catch (e) {
        console.error("[tx]", functionName, e);
        setError(explain(e));
        setPhase("error");
        return undefined;
      }
    },
    [client, account, writeContractAsync, net.chain.id, refresh],
  );

  const mandateCall = useCallback(
    <F extends Fn>(functionName: F, args: ContractFunctionArgs<typeof agentMandateAbi, "nonpayable", F>) =>
      send(net.mandate!, agentMandateAbi as Abi, functionName, args as readonly unknown[]),
    [send, net.mandate],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(undefined);
    setHash(undefined);
  }, []);

  return { send, mandateCall, phase, error, hash, reset, busy: phase === "wallet" || phase === "mining" };
}
