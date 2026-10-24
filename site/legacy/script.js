// MunaSIP site: panel tour tabs and reveal on scroll.
(() => {
  document.documentElement.classList.add("js");

  const TOUR = {
    dashboard: {
      caption: "Live dashboard — active calls, answered / missed, extension presence and queues over WebSocket; TV mode.",
      alt: "Live dashboard: active calls, answered and missed counts, extension presence and queues",
    },
    cdr: {
      caption: "Call logs — the clicked call opens its timeline inline: IVR steps, keys, wait, talk time, quality.",
      alt: "Call detail records with one call expanded: facts and a step-by-step IVR timeline",
    },
    queues: {
      caption: "Queues — strategy, timeouts, announcement language and voice model, overflow destinations, members.",
      alt: "Queue editor with strategy, wait limits, announcement language, voice model and overflow destinations",
    },
    extensions: {
      caption: "Extensions — DND switches that lock while saving, one password for portal and SIP, CSV import/export.",
      alt: "Extensions list with do-not-disturb switches",
    },
    reports: {
      caption: "Reports — totals, service level, voice quality (MOS, jitter, loss) and per-queue numbers.",
      alt: "Reports: summary, voice quality and per-queue statistics",
    },
    settings: {
      caption: "Settings — hostname and automatic Let’s Encrypt SSL, company, retention, privacy announcement, TTS model, security.",
      alt: "Settings: hostname and SSL, company name, retention and privacy announcement",
    },
  };

  // ── panel tour ──
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  const tourImg = document.querySelector("#tour-img img");
  const tourCap = document.querySelector("[data-tour-caption]");
  function selectTab(btn, focus) {
    const key = btn.dataset.shot;
    for (const b of tabs) {
      const on = b === btn;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (focus) btn.focus();
    if (tourCap) tourCap.textContent = TOUR[key].caption;
    tourImg.classList.add("is-swapping");
    const next = new Image();
    next.src = `images/${key}.webp`;
    next
      .decode()
      .catch(() => undefined)
      .finally(() => {
        tourImg.src = next.src;
        tourImg.alt = TOUR[key].alt;
        tourImg.classList.remove("is-swapping");
      });
  }
  tabs.forEach((b, i) => {
    b.tabIndex = i === 0 ? 0 : -1;
    b.addEventListener("click", () => selectTab(b, false));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      selectTab(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });
  if (tourCap) tourCap.textContent = TOUR.dashboard.caption;

  // ── reveal on scroll ──
  const reveals = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reveals.forEach((r) => r.classList.add("in"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    reveals.forEach((r, i) => {
      r.style.transitionDelay = `${Math.min(i % 6, 5) * 45}ms`;
      io.observe(r);
    });
  }
})();
