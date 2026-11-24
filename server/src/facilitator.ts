/**
 * The facilitator: turns an agent's signed Payment into money moving on-chain.
 * Implemented in @standeva/agentmeter; this starts it from server/.env.
 *
 *   pnpm --filter server facilitator   (MANDATE_ADDRESS, FACILITATOR_KEY, RPC_URL, FACILITATOR_PORT)
 */
import { runFacilitator } from "@standeva/agentmeter/server";

runFacilitator().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
