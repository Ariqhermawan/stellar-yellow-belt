// Soroban contract interaction: read (simulate), write (prepare -> sign -> send -> poll),
// and event reading. Talks to the testnet Soroban RPC.

import {
  rpc,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, signXdr, describeWalletError } from "./wallet";

export const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
export const FRIENDBOT_URL = "https://friendbot.stellar.org";

// Deployed yellow-counter contract id (testnet).
export const CONTRACT_ID = "CBVQQHNBJU3DAUUDL65VN7CGKYEETPMHW2HANPZJVGHYQMML56S6QC24";

const server = new rpc.Server(SOROBAN_RPC_URL);

export function explorerContract(): string {
  return `https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`;
}
export function explorerTx(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
export function explorerAccount(address: string): string {
  return `https://stellar.expert/explorer/testnet/account/${address}`;
}

/** Whether the account exists (is funded) on testnet. */
export async function accountExists(address: string): Promise<boolean> {
  try {
    await server.getAccount(address);
    return true;
  } catch {
    return false;
  }
}

/** Fund a new testnet account via Friendbot (~10,000 XLM). */
export async function fundAccount(address: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error(`Friendbot request failed (HTTP ${res.status}).`);
}

/** READ the counter value via simulation only (no signature, no fee). */
export async function getCount(sourceAddress: string): Promise<number> {
  const account = await server.getAccount(sourceAddress);
  const contract = new Contract(CONTRACT_ID);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get"))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error("No value returned from the contract.");
  }
  return Number(scValToNative(sim.result.retval));
}

export type WriteProgress = (stage: "building" | "signing" | "sending" | "confirming") => void;

/** Build -> prepare -> sign (wallet) -> submit -> poll. Returns the tx hash on success. */
async function invokeWrite(
  method: string,
  address: string,
  args: ReturnType<typeof nativeToScVal>[],
  onProgress?: WriteProgress,
): Promise<string> {
  onProgress?.("building");
  const account = await server.getAccount(address);
  const contract = new Contract(CONTRACT_ID);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  // Simulate + apply footprint/auth/resource fee.
  const prepared = await server.prepareTransaction(tx);

  onProgress?.("signing");
  let signedXdr: string;
  try {
    signedXdr = await signXdr(prepared.toXDR(), address);
  } catch (err) {
    throw new Error(describeWalletError(err));
  }
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  onProgress?.("sending");
  const sent = await server.sendTransaction(signedTx);
  if (sent.status !== "PENDING") {
    throw new Error(`Submission failed (${sent.status}).`);
  }

  onProgress?.("confirming");
  let got = await server.getTransaction(sent.hash);
  let tries = 0;
  while (got.status === "NOT_FOUND" && tries < 30) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      got = await server.getTransaction(sent.hash);
    } catch {
      // Transient RPC error: keep polling within the retry budget.
    }
    tries += 1;
  }
  if (got.status === "NOT_FOUND") {
    throw new Error("Timed out waiting for confirmation. Check the explorer.");
  }
  if (got.status !== "SUCCESS") {
    const detail =
      "resultXdr" in got && got.resultXdr ? ` (${String(got.resultXdr)})` : "";
    throw new Error(`Transaction ${got.status.toLowerCase()}${detail}.`);
  }
  return sent.hash;
}

/** Increment the on-chain counter by `by`. Returns the tx hash. */
export function increment(address: string, by: number, onProgress?: WriteProgress): Promise<string> {
  return invokeWrite("increment", address, [nativeToScVal(by, { type: "u32" })], onProgress);
}

/** Reset the on-chain counter to 0. Returns the tx hash. */
export function reset(address: string, onProgress?: WriteProgress): Promise<string> {
  return invokeWrite("reset", address, [], onProgress);
}

export type CounterEvent = {
  id: string;
  ledger: number;
  txHash: string;
  topic: string;
  value: number;
};

/** Read recent contract events (newest first). */
export async function getRecentEvents(limit = 12): Promise<CounterEvent[]> {
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(latest.sequence - 1000, 1);
  const res = await server.getEvents({
    startLedger,
    filters: [{ type: "contract", contractIds: [CONTRACT_ID] }],
    limit,
  });
  return res.events
    .map((e) => ({
      id: e.id,
      ledger: e.ledger,
      txHash: e.txHash,
      topic: e.topic[0] ? String(scValToNative(e.topic[0])) : "event",
      value: Number(scValToNative(e.value)),
    }))
    .reverse();
}

/** Decode a Horizon/Soroban error into something readable. */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Something went wrong. Please try again.";
}
