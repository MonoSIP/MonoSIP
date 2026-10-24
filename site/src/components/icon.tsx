import type { CSSProperties } from "react";

const paths: Record<string, React.ReactNode> = {
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  external: (
    <>
      <path d="M8 5H5v14h14v-3M12 4h8v8M20 4 10 14" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12 4 4L19 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
    </>
  ),
  moon: <path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z" />,
  monitor: (
    <>
      <rect x="3" y="3" width="18" height="13" rx="2" />
      <path d="M8 21h8m-4-5v5" />
    </>
  ),
  mouse: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="6" />
      <path d="M12 6v4" />
    </>
  ),
  phone: <path d="m6 3 4 5-3 3a15 15 0 0 0 6 6l3-3 5 4-2 3C10 23 1 14 3 5Z" />,
  headset: (
    <>
      <path d="M4 14v-3a8 8 0 0 1 16 0v6a4 4 0 0 1-4 4h-3" />
      <rect x="2" y="11" width="5" height="7" rx="2" />
      <rect x="17" y="11" width="5" height="7" rx="2" />
    </>
  ),
  flow: (
    <>
      <rect x="8" y="2" width="8" height="6" rx="1" />
      <rect x="2" y="16" width="7" height="6" rx="1" />
      <rect x="15" y="16" width="7" height="6" rx="1" />
      <path d="M12 8v4H5v4m7-4h7v4" />
    </>
  ),
  network: (
    <>
      <rect x="8" y="8" width="8" height="8" rx="1" />
      <path d="M12 2v6m0 8v6M2 12h6m8 0h6M4 4l4 4m8 8 4 4M4 20l4-4m8-8 4-4" />
    </>
  ),
  shield: (
    <>
      <path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  terminal: (
    <>
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="m6 8 4 4-4 4m7 0h5" />
    </>
  ),
  code: (
    <>
      <path d="m7 6-5 6 5 6m10-12 5 6-5 6M14 3l-4 18" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  download: (
    <>
      <path d="M12 2v13m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18M7 16v-4m5 4V7m5 9V4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-3a7 7 0 0 1 14 0v3m2-18a4 4 0 0 1 0 8m1 4c3 0 3 3 3 6" />
    </>
  ),
  sound: (
    <>
      <path d="M3 10v4m4-7v10m5-14v18m5-14v10m4-7v4" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="3" width="18" height="7" rx="2" />
      <rect x="3" y="14" width="18" height="7" rx="2" />
      <path d="M7 6h.01M7 17h.01M11 6h6m-6 11h6" />
    </>
  ),
  github: (
    <path d="M9 19c-4 1-4-2-6-2m12 5v-4c0-1-.1-2-.8-2.7 3-.3 5.8-1.5 5.8-6.3a5 5 0 0 0-1.3-3.5 4.8 4.8 0 0 0-.1-3.5S17.5 1.7 15 3a12 12 0 0 0-6 0C6.5 1.7 5.4 2 5.4 2a4.8 4.8 0 0 0-.1 3.5A5 5 0 0 0 4 9c0 4.8 2.8 6 5.8 6.3C9.1 16 9 17 9 18v4" />
  ),
};

export function Icon({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      style={style}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.arrow}
    </svg>
  );
}
