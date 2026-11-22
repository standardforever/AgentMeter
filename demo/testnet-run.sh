#!/usr/bin/env bash
# Start the facilitator, the seller and the rogue seller against the Aevum testnet, using the wallets
# and contract from `make testnet-setup`. Keep it running; Ctrl+C stops everything.
set -euo pipefail
cd "$(dirname "$0")/.."
STATE=${STATE:-.env.testnet}
[ -f "$STATE" ] || { echo "Run 'make testnet-setup' first."; exit 1; }
set -a; . "$(cd "$(dirname "$STATE")" && pwd)/$(basename "$STATE")"; set +a
[ -n "${MANDATE_ADDRESS:-}" ] || { echo "No contract yet: finish 'make testnet-setup' first."; exit 1; }
RPC=${RPC:-https://rpc-test.qday.info}
LOGS=demo/logs; mkdir -p "$LOGS"
ATTACKER=0x000000000000000000000000000000000000bad1

PORTS="4020 4021 4030"
free_ports() { for port in $PORTS; do pids=$(lsof -ti "tcp:$port" 2>/dev/null || true); [ -z "$pids" ] || kill $pids 2>/dev/null || true; done; }
trap free_ports EXIT
free_ports; sleep 1

# Warn early if the wallets that pay gas are running low (they need tQDAY, not tUSD8).
for who in FACILITATOR SELLER; do
  key_var="${who}_KEY"; addr=$(cast wallet address "${!key_var}")
  bal=$(cast balance "$addr" --rpc-url "$RPC" --ether)
  python3 -c "import sys; sys.exit(0 if float('$bal') >= 0.005 else 1)" || \
    echo "Warning: the $(echo "$who" | tr 'A-Z' 'a-z') has only $bal tQDAY for gas. Re-run 'make testnet-setup' to top it up."
done

export RPC_URL="$RPC" MANDATE_ADDRESS
FACILITATOR_KEY="$FACILITATOR_KEY" pnpm -s --filter server facilitator > "$LOGS/facilitator.log" 2>&1 &
SELLER_KEY="$SELLER_KEY" NEWS_INJECTION_URL=http://localhost:4030/v1/premium pnpm -s --filter server seller > "$LOGS/seller.log" 2>&1 &
ROGUE=1 PAY_TO="$ATTACKER" SELLER_PORT=4030 pnpm -s --filter server seller > "$LOGS/rogue.log" 2>&1 &
for url in http://localhost:4021/supported http://localhost:4020/ http://localhost:4030/; do
  for _ in $(seq 1 60); do curl -sf "$url" 2>/dev/null | grep -qi "$MANDATE_ADDRESS" && break; sleep 0.5; done
  curl -sf "$url" 2>/dev/null | grep -qi "$MANDATE_ADDRESS" || { echo "Service at $url did not start. See $LOGS/"; exit 1; }
done

cat <<MSG
AgentMeter services are running on Aevum testnet.
  Contract     https://explorer-test.qday.info/address/$MANDATE_ADDRESS
  Facilitator  http://localhost:4021   Seller http://localhost:4020   Rogue seller http://localhost:4030
  Logs         $LOGS/

In another terminal:
  pnpm --filter server agent -- --question "How is bitcoin doing?" --no-llm
  pnpm --filter server agent -- --question "Any solana news?" --no-llm --gullible   (prompt injection: refused)

Press Ctrl+C to stop.
MSG
wait
