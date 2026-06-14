import { useCallback, useState } from "react";
import {
  connectWallet,
  getWalletNetwork,
  disconnectWallet,
  describeWalletError,
} from "./lib/wallet";
import {
  CONTRACT_ID,
  accountExists,
  fundAccount,
  getCount,
  increment,
  reset,
  getRecentEvents,
  explorerContract,
  explorerTx,
  explorerAccount,
  describeError,
  type CounterEvent,
} from "./lib/contract";

type TxStatus =
  | { kind: "idle" }
  | { kind: "pending"; msg: string }
  | { kind: "success"; msg: string; hash: string }
  | { kind: "error"; msg: string };

const shorten = (s: string) => `${s.slice(0, 6)}…${s.slice(-6)}`;

const STAGE_MSG: Record<"building" | "signing" | "sending" | "confirming", string> = {
  building: "Building transaction…",
  signing: "Waiting for wallet signature…",
  sending: "Submitting to the network…",
  confirming: "Waiting for confirmation…",
};

export default function App() {
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [funded, setFunded] = useState<boolean | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [events, setEvents] = useState<CounterEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState("1");
  const [tx, setTx] = useState<TxStatus>({ kind: "idle" });

  const refreshCount = useCallback(async (addr: string) => {
    setCountLoading(true);
    try {
      setCount(await getCount(addr));
    } catch (err) {
      console.error(err);
    } finally {
      setCountLoading(false);
    }
  }, []);

  const refreshEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      setEvents(await getRecentEvents());
    } catch (err) {
      console.error(err);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const loadConnected = useCallback(
    async (addr: string) => {
      setAddress(addr);
      setNetwork(await getWalletNetwork());
      const exists = await accountExists(addr);
      setFunded(exists);
      if (exists) {
        await Promise.all([refreshCount(addr), refreshEvents()]);
      }
    },
    [refreshCount, refreshEvents],
  );

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const addr = await connectWallet();
      if (addr) await loadConnected(addr);
    } catch (err) {
      setConnectError(describeWalletError(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectWallet();
    } catch {
      /* ignore */
    }
    setAddress(null);
    setNetwork(null);
    setFunded(null);
    setCount(null);
    setEvents([]);
    setTx({ kind: "idle" });
  };

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFund = async () => {
    if (!address) return;
    setTx({ kind: "pending", msg: "Requesting testnet XLM from Friendbot…" });
    try {
      await fundAccount(address);
      setFunded(true);
      await Promise.all([refreshCount(address), refreshEvents()]);
      setTx({ kind: "idle" });
    } catch (err) {
      setTx({ kind: "error", msg: describeError(err) });
    }
  };

  const onTestnet = network === "TESTNET";
  const amountNum = Number(amount);
  const amountOk =
    Number.isInteger(amountNum) && amountNum > 0 && amountNum <= 1_000_000;
  const busy = tx.kind === "pending";
  const canWrite = !!address && onTestnet && funded === true && !busy;

  const runWrite = async (label: string, fn: () => Promise<string>) => {
    setTx({ kind: "pending", msg: `${label}…` });
    try {
      const hash = await fn();
      setTx({ kind: "success", msg: `${label} confirmed.`, hash });
      if (address) await Promise.all([refreshCount(address), refreshEvents()]);
    } catch (err) {
      setTx({ kind: "error", msg: describeError(err) });
    }
  };

  const handleIncrement = () => {
    if (!address || !canWrite || !amountOk) return;
    void runWrite("Increment", () =>
      increment(address, amountNum, (stage) =>
        setTx({ kind: "pending", msg: STAGE_MSG[stage] }),
      ),
    );
  };

  const handleReset = () => {
    if (!address || !canWrite) return;
    void runWrite("Reset", () =>
      reset(address, (stage) => setTx({ kind: "pending", msg: STAGE_MSG[stage] })),
    );
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/star.svg" alt="" width={22} height={22} />
          <span>Stellar Counter</span>
        </div>
        <span className="chip">Testnet · Soroban</span>
      </header>

      <main className="main">
        {!address ? (
          <section className="hero card">
            <h1>On-chain counter dApp</h1>
            <p className="muted">
              Connect any Stellar wallet to read and update a number stored in a
              Soroban smart contract on testnet.
            </p>
            <button className="btn primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
            {connectError && (
              <p className="alert error" role="alert">
                {connectError}
              </p>
            )}
            <p className="hint muted">
              Multi-wallet via Stellar Wallets Kit (Freighter, xBull, Albedo,
              Rabet, Lobstr, and more). Set your wallet to Testnet.
            </p>
          </section>
        ) : (
          <div className="grid">
            <section className="card">
              <div className="row between">
                <h2>Account</h2>
                <button className="btn ghost sm" onClick={handleDisconnect}>
                  Disconnect
                </button>
              </div>
              <div className="addr">
                <code title={address}>{shorten(address)}</code>
                <button
                  className="btn ghost sm"
                  onClick={handleCopy}
                  aria-label={`Copy address ${address}`}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="row gap">
                <span className={`net ${onTestnet ? "ok" : "warn"}`}>
                  {network ? `Network: ${network}` : "Network: unknown"}
                </span>
                <a
                  className="link"
                  href={explorerAccount(address)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View account {"↗"}
                </a>
              </div>
              {!onTestnet && (
                <p className="alert warn" role="alert">
                  Switch your wallet to <strong>Testnet</strong> to interact.
                </p>
              )}
              {funded === false && (
                <div className="unfunded">
                  <p className="muted">This account isn&apos;t funded on testnet yet.</p>
                  <button className="btn primary sm" onClick={handleFund} disabled={busy}>
                    Fund with Friendbot
                  </button>
                </div>
              )}
            </section>

            <section className="card">
              <h2>Smart contract</h2>
              <div className="addr">
                <code title={CONTRACT_ID}>{shorten(CONTRACT_ID)}</code>
                <a
                  className="link"
                  href={explorerContract()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Stellar Expert {"↗"}
                </a>
              </div>
              <p className="hint muted">
                A Soroban counter deployed on testnet. Increment and Reset write
                on-chain; the value below is read by simulation (no fee).
              </p>
            </section>

            <section className="card">
              <div className="row between">
                <h2>Counter</h2>
                <button
                  className="btn ghost sm"
                  onClick={() => address && refreshCount(address)}
                  disabled={countLoading || funded !== true}
                  aria-label="Refresh counter"
                >
                  {countLoading ? "…" : "Refresh"}
                </button>
              </div>
              <p className="amount">
                {count === null ? "—" : count.toLocaleString("en-US")}
              </p>
              <div className="controls">
                <label className="amount-input">
                  Amount
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={!canWrite}
                  />
                </label>
                <div className="row gap2">
                  <button
                    className="btn primary"
                    onClick={handleIncrement}
                    disabled={!canWrite || !amountOk}
                  >
                    {busy ? "Working…" : amountOk ? `Increment +${amountNum}` : "Increment"}
                  </button>
                  <button className="btn ghost" onClick={handleReset} disabled={!canWrite}>
                    Reset
                  </button>
                </div>
              </div>
              <div aria-live="polite" aria-atomic="true">
                {tx.kind === "pending" && <p className="alert info">{tx.msg}</p>}
                {tx.kind === "error" && (
                  <p className="alert error" role="alert">
                    {tx.msg}
                  </p>
                )}
                {tx.kind === "success" && (
                  <div className="alert success">
                    <p>{tx.msg}</p>
                    <p className="hash">
                      <code title={tx.hash}>{shorten(tx.hash)}</code>
                    </p>
                    <a
                      className="link"
                      href={explorerTx(tx.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View transaction {"↗"}
                    </a>
                  </div>
                )}
              </div>
            </section>

            <section className="card">
              <div className="row between">
                <h2>Recent events</h2>
                <button
                  className="btn ghost sm"
                  onClick={refreshEvents}
                  disabled={eventsLoading}
                  aria-label="Refresh events"
                >
                  {eventsLoading ? "…" : "Refresh"}
                </button>
              </div>
              {events.length === 0 ? (
                <p className="muted">
                  {eventsLoading ? "Loading…" : "No events yet. Increment to emit one."}
                </p>
              ) : (
                <ul className="events">
                  {events.map((ev) => (
                    <li key={ev.id} className="event">
                      <span className={`tag ${ev.topic === "reset" ? "tag-reset" : "tag-inc"}`}>
                        {ev.topic}
                      </span>
                      <span className="event-val">{ev.value.toLocaleString("en-US")}</span>
                      <a
                        className="link sm"
                        href={explorerTx(ev.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        tx {"↗"}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="footer muted">
        <span>Stellar Testnet · Soroban · funds have no real value</span>
        <a
          href="https://developers.stellar.org/docs/build/smart-contracts"
          target="_blank"
          rel="noopener noreferrer"
        >
          Soroban Docs {"↗"}
        </a>
      </footer>
    </div>
  );
}
