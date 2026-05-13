"use client";

import { useEffect, useState } from "react";
import type { WsEnvelope } from "@orca/shared";
import { connectOrcaEvents } from "@/lib/ws";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LiveEvents() {
  const [events, setEvents] = useState<WsEnvelope[]>([]);

  useEffect(() => {
    const ws = connectOrcaEvents((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 8));
    });

    return () => {
      ws.close();
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Event Stream</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {events.length === 0 ? <li className="text-sm text-[rgb(var(--primary-11))]">Waiting for websocket events...</li> : null}
          {events.map((event, index) => (
            <li key={`${event.type}-${event.at}-${index}`} className="rounded-xl border border-[rgb(var(--neutral-5))] bg-[rgb(var(--neutral-2))] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--primary-11))]">{event.type}</p>
                <p className="text-xs text-[rgb(var(--neutral-10))]">{new Date(event.at).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
