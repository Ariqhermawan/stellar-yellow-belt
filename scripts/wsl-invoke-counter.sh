#!/usr/bin/env bash
# Invoke increment(by=5) on the deployed yellow-counter contract (testnet) and
# print the resulting contract-call transaction hash (verifiable on Stellar Expert).
set -euo pipefail

if [ -f "$HOME/.cargo/env" ]; then . "$HOME/.cargo/env"; fi
export PATH="$HOME/.cargo/bin:$PATH"

CID="CBVQQHNBJU3DAUUDL65VN7CGKYEETPMHW2HANPZJVGHYQMML56S6QC24"

PUB=$(stellar keys address ybcounter)
echo "DEPLOYER=$PUB"

echo "== invoke increment(by=5) =="
RESULT=$(stellar contract invoke --id "$CID" --source-account ybcounter --network testnet -- increment --by 5)
echo "RESULT=$RESULT"

# The tx id/hash is the first 64-hex token in the account's latest tx record.
HASH=$(curl -s "https://horizon-testnet.stellar.org/accounts/$PUB/transactions?order=desc&limit=1" | grep -oE '[0-9a-f]{64}' | head -1)
echo "TXHASH=$HASH"
echo "EXPLORER=https://stellar.expert/explorer/testnet/tx/$HASH"
