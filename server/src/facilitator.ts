/**
 * The facilitator: the service that turns an agent's signed Payment into money moving on-chain.
 *
 *   GET  /supported  what this facilitator can settle (x402 v2)
 *   POST /verify     would this payment be paid? Reads only, costs no gas.
 *   POST /settle     pay it: calls AgentMandate.settle and waits for the transaction.
 *
 * It holds FACILITATOR_KEY, a wallet with a little tQDAY for gas. It never holds tUSD8: the money
 * moves straight from the mandate's escrow to the seller.
 *
 *   pnpm --filter server facilitator      (env: MANDATE_ADDRESS, FACILITATOR_KEY, RPC_URL, FACILITATOR_PORT)
 */
import express from "express";
import { createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentMandateAbi, reasonName, txUrl, aevumTestnet, type Payment } from "@aevum-kit/aevum";
import { connect, requiredAddress, requiredKey } from "./env";
import { checkRequest, type CheckContext } from "./checks";
import { SCHEME, X402_VERSION, caip2, type FacilitatorRequest, type SettleResponse, type VerifyResponse } from "./x402";

const { client, chain, rpcUrl } = await connect();
const mandateContract = requiredAddress("MANDATE_ADDRESS");
const account = privateKeyToAccount(requiredKey("FACILITATOR_KEY"));
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
const port = Number(process.env.FACILITATOR_PORT ?? 4021);

const network = caip2(chain.id);
const asset = await client.readContract({ address: mandateContract, abi: agentMandateAbi, functionName: "token" });
const ctx: CheckContext = { network, asset, mandateContract };
const link = (hash: Hex) => (chain.id === aevumTestnet.id ? txUrl(hash) : hash);

type Verified =
  | { ok: false; response: VerifyResponse }
  | { ok: true; response: VerifyResponse; payment: Payment; signature: Hex };

/** Off-chain checks, then the contract's own verify(). Returns the payment when it would be paid. */
async function verify(body: FacilitatorRequest): Promise<Verified> {
  const checked = checkRequest(body, ctx);
  if (!checked.ok) {
    return { ok: false, response: { isValid: false, invalidReason: checked.reason, invalidMessage: checked.message } };
  }
  const payment = checked.payment;
  const payer = `mandate #${payment.mandateId}`;
  const signature = body.paymentPayload.payload.signature;
  const [ok, reason] = await client.readContract({
    address: mandateContract,
    abi: agentMandateAbi,
    functionName: "verify",
    args: [payment, signature],
  });
  if (!ok) {
    const name = reasonName(reason);
    return { ok: false, response: { isValid: false, invalidReason: `mandate_${name}`, invalidMessage: name, payer } };
  }
  return { ok: true, response: { isValid: true, payer }, payment, signature };
}

// One transaction at a time from this wallet, so two settles can't pick the same nonce.
let queue: Promise<unknown> = Promise.resolve();
const serially = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
};

const app = express();
app.use(express.json());

app.get("/supported", (_req, res) => {
  res.json({
    kinds: [{ x402Version: X402_VERSION, scheme: SCHEME, network, extra: { mandateContract } }],
    extensions: [],
    signers: { "eip155:*": [account.address] },
  });
});

app.post("/verify", async (req, res) => {
  try {
    const { response } = await verify(req.body);
    console.log(`verify  ${response.isValid ? "ok" : `refused: ${response.invalidReason}`}`);
    res.json(response);
  } catch (err) {
    console.error("verify error", err);
    res.json({ isValid: false, invalidReason: "unexpected_verify_error" } satisfies VerifyResponse);
  }
});

app.post("/settle", async (req, res) => {
  const fail = (errorReason: string, errorMessage?: string, payer?: string): SettleResponse => ({
    success: false,
    errorReason,
    errorMessage,
    payer,
    transaction: "",
    network,
  });
  try {
    const checked = await verify(req.body);
    if (!checked.ok) {
      const r = checked.response;
      console.log(`settle  refused: ${r.invalidReason}`);
      return res.json(fail(r.invalidReason ?? "invalid_payload", r.invalidMessage, r.payer));
    }
    const { payment, signature, response } = checked;

    const result = await serially(async () => {
      const settleCall = {
        address: mandateContract,
        abi: agentMandateAbi,
        functionName: "settle",
        args: [payment, signature],
      } as const;
      // Simulate first: a payment that would revert fails here, for free, and we learn its paymentId.
      const { result: paymentId } = await client.simulateContract({ ...settleCall, account });
      const hash = await wallet.writeContract({ ...settleCall, type: "legacy" });
      const receipt = await client.waitForTransactionReceipt({ hash });
      return { paymentId, hash, status: receipt.status };
    });

    if (result.status !== "success") {
      return res.json({ ...fail("unexpected_settle_error", "transaction reverted"), transaction: result.hash });
    }
    console.log(`settle  paid ${payment.amount} to ${payment.payee}  ${link(result.hash)}`);
    res.json({
      success: true,
      payer: response.payer,
      transaction: result.hash,
      network,
      amount: payment.amount.toString(),
      extensions: { mandate: { paymentId: result.paymentId } },
    } satisfies SettleResponse);
  } catch (err) {
    console.error("settle error", err);
    res.json(fail("unexpected_settle_error", err instanceof Error ? err.message.split("\n")[0] : undefined));
  }
});

app.listen(port, () => {
  console.log(`Facilitator on http://localhost:${port}  ·  ${network}  ·  AgentMandate ${mandateContract}`);
  console.log(`Gas wallet ${account.address}`);
});
