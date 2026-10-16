import { checkAndRenewIfNeeded } from "../lib/ssl-certs.js";

const INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h

export function startSslRenewJob(): void {
  const tick = () => {
    void checkAndRenewIfNeeded().catch((e) =>
      console.warn("[ssl] renew check", (e as Error).message),
    );
  };
  // Delay first check so nginx/API are up for HTTP-01
  setTimeout(tick, 60_000);
  setInterval(tick, INTERVAL_MS);
}
