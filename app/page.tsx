"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

type Player = {
  id: string;
  name: string;
  initial: string;
  color: string;
  createdAt: string;
  deletedAt?: string;
};

type BuyIn = { id: string; amount: number; at: string };

type Seat = {
  playerId: string;
  joinedAt: string;
  leftAt: string | null;
  buyIns: BuyIn[];
  cashOut: { amount: number; at: string } | null;
};

type PokerSession = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  smallBlind: number;
  bigBlind: number;
  status: "live" | "complete";
  seats: Seat[];
};

type AppData = {
  version: 1;
  isDemo: boolean;
  players: Player[];
  sessions: PokerSession[];
};

type Tab = "game" | "players" | "history";
type ModalState =
  | { type: "player" }
  | { type: "game" }
  | { type: "buyin"; playerId: string }
  | { type: "cashout"; playerId: string }
  | { type: "seat" }
  | { type: "delete-player"; playerId: string }
  | { type: "edit-session"; sessionId: string }
  | { type: "delete-session"; sessionId: string }
  | null;

const STORAGE_KEY = "house-money-ledger-v1";
const EMPTY_DATA: AppData = { version: 1, isDemo: false, players: [], sessions: [] };
const colors = ["green", "blue", "orange", "purple", "gray"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlayer(value: unknown): value is Player {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.initial === "string"
    && typeof value.color === "string"
    && typeof value.createdAt === "string"
    && (value.deletedAt === undefined || typeof value.deletedAt === "string");
}

function isBuyIn(value: unknown): value is BuyIn {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.amount === "number"
    && Number.isFinite(value.amount)
    && typeof value.at === "string";
}

function isSeat(value: unknown): value is Seat {
  return isRecord(value)
    && typeof value.playerId === "string"
    && typeof value.joinedAt === "string"
    && (value.leftAt === null || typeof value.leftAt === "string")
    && Array.isArray(value.buyIns)
    && value.buyIns.every(isBuyIn)
    && (value.cashOut === null || (isRecord(value.cashOut)
      && typeof value.cashOut.amount === "number"
      && Number.isFinite(value.cashOut.amount)
      && typeof value.cashOut.at === "string"));
}

function isPokerSession(value: unknown): value is PokerSession {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.date === "string"
    && typeof value.startTime === "string"
    && typeof value.endTime === "string"
    && typeof value.smallBlind === "number"
    && Number.isFinite(value.smallBlind)
    && typeof value.bigBlind === "number"
    && Number.isFinite(value.bigBlind)
    && (value.status === "live" || value.status === "complete")
    && Array.isArray(value.seats)
    && value.seats.every(isSeat);
}

function isAppData(value: unknown): value is AppData {
  return isRecord(value)
    && value.version === 1
    && typeof value.isDemo === "boolean"
    && Array.isArray(value.players)
    && value.players.every(isPlayer)
    && Array.isArray(value.sessions)
    && value.sessions.every(isPokerSession);
}

function readBackupData(value: unknown) {
  if (isAppData(value)) return value;
  if (isRecord(value) && isAppData(value.data)) return value.data;
  return null;
}

function makeId(prefix: string) {
  return prefix + "-" + crypto.randomUUID();
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function signedMoney(value: number) {
  if (Math.abs(value) < 0.005) return "$0";
  return (value > 0 ? "+" : "−") + money(Math.abs(value));
}

function totalIn(seat: Seat) {
  return seat.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0);
}

function sessionIn(session: PokerSession) {
  return session.seats.reduce((sum, seat) => sum + totalIn(seat), 0);
}

function sessionOut(session: PokerSession) {
  return session.seats.reduce((sum, seat) => sum + (seat.cashOut?.amount || 0), 0);
}

function minutesPlayed(start: string, end?: string | null) {
  return Math.max(0, Math.round(((end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()) / 60000));
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return hours ? hours + "h " + (minutes % 60) + "m" : minutes + "m";
}

function duration(start: string, end?: string | null) {
  return formatMinutes(minutesPlayed(start, end));
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date + "T12:00:00"));
}

function timeLabel(time: string) {
  if (!time) return "";
  const [hours, minutes] = time.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 1, hours, minutes));
}

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function nowTime() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function dateTimeInput(iso = new Date().toISOString()) {
  const value = new Date(iso);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function inputToIso(value: string) {
  return new Date(value).toISOString();
}

function dateTime(date: string, time: string) {
  return new Date(date + "T" + time + ":00").toISOString();
}

function playerRecords(playerId: string, sessions: PokerSession[]) {
  return sessions.flatMap((session) => {
    const seat = session.seats.find((item) => item.playerId === playerId);
    if (!seat?.cashOut) return [];
    return [{ session, seat, result: seat.cashOut.amount - totalIn(seat) }];
  }).sort((a, b) => b.session.date.localeCompare(a.session.date));
}

function Avatar({ player }: { player: Player }) {
  return <span className={"avatar avatar-" + player.color}>{player.initial}</span>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={"modal" + (wide ? " modal-wide" : "")} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><h2 id="modal-title">{title}</h2><button onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </section>
    </div>
  );
}

function AddPlayerForm({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      if (!name.trim()) return;
      onSave(name.trim());
      onClose();
    }}>
      <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Player name" maxLength={40} required /></label>
      <div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Add player</button></div>
    </form>
  );
}

function DeletePlayerConfirm({ player, hasHistory, onDelete, onClose }: { player: Player; hasHistory: boolean; onDelete: () => void; onClose: () => void }) {
  return (
    <div className="delete-confirm">
      <p>Delete <strong>{player.name}</strong>’s profile?</p>
      <small>{hasHistory ? "Their profile will disappear, but past game entries will remain intact." : "This profile will be permanently removed."}</small>
      <div className="form-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button danger-filled" onClick={onDelete}>Delete profile</button></div>
    </div>
  );
}

type GameDraft = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  smallBlind: number;
  bigBlind: number;
  seats: { playerId: string; amount: number }[];
};

function NewGameForm({ players, onSave, onClose }: { players: Player[]; onSave: (game: GameDraft) => void; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [preset, setPreset] = useState<"ten" | "fifty" | "custom">("ten");
  const [title, setTitle] = useState("Poker Night");
  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState(nowTime());
  const [endTime, setEndTime] = useState("");
  const [smallBlind, setSmallBlind] = useState("0.25");
  const [bigBlind, setBigBlind] = useState("0.25");
  const [selected, setSelected] = useState<string[]>([]);
  const [buyIns, setBuyIns] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  function toggle(playerId: string) {
    setSelected((current) => current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId]);
    setBuyIns((current) => ({ ...current, [playerId]: current[playerId] || (preset === "fifty" ? "50" : "10") }));
  }

  function applyPreset(next: "ten" | "fifty") {
    const buyIn = next === "ten" ? "10" : "50";
    setPreset(next);
    setSmallBlind("0.25");
    setBigBlind(next === "ten" ? "0.25" : "0.50");
    setBuyIns(Object.fromEntries(selected.map((playerId) => [playerId, buyIn])));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const sb = Number(smallBlind);
    const bb = Number(bigBlind);
    const seats = selected.map((playerId) => ({ playerId, amount: Number(buyIns[playerId]) }));
    if (seats.length < 2) return setError("Choose at least two players.");
    if (!(sb > 0) || bb < sb) return setError("Big blind cannot be smaller than small blind.");
    if (seats.some((seat) => !(seat.amount > 0))) return setError("Enter a buy-in for each player.");
    onSave({ title: title.trim() || "Poker Night", date, startTime, endTime, smallBlind: sb, bigBlind: bb, seats });
    onClose();
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="steps" aria-label="Game setup progress">
        <span className="active"><b>1</b> Players</span>
        <i />
        <span className={step === 2 ? "active" : ""}><b>2</b> Details</span>
      </div>
      {step === 1 ? <>
        <div className="step-copy"><h3>Who is playing?</h3><p>Select everyone joining this game.</p></div>
        <div className="player-picker player-select">
          {players.map((player) => {
            const checked = selected.includes(player.id);
            return (
              <div className={"picker-row" + (checked ? " checked" : "")} key={player.id}>
                <button type="button" onClick={() => toggle(player.id)}><span className="checkbox">{checked ? "✓" : ""}</span><Avatar player={player} /><strong>{player.name}</strong></button>
              </div>
            );
          })}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={() => {
          if (selected.length < 2) return setError("Choose at least two players.");
          setError("");
          setStep(2);
        }}>Next</button></div>
      </> : <>
        <div className="step-copy"><h3>Game details</h3><p>Set the stakes and opening buy-ins.</p></div>
        <div className="preset-block">
          <span>Quick setup</span>
          <div className="preset-options" role="group" aria-label="Opening buy-in and stakes">
            <button type="button" className={preset === "ten" ? "active" : ""} onClick={() => applyPreset("ten")}><strong>$10 buy-in</strong><small>25¢ / 25¢ blinds</small></button>
            <button type="button" className={preset === "fifty" ? "active" : ""} onClick={() => applyPreset("fifty")}><strong>$50 buy-in</strong><small>25¢ / 50¢ blinds</small></button>
          </div>
        </div>
        <div className="form-grid">
          <label className="full"><span>Game name</span><input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
          <label><span>Start time</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
          <label><span>End time <small>optional</small></span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
          <label><span>Small blind</span><input type="number" min="0.01" step="0.01" value={smallBlind} onChange={(event) => { setSmallBlind(event.target.value); setPreset("custom"); }} required /></label>
          <label><span>Big blind</span><input type="number" min="0.02" step="0.01" value={bigBlind} onChange={(event) => { setBigBlind(event.target.value); setPreset("custom"); }} required /></label>
        </div>
        <div className="field-title"><strong>Opening buy-ins</strong></div>
        <div className="player-picker">
          {selected.map((playerId) => {
            const player = players.find((item) => item.id === playerId);
            if (!player) return null;
            return <div className="picker-row checked" key={player.id}><span className="selected-person"><Avatar player={player} /><strong>{player.name}</strong></span><label className="inline-money"><span>$</span><input aria-label={"Buy-in for " + player.name} type="number" min="1" value={buyIns[player.id] || ""} onChange={(event) => { setBuyIns((current) => ({ ...current, [player.id]: event.target.value })); setPreset("custom"); }} /></label></div>;
          })}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions split-actions"><button type="button" className="button ghost" onClick={() => setStep(1)}>Back</button><button className="button primary">Start live game</button></div>
      </>}
    </form>
  );
}

function AmountForm({ label, current, action, onSave, onClose }: { label: string; current?: number; action: string; onSave: (amount: number) => void; onClose: () => void }) {
  const [amount, setAmount] = useState(current === undefined ? "" : String(current));
  return (
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      const value = Number(amount);
      if (value < 0) return;
      onSave(value);
      onClose();
    }}>
      <label><span>{label}</span><div className="amount-input"><b>$</b><input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div></label>
      <div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">{action}</button></div>
    </form>
  );
}

function CashOutForm({ current, joinedAt, onSave, onClose }: { current?: { amount: number; at: string }; joinedAt: string; onSave: (amount: number, cashedAt: string) => void; onClose: () => void }) {
  const [amount, setAmount] = useState(current ? String(current.amount) : "");
  const [cashedAt, setCashedAt] = useState(dateTimeInput(current?.at));
  return (
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      const value = Number(amount);
      if (value < 0) return;
      onSave(value, inputToIso(cashedAt));
      onClose();
    }}>
      <label><span>Cash-out amount</span><div className="amount-input"><b>$</b><input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div></label>
      <label><span>Cashed out at</span><input type="datetime-local" min={dateTimeInput(joinedAt)} value={cashedAt} onChange={(event) => setCashedAt(event.target.value)} required /></label>
      <div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">{current ? "Update cash-out" : "Cash out"}</button></div>
    </form>
  );
}

function SeatForm({ players, session, onSave, onClose }: { players: Player[]; session: PokerSession; onSave: (playerId: string, amount: number, joinedAt: string) => void; onClose: () => void }) {
  const available = players.filter((player) => !session.seats.some((seat) => seat.playerId === player.id));
  const [playerId, setPlayerId] = useState(available[0]?.id || "");
  const [amount, setAmount] = useState(String(session.seats[0]?.buyIns[0]?.amount || 10));
  const [joinedAt, setJoinedAt] = useState(dateTimeInput());
  return (
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      if (!playerId || !(Number(amount) > 0)) return;
      onSave(playerId, Number(amount), inputToIso(joinedAt));
      onClose();
    }}>
      {available.length ? <>
        <label><span>Player</span><select value={playerId} onChange={(event) => setPlayerId(event.target.value)}>{available.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>
        <label><span>Buy-in</span><div className="amount-input"><b>$</b><input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label>
        <label><span>Joined at</span><input type="datetime-local" min={dateTimeInput(dateTime(session.date, session.startTime))} value={joinedAt} onChange={(event) => setJoinedAt(event.target.value)} required /></label>
        <div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Add to game</button></div>
      </> : <div className="small-empty"><p>Every player is already in this game.</p><button type="button" className="button ghost" onClick={onClose}>Close</button></div>}
    </form>
  );
}

function EditGameForm({ session, players, onSave, onClose }: { session: PokerSession; players: Player[]; onSave: (session: PokerSession) => void; onClose: () => void }) {
  const [title, setTitle] = useState(session.title);
  const [date, setDate] = useState(session.date);
  const [startTime, setStartTime] = useState(session.startTime);
  const [endTime, setEndTime] = useState(session.endTime);
  const [smallBlind, setSmallBlind] = useState(String(session.smallBlind));
  const [bigBlind, setBigBlind] = useState(String(session.bigBlind));
  const [seats, setSeats] = useState(() => session.seats.map((seat) => ({
    playerId: seat.playerId,
    buyIn: String(totalIn(seat)),
    cashOut: String(seat.cashOut?.amount ?? 0),
    joinedAt: dateTimeInput(seat.joinedAt),
    cashedAt: dateTimeInput(seat.leftAt || seat.cashOut?.at || new Date().toISOString()),
  })));
  const [error, setError] = useState("");

  function updateSeat(playerId: string, field: "buyIn" | "cashOut" | "joinedAt" | "cashedAt", value: string) {
    setSeats((current) => current.map((seat) => seat.playerId === playerId ? { ...seat, [field]: value } : seat));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const sb = Number(smallBlind);
    const bb = Number(bigBlind);
    const totalBuyIns = seats.reduce((sum, seat) => sum + Number(seat.buyIn), 0);
    const totalCashOuts = seats.reduce((sum, seat) => sum + Number(seat.cashOut), 0);
    if (!(sb > 0) || bb < sb) return setError("Big blind cannot be smaller than small blind.");
    if (seats.some((seat) => !(Number(seat.buyIn) > 0) || Number(seat.cashOut) < 0)) return setError("Enter valid buy-in and cash-out amounts.");
    if (seats.some((seat) => !seat.joinedAt || !seat.cashedAt || new Date(seat.cashedAt) < new Date(seat.joinedAt))) return setError("Each cash-out time must be after that player joined.");
    if (Math.abs(totalBuyIns - totalCashOuts) > 0.009) return setError("Buy-ins and cash-outs must balance. They are off by " + money(Math.abs(totalBuyIns - totalCashOuts)) + ".");

    onSave({
      ...session,
      title: title.trim() || "Poker Night",
      date,
      startTime,
      endTime,
      smallBlind: sb,
      bigBlind: bb,
      seats: session.seats.map((seat) => {
        const edited = seats.find((item) => item.playerId === seat.playerId)!;
        const joinedAt = inputToIso(edited.joinedAt);
        const cashedAt = inputToIso(edited.cashedAt);
        return {
          ...seat,
          joinedAt,
          leftAt: cashedAt,
          buyIns: [{ id: seat.buyIns[0]?.id || makeId("b"), amount: Number(edited.buyIn), at: joinedAt }],
          cashOut: { amount: Number(edited.cashOut), at: cashedAt },
        };
      }),
    });
    onClose();
  }

  return (
    <form className="form history-edit-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="full"><span>Game name</span><input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <label><span>Start time</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
        <label><span>End time</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
        <label><span>Small blind</span><input type="number" min="0.01" step="0.01" value={smallBlind} onChange={(event) => setSmallBlind(event.target.value)} required /></label>
        <label><span>Big blind</span><input type="number" min="0.01" step="0.01" value={bigBlind} onChange={(event) => setBigBlind(event.target.value)} required /></label>
      </div>
      <div className="field-title"><strong>Player results</strong><span>Times use this computer’s local time</span></div>
      <div className="history-player-editor">
        {seats.map((seat) => {
          const player = players.find((item) => item.id === seat.playerId);
          return (
            <section className="history-player-card" key={seat.playerId}>
              <strong>{player?.name || "Deleted player"}</strong>
              <div className="history-money-fields">
                <label><span>Total buy-in</span><input type="number" min="0.01" step="0.01" value={seat.buyIn} onChange={(event) => updateSeat(seat.playerId, "buyIn", event.target.value)} required /></label>
                <label><span>Cash-out</span><input type="number" min="0" step="0.01" value={seat.cashOut} onChange={(event) => updateSeat(seat.playerId, "cashOut", event.target.value)} required /></label>
              </div>
              <div className="history-time-fields">
                <label><span>Joined at</span><input type="datetime-local" value={seat.joinedAt} onChange={(event) => updateSeat(seat.playerId, "joinedAt", event.target.value)} required /></label>
                <label><span>Cashed out at</span><input type="datetime-local" min={seat.joinedAt} value={seat.cashedAt} onChange={(event) => updateSeat(seat.playerId, "cashedAt", event.target.value)} required /></label>
              </div>
            </section>
          );
        })}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Save changes</button></div>
    </form>
  );
}

function DeleteGameConfirm({ session, onDelete, onClose }: { session: PokerSession; onDelete: () => void; onClose: () => void }) {
  return (
    <div className="delete-confirm">
      <p>Delete <strong>{session.title}</strong> from {dateLabel(session.date)}?</p>
      <small>This removes the game and all of its results from every player’s history. This cannot be undone.</small>
      <div className="form-actions"><button className="button ghost" onClick={onClose}>Cancel</button><button className="button danger-filled" onClick={onDelete}>Delete game</button></div>
    </div>
  );
}

export default function PokerApp() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("game");
  const [modal, setModal] = useState<ModalState>(null);
  const [message, setMessage] = useState("");
  const live = data.sessions.find((session) => session.status === "live");
  const activePlayers = data.players.filter((player) => !player.deletedAt);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as AppData;
          setData(saved.isDemo ? EMPTY_DATA : saved);
        }
      } catch {
        setMessage("Could not load the saved ledger.");
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  function downloadBackup() {
    const exportedAt = new Date();
    const backup = {
      app: "House Money",
      backupVersion: 1,
      exportedAt: exportedAt.toISOString(),
      data,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = exportedAt.toISOString().slice(0, 19).replace(/[T:]/g, "-");
    link.href = url;
    link.download = `house-money-backup-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage("Backup downloaded.");
  }

  async function restoreBackup(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const restored = readBackupData(parsed);
      if (!restored) throw new Error("Invalid backup");
      const confirmed = window.confirm("Restore this backup? This will replace every player and game currently stored in this browser.");
      if (!confirmed) return;
      setData({ ...restored, isDemo: false });
      setModal(null);
      setTab("game");
      setMessage("Backup restored.");
    } catch {
      setMessage("That file is not a valid House Money backup.");
    }
  }

  function addPlayer(name: string) {
    if (activePlayers.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      setMessage(name + " already exists.");
      return;
    }
    const player: Player = {
      id: makeId("p"),
      name,
      initial: name[0].toUpperCase(),
      color: colors[data.players.length % colors.length],
      createdAt: new Date().toISOString(),
    };
    setData((current) => ({ ...current, players: [...current.players, player] }));
    setMessage(name + " added.");
  }

  function openNewGame() {
    if (live) return setTab("game");
    if (activePlayers.length < 2) {
      setMessage("Add at least two profiles in Players first.");
      setTab("players");
      return;
    }
    setModal({ type: "game" });
  }

  function startGame(draft: GameDraft) {
    const joinedAt = dateTime(draft.date, draft.startTime);
    const session: PokerSession = {
      id: makeId("s"),
      title: draft.title,
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      smallBlind: draft.smallBlind,
      bigBlind: draft.bigBlind,
      status: "live",
      seats: draft.seats.map((seat) => ({
        playerId: seat.playerId,
        joinedAt,
        leftAt: null,
        buyIns: [{ id: makeId("b"), amount: seat.amount, at: joinedAt }],
        cashOut: null,
      })),
    };
    setData((current) => ({ ...current, sessions: [session, ...current.sessions] }));
    setTab("game");
    setMessage("Game started.");
  }

  function addBuyIn(playerId: string, amount: number) {
    if (!live || !(amount > 0)) return;
    setData((current) => ({
      ...current,
      sessions: current.sessions.map((session) => session.id !== live.id ? session : {
        ...session,
        seats: session.seats.map((seat) => seat.playerId !== playerId ? seat : {
          ...seat,
          buyIns: [...seat.buyIns, { id: makeId("b"), amount, at: new Date().toISOString() }],
        }),
      }),
    }));
    setMessage(money(amount) + " buy-in added.");
  }

  function cashOut(playerId: string, amount: number, cashedAt: string) {
    if (!live) return;
    setData((current) => ({
      ...current,
      sessions: current.sessions.map((session) => session.id !== live.id ? session : {
        ...session,
        seats: session.seats.map((seat) => seat.playerId !== playerId ? seat : {
          ...seat,
          leftAt: cashedAt,
          cashOut: { amount, at: cashedAt },
        }),
      }),
    }));
    setMessage("Cash-out saved.");
  }

  function addSeat(playerId: string, amount: number, joinedAt: string) {
    if (!live) return;
    setData((current) => ({
      ...current,
      sessions: current.sessions.map((session) => session.id !== live.id ? session : {
        ...session,
        seats: [...session.seats, {
          playerId,
          joinedAt,
          leftAt: null,
          buyIns: [{ id: makeId("b"), amount, at: joinedAt }],
          cashOut: null,
        }],
      }),
    }));
    setMessage("Player added to the game.");
  }

  function endGame() {
    if (!live) return;
    if (live.seats.some((seat) => !seat.cashOut)) {
      setMessage("Cash out every player first.");
      return;
    }
    const difference = sessionIn(live) - sessionOut(live);
    if (Math.abs(difference) > 0.009) {
      setMessage("Buy-ins and cash-outs are off by " + money(Math.abs(difference)) + ".");
      return;
    }
    setData((current) => ({
      ...current,
      sessions: current.sessions.map((session) => session.id === live.id ? {
        ...session,
        status: "complete",
        endTime: session.endTime || nowTime(),
      } : session),
    }));
    setMessage("Game finished.");
  }

  function deletePlayer(playerId: string) {
    const player = data.players.find((item) => item.id === playerId);
    if (!player) return;
    const playingNow = live?.seats.some((seat) => seat.playerId === playerId && !seat.cashOut);
    if (playingNow) {
      setModal(null);
      setMessage("Cash this player out before deleting their profile.");
      return;
    }
    setData((current) => ({
      ...current,
      players: current.players.map((item) => item.id === playerId ? { ...item, deletedAt: new Date().toISOString() } : item),
    }));
    setModal(null);
    setMessage(player.name + " deleted.");
  }

  function updatePastGame(updated: PokerSession) {
    if (updated.status !== "complete") return;
    setData((current) => ({
      ...current,
      sessions: current.sessions.map((session) => session.id === updated.id ? updated : session),
    }));
    setMessage("Game updated.");
  }

  function deletePastGame(sessionId: string) {
    const session = data.sessions.find((item) => item.id === sessionId && item.status === "complete");
    if (!session) return;
    setData((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== sessionId) }));
    setModal(null);
    setMessage("Game deleted.");
  }

  return (
    <main className="app">
      <header className="app-header">
        <div className="backup-actions" aria-label="Backup controls">
          <button className="header-action" type="button" onClick={downloadBackup} disabled={!ready}>Download</button>
          <label className={`header-action restore-action${ready ? "" : " disabled"}`}>
            Restore
            <input
              className="file-input"
              type="file"
              accept=".json,application/json"
              disabled={!ready}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void restoreBackup(file);
              }}
            />
          </label>
        </div>
        <nav aria-label="Main navigation">
          <button className={tab === "game" ? "active" : ""} onClick={() => setTab("game")}>Live Game</button>
          <button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}>Players</button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History</button>
        </nav>
      </header>

      <section className="page">
        {tab === "game" && <GameView session={live} players={data.players} onStart={openNewGame} onBuyIn={(playerId) => setModal({ type: "buyin", playerId })} onCashOut={(playerId) => setModal({ type: "cashout", playerId })} onAddPlayer={() => setModal({ type: "seat" })} onEnd={endGame} />}
        {tab === "players" && <PlayersView players={activePlayers} sessions={data.sessions} onAdd={() => setModal({ type: "player" })} onDelete={(playerId) => setModal({ type: "delete-player", playerId })} />}
        {tab === "history" && <HistoryView sessions={data.sessions} players={data.players} onEdit={(sessionId) => setModal({ type: "edit-session", sessionId })} onDelete={(sessionId) => setModal({ type: "delete-session", sessionId })} />}
      </section>

      {message && <div className="toast" role="status">{message}</div>}

      {modal?.type === "player" && <Modal title="Add player" onClose={() => setModal(null)}><AddPlayerForm onSave={addPlayer} onClose={() => setModal(null)} /></Modal>}
      {modal?.type === "game" && <Modal title="Start a game" wide onClose={() => setModal(null)}><NewGameForm players={activePlayers} onSave={startGame} onClose={() => setModal(null)} /></Modal>}
      {modal?.type === "buyin" && (() => {
        const player = data.players.find((item) => item.id === modal.playerId);
        return <Modal title={"Buy-in · " + (player?.name || "Player")} onClose={() => setModal(null)}><AmountForm label="Amount" action="Add buy-in" onSave={(amount) => addBuyIn(modal.playerId, amount)} onClose={() => setModal(null)} /></Modal>;
      })()}
      {modal?.type === "cashout" && (() => {
        const seat = live?.seats.find((item) => item.playerId === modal.playerId);
        const player = data.players.find((item) => item.id === modal.playerId);
        return seat ? <Modal title={"Cash out · " + (player?.name || "Player")} onClose={() => setModal(null)}><CashOutForm current={seat.cashOut || undefined} joinedAt={seat.joinedAt} onSave={(amount, cashedAt) => cashOut(modal.playerId, amount, cashedAt)} onClose={() => setModal(null)} /></Modal> : null;
      })()}
      {modal?.type === "seat" && live && <Modal title="Seat a player" onClose={() => setModal(null)}><SeatForm players={activePlayers} session={live} onSave={addSeat} onClose={() => setModal(null)} /></Modal>}
      {modal?.type === "delete-player" && (() => {
        const player = data.players.find((item) => item.id === modal.playerId);
        const hasHistory = data.sessions.some((session) => session.seats.some((seat) => seat.playerId === modal.playerId));
        return player ? <Modal title="Delete player" onClose={() => setModal(null)}><DeletePlayerConfirm player={player} hasHistory={hasHistory} onDelete={() => deletePlayer(player.id)} onClose={() => setModal(null)} /></Modal> : null;
      })()}
      {modal?.type === "edit-session" && (() => {
        const session = data.sessions.find((item) => item.id === modal.sessionId && item.status === "complete");
        return session ? <Modal title="Edit past game" wide onClose={() => setModal(null)}><EditGameForm session={session} players={data.players} onSave={updatePastGame} onClose={() => setModal(null)} /></Modal> : null;
      })()}
      {modal?.type === "delete-session" && (() => {
        const session = data.sessions.find((item) => item.id === modal.sessionId && item.status === "complete");
        return session ? <Modal title="Delete game" onClose={() => setModal(null)}><DeleteGameConfirm session={session} onDelete={() => deletePastGame(session.id)} onClose={() => setModal(null)} /></Modal> : null;
      })()}
    </main>
  );
}

function GameView({ session, players, onStart, onBuyIn, onCashOut, onAddPlayer, onEnd }: { session?: PokerSession; players: Player[]; onStart: () => void; onBuyIn: (playerId: string) => void; onCashOut: (playerId: string) => void; onAddPlayer: () => void; onEnd: () => void }) {
  if (!session) {
    return (
      <section className="empty">
        <span className="empty-suit">♠</span>
        <h1>No game running</h1>
        <p>Start a game, add the buy-ins, and cash everyone out at the end.</p>
        <button className="button primary" onClick={onStart}>Start a game</button>
      </section>
    );
  }

  const total = sessionIn(session);
  const paid = sessionOut(session);
  const active = session.seats.filter((seat) => !seat.cashOut).length;

  return (
    <>
      <div className="page-title dashboard-heading">
        <div><h1>{session.title}</h1><p>{dateLabel(session.date)} · {money(session.smallBlind)} / {money(session.bigBlind)} · Started {timeLabel(session.startTime)}</p></div>
        <div className="live-controls"><button className="button" onClick={onAddPlayer}>+ Seat player</button><button className="button danger" onClick={onEnd}>End game</button></div>
      </div>

      <section className="summary-cards">
        <span className="primary-stat"><small>On the table</small><strong>{money(total - paid)}</strong></span>
        <span><small>Total buy-ins</small><strong>{money(total)}</strong></span>
        <span><small>Cashed out</small><strong>{money(paid)}</strong></span>
        <span><small>Still playing</small><strong>{active}</strong></span>
      </section>

      <div className="dashboard-section-title"><div><h2>Players</h2><p>Add buy-ins or cash players out as the game changes.</p></div><span>{session.seats.length} at the table</span></div>
      <section className="game-card">
        <div className="game-head"><span>Player</span><span>Buy-ins</span><span>Cash-out / result</span><span /></div>
        {session.seats.map((seat) => {
          const player = players.find((item) => item.id === seat.playerId);
          if (!player) return null;
          const bought = totalIn(seat);
          const result = seat.cashOut ? seat.cashOut.amount - bought : null;
          return (
            <div className="game-row" key={seat.playerId}>
              <span className="person"><Avatar player={player} /><span><strong>{player.name}</strong><small>{duration(seat.joinedAt, seat.leftAt)}</small></span></span>
              <span><strong>{money(bought)}</strong><small>{seat.buyIns.length} {seat.buyIns.length === 1 ? "buy-in" : "buy-ins"}</small></span>
              <span>{seat.cashOut ? <><strong>{money(seat.cashOut.amount)}</strong><small className={result && result > 0 ? "win" : result && result < 0 ? "loss" : ""}>{signedMoney(result || 0)}</small></> : <small className="playing">Playing</small>}</span>
              <span className="row-buttons">{!seat.cashOut ? <><button onClick={() => onBuyIn(player.id)}>+ Buy-in</button><button className="solid" onClick={() => onCashOut(player.id)}>Cash out</button></> : <button onClick={() => onCashOut(player.id)}>Edit cash-out</button>}</span>
            </div>
          );
        })}
      </section>
    </>
  );
}

function HistoryView({ sessions, players, onEdit, onDelete }: { sessions: PokerSession[]; players: Player[]; onEdit: (sessionId: string) => void; onDelete: (sessionId: string) => void }) {
  const completed = sessions
    .filter((session) => session.status === "complete")
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

  return (
    <>
      <div className="section-title"><div><h1>History</h1><p>Edit or remove previously completed games.</p></div><span className="history-count">{completed.length} {completed.length === 1 ? "game" : "games"}</span></div>
      {completed.length ? <section className="history-list">
        {completed.map((session) => (
          <article className="history-card" key={session.id}>
            <header>
              <div><span>{dateLabel(session.date)}</span><h2>{session.title}</h2><p>{timeLabel(session.startTime)}{session.endTime ? "–" + timeLabel(session.endTime) : ""} · {money(session.smallBlind)} / {money(session.bigBlind)} blinds</p></div>
              <div className="history-actions"><button className="button small" onClick={() => onEdit(session.id)}>Edit</button><button className="button small danger" onClick={() => onDelete(session.id)}>Delete</button></div>
            </header>
            <div className="history-summary">
              <span><small>Players</small><strong>{session.seats.length}</strong></span>
              <span><small>Money in</small><strong>{money(sessionIn(session))}</strong></span>
              <span><small>Money out</small><strong>{money(sessionOut(session))}</strong></span>
            </div>
            <div className="history-results">
              {session.seats.map((seat) => {
                const player = players.find((item) => item.id === seat.playerId);
                const result = (seat.cashOut?.amount || 0) - totalIn(seat);
                return (
                  <div className="history-result-row" key={seat.playerId}>
                    <span className="person">{player ? <Avatar player={player} /> : <span className="avatar avatar-gray">?</span>}<span><strong>{player?.name || "Deleted player"}</strong><small>{duration(seat.joinedAt, seat.leftAt)} · {money(totalIn(seat))} in / {money(seat.cashOut?.amount || 0)} out</small></span></span>
                    <strong className={result > 0 ? "win" : result < 0 ? "loss" : ""}>{signedMoney(result)}</strong>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section> : <section className="page-empty history-empty"><h2>No past games yet</h2><p>Completed games will appear here.</p></section>}
    </>
  );
}

function PlayersView({ players, sessions, onAdd, onDelete }: { players: Player[]; sessions: PokerSession[]; onAdd: () => void; onDelete: (playerId: string) => void }) {
  const [sortKey, setSortKey] = useState<"name" | "games" | "hours" | "hourly" | "net">("name");
  const rows = players.map((player) => {
    const records = playerRecords(player.id, sessions);
    const allTime = records.reduce((sum, record) => sum + record.result, 0);
    const allMinutes = records.reduce((sum, record) => sum + minutesPlayed(record.seat.joinedAt, record.seat.leftAt || record.seat.cashOut?.at), 0);
    const hourly = allMinutes > 0 ? allTime / (allMinutes / 60) : 0;
    return { player, records, allTime, allMinutes, hourly };
  }).sort((a, b) => {
    if (sortKey === "name") return a.player.name.localeCompare(b.player.name);
    const aScore = sortKey === "games" ? a.records.length : sortKey === "hours" ? a.allMinutes : sortKey === "hourly" ? a.hourly : a.allTime;
    const bScore = sortKey === "games" ? b.records.length : sortKey === "hours" ? b.allMinutes : sortKey === "hourly" ? b.hourly : b.allTime;
    return bScore - aScore || a.player.name.localeCompare(b.player.name);
  });

  const sortHeader = (key: typeof sortKey, label: string) => (
    <button type="button" className={sortKey === key ? "active" : ""} aria-pressed={sortKey === key} onClick={() => setSortKey(key)}>
      <span>{label}</span><i aria-hidden="true">{sortKey === key ? "↓" : "→"}</i>
    </button>
  );

  return (
    <>
      <div className="section-title"><div><h1>Players</h1><p>Tap a player to see their results.</p></div><button className="button primary" onClick={onAdd}>+ Add player</button></div>
      {players.length ? <section className="simple-list player-list">
        <div className="player-list-head">{sortHeader("name", "Player")}{sortHeader("games", "Games")}{sortHeader("hours", "Hours")}{sortHeader("hourly", "Earnings / hr")}{sortHeader("net", "Net")}<span /></div>
        {rows.map(({ player, records, allTime, allMinutes, hourly }, index) => {
          const hasHours = allMinutes > 0;
          const isRanked = sortKey !== "name";
          return (
            <details className="player-item" key={player.id}>
              <summary>
                <span className="person">{isRanked && <i className="leader-rank">#{index + 1}</i>}<Avatar player={player} /><strong>{player.name}</strong></span>
                <span className="item-meta">{records.length} {records.length === 1 ? "game" : "games"}</span>
                <span className="hours-cell">{hasHours ? formatMinutes(allMinutes) : "—"}</span>
                <span className={"hourly-cell " + (hourly > 0 ? "win" : hourly < 0 ? "loss" : "")}>{hasHours ? signedMoney(hourly) + "/hr" : "—"}</span>
                <strong className={allTime > 0 ? "win" : allTime < 0 ? "loss" : ""}>{signedMoney(allTime)}</strong>
                <span className="expand">⌄</span>
              </summary>
              <div className="detail-body">
                {records.length ? records.map(({ session, seat, result }) => <div className="result-row" key={session.id}><span><strong>{session.title}</strong><small>{dateLabel(session.date)} · {duration(seat.joinedAt, seat.leftAt)}</small></span><strong className={result > 0 ? "win" : result < 0 ? "loss" : ""}>{signedMoney(result)}</strong></div>) : <p>No cash-outs recorded yet.</p>}
                <div className="profile-actions"><button onClick={() => onDelete(player.id)}>Delete profile</button></div>
              </div>
            </details>
          );
        })}
      </section> : <SmallEmpty title="No players yet" body="Add your friends before starting a game." action="Add player" onAction={onAdd} />}
    </>
  );
}

function SmallEmpty({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return <section className="small-empty page-empty"><h2>{title}</h2><p>{body}</p><button className="button primary" onClick={onAction}>{action}</button></section>;
}
