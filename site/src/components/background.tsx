"use client";

import { useEffect, useRef } from "react";
import { usePreferences } from "./preferences";

export function Background() {
  const { active } = usePreferences();
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<SVGGElement>(null);
  useEffect(() => {
    const node = root.current;
    const group = field.current;
    if (!active || !node || !group) return;
    let frame = 0;
    let targetX = 0,
      targetY = 0,
      x = 0,
      y = 0;
    const fine = matchMedia("(pointer: fine)");
    const animate = () => {
      x += (targetX - x) * 0.075;
      y += (targetY - y) * 0.075;
      group.setAttribute(
        "transform",
        `translate(${x.toFixed(2)},${y.toFixed(2)})`,
      );
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.1)
        frame = requestAnimationFrame(animate);
      else frame = 0;
    };
    const move = (event: PointerEvent) => {
      if (!fine.matches) return;
      targetX = (event.clientX / window.innerWidth - 0.5) * 44;
      targetY = (event.clientY / window.innerHeight - 0.5) * 34;
      node.style.setProperty("--pointer-x", `${event.clientX}px`);
      node.style.setProperty("--pointer-y", `${event.clientY}px`);
      if (!frame) frame = requestAnimationFrame(animate);
    };
    const ripple = (event: PointerEvent) => {
      const ripples = node.querySelectorAll(".pointer-ripple");
      if (ripples.length >= 5) ripples[0].remove();
      const circle = document.createElement("span");
      circle.className = "pointer-ripple";
      circle.style.left = `${event.clientX}px`;
      circle.style.top = `${event.clientY}px`;
      circle.addEventListener("animationend", () => circle.remove(), {
        once: true,
      });
      node.appendChild(circle);
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerdown", ripple, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", ripple);
      cancelAnimationFrame(frame);
      node.querySelectorAll(".pointer-ripple").forEach((r) => r.remove());
      group.removeAttribute("transform");
    };
  }, [active]);

  return (
    <div
      className={`ambient ${active ? "is-active" : ""}`}
      ref={root}
      aria-hidden="true"
    >
      <div className="pointer-glow" />
      <svg viewBox="0 0 1600 1100" preserveAspectRatio="xMidYMid slice">
        <g ref={field}>
          <g
            className="ambient-wires"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.7"
          >
            <path d="M-100 180H220l190 190h290l160 160h650M-100 710h330l190-190h560l290-290h400M130-100v180l470 470v650M1480-100v350l-360 360v590M-100 980h380l570-570h850" />
            <circle cx="410" cy="370" r="6" />
            <circle cx="700" cy="370" r="6" />
            <circle cx="1080" cy="520" r="6" />
            <circle cx="600" cy="900" r="6" />
            <path d="M140 310h16m-8-8v16M1180 850h16m-8-8v16M1380 430h16m-8-8v16M330 880h16m-8-8v16" />
            <circle cx="1180" cy="200" r="90" />
            <circle cx="1180" cy="200" r="108" />
          </g>
          <g className="ambient-pulses" fill="currentColor">
            <circle cx="410" cy="370" r="2.5" />
            <circle cx="1080" cy="520" r="2.5" />
            <circle cx="600" cy="900" r="2.5" />
          </g>
        </g>
      </svg>
    </div>
  );
}

export function MotionRegion({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        element.dataset.offscreen = String(!entry.isIntersecting);
      },
      { rootMargin: "80px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  );
}
