#!/usr/bin/env bash
# Build + deploy the yellow-counter Soroban contract to Stellar testnet.
# Builds in a WSL-native dir (not /mnt/c) to avoid OneDrive locks + slow IO.
# Run from the repo root. Override SRC=... or KEY=... when needed.
set -euo pipefail

# A piped (non-login) shell doesn't source ~/.cargo/env, so cargo/rustup are
# missing from PATH and `stellar contract build` fails on `cargo metadata`.
if [ -f "$HOME/.cargo/env" ]; then . "$HOME/.cargo/env"; fi
export PATH="$HOME/.cargo/bin:$PATH"

SRC="${SRC:-$PWD/contracts/yellow-counter}"
WORK="$HOME/yellow-counter-build"
KEY="${KEY:-yellow-counter-admin}"

echo "== preparing build dir =="
rm -rf "$WORK"
mkdir -p "$WORK/src"
cp "$SRC/Cargo.toml" "$WORK/Cargo.toml"
cp "$SRC/src/lib.rs" "$WORK/src/lib.rs"
cd "$WORK"

rustup target add wasm32v1-none >/dev/null 2>&1 || true

echo "== building wasm =="
stellar contract build 2>&1 | tail -4
WASM="target/wasm32v1-none/release/yellow_counter.wasm"
if [ ! -f "$WASM" ]; then
  echo "BUILD_FAILED: $WASM not found"
  exit 1
fi
ls -la "$WASM"

echo "== deployer key =="
if ! stellar keys address "$KEY" >/dev/null 2>&1; then
  stellar keys generate "$KEY" --network testnet --fund >/dev/null 2>&1 || true
fi
stellar keys fund "$KEY" --network testnet >/dev/null 2>&1 || true
echo "DEPLOYER=$(stellar keys address "$KEY")"

echo "== deploying to testnet =="
CID=$(stellar contract deploy \
  --wasm "$WASM" \
  --source-account "$KEY" \
  --network testnet 2>/dev/null | grep -oE 'C[A-Z2-7]{55}' | head -1)

if [ -z "$CID" ]; then
  echo "DEPLOY_FAILED: no contract id parsed"
  exit 1
fi
echo "CONTRACT_ID=$CID"
echo "EXPLORER=https://stellar.expert/explorer/testnet/contract/$CID"
