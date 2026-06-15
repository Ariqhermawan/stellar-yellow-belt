# Rise In Submission - Yellow Belt

## Target

Level 2 / Yellow Belt: Soroban smart-contract dApp.

## What to Review

- Multi-wallet connection through Stellar Wallets Kit.
- Deployed Soroban counter contract on Testnet.
- Read state through simulation with no signature.
- Write state with `increment(by)` and `reset()`.
- Display transaction stages and recent contract events.

## Contract

| Field | Value |
| --- | --- |
| Contract ID | `CBVQQHNBJU3DAUUDL65VN7CGKYEETPMHW2HANPZJVGHYQMML56S6QC24` |
| Explorer | https://stellar.expert/explorer/testnet/contract/CBVQQHNBJU3DAUUDL65VN7CGKYEETPMHW2HANPZJVGHYQMML56S6QC24 |
| Source | `contracts/yellow-counter/` |

## On-chain Proof

| Field | Value |
| --- | --- |
| Transaction | `3d8cf4c589806566a47a6660e48430288296a413aa8cfab915350d93b6edcb4c` |
| Explorer | https://stellar.expert/explorer/testnet/tx/3d8cf4c589806566a47a6660e48430288296a413aa8cfab915350d93b6edcb4c |
| Call | `increment(5)` |
| Event | `inc` with value `5` |

## Run Locally

```bash
npm install
npm run dev
npm run build

cd contracts/yellow-counter
cargo test
cargo build --target wasm32v1-none --release
```

## CI

GitHub Actions runs frontend build plus Soroban contract test/build in `.github/workflows/ci.yml`.
