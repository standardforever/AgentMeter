import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rabbyWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import type { Chain } from "viem";
import { createConfig, http, type CreateConnectorFn, type Transport } from "wagmi";
import { mock } from "wagmi/connectors";
import { devTestWallet, networks, walletConnectProjectId } from "./env";

const appName = "AgentMeter";

// With a WalletConnect project id: extension wallets + QR for mobile wallets.
// Without one: any injected browser wallet (MetaMask, Rabby, ...) still works.
const walletConnectors = connectorsForWallets(
  walletConnectProjectId
    ? [
        { groupName: "Popular", wallets: [metaMaskWallet, rabbyWallet, walletConnectWallet] },
        { groupName: "More", wallets: [injectedWallet] },
      ]
    : [{ groupName: "Browser wallet", wallets: [injectedWallet] }],
  { appName, projectId: walletConnectProjectId ?? "not-set" },
);

/** Local testing only (see devTestWallet): an account the local node signs for. */
const devConnectors: CreateConnectorFn[] = devTestWallet
  ? [mock({ accounts: [devTestWallet], features: { reconnect: true } })]
  : [];

const chains = networks.map((n) => n.chain) as [Chain, ...Chain[]];

export const wagmiConfig = createConfig({
  chains,
  connectors: [...walletConnectors, ...devConnectors],
  transports: Object.fromEntries(chains.map((c) => [c.id, http()])) as Record<number, Transport>,
  ssr: true,
});
