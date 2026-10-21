// Browser preferences saved before the MunaSIP rename (dsip_* keys) move to the
// new keys once, so nobody loses their language, theme or audio devices.
// Imported first in main.tsx: other modules read these keys at load time.
const RENAMED: Array<[string, string]> = [
  ["dsip_locale", "munasip_locale"],
  ["dsip_theme", "munasip_theme"],
  ["dsip_ab", "munasip_ab"],
  ["dsip.audioDevices", "munasip.audioDevices"],
  ["dsip.recentsSeenAt", "munasip.recentsSeenAt"],
];

try {
  for (const [from, to] of RENAMED) {
    const old = localStorage.getItem(from);
    if (old === null) continue;
    if (localStorage.getItem(to) === null) localStorage.setItem(to, old);
    localStorage.removeItem(from);
  }
} catch {
  /* storage blocked (private mode) — nothing to move */
}
