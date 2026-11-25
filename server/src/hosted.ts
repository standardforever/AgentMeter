/**
 * Everything the live demo needs on the server side, in ONE process on ONE port (for Render and
 * similar hosts):
 *
 *   /             the example seller (price, news, summarize, report)
 *   /rogue        the rogue seller the news feed's prompt injection points at
 *   /facilitator  the x402 facilitator (/supported, /verify, /settle, /activity)
 *
 * env: MANDATE_ADDRESS, FACILITATOR_KEY, SELLER_KEY (required)
 *      RPC_URL (default Aevum testnet), PORT (set by the host; default 4020),
 *      PUBLIC_URL (default RENDER_EXTERNAL_URL, which Render sets), ROGUE_PAY_TO, ANTHROPIC_API_KEY
 */
import express from "express";
import { isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createFacilitator } from "@standeva/agentmeter/server";
import { connect, requiredAddress, requiredKey } from "./env";
import { createSellerApp } from "./sellerApp";

const ATTACKER: Address = "0x000000000000000000000000000000000000bad1";

const { client, chain, rpcUrl } = await connect();
const mandateContract = requiredAddress("MANDATE_ADDRESS");
const port = Number(process.env.PORT ?? 4020);
const publicUrl = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/+$/, "");
const rogueTo = process.env.ROGUE_PAY_TO?.trim();

// The sellers reach the facilitator inside this process, without a round trip through the internet.
const internalFacilitator = `http://127.0.0.1:${port}/facilitator`;

const facilitator = await createFacilitator({
  account: privateKeyToAccount(requiredKey("FACILITATOR_KEY")),
  mandateContract,
  chain,
  rpcUrl,
});
const seller = await createSellerApp({
  client,
  chain,
  rpcUrl,
  mandateContract,
  facilitatorUrl: internalFacilitator,
  account: privateKeyToAccount(requiredKey("SELLER_KEY")),
  newsInjectionUrl: `${publicUrl}/rogue/v1/premium`,
});
const rogue = await createSellerApp({
  client,
  chain,
  rpcUrl,
  mandateContract,
  facilitatorUrl: internalFacilitator,
  payTo: rogueTo && isAddress(rogueTo) ? (rogueTo as Address) : ATTACKER,
  rogue: true,
});

const app = express();
app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});
app.use("/facilitator", facilitator.app);
app.use("/rogue", rogue.app);
app.use("/", seller.app);

app.listen(port, () => {
  console.log(`AgentMeter services on ${publicUrl}  ·  ${facilitator.network}  ·  AgentMandate ${mandateContract}`);
  console.log(`  seller        ${publicUrl}/            paid to ${seller.payTo}`);
  console.log(`  rogue seller  ${publicUrl}/rogue       paid to ${rogue.payTo}`);
  console.log(`  facilitator   ${publicUrl}/facilitator gas wallet ${facilitator.address}`);
});
