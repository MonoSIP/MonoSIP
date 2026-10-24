"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";

export function CodeBlock({
  code,
  title = "terminal",
  language = "bash",
}: {
  code: string;
  title?: string;
  language?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("error");
      if (pre.current) {
        const range = document.createRange();
        range.selectNodeContents(pre.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 3000);
  }
  return (
    <div className="code-block">
      <div className="code-header">
        <span>
          <span className="terminal-dots">
            <i />
            <i />
            <i />
          </span>
          {title}
        </span>
        <button type="button" onClick={copy} aria-label={`Copy ${title}`}>
          <Icon name={state === "copied" ? "check" : "copy"} />
          <span>{state === "copied" ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre ref={pre} tabIndex={0} aria-label={`${title} code`}>
        <code data-language={language}>
          {code.split("\n").map((line, i) => (
            <span
              key={i}
              className={
                line.trim().startsWith("#")
                  ? "code-comment"
                  : line.includes("ghcr.io")
                    ? "code-accent"
                    : ""
              }
            >
              {line || " "}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
      <span className="sr-only" role="status">
        {state === "copied"
          ? "Copied to clipboard."
          : state === "error"
            ? "Clipboard unavailable. Code selected; copy it with your keyboard."
            : ""}
      </span>
    </div>
  );
}
