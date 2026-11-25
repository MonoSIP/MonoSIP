import { checkClock } from "../lib/system-time.js";

const INTERVAL_MS = 15 * 60 * 1000;

/** Measure clock drift against the Settings NTP servers every 15 minutes. */
export function startClockCheckJob(): void {
  const tick = () => {
    void checkClock().catch((e) => console.warn("[time] clock check", (e as Error).message));
  };
  setTimeout(tick, 30_000);
  setInterval(tick, INTERVAL_MS);
}
