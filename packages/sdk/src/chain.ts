import { defineChain, type Address, type Chain } from "viem";

/** QDay Aevum testnet (chain 44005). Shanghai EVM; RPC over HTTPS only; use legacy (type 0) transactions. */
export const aevumTestnet: Chain = defineChain({
  id: 44005,
  name: "QDay Aevum Testnet",
  nativeCurrency: { name: "Test QDAY", symbol: "tQDAY", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-test.qday.info"] } },
  blockExplorers: { default: { name: "Aevum Explorer", url: "https://explorer-test.qday.info" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
});

/** The tUSD8 stablecoin on Aevum testnet. 6 decimals. */
export const TUSD8_ADDRESS: Address = "0x456569838f1d43009A91ebA4263147Afd7233483";
export const TUSD8_DECIMALS = 6;

/** CAIP-2 network id for a chain, e.g. "eip155:44005". */
export const caip2 = (chainId: number) => `eip155:${chainId}`;
