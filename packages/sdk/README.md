# @agentmeter/sdk

Spending-limited x402 payments for AI agents on QDay Aevum.

An owner funds a **mandate** on the AgentMandate contract and sets its rules: which sellers, how much per call, per day and in total. Agents sign payments per request; the contract pays only if every rule passes. The agent's key holds no funds and pays no gas.

```bash
npm install @agentmeter/sdk viem
```

**Pay from an agent**

```ts
import { createPayingFetch } from "@agentmeter/sdk";
import { privateKeyToAccount } from "viem/accounts";

const payingFetch = createPayingFetch({
  agent: privateKeyToAccount(process.env.AGENT_KEY as `0x${string}`),
  chainId: 44005,
  mandate: "0xAgentMandateAddress",
  mandateId: 1n,
});

const res = await payingFetch("https://api.example.com/v1/price?pair=BTC-USD");
```

**Charge for an API** (Express)

```ts
import { paywall } from "@agentmeter/sdk/server";

app.get("/v1/price", paywall(config, { price: "0.01", description: "BTC price" }), handler);
```

**Run a facilitator**

```bash
MANDATE_ADDRESS=0x… FACILITATOR_KEY=0x… npx -p @agentmeter/sdk agentmeter-facilitator
```

Documentation: see the Docs section of the AgentMeter site. License: MIT.
