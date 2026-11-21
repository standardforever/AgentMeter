/**
 * x402 v2 wire format, with AgentMeter's "mandate" payment scheme.
 *
 * x402 in one paragraph: a server that wants money answers a request with HTTP 402 and a
 * PAYMENT-REQUIRED header describing the price. The client pays (here: the agent signs a Payment
 * for its AgentMandate) and repeats the request with a PAYMENT-SIGNATURE header. The server asks a
 * facilitator to /verify and /settle the payment, then returns the data with a PAYMENT-RESPONSE
 * header carrying the settlement result (transaction hash).
 *
 * Every header value is base64-encoded JSON.
 * Spec: https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md
 *
 * Our scheme "mandate" is a custom x402 scheme (the spec allows custom schemes): instead of the
 * buyer's own wallet paying, the buyer's agent signs a Payment that AgentMandate pays out of an
 * escrow, under the owner's limits.
 */
import { keccak256, toHex, type Address, type Hex } from "viem";
import type { Payment } from "@aevum-kit/aevum";

export const X402_VERSION = 2;
export const SCHEME = "mandate";

export const HEADER_REQUIRED = "PAYMENT-REQUIRED"; // server -> client: the price
export const HEADER_SIGNATURE = "PAYMENT-SIGNATURE"; // client -> server: the signed payment
export const HEADER_RESPONSE = "PAYMENT-RESPONSE"; // server -> client: the settlement result

/** CAIP-2 network id, e.g. "eip155:44005" for Aevum testnet. */
export const caip2 = (chainId: number) => `eip155:${chainId}`;

export type ResourceInfo = { url: string; description?: string; mimeType?: string };

/** One way the server accepts payment. `amount` is in atomic units (tUSD8: 6 decimals). */
export type PaymentRequirements = {
  scheme: string;
  network: string;
  amount: string;
  asset: Address;
  payTo: Address;
  maxTimeoutSeconds: number;
  extra: MandateExtra;
};

/** Scheme-specific data for "mandate": which contract settles, and a hash of what is being bought. */
export type MandateExtra = { mandateContract: Address; resourceHash: Hex };

/** The 402 response. */
export type PaymentRequired = {
  x402Version: number;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
};

/** A Payment with bigints written as strings, so it survives JSON. */
export type WirePayment = {
  mandateId: string;
  payee: Address;
  amount: string;
  resourceHash: Hex;
  requestHash: Hex;
  nonce: Hex;
  deadline: string;
};

/** What the client sends back in PAYMENT-SIGNATURE. */
export type PaymentPayload = {
  x402Version: number;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: { payment: WirePayment; signature: Hex };
};

/** Body of POST /verify and POST /settle on the facilitator. */
export type FacilitatorRequest = {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

export type VerifyResponse = { isValid: boolean; invalidReason?: string; invalidMessage?: string; payer?: string };

export type SettleResponse = {
  success: boolean;
  errorReason?: string;
  errorMessage?: string;
  payer?: string;
  transaction: string;
  network: string;
  amount?: string;
  extensions?: { mandate?: { paymentId: Hex } };
};

export function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeHeader<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as T;
}

export function toWire(p: Payment): WirePayment {
  return {
    mandateId: p.mandateId.toString(),
    payee: p.payee,
    amount: p.amount.toString(),
    resourceHash: p.resourceHash,
    requestHash: p.requestHash,
    nonce: p.nonce,
    deadline: p.deadline.toString(),
  };
}

export function fromWire(w: WirePayment): Payment {
  return {
    mandateId: BigInt(w.mandateId),
    payee: w.payee,
    amount: BigInt(w.amount),
    resourceHash: w.resourceHash,
    requestHash: w.requestHash,
    nonce: w.nonce,
    deadline: BigInt(w.deadline),
  };
}

/**
 * The fingerprint of "what is being bought": the path and query of the request, e.g.
 * "/v1/price?pair=BTC-USD". Host is left out so the same API behind a proxy hashes the same.
 */
export function resourceHashOf(pathAndQuery: string): Hex {
  return keccak256(toHex(pathAndQuery));
}

/** The fingerprint of a response body, which the seller attests on-chain. */
export function responseHashOf(body: string): Hex {
  return keccak256(toHex(body));
}

export const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
