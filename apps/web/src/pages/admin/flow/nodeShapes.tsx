import type { ReactNode } from "react";

/**
 * Canvas silhouettes for IVR nodes. Each node type maps to a shape family that
 * reflects what it does (flowchart conventions), so nodes are told apart by
 * outline as well as color:
 *   terminal → pill / octagon, audio → speech bubble, caller input → slanted top,
 *   decision → hexagon, data/API → parallelogram, handoff → arrow / stack / envelope.
 */
export type ShapeKind =
  | "pill"
  | "octagon"
  | "bubble"
  | "input"
  | "folder"
  | "hexagon"
  | "parallelogram"
  | "tag"
  | "leaf"
  | "subroutine"
  | "arrow"
  | "stack"
  | "envelope";

const SHAPE_BY_TYPE: Record<string, ShapeKind> = {
  start: "pill",
  hangup: "octagon",
  announce: "bubble",
  tts: "bubble",
  menu: "input",
  get_key: "input",
  directory: "folder",
  condition: "hexagon",
  time_condition: "hexagon",
  api: "parallelogram",
  set_var: "tag",
  language: "leaf",
  subflow: "subroutine",
  transfer: "arrow",
  queue: "stack",
  voicemail: "envelope",
};

export function shapeFor(flowType: string): ShapeKind {
  return SHAPE_BY_TYPE[flowType] ?? "leaf";
}

const POINT = 14; // depth of pointed sides (hexagon, arrow, tag)
const SLANT = 12; // parallelogram skew
const STACK = 6; // offset of stacked cards behind a queue

/** Extra inner padding (px) so content stays inside the silhouette. */
export function shapePadding(kind: ShapeKind): { top: number; right: number; bottom: number; left: number } {
  switch (kind) {
    case "bubble":
      return { top: 0, right: 0, bottom: 8, left: 0 };
    case "input":
      return { top: 7, right: 0, bottom: 0, left: 0 };
    case "folder":
      return { top: 6, right: 0, bottom: 0, left: 0 };
    case "hexagon":
      return { top: 0, right: POINT, bottom: 0, left: POINT };
    case "parallelogram":
      return { top: 0, right: SLANT, bottom: 0, left: SLANT };
    case "tag":
      return { top: 0, right: POINT, bottom: 0, left: 0 };
    case "subroutine":
      return { top: 0, right: 8, bottom: 0, left: 8 };
    case "arrow":
      return { top: 0, right: POINT, bottom: 0, left: 10 };
    case "stack":
      return { top: STACK * 2, right: STACK * 2, bottom: 0, left: 0 };
    case "envelope":
      return { top: 6, right: 0, bottom: 0, left: 0 };
    case "pill":
      return { top: 0, right: 8, bottom: 0, left: 8 };
    default:
      return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

/** How far (px) the outline sits inside the right edge at height fraction `f` — handles sit on the outline. */
export function rightInset(kind: ShapeKind, f: number, h: number): number {
  switch (kind) {
    case "hexagon":
    case "arrow":
      return POINT * Math.abs(2 * f - 1);
    case "tag":
      return POINT * Math.abs(2 * f - 1);
    case "parallelogram":
      return SLANT * f;
    case "pill": {
      const r = Math.min(h / 2, 22);
      const dy = Math.abs(f * h - h / 2);
      const edge = h / 2 - r;
      return dy <= edge ? 0 : r - Math.sqrt(Math.max(0, r * r - (dy - edge) ** 2));
    }
    default:
      return 0;
  }
}

/** Inset of the outline from the left edge at mid-height (target handle). */
export function leftInset(kind: ShapeKind): number {
  if (kind === "parallelogram") return SLANT / 2;
  if (kind === "arrow") return 10;
  return 0;
}

function rr(x0: number, y0: number, x1: number, y1: number, r: number): string {
  const k = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  return (
    `M${x0 + k},${y0} H${x1 - k} Q${x1},${y0} ${x1},${y0 + k} V${y1 - k} Q${x1},${y1} ${x1 - k},${y1} ` +
    `H${x0 + k} Q${x0},${y1} ${x0},${y1 - k} V${y0 + k} Q${x0},${y0} ${x0 + k},${y0} Z`
  );
}

/** Outline paths: `body` is filled + stroked; `extra` are decoration strokes (inner lines, back cards). */
export function shapePaths(kind: ShapeKind, w: number, h: number): { body: string; back?: string[]; detail?: string } {
  const x0 = 1;
  const y0 = 1;
  const x1 = w - 1;
  const y1 = h - 1;
  const my = h / 2;
  switch (kind) {
    case "pill":
      return { body: rr(x0, y0, x1, y1, Math.min(h / 2, 22)) };
    case "octagon": {
      const c = Math.min(11, h / 3);
      return {
        body: `M${x0 + c},${y0} H${x1 - c} L${x1},${y0 + c} V${y1 - c} L${x1 - c},${y1} H${x0 + c} L${x0},${y1 - c} V${y0 + c} Z`,
      };
    }
    case "bubble": {
      const b = y1 - 8;
      const r = 12;
      return {
        body:
          `M${x0 + r},${y0} H${x1 - r} Q${x1},${y0} ${x1},${y0 + r} V${b - r} Q${x1},${b} ${x1 - r},${b} ` +
          `H${x0 + 30} L${x0 + 15},${y1} L${x0 + 18},${b} H${x0 + r} Q${x0},${b} ${x0},${b - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`,
      };
    }
    case "input": {
      const r = 8;
      return {
        body: `M${x0},${y0 + 10} L${x1 - r},${y0} Q${x1},${y0} ${x1},${y0 + r} V${y1 - r} Q${x1},${y1} ${x1 - r},${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} Z`,
      };
    }
    case "folder": {
      const r = 8;
      const t = y0 + 7;
      return {
        body:
          `M${x0 + r},${y0} H${x0 + 42} L${x0 + 50},${t} H${x1 - r} Q${x1},${t} ${x1},${t + r} V${y1 - r} ` +
          `Q${x1},${y1} ${x1 - r},${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`,
        detail: `M${x0 + 1},${t} H${x0 + 50}`,
      };
    }
    case "hexagon":
      return { body: `M${x0 + POINT},${y0} H${x1 - POINT} L${x1},${my} L${x1 - POINT},${y1} H${x0 + POINT} L${x0},${my} Z` };
    case "parallelogram":
      return { body: `M${x0 + SLANT},${y0} H${x1} L${x1 - SLANT},${y1} H${x0} Z` };
    case "tag": {
      const r = 8;
      return {
        body: `M${x0 + r},${y0} H${x1 - POINT} L${x1},${my} L${x1 - POINT},${y1} H${x0 + r} Q${x0},${y1} ${x0},${y1 - r} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} Z`,
        detail: `M${x1 - POINT - 3},${my} m-2.5,0 a2.5,2.5 0 1,0 5,0 a2.5,2.5 0 1,0 -5,0`,
      };
    }
    case "leaf": {
      const big = Math.min(18, h / 2);
      const s = 4;
      return {
        body:
          `M${x0 + big},${y0} H${x1 - s} Q${x1},${y0} ${x1},${y0 + s} V${y1 - big} Q${x1},${y1} ${x1 - big},${y1} ` +
          `H${x0 + s} Q${x0},${y1} ${x0},${y1 - s} V${y0 + big} Q${x0},${y0} ${x0 + big},${y0} Z`,
      };
    }
    case "subroutine":
      return { body: rr(x0, y0, x1, y1, 4), detail: `M${x0 + 7},${y0} V${y1} M${x1 - 7},${y0} V${y1}` };
    case "arrow":
      return { body: `M${x0},${y0} H${x1 - POINT} L${x1},${my} L${x1 - POINT},${y1} H${x0} L${x0 + 10},${my} Z` };
    case "stack": {
      const o = STACK;
      return {
        back: [rr(x0 + o * 2, y0, x1, y1 - o * 2, 9), rr(x0 + o, y0 + o, x1 - o, y1 - o, 9)],
        body: rr(x0, y0 + o * 2, x1 - o * 2, y1, 9),
      };
    }
    case "envelope": {
      const flap = 9; // shallow so the V stays above the header row
      return { body: rr(x0, y0, x1, y1, 7), detail: `M${x0 + 3},${y0 + 3} L${w / 2},${y0 + flap} L${x1 - 3},${y0 + 3}` };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Animated node icons. Motion runs on hover / selection / simulation   */
/* via CSS (index.css `.fi-*`); at rest each icon shows a static frame. */
/* ------------------------------------------------------------------ */

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="fi"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const HANDSET =
  "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z";

export function NodeIcon({ type, size }: { type: string; size?: number }) {
  switch (type) {
    case "start":
      return (
        <Svg size={size}>
          <circle className="fi-ring" cx="12" cy="12" r="10.5" strokeWidth={1.2} />
          <circle className="fi-ring fi-d2" cx="12" cy="12" r="10.5" strokeWidth={1.2} />
          <g transform="translate(6.2 6.2) scale(.48)">
            <path d={HANDSET} strokeWidth={3.4} />
          </g>
        </Svg>
      );
    case "hangup":
      return (
        <Svg size={size}>
          <g transform="rotate(135 12 12) translate(3.6 3.6) scale(.7)">
            <g className="fi-shake">
              <path d={HANDSET} strokeWidth={2.4} />
            </g>
          </g>
        </Svg>
      );
    case "announce":
      return (
        <Svg size={size}>
          <path d="M11 5 6 9H2v6h4l5 4V5z" />
          <path className="fi-wave" d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path className="fi-wave fi-d2" d="M19 5a10 10 0 0 1 0 14" />
        </Svg>
      );
    case "tts":
      return (
        <Svg size={size}>
          <path d="M3 6h9M7.5 6v12" />
          <line className="fi-bar" x1="15" y1="9" x2="15" y2="15" />
          <line className="fi-bar fi-d2" x1="18" y1="7" x2="18" y2="17" />
          <line className="fi-bar fi-d3" x1="21" y1="10" x2="21" y2="14" />
        </Svg>
      );
    case "menu":
      return (
        <Svg size={size}>
          {[0, 1, 2].flatMap((r) =>
            [0, 1, 2].map((c) => (
              <circle
                key={`${r}${c}`}
                className="fi-key"
                cx={5 + c * 7}
                cy={5 + r * 7}
                r="1.9"
                fill="currentColor"
                stroke="none"
                style={{ animationDelay: `${(r * 3 + c) * 0.16}s` }}
              />
            )),
          )}
        </Svg>
      );
    case "get_key":
      return (
        <Svg size={size}>
          <rect x="2" y="7" width="20" height="10" rx="2.5" />
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              className="fi-pin"
              cx={6.5 + i * 3.6}
              cy="12"
              r="1.2"
              fill="currentColor"
              stroke="none"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
          <line className="fi-caret" x1="17.5" y1="9.5" x2="17.5" y2="14.5" />
        </Svg>
      );
    case "directory":
      return (
        <Svg size={size}>
          <circle cx="8.5" cy="8" r="3" />
          <path d="M3 19a5.5 5.5 0 0 1 11 0" />
          <g className="fi-scan">
            <circle cx="17" cy="13.5" r="3" />
            <path d="m19.2 15.7 2.6 2.6" />
          </g>
        </Svg>
      );
    case "api":
      return (
        <Svg size={size}>
          <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              className="fi-hop"
              cx={9 + i * 3}
              cy="12"
              r="1.2"
              fill="currentColor"
              stroke="none"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </Svg>
      );
    case "condition":
      return (
        <Svg size={size}>
          <path d="M3 12h6l5-6h6M9 12l5 6h6" />
          <circle className="fi-branch" cx="20" cy="6" r="2" fill="currentColor" stroke="none" />
          <circle className="fi-branch fi-alt" cx="20" cy="18" r="2" fill="currentColor" stroke="none" />
        </Svg>
      );
    case "time_condition":
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="12" x2="15.5" y2="13.5" />
          <line className="fi-hand" x1="12" y1="12" x2="12" y2="6" />
        </Svg>
      );
    case "set_var":
      return (
        <Svg size={size}>
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="m6.5 9.5 3.5 5M10 9.5l-3.5 5" />
          <path className="fi-draw" d="M13.5 10.5h4.5" pathLength={1} />
          <path className="fi-draw fi-d2" d="M13.5 13.5h4.5" pathLength={1} />
        </Svg>
      );
    case "language":
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <ellipse className="fi-globe" cx="12" cy="12" rx="4" ry="9" />
        </Svg>
      );
    case "subflow":
      return (
        <Svg size={size}>
          <g className="fi-rotate">
            <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
            <path d="M20 2.5v4.5h-4.5" />
          </g>
          <rect x="9" y="9" width="6" height="6" rx="1.2" />
        </Svg>
      );
    case "transfer":
      return (
        <Svg size={size}>
          <g className="fi-push">
            <path d="M2.5 12h13M11.5 7l5 5-5 5" />
          </g>
          <path d="M21 5v14" />
        </Svg>
      );
    case "queue":
      return (
        <Svg size={size}>
          <circle className="fi-q fi-q-in" cx="4.5" cy="12" r="2.2" fill="currentColor" stroke="none" />
          <circle className="fi-q" cx="10.5" cy="12" r="2.2" fill="currentColor" stroke="none" />
          <circle className="fi-q fi-q-out" cx="16.5" cy="12" r="2.2" fill="currentColor" stroke="none" />
          <path d="M21.5 6v12" />
        </Svg>
      );
    case "voicemail":
      return (
        <Svg size={size}>
          <circle cx="6.5" cy="12" r="4" />
          <circle cx="17.5" cy="12" r="4" />
          <path d="M6.5 16h11" />
          <line className="fi-reel" x1="6.5" y1="9.5" x2="6.5" y2="14.5" />
          <line className="fi-reel" x1="17.5" y1="9.5" x2="17.5" y2="14.5" />
        </Svg>
      );
    default:
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="8" />
        </Svg>
      );
  }
}
