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
          {events.length === 0 ? <li className="text-sm text-[#5c564c]">Waiting for websocket events...</li> : null}
          {events.map((event, index) => (
            <li key={`${event.type}-${event.at}-${index}`} className="rounded border border-black/[0.08] bg-[#fffaf0] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#5c564c]">{event.type}</p>
                <p className="text-xs text-[#5c564c]">{new Date(event.at).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
