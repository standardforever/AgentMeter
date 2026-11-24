import type { NextConfig } from "next";

const config: NextConfig = {
  // The workspace packages ship TypeScript source.
  transpilePackages: ["@aevum-kit/aevum", "@agentmeter/sdk"],
};

export default config;
