#!/usr/bin/env node
import { runFacilitator } from "../server/facilitator.ts";

runFacilitator().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
