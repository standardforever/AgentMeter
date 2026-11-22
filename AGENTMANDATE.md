# AgentMandate: spending rules for AI agents that pay per request

`contracts/src/AgentMandate.sol` is the on-chain core of AgentMeter: x402-style pay-per-request
for AI agents on QDay Aevum testnet, settled in tUSD8.

An owner deposits tUSD8 into a **mandate** and names an **agent key**. The agent never holds money
and never pays gas. For each paid API call it signs an EIP-712 `Payment`; the seller's
facilitator (or anyone) submits it. The contract pays only if the payment fits the mandate. A
prompt-injected agent can sign anything it likes; the contract still refuses.

Based on Aevum Starter Kit (MIT, PQA Labs).

## How it lines up with QDay's agent design

| QDay's agent docs describe | What this contract does on Aevum |
|---|---|
| Payment Agent with `maxSinglePayment`, `maxDailySpend`, `allowedRecipients` ([AI Agent API](https://wiki.qday.info/Knowledge/technical/reference/ai-agent-api/)) | The same limits, same names, enforced in `settle` |
| Session keys with spend limits and expiry ([Account Abstraction Protocol](https://wiki.qday.info/Knowledge/technical/protocol/account-abstraction-protocol/)) | Agent key scoped by allowlist, per-call cap, per-period cap, lifetime cap, expiry, revoke |
| x402 facilitator: verify, then settle | `verify()` returns ok or the exact reason; `settle()` is idempotent for safe retries |
| Agent Registry result attestation ([AI Agent Protocol](https://wiki.qday.info/Knowledge/technical/protocol/ai-agent-protocol/)) | Receipt binds `resourceHash` + `requestHash`; the payee `attest`s a `responseHash` |
| ML-DSA-65 precompile in Phase 2 ([Precompiled Contracts](https://wiki.qday.info/Knowledge/technical/developer-guide/precompiled-contracts/)) | Pluggable `IAgentVerifier`; `MLDSA65Verifier` adapter ready, fails closed until the precompile exists |

## The rules `settle` enforces

In this order, each with its own error so the dashboard can say exactly why:

| Check | Error |
|---|---|
| Mandate exists | `UnknownMandate` |
| Not revoked | `MandateIsRevoked` |
| Not expired | `MandateExpired` |
| Payment deadline not passed | `PaymentExpired` |
| Amount > 0 | `ZeroAmount` |
| Payee is allowlisted | `PayeeNotAllowed` |
| Amount <= `maxSinglePayment` | `ExceedsSinglePayment` |
| Spend this period <= `maxPeriodSpend` | `ExceedsPeriodBudget` |
| Lifetime spend <= `maxTotalSpend` | `ExceedsTotalBudget` |
| Escrow covers it | `InsufficientBalance` |
| Nonce not used for another payment | `NonceAlreadyUsed` |
| Signature is the agent's (ECDSA or the mandate's verifier) | `InvalidAgentSignature` |

Settling the same signed `Payment` twice returns the same `paymentId` and pays nothing, so a
facilitator can retry after a timeout.

## Functions

| Who | Function |
|---|---|
| Owner | `createMandate(agent, verifier, verifierKey, limits, payees, initialDeposit)` |
| Owner | `setPayee`, `setLimits`, `setAgent` (rotate key or move to another scheme, funds stay), `revoke`, `withdraw` |
| Anyone | `deposit`, `depositWithAuthorization` (gasless EIP-3009 top-up, bound to one mandate) |
| Facilitator | `verify(payment, sig)` then `settle(payment, sig)` |
| Payee | `attest(paymentId, responseHash)` |
| Anyone | `paymentDigest`, `getMandate`, `remaining`, `receiptOf`, `isSettled` |

## Run it

```bash
make install
make build            # compiles and checks the bytecode is Shanghai-safe
make test             # unit tests, including AgentMandate.t.sol (38 tests + fuzzing)
make test-fork        # against the real tUSD8 on a local fork of Aevum

# Full demo on a local fork (terminal 1, then terminal 2):
make fork
make demo-fork
```

`make demo-fork` deploys the contract, creates a mandate for a fresh agent key, and runs
`examples/src/agent-pay.ts` three times:

```
== 1. Paid call to the allowlisted seller
Settled: success ... Left today 0.99 · left in total 2.99 · in escrow 4.99

== 2. Prompt-injected payment to an attacker
Refused by the mandate: PayeeNotAllowed

== 3. Seller asks 0.06, over the 0.05 per-call cap
Refused by the mandate: ExceedsSinglePayment

agent sent 0 transactions and holds 0 tUSD8
```

## Deploy to Aevum testnet

```bash
cast wallet import aevum-deployer --interactive    # a TEST wallet's key
make deploy-mandate-aevum ACCOUNT=aevum-deployer    # prints the AgentMandate address
```

Then create a mandate (tUSD8 has 6 decimals: 50000 = 0.05):

```bash
cast send 0x456569838f1d43009A91ebA4263147Afd7233483 "approve(address,uint256)" <MANDATE> 5000000 \
  --account aevum-deployer --rpc-url https://rpc-test.qday.info --legacy
cast send <MANDATE> \
  "createMandate(address,address,bytes,(uint128,uint128,uint128,uint32,uint64),address[],uint256)" \
  <AGENT> 0x0000000000000000000000000000000000000000 0x "(50000,1000000,3000000,86400,<EXPIRES_UNIX>)" \
  "[<SELLER>]" 5000000 --account aevum-deployer --rpc-url https://rpc-test.qday.info --legacy
```

## Known limits (say these in the README you submit)

- Unaudited, built during the challenge window, testnet only.
- The ML-DSA-65 adapter cannot verify anything until QDay publishes the Phase 2 precompile; it
  fails closed. Tests simulate the precompile to show the wiring works.
- `attest` records what the seller says it delivered. It proves the seller committed to a
  response, not that the response is correct.
- One token per deployment (tUSD8).
