"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { devTestWallet } from "@/lib/env";
import { short } from "@/lib/format";

const TEST_FLAG = "agentmeter:test-wallet";
function remember(on: boolean) {
  try {
    if (on) localStorage.setItem(TEST_FLAG, "1");
    else localStorage.removeItem(TEST_FLAG);
  } catch {
    // ignore
  }
}

/**
 * Local testing: the test wallet owns the sample mandates and holds tUSD8 on the fork. `suggest` is true
 * when it's configured but a different wallet is connected, so screens can offer to switch.
 */
export function useTestWallet() {
  const { connectors, connect } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { connector, isConnected } = useAccount();
  const testConnector = devTestWallet ? connectors.find((c) => c.id === "mock") : undefined;
  const active = connector?.id === "mock";
  return {
    available: Boolean(testConnector),
    suggest: Boolean(testConnector && isConnected && !active),
    use: async () => {
      if (!testConnector) return;
      if (isConnected) await disconnectAsync();
      remember(true);
      connect({ connector: testConnector });
    },
  };
}

/** Wallet connect, styled like the rest of the app. Offers the local test wallet when configured. */
export function WalletButton() {
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { connector } = useAccount();
  const { isConnected } = useAccount();
  const testConnector = devTestWallet ? connectors.find((c) => c.id === "mock") : undefined;

  // The local test wallet doesn't survive a page reload on its own (browser wallets do): remember it.
  useEffect(() => {
    if (!testConnector || isConnected) return;
    try {
      if (localStorage.getItem(TEST_FLAG) === "1") connect({ connector: testConnector });
    } catch {
      // storage blocked: the user can click "Use local test wallet" again
    }
  }, [testConnector, isConnected, connect]);

  return (
    <ConnectButton.Custom>
      {({ account, openConnectModal, openAccountModal, mounted }) => {
        if (!mounted) return <span className="btn small quiet" aria-hidden="true" style={{ visibility: "hidden" }} />;
        if (account) {
          const isTest = connector?.id === "mock";
          return (
            <button
              type="button"
              className="btn small quiet"
              onClick={
                isTest
                  ? () => {
                      remember(false);
                      disconnect();
                    }
                  : openAccountModal
              } title={isTest ? "Disconnect the local test wallet" : undefined}>
              {short(account.address)}
              {isTest && <span className="wallet-note">&nbsp;(test wallet)</span>}
            </button>
          );
        }
        return (
          <div className="row" style={{ gap: 8 }}>
            {testConnector && (
              <button
                type="button"
                className="btn small quiet"
                onClick={() => {
                  remember(true);
                  connect({ connector: testConnector });
                }}
              >
                Use local test wallet
              </button>
            )}
            <button type="button" className="btn small" onClick={openConnectModal}>
              Connect wallet
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
