"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { useNetwork } from "@/lib/network";
import { MeterMark } from "./Icons";
import { WalletButton } from "./WalletButton";

const siteLinks = [
  { href: "/playground", label: "Playground" },
  { href: "/#lab", label: "Try to break it" },
  { href: "/#how", label: "How it works" },
  { href: "/#rules", label: "The rules" },
  { href: "/docs", label: "Docs" },
];

const appLinks = [
  { href: "/app", label: "Mandates" },
  { href: "/app/new", label: "New mandate" },
  { href: "/app/seller", label: "Get paid" },
  { href: "/playground", label: "Playground" },
  { href: "/docs", label: "Docs" },
];

export function Header() {
  const pathname = usePathname();
  const inApp = pathname.startsWith("/app");
  const { isConnected, chainId } = useAccount();
  const { net, select, switchingTo, switchError } = useNetwork();
  const wrongNetwork = inApp && isConnected && chainId !== net.chain.id && !switchingTo;

  return (
    <>
      <header className="topbar">
        <div className="shell">
          <Link href="/" className="brand" aria-label="AgentMeter home">
            <MeterMark className="brand-mark" />
            <span className="brand-name">AgentMeter</span>
          </Link>
          <nav className="nav" aria-label="Main">
            {(inApp ? appLinks : siteLinks).map((l) => {
              const active =
                l.href === "/docs" || l.href === "/playground"
                  ? pathname.startsWith(l.href)
                  : inApp && (l.href === "/app" ? pathname === "/app" || pathname.startsWith("/app/m") || pathname.startsWith("/app/r") : pathname.startsWith(l.href));
              return (
                <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="topbar-end">
            {inApp ? (
              <>
                <span className="net-pill" title={`Chain ${net.chain.id}`}>
                  <i aria-hidden="true" />
                  <span className="net-label">{net.label}</span>
                </span>
                <WalletButton />
              </>
            ) : (
              <Link className="btn small" href="/app">
                Open the dashboard
              </Link>
            )}
          </div>
        </div>
      </header>
      {switchingTo && (
        <div className="banner" role="status">
          <div className="shell">Confirm the switch to {switchingTo.chain.name} in your wallet.</div>
        </div>
      )}
      {switchError && !switchingTo && (
        <div className="banner" role="alert">
          <div className="shell">{switchError}</div>
        </div>
      )}
      {wrongNetwork && (
        <div className="banner" role="alert">
          <div className="shell">
            <span>
              Your wallet is on another network. AgentMeter is set to {net.chain.name} (chain {net.chain.id}).
            </span>
            <button type="button" className="btn small" onClick={() => select(net.key)}>
              Switch network
            </button>
          </div>
        </div>
      )}
    </>
  );
}
