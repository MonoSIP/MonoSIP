import { useEffect, useRef } from "react";

/** The public site's wire field: it drifts with the pointer and breathes in place. */
export function AmbientBackground() {
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<SVGGElement>(null);

  useEffect(() => {
    const node = root.current;
    const group = field.current;
    if (!node || !group) return;
    const media = window.matchMedia?.bind(window);
    if (!media) return;
    const reduce = media("(prefers-reduced-motion: reduce)");
    const fine = media("(pointer: fine)");
    if (reduce.matches) return;

    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    const animate = () => {
      x += (targetX - x) * 0.075;
      y += (targetY - y) * 0.075;
      group.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.1) frame = requestAnimationFrame(animate);
      else frame = 0;
    };
    const move = (event: PointerEvent) => {
      if (!fine.matches) return;
      targetX = (event.clientX / window.innerWidth - 0.5) * 44;
      targetY = (event.clientY / window.innerHeight - 0.5) * 34;
      if (!frame) frame = requestAnimationFrame(animate);
    };
    const ripple = (event: PointerEvent) => {
      if (!fine.matches) return;
      const ripples = node.querySelectorAll(".pointer-ripple");
      if (ripples.length >= 5) ripples[0].remove();
      const circle = document.createElement("span");
      circle.className = "pointer-ripple";
      circle.style.left = `${event.clientX}px`;
      circle.style.top = `${event.clientY}px`;
      circle.addEventListener("animationend", () => circle.remove(), { once: true });
      node.appendChild(circle);
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerdown", ripple, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", ripple);
      cancelAnimationFrame(frame);
      node.querySelectorAll(".pointer-ripple").forEach((item) => item.remove());
      group.removeAttribute("transform");
    };
  }, []);

  return (
    <div className="ambient" ref={root} aria-hidden="true">
      <svg viewBox="0 0 1600 1100" preserveAspectRatio="xMidYMid slice">
        <g ref={field}>
          <g className="ambient-wires" fill="none" stroke="currentColor" strokeWidth="0.7">
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
