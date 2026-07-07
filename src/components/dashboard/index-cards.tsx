"use client";

import Link from "next/link";
import { memo, useEffect, useState } from "react";
import type { Instrument } from "@/lib/market/types";
import { usePolled } from "@/lib/hooks/use-polled";
import { getProviderHandle } from "@/lib/market/provider-factory";
import { useQuote } from "@/lib/hooks/use-quote";
import { formatPrice } from "@/lib/market/format";
import { Spark } from "@/components/ui/spark";
import { SymbolChip } from "@/components/ui/symbol-chip";

export function IndexCards() {
  const { data, isLoading } = usePolled((p) => p.getIndices(), 60_000, []);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-surface" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
      {data.map((entry) => (
        <IndexCard key={entry.instrument.token} instrument={entry.instrument} />
      ))}
    </div>
  );
}

const IndexCard = memo(function IndexCard({
  instrument,
}: {
  instrument: Instrument;
}) {
  const quote = useQuote(instrument.token);
  const [spark, setSpark] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    const handle = getProviderHandle();
    handle.ready
      .then(() => handle.provider.getCandles(instrument.token, "5m", 75))
      .then((candles) => {
        if (!cancelled) setSpark(candles.map((c) => c.close));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [instrument.token]);

  const up = (quote?.change ?? 0) >= 0;

  return (
    <Link
      href={`/charts?token=${encodeURIComponent(instrument.token)}`}
      className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong"
    >
      <div className="flex items-center gap-2">
        <SymbolChip label={instrument.symbol} size="md" round />
        <p className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-ink-2 uppercase">
          {instrument.name}
        </p>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="tnum text-xl font-semibold text-ink">
            {quote ? formatPrice(quote.ltp) : "—"}
          </p>
          <p className={`tnum mt-0.5 text-xs ${up ? "text-up" : "text-down"}`}>
            {quote
              ? `${up ? "+" : ""}${formatPrice(quote.change)} (${up ? "+" : ""}${quote.changePercent.toFixed(2)}%)`
              : "—"}
          </p>
        </div>
        <Spark values={spark} positive={up} width={92} height={38} fill />
      </div>
    </Link>
  );
});
