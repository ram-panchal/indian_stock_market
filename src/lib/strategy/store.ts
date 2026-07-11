/**
 * File I/O for the strategy feature — SERVER ONLY. Everything lives under
 * data/strategy/ at the repo root (gitignored — runtime output, not source).
 *
 * Durability: append-only *.jsonl for logs (a crash risks only the last
 * unflushed line, never history — readJsonl tolerates a corrupt trailing
 * line); atomic write-temp-then-rename for mutable snapshots (a crash never
 * leaves a half-written file in place).
 *
 * Resolved from process.cwd(), which is reliably the repo root both for
 * `npm run daily-scan`/`npm run commit-decision` (npm always runs scripts
 * with cwd = the directory containing package.json) and for the Next.js
 * server process. Always invoke the scripts via those npm scripts.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { PaperOrder, PaperState, PaperTrade } from "@/lib/trading/types";
import { DEFAULT_STARTING_BALANCE } from "@/lib/trading/types";
import type {
  PickLogEntry,
  RunLogEntry,
  ShortlistSnapshot,
  StrategyLedgerHeader,
  StrategyPosition,
} from "./types";

const DATA_ROOT = path.resolve(process.cwd(), "data", "strategy");

export function dataRoot(): string {
  return DATA_ROOT;
}

export function newId(): string {
  return crypto.randomUUID();
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

// ---------------------------------------------------------------- generic IO

export function readJsonFile<T>(relPath: string, fallback: T): T {
  const full = path.join(DATA_ROOT, relPath);
  try {
    return JSON.parse(fs.readFileSync(full, "utf8")) as T;
  } catch (err) {
    if (isEnoent(err)) return fallback;
    throw err;
  }
}

export function writeJsonFileAtomic<T>(relPath: string, value: T): void {
  const full = path.join(DATA_ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, full);
}

export function appendJsonl<T>(relPath: string, value: T): void {
  const full = path.join(DATA_ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.appendFileSync(full, `${JSON.stringify(value)}\n`, "utf8");
}

/** Tolerant of a corrupt/truncated trailing line (e.g. a crash mid-append) —
 *  skips it rather than losing every line read so far. */
export function readJsonl<T>(relPath: string): T[] {
  const full = path.join(DATA_ROOT, relPath);
  let raw: string;
  try {
    raw = fs.readFileSync(full, "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
  const out: T[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // Corrupt trailing line — ignore, keep everything parsed so far.
    }
  }
  return out;
}

// -------------------------------------------------------------- strategy ledger

export function ensureLedgerHeader(): StrategyLedgerHeader {
  const existing = readJsonFile<StrategyLedgerHeader | null>("paper-state.json", null);
  if (existing) return existing;
  const header: StrategyLedgerHeader = {
    version: 1,
    startingBalance: DEFAULT_STARTING_BALANCE,
    createdAt: Date.now(),
  };
  writeJsonFileAtomic("paper-state.json", header);
  return header;
}

export function loadOrders(): PaperOrder[] {
  return readJsonl<PaperOrder>("orders.jsonl");
}

export function loadTrades(): PaperTrade[] {
  return readJsonl<PaperTrade>("trades.jsonl");
}

export function appendOrder(order: PaperOrder): void {
  appendJsonl("orders.jsonl", order);
}

export function appendTrade(trade: PaperTrade): void {
  appendJsonl("trades.jsonl", trade);
}

/** Reconstructs the full PaperState shape purely to feed the existing,
 *  unmodified src/lib/trading/derive.ts pure functions. */
export function loadPaperState(): PaperState {
  const header = ensureLedgerHeader();
  return {
    version: 1,
    startingBalance: header.startingBalance,
    createdAt: header.createdAt,
    orders: loadOrders(),
    trades: loadTrades(),
  };
}

// ----------------------------------------------------------------- positions

export function loadPositions(): StrategyPosition[] {
  return readJsonFile<StrategyPosition[]>("positions.json", []);
}

export function writePositions(positions: StrategyPosition[]): void {
  writeJsonFileAtomic("positions.json", positions);
}

// ----------------------------------------------------------------- shortlist

export function loadShortlist(dateIso: string): ShortlistSnapshot | null {
  return readJsonFile<ShortlistSnapshot | null>(`shortlist/${dateIso}.json`, null);
}

export function writeShortlist(snapshot: ShortlistSnapshot): void {
  writeJsonFileAtomic(`shortlist/${snapshot.dateIso}.json`, snapshot);
}

/** The newest shortlist present on disk, by filename date — null on a fresh
 *  install where no scan has run yet (a normal state, not an error). */
export function loadLatestShortlist(): ShortlistSnapshot | null {
  const dir = path.join(DATA_ROOT, "shortlist");
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
  const dates = files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length));
  if (dates.length === 0) return null;
  dates.sort();
  return loadShortlist(dates[dates.length - 1]);
}

// --------------------------------------------------------------------- picks

export function loadAllPicks(): PickLogEntry[] {
  return readJsonl<PickLogEntry>("picks.jsonl");
}

export function appendPick(entry: PickLogEntry): void {
  appendJsonl("picks.jsonl", entry);
}

export function pickedToday(dateIso: string): boolean {
  return loadAllPicks().some((p) => p.dateIso === dateIso && p.action === "entered");
}

// ---------------------------------------------------------------------- runs

export function appendRun(entry: RunLogEntry): void {
  appendJsonl("runs.jsonl", entry);
}
