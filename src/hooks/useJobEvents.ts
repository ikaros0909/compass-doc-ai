"use client";

import { useEffect, useRef } from "react";
import type { JobEvent } from "@/types/job";

export function useJobEvents(onEvent: (event: JobEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed?.type === "ready") return;
        handlerRef.current(parsed as JobEvent);
      } catch {
        // ignore non-JSON keepalives
      }
    };
    source.onerror = () => {
      // Browser auto-reconnects by default; no action needed.
    };
    return () => source.close();
  }, []);
}
