"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastInput {
  title: string;
  body?: string;
  tone?: ToastTone;
}

interface Toast extends ToastInput {
  id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const TONE_BAR: Record<ToastTone, string> = {
  success: "bg-up",
  error: "bg-down",
  info: "bg-accent",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-4), { id, tone: "info", ...input }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-20 z-100 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 md:bottom-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex overflow-hidden rounded-md border border-border bg-surface-2 shadow-lg"
          >
            <div className={`w-1 shrink-0 ${TONE_BAR[t.tone ?? "info"]}`} />
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.body ? <p className="mt-0.5 text-xs text-ink-2">{t.body}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
