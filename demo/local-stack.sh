#!/usr/bin/env bash
# A complete local AgentMeter for working on the dashboard, on `make fork` (real tUSD8, no real funds).
#   terminal 1: make fork
#   terminal 2: make local-stack     (keeps running; Ctrl+C stops the services)
#   terminal 3: make dev             (dashboard on http://localhost:3000)
#
# It deploys AgentMandate, creates two mandates owned by anvil's first test account, runs the agent
# to make real payments (and one refused prompt injection), writes web/.env.local for the dashboard,
# then keeps the facilitator and both sellers running so you can run more agents:
#   pnpm --filter server agent -- --question "How is solana doing?"   (settings in server/.env)
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=${RPC:-http://127.0.0.1:8555}
TUSD8=0x456569838f1d43009A91ebA4263147Afd7233483
MM=0x4d4b7031D35B74215bebe33F6AF6e682Ea99d0b1   # tUSD8 master minter, impersonated on the fork only
LOGS=demo/logs; mkdir -p "$LOGS"
[ "$(cast chain-id --rpc-url "$RPC")" = "440050" ] || { echo "Start 'make fork' first (chain 440050)."; exit 1; }

PORTS="4020 4021 4030"
free_ports() { for port in $PORTS; do pids=$(lsof -ti "tcp:$port" 2>/dev/null || true); [ -z "$pids" ] || kill $pids 2>/dev/null || true; done; }
trap free_ports EXIT
free_ports; sleep 1

# The owner is anvil's account #0. Its key is PUBLIC (everyone knows it): only ever use it locally.
# You can import it into MetaMask to use the dashboard against the fork.
OWNER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
OWNER=$(cast wallet address "$OWNER_KEY")
[ "$OWNER" = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" ] || { echo "Owner key is not anvil account #0."; exit 1; }
newkey() { cast wallet new --json | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['private_key'])"; }
FACILITATOR_KEY=$(newkey); FACILITATOR=$(cast wallet address "$FACILITATOR_KEY")
SELLER_KEY=$(newkey);      SELLER=$(cast wallet address "$SELLER_KEY")
SELLER2_KEY=$(newkey);     SELLER2=$(cast wallet address "$SELLER2_KEY")
AGENT_KEY=$(newkey);       AGENT=$(cast wallet address "$AGENT_KEY")
ATTACKER=0x000000000000000000000000000000000000bad1

echo "== Funding test wallets on the fork"
for a in "$OWNER" "$FACILITATOR" "$SELLER" "$SELLER2" "$MM"; do cast rpc anvil_setBalance "$a" 0x8ac7230489e80000 --rpc-url "$RPC" >/dev/null; done
cast rpc anvil_impersonateAccount "$MM" --rpc-url "$RPC" >/dev/null
cast send "$TUSD8" "configureMinter(address,uint256)" "$MM" 1000000000000000 --from "$MM" --unlocked --rpc-url "$RPC" >/dev/null
cast send "$TUSD8" "mint(address,uint256)" "$OWNER" 100000000 --from "$MM" --unlocked --rpc-url "$RPC" >/dev/null

echo "== Deploying AgentMandate"
DEPLOY_BLOCK=$(cast block-number --rpc-url "$RPC")
MANDATE=$(cd contracts && forge script script/DeployMandate.s.sol --rpc-url "$RPC" --broadcast --private-key "$OWNER_KEY" 2>&1 \
  | awk '$1=="AgentMandate" {print $2}')
[ -n "$MANDATE" ] || { echo "Deploy failed."; exit 1; }
NOW=$(cast block latest -f timestamp --rpc-url "$RPC")
SIG="createMandate(address,address,bytes,(uint128,uint128,uint128,uint32,uint64),address[],uint256)"
cast send "$TUSD8" "approve(address,uint256)" "$MANDATE" 20000000 --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
# #1 Research agent: 0.05/call, 1/day, 3 total, 30 days, two sellers allowed, 5 tUSD8 escrowed.
cast send "$MANDATE" "$SIG" "$AGENT" 0x0000000000000000000000000000000000000000 0x \
  "(50000,1000000,3000000,86400,$(( NOW + 30 * 86400 )))" "[$SELLER,$SELLER2]" 5000000 --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
# #2 An old trial, revoked: shows what a stopped mandate looks like.
cast send "$MANDATE" "$SIG" "$AGENT" 0x0000000000000000000000000000000000000000 0x \
  "(20000,200000,500000,86400,$(( NOW + 7 * 86400 )))" "[$SELLER]" 500000 --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
cast send "$MANDATE" "revoke(uint256)" 2 --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
# Names are saved on-chain (MandateNamed), so the dashboard shows them on any device.
cast send "$MANDATE" "setName(uint256,string)" 1 "Research agent" --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
cast send "$MANDATE" "setName(uint256,string)" 2 "Old agent (revoked)" --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null

# #3 and #4 power "Try to break it" on the landing page. Their agent key is published in the page on
# purpose, so they're owned by a separate wallet (the facilitator's), allow only our seller and hold
# a few cents: the key can't do anything but sign small payments to our own seller.
LAB_AGENT_KEY=$(newkey); LAB_AGENT=$(cast wallet address "$LAB_AGENT_KEY")
cast send "$TUSD8" "transfer(address,uint256)" "$FACILITATOR" 3000000 --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null
cast send "$TUSD8" "approve(address,uint256)" "$MANDATE" 3000000 --private-key "$FACILITATOR_KEY" --rpc-url "$RPC" >/dev/null
for deposit in 500000 100000; do
  cast send "$MANDATE" "$SIG" "$LAB_AGENT" 0x0000000000000000000000000000000000000000 0x \
    "(50000,1000000,1000000,86400,$(( NOW + 365 * 86400 )))" "[$SELLER]" "$deposit" --private-key "$FACILITATOR_KEY" --rpc-url "$RPC" >/dev/null
done
cast send "$MANDATE" "revoke(uint256)" 4 --private-key "$FACILITATOR_KEY" --rpc-url "$RPC" >/dev/null
cast send "$MANDATE" "setName(uint256,string)" 3 "Demo: lab agent" --private-key "$FACILITATOR_KEY" --rpc-url "$RPC" >/dev/null
cast send "$MANDATE" "setName(uint256,string)" 4 "Demo: revoked lab agent" --private-key "$FACILITATOR_KEY" --rpc-url "$RPC" >/dev/null
# #5 is the Playground's shared demo budget: same public demo agent, our seller only, 2.00 tUSD8.
cast send "$MANDATE" "createNamedMandate(string,address,address,bytes,(uint128,uint128,uint128,uint32,uint64),address[],uint256)" \
  "Playground (demo)" "$LAB_AGENT" 0x0000000000000000000000000000000000000000 0x \
  "(50000,1000000,100000000,86400,$(( NOW + 365 * 86400 )))" "[$SELLER]" 2000000 --private-key "$FACILITATOR_KEY" --rpc-url "$RPC" >/dev/null

echo "== Starting facilitator and sellers (logs in $LOGS/)"
export RPC_URL="$RPC" MANDATE_ADDRESS="$MANDATE" MANDATE_ID=1
FACILITATOR_KEY="$FACILITATOR_KEY" pnpm -s --filter server facilitator > "$LOGS/facilitator.log" 2>&1 &
SELLER_KEY="$SELLER_KEY" NEWS_INJECTION_URL=http://localhost:4030/v1/premium pnpm -s --filter server seller > "$LOGS/seller.log" 2>&1 &
ROGUE=1 PAY_TO="$ATTACKER" SELLER_PORT=4030 pnpm -s --filter server seller > "$LOGS/rogue.log" 2>&1 &
for url in http://localhost:4021/supported http://localhost:4020/ http://localhost:4030/; do
  for _ in $(seq 1 60); do curl -sf "$url" 2>/dev/null | grep -qi "$MANDATE" && break; sleep 0.5; done
  curl -sf "$url" 2>/dev/null | grep -qi "$MANDATE" || { echo "Service at $url did not start. See $LOGS/"; exit 1; }
done

echo "== Making some real payments (and one refused prompt injection)"
export AGENT_KEY
pnpm -s --filter server agent --question "How are bitcoin and ethereum doing?" --no-llm 2>&1 | grep -E "paid|refused|Spent" || true
pnpm -s --filter server agent --question "Any solana news?" --no-llm --gullible 2>&1 | grep -E "paid|refused|Spent" || true

cat > web/.env.local <<EOF
# Written by demo/local-stack.sh for the local fork. Re-run it after restarting \`make fork\`.
NEXT_PUBLIC_NETWORKS=fork
NEXT_PUBLIC_MANDATE_FORK=$MANDATE
NEXT_PUBLIC_MANDATE_DEPLOY_BLOCK_FORK=$DEPLOY_BLOCK
NEXT_PUBLIC_FACILITATOR_URL=http://localhost:4021
# Lets the dashboard act as the owner without a browser wallet (local only; anvil account #0).
NEXT_PUBLIC_DEV_TEST_WALLET=$OWNER
# "Try to break it" on the landing page (demo mandates #3 active, #4 revoked; a deliberately public demo key).
NEXT_PUBLIC_LAB_MANDATE_ID=3
NEXT_PUBLIC_LAB_REVOKED_ID=4
NEXT_PUBLIC_LAB_AGENT_KEY=$LAB_AGENT_KEY
NEXT_PUBLIC_LAB_SELLER=$SELLER
# Playground: its shared demo budget (#5) and the APIs the browser calls.
NEXT_PUBLIC_PLAYGROUND_MANDATE_ID=5
NEXT_PUBLIC_SELLER_URL=http://localhost:4020
NEXT_PUBLIC_ROGUE_SELLER_URL=http://localhost:4030
EOF

cat > server/.env <<EOF
# Written by demo/local-stack.sh for the local fork. Test keys only.
RPC_URL=$RPC
MANDATE_ADDRESS=$MANDATE
MANDATE_ID=1
AGENT_KEY=$AGENT_KEY
SELLER_URL=http://localhost:4020
EOF

cat <<EOF

AgentMeter is running locally.
  AgentMandate   $MANDATE  (deployed in block $DEPLOY_BLOCK)
  Owner          $OWNER  (anvil account #0, local only)
  Agent          $AGENT
  Sellers        $SELLER (price, news, summarize)  ·  $SELLER2 (allowed, not running)
  Facilitator    http://localhost:4021   Seller http://localhost:4020   Rogue seller http://localhost:4030

Next:
  1. In another terminal:  make dev      then open http://localhost:3000
  2. Run more agents:      pnpm --filter server agent -- --question "How is solana doing?"
     and watch the dashboard update.

Press Ctrl+C to stop the services.
EOF
wait
