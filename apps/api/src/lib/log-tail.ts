import { open, stat } from "node:fs/promises";
import { openSync, readSync, closeSync, statSync, watchFile, unwatchFile } from "node:fs";

const ANSI = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/** Complete lines from a growing buffer. The unfinished tail stays in `pending`. */
export function consumeLines(pending: string, chunk: string): { pending: string; lines: string[] } {
  const parts = stripAnsi(pending + chunk).split("\n");
  const rest = (parts.pop() ?? "").replace(/\r$/, "");
  const lines = parts.map((line) => line.replace(/\r$/, "")).filter((line) => line.length > 0);
  return { pending: rest, lines };
}

/** Last `maxLines` of a log, reading at most `maxBytes` from the end. Null if the file is missing. `size` is the end offset that was read. */
export async function readTail(
  file: string,
  maxLines: number,
  maxBytes: number,
): Promise<{ lines: string[]; size: number } | null> {
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return null;
  }
  const start = Math.max(0, size - maxBytes);
  const length = size - start;
  if (length === 0) return { lines: [], size };
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, start);
    let text = buf.toString("utf8");
    if (start > 0) {
      const cut = text.indexOf("\n");
      text = cut === -1 ? "" : text.slice(cut + 1);
    }
    const { lines } = consumeLines("", text);
    return { lines: lines.slice(-maxLines), size };
  } finally {
    await fh.close();
  }
}

/** Call `onChunk` when `file` grows. A shrink (rotation) is read from the start. */
export function followAppends(file: string, from: number, onChunk: (text: string) => void): () => void {
  let offset = from;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      return;
    }
    if (size < offset) offset = 0;
    if (size === offset) return;
    const start = size - offset > 512_000 ? size - 512_000 : offset;
    const buf = Buffer.alloc(size - start);
    let fd: number;
    try {
      fd = openSync(file, "r");
    } catch {
      return;
    }
    try {
      readSync(fd, buf, 0, buf.length, start);
    } finally {
      closeSync(fd);
    }
    offset = size;
    onChunk(buf.toString("utf8"));
  };
  watchFile(file, { interval: 400, persistent: false }, tick);
  return () => {
    stopped = true;
    unwatchFile(file, tick);
  };
}
