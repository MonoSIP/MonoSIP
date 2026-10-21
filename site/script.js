// MunaSIP site: panel tour tabs and reveal on scroll.
(() => {
  document.documentElement.classList.add("js");

  const TOUR_TR = {
    dashboard: {
      caption: "Canlı pano — aktif çağrılar, cevaplanan ve cevapsızlar, dahili durumu ve kuyruklar WebSocket üzerinden; TV kipi.",
      alt: "Canlı pano: aktif çağrılar, cevaplanan ve cevapsız sayılar, dahili durumu ve kuyruklar",
    },
    cdr: {
      caption: "Çağrı kayıtları — tıklanan çağrı zaman çizelgesini açar: IVR adımları, tuşlar, bekleme, konuşma süresi, kalite.",
      alt: "Çağrı kayıtları; bir çağrı açık: özet ve adım adım IVR zaman çizelgesi",
    },
    queues: {
      caption: "Kuyruklar — düzen, süreler, anons dili ve ses modeli, taşma hedefleri, üyeler.",
      alt: "Kuyruk düzenleyici: düzen, bekleme sınırları, anons dili, ses modeli ve taşma hedefleri",
    },
    extensions: {
      caption: "Dahililer — kayıt sırasında kilitlenen rahatsız etmeyin anahtarları, portal ve SIP için tek şifre, CSV içe ve dışa aktarma.",
      alt: "Rahatsız etmeyin anahtarlı dahili listesi",
    },
    reports: {
      caption: "Raporlar — toplamlar, hizmet düzeyi, ses kalitesi (MOS, titreme, kayıp) ve kuyruk başına sayılar.",
      alt: "Raporlar: özet, ses kalitesi ve kuyruk başına istatistik",
    },
    settings: {
      caption: "Ayarlar — makine adı ve otomatik Let’s Encrypt SSL, şirket, saklama, gizlilik anonsu, TTS modeli, güvenlik.",
      alt: "Ayarlar: makine adı ve SSL, şirket adı, saklama ve gizlilik anonsu",
    },
  };
  const TOUR_EN = {
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
  const panels = [...document.querySelectorAll("#tour-img [data-panel]")];
  const tourCap = document.querySelector("[data-tour-caption]");
  const tour = () => (document.documentElement.lang === "tr" ? TOUR_TR : TOUR_EN);
  function selectTab(btn, focus) {
    const key = btn.dataset.shot;
    const copy = tour()[key];
    for (const b of tabs) {
      const on = b === btn;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (focus) btn.focus();
    if (tourCap && copy) tourCap.textContent = copy.caption;
    for (const panel of panels) {
      const on = panel.dataset.panel === key;
      panel.toggleAttribute("hidden", !on);
      if (on && copy) panel.setAttribute("aria-label", copy.alt);
    }
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
  const currentTab = () => tabs.find((b) => b.getAttribute("aria-selected") === "true") || tabs[0];
  if (currentTab()) selectTab(currentTab(), false);
  document.addEventListener("munasip-lang", () => {
    const tab = currentTab();
    if (tab) selectTab(tab, false);
  });

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

  // ── page background: IVR-style wires that dock onto the content boxes ──
  const map = document.querySelector(".flow-map");
  const svg = map && map.querySelector("svg");
  const ns = "http://www.w3.org/2000/svg";
  const flowTargets = [
    ".hero-copy",
    ".hero-art",
    ".stack-strip",
    ".phone-stage",
    ".soft-grid > .reveal",
    ".cards > .card",
    ".flowline",
    ".ivr-grid > .reveal",
    ".shot",
    ".tour-frame",
    ".install-grid > .reveal",
    ".terminal",
  ].join(",");

  function pageBox(el) {
    let x = 0;
    let y = 0;
    let n = el;
    while (n && n !== document.body) {
      x += n.offsetLeft;
      y += n.offsetTop;
      n = n.offsetParent;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    return {
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      cx: x + w / 2,
      cy: y + h / 2,
      w,
      h,
      framed: el.matches(".hero-art, .stack-strip, .card, .flowline, .shot, .tour-frame, .terminal"),
    };
  }

  function edge(box, side) {
    if (side === "left") return box.left;
    if (side === "right") return box.right;
    if (side === "top") return box.top;
    return box.bottom;
  }

  function ortho(x1, y1, x2, y2, verticalFirst) {
    const n = (v) => v.toFixed(1);
    if (Math.abs(x1 - x2) < 6) {
      return { d: `M ${n(x1)} ${n(y1)} V ${n(y2)}`, len: Math.abs(y2 - y1), down: y2 > y1 };
    }
    if (Math.abs(y1 - y2) < 6) {
      return { d: `M ${n(x1)} ${n(y1)} H ${n(x2)}`, len: Math.abs(x2 - x1), down: false };
    }
    if (verticalFirst) {
      const mid = (y1 + y2) / 2;
      return {
        d: `M ${n(x1)} ${n(y1)} V ${n(mid)} H ${n(x2)} V ${n(y2)}`,
        len: Math.abs(mid - y1) + Math.abs(x2 - x1) + Math.abs(y2 - mid),
        down: y2 > y1,
      };
    }
    const mid = (x1 + x2) / 2;
    return {
      d: `M ${n(x1)} ${n(y1)} H ${n(mid)} V ${n(y2)} H ${n(x2)}`,
      len: Math.abs(mid - x1) + Math.abs(y2 - y1) + Math.abs(x2 - mid),
      down: false,
    };
  }

  function drawFlow() {
    if (!map || !svg) return;
    const boxes = [...document.querySelectorAll(flowTargets)]
      .filter((el) => el.offsetWidth > 40 && el.offsetHeight > 24)
      .map(pageBox);
    const width = document.documentElement.clientWidth;
    const footer = document.querySelector(".footer");
    const foot = footer ? pageBox(footer) : null;
    const height = Math.max(foot ? foot.bottom : 0, document.documentElement.clientHeight);
    map.style.height = `${height}px`;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.replaceChildren();
    if (boxes.length < 2) return;

    const sorted = boxes.slice().sort((a, b) => a.top - b.top || a.left - b.left);
    const rows = [];
    for (const box of sorted) {
      const row = rows.at(-1);
      if (row && box.top < row.bottom - Math.min(box.h, row.maxH) * 0.4) {
        row.items.push(box);
        row.bottom = Math.max(row.bottom, box.bottom);
        row.maxH = Math.max(row.maxH, box.h);
      } else {
        rows.push({ items: [box], bottom: box.bottom, maxH: box.h });
      }
    }
    for (const row of rows) row.items.sort((a, b) => a.left - b.left);

    const wires = [];
    const ports = [];
    const portKey = (x, y) => `${Math.round(x / 2)}:${Math.round(y / 2)}`;
    const seen = new Set();
    const addPort = (x, y) => {
      const key = portKey(x, y);
      if (seen.has(key)) return;
      seen.add(key);
      ports.push([x, y]);
    };
    const addWire = (spec) => {
      if (spec.len < 2) return;
      wires.push(spec);
    };

    const ordered = rows.flatMap((row) => row.items);
    const n = (v) => v.toFixed(1);
    const join = (x1, y1, x2, y2, verticalFirst) => {
      const spec = ortho(x1, y1, x2, y2, verticalFirst);
      addWire(spec);
      addPort(x1, y1);
      addPort(x2, y2);
    };

    const first = ordered[0];
    const entryY = edge(first, "top");
    if (entryY > 8) {
      addWire({
        d: `M ${n(first.cx)} 0 V ${n(entryY)}`,
        len: entryY,
        down: true,
      });
      addPort(first.cx, entryY);
    }

    const sameRow = (a, b) => rows.some((row) => row.items.includes(a) && row.items.includes(b));
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      if (sameRow(a, b)) join(edge(a, "right"), a.cy, edge(b, "left"), b.cy, false);
      else join(a.cx, edge(a, "bottom"), b.cx, edge(b, "top"), true);
    }

    const last = ordered.at(-1);
    const exitY = edge(last, "bottom");
    if (height - exitY > 8) {
      addWire({
        d: `M ${n(last.cx)} ${n(exitY)} V ${n(height)}`,
        len: height - exitY,
        down: true,
      });
      addPort(last.cx, exitY);
    }

    for (const wire of wires) {
      const rail = document.createElementNS(ns, "path");
      rail.setAttribute("class", "flow-wire");
      rail.setAttribute("d", wire.d);
      svg.appendChild(rail);
      if (wire.down && wire.len > 88) {
        const packet = document.createElementNS(ns, "path");
        packet.setAttribute("class", "flow-packet");
        packet.setAttribute("d", wire.d);
        packet.style.animationDelay = `${-((wire.len % 7) * 0.35).toFixed(2)}s`;
        svg.appendChild(packet);
      }
    }
    for (const [x, y] of ports) {
      const ring = document.createElementNS(ns, "circle");
      ring.setAttribute("class", "flow-port");
      ring.setAttribute("cx", x.toFixed(1));
      ring.setAttribute("cy", y.toFixed(1));
      ring.setAttribute("r", "5.5");
      svg.appendChild(ring);
      const dot = document.createElementNS(ns, "circle");
      dot.setAttribute("class", "flow-port-dot");
      dot.setAttribute("cx", x.toFixed(1));
      dot.setAttribute("cy", y.toFixed(1));
      dot.setAttribute("r", "2");
      svg.appendChild(dot);
    }
  }

  let flowFrame = 0;
  const scheduleFlow = () => {
    if (flowFrame) return;
    flowFrame = requestAnimationFrame(() => {
      flowFrame = 0;
      drawFlow();
    });
  };
  if (map && svg) {
    drawFlow();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFlow);
    window.addEventListener("resize", scheduleFlow);
    if ("ResizeObserver" in window) new ResizeObserver(scheduleFlow).observe(document.body);
  }
})();
