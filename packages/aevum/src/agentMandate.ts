/**
 * AgentMandate ABI and EIP-712 typed data, shared by the agent, the facilitator and the dashboard.
 */
import { toFunctionSelector, type Address, type Hex } from "viem";

export { agentMandateAbi } from "./agentMandateAbi";
import { agentMandateAbi } from "./agentMandateAbi";

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

/** Turns the bytes4 `reason` from verify() into the error name, e.g. "PayeeNotAllowed". */
export function reasonName(reason: Hex): string {
  for (const item of agentMandateAbi) {
    if (item.type === "error" && toFunctionSelector(`${item.name}()`) === reason) return item.name;
  }
  return reason;
}
