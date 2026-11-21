/**
 * Unit tests for the x402 wire format and the facilitator's off-chain checks.
 * Run: pnpm --filter server test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { checkRequest, type CheckContext } from "../src/checks";
import {
  SCHEME,
  X402_VERSION,
  decodeHeader,
  encodeHeader,
  fromWire,
  resourceHashOf,
  toWire,
  type FacilitatorRequest,
  type PaymentRequirements,
} from "../src/x402";

const TUSD8: Address = "0x456569838f1d43009A91ebA4263147Afd7233483";
const MANDATE: Address = "0x1111111111111111111111111111111111111111";
const SELLER: Address = "0x000000000000000000000000000000000000bEEF";
const ctx: CheckContext = { network: "eip155:44005", asset: TUSD8, mandateContract: MANDATE };

function request(overrides: { payment?: Partial<ReturnType<typeof toWire>>; requirements?: Partial<PaymentRequirements> } = {}) {
  const requirements: PaymentRequirements = {
    scheme: SCHEME,
    network: "eip155:44005",
    amount: "10000",
    asset: TUSD8,
    payTo: SELLER,
    maxTimeoutSeconds: 120,
    extra: { mandateContract: MANDATE, resourceHash: resourceHashOf("/v1/price?pair=BTC-USD") },
    ...overrides.requirements,
  };
  const payment = {
    ...toWire({
      mandateId: 1n,
      payee: SELLER,
      amount: 10000n,
      resourceHash: resourceHashOf("/v1/price?pair=BTC-USD"),
      requestHash: ("0x" + "ab".repeat(32)) as Hex,
      nonce: ("0x" + "cd".repeat(32)) as Hex,
      deadline: 1_900_000_000n,
    }),
    ...overrides.payment,
  };
  const body: FacilitatorRequest = {
    x402Version: X402_VERSION,
    paymentRequirements: requirements,
    paymentPayload: { x402Version: X402_VERSION, accepted: requirements, payload: { payment, signature: "0x" } },
  };
  return body;
}

const reasonOf = (body: FacilitatorRequest) => {
  const r = checkRequest(body, ctx);
  return r.ok ? "ok" : r.reason;
};

test("headers survive base64 JSON round trip", () => {
  const value = { x402Version: 2, note: "naïra ₦ and emoji-free text" };
  assert.deepEqual(decodeHeader(encodeHeader(value)), value);
});

test("payments survive the wire format (bigints as strings)", () => {
  const wire = request().paymentPayload.payload.payment;
  assert.equal(typeof wire.amount, "string");
  assert.deepEqual(toWire(fromWire(wire)), wire);
});

test("resource hash depends on path and query", () => {
  assert.equal(resourceHashOf("/v1/price?pair=BTC-USD"), resourceHashOf("/v1/price?pair=BTC-USD"));
  assert.notEqual(resourceHashOf("/v1/price?pair=BTC-USD"), resourceHashOf("/v1/price?pair=ETH-USD"));
});

test("a correct request passes", () => {
  assert.equal(reasonOf(request()), "ok");
});

test("an underpaying agent is refused", () => {
  assert.equal(reasonOf(request({ payment: { amount: "1" } })), "invalid_mandate_payload_value_mismatch");
});

test("paying someone other than the seller is refused", () => {
  assert.equal(
    reasonOf(request({ payment: { payee: "0x000000000000000000000000000000000000dEaD" } })),
    "invalid_mandate_payload_recipient_mismatch",
  );
});

test("paying for a different resource is refused", () => {
  assert.equal(
    reasonOf(request({ payment: { resourceHash: resourceHashOf("/v1/price?pair=ETH-USD") } })),
    "invalid_mandate_payload_resource_mismatch",
  );
});

test("wrong network, scheme, asset, contract or version are refused", () => {
  assert.equal(reasonOf(request({ requirements: { network: "eip155:1" } })), "invalid_network");
  assert.equal(reasonOf(request({ requirements: { scheme: "exact" } })), "unsupported_scheme");
  assert.equal(reasonOf(request({ requirements: { asset: SELLER } })), "invalid_payment_requirements");
  assert.equal(
    reasonOf(request({ requirements: { extra: { mandateContract: SELLER, resourceHash: resourceHashOf("/x") } } })),
    "invalid_payment_requirements",
  );
  assert.equal(reasonOf({ ...request(), x402Version: 1 }), "invalid_x402_version");
});

test("the client must accept exactly the server's terms", () => {
  const body = request();
  body.paymentPayload.accepted = { ...body.paymentRequirements, amount: "1" };
  assert.equal(reasonOf(body), "invalid_payment_requirements");
});

test("garbage payment fields are refused, not thrown", () => {
  assert.equal(reasonOf(request({ payment: { amount: "not a number" } })), "invalid_payload");
});
