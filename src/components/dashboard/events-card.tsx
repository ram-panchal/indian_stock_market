"use client";

import { useMemo } from "react";
import { getUpcomingEvents } from "@/lib/market/dashboard-extras";
import { formatExpiry } from "@/lib/market/format";
import { Panel, PanelHeader } from "./panel";

export function EventsCard() {
  const events = useMemo(() => getUpcomingEvents(), []);

  return (
    <Panel>
      <PanelHeader icon="📅" title="Upcoming Events" />
      <ul className="space-y-1 p-2">
        {events.map((event) => (
          <li
            key={`${event.title}-${event.date}`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-2"
          >
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-sm"
            >
              {event.flag}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-2">{event.title}</span>
            <span className="tnum shrink-0 text-[10px] text-ink-3">
              {formatExpiry(event.date)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
