import { isAddress, type Address, type Chain } from "viem";
import { aevumFork, aevumTestnet, localAnvil } from "@aevum-kit/aevum";

export type NetworkKey = "aevum" | "fork" | "local";

export interface Network {
  key: NetworkKey;
  /** Short name for the network switcher. */
  label: string;
  chain: Chain;
  /** Your AgentMandate on this network, if you deployed one. */
  mandate?: Address;
  /** Scan the contract's events from this block onward (the block it was deployed in). */
  deployBlock: bigint;
  /** Explorer links only make sense on the real testnet. */
  hasExplorer: boolean;
}

const address = (v: string | undefined): Address | undefined => (v && isAddress(v.trim()) ? (v.trim() as Address) : undefined);
const block = (v: string | undefined): bigint => (v && /^\d+$/.test(v.trim()) ? BigInt(v.trim()) : 0n);

// NEXT_PUBLIC_* values must be written out in full so Next.js can inline them into the browser bundle.
const all: Record<NetworkKey, Network> = {
  aevum: {
    key: "aevum",
    label: "Aevum testnet",
    chain: aevumTestnet,
    mandate: address(process.env.NEXT_PUBLIC_MANDATE_AEVUM),
    deployBlock: block(process.env.NEXT_PUBLIC_MANDATE_DEPLOY_BLOCK_AEVUM),
    hasExplorer: true,
  },
  fork: {
    key: "fork",
    label: "Local fork",
    chain: aevumFork,
    mandate: address(process.env.NEXT_PUBLIC_MANDATE_FORK),
    deployBlock: block(process.env.NEXT_PUBLIC_MANDATE_DEPLOY_BLOCK_FORK),
    hasExplorer: false,
  },
  local: {
    key: "local",
    label: "Local anvil",
    chain: localAnvil,
    mandate: address(process.env.NEXT_PUBLIC_MANDATE_LOCAL),
    deployBlock: block(process.env.NEXT_PUBLIC_MANDATE_DEPLOY_BLOCK_LOCAL),
    hasExplorer: false,
  },
};

const requested = (process.env.NEXT_PUBLIC_NETWORKS ?? "aevum")
  .split(",")
  .map((k) => k.trim())
  .filter((k): k is NetworkKey => k in all);

/** The networks the app offers, in the order of NEXT_PUBLIC_NETWORKS. The first one is the default. */
export const networks: [Network, ...Network[]] = (() => {
  const keys = [...new Set(requested)];
  const list = (keys.length ? keys : (["aevum"] as NetworkKey[])).map((k) => all[k]);
  return list as [Network, ...Network[]];
})();

export const defaultNetwork = networks[0];

export function networkByChainId(chainId: number | undefined): Network | undefined {
  return networks.find((n) => n.chain.id === chainId);
}

export function networkByKey(key: string | null | undefined): Network | undefined {
  return networks.find((n) => n.key === key);
}

export const walletConnectProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || undefined;

/** The facilitator's activity feed: the only place refused payments show up (they never reach the chain). */
export const facilitatorUrl = process.env.NEXT_PUBLIC_FACILITATOR_URL?.trim().replace(/\/+$/, "") || undefined;

/**
 * Local testing only: a wallet the app can use without a browser extension. It sends transactions
 * through the node, which only works on a local chain where that account is unlocked (anvil's
 * default accounts). Ignored unless every configured network is local.
 */
export const devTestWallet: Address | undefined = (() => {
  const a = address(process.env.NEXT_PUBLIC_DEV_TEST_WALLET);
  return a && networks.every((n) => n.key !== "aevum") ? a : undefined;
})();

export const repoUrl = (process.env.NEXT_PUBLIC_REPO_URL?.trim() || "https://github.com/qday-io/aevum-starter-kit").replace(/\.git$|\/+$/g, "");
