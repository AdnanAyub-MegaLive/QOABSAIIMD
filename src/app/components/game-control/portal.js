"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Gamepad2,
  ReceiptText,
  SlidersHorizontal,
  Plug,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Plus,
  ChevronDown,
  Coins,
  Users,
  Activity,
  FlaskConical,
  ExternalLink,
  Search,
  Download,
  X,
  Check,
  Copy,
  RotateCw,
  ShieldCheck,
  AlertCircle,
  LockKeyhole,
  LogOut,
  Pause,
  Play,
  CircleDot,
} from "lucide-react";
import { formatCoins as fmt } from "@/lib/game-control/demo";
import { markets, resultColor } from "@/lib/game-control/roulette/engine.mjs";
import { isBetWinner } from "@/lib/game-control/roulette/original-rules.mjs";
import { summary } from "@/lib/game-control/rules.mjs";
import { useStore } from "./store";
const menu = [
  ["Overview", LayoutDashboard],
  ["Games", Gamepad2],
  ["Bet & win logs", ReceiptText],
  ["Probability controls", SlidersHorizontal],
  ["Integration", Plug],
];
const labels = {
  Overview: "Every round. Every coin. All in one place.",
  Games: "Your collection of room-ready games.",
  "Bet & win logs": "Trace every bet from the player to the payout.",
  "Probability controls":
    "Set the rules for future rounds. Keep a record of every change.",
  Integration: "Connect your game portal to the Mega Live experience.",
};
const statusLabel = {
  active: "Active",
  paused: "Paused",
  not_connected: "Not connected",
  settled: "Settled",
  needs_review: "Needs review",
  debit_pending: "Debit pending",
  credit_pending: "Payout pending",
  debit_confirmed: "Debit confirmed",
  credit_confirmed: "Payout confirmed",
};
function date(value) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function Badge({ status }) {
  return (
    <span className={"status " + status}>{statusLabel[status] || status}</span>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const close = (e) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("cancel", close);
    return () => {
      d.removeEventListener("cancel", close);
      d.close();
    };
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      aria-label={title}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Login() { return <div className="boot-screen"><Link href="/">Sign in to Mega Live Portal</Link></div>; }
export default function Portal() {
  const { isDemo, data, authenticated, loading, error, refresh, saveGame, loadOlder } =
    useStore();
  const [tab, setTab] = useState("Overview"),
    [period, setPeriod] = useState("24"),
    [editing, setEditing] = useState(null),
    [detail, setDetail] = useState(null),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [gameFilter, setGameFilter] = useState("all"),
    [outcomeFilter, setOutcomeFilter] = useState("all"),
    [page, setPage] = useState(0),
    [loadingOlder, setLoadingOlder] = useState(false);
  function notify(message) {
    setToast(message);
  }
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);

  const [now] = useState(() => Date.now());
  const windowRounds = useMemo(
    () =>
      data.rounds.filter(
        (r) =>
          period === "all" ||
          Date.parse(r.createdAt) >= now - Number(period) * 3600000,
      ),
    [data.rounds, period, now],
  );
  const stats = summary(windowRounds);
  const filtered = windowRounds.filter(
    (r) =>
      (gameFilter === "all" || r.gameId === gameFilter) &&
      (outcomeFilter === "all" ||
        (outcomeFilter === "review"
          ? r.status !== "settled"
          : r.outcome === outcomeFilter)) &&
      [r.id, r.uid, r.nickname, r.roomId].some((v) =>
        String(v).toLowerCase().includes(query.toLowerCase()),
      ),
  );
  const selectedGame =
    data.games.find((g) => g.engine === "flip" && g.status === "active") ||
    data.games.find((g) => g.engine === "flip");
  const startAdd = () =>
    setEditing({
      id: "",
      name: "",
      engine: "flip",
      category: "Instant",
      status: "paused",
      winProbability: 45,
      payoutMultiplier: 2,
      minBet: 10,
      maxBet: 1000,
      color: "purple",
    });
  function exportCsv() {
    const cols = [
      "id",
      "uid",
      "nickname",
      "roomId",
      "gameName",
      "bet",
      "payout",
      "outcome",
      "status",
      "winProbability",
      "payoutMultiplier",
      "revision",
      "createdAt",
    ];
    const escape = (x) =>
      '"' +
      String(x ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const blob = new Blob(
      [
        "\uFEFF" +
          [
            cols.join(","),
            ...filtered.map((r) => cols.map((k) => escape(r[k])).join(",")),
          ].join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `mega-rounds-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(`Exported ${filtered.length} matching records.`);
  }
  async function copyLink(game) {
    await navigator.clipboard.writeText(
      `${location.origin}/games/play/?game=${encodeURIComponent(game.id)}`,
    );
    notify(
      isDemo
        ? "Demo launch link copied. Live integration needs your deployed server URL."
        : "Launch URL copied. Open from Mega Live with a mobile session.",
    );
  }
  if (loading && !authenticated) return <div className="boot-screen">Loading games…</div>;
  if (!authenticated && error) return <div className="boot-screen" role="alert">{error}<button onClick={refresh}>Retry</button></div>;
  if (!authenticated) return <Login />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/games-management">
          <span className="brand-mark">M</span>
          <span>
            mega<span className="brand-live">live</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">
            <Gamepad2 size={18} />
          </span>
          <div>
            <b>Game Control</b>
            <small>Management portal</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {menu.map(([name, Icon]) => (
            <button
              key={name}
              className={tab === name ? "nav-item selected" : "nav-item"}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              <Icon size={19} />
              {name}
              {name === "Games" && (
                <span className="nav-count">{data.games.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sandbox-card">
            <FlaskConical size={20} />
            <b>Make room for play.</b>
            <p>Try a round before it reaches your players.</p>
            <Link href="/games/preview">
              Open game preview <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="admin-profile">
            <span className="avatar">A</span>
            <div>
              <b>Administrator</b>
              <small>{isDemo ? "Demo workspace" : "Workspace owner"}</small>
            </div>
            {!isDemo && (
              <button
                className="icon-button"
                title="Return to portal"
                aria-label="Return to portal"
                onClick={async () => {
                  location.assign("/home");
                }}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span> <b>{tab}</b>
          </span>
          <div className="top-actions">
            <span className="demo-pill">
              {isDemo ? <FlaskConical size={14} /> : <ShieldCheck size={14} />}{" "}
              {isDemo ? "Demo workspace" : "Admin workspace"}
            </span>
            <span className="top-avatar">A</span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">MEGA LIVE / GAME OPERATIONS</div>
              <h1>{tab}</h1>
              <p>{labels[tab]}</p>
            </div>
            <div className="heading-actions">
              {["Overview", "Bet & win logs"].includes(tab) && (
                <select
                  aria-label="Time range"
                  value={period}
                  onChange={(e) => { setPeriod(e.target.value); setPage(0); }}
                >
                  <option value="24">Last 24 hours</option>
                  <option value="168">Last 7 days</option>
                  <option value="all">All loaded records</option>
                </select>
              )}
              {["Overview", "Games"].includes(tab) && (
                <button className="button primary" onClick={startAdd}>
                  <Plus size={17} /> Add game
                </button>
              )}
              {tab === "Bet & win logs" && (
                <button className="button" onClick={exportCsv}>
                  <Download size={16} /> Export CSV
                </button>
              )}
            </div>
          </div>
          {isDemo ? (
            <div className="notice">
              <FlaskConical size={17} />
              <span>
                <b>Demo workspace.</b> Sample records and practice coins.
                Changes reset on reload.
              </span>
              <button onClick={() => setTab("Integration")}>
                View setup <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <div className="notice">
              <ShieldCheck size={17} />
              <span>
                {data.integration?.live
                  ? "Active games settle against the Mega Live coin wallet."
                  : "Activate a game when its settings are ready."}
              </span>
              <button onClick={refresh}>
                <RotateCw size={15} /> Refresh
              </button>
            </div>
          )}
          {error && (
            <div className="error-message" role="alert">
              {error}
              <button className="text-button" onClick={refresh}>
                Try again
              </button>
            </div>
          )}
          {loading && <p className="loading-message">Loading workspace…</p>}
          {tab === "Overview" && (
            <>
              <div className="metrics">
                {[
                  [
                    "Total bets",
                    fmt(stats.bets),
                    "Coins wagered in settled rounds",
                    Coins,
                  ],
                  [
                    "Total payouts",
                    fmt(stats.payouts),
                    "Gross coins returned to players",
                    ArrowUpRight,
                  ],
                  [
                    "Net game revenue",
                    fmt(stats.revenue),
                    "Settled bets minus payouts",
                    Activity,
                  ],
                  [
                    "Completed rounds",
                    fmt(stats.rounds),
                    `Across ${stats.players} players`,
                    Users,
                  ],
                ].map(([label, value, sub, Icon]) => (
                  <section className="metric" key={label}>
                    <div>
                      <span>{label}</span>
                      <Icon size={18} />
                    </div>
                    <strong>{value}</strong>
                    <small>{sub}</small>
                  </section>
                ))}
              </div>
              <div className="overview-grid">
                <ActivityChart rounds={windowRounds} period={period} />
                <section className="panel health-panel">
                  <div className="panel-heading">
                    <h2>Game health</h2>
                    <span className="tiny-label">
                      {isDemo ? "DEMO" : "CONFIGURED"}
                    </span>
                  </div>
                  {selectedGame ? (
                    <>
                      <div className="health-number">
                        <strong>
                          {selectedGame.winProbability}
                          <span>%</span>
                        </strong>
                        <p>
                          Win probability
                          <br />
                          <b>{selectedGame.name}</b>
                        </p>
                      </div>
                      <div className="probability-track">
                        <span
                          style={{ width: `${selectedGame.winProbability}%` }}
                        />
                      </div>
                      <div className="split-label">
                        <span>Win {selectedGame.winProbability}%</span>
                        <span>Lose {100 - selectedGame.winProbability}%</span>
                      </div>
                      <div className="health-stat">
                        <span>Gross payout multiplier</span>
                        <b>{selectedGame.payoutMultiplier.toFixed(2)}×</b>
                      </div>
                      <div className="health-stat">
                        <span>Theoretical return</span>
                        <b>
                          {(
                            selectedGame.winProbability *
                            selectedGame.payoutMultiplier
                          ).toFixed(1)}
                          %
                        </b>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setTab("Probability controls")}
                      >
                        Manage probability <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <Empty
                      title="No game configured"
                      text="Add your first game to get started."
                    />
                  )}
                </section>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Your games{" "}
                      <span className="count-badge">{data.games.length}</span>
                    </h2>
                    <p>A growing collection, managed from one place.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setTab("Games")}
                  >
                    View all games <ArrowRight size={16} />
                  </button>
                </div>
                <GameRows games={data.games} onEdit={setEditing} />
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent rounds</h2>
                    <p>The latest bets and outcomes in the selected period.</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setTab("Bet & win logs")}
                  >
                    View all logs <ArrowRight size={16} />
                  </button>
                </div>
                <RoundTable
                  rounds={windowRounds.slice(0, 5)}
                  onDetail={setDetail}
                />
              </section>
            </>
          )}
          {tab === "Games" && (
            <>
              <div className="section-summary">
                <span>
                  <b>{data.games.length}</b> games in your catalog
                </span>
                <span>
                  {data.games.filter((g) => g.status === "active").length}{" "}
                  active ·{" "}
                  {data.games.filter((g) => g.status === "paused").length}{" "}
                  paused
                </span>
              </div>
              <div className="game-cards">
                {data.games.map((game) => (
                  <section className="panel game-card" key={game.id}>
                    <div className={"game-card-top " + game.color}>
                      <span className={"game-icon " + game.color}>
                        {game.engine === "roulette" ? (
                          <CircleDot size={32} />
                        ) : (
                          <Coins size={32} />
                        )}
                      </span>
                      <Badge status={game.status} />
                      <span className="game-engine">
                        {game.engine === "roulette"
                          ? "EXISTING GAME"
                          : "FLIP ENGINE"}
                      </span>
                    </div>
                    <div className="game-card-body">
                      <h2>{game.name}</h2>
                      <p>
                        {game.engine === "roulette"
                          ? "The existing 37-pocket wheel, with eight familiar bet markets."
                          : "Pick a side. Place a bet. See the result instantly."}
                      </p>
                      {game.engine === "roulette" ? (
                        <div className="card-stats">
                          <div>
                            <small>Wheel pockets</small>
                            <b>37</b>
                          </div>
                          <div>
                            <small>Gross payouts</small>
                            <b>2–36×</b>
                          </div>
                          <div>
                            <small>Bet range</small>
                            <b>
                              {fmt(game.minBet)}–{fmt(game.maxBet)}
                            </b>
                          </div>
                        </div>
                      ) : (
                        <div className="card-stats">
                          <div>
                            <small>Win chance</small>
                            <b>{game.winProbability}%</b>
                          </div>
                          <div>
                            <small>Gross payout</small>
                            <b>{game.payoutMultiplier}×</b>
                          </div>
                          <div>
                            <small>Bet range</small>
                            <b>
                              {fmt(game.minBet)}–{fmt(game.maxBet)}
                            </b>
                          </div>
                        </div>
                      )}
                      <div className="game-card-actions">
                        <>
                          <button
                            className="button"
                            onClick={() => setEditing(game)}
                          >
                            <SlidersHorizontal size={15} /> Configure
                          </button>
                          <Link
                            className="button primary"
                            href={`/games/preview?game=${game.id}`}
                          >
                            <Play size={15} /> Preview
                          </Link>
                          <button
                            className="icon-button"
                            title="Copy launch URL"
                            aria-label={`Copy ${game.name} launch URL`}
                            onClick={() =>
                              copyLink(game).catch(() =>
                                notify(
                                  "Could not copy. Use the launch URL on the Integration page.",
                                ),
                              )
                            }
                          >
                            <Copy size={16} />
                          </button>
                        </>
                      </div>
                    </div>
                  </section>
                ))}
                <button className="add-game-card" onClick={startAdd}>
                  <span>
                    <Plus size={26} />
                  </span>
                  <b>Add another game</b>
                  <small>
                    Create a new configuration using the Flip engine.
                  </small>
                </button>
              </div>
              <div className="info-strip">
                <Plug size={20} />
                <div>
                  <b>Built to grow with your collection</b>
                  <p>
                    Each game has its own ID, settings and launch URL. New game
                    engines can be registered in the backend; Roulette uses the
                    existing wheel and payout rules.
                  </p>
                </div>
              </div>
            </>
          )}
          {tab === "Bet & win logs" && (
            <>
              <div className="log-totals">
                <span>
                  <b>{filtered.length}</b> matching rounds
                </span>
                <span>
                  <b>{fmt(summary(filtered).bets)}</b> settled bets
                </span>
                <span>
                  <b>{fmt(summary(filtered).payouts)}</b> settled payouts
                </span>
                <span>
                  <b>{filtered.filter((r) => r.status !== "settled").length}</b>{" "}
                  awaiting review / processing
                </span>
              </div>
              <section className="panel">
                <div className="filter-bar">
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="Search round logs"
                      placeholder="Search player, room or round ID…"
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                    />
                  </label>
                  <select
                    aria-label="Filter game"
                    value={gameFilter}
                    onChange={(e) => { setGameFilter(e.target.value); setPage(0); }}
                  >
                    <option value="all">All games</option>
                    {data.games.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter outcome"
                    value={outcomeFilter}
                    onChange={(e) => { setOutcomeFilter(e.target.value); setPage(0); }}
                  >
                    <option value="all">All outcomes</option>
                    <option value="win">Wins</option>
                    <option value="loss">Losses</option>
                    <option value="push">Break-even</option>
                    <option value="review">Not settled</option>
                  </select>
                </div>
                <RoundTable
                  rounds={filtered.slice(page * 10, page * 10 + 10)}
                  onDetail={setDetail}
                />
                <div className="pagination">
                  <span>
                    {filtered.length
                      ? `${page * 10 + 1}–${Math.min(page * 10 + 10, filtered.length)} of ${filtered.length}`
                      : "No matching records"}
                  </span>
                  <div>
                    <button
                      className="button subtle"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <button
                      className="button subtle"
                      disabled={(page + 1) * 10 >= filtered.length}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </section>
              {!isDemo && data.totalRounds > data.rounds.length && (
                <button
                  className="button"
                  disabled={loadingOlder}
                  onClick={async () => {
                    setLoadingOlder(true);
                    try {
                      await loadOlder();
                    } catch (e) {
                      notify(e.message);
                    } finally {
                      setLoadingOlder(false);
                    }
                  }}
                >
                  {loadingOlder
                    ? "Loading…"
                    : `Load older records (${data.rounds.length} of ${data.totalRounds} loaded)`}
                </button>
              )}
              <p className="fine-print">
                Times use your browser’s timezone. CSV exports include all
                loaded records matching the current filters. Gross payout
                includes any returned stake.
              </p>
            </>
          )}
          {tab === "Probability controls" && (
            <>
              <div className="info-strip">
                <ShieldCheck size={21} />
                <div>
                  <b>One set of rules for every player in a game</b>
                  <p>
                    Probability changes apply to new rounds only. Each round
                    keeps its configuration revision, win chance and payout.
                    Players see the rules before betting.
                  </p>
                </div>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Game probabilities</h2>
                    <p>
                      Theoretical return = win probability × gross payout
                      multiplier.
                    </p>
                  </div>
                </div>
                {data.games.map((g) => (
                  <div className="probability-row" key={g.id}>
                    <span className={"game-icon " + g.color}>
                      {g.engine === "roulette" ? (
                        <CircleDot size={24} />
                      ) : (
                        <Coins size={24} />
                      )}
                    </span>
                    <div className="probability-name">
                      <b>{g.name}</b>
                      <small>{`Revision ${g.revision} · ${statusLabel[g.status]}`}</small>
                    </div>
                    {g.engine === "roulette" ? (
                      <>
                        <p className="muted">
                          Weighted 37-pocket wheel · Odds shown by market
                        </p>
                        <button
                          className="button"
                          onClick={() => setEditing(g)}
                        >
                          Edit pocket weights
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="odds-meter">
                          <div>
                            <b>{g.winProbability}%</b>
                            <span>win chance</span>
                          </div>
                          <div className="probability-track">
                            <span style={{ width: `${g.winProbability}%` }} />
                          </div>
                        </div>
                        <div className="game-stat">
                          <small>Gross payout</small>
                          <b>{g.payoutMultiplier}×</b>
                        </div>
                        <div className="game-stat">
                          <small>Theoretical return</small>
                          <b>
                            {(g.winProbability * g.payoutMultiplier).toFixed(1)}
                            %
                          </b>
                        </div>
                        <button
                          className="button"
                          onClick={() => setEditing(g)}
                        >
                          Edit rules
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Settings history</h2>
                    <p>Who changed the rules, what changed, and when.</p>
                  </div>
                </div>
                {data.audit.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Game</th>
                          <th>Change</th>
                          <th>Win chance</th>
                          <th>Gross payout</th>
                          <th>Changed by</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.audit.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <b>{a.gameName}</b>
                              <small>Revision {a.after.revision}</small>
                            </td>
                            <td>{a.action}</td>
                            <td>
                              {a.after.engine === "roulette"
                                ? `Weights: ${a.after.pocketWeights.map((w,n)=>w!==(a.before?.pocketWeights?.[n]??1)?`${n}: ${a.before?.pocketWeights?.[n]??1} → ${w}`:null).filter(Boolean).join(", ") || "unchanged"}`
                                : `${a.before ? `${a.before.winProbability}% → ` : ""}${a.after.winProbability}%`}
                            </td>
                            <td>
                              {a.after.engine === "roulette"
                                ? "Fixed by market"
                                : `${a.before ? `${a.before.payoutMultiplier}× → ` : ""}${a.after.payoutMultiplier}×`}
                            </td>
                            <td>{a.actor}</td>
                            <td>{date(a.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="No settings changes yet"
                    text="Save a game configuration to create its first audit record."
                  />
                )}
              </section>
            </>
          )}
          {tab === "Integration" && (
            <Integration integration={data.integration} notify={notify} />
          )}
          <footer>
            MEGA LIVE · GAME CONTROL{" "}
            <span>
              {isDemo
                ? "Demo environment · Sample records"
                : "PostgreSQL · Prisma · Mega Live wallet"}
            </span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {editing && (
        <GameEditor
          game={editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await saveGame(input);
            setEditing(null);
            notify("Game settings saved. New rules apply to future rounds.");
          }}
        />
      )}
      {detail && (
        <Modal title="Round details" onClose={() => setDetail(null)} wide>
          <div className="modal-body">
            <div className="detail-title">
              <div>
                <h3>{detail.gameName}</h3>
                <p className="mono">{detail.id}</p>
              </div>
              <Badge status={detail.status} />
            </div>
            <div className="detail-grid">
              {[
                ["Player", `${detail.nickname} (${detail.uid})`],
                ["Room", detail.roomId],
                ["Placed", date(detail.createdAt)],
                [
                  "Outcome",
                  detail.status === "settled"
                    ? detail.outcome
                    : "Awaiting settlement",
                ],
                ["Bet", `${fmt(detail.bet)} coins`],
                ["Gross payout", `${fmt(detail.payout)} coins`],
                ["Player net", `${fmt(detail.payout - detail.bet)} coins`],
                [
                  "Win probability",
                  detail.winProbability === null
                    ? "See pocket weights"
                    : `${detail.winProbability}%`,
                ],
                [
                  "Payout multiplier",
                  detail.payoutMultiplier === null
                    ? "By market"
                    : `${detail.payoutMultiplier}×`,
                ],
                ["Settings revision", detail.revision],
              ].map(([k, v]) => (
                <div key={k}>
                  <small>{k}</small>
                  <b>{v}</b>
                </div>
              ))}
            </div>
            {detail.status !== "settled" && (
              <div className="notice warning">
                <AlertCircle size={18} />
                <span>
                  Do not retry this transfer. Review its local wallet ledger before
                  releasing the player’s wallet lock.
                </span>
              </div>
            )}
            {detail.bets && (
              <details open>
                <summary>
                  Roulette bets and winning pocket {detail.result}
                </summary>
                <pre>{JSON.stringify(detail.bets, null, 2)}</pre>
              </details>
            )}
            {detail.pocketWeights && (
              <details>
                <summary>Pocket weights used for this round</summary>
                <pre>{JSON.stringify(detail.pocketWeights)}</pre>
              </details>
            )}
            {detail.debitResponse && (
              <details>
                <summary>Debit API response</summary>
                <pre>{JSON.stringify(detail.debitResponse, null, 2)}</pre>
              </details>
            )}
            {detail.creditResponse && (
              <details>
                <summary>Payout API response</summary>
                <pre>{JSON.stringify(detail.creditResponse, null, 2)}</pre>
              </details>
            )}
            {detail.reviewReason && (
              <p className="error-message">{detail.reviewReason}</p>
            )}
            {detail.demo && (
              <p className="fine-print">
                Demo record. No Mega API call was made.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function Empty({ title, text }) {
  return (
    <div className="empty-state">
      <ReceiptText size={27} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function GameRows({ games, onEdit }) {
  return (
    <div className="game-list">
      {games.map((g) => (
        <div className="game-row" key={g.id}>
          <span className={"game-icon " + g.color}>
            {g.engine === "roulette" ? (
              <CircleDot size={24} />
            ) : (
              <Coins size={24} />
            )}
          </span>
          <div className="game-name">
            <b>{g.name}</b>
            <small>
              {g.category} ·{" "}
              {g.engine === "roulette" ? "37-pocket wheel" : "Flip engine"}
            </small>
          </div>
          <Badge status={g.status} />
          <div className="game-stat">
            <small>Win probability</small>
            <b>
              {g.winProbability === null ? "By market" : `${g.winProbability}%`}
            </b>
          </div>
          <div className="game-stat">
            <small>Gross payout</small>
            <b>
              {g.payoutMultiplier === null
                ? "2–36×"
                : `${g.payoutMultiplier.toFixed(2)}×`}
            </b>
          </div>
          <button className="button subtle" onClick={() => onEdit(g)}>
            Manage <ArrowUpRight size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
function RoundTable({ rounds, onDetail }) {
  if (!rounds.length)
    return (
      <Empty
        title="No rounds to show"
        text="Try a different filter. Accepted player rounds appear here."
      />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Game / Room</th>
            <th>Bet</th>
            <th>Gross payout</th>
            <th>Outcome</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{r.nickname || r.uid}</b>
                <small>{r.uid}</small>
              </td>
              <td>
                {r.gameName}
                <small>{r.roomId}</small>
              </td>
              <td>{fmt(r.bet)}</td>
              <td>{r.status === "settled" ? fmt(r.payout) : "Pending"}</td>
              <td>
                {r.status === "settled" ? (
                  <span className={"outcome " + r.outcome}>
                    {r.outcome === "win" ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownLeft size={14} />
                    )}{" "}
                    {r.outcome === "win"
                      ? "Won"
                      : r.outcome === "push"
                        ? "Break-even"
                        : "Lost"}
                  </span>
                ) : (
                  <span className="muted">Pending</span>
                )}
              </td>
              <td>
                <Badge status={r.status} />
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`View round ${r.id}`}
                  onClick={() => onDetail(r)}
                >
                  <ArrowUpRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ActivityChart({ rounds, period }) {
  const [end] = useState(() => Date.now());
  const
    hours =
      period === "all"
        ? Math.max(
            24,
            (end -
              Math.min(...rounds.map((r) => Date.parse(r.createdAt)), end)) /
              3600000,
          )
        : Number(period),
    width = (hours * 3600000) / 12;
  const bins = Array.from({ length: 12 }, (_, i) => {
    const start = end - (12 - i) * width;
    const rows = rounds.filter(
      (r) =>
        r.status === "settled" &&
        Date.parse(r.createdAt) >= start &&
        Date.parse(r.createdAt) < start + width,
    );
    return {
      start,
      bets: rows.reduce((s, r) => s + r.bet, 0),
      payouts: rows.reduce((s, r) => s + r.payout, 0),
    };
  });
  const max = Math.max(1, ...bins.flatMap((b) => [b.bets, b.payouts]));
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>Betting activity</h2>
          <p>Settled rounds in the selected period</p>
        </div>
        <span className="chart-legend">
          <i /> Bets <i className="payout" /> Payouts
        </span>
      </div>
      <div
        className="bar-chart"
        role="img"
        aria-label={`Bets and payouts across 12 time intervals. Total bets ${fmt(bins.reduce((s, b) => s + b.bets, 0))} coins.`}
      >
        {bins.map((b, i) => (
          <div
            className="bar-group"
            key={i}
            title={`${date(b.start)} · Bets ${fmt(b.bets)} · Payouts ${fmt(b.payouts)}`}
          >
            <div className="bar-pair">
              <span
                style={{
                  height: `${(b.bets / max) * 90}%`,
                  minHeight: b.bets ? 3 : 0,
                }}
              />
              <span
                style={{
                  height: `${(b.payouts / max) * 90}%`,
                  minHeight: b.payouts ? 3 : 0,
                }}
              />
            </div>
            <small>
              {hours <= 24
                ? new Date(b.start).toLocaleTimeString([], {
                    hour: "2-digit",
                    hour12: false,
                  })
                : new Date(b.start).toLocaleDateString([], {
                    month: "numeric",
                    day: "numeric",
                  })}
            </small>
          </div>
        ))}
      </div>
      <p className="chart-footnote">
        Hover over a bar for coin totals · Local time
      </p>
    </section>
  );
}
function GameEditor(props) {
  return props.game.engine === "roulette" ? (
    <RouletteEditor {...props} />
  ) : (
    <FlipEditor {...props} />
  );
}
function FlipEditor({ game, onClose, onSave }) {
  const [form, setForm] = useState({ ...game }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  return (
    <Modal
      title={game.revision ? `Configure ${game.name}` : "Add a game"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(form);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="form-grid">
            <label>
              Game name
              <input
                required
                maxLength={60}
                value={form.name}
                onChange={(e) => {
                  set("name", e.target.value);
                  if (!game.revision)
                    set(
                      "id",
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                    );
                }}
              />
            </label>
            <label>
              Game ID
              <input
                required
                value={form.id}
                disabled={!!game.revision}
                onChange={(e) => set("id", e.target.value)}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Game engine
              <select
                value={form.engine}
                onChange={(e) => set("engine", e.target.value)}
              >
                <option value="flip">Lucky Flip</option>
              </select>
            </label>
            <label>
              Availability
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>
          </div>
          <div className="odds-setting">
            <label htmlFor="win-prob">
              Win probability <b>{form.winProbability}%</b>
            </label>
            <input
              id="win-prob"
              aria-label="Win probability"
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={form.winProbability}
              onChange={(e) => set("winProbability", Number(e.target.value))}
            />
            <div className="split-label">
              <span>0% · Always lose</span>
              <span>100% · Always win</span>
            </div>
            <p>
              Applies equally to all players in future rounds. Existing rounds
              keep their original rules.
            </p>
          </div>
          <div className="form-grid">
            <label>
              Win probability (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={form.winProbability}
                onChange={(e) => set("winProbability", Number(e.target.value))}
              />
            </label>
            <label>
              Gross payout multiplier
              <input
                type="number"
                min="1"
                max="100"
                step="0.01"
                required
                value={form.payoutMultiplier}
                onChange={(e) =>
                  set("payoutMultiplier", Number(e.target.value))
                }
              />
            </label>
            <label>
              Minimum bet (coins)
              <input
                type="number"
                min="1"
                max="1000000"
                step="1"
                required
                value={form.minBet}
                onChange={(e) => set("minBet", Number(e.target.value))}
              />
            </label>
            <label>
              Maximum bet (coins)
              <input
                type="number"
                min="1"
                max="1000000"
                step="1"
                required
                value={form.maxBet}
                onChange={(e) => set("maxBet", Number(e.target.value))}
              />
            </label>
          </div>
          <div className="return-preview">
            <span>Theoretical return to player</span>
            <strong>
              {(form.winProbability * form.payoutMultiplier).toFixed(1)}%
            </strong>
            <small>
              A 100-coin winning bet returns{" "}
              {Math.floor(100 * form.payoutMultiplier)} coins total, including
              stake.
            </small>
          </div>
          {form.winProbability * form.payoutMultiplier > 100 && (
            <p className="error-message">
              This configuration has an expected payout greater than the amount
              wagered.
            </p>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className="button primary">
            {busy ? "Saving…" : "Save game settings"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Integration() {
  const rows = [
    ["PostgreSQL & Prisma", "Game settings, round receipts and revision history are stored in this portal."],
    ["Mega Live coin wallet", "Each accepted wager, payout and wallet entry commits together. Failed rounds make no balance change."],
    ["Mobile account sessions", "Players launch from the Mega Live app. Account bans, device bans and revoked sessions apply to games too."],
    ["Practice preview", "Preview games with practice coins. Previews never change a player's wallet or round history."],
  ];
  return <><section className="panel"><div className="panel-heading"><div><h2>Connected to Mega Live Portal</h2><p>Games use the same users and coin balances as the mobile app.</p></div><ShieldCheck size={21}/></div><div className="integration-list">{rows.map(([title,text])=><div className="integration-row" key={title}><span className="integration-symbol"><Check size={20}/></span><div><b>{title}</b><p>{text}</p></div><span className="status active">Ready</span></div>)}</div></section><section className="panel setup-panel"><h2>Launch and manage games</h2><p>Configure a game here, then activate it to make it available in the Mega Live app. The app reads the game catalog and opens the selected player page with its authenticated mobile session.</p><p>Roulette and Lucky Flip run independent rounds for each player. Room IDs are optional attribution, not proof of room membership.</p><Link className="button primary" href="/games/preview">Open practice preview</Link><Link className="button" href="/home">Return to main portal</Link></section></>;
}
function RouletteEditor({ game, onClose, onSave }) {
  const [form, setForm] = useState({
      ...game,
      pocketWeights: [...(game.pocketWeights || Array(37).fill(1))],
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const total = form.pocketWeights.reduce((s, w) => s + w, 0);
  const odds = markets.map((m) => ({
    ...m,
    chance: total
      ? (form.pocketWeights.reduce(
          (s, w, n) => s + (isBetWinner(m.label, n) ? w : 0),
          0,
        ) /
          total) *
        100
      : 0,
  }));
  return (
    <Modal title={`Configure ${game.name}`} onClose={onClose} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave(form);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="form-grid">
            <label>
              Game name
              <input
                required
                value={form.name}
                maxLength={60}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
            <label>
              Availability
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>
            <label>
              Minimum total bet
              <input
                required
                type="number"
                min="1"
                max="1000000"
                value={form.minBet}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minBet: Number(e.target.value) }))
                }
              />
            </label>
            <label>
              Maximum total bet
              <input
                required
                type="number"
                min="1"
                max="1000000"
                value={form.maxBet}
                onChange={(e) =>
                  setForm((f) => ({ ...f, maxBet: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          <div className="info-strip">
            <CircleDot size={20} />
            <div>
              <b>Probability is controlled by pocket weights</b>
              <p>
                A pocket’s chance is its weight ÷ total weight. Equal weights
                produce a standard European wheel. Weight 0 makes a pocket
                impossible; the player sees the resulting odds.
              </p>
            </div>
          </div>
          <div className="weight-heading">
            <h3>Pocket weights</h3>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setForm((f) => ({ ...f, pocketWeights: Array(37).fill(1) }))
              }
            >
              Reset to equal weights
            </button>
          </div>
          <div className="weight-grid">
            {form.pocketWeights.map((w, n) => (
              <label
                key={n}
                className={"weight " + resultColor(n).toLowerCase()}
              >
                <span>{n}</span>
                <input
                  aria-label={`Pocket ${n} weight`}
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  required
                  value={w}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      pocketWeights: f.pocketWeights.map((v, i) =>
                        i === n ? Number(e.target.value) : v,
                      ),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <h3 className="odds-heading">Resulting market odds</h3>
          <div className="market-odds">
            {odds.map((m) => (
              <div key={m.label}>
                <b>{m.label}</b>
                <span>{m.chance.toFixed(2)}% chance</span>
                <small>
                  {m.multiplier}× gross payout ·{" "}
                  {(m.chance * m.multiplier).toFixed(2)}% theoretical return
                </small>
              </div>
            ))}
          </div>
          <p className="fine-print">
            These chances are per market, not a single player-win rate. Multiple
            bets can win on the same pocket. Round logs classify net-positive
            results as wins, net-negative as losses, and zero net as break-even.
          </p>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={busy || total <= 0}
          >
            {busy ? "Saving…" : "Save Roulette rules"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
