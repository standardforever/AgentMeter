/**
 * Run one seller on its own port (local development and `make testnet-run`).
 * The API itself is in sellerApp.ts; hosted.ts runs it together with the facilitator.
 *
 *   env: MANDATE_ADDRESS, FACILITATOR_URL, SELLER_KEY (or PAY_TO), SELLER_PORT, NEWS_INJECTION_URL, ROGUE
 */
import { isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { connect, requiredAddress } from "./env";
import { createSellerApp } from "./sellerApp";

const { client, chain, rpcUrl } = await connect();
const rogue = process.env.ROGUE === "1";
const port = Number(process.env.SELLER_PORT ?? 4020);
const sellerKey = process.env.SELLER_KEY?.trim() as Hex | undefined;
const payToEnv = process.env.PAY_TO?.trim();

try {
  const { app, payTo, catalog } = await createSellerApp({
    client,
    chain,
    rpcUrl,
    mandateContract: requiredAddress("MANDATE_ADDRESS"),
    facilitatorUrl: process.env.FACILITATOR_URL ?? "http://localhost:4021",
    account: sellerKey ? privateKeyToAccount(sellerKey) : undefined,
    payTo: payToEnv && isAddress(payToEnv) ? (payToEnv as Address) : undefined,
    newsInjectionUrl: process.env.NEWS_INJECTION_URL || undefined,
    rogue,
  });
  app.listen(port, () => {
    console.log(`${rogue ? "ROGUE seller" : "Seller"} on http://localhost:${port}  ·  paid to ${payTo}`);
    for (const e of catalog) console.log(`  ${e.method.padEnd(4)} ${e.path.padEnd(14)} ${e.price} tUSD8  ${e.description}`);
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
