import { formatUnits, parseUnits } from "viem";

export const TOKEN_DECIMALS = 6;
export const TOKEN_SYMBOL = "tUSD8";

/** 0x1234…abcd */
export function short(value: string | undefined, head = 6, tail = 4): string {
  if (!value) return "";
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Token base units -> "0.05". Trailing zeros trimmed, at least 2 decimals. */
export function amount(value: bigint | undefined, decimals = TOKEN_DECIMALS): string {
  if (value === undefined) return "–";
  const [whole, frac = ""] = formatUnits(value, decimals).split(".");
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  return `${Number(whole).toLocaleString("en-US")}.${trimmed}`;
}

/** "0.05" -> base units, or undefined if it isn't a valid positive amount. */
export function parseAmount(text: string, decimals = TOKEN_DECIMALS): bigint | undefined {
  const t = text.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  if ((t.split(".")[1] ?? "").length > decimals) return undefined;
  try {
    return parseUnits(t, decimals);
  } catch {
    return undefined;
  }
}

export function ratio(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Math.min(1, Number((part * 10000n) / whole) / 10000);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "12 seconds ago", "in 3 days" */
export function relative(unixSeconds: number, nowMs = Date.now()): string {
  const diff = unixSeconds - nowMs / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return diff < 0 ? "just now" : "in a few seconds";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** "Dec 21, 2026, 18:03" in the reader's time zone. */
export function dateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function clock(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** 90061 -> "1 day 1 hour" (two largest units). */
export function duration(seconds: number): string {
  const units: [number, string][] = [
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
    [1, "second"],
  ];
  const parts: string[] = [];
  let left = Math.max(0, Math.round(seconds));
  for (const [size, name] of units) {
    const n = Math.floor(left / size);
    if (n > 0) parts.push(`${n} ${name}${n === 1 ? "" : "s"}`);
    left -= n * size;
    if (parts.length === 2) break;
  }
  return parts.join(" ") || "0 seconds";
}

/** "mandate_PayeeNotAllowed" -> a sentence the owner understands. */
export function refusalText(reason: string | undefined): string {
  const name = (reason ?? "").replace(/^mandate_/, "");
  const known: Record<string, string> = {
    PayeeNotAllowed: "Seller isn't on the allowed list",
    ExceedsSinglePayment: "Price is above the per-call cap",
    ExceedsPeriodBudget: "Today's budget is used up",
    ExceedsTotalBudget: "The total budget is used up",
    InsufficientBalance: "Not enough tUSD8 left in escrow",
    MandateIsRevoked: "The mandate is revoked",
    MandateExpired: "The mandate has expired",
    PaymentExpired: "The signed payment expired before it was submitted",
    NonceAlreadyUsed: "This payment number was already used",
    InvalidAgentSignature: "Not signed by this mandate's agent",
    UnknownMandate: "No such mandate",
    ZeroAmount: "Amount was zero",
    invalid_mandate_payload_value_mismatch: "Agent offered a different amount than the price",
    invalid_mandate_payload_recipient_mismatch: "Payment wasn't addressed to the seller",
    invalid_mandate_payload_resource_mismatch: "Payment was for a different request",
    payment_already_settled: "This payment was already used (a replayed copy); nothing was paid",
  };
  return known[name] ?? name.replace(/_/g, " ");
}
