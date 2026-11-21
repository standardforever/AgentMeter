#!/usr/bin/env bash
# Phase 2 demo on a LOCAL fork of Aevum (real tUSD8, no real funds):
#   terminal 1: make fork
#   terminal 2: make demo-phase2
#
# Starts the facilitator, an honest seller and a rogue seller, then runs the AI agent:
#   A. what a 402 looks like on the wire
#   B. the agent answers a question, paying per API call
#   C. a prompt injection in the news feed sends a gullible agent to the rogue seller: refused on-chain
#   D. the audit trail: every paid answer has its fingerprint attested on-chain
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=${RPC:-http://127.0.0.1:8555}
TUSD8=0x456569838f1d43009A91ebA4263147Afd7233483
MM=0x4d4b7031D35B74215bebe33F6AF6e682Ea99d0b1   # tUSD8 master minter, impersonated on the fork only
LOGS=demo/logs; mkdir -p "$LOGS"
[ "$(cast chain-id --rpc-url "$RPC")" = "440050" ] || { echo "Start 'make fork' first (chain 440050)."; exit 1; }

PORTS="4020 4021 4030"
# Stop whatever still listens on our ports (e.g. servers left over from an earlier run).
free_ports() { for port in $PORTS; do pids=$(lsof -ti "tcp:$port" 2>/dev/null || true); [ -z "$pids" ] || kill $pids 2>/dev/null || true; done; }
trap free_ports EXIT
free_ports; sleep 1

newkey() { cast wallet new --json | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['private_key'])"; }
OWNER_KEY=$(newkey);       OWNER=$(cast wallet address "$OWNER_KEY")
FACILITATOR_KEY=$(newkey); FACILITATOR=$(cast wallet address "$FACILITATOR_KEY")
SELLER_KEY=$(newkey);      SELLER=$(cast wallet address "$SELLER_KEY")
AGENT_KEY=$(newkey);       AGENT=$(cast wallet address "$AGENT_KEY")
ATTACKER=0x000000000000000000000000000000000000bad1

echo "== Setup: wallets, tokens, contract, mandate"
for a in "$OWNER" "$FACILITATOR" "$SELLER" "$MM"; do cast rpc anvil_setBalance "$a" 0x8ac7230489e80000 --rpc-url "$RPC" >/dev/null; done
cast rpc anvil_impersonateAccount "$MM" --rpc-url "$RPC" >/dev/null
cast send "$TUSD8" "configureMinter(address,uint256)" "$MM" 1000000000000000 --from "$MM" --unlocked --rpc-url "$RPC" >/dev/null
cast send "$TUSD8" "mint(address,uint256)" "$OWNER" 100000000 --from "$MM" --unlocked --rpc-url "$RPC" >/dev/null

DEPLOY_BLOCK=$(cast block-number --rpc-url "$RPC")
MANDATE=$(cd contracts && forge script script/DeployMandate.s.sol --rpc-url "$RPC" --broadcast --private-key "$OWNER_KEY" 2>&1 \
  | awk '$1=="AgentMandate" {print $2}')
EXPIRES=$(( $(cast block latest -f timestamp --rpc-url "$RPC") + 30 * 86400 ))
cast send "$TUSD8" "approve(address,uint256)" "$MANDATE" 5000000 --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
cast send "$MANDATE" \
  "createMandate(address,address,bytes,(uint128,uint128,uint128,uint32,uint64),address[],uint256)" \
  "$AGENT" 0x0000000000000000000000000000000000000000 0x "(50000,1000000,3000000,86400,$EXPIRES)" "[$SELLER]" 5000000 \
  --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
echo "AgentMandate $MANDATE · mandate #1: 0.05/call · 1/day · 3 total · only the honest seller allowed · 5 tUSD8 in escrow"
echo "agent $AGENT (holds nothing) · seller $SELLER · attacker $ATTACKER"

echo; echo "== Starting services (logs in $LOGS/)"
export RPC_URL="$RPC" MANDATE_ADDRESS="$MANDATE" MANDATE_ID=1
FACILITATOR_KEY="$FACILITATOR_KEY" pnpm -s --filter server facilitator > "$LOGS/facilitator.log" 2>&1 &
SELLER_KEY="$SELLER_KEY" NEWS_INJECTION_URL=http://localhost:4030/v1/premium \
  pnpm -s --filter server seller > "$LOGS/seller.log" 2>&1 &
ROGUE=1 PAY_TO="$ATTACKER" SELLER_PORT=4030 pnpm -s --filter server seller > "$LOGS/rogue.log" 2>&1 &
# Wait until each service answers AND is wired to this run's contract.
for url in http://localhost:4021/supported http://localhost:4020/ http://localhost:4030/; do
  for _ in $(seq 1 60); do curl -sf "$url" 2>/dev/null | grep -qi "$MANDATE" && break; sleep 0.5; done
  curl -sf "$url" 2>/dev/null | grep -qi "$MANDATE" || { echo "Service at $url did not start. See $LOGS/"; exit 1; }
done
echo "facilitator :4021 · seller :4020 · rogue seller :4030"

echo; echo "== A. A request without payment gets HTTP 402 and a price"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://localhost:4020/v1/price?pair=BTC-USD"
curl -s -D - -o /dev/null "http://localhost:4020/v1/price?pair=BTC-USD" | awk -F': ' 'tolower($1)=="payment-required"{print $2}' | tr -d '\r' \
  | base64 --decode | python3 -c "import sys,json;d=json.load(sys.stdin);a=d['accepts'][0];print('PAYMENT-REQUIRED decoded:', json.dumps({'error':d['error'],'scheme':a['scheme'],'network':a['network'],'amount':a['amount'],'payTo':a['payTo']}, indent=1))"

export AGENT_KEY
echo; echo "== B. The agent answers a question, paying per call"
pnpm -s --filter server agent --question "How are bitcoin and ethereum doing?" --no-llm 2>&1 | grep -v ".env not found"

echo; echo "== C. Prompt injection: the news tells AI agents to pay a rogue seller"
pnpm -s --filter server agent --question "Any bitcoin news?" --no-llm --gullible 2>&1 | grep -v ".env not found"

echo; echo "== D. Audit trail on-chain"
sleep 3   # attestations are sent just after each response
SETTLED=$(cast logs --address "$MANDATE" --from-block "$DEPLOY_BLOCK" --rpc-url "$RPC" \
  "PaymentSettled(bytes32,uint256,address,uint256,bytes32,bytes32)" | grep -c transactionHash || true)
ATTESTED=$(cast logs --address "$MANDATE" --from-block "$DEPLOY_BLOCK" --rpc-url "$RPC" \
  "ResultAttested(bytes32,address,bytes32)" | grep -c transactionHash || true)
echo "payments settled: $SETTLED · answers attested by the seller: $ATTESTED"
echo "seller tUSD8:   $(cast call "$TUSD8" 'balanceOf(address)(uint256)' "$SELLER" --rpc-url "$RPC")"
echo "attacker tUSD8: $(cast call "$TUSD8" 'balanceOf(address)(uint256)' "$ATTACKER" --rpc-url "$RPC")"
echo "agent sent $(cast nonce "$AGENT" --rpc-url "$RPC") transactions and holds $(cast call "$TUSD8" 'balanceOf(address)(uint256)' "$AGENT" --rpc-url "$RPC") tUSD8"
