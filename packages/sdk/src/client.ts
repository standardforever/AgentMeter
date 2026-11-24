/**
 * fetch() that pays: if a server answers 402, sign a Payment for our mandate and try again.
 *
 * The agent's key only SIGNS. It holds no tUSD8 and no gas; the facilitator submits the payment
 * and AgentMandate decides whether it is paid. The agent checks a few things before signing
 * (right network, right mandate contract, the price is for the URL we asked for), but it does NOT
 * enforce the owner's budget: that is the contract's job, so a fooled agent still can't overspend.
 */
import { formatUnits, keccak256, toHex, type Address, type Hex, type LocalAccount } from "viem";
import { caip2 } from "./chain.ts";
import { paymentTypedData, type Payment } from "./mandate.ts";
import {
  HEADER_REQUIRED,
  HEADER_RESPONSE,
  HEADER_SIGNATURE,
  SCHEME,
  X402_VERSION,
  decodeHeader,
  encodeHeader,
  resourceHashOf,
  sameAddress,
  toWire,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type SettleResponse,
} from "./x402.ts";

export type PaidCall = {
  url: string;
  status: number;
  body: unknown;
  rawBody: string;
  /** Set when we paid. */
  paid?: { amount: string; payTo: Address; transaction: string; paymentId?: Hex };
  /** Set when payment was required but did not go through, with the reason. */
  refused?: string;
};

/** What happened during one call, in order. Useful for logging and for showing the flow in a UI. */
export type PayEvent =
  | { type: "request"; url: string }
  | { type: "payment-required"; offer: PaymentRequirements }
  | { type: "signed"; payment: Payment }
  | { type: "paid"; amount: string; payTo: Address; transaction: string; paymentId?: Hex }
  | { type: "refused"; reason: string };

export type PayingFetchOptions = {
  agent: LocalAccount;
  chainId: number;
  mandate: Address;
  mandateId: bigint;
  decimals?: number;
  log?: (line: string) => void;
  /** Called at each step of a call: request, payment-required, signed, then paid or refused. */
  onEvent?: (event: PayEvent) => void;
};

export function createPayingFetch({ agent, chainId, mandate, mandateId, decimals = 6, log = () => {}, onEvent = () => {} }: PayingFetchOptions) {
  const network = caip2(chainId);

  return async function payingFetch(url: string, init: RequestInit = {}): Promise<PaidCall> {
    const call = await pay(url, init);
    if (call.refused) onEvent({ type: "refused", reason: call.refused });
    else if (call.paid) onEvent({ type: "paid", ...call.paid });
    return call;
  };

  async function pay(url: string, init: RequestInit): Promise<PaidCall> {
    onEvent({ type: "request", url });
    const first = await fetch(url, init);
    if (first.status !== 402) return read(url, first);

    // 1. Read the price.
    const header = first.headers.get(HEADER_REQUIRED);
    const required: PaymentRequired = header ? decodeHeader(header) : await first.json();
    const offer = required.accepts.find((a) => a.scheme === SCHEME && a.network === network);
    if (!offer) return { url, status: 402, body: required, rawBody: "", refused: `no "${SCHEME}" offer on ${network}` };

    // 2. Sanity checks before signing anything.
    if (!sameAddress(offer.extra.mandateContract, mandate)) {
      return { url, status: 402, body: required, rawBody: "", refused: "seller wants a different mandate contract" };
    }
    const { pathname, search } = new URL(url);
    if (offer.extra.resourceHash !== resourceHashOf(pathname + search)) {
      return { url, status: 402, body: required, rawBody: "", refused: "price is for a different resource" };
    }
    onEvent({ type: "payment-required", offer });
    log(`402 from ${new URL(url).host}: ${formatUnits(BigInt(offer.amount), decimals)} tUSD8 to ${offer.payTo} for ${pathname}`);

    // 3. Sign a Payment (free, off-chain).
    const payment: Payment = {
      mandateId,
      payee: offer.payTo,
      amount: BigInt(offer.amount),
      resourceHash: offer.extra.resourceHash,
      requestHash: keccak256(toHex(`${init.method ?? "GET"} ${url} ${init.body ?? ""} ${Date.now()}`)),
      nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
      deadline: BigInt(Math.floor(Date.now() / 1000) + offer.maxTimeoutSeconds),
    };
    const signature = await agent.signTypedData(paymentTypedData(chainId, mandate, payment));
    onEvent({ type: "signed", payment });
    const paymentPayload: PaymentPayload = {
      x402Version: X402_VERSION,
      resource: required.resource,
      accepted: offer,
      payload: { payment: toWire(payment), signature },
    };

    // 4. Same request again, with the payment attached.
    const headers = new Headers(init.headers);
    headers.set(HEADER_SIGNATURE, encodeHeader(paymentPayload));
    const second = await fetch(url, { ...init, headers });

    if (second.status === 402) {
      const h = second.headers.get(HEADER_REQUIRED);
      const again: PaymentRequired = h ? decodeHeader(h) : await second.json();
      return { url, status: 402, body: again, rawBody: "", refused: again.error ?? "payment refused" };
    }
    const call = await read(url, second);
    const settled = second.headers.get(HEADER_RESPONSE);
    if (settled) {
      const s = decodeHeader<SettleResponse>(settled);
      call.paid = { amount: offer.amount, payTo: offer.payTo, transaction: s.transaction, paymentId: s.extensions?.mandate?.paymentId };
    }
    return call;
  }
}

async function read(url: string, res: Response): Promise<PaidCall> {
  const rawBody = await res.text();
  let body: unknown = rawBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // not JSON, keep the text
  }
  return { url, status: res.status, body, rawBody };
}
