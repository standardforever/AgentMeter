import Link from "next/link";
import { repoUrl } from "@/lib/env";

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell">
        <p>
          AgentMeter is a testnet prototype built for the Aevum Builder Challenge. Unaudited: test tokens only.
        </p>
        <nav aria-label="Footer">
          <Link href="/app">Dashboard</Link>
          <Link href="/docs">Docs</Link>
          <a href={repoUrl} target="_blank" rel="noreferrer">
            Source code
          </a>
          <a href="https://wiki.qday.info/Knowledge/technical/introduction" target="_blank" rel="noreferrer">
            QDay docs
          </a>
          <a href="https://dorahacks.io/hackathon/qday/detail" target="_blank" rel="noreferrer">
            The challenge
          </a>
        </nav>
      </div>
    </footer>
  );
}
