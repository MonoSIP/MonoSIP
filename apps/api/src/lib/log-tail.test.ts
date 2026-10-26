import { mkdtemp, writeFile, appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { consumeLines, followAppends, readTail, stripAnsi } from "./log-tail.js";

describe("consumeLines", () => {
  it("keeps an unfinished line and drops blanks", () => {
    const first = consumeLines("", "one\n\ntwo");
    expect(first.lines).toEqual(["one"]);
    expect(first.pending).toBe("two");
    const next = consumeLines(first.pending, " more\nthree\n");
    expect(next.lines).toEqual(["two more", "three"]);
    expect(next.pending).toBe("");
  });

  it("strips ANSI color codes", () => {
    expect(stripAnsi("\x1b[31mERROR\x1b[0m")).toBe("ERROR");
    expect(consumeLines("", "\x1b[33mwarn\x1b[0m\n").lines).toEqual(["warn"]);
  });
});

describe("readTail", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("returns null when the file is missing and the last lines otherwise", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "monosip-log-"));
    const file = path.join(dir, "full");
    expect(await readTail(file, 10, 1000)).toBeNull();
    await writeFile(file, "a\nb\nc\nd\n");
    expect((await readTail(file, 2, 1000))?.lines).toEqual(["c", "d"]);
  });

  it("follows bytes appended after the start offset", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "monosip-log-"));
    const file = path.join(dir, "full");
    await writeFile(file, "old\n");
    const seen: string[] = [];
    const stop = followAppends(file, 4, (chunk) => seen.push(chunk));
    await appendFile(file, "new\n");
    await new Promise((r) => setTimeout(r, 700));
    stop();
    expect(seen.join("")).toContain("new");
    expect(seen.join("")).not.toContain("old");
  });
});
