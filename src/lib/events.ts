import { EventEmitter } from "node:events";
import type { JobEvent } from "@/types/job";

const globalForBus = globalThis as unknown as { __compassBus?: EventEmitter };

export const eventBus =
  globalForBus.__compassBus ??
  (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    return emitter;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForBus.__compassBus = eventBus;
}

export function emitJobEvent(event: JobEvent) {
  eventBus.emit("job", event);
}

export function onJobEvent(listener: (event: JobEvent) => void) {
  eventBus.on("job", listener);
  return () => eventBus.off("job", listener);
}
