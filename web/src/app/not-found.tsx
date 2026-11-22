import Link from "next/link";

export default function NotFound() {
  return (
    <section className="shell" style={{ padding: "96px 0", display: "grid", gap: 20, justifyItems: "start" }}>
      <h1>This page isn&apos;t here</h1>
      <p className="lead">The link may be old, or mistyped. Your mandates are in the dashboard.</p>
      <div className="row">
        <Link className="btn" href="/app">
          Open the dashboard
        </Link>
        <Link className="btn quiet" href="/">
          AgentMeter home
        </Link>
      </div>
    </section>
  );
}
