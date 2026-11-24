/**
 * The facilitator's off-chain checks: does the signed payment match what the seller asked for?
 *
 * The contract already enforces the OWNER's rules (allowlist, caps, expiry...). These checks
 * protect the SELLER: without them an agent could sign a payment of 0.000001 tUSD8, or a payment
 * to someone else, or for a different resource, and still get the data. Pure function, so it is
 * easy to unit-test (see test/checks.test.ts).
 */
import type { Address } from "viem";
import type { Payment } from "../mandate.ts";
import { SCHEME, X402_VERSION, fromWire, sameAddress, type FacilitatorRequest } from "../x402.ts";

export type CheckContext = { network: string; asset: Address; mandateContract: Address };

export type CheckResult =
  | { ok: true; payment: Payment }
  | { ok: false; reason: string; message: string };

const fail = (reason: string, message: string): CheckResult => ({ ok: false, reason, message });

export function checkRequest(body: FacilitatorRequest, ctx: CheckContext): CheckResult {
  if (!body || body.x402Version !== X402_VERSION) return fail("invalid_x402_version", "x402Version must be 2");
  const req = body.paymentRequirements;
  const payload = body.paymentPayload;
  if (!req || !payload?.accepted || !payload.payload) return fail("invalid_payload", "missing fields");

  if (req.scheme !== SCHEME || payload.accepted.scheme !== SCHEME) {
    return fail("unsupported_scheme", `only "${SCHEME}" is supported`);
  }
  if (req.network !== ctx.network || payload.accepted.network !== ctx.network) {
    return fail("invalid_network", `this facilitator settles on ${ctx.network}`);
  }
  if (!sameAddress(req.asset, ctx.asset)) return fail("invalid_payment_requirements", "asset is not tUSD8");
  if (!req.extra || !sameAddress(req.extra.mandateContract, ctx.mandateContract)) {
    return fail("invalid_payment_requirements", "unknown mandate contract");
  }

  // The client must have accepted exactly what the server asked for.
  const a = payload.accepted;
  if (
    a.amount !== req.amount ||
    !sameAddress(a.payTo, req.payTo) ||
    !sameAddress(a.asset, req.asset) ||
    a.extra?.resourceHash !== req.extra.resourceHash
  ) {
    return fail("invalid_payment_requirements", "accepted terms differ from the server's requirements");
  }

  let payment: Payment;
  try {
    payment = fromWire(payload.payload.payment);
  } catch {
    return fail("invalid_payload", "payment fields are malformed");
  }

  // The signed payment itself must pay the right seller, the right amount, for the right resource.
  if (!sameAddress(payment.payee, req.payTo)) {
    return fail("invalid_mandate_payload_recipient_mismatch", "payment is not to the seller");
  }
  if (payment.amount !== BigInt(req.amount)) {
    return fail("invalid_mandate_payload_value_mismatch", "payment amount differs from the price");
  }
  if (payment.resourceHash !== req.extra.resourceHash) {
    return fail("invalid_mandate_payload_resource_mismatch", "payment is for a different resource");
  }
  return { ok: true, payment };
}
