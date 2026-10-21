const SEED = [{ id: "default", name: "", url: "http://localhost:8080" }];

const $ = (id) => document.getElementById(id);
const tabsEl = $("tabs");
const frames = $("frames");
const emptyEl = $("empty");
const form = $("form");
const formTitle = $("formTitle");
const nameIn = $("nameIn");
const urlIn = $("urlIn");
const toastEl = $("toast");

const made = new Map(); // tab id -> iframe, kept alive between switches
let current = 0; // index of the active tab
let editing = null; // index being edited, or null when adding
let display = "both"; // "both" | "icon" | "name"
const MODES = ["both", "icon", "name"];
const MODE_TEXT = { both: "◉A", icon: "◉", name: "A" };
const MODE_TITLE = {
  both: "Icon + name",
  icon: "Icon only",
  name: "Name only",
};
const iconCache = new Map(); // page url -> icon url
let settling = true; // true for the first moments after the sidebar opens
setTimeout(() => (settling = false), 2000);

function revealActive() {
  const a = tabsEl.querySelector(".tab.active");
  if (a)
    a.scrollIntoView({
      inline: settling ? "center" : "nearest",
      block: "nearest",
    });
}
window.addEventListener("resize", () => {
  if (settling) revealActive();
});

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

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 9000);
}
toastEl.onclick = () => (toastEl.hidden = true);

/* ---------- storage ---------- */

async function getState() {
  const { tabs, last } = await browser.storage.local.get(["tabs", "last"]);
  const list = Array.isArray(tabs) ? tabs : structuredClone(SEED);
  return {
    tabs: list,
    last: Math.min(last || 0, Math.max(0, list.length - 1)),
  };
}

/* ---------- iframes ---------- */

function show(tab) {
  let f = made.get(tab.id);
  if (!f) {
    f = document.createElement("iframe");
    f.dataset.url = tab.url;
    f.src = tab.url;
    frames.appendChild(f);
    made.set(tab.id, f);
  } else if (f.dataset.url !== tab.url) {
    f.dataset.url = tab.url;
    f.src = tab.url;
  }
  for (const [id, fr] of made) fr.classList.toggle("hidden", id !== tab.id);
}

/* ---------- rendering ---------- */

async function render() {
  const { tabs, last } = await getState();
  current = last;
  const { display: saved } = await browser.storage.local.get("display");
  display = MODES.includes(saved) ? saved : "both";
  $("mode").textContent = MODE_TEXT[display];
  $("mode").title =
    "Tab display: " + MODE_TITLE[display] + " (click to change)";
  const scroll = tabsEl.scrollLeft;

  tabsEl.replaceChildren(
    ...tabs.map((t, i) => {
      const el = document.createElement("div");
      el.className = "tab" + (i === last ? " active" : "");
      el.setAttribute("role", "tab");
      el.title =
        (t.name.trim() || autoLabel(t.url)) +
        "\n" +
        t.url +
        "\nDouble-click or right-click to edit";
      el.onclick = () => select(i);
      el.ondblclick = () => openPanel(i);
      el.oncontextmenu = (e) => {
        e.preventDefault();
        openPanel(i);
      };
      el.onauxclick = (e) => {
        if (e.button === 1) remove(i);
      };

      const text = document.createElement("span");
      text.textContent = t.name.trim() || autoLabel(t.url);

      const x = document.createElement("button");
      x.className = "x";
      x.textContent = "×";
      x.title = "Close tab";
      x.onclick = (e) => {
        e.stopPropagation();
        remove(i);
      };

      if (display !== "name") {
        const img = document.createElement("img");
        img.hidden = true;
        img.onload = () => {
          img.hidden = false;
          if (display === "icon") text.hidden = true;
          if (settling) revealActive();
        };
        img.onerror = () => {
          img.remove();
          if (settling) revealActive();
        };
        findIcon(t.url).then((src) => (img.src = src));
        el.append(img);
      }
      el.append(text, x);
      return el;
    }),
  );

  // drop iframes for tabs that no longer exist
  for (const [id, f] of made) {
    if (!tabs.some((t) => t.id === id)) {
      f.remove();
      made.delete(id);
    }
  }

  tabsEl.scrollLeft = scroll;
  revealActive();
  requestAnimationFrame(revealActive);

  emptyEl.hidden = tabs.length > 0;
  if (tabs.length) show(tabs[last]);
}

/* ---------- actions ---------- */

async function select(i) {
  if (i === current) return; // already active; avoids re-rendering mid double-click
  await browser.storage.local.set({ last: i });
  render();
}

async function remove(i) {
  const { tabs, last } = await getState();
  tabs.splice(i, 1);
  let next = last;
  if (i < last) next = last - 1;
  else if (i === last) next = Math.min(last, tabs.length - 1);
  await browser.storage.local.set({ tabs, last: Math.max(0, next) });
  closePanel();
  render();
}

/* ---------- add / edit panel ---------- */

async function openPanel(index) {
  editing = index;
  if (index === null) {
    formTitle.textContent = "Add tab";
    nameIn.value = "";
    urlIn.value = "";
    $("save").textContent = "Add";
  } else {
    const { tabs } = await getState();
    const t = tabs[index];
    if (!t) return;
    formTitle.textContent = "Edit tab";
    nameIn.value = t.name;
    urlIn.value = t.url;
    $("save").textContent = "Save";
  }
  form.hidden = false;
  (index === null ? urlIn : nameIn).focus();
  (index === null ? urlIn : nameIn).select();
}

function closePanel() {
  form.hidden = true;
  editing = null;
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

  const { tabs } = await getState();
  const entry = { name: nameIn.value.trim(), url: u.href };
  let idx;
  if (editing !== null && tabs[editing]) {
    tabs[editing] = { ...tabs[editing], ...entry };
    idx = editing;
  } else {
    tabs.push({ id: crypto.randomUUID(), ...entry });
    idx = tabs.length - 1;
  }
  await browser.storage.local.set({ tabs, last: idx });
  closePanel();
  render();

  if (!granted) {
    toast(
      `Access to ${u.hostname} wasn't granted, so the page may refuse to load if it blocks embedding. Edit the tab to try again.`,
    );
  }
};

$("add").onclick = () => openPanel(null);
$("cancel").onclick = closePanel;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !form.hidden) closePanel();
});

$("reload").onclick = async () => {
  const { tabs, last } = await getState();
  const t = tabs[last];
  const f = t && made.get(t.id);
  if (f) f.src = t.url;
};

// mouse wheel scrolls the tab row sideways
tabsEl.addEventListener(
  "wheel",
  (e) => {
    if (e.deltaY) {
      tabsEl.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  },
  { passive: false },
);

$("mode").onclick = async () => {
  const next = MODES[(MODES.indexOf(display) + 1) % MODES.length];
  await browser.storage.local.set({ display: next });
  render();
};

render();
