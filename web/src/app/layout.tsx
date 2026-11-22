import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/public-sans";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AgentMeter: spending limits for AI agents that pay per request", template: "%s · AgentMeter" },
  description:
    "AI agents pay for APIs one request at a time with x402, in stablecoins on QDay. Every payment passes an on-chain mandate: allowed sellers, per-call cap, daily budget, off switch.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
