---
name: daily-pick
description: Run the full-NSE-market swing-trade scanner, research live news on the top mechanically-screened candidates, and file one paper-trade pick for the day with an honest conviction/risk label. Invoke ONLY when the user explicitly runs /daily-pick or clearly asks for today's pick — this files a real (paper) trade against a persistent ledger, so never trigger it ambiently from casual conversation about stocks or markets.
---

# Daily swing-trade pick

This skill finds one candidate NSE stock per day for a 3–10 trading-day swing, using a two-stage mechanical screen (Stage A: liquidity/momentum over the whole market; Stage B: candle-level technical scoring) plus your own live news judgment. It then auto-files the decision as a paper trade so its track record can be audited over time.

**This is paper trading only.** Nothing here places, or could place, a real broker order — the platform has no order-placement code anywhere. Every report to the user must end with a plain reminder of this: it's a tracked, honest experiment, not a guaranteed-return system.

## Hard rules

- **Never invent a pick.** You may only select, downgrade, or veto among candidates that already appear, eligible, in the mechanical shortlist. `scripts/commit-decision.ts` enforces this structurally — it refuses any symbol not found in that date's shortlist — but don't try to work around a refusal by picking something else ad hoc; see step 7.
- **Asymmetric conviction:** a good news story can lower a conviction level or add a risk flag. It can never raise conviction above what the quant score already supports. A great story on a mediocre chart is usually a value-trap, not today's pick.
- **No fake precision.** Conviction is Low/Medium/High, nothing more granular. Don't invent probability numbers.

## Steps

### 1. Run the mechanical scan
```
npm run daily-scan
```
Timeout ~5 minutes (it scans the whole NSE market, throttled to respect Angel One's rate limits). **If this exits non-zero, stop immediately.** Report the failure plainly to the user in plain language and do NOT proceed to news research or name a stock from general knowledge instead — a failed scan means there is no trustworthy shortlist to work from.

### 2. Read the shortlist directly
Read `data/strategy/shortlist/<dateIso>.json` (dateIso = today in IST, `YYYY-MM-DD`; if unsure, `ls data/strategy/shortlist/` and use the newest file, or check the last `kind:"scan"` entry in `data/strategy/runs.jsonl`). Don't rely on the scan's stdout — the JSON file is the authoritative record.

Field reference:
- `ranked`: every Stage-A survivor, best-first, including already-held names (flagged) and Stage-B-excluded names (no `stageBScore`, but a reason in `flags`, e.g. `possible_corporate_action`/`insufficient_history`).
- `topPick` / `runnerUps`: the top eligible (not already-held, actually Stage-B-scored) candidates — this is your research shortlist.
- `stageAScore` (0–1 composite of momentum/traded-value/day-high proximity) and `stageBScore` (a small discrete point total — see `reasons` for exactly which technical signals fired) — both are *starting* heuristics, not backtested truths.
- `likelyNoTradingToday`: fewer than 20 symbols cleared the liquidity floor — usually means a weekend/holiday/dead session. If true, say so plainly up front before presenting anything.

### 3. Research news on the top candidates
Take `topPick` + up to 4 of `runnerUps` (5 candidates total, skipping any already-held). For each, run a targeted web search for the last ~7–10 days of company-specific news: results/earnings, legal or regulatory action, management commentary, sector catalysts, order wins/M&A, and — generalizing the user's own example (a Virat Kohli/MRF-bat story, or the Adani-case-resolution rally) — any brand/consumer/celebrity-adjacent story *if it plausibly moves this specific stock's price*. The bar is "does this plausibly move the stock," not "is this a famous name."

Also run 1–2 broad searches ("Nifty Sensex market today", major India market news for today's date) to catch a macro/sector-wide catalyst a per-stock search would miss — a broadly weak market day should temper conviction across the board.

### 4. Apply the disqualifying red-flag checklist
Drop a candidate regardless of its quant score if you find: a pending regulatory investigation or raid, an auditor resignation or qualified audit opinion, promoter pledge/stake-sale/insider-selling news, or fraud/accounting-irregularity allegations.

### 5. Decide conviction and risk flags
Start from the quant band: `stageBScore >= 6` tends High, `3–5` tends Medium. News can only move this *down* or add a flag (`earnings_due_in_window`, `no_specific_catalyst`, `broad_market_weak`, plus any mechanical flags already on the candidate like `high_volatility`/`thin_history` — carry those forward). If the top candidate's `stageBScore < 3`, lean toward "no strong pick today, here's what came closest" rather than manufacturing confidence around a weak setup.

### 6. Write the decision
Write a JSON file to `data/strategy/tmp/pending-decision-<dateIso>.json` (use the Write tool) matching:
```ts
{
  dateIso: string;             // must match the shortlist's dateIso
  action: "enter" | "no_pick";
  symbol?: string;              // required if action === "enter" — must be one of the eligible candidates you actually researched
  conviction?: "Low" | "Medium" | "High";
  riskFlags?: string[];
  reasoning: string;             // your writeup — Hindi/English mixed is fine, matches how this user talks
  newsRefs?: { title: string; url: string }[];
}
```

### 7. Commit it
```
npm run commit-decision
```
(No arguments needed for normal use — it reads today's file by the convention above.)

- **If it succeeds:** delete the tmp file (`rm data/strategy/tmp/pending-decision-<dateIso>.json`) and move to step 8.
- **If it refuses** (non-zero exit — symbol not eligible, already entered today, or unaffordable at current position sizing): report the refusal plainly. Do not retry the same symbol. If you researched another specific candidate that's still viable, write a *new*, specific `PendingDecision` for that one (with its own reasoning — never silently reuse the old reasoning for a different stock) and try again once. If nothing else fits, write and commit a `"no_pick"` decision instead, and tell the user plainly that today's top candidate couldn't be committed and why.

### 8. Report to the user
State clearly: today's pick (or "no pick" and why), the reasoning in plain language, conviction + risk flags, and — if entered — entry price, quantity, position value, target, stop-loss, and the time-stop date. Close with an explicit line every time: **this is paper trading, being tracked for accuracy — not a guarantee of any return.**
