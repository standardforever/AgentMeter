#!/usr/bin/env bash
# End-to-end AgentMandate demo on a LOCAL fork of Aevum (real tUSD8, no real funds).
#   terminal 1: make fork
#   terminal 2: bash demo/fork-demo.sh
# Deploys AgentMandate, creates a mandate for a fresh agent key, then runs the TypeScript agent:
# a paid call to an allowlisted seller, a prompt-injected payment to an attacker, and an over-cap call.
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=${RPC:-http://127.0.0.1:8555}
TUSD8=0x456569838f1d43009A91ebA4263147Afd7233483
MM=0x4d4b7031D35B74215bebe33F6AF6e682Ea99d0b1   # tUSD8 master minter, impersonated on the fork only
[ "$(cast chain-id --rpc-url "$RPC")" = "440050" ] || { echo "Start 'make fork' first (chain 440050)."; exit 1; }

newkey() { cast wallet new --json | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['private_key'])"; }
OWNER_KEY=$(newkey); OWNER=$(cast wallet address "$OWNER_KEY")
FACILITATOR_KEY=$(newkey); FACILITATOR=$(cast wallet address "$FACILITATOR_KEY")
AGENT_KEY=$(newkey); AGENT=$(cast wallet address "$AGENT_KEY")
SELLER=0x000000000000000000000000000000000000beef
ATTACKER=0x000000000000000000000000000000000000bad1

for a in "$OWNER" "$FACILITATOR" "$MM"; do cast rpc anvil_setBalance "$a" 0x8ac7230489e80000 --rpc-url "$RPC" >/dev/null; done
cast rpc anvil_impersonateAccount "$MM" --rpc-url "$RPC" >/dev/null
cast send "$TUSD8" "configureMinter(address,uint256)" "$MM" 1000000000000000 --from "$MM" --unlocked --rpc-url "$RPC" >/dev/null
cast send "$TUSD8" "mint(address,uint256)" "$OWNER" 100000000 --from "$MM" --unlocked --rpc-url "$RPC" >/dev/null

MANDATE=$(cd contracts && forge script script/DeployMandate.s.sol --rpc-url "$RPC" --broadcast --private-key "$OWNER_KEY" 2>&1 \
  | awk '$1=="AgentMandate" {print $2}')
echo "AgentMandate  $MANDATE"
echo "owner $OWNER · agent $AGENT (holds nothing) · facilitator $FACILITATOR"

# Mandate: 0.05 per call, 1 per day, 3 in total, 30 days, only SELLER allowlisted, 5 tUSD8 escrowed.
EXPIRES=$(( $(cast block latest -f timestamp --rpc-url "$RPC") + 30 * 86400 ))
cast send "$TUSD8" "approve(address,uint256)" "$MANDATE" 5000000 --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
cast send "$MANDATE" \
  "createMandate(address,address,bytes,(uint128,uint128,uint128,uint32,uint64),address[],uint256)" \
  "$AGENT" 0x0000000000000000000000000000000000000000 0x "(50000,1000000,3000000,86400,$EXPIRES)" "[$SELLER]" 5000000 \
  --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
echo "Mandate #1 created: 0.05/call · 1/day · 3 total · seller allowlisted · 5 tUSD8 escrowed"

export RPC_URL="$RPC" MANDATE_ADDRESS="$MANDATE" MANDATE_ID=1 AGENT_KEY FACILITATOR_KEY
run() { (cd examples && pnpm -s agent-pay 2>&1 | grep -v ".env not found") || true; }

echo; echo "== 1. Paid call to the allowlisted seller";            PAYEE=$SELLER   run
echo; echo "== 2. Prompt-injected payment to an attacker";         PAYEE=$ATTACKER run
echo; echo "== 3. Seller asks 0.06, over the 0.05 per-call cap";   PAYEE=$SELLER AMOUNT=0.06 run

echo
echo "seller tUSD8:   $(cast call "$TUSD8" 'balanceOf(address)(uint256)' "$SELLER" --rpc-url "$RPC")"
echo "attacker tUSD8: $(cast call "$TUSD8" 'balanceOf(address)(uint256)' "$ATTACKER" --rpc-url "$RPC")"
echo "agent sent $(cast nonce "$AGENT" --rpc-url "$RPC") transactions and holds $(cast call "$TUSD8" 'balanceOf(address)(uint256)' "$AGENT" --rpc-url "$RPC") tUSD8"
