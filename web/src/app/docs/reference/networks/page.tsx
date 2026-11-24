import type { Metadata } from "next";
import { networks } from "@/lib/env";

export const metadata: Metadata = { title: "Networks" };

export default function Networks() {
  const aevum = networks.find((n) => n.key === "aevum");
  return (
    <>
      <h1>Networks</h1>
      <p className="lead">AgentMeter runs on QDay&apos;s Aevum testnet. Test tokens only.</p>

      <h2>Aevum testnet</h2>
      <table className="docs-table">
        <tbody>
          <tr><td>Chain id</td><td><code>44005</code></td></tr>
          <tr><td>CAIP-2 id</td><td><code>eip155:44005</code></td></tr>
          <tr><td>RPC</td><td><code>https://rpc-test.qday.info</code> (HTTPS only, no WebSocket)</td></tr>
          <tr><td>Explorer</td><td><a href="https://explorer-test.qday.info">explorer-test.qday.info</a></td></tr>
          <tr><td>Gas token</td><td>tQDAY, 18 decimals</td></tr>
          <tr><td>Payment token</td><td>tUSD8, <code>0x456569838f1d43009A91ebA4263147Afd7233483</code>, 6 decimals</td></tr>
          <tr><td>AgentMandate</td><td>{aevum?.mandate ? <code>{aevum.mandate}</code> : "Not deployed yet"}</td></tr>
          <tr><td>Faucet</td><td><a href="https://faucet.qday.info">faucet.qday.info</a></td></tr>
        </tbody>
      </table>

      <h2>Network notes</h2>
      <ul>
        <li>The EVM is Shanghai: compile contracts with <code>evm_version = &quot;shanghai&quot;</code>.</li>
        <li>Send legacy (type 0) transactions.</li>
        <li><code>eth_getLogs</code> returns at most 1,000 blocks per request.</li>
      </ul>
    </>
  );
}
