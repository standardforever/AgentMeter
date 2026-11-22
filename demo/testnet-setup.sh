#!/usr/bin/env bash
# One-command setup of AgentMeter on the real Aevum testnet (chain 44005). Safe to re-run: each step
# checks what's already done and picks up where it stopped.
#
#   make testnet-setup     creates test wallets, waits for faucet funds, deploys, creates mandates,
#                          writes server/.env and web/.env.local
#   make testnet-run       starts the facilitator and sellers against the testnet
#
# Everything secret goes in .env.testnet at the repo root. git ignores it (checked below). These are
# TEST wallets for test tokens only: never send real funds to them.
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=${RPC:-https://rpc-test.qday.info}
CHAIN_ID=${CHAIN_ID:-44005}
NET_KEY=${NET_KEY:-aevum}           # dashboard network: "aevum" (or "fork" to rehearse on make fork)
STATE=${STATE:-.env.testnet}
TUSD8=0x456569838f1d43009A91ebA4263147Afd7233483
LEGACY=--legacy                     # Aevum takes legacy (type 0) transactions
NEED_TUSD8=4000000                  # 4.00 tUSD8: 3.00 for the main mandate, 0.60 for the demo mandates, spare
SIG="createMandate(address,address,bytes,(uint128,uint128,uint128,uint32,uint64),address[],uint256)"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*"; exit 1; }
save() { # save KEY VALUE: add or replace a line in the state file
  touch "$STATE"; chmod 600 "$STATE"
  grep -v "^$1=" "$STATE" > "$STATE.tmp" || true; echo "$1=$2" >> "$STATE.tmp"; mv "$STATE.tmp" "$STATE"
}
tq()   { cast balance "$1" --rpc-url "$RPC"; }                                       # tQDAY, in wei
usd()  { cast call "$TUSD8" "balanceOf(address)(uint256)" "$1" --rpc-url "$RPC" | awk '{print $1}'; }
lt()   { python3 -c "import sys; sys.exit(0 if int('$1') < int('$2') else 1)"; }   # big-number "less than"
fmt6() { python3 -c "print(f'{int($1)/1e6:.2f}')"; }
fmt18(){ python3 -c "print(f'{int($1)/1e18:.4f}')"; }
send() { cast send "$@" --private-key "$KEY" --rpc-url "$RPC" $LEGACY --json; }
# The mandate id created by a createMandate transaction (MandateCreated's first indexed topic).
created_id() { python3 -c "
import json,sys
r=json.loads(sys.stdin.read())
t='$(cast keccak 'MandateCreated(uint256,address,address,address,(uint128,uint128,uint128,uint32,uint64))')'
print(next(int(l['topics'][1],16) for l in r['logs'] if l['topics'][0]==t))"; }

# ------------------------------------------------------------------ 0. checks
command -v cast >/dev/null && command -v forge >/dev/null || fail "Foundry isn't installed (cast/forge). See the Phase 1 walkthrough."
[ "$(cast chain-id --rpc-url "$RPC")" = "$CHAIN_ID" ] || fail "$RPC isn't chain $CHAIN_ID. Check your internet connection or the RPC URL."
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git check-ignore -q "$STATE" || fail "$STATE is not ignored by git. Add '.env*' to .gitignore before creating keys."
fi
if [ -f "$STATE" ]; then set -a; . "$(cd "$(dirname "$STATE")" && pwd)/$(basename "$STATE")"; set +a; fi

# ------------------------------------------------------------------ 1. test wallets
say "1/6  Test wallets"
for role in OWNER FACILITATOR SELLER AGENT LAB_AGENT; do
  var="${role}_KEY"
  if [ -z "${!var:-}" ]; then
    key=$(cast wallet new --json | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['private_key'])")
    save "$var" "$key"; printf -v "$var" '%s' "$key"
    echo "  created $role"
  fi
done
OWNER=$(cast wallet address "$OWNER_KEY"); FACILITATOR=$(cast wallet address "$FACILITATOR_KEY")
SELLER=$(cast wallet address "$SELLER_KEY"); AGENT=$(cast wallet address "$AGENT_KEY"); LAB_AGENT=$(cast wallet address "$LAB_AGENT_KEY")
cat <<EOF
  Owner        $OWNER   (creates mandates; the one you fund)
  Facilitator  $FACILITATOR   (submits payments, pays gas)
  Seller       $SELLER   (gets paid, records receipts)
  Agent        $AGENT   (only signs: no funds needed)
  Demo agent   $LAB_AGENT   (for "Try to break it"; its key is public on purpose)
  Keys are in $STATE (ignored by git).
EOF

# ------------------------------------------------------------------ 2. funding
say "2/6  Funds"
GAS_PRICE=$(cast gas-price --rpc-url "$RPC")
# In gas: the facilitator pays ~150k per payment, the seller ~60k per receipt. Budget for a few hundred.
FACILITATOR_QDAY=$(( GAS_PRICE * 40000000 ))
SELLER_QDAY=$(( GAS_PRICE * 15000000 ))
NEED_QDAY=$(( GAS_PRICE * 70000000 ))          # the two above, plus ~15M for the deploy and the mandates
Q=$(tq "$OWNER"); U=$(usd "$OWNER")
echo "  Owner has $(fmt18 "$Q") tQDAY and $(fmt6 "$U") tUSD8"
if lt "$Q" "$NEED_QDAY" || lt "$U" "$NEED_TUSD8"; then
  cat <<EOF

  The owner needs at least $(fmt18 "$NEED_QDAY") tQDAY (for gas) and $(fmt6 "$NEED_TUSD8") tUSD8.
    1. Open https://faucet.qday.info/en
    2. Paste this address:  $OWNER
    3. Request tQDAY, then request tUSD8 (the faucet may make you wait between requests).
    4. Run 'make testnet-setup' again. It continues from here.
EOF
  exit 0
fi
for who in FACILITATOR SELLER; do
  addr=${!who}; want_var="${who}_QDAY"; want=${!want_var}
  have=$(tq "$addr")
  if lt "$have" "$(( want / 2 ))"; then   # top up only when it's below half, so re-runs don't keep sending
    KEY=$OWNER_KEY send "$addr" --value "$want" >/dev/null
    echo "  sent $(fmt18 "$want") tQDAY to the $(echo "$who" | tr 'A-Z' 'a-z') for gas"
  fi
done
echo "  Funded."

# ------------------------------------------------------------------ 3. deploy
say "3/6  AgentMandate contract"
if [ -z "${MANDATE_ADDRESS:-}" ]; then
  DEPLOY_BLOCK=$(cast block-number --rpc-url "$RPC")
  MANDATE_ADDRESS=$(cd contracts && forge script script/DeployMandate.s.sol --rpc-url "$RPC" --broadcast $LEGACY --private-key "$OWNER_KEY" 2>&1 \
    | awk '$1=="AgentMandate" {print $2}')
  [ -n "$MANDATE_ADDRESS" ] || fail "Deploy failed. Run it by hand to see why: cd contracts && forge script script/DeployMandate.s.sol --rpc-url $RPC --broadcast --legacy --private-key \$OWNER_KEY"
  save MANDATE_ADDRESS "$MANDATE_ADDRESS"; save DEPLOY_BLOCK "$DEPLOY_BLOCK"
  echo "  deployed at $MANDATE_ADDRESS (block $DEPLOY_BLOCK)"
else
  echo "  already deployed at $MANDATE_ADDRESS"
fi

# ------------------------------------------------------------------ 4. mandates
say "4/6  Mandates"
NOW=$(cast block latest -f timestamp --rpc-url "$RPC")
if [ -z "${MANDATE_ID:-}" ]; then
  KEY=$OWNER_KEY send "$TUSD8" "approve(address,uint256)" "$MANDATE_ADDRESS" 3000000 >/dev/null
  # Research agent: 0.05 per call, 1.00 a day, 3.00 in total, 30 days, one seller, 3.00 tUSD8 in escrow.
  MANDATE_ID=$(KEY=$OWNER_KEY send "$MANDATE_ADDRESS" "$SIG" "$AGENT" 0x0000000000000000000000000000000000000000 0x \
    "(50000,1000000,3000000,86400,$(( NOW + 30 * 86400 )))" "[$SELLER]" 3000000 | created_id)
  KEY=$OWNER_KEY send "$MANDATE_ADDRESS" "setName(uint256,string)" "$MANDATE_ID" "Research agent" >/dev/null
  save MANDATE_ID "$MANDATE_ID"
  echo "  mandate #$MANDATE_ID for the agent, owned by you"
else
  echo "  mandate #$MANDATE_ID already exists"
fi
if [ -z "${LAB_MANDATE_ID:-}" ]; then
  # The demo mandates are owned by the facilitator's wallet, so they stay out of your mandate list,
  # allow only your seller, and hold a few cents: the public demo key can't do anything else.
  KEY=$OWNER_KEY send "$TUSD8" "transfer(address,uint256)" "$FACILITATOR" 600000 >/dev/null
  KEY=$FACILITATOR_KEY send "$TUSD8" "approve(address,uint256)" "$MANDATE_ADDRESS" 600000 >/dev/null
  LIMITS="(50000,1000000,1000000,86400,$(( NOW + 365 * 86400 )))"
  LAB_MANDATE_ID=$(KEY=$FACILITATOR_KEY send "$MANDATE_ADDRESS" "$SIG" "$LAB_AGENT" 0x0000000000000000000000000000000000000000 0x "$LIMITS" "[$SELLER]" 500000 | created_id)
  LAB_REVOKED_ID=$(KEY=$FACILITATOR_KEY send "$MANDATE_ADDRESS" "$SIG" "$LAB_AGENT" 0x0000000000000000000000000000000000000000 0x "$LIMITS" "[$SELLER]" 100000 | created_id)
  KEY=$FACILITATOR_KEY send "$MANDATE_ADDRESS" "revoke(uint256)" "$LAB_REVOKED_ID" >/dev/null
  KEY=$FACILITATOR_KEY send "$MANDATE_ADDRESS" "setName(uint256,string)" "$LAB_MANDATE_ID" "Demo: lab agent" >/dev/null
  KEY=$FACILITATOR_KEY send "$MANDATE_ADDRESS" "setName(uint256,string)" "$LAB_REVOKED_ID" "Demo: revoked lab agent" >/dev/null
  save LAB_MANDATE_ID "$LAB_MANDATE_ID"; save LAB_REVOKED_ID "$LAB_REVOKED_ID"
  echo "  demo mandates #$LAB_MANDATE_ID (active) and #$LAB_REVOKED_ID (revoked) for \"Try to break it\""
else
  echo "  demo mandates #$LAB_MANDATE_ID and #$LAB_REVOKED_ID already exist"
fi

# ------------------------------------------------------------------ 5. settings files
say "5/6  Settings for the servers and the dashboard"
[ -f server/.env ] && cp server/.env server/.env.previous
cat > server/.env <<EOF
# Written by demo/testnet-setup.sh for Aevum testnet. Test keys only; git ignores this file.
RPC_URL=$RPC
MANDATE_ADDRESS=$MANDATE_ADDRESS
MANDATE_ID=$MANDATE_ID
AGENT_KEY=$AGENT_KEY
SELLER_URL=http://localhost:4020
FACILITATOR_KEY=$FACILITATOR_KEY
SELLER_KEY=$SELLER_KEY
FACILITATOR_URL=http://localhost:4021
EOF
[ -f web/.env.local ] && cp web/.env.local web/.env.local.previous
cat > web/.env.local <<EOF
# Written by demo/testnet-setup.sh. Use the same values (without the comments) in Vercel.
NEXT_PUBLIC_NETWORKS=$NET_KEY
NEXT_PUBLIC_MANDATE_$(echo "$NET_KEY" | tr 'a-z' 'A-Z')=$MANDATE_ADDRESS
NEXT_PUBLIC_MANDATE_DEPLOY_BLOCK_$(echo "$NET_KEY" | tr 'a-z' 'A-Z')=$DEPLOY_BLOCK
NEXT_PUBLIC_FACILITATOR_URL=http://localhost:4021
# "Try to break it": demo mandates and their deliberately public demo key.
NEXT_PUBLIC_LAB_MANDATE_ID=$LAB_MANDATE_ID
NEXT_PUBLIC_LAB_REVOKED_ID=$LAB_REVOKED_ID
NEXT_PUBLIC_LAB_AGENT_KEY=$LAB_AGENT_KEY
NEXT_PUBLIC_LAB_SELLER=$SELLER
EOF
echo "  wrote server/.env and web/.env.local (the old ones are saved as *.previous)"

# ------------------------------------------------------------------ 6. done
say "6/6  Done"
cat <<EOF
  AgentMandate  $MANDATE_ADDRESS
  Explorer      https://explorer-test.qday.info/address/$MANDATE_ADDRESS
  Your mandate  #$MANDATE_ID   Demo mandates #$LAB_MANDATE_ID, #$LAB_REVOKED_ID

Next:
  1. make testnet-run      (starts the facilitator and sellers; keep it running)
  2. make dev              (restart it if it was running), open http://localhost:3000
  3. pnpm --filter server agent -- --question "How is bitcoin doing?" --no-llm
  To act as the owner in the dashboard, import OWNER_KEY from $STATE into MetaMask
  as a separate test account.
EOF
