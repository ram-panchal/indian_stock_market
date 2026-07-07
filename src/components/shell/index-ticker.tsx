"use client";

/** Compact live index strip under the top nav. */

import Link from "next/link";
import { memo } from "react";
import { usePolled } from "@/lib/hooks/use-polled";
import type { Instrument } from "@/lib/market/types";
import { ChangeCell, LtpCell } from "@/components/market/price-cells";

export function IndexTicker() {
  const { data } = usePolled((p) => p.getIndices(), 60_000, []);
  if (!data) return <div className="h-8 border-b border-border bg-surface" />;
  return (
    <div className="flex h-8 items-center gap-5 overflow-x-auto border-b border-border bg-surface px-4 whitespace-nowrap scroll-thin">
      {data.map((entry) => (
        <TickerItem key={entry.instrument.token} instrument={entry.instrument} />
      ))}
    </div>
  );
}

const TickerItem = memo(function TickerItem({
  instrument,
}: {
  instrument: Instrument;
}) {
  return (
    <Link
      href={`/charts?token=${encodeURIComponent(instrument.token)}`}
      className="flex items-baseline gap-1.5 text-[11px]"
    >
      <span className="font-medium text-ink-2">{instrument.symbol}</span>
      <LtpCell token={instrument.token} className="text-ink" />
      <ChangeCell token={instrument.token} />
    </Link>
  );
});
