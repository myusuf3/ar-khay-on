// In-page toast. Injected on demand into the active tab (isolated world).
// Guarded so re-injection is a no-op; the background calls
// globalThis.__karakeepToast(state, opts) after injecting.
(() => {
  if (globalThis.__karakeepToast) return;

  const MIN_SAVING_MS = 450; // let the "saving" beat register before resolving
  const HOLD_MS = { saved: 2200, exists: 2200, error: 4000, setup: 5000 };

  let host, root, el, label, shownAt = 0, hideTimer, pending, hovering = false, visible = false, current = {};

  const CSS = `
    :host { all: initial; }
    .kk {
      position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
      display: flex; align-items: center; gap: 10px;
      padding: 8px 14px 8px 8px; border-radius: 999px;
      background: #0c0c0c; color: #fff;
      box-shadow: 0 0 0 1px rgba(255,255,255,.09) inset, 0 8px 28px rgba(0,0,0,.28), 0 2px 6px rgba(0,0,0,.18);
      font: 500 13px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      letter-spacing: -.005em; -webkit-font-smoothing: antialiased;
      cursor: default; user-select: none; pointer-events: auto;
      opacity: 0; transform: translateY(10px) scale(.96);
      transition: opacity .22s ease, transform .32s cubic-bezier(.2,.9,.25,1.15);
    }
    .kk.in  { opacity: 1; transform: none; }
    .kk.out { opacity: 0; transform: translateY(6px) scale(.98); transition-duration: .2s, .25s; }
    .kk.clickable { cursor: pointer; }

    .mark { width: 22px; height: 22px; flex: none; overflow: visible; }
    .tile { fill: #fff; transform-origin: 12px 12px; }
    .ink  { fill: #0c0c0c; }
    .ribbon { transform: translateY(-9px); transition: transform .2s ease; }

    /* saving: the bookmark hovers above its slot, breathing */
    .saving .ribbon { animation: hover 1.1s ease-in-out infinite alternate; }
    @keyframes hover { from { transform: translateY(-10px); } to { transform: translateY(-6.5px); } }

    /* saved: the bookmark drops into the keep */
    .saved .ribbon, .exists .ribbon { animation: drop .5s cubic-bezier(.3,1.4,.5,1) forwards; }
    @keyframes drop { 0% { transform: translateY(-9px); } 100% { transform: translateY(0); } }
    .saved .tile { animation: pop .42s ease .28s; }
    @keyframes pop { 50% { transform: scale(1.1); } }

    .error .ribbon, .setup .ribbon { transform: translateY(-9px); animation: none; }

    .label { white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
    .label.swap { animation: swap .28s ease; }
    @keyframes swap { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

    .end { width: 14px; height: 14px; flex: none; display: none; margin-left: -2px; }
    .end path { fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
    .check { stroke: #fff; stroke-dasharray: 16; stroke-dashoffset: 16; }
    .saved .end.ok, .exists .end.ok { display: block; }
    .saved .check, .exists .check { animation: draw .32s ease .38s forwards; }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    .exists .check { stroke: rgba(255,255,255,.55); }
    .bang { stroke: #ff6b61; }
    .error .end.bad, .setup .end.bad { display: block; }

    @media (prefers-reduced-motion: reduce) {
      .kk, .kk.in, .kk.out { transform: none !important; transition: opacity .15s ease; }
      .ribbon, .tile, .label.swap { animation: none !important; }
      .saved .ribbon, .exists .ribbon { transform: none; }
      .check { animation: none !important; stroke-dashoffset: 0; }
    }
  `;

  // Karakeep mark: tile + bar + bookmark ribbon (ribbon clipped to the tile).
  const MARK = `
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
      <defs><clipPath id="kk-tile"><rect width="24" height="24" rx="4.5"/></clipPath></defs>
      <rect class="tile" width="24" height="24" rx="4.5"/>
      <g clip-path="url(#kk-tile)">
        <rect class="ink" x="3.3" y="3.1" width="7.2" height="17.8" rx=".7"/>
        <path class="ink ribbon" d="M13.6 7h2.6c2.5 0 4.4 2 4.4 4.6v8.9c0 .3-.3.5-.6.3l-2.8-1.9a.9.9 0 0 0-1 0l-2.8 1.9c-.3.2-.6 0-.6-.3V7.8c0-.4.4-.8.8-.8z"/>
      </g>
    </svg>`;

  const TEXT = {
    saving: "Saving to Karakeep\u2026",
    saved: "Saved to Karakeep",
    exists: "Already in Karakeep",
  };

  function build() {
    host = document.createElement("karakeep-toast");
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="kk" role="status" aria-live="polite">
        ${MARK}
        <span class="label"></span>
        <svg class="end ok" viewBox="0 0 16 16" aria-hidden="true"><path class="check" d="M3.5 8.5l3 3 6-7"/></svg>
        <svg class="end bad" viewBox="0 0 16 16" aria-hidden="true"><path class="bang" d="M8 3.5v5.5M8 12.3v.2"/></svg>
      </div>`;
    el = root.querySelector(".kk");
    label = root.querySelector(".label");

    el.addEventListener("mouseenter", () => { hovering = true; clearTimeout(hideTimer); });
    el.addEventListener("mouseleave", () => { hovering = false; scheduleHide(); });
    el.addEventListener("click", () => {
      const { state, id } = current;
      if ((state === "saved" || state === "exists") && id) chrome.runtime.sendMessage({ kk: "open", id });
      else if (state === "setup") chrome.runtime.sendMessage({ kk: "setup" });
      else return;
      hide();
    });
  }

  function mount() {
    if (!host) build();
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
  }

  function apply(state, opts) {
    current = { state, ...opts };
    el.className = `kk in ${state}`;
    el.classList.toggle("clickable", (state === "saved" || state === "exists") && !!opts.id || state === "setup");
    el.title = state === "setup" ? "Open settings" : opts.id ? "Open in Karakeep" : "";

    const text = opts.message || TEXT[state] || "";
    if (label.textContent !== text) {
      label.textContent = text;
      label.classList.remove("swap");
      void label.offsetWidth; // restart animation
      label.classList.add("swap");
    }
    scheduleHide();
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    const hold = HOLD_MS[current.state];
    if (!hold || hovering) return;
    hideTimer = setTimeout(hide, hold);
  }

  function hide() {
    clearTimeout(hideTimer);
    if (!el) return;
    visible = false;
    el.classList.remove("in");
    el.classList.add("out");
    setTimeout(() => { if (el.classList.contains("out")) host.remove(); }, 260);
  }

  globalThis.__karakeepToast = (state, opts = {}) => {
    clearTimeout(pending);
    mount();

    if (state === "saving" || !visible) {
      // Fresh entrance.
      visible = true;
      shownAt = performance.now();
      current = { state, ...opts };
      el.className = "kk";
      void el.offsetWidth;
      requestAnimationFrame(() => apply(state, opts));
      return;
    }

    // Resolve from "saving" no sooner than MIN_SAVING_MS after it appeared.
    const wait = current.state === "saving" ? Math.max(0, MIN_SAVING_MS - (performance.now() - shownAt)) : 0;
    pending = setTimeout(() => apply(state, opts), wait);
  };
})();
