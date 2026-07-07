"use client";

/** Tiny localStorage-backed external store, consumed via useSyncExternalStore. */
export class LocalStore<T> {
  private state: T;
  private listeners = new Set<() => void>();

  constructor(
    private readonly key: string,
    private readonly fallback: T,
    private readonly validate?: (value: unknown) => value is T,
  ) {
    this.state = this.load();
  }

  private load(): T {
    if (typeof window === "undefined") return this.fallback;
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return this.fallback;
      const parsed = JSON.parse(raw) as unknown;
      if (this.validate && !this.validate(parsed)) return this.fallback;
      return parsed as T;
    } catch {
      return this.fallback;
    }
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  get = (): T => this.state;

  getServer = (): T => this.fallback;

  set(next: T): void {
    this.state = next;
    try {
      localStorage.setItem(this.key, JSON.stringify(next));
    } catch {
      // Best-effort persistence.
    }
    for (const cb of this.listeners) cb();
  }

  update(fn: (current: T) => T): void {
    this.set(fn(this.state));
  }
}
