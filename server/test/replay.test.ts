/**
 * The facilitator refuses a signed payment that has already been settled, so a copied
 * PAYMENT-SIGNATURE header can't buy the same resource twice.
 * Run: pnpm --filter server test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { alreadySettled, ALREADY_SETTLED } from "@standeva/agentmeter/server";

const MANDATE: Address = "0x1111111111111111111111111111111111111111";
const PAYMENT_ID: Hex = `0x${"ab".repeat(32)}`;
const payment = {
  mandateId: 1n,
  payee: "0x000000000000000000000000000000000000bEEF" as Address,
  amount: 10000n,
  resourceHash: `0x${"01".repeat(32)}` as Hex,
  requestHash: `0x${"02".repeat(32)}` as Hex,
  nonce: `0x${"03".repeat(32)}` as Hex,
  deadline: 2_000_000_000n,
};

/** A stand-in for the chain: answers paymentDigest and isSettled, and records what was asked. */
function chain(settled: boolean) {
  const calls: { functionName: string; address: string; args: unknown[] }[] = [];
  return {
    calls,
    async readContract({ functionName, address, args }: { functionName: string; address: string; args: unknown[] }) {
      calls.push({ functionName, address, args });
      if (functionName === "paymentDigest") return PAYMENT_ID;
      if (functionName === "isSettled") return settled && args[0] === PAYMENT_ID;
      throw new Error(`unexpected call ${functionName}`);
    },
  };
}

test("a payment that was already settled is reported as a replay", async () => {
  const c = chain(true);
  assert.equal(await alreadySettled(c, MANDATE, payment), true);
});

test("a fresh payment is not a replay", async () => {
  assert.equal(await alreadySettled(chain(false), MANDATE, payment), false);
});

test("it asks the contract for this payment's id, then whether that id is settled", async () => {
  const c = chain(true);
  await alreadySettled(c, MANDATE, payment);
  assert.deepEqual(c.calls.map((x) => x.functionName), ["paymentDigest", "isSettled"]);
  assert.ok(c.calls.every((x) => x.address === MANDATE));
  assert.deepEqual(c.calls[0].args, [payment]);
  assert.deepEqual(c.calls[1].args, [PAYMENT_ID]);
});

test("the refusal reason is stable", () => {
  assert.equal(ALREADY_SETTLED, "payment_already_settled");
});
