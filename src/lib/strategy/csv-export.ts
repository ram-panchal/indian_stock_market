/**
 * Picks/trades -> Excel-openable CSV. A .csv file is natively Excel-openable
 * — no xlsx/exceljs dependency needed for v1. Two details that matter: a
 * UTF-8 BOM (Excel on Windows otherwise mis-renders the ₹ symbol and any
 * Hindi text in reasoning fields as mojibake) and hand-rolled RFC4180
 * escaping (quote-wrap + double-up internal quotes) for this handful of columns.
 */

import type { PaperTrade } from "@/lib/trading/types";
import type { PickLogEntry } from "./types";

const BOM = String.fromCharCode(0xfeff);

type CsvCell = string | number | undefined | null;

function escapeCsvField(value: CsvCell): string {
  const s = value === undefined || value === null ? "" : String(value);
  return /["\r\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.join(","), ...rows.map((row) => row.map(escapeCsvField).join(","))];
  return BOM + lines.join("\n") + "\n";
}

export function picksToCsv(picks: PickLogEntry[]): string {
  const headers = [
    "dateIso",
    "action",
    "symbol",
    "conviction",
    "riskFlags",
    "reasoning",
    "entryPrice",
    "qty",
    "positionValue",
    "stopLossPrice",
    "targetPrice",
    "maxHoldUntilDate",
    "stageAScore",
    "stageBScore",
  ];
  const rows: CsvCell[][] = picks.map((p) => [
    p.dateIso,
    p.action,
    p.symbol ?? "",
    p.conviction ?? "",
    (p.riskFlags ?? []).join("; "),
    p.reasoning,
    p.entry?.price,
    p.entry?.qty,
    p.entry?.positionValue,
    p.entry?.stopLossPrice,
    p.entry?.targetPrice,
    p.entry?.maxHoldUntilDate ?? "",
    p.quantSummary?.stageAScore,
    p.quantSummary?.stageBScore,
  ]);
  return toCsv(headers, rows);
}

export function tradesToCsv(trades: PaperTrade[]): string {
  const headers = ["at", "side", "symbol", "qty", "price", "value"];
  const rows: CsvCell[][] = trades.map((t) => [
    new Date(t.at).toISOString(),
    t.side,
    t.instrument.symbol,
    t.qty,
    t.price,
    t.qty * t.price,
  ]);
  return toCsv(headers, rows);
}
