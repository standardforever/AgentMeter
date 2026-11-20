/**
 * AgentMandate ABI and EIP-712 typed data, shared by the agent, the facilitator and the dashboard.
 */
import { parseAbi, type Address, type Hex } from "viem";

export const agentMandateAbi = parseAbi([
  "struct Limits { uint128 maxSinglePayment; uint128 maxPeriodSpend; uint128 maxTotalSpend; uint32 period; uint64 expiresAt; }",
  "struct Payment { uint256 mandateId; address payee; uint256 amount; bytes32 resourceHash; bytes32 requestHash; bytes32 nonce; uint64 deadline; }",
  "struct Receipt { uint256 mandateId; address payee; uint128 amount; uint64 paidAt; bytes32 resourceHash; bytes32 requestHash; bytes32 responseHash; }",
  "function createMandate(address agent, address verifier, bytes verifierKey, Limits limits, address[] payees, uint256 initialDeposit) returns (uint256)",
  "function verify(Payment p, bytes signature) view returns (bool ok, bytes4 reason)",
  "function settle(Payment p, bytes signature) returns (bytes32)",
  "function attest(bytes32 paymentId, bytes32 responseHash)",
  "function revoke(uint256 mandateId)",
  "function paymentDigest(Payment p) view returns (bytes32)",
  "function receiptOf(bytes32 paymentId) view returns (Receipt)",
  "function remaining(uint256 mandateId) view returns (uint256 singlePayment, uint256 period, uint256 total, uint256 balance)",
  "function mandateCount() view returns (uint256)",
  "function token() view returns (address)",
  "event PaymentSettled(bytes32 indexed paymentId, uint256 indexed mandateId, address indexed payee, uint256 amount, bytes32 resourceHash, bytes32 requestHash)",
  "event ResultAttested(bytes32 indexed paymentId, address indexed payee, bytes32 responseHash)",
  "error ZeroAddress()",
  "error ZeroAmount()",
  "error InvalidLimits()",
  "error UnknownMandate()",
  "error NotOwner()",
  "error MandateIsRevoked()",
  "error MandateExpired()",
  "error PaymentExpired()",
  "error PayeeNotAllowed()",
  "error ExceedsSinglePayment()",
  "error ExceedsPeriodBudget()",
  "error ExceedsTotalBudget()",
  "error InsufficientBalance()",
  "error NonceAlreadyUsed()",
  "error InvalidAgentSignature()",
  "error UnknownPayment()",
  "error NotPayee()",
  "error AlreadyAttested()",
  "error EmptyVerifierKey()",
  "error EmptyResponseHash()",
]);

export type Payment = {
  mandateId: bigint;
  payee: Address;
  amount: bigint;
  resourceHash: Hex;
  requestHash: Hex;
  nonce: Hex;
  deadline: bigint;
};

/** EIP-712 typed data the agent signs. Must match PAYMENT_TYPEHASH and the domain in AgentMandate.sol. */
export function paymentTypedData(chainId: number, mandate: Address, payment: Payment) {
  return {
    domain: { name: "AgentMandate", version: "1", chainId, verifyingContract: mandate },
    types: {
      Payment: [
        { name: "mandateId", type: "uint256" },
        { name: "payee", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "resourceHash", type: "bytes32" },
        { name: "requestHash", type: "bytes32" },
        { name: "nonce", type: "bytes32" },
        { name: "deadline", type: "uint64" },
      ],
    },
    primaryType: "Payment",
    message: payment,
  } as const;
}

/** Turns the bytes4 `reason` from verify() into the error name, for logs and the dashboard. */
const reasons: Record<string, string> = Object.fromEntries(
  agentMandateAbi
    .filter((item) => item.type === "error")
    .map((item) => {
      const sig = `${item.name}()`;
      return [sig, item.name];
    }),
);

export async function reasonName(reason: Hex): Promise<string> {
  const { toFunctionSelector } = await import("viem");
  for (const [sig, name] of Object.entries(reasons)) {
    if (toFunctionSelector(sig) === reason) return name;
  }
  return reason;
}
