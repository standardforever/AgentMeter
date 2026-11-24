import type { Metadata } from "next";
import { Code } from "@/components/docs/Code";

export const metadata: Metadata = { title: "Rotate or revoke an agent key" };

export default function Keys() {
  return (
    <>
      <h1>Rotate or revoke an agent key</h1>
      <p className="lead">
        An agent&apos;s key can only sign payments within its mandate. If it leaks, replace it or stop the mandate. Funds never move.
      </p>

      <h2>What a leaked key can do</h2>
      <p>
        Whoever has the key can sign payments, but only to the mandate&apos;s allowed sellers and within its limits. The most at risk is what
        remains of the current period&apos;s budget. The key holds no tokens, so there is nothing to drain from it.
      </p>

      <h2>Replace the key</h2>
      <p>
        Call <code>setAgent</code> with the new key&apos;s address. From the next block, every signature from the old key is rejected with{" "}
        <code>InvalidAgentSignature</code>, including payments it signed before the change. The balance, limits and sellers stay the same.
      </p>
      <Code title="rotate.ts">{`
await owner.writeContract({
  address: MANDATE,
  abi: agentMandateAbi,
  functionName: "setAgent",
  args: [mandateId, "0xNewAgentAddress", "0x0000000000000000000000000000000000000000", "0x"],
  type: "legacy",
});
`}</Code>
      <p>In the dashboard: open the mandate and click <strong>Change agent</strong>.</p>

      <h2>Stop the mandate</h2>
      <p>
        <code>revoke</code> stops all spending permanently. You can still withdraw the remaining balance.
      </p>
      <Code title="revoke.ts">{`
await owner.writeContract({ address: MANDATE, abi: agentMandateAbi, functionName: "revoke", args: [mandateId], type: "legacy" });
await owner.writeContract({
  address: MANDATE, abi: agentMandateAbi, functionName: "withdraw",
  args: [mandateId, balance, owner.account.address], type: "legacy",
});
`}</Code>
      <p>In the dashboard: <strong>Revoke</strong>, then <strong>Withdraw</strong>.</p>

      <h2>Limit the impact in advance</h2>
      <ul>
        <li>Give each agent its own key and its own mandate.</li>
        <li>Keep the per-period budget close to what the agent really needs.</li>
        <li>Deposit only what you expect the agent to spend before you next top up.</li>
      </ul>
    </>
  );
}
