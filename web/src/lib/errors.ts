import { BaseError, ContractFunctionRevertedError, UnauthorizedProviderError, UserRejectedRequestError } from "viem";

const contractErrors: Record<string, string> = {
  InvalidLimits: "Check the limits: per call must be above 0 and no more than per day, per day no more than the total, and the end date in the future.",
  ZeroAddress: "An address is missing or set to zero.",
  ZeroAmount: "The amount must be more than zero.",
  NotOwner: "Only the mandate's owner can do this. Connect the wallet that created it.",
  UnknownMandate: "That mandate doesn't exist on this network.",
  InsufficientBalance: "That's more than the mandate holds.",
  EmptyVerifierKey: "A custom signature scheme needs the agent's public key.",
};

/** Turns wallet / RPC / revert errors into one sentence a user can act on. */
export function explain(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong. Try again.";
  const dup = /same RPC endpoint as existing network for chain \w+ \('([^']*)'\)/.exec(fullMessage(error));
  if (dup) return `Your wallet already has a network ("${dup[1]}") using the same RPC address. Edit or remove that network in your wallet, then try again.`;
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You cancelled the request in your wallet. Nothing was sent.";
    if (error.walk((e) => e instanceof UnauthorizedProviderError))
      return "Your wallet hasn't let this site use that account on this network. Open your wallet, switch to the network shown at the top of this page, reconnect this site, then try again. Nothing was sent.";
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && contractErrors[name]) return contractErrors[name];
      const reason = revert.reason ?? "";
      if (/exceeds balance|insufficient/i.test(reason)) return "Not enough tUSD8 in your wallet.";
      if (/allowance/i.test(reason)) return "The approval is lower than the amount. Approve again.";
      if (reason) return reason;
      if (name) return name;
    }
    if (/insufficient funds/i.test(error.message)) return "Not enough tQDAY for gas. Get some from the faucet.";
    return error.shortMessage;
  }
  return error.message;
}

/** Wallet errors often hide the real reason in `cause` or `data.cause`. */
function fullMessage(error: unknown, depth = 0): string {
  if (!error || typeof error !== "object" || depth > 5) return "";
  const e = error as { message?: unknown; details?: unknown; cause?: unknown; data?: { cause?: unknown; message?: unknown } };
  return [e.message, e.details, e.data?.message, fullMessage(e.cause, depth + 1), fullMessage(e.data?.cause, depth + 1)]
    .filter((m) => typeof m === "string" && m)
    .join(" | ");
}
