const SEED = [
  { id: "default", name: "", url: "http://localhost:8080", kind: "regular" },
];
const DEFAULTS = {
  layout: "vertical",
  placement: "left",
  compact: false,
  autohide: "none",
  urlbar: true,
  expand: true,
  hover: "overlay",
  display: "both",
  size: "medium",
  essBox: "all",
  showToggle: true,
  showBack: true,
  showForward: true,
};
const KINDS = ["essential", "pinned", "regular"];
// icon = favicon/glyph size, tab = tab height, tile = width of the icon column (compact tile),
// tabH = tab height in the horizontal layout, fs = label font size. "medium" follows Zen's own sidebar.
const SIZES = {
  small: { icon: 16, tab: 36, tile: 42, btn: 30, tabH: 28, fs: 12 },
  medium: { icon: 18, tab: 42, tile: 48, btn: 34, tabH: 34, fs: 13 },
  large: { icon: 22, tab: 48, tile: 56, btn: 40, tabH: 40, fs: 14 },
};
const EDGE = 6; // hover strip left behind when the bar is auto-hidden

const $ = (id) => document.getElementById(id);
const app = $("app");
const slot = $("slot");
const rail = $("rail");
const frames = $("frames");
const emptyEl = $("empty");
const form = $("form");
const formTitle = $("formTitle");
const nameIn = $("nameIn");
const urlIn = $("urlIn");
const toastEl = $("toast");
const menu = $("menu");
const shell = $("shell");
const urlslot = $("urlslot");
const addr = $("addr");
const hmenu = $("hmenu");
const groups = {
  essential: $("essentials"),
  pinned: $("pinned"),
  regular: $("regular"),
};

const made = new Map(); // tab id -> iframe, kept alive between switches
const navInfo = new Map(); // tab id -> history info reported by frame-nav.js
const iconCache = new Map(); // page url -> icon url

let model = { tabs: [], activeId: null, ...DEFAULTS };
let editingId = null; // tab being edited, or null when adding
let dragId = null;
const hoverState = { rail: false, url: false }; // which bars are currently hovered
const hoverTimers = {};
let hist = {}; // tab id -> pages visited in that tab, newest first: [{ url, title }]

/* ---------- helpers ---------- */

function autoLabel(u) {
  try {
    const x = new URL(u);
    const local = x.hostname === "localhost" || x.hostname === "127.0.0.1";
    return local && x.port ? ":" + x.port : x.host;
  } catch {
    return u;
  }
}
const labelOf = (t) => t.name.trim() || autoLabel(t.url);

async function findIcon(pageUrl) {
  if (iconCache.has(pageUrl)) return iconCache.get(pageUrl);
  let icon = new URL(pageUrl).origin + "/favicon.ico";
  try {
    const res = await fetch(pageUrl, { signal: AbortSignal.timeout(4000) });
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const href = doc.querySelector('link[rel~="icon"]')?.getAttribute("href");
    if (href) icon = new URL(href, res.url).href;
  } catch {}
  iconCache.set(pageUrl, icon);
  return icon;
}

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 9000);
}
toastEl.onclick = () => (toastEl.hidden = true);

/* ---------- storage ---------- */

// older versions stored a boolean; the setting is now "none" | "urlbar" | "tabs" | "both"
const normAutohide = (v) =>
  v === true ? "tabs" : ["urlbar", "tabs", "both"].includes(v) ? v : "none";

async function load() {
  const s = await browser.storage.local.get([
    "tabs",
    "active",
    "last",
    "placement",
    "display",
    "hover",
    "compact",
    "layout",
    "bar",
    "size",
    "autohide",
    "expand",
    "essBox",
    "showToggle",
    "showBack",
    "showForward",
    "urlbar",
  ]);
  const tabs = (Array.isArray(s.tabs) ? s.tabs : structuredClone(SEED)).map(
    (t) => ({
      ...t,
      name: t.name || "",
      kind: KINDS.includes(t.kind) ? t.kind : "regular",
    }),
  );
  let activeId = s.active;
  if (!tabs.some((t) => t.id === activeId)) {
    // older versions stored the active tab as an index
    activeId = tabs[Math.min(s.last || 0, tabs.length - 1)]?.id ?? null;
  }
  const pick = (key, allowed) =>
    allowed.includes(s[key]) ? s[key] : DEFAULTS[key];
  model = {
    tabs,
    activeId,
    placement: pick("placement", ["left", "right"]),
    display: pick("display", ["both", "icon", "name"]),
    // older versions stored hover "none" and a three-way "bar" setting; honour them until migrated
    hover: s.hover === "push" ? "push" : "overlay",
    expand: s.expand !== undefined ? s.expand !== false : s.hover !== "none",
    layout: pick("layout", ["vertical", "horizontal"]),
    size: pick("size", ["small", "medium", "large"]),
    essBox: pick("essBox", ["all", "active", "off"]),
    showToggle: s.showToggle !== false,
    showBack: s.showBack !== false,
    showForward: s.showForward !== false,
    compact: s.bar !== undefined ? s.bar === "compact" : s.compact === true,
    autohide: normAutohide(
      s.bar !== undefined ? s.bar === "hidden" : s.autohide,
    ),
    urlbar: s.urlbar !== false,
  };
}

// Every write goes through storage; storage.onChanged then triggers one render.
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    render();
  });
}
browser.storage.onChanged.addListener((changes, area) => {
  // the page history is saved often and needs no re-render
  if (area === "local" && Object.keys(changes).some((k) => k !== "history"))
    scheduleRender();
});

/* ---------- layout: compact + hover ---------- */

// Which bars are currently set to auto-hide. With horizontal tabs the tab strip and the address
// bar both sit at the top, so any auto-hide setting hides them together.
function hides() {
  const horiz = model.layout === "horizontal";
  const ah = model.autohide;
  return {
    tabs: horiz ? ah !== "none" : ah === "tabs" || ah === "both",
    url:
      model.urlbar &&
      (horiz ? ah !== "none" : ah === "urlbar" || ah === "both"),
  };
}

function applyLayout() {
  const horiz = model.layout === "horizontal";
  const S = SIZES[model.size];
  const tab = horiz ? S.tabH : S.tab;
  const tile = horiz ? S.tabH : S.tile;
  // expanded rail fits the footer row; compact rail is exactly one tile wide
  const expandedW = S.tile + S.btn * 4 + 20;
  const compactW = S.tile + 12;
  const full = horiz ? S.tabH + 8 : expandedW;
  const compact = !horiz && model.compact; // a horizontal strip has no compact form
  const push = model.hover === "push";
  const hide = hides();

  // Tab bar. compact: icon strip that opens to full tabs while hovered (if "expand").
  // auto-hide: hidden until its edge is hovered, then shown in its current form.
  const open = compact && model.expand && hoverState.rail;
  const restSize = compact ? (open ? expandedW : compactW) : full;
  const slotRest = compact ? (open && push ? expandedW : compactW) : full;
  const railHidden = hide.tabs && !hoverState.rail;
  const railSize = restSize; // hiding is a clip-path wipe, so the bar keeps its size
  const slotSize = hide.tabs
    ? hoverState.rail && push
      ? restSize
      : EDGE
    : slotRest;
  const floating = hide.tabs ? hoverState.rail && !push : open && !push;

  // Address bar: a plain bar with no compact form, only shown or auto-hidden.
  const urlH = S.btn + 8;
  const urlHidden = hide.url && !hoverState.url;
  const urlSize = model.urlbar && !urlHidden ? urlH : 0;
  let urlSlotSize = 0;
  if (model.urlbar)
    urlSlotSize = hide.url
      ? hoverState.url && push
        ? urlH
        : horiz
          ? 0
          : EDGE
      : urlH;
  // below a floating tab strip the bar must start under the strip, not under the thin hover edge
  const urlTop = horiz ? railSize - slotSize : 0;

  shell.dataset.layout = model.layout;
  app.dataset.layout = model.layout;
  app.dataset.placement = model.placement;
  shell.dataset.placement = model.placement;
  app.dataset.display = model.display;
  app.dataset.essbox = model.essBox;
  const vars = {
    "--tab-h": tab + "px",
    "--tile-w": tile + "px",
    "--btn": (horiz ? S.tabH : S.btn) + "px",
    "--icon": S.icon + "px",
    "--fs": S.fs + "px",
    "--slot-size": slotSize + "px",
    "--rail-size": railSize + "px",
    "--url-slot": urlSlotSize + "px",
    "--url-size": urlSize + "px",
    "--url-top": urlTop + "px",
  };
  for (const [k, v] of Object.entries(vars)) shell.style.setProperty(k, v);

  // vertical: the address bar is a bar across the top; horizontal: it sits below the tab strip
  urlslot.hidden = !model.urlbar;
  if (horiz && urlslot.parentElement !== app)
    app.insertBefore(urlslot, $("main"));
  else if (!horiz && urlslot.parentElement !== shell)
    shell.insertBefore(urlslot, app);

  // back / forward / reload live in the address bar when it is shown, otherwise in the footer
  const host = model.urlbar ? $("navgrp") : $("foot");
  const nav = ["back", "forward", "reload"].map($);
  if (nav[0].parentElement !== host) for (const b of nav) host.append(b);

  $("hot").hidden = !hide.tabs;
  $("hotUrl").hidden = !(hide.url && !horiz);
  $("toggle").hidden = !model.showToggle;
  rail.classList.toggle("collapsed", compact && !open);
  rail.classList.toggle("hiddenbar", railHidden);
  slot.classList.toggle("floating", floating);
  $("urlbar").classList.toggle("hiddenbar", urlHidden);
  urlslot.classList.toggle(
    "floating",
    model.urlbar && hide.url && hoverState.url && !push,
  );

  $("toggle").title = horiz
    ? model.autohide !== "none"
      ? "Always show tab bar"
      : "Auto-hide tab bar"
    : model.compact
      ? "Expand tab bar"
      : "Collapse to compact strip";
}

// Hover is tracked per bar: the tab bar ("rail") and the address bar ("url").
// With horizontal tabs both sit at the top, so they reveal and hide together.
function setHover(target, on, delay) {
  const linked = model.layout === "horizontal";
  const targets = linked ? ["rail", "url"] : [target];
  // keep the address bar open while typing in it or while its history list is open
  if (
    !on &&
    (linked || target === "url") &&
    (document.activeElement === addr || !hmenu.hidden)
  )
    return;
  for (const t of targets) {
    clearTimeout(hoverTimers[t]);
    if (hoverState[t] === on) continue;
    const apply = () => {
      hoverState[t] = on;
      applyLayout();
    };
    if (delay <= 0) apply();
    else hoverTimers[t] = setTimeout(apply, delay);
  }
}
for (const [el, target] of [
  [slot, "rail"],
  [$("hot"), "rail"],
  [urlslot, "url"],
  [$("hotUrl"), "url"],
]) {
  el.addEventListener("mouseenter", () => {
    const h = hides();
    // an auto-hidden bar reveals instantly; compact waits a beat so sweeping past does not flicker
    setHover(target, true, (target === "rail" ? h.tabs : h.url) ? 0 : 40);
  });
  el.addEventListener("mouseleave", () => setHover(target, false, 160));
}
$("toggle").onclick = () =>
  browser.storage.local.set(
    model.layout === "horizontal"
      ? { autohide: model.autohide === "none" ? "both" : "none" }
      : { compact: !model.compact },
  );
$("settings").onclick = () => browser.runtime.openOptionsPage();

/* ---------- iframes ---------- */

function show(tab) {
  let f = made.get(tab.id);
  if (!f) {
    f = document.createElement("iframe");
    f.dataset.url = tab.url;
    // After every document load, tell frame-nav.js (if it is running there) who we are.
    f.addEventListener("load", () => {
      const i = navInfo.get(tab.id);
      const now = performance.now();
      if (i) i.live = false; // until the page's helper script answers the handshake
      if (i && now < i.settleUntil)
        i.settleUntil = Math.max(i.settleUntil, now + 800); // redirect chains
      try {
        f.contentWindow.postMessage({ ssb: "hello", id: tab.id }, "*");
      } catch {}
    });
    f.src = tab.url;
    frames.appendChild(f);
    made.set(tab.id, f);
    navInfo.set(tab.id, newInfo());
  } else if (f.dataset.url !== tab.url) {
    f.dataset.url = tab.url;
    navInfo.set(tab.id, newInfo());
    f.src = tab.url;
  }
  for (const [id, fr] of made) fr.classList.toggle("hidden", id !== tab.id);
}

/* ---------- Back / Forward / Reload ---------- */

// Redirects and start-up routing that happen while a page is loading are not history the user
// can go "back" to, so entries created inside this window become the baseline for Back.
const SETTLE_MS = 1800;
const newInfo = () => ({
  native: false,
  index: -1, // Navigation API: current entry index
  length: 0, // Navigation API: number of entries
  base: -1, // Navigation API: entry that counts as "the start"
  stack: [], // fallback: our own list of visited URLs
  idx: -1,
  expect: null,
  url: "",
  settleUntil: performance.now() + SETTLE_MS,
});
function infoFor(id) {
  let i = navInfo.get(id);
  if (!i) {
    i = newInfo();
    navInfo.set(id, i);
  }
  return i;
}

// Fallback when the Navigation API is missing: keep our own list of visited URLs.
function track(info, url) {
  if (performance.now() < info.settleUntil) {
    info.stack = [url];
    info.idx = 0;
    info.expect = null;
    return;
  }
  if (info.expect !== null && url === info.expect) {
    info.expect = null;
    return;
  }
  if (info.stack[info.idx] === url) return;
  info.expect = null;
  info.stack.splice(info.idx + 1);
  info.stack.push(url);
  info.idx = info.stack.length - 1;
}

const canBack = (i) => !!i && (i.native ? i.index > i.base : i.idx > 0);
const canForward = (i) =>
  !!i &&
  (i.native
    ? i.index >= 0 && i.index < i.length - 1
    : i.idx >= 0 && i.idx < i.stack.length - 1);

function updateNav() {
  const info = navInfo.get(model.activeId);
  $("back").hidden = !(model.showBack && canBack(info));
  $("forward").hidden = !(model.showForward && canForward(info));
  $("reload").disabled = !model.activeId;
  // with only Reload showing, the address bar aligns it with the tab icons (see CSS)
  $("urlbar").classList.toggle(
    "single",
    $("back").hidden && $("forward").hidden,
  );
}

window.addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.ssb !== "nav" || typeof m.id !== "string") return;
  const f = made.get(m.id);
  if (!f || e.source !== f.contentWindow) return; // must come from that tab's own frame
  const info = infoFor(m.id);
  info.url = String(m.url || "");
  info.live = true;
  info.native = m.native === true;
  recordHistory(m.id, info.url, String(m.title || ""), info);
  if (info.native) {
    info.index = Number.isInteger(m.index) ? m.index : -1;
    info.length = Number.isInteger(m.length) ? m.length : 0;
    if (performance.now() < info.settleUntil || info.base < 0)
      info.base = info.index;
  } else if (info.url) {
    track(info, info.url);
  }
  if (m.id === model.activeId) {
    updateNav();
    updateAddr();
  }
});

function step(dir) {
  const id = model.activeId;
  const f = made.get(id);
  const info = navInfo.get(id);
  if (!f || !info) return;
  if (info.native) {
    f.contentWindow.postMessage({ ssb: dir }, "*");
    return;
  }
  const to = dir === "back" ? info.idx - 1 : info.idx + 1;
  if (to < 0 || to >= info.stack.length) return;
  info.idx = to;
  info.expect = info.stack[to];
  goFrame(f, info.expect, true);
  updateNav();
}

// Navigate a tab's frame. "replace" swaps the current history entry instead of adding one, which
// is what reload and the Back/Forward fallback need (a plain src change would add a phantom entry).
function goFrame(f, url, replace) {
  try {
    if (replace) f.contentWindow.location.replace(url);
    else f.contentWindow.location.href = url;
  } catch {
    f.src = url;
  }
}

function reloadTab(id) {
  const f = made.get(id);
  const t = model.tabs.find((x) => x.id === id);
  if (!f || !t) return select(id);
  const info = navInfo.get(id);
  if (info?.live)
    f.contentWindow.postMessage({ ssb: "reload" }, "*"); // location.reload(): no new entry
  else goFrame(f, info?.url || t.url, true);
}

$("back").onclick = () => step("back");
$("forward").onclick = () => step("forward");
$("reload").onclick = () => reloadTab(model.activeId);

/* ---------- rendering ---------- */

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  await load();
  if (seq !== renderSeq) return;
  applyLayout();

  const { tabs, activeId } = model;
  const by = { essential: [], pinned: [], regular: [] };
  for (const t of tabs) by[t.kind].push(t);
  for (const k of KINDS) {
    groups[k].replaceChildren(...by[k].map(makeTab));
    if (k !== "regular") groups[k].hidden = by[k].length === 0;
  }
  $("sepA").hidden = !(by.essential.length && by.pinned.length);
  $("sep").hidden =
    !(by.essential.length || by.pinned.length) || !by.regular.length;

  for (const [id, f] of made) {
    if (!tabs.some((t) => t.id === id)) {
      f.remove();
      made.delete(id);
      navInfo.delete(id);
    }
  }

  emptyEl.hidden = tabs.length > 0;
  pruneHistory(tabs);
  const active = tabs.find((t) => t.id === activeId);
  if (active) show(active);
  updateNav();
  updateAddr();
  rail
    .querySelector(".tab.active")
    ?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

const colorCache = new Map(); // icon url -> css color or null

// The most vivid colour in the favicon, used for an Essential's outline and tint.
function dominantColor(d) {
  const buckets = Array.from({ length: 12 }, () => ({
    w: 0,
    r: 0,
    g: 0,
    b: 0,
  }));
  let tr = 0,
    tg = 0,
    tb = 0,
    tn = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    tr += r;
    tg += g;
    tb += b;
    tn++;
    const rr = r / 255,
      gg = g / 255,
      bb = b / 255;
    const max = Math.max(rr, gg, bb),
      min = Math.min(rr, gg, bb);
    const c = max - min;
    if (c < 0.12) continue; // grey pixels do not decide the colour
    let h =
      max === rr
        ? ((gg - bb) / c) % 6
        : max === gg
          ? (bb - rr) / c + 2
          : (rr - gg) / c + 4;
    h = (h * 60 + 360) % 360;
    const w = c * (1 - Math.abs(max + min - 1) * 0.5);
    const k = buckets[Math.floor(h / 30) % 12];
    k.w += w;
    k.r += r * w;
    k.g += g * w;
    k.b += b * w;
  }
  const best = buckets.reduce((a, b) => (b.w > a.w ? b : a));
  let r, g, b;
  if (best.w >= 0.5) {
    r = best.r / best.w;
    g = best.g / best.w;
    b = best.b / best.w;
  } else if (tn) {
    r = tr / tn;
    g = tg / tn;
    b = tb / tn; // grey / monochrome icon
  } else return null;
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
  const lift = l < 0.4 ? 0.25 : 0; // keep dark icons visible on the dark bar
  const f = (v) => Math.round(v + (255 - v) * lift);
  return `rgb(${f(r)} ${f(g)} ${f(b)})`;
}

async function iconColor(src) {
  if (colorCache.has(src)) return colorCache.get(src);
  let color = null;
  try {
    // the extension's host permission lets this read the icon without tainting the canvas
    const res = await fetch(src, { signal: AbortSignal.timeout(4000) });
    const url = URL.createObjectURL(await res.blob());
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 24;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 24, 24);
      color = dominantColor(ctx.getImageData(0, 0, 24, 24).data);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {}
  colorCache.set(src, color);
  return color;
}

function xIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M4 4l8 8M12 4l-8 8");
  svg.append(path);
  return svg;
}

function makeTab(t) {
  const label = labelOf(t);
  const el = document.createElement("div");
  el.className = `tab ${t.kind}` + (t.id === model.activeId ? " active" : "");
  el.dataset.id = t.id;
  el.setAttribute("role", "tab");
  el.setAttribute("aria-selected", String(t.id === model.activeId));
  el.tabIndex = 0;
  el.draggable = true;
  el.title = `${label}\n${t.url}\nDouble-click to edit, right-click for more`;

  const icon = document.createElement("span");
  icon.className = "icon";
  const img = document.createElement("img");
  img.className = "fav";
  img.alt = "";
  img.draggable = false;
  img.onload = () => el.classList.add("hasimg");
  findIcon(t.url).then((src) => {
    img.src = src;
    if (t.kind === "essential")
      iconColor(src).then((c) => {
        if (c) el.style.setProperty("--tab-color", c);
      });
  });
  const ltr = document.createElement("span");
  ltr.className = "ltr";
  ltr.textContent = (label.replace(/^:/, "")[0] || "?").toUpperCase();
  icon.append(img, ltr);

  const text = document.createElement("span");
  text.className = "label";
  text.textContent = label;
  el.append(icon, text);

  // Only regular tabs get a close button at all. Pinned and Essential tabs have none.
  if (t.kind === "regular") {
    const x = document.createElement("button");
    x.className = "x";
    x.append(xIcon());
    x.title = "Close tab";
    x.tabIndex = -1;
    x.onclick = (e) => {
      e.stopPropagation();
      closeTab(t.id);
    };
    el.append(x);
  }

  el.onclick = () => select(t.id);
  el.ondblclick = () => openPanel(t.id);
  el.oncontextmenu = (e) => {
    e.preventDefault();
    openMenu(e, t.id);
  };
  el.onauxclick = (e) => {
    if (e.button === 1) closeTab(t.id);
  };
  el.onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(t.id);
    } else if (e.key === "Delete") closeTab(t.id);
  };

  const isAfter = (e) => {
    const r = el.getBoundingClientRect();
    return t.kind === "essential" || model.layout === "horizontal"
      ? e.clientX > r.left + r.width / 2
      : e.clientY > r.top + r.height / 2;
  };
  el.ondragstart = (e) => {
    dragId = t.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", t.id);
    el.classList.add("dragging");
  };
  el.ondragend = () => {
    dragId = null;
    el.classList.remove("dragging");
    clearDropMarks();
  };
  el.ondragover = (e) => {
    const from = model.tabs.find((x) => x.id === dragId);
    if (!from || from.kind !== t.kind || from.id === t.id) return; // reorder within a group only
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearDropMarks();
    el.classList.add(isAfter(e) ? "drop-after" : "drop-before");
  };
  el.ondrop = async (e) => {
    e.preventDefault();
    const from = dragId;
    dragId = null;
    const after = isAfter(e);
    clearDropMarks();
    if (from) await moveTab(from, t.id, after);
  };
  return el;
}

/* ---------- actions ---------- */

async function select(id) {
  if (id === model.activeId) return;
  await browser.storage.local.set({ active: id });
}

function clearDropMarks() {
  for (const el of rail.querySelectorAll(".drop-before, .drop-after"))
    el.classList.remove("drop-before", "drop-after");
}

async function moveTab(fromId, toId, after) {
  const tabs = model.tabs.slice();
  const fi = tabs.findIndex((t) => t.id === fromId);
  if (fi < 0) return;
  const [item] = tabs.splice(fi, 1);
  const ti = tabs.findIndex((t) => t.id === toId);
  if (ti < 0) return;
  tabs.splice(ti + (after ? 1 : 0), 0, item);
  await browser.storage.local.set({ tabs });
}

async function closeTab(id) {
  const i = model.tabs.findIndex((t) => t.id === id);
  // Pinned and Essential tabs can never be closed from here.
  if (i < 0 || model.tabs[i].kind !== "regular") return;
  const tabs = model.tabs.filter((t) => t.id !== id);
  let active = model.activeId;
  if (id === active) active = (tabs[i] || tabs[i - 1])?.id ?? null;
  closePanel();
  await browser.storage.local.set({ tabs, active });
}

async function setKind(id, kind) {
  const tabs = model.tabs.map((t) => (t.id === id ? { ...t, kind } : t));
  await browser.storage.local.set({ tabs });
}

/* ---------- address bar ---------- */

const currentUrl = () => {
  const t = model.tabs.find((x) => x.id === model.activeId);
  return navInfo.get(model.activeId)?.url || t?.url || "";
};
const displayUrl = (u) => u.replace(/^https?:\/\//i, "").replace(/\/$/, "");

function updateAddr() {
  if (document.activeElement === addr) return; // never overwrite what the user is typing
  const url = currentUrl();
  addr.value = url ? displayUrl(url) : "";
  addr.title = url;
  $("copy").disabled = $("hist").disabled = !url;
}

// Accepts full URLs, host[:port][/path], and paths relative to the current page. http(s) only.
function resolveInput(raw, base) {
  raw = raw.trim();
  if (!raw) throw new Error("empty");
  let u;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) u = new URL(raw);
  else if (/^[/?#]/.test(raw)) u = new URL(raw, base);
  else u = new URL(new URL(base).protocol + "//" + raw);
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new Error("scheme");
  return u;
}

async function navigateTo(raw) {
  const f = made.get(model.activeId);
  if (!f) return;
  let u;
  try {
    u = resolveInput(raw, currentUrl() || "http://localhost/");
  } catch {
    toast("That doesn't look like a valid web address.");
    return;
  }
  // Same rule as the add-tab form: ask for the host first, while the keypress still counts as a gesture.
  let granted = false;
  try {
    granted = await browser.permissions.request({
      origins: [`${u.protocol}//${u.hostname}/*`],
    });
  } catch {}
  goFrame(f, u.href, false);
  if (!granted)
    toast(
      `Access to ${u.hostname} wasn't granted, so the page may refuse to load if it blocks embedding.`,
    );
}

function goTo(url) {
  const f = made.get(model.activeId);
  if (f) goFrame(f, url, false);
}

addr.addEventListener("focus", () => {
  addr.value = currentUrl();
  addr.select();
});
addr.addEventListener("blur", () => {
  updateAddr();
  if (!urlslot.matches(":hover")) setHover("url", false, 160);
});
addr.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const v = addr.value;
    addr.blur();
    navigateTo(v);
  } else if (e.key === "Escape") {
    e.preventDefault();
    addr.blur();
  }
});

let copyTimer;
async function copyLink() {
  const url = currentUrl();
  if (!url) return;
  let ok = false;
  try {
    await navigator.clipboard.writeText(url);
    ok = true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta);
    ta.select();
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
  }
  if (!ok) return toast("Couldn't copy the link.");
  $("copy").classList.add("ok");
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => $("copy").classList.remove("ok"), 1300);
}
$("copy").onclick = copyLink;

/* ---------- per-tab page history (stored locally, never sent anywhere) ---------- */

let histTimer;
function saveHistory() {
  clearTimeout(histTimer);
  histTimer = setTimeout(
    () => browser.storage.local.set({ history: hist }),
    500,
  );
}

async function loadHistory() {
  try {
    const { history } = await browser.storage.local.get("history");
    if (history && typeof history === "object") hist = history;
  } catch {}
}

function pruneHistory(tabs) {
  let changed = false;
  for (const id of Object.keys(hist))
    if (!tabs.some((t) => t.id === id)) {
      delete hist[id];
      changed = true;
    }
  if (changed) saveHistory();
}

function recordHistory(id, url, title, info) {
  if (!/^https?:/i.test(url)) return;
  const list = (hist[id] ||= []);
  const head = list[0];
  if (head && head.url === url) {
    if (title && head.title !== title) {
      head.title = title;
      saveHistory();
    }
    return;
  }
  const settling = performance.now() < info.settleUntil;
  const entry = { url, title };
  if (head && settling && info.histInSettle) {
    list[0] = entry; // a redirect while the page is starting up replaces the entry before it
  } else {
    hist[id] = [entry, ...list.filter((h) => h.url !== url)].slice(0, 30);
    info.histInSettle = settling;
  }
  saveHistory();
}

function openHistory() {
  const list = hist[model.activeId] || [];
  const cur = currentUrl();
  const items = list.map((h) => {
    const b = document.createElement("button");
    b.className = "hitem" + (h.url === cur ? " cur" : "");
    b.setAttribute("role", "menuitem");
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = h.title || displayUrl(h.url);
    const u = document.createElement("span");
    u.className = "u";
    u.textContent = displayUrl(h.url);
    b.append(t, u);
    b.onclick = () => {
      closeHistory();
      goTo(h.url);
    };
    return b;
  });
  if (!items.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "No pages visited in this tab yet.";
    items.push(e);
  } else {
    const clear = document.createElement("button");
    clear.className = "hitem";
    clear.textContent = "Clear history for this tab";
    clear.onclick = () => {
      delete hist[model.activeId];
      saveHistory();
      closeHistory();
    };
    items.push(document.createElement("hr"), clear);
  }
  hmenu.replaceChildren(...items);
  hmenu.hidden = false;
  const f = $("field").getBoundingClientRect();
  const hb = $("hist").getBoundingClientRect();
  const w = Math.min(Math.max(f.width, 240), innerWidth - 12);
  hmenu.style.width = w + "px";
  hmenu.style.left =
    Math.max(6, Math.min(hb.right - w, innerWidth - w - 6)) + "px"; // under the button
  hmenu.style.top = hb.bottom + 4 + "px";
}

function closeHistory() {
  hmenu.hidden = true;
  if (!urlslot.matches(":hover") && document.activeElement !== addr)
    setHover("url", false, 160);
}

$("hist").onclick = () => (hmenu.hidden ? openHistory() : closeHistory());

/* ---------- context menu ---------- */

function closeMenu() {
  menu.hidden = true;
}

function openMenu(e, id) {
  const t = model.tabs.find((x) => x.id === id);
  if (!t) return;
  const items = [
    ["Edit…", () => openPanel(id)],
    ["Reload", () => reloadTab(id)],
    null,
    ["Pin tab", () => setKind(id, "pinned"), t.kind === "pinned"],
    [
      "Add to Essentials",
      () => setKind(id, "essential"),
      t.kind === "essential",
    ],
    ["Make regular", () => setKind(id, "regular"), t.kind === "regular"],
  ];
  // Close only appears for regular tabs.
  if (t.kind === "regular") items.push(null, ["Close tab", () => closeTab(id)]);

  menu.replaceChildren(
    ...items.map((it) => {
      if (!it) return document.createElement("hr");
      const [text, fn, hide] = it;
      const b = document.createElement("button");
      b.textContent = text;
      b.hidden = !!hide;
      b.setAttribute("role", "menuitem");
      b.onclick = () => {
        closeMenu();
        fn();
      };
      return b;
    }),
  );
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left =
    Math.max(4, Math.min(e.clientX, innerWidth - r.width - 4)) + "px";
  menu.style.top =
    Math.max(4, Math.min(e.clientY, innerHeight - r.height - 4)) + "px";
}

document.addEventListener("pointerdown", (e) => {
  if (!menu.hidden && !menu.contains(e.target)) closeMenu();
  if (
    !hmenu.hidden &&
    !hmenu.contains(e.target) &&
    !$("hist").contains(e.target)
  )
    closeHistory();
});
window.addEventListener("blur", closeMenu);

/* ---------- add / edit panel ---------- */

function openPanel(id) {
  closeMenu();
  editingId = id;
  const t = id ? model.tabs.find((x) => x.id === id) : null;
  if (id && !t) return;
  formTitle.textContent = t ? "Edit tab" : "Add tab";
  nameIn.value = t ? t.name : "";
  urlIn.value = t ? t.url : "";
  form.elements.kind.value = t ? t.kind : "regular";
  $("save").textContent = t ? "Save" : "Add";
  form.hidden = false;
  const first = t ? nameIn : urlIn;
  first.focus();
  first.select();
}

function closePanel() {
  form.hidden = true;
  editingId = null;
}

form.onsubmit = async (e) => {
  e.preventDefault();
  let raw = urlIn.value.trim();
  if (!raw) {
    urlIn.focus();
    return;
  }
  if (!/^https?:\/\//i.test(raw)) raw = "http://" + raw;
  let u;
  try {
    u = new URL(raw);
  } catch {
    toast("That doesn't look like a valid URL.");
    return;
  }

  // Ask for access to this host. Keep this as the first await in the handler so
  // the click still counts as a user gesture. Already-granted hosts return true
  // without a prompt, and the grant covers every port on that host.
  let granted = false;
  try {
    granted = await browser.permissions.request({
      origins: [`${u.protocol}//${u.hostname}/*`],
    });
  } catch {
    granted = false;
  }

  await load();
  const entry = {
    name: nameIn.value.trim(),
    url: u.href,
    kind: form.elements.kind.value,
  };
  const tabs = model.tabs.slice();
  let id;
  const at = editingId ? tabs.findIndex((t) => t.id === editingId) : -1;
  if (at >= 0) {
    tabs[at] = { ...tabs[at], ...entry };
    id = tabs[at].id;
  } else {
    id = crypto.randomUUID();
    tabs.push({ id, ...entry });
  }
  closePanel();
  await browser.storage.local.set({ tabs, active: id });

  if (!granted) {
    toast(
      `Access to ${u.hostname} wasn't granted, so the page may refuse to load if it blocks embedding. Edit the tab to try again.`,
    );
  }
};

groups.regular.addEventListener(
  "wheel",
  (e) => {
    if (model.layout === "horizontal" && e.deltaY) {
      groups.regular.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  },
  { passive: false },
);

$("add").onclick = () => openPanel(null);
$("cancel").onclick = closePanel;
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!hmenu.hidden) closeHistory();
  else if (!menu.hidden) closeMenu();
  else if (!form.hidden) closePanel();
});

loadHistory().finally(render);
