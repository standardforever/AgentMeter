/**
 * Express middleware that puts a price on a route, x402-style.
 *
 *   app.get("/v1/price", paywall({ ...config, price: "0.01", description: "..." }), handler)
 *
 * No PAYMENT-SIGNATURE header -> 402 + PAYMENT-REQUIRED (the price).
 * With one -> ask the facilitator to /verify, then /settle. Only when the money has moved does the
 * request reach `handler`, with the settlement in res.locals.settlement and the PAYMENT-RESPONSE
 * header already set.
 */
import type { NextFunction, Request, Response } from "express";
import { parseUnits, type Address } from "viem";
import {
  HEADER_REQUIRED,
  HEADER_RESPONSE,
  HEADER_SIGNATURE,
  SCHEME,
  X402_VERSION,
  decodeHeader,
  encodeHeader,
  resourceHashOf,
  type FacilitatorRequest,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type SettleResponse,
  type VerifyResponse,
} from "../x402.ts";

export type PaywallConfig = {
  facilitatorUrl: string;
  network: string;
  asset: Address;
  decimals: number;
  payTo: Address;
  mandateContract: Address;
};

export type Price = { price: string; description: string };

export function paywall(config: PaywallConfig, { price, description }: Price) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const resource = { url: req.originalUrl, description, mimeType: "application/json" };
    const requirements: PaymentRequirements = {
      scheme: SCHEME,
      network: config.network,
      amount: parseUnits(price, config.decimals).toString(),
      asset: config.asset,
      payTo: config.payTo,
      maxTimeoutSeconds: 120,
      extra: { mandateContract: config.mandateContract, resourceHash: resourceHashOf(req.originalUrl) },
    };
    const paymentRequired = (error: string) => {
      const body: PaymentRequired = { x402Version: X402_VERSION, error, resource, accepts: [requirements] };
      // v2 puts it in the header; the JSON body is a convenience for humans and curl.
      res.status(402).setHeader(HEADER_REQUIRED, encodeHeader(body)).json(body);
    };

    const header = req.header(HEADER_SIGNATURE);
    if (!header) return paymentRequired(`${HEADER_SIGNATURE} header is required`);

    let paymentPayload: PaymentPayload;
    try {
      paymentPayload = decodeHeader<PaymentPayload>(header);
    } catch {
      return paymentRequired("invalid_payload");
    }

    const body: FacilitatorRequest = { x402Version: X402_VERSION, paymentPayload, paymentRequirements: requirements };
    try {
      const verified = await post<VerifyResponse>(`${config.facilitatorUrl}/verify`, body);
      if (!verified.isValid) return paymentRequired(verified.invalidReason ?? "invalid_payload");

      const settled = await post<SettleResponse>(`${config.facilitatorUrl}/settle`, body);
      if (!settled.success) return paymentRequired(settled.errorReason ?? "unexpected_settle_error");

      res.setHeader(HEADER_RESPONSE, encodeHeader(settled));
      res.locals.settlement = settled;
      next();
    } catch (err) {
      console.error("facilitator unreachable", err);
      res.status(502).json({ error: "facilitator unreachable" });
    }
  };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as T;
}
