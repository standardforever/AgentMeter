import { toFunctionSelector, type Address, type Hex } from "viem";
import { agentMandateAbi } from "./abi.ts";

/** What an agent signs for one paid request. Amounts are in token base units. */
export type Payment = {
  mandateId: bigint;
  payee: Address;
  amount: bigint;
  resourceHash: Hex;
  requestHash: Hex;
  nonce: Hex;
  deadline: bigint;
};

/** EIP-712 typed data for a Payment, ready for viem's `signTypedData`. */
export function paymentTypedData(chainId: number, mandateContract: Address, payment: Payment) {
  return {
    domain: { name: "AgentMandate", version: "1", chainId, verifyingContract: mandateContract },
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

/** The error name for a 4-byte selector returned by `verify()`, e.g. "PayeeNotAllowed". */
export function reasonName(reason: Hex): string {
  for (const item of agentMandateAbi) {
    if (item.type === "error" && toFunctionSelector(`${item.name}()`) === reason) return item.name;
  }
  return reason;
}
