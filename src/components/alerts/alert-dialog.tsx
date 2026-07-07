"use client";

import { useState } from "react";
import type { Instrument } from "@/lib/market/types";
import { useQuote } from "@/lib/hooks/use-quote";
import { addAlert, type AlertCondition } from "@/lib/stores/alerts-store";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { LtpCell } from "@/components/market/price-cells";

export function AlertDialog({
  instrument,
  onClose,
}: {
  instrument: Instrument | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!instrument} onClose={onClose} title="Create price alert">
      {instrument ? <AlertForm instrument={instrument} onClose={onClose} /> : null}
    </Modal>
  );
}

function AlertForm({
  instrument,
  onClose,
}: {
  instrument: Instrument;
  onClose: () => void;
}) {
  const quote = useQuote(instrument.token);
  const toast = useToast();
  const [condition, setCondition] = useState<AlertCondition>("above");
  const [priceInput, setPriceInput] = useState("");

  const price = Number.parseFloat(priceInput);
  const valid = Number.isFinite(price) && price > 0;

  const create = () => {
    if (!valid) return;
    addAlert(instrument, condition, price);
    // Ask for browser notifications the first time an alert is set up.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    toast({
      tone: "success",
      title: `Alert set: ${instrument.symbol} ${condition} ₹${price}`,
    });
    onClose();
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">{instrument.symbol}</span>
        <LtpCell token={instrument.token} className="text-ink-2" />
      </div>
      <div className="flex items-center gap-3">
        <Segmented
          options={[
            { value: "above", label: "Crosses above" },
            { value: "below", label: "Crosses below" },
          ]}
          value={condition}
          onChange={setCondition}
        />
        <input
          type="number"
          min={0}
          step={instrument.tickSize}
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          placeholder={quote ? String(quote.ltp) : "Price"}
          className="tnum w-32 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
          autoFocus
        />
      </div>
      <button
        onClick={create}
        disabled={!valid}
        className="w-full rounded-md bg-accent py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Create alert
      </button>
    </div>
  );
}
