const SEED = [{ id: "default", name: "", url: "http://localhost:8080", kind: "regular" }];
const DEFAULTS = { layout: "vertical", placement: "left", compact: false, autohide: false, expand: true, hover: "overlay", display: "both", size: "medium", essBox: "all", showToggle: true, showBack: true, showForward: true };
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
let hovering = false;
let hoverTimer;

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

async function load() {
  const s = await browser.storage.local.get([
    "tabs", "active", "last", "placement", "display", "hover", "compact", "layout", "bar", "size", "autohide", "expand",
    "essBox", "showToggle", "showBack", "showForward",
  ]);
  const tabs = (Array.isArray(s.tabs) ? s.tabs : structuredClone(SEED)).map((t) => ({
    ...t,
    name: t.name || "",
    kind: KINDS.includes(t.kind) ? t.kind : "regular",
  }));
  let activeId = s.active;
  if (!tabs.some((t) => t.id === activeId)) {
    // older versions stored the active tab as an index
    activeId = tabs[Math.min(s.last || 0, tabs.length - 1)]?.id ?? null;
  }
  const pick = (key, allowed) => (allowed.includes(s[key]) ? s[key] : DEFAULTS[key]);
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
    autohide: s.bar !== undefined ? s.bar === "hidden" : s.autohide === true,
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
browser.storage.onChanged.addListener((_c, area) => {
  if (area === "local") scheduleRender();
});

/* ---------- layout: compact + hover ---------- */

function applyLayout() {
  const horiz = model.layout === "horizontal";
  const S = SIZES[model.size];
  const tab = horiz ? S.tabH : S.tab;
  const tile = horiz ? S.tabH : S.tile;
  // expanded rail fits the footer row (settings tile + four buttons); compact rail is one tile wide
  const expandedW = S.tile + S.btn * 4 + 20;
  const compactW = S.tile + 12;
  const full = horiz ? S.tabH + 8 : expandedW;
  const compact = !horiz && model.compact; // a horizontal strip has no compact form
  const push = model.hover === "push";

  // Two independent switches:
  //  compact  - the bar rests as an icon strip, and (if "expand") opens to full tabs while hovered
  //  autohide - the bar is hidden until the edge is hovered, then shows in its current form
  const open = compact && model.expand && hovering;
  const restSize = compact ? (open ? expandedW : compactW) : full;
  const slotRest = compact ? (open && push ? expandedW : compactW) : full;

  const railSize = model.autohide && !hovering ? 0 : restSize;
  const slotSize = model.autohide ? (hovering && push ? restSize : EDGE) : slotRest;
  const floating = model.autohide ? hovering && !push : open && !push;

  app.dataset.layout = model.layout;
  app.dataset.placement = model.placement;
  app.dataset.display = model.display;
  app.dataset.essbox = model.essBox;
  app.style.setProperty("--tab-h", tab + "px");
  app.style.setProperty("--tile-w", tile + "px");
  app.style.setProperty("--btn", (horiz ? S.tabH : S.btn) + "px");
  $("toggle").hidden = !model.showToggle;
  app.style.setProperty("--icon", S.icon + "px");
  app.style.setProperty("--fs", S.fs + "px");
  app.style.setProperty("--slot-size", slotSize + "px");
  app.style.setProperty("--rail-size", railSize + "px");
  $("hot").hidden = !model.autohide;
  rail.classList.toggle("collapsed", compact && !open);
  rail.classList.toggle("hiddenbar", model.autohide && !hovering);
  slot.classList.toggle("floating", floating);

  $("toggle").title = horiz
    ? model.autohide ? "Always show tab bar" : "Auto-hide tab bar"
    : model.compact ? "Expand tab bar" : "Collapse to compact strip";
}

// Both the bar's own slot and the invisible edge zone count as "hovering the bar".
function setHover(on, delay) {
  clearTimeout(hoverTimer);
  if (hovering === on) return;
  if (delay <= 0) {
    hovering = on;
    applyLayout();
    return;
  }
  hoverTimer = setTimeout(() => {
    hovering = on;
    applyLayout();
  }, delay);
}
for (const el of [slot, $("hot")]) {
  // auto-hide reveals instantly; compact waits a beat so sweeping past does not flicker
  el.addEventListener("mouseenter", () => setHover(true, model.autohide ? 0 : 40));
  el.addEventListener("mouseleave", () => setHover(false, 160));
}
$("toggle").onclick = () =>
  browser.storage.local.set(
    model.layout === "horizontal" ? { autohide: !model.autohide } : { compact: !model.compact },
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
      if (i && now < i.settleUntil) i.settleUntil = Math.max(i.settleUntil, now + 800); // redirect chains
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
  !!i && (i.native ? i.index >= 0 && i.index < i.length - 1 : i.idx >= 0 && i.idx < i.stack.length - 1);

function updateNav() {
  const info = navInfo.get(model.activeId);
  $("back").hidden = !(model.showBack && canBack(info));
  $("forward").hidden = !(model.showForward && canForward(info));
  $("reload").disabled = !model.activeId;
}

window.addEventListener("message", (e) => {
  const m = e.data;
  if (!m || m.ssb !== "nav" || typeof m.id !== "string") return;
  const f = made.get(m.id);
  if (!f || e.source !== f.contentWindow) return; // must come from that tab's own frame
  const info = infoFor(m.id);
  info.url = String(m.url || "");
  info.native = m.native === true;
  if (info.native) {
    info.index = Number.isInteger(m.index) ? m.index : -1;
    info.length = Number.isInteger(m.length) ? m.length : 0;
    if (performance.now() < info.settleUntil || info.base < 0) info.base = info.index;
  } else if (info.url) {
    track(info, info.url);
  }
  if (m.id === model.activeId) updateNav();
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
  f.src = info.expect;
  updateNav();
}

function reloadTab(id) {
  const f = made.get(id);
  const t = model.tabs.find((x) => x.id === id);
  if (!f || !t) return select(id);
  f.src = navInfo.get(id)?.url || t.url;
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
  $("sep").hidden = !(by.essential.length || by.pinned.length) || !by.regular.length;

  for (const [id, f] of made) {
    if (!tabs.some((t) => t.id === id)) {
      f.remove();
      made.delete(id);
      navInfo.delete(id);
    }
  }

  emptyEl.hidden = tabs.length > 0;
  const active = tabs.find((t) => t.id === activeId);
  if (active) show(active);
  updateNav();
  rail.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
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
  findIcon(t.url).then((src) => (img.src = src));
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
    ["Add to Essentials", () => setKind(id, "essential"), t.kind === "essential"],
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
  menu.style.left = Math.max(4, Math.min(e.clientX, innerWidth - r.width - 4)) + "px";
  menu.style.top = Math.max(4, Math.min(e.clientY, innerHeight - r.height - 4)) + "px";
}

document.addEventListener("pointerdown", (e) => {
  if (!menu.hidden && !menu.contains(e.target)) closeMenu();
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
  const entry = { name: nameIn.value.trim(), url: u.href, kind: form.elements.kind.value };
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
  if (!menu.hidden) closeMenu();
  else if (!form.hidden) closePanel();
});

render();
