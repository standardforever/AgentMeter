import type { Response } from "express";
import { createPublicClient, createWalletClient, http, type Address, type Chain, type Hex, type LocalAccount } from "viem";
import { agentMandateAbi } from "../abi.ts";
import { aevumTestnet } from "../chain.ts";
import { responseHashOf, type SettleResponse } from "../x402.ts";

export type ReceiptsOptions = {
  /** The seller's account. It must be the payment's payee, and needs a little gas token to attest. */
  account: LocalAccount;
  /** The AgentMandate contract the payments were settled on. */
  mandateContract: Address;
  /** Default: Aevum testnet. */
  chain?: Chain;
  /** Default: the chain's public RPC. */
  rpcUrl?: string;
  /** Called when an attestation fails. Default: console.error. */
  onError?: (error: unknown, paymentId: Hex) => void;
};

/**
 * Records a receipt for each paid response: `attest(paymentId, keccak256(body))` on AgentMandate,
 * so a buyer can later prove which response they paid for. Attestations are sent one at a time,
 * after the response, so buyers never wait for them.
 */
export function createReceipts({ account, mandateContract, chain = aevumTestnet, rpcUrl, onError }: ReceiptsOptions) {
  const transport = http(rpcUrl ?? chain.rpcUrls.default.http[0]);
  const client = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account, chain, transport });
  let queue: Promise<unknown> = Promise.resolve();
  const report = onError ?? ((error: unknown, paymentId: Hex) => console.error(`attest ${paymentId} failed`, error));

  /** Attest a response body for a settled payment. Resolves with the transaction hash. */
  function attest(paymentId: Hex, body: string): Promise<Hex> {
    const run = queue.then(async () => {
      const call = {
        address: mandateContract,
        abi: agentMandateAbi,
        functionName: "attest",
        args: [paymentId, responseHashOf(body)],
      } as const;
      await client.simulateContract({ ...call, account });
      const hash = await wallet.writeContract({ ...call, type: "legacy" });
      await client.waitForTransactionReceipt({ hash });
      return hash;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Send `data` as JSON from a paywalled handler, then attest exactly the bytes that were sent.
   * Does nothing extra when the request wasn't paid.
   */
  function send(res: Response, data: unknown): void {
    const body = JSON.stringify(data);
    res.type("application/json").send(body);
    const settlement = res.locals.settlement as SettleResponse | undefined;
    const paymentId = settlement?.extensions?.mandate?.paymentId;
    if (paymentId) attest(paymentId, body).catch((err) => report(err, paymentId));
  }

  return { send, attest };
}
