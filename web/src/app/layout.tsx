import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/public-sans";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AgentMeter: pay-per-request for AI agents, with a receipt for every answer", template: "%s · AgentMeter" },
  description:
    "AI agents pay any API per request with x402, in tUSD8 on QDay's Aevum, and every answer gets an on-chain receipt. Payments come from an owner's mandate the contract enforces.",
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
