// Lets the sidebar embed pages from hosts the user has granted access to.
//
// For those hosts only, and only for frames loaded inside this extension's own
// sidebar, it removes X-Frame-Options and the frame-ancestors part of any
// Content-Security-Policy. Hosts are granted one at a time through
// browser.permissions.request() when the user adds or edits a tab.
//
// It also registers frame-nav.js on those same hosts. That script lets the
// sidebar know whether Back/Forward are possible inside a framed page, and it
// only does anything after the sidebar page sends it a handshake message.

const EXT_BASE = browser.runtime.getURL("");
let current = null;
let navScript = null;
let queue = Promise.resolve();

function allowEmbedding(details) {
  // Leave frames alone unless the top of the frame tree is our own sidebar page.
  const chain = details.frameAncestors;
  const top =
    chain && chain.length ? chain[chain.length - 1].url : details.documentUrl;
  if (!top || !top.startsWith(EXT_BASE)) return {};

  const headers = [];
  for (const h of details.responseHeaders) {
    const name = h.name.toLowerCase();
    if (name === "x-frame-options") continue;
    if (name === "content-security-policy" && h.value) {
      const value = h.value
        .split(";")
        .filter((d) => !d.trim().toLowerCase().startsWith("frame-ancestors"))
        .join(";");
      if (value.trim()) headers.push({ name: h.name, value });
      continue;
    }
    headers.push(h);
  }
  return { responseHeaders: headers };
}

async function register() {
  const { origins = [] } = await browser.permissions.getAll();
  const urls = origins.filter((o) => /^(https?|\*):\/\//.test(o));

  if (current) {
    browser.webRequest.onHeadersReceived.removeListener(current);
    current = null;
  }
  if (navScript) {
    try {
      await navScript.unregister();
    } catch {}
    navScript = null;
  }
  if (!urls.length) return;

  current = allowEmbedding;
  browser.webRequest.onHeadersReceived.addListener(
    current,
    { urls, types: ["sub_frame"] },
    ["blocking", "responseHeaders"],
  );

  try {
    navScript = await browser.contentScripts.register({
      matches: urls,
      js: [{ file: "frame-nav.js" }],
      allFrames: true,
      runAt: "document_start",
    });
  } catch (err) {
    console.warn("Could not register frame-nav.js", err);
  }
}

// Serialise calls so quick permission changes cannot interleave.
const schedule = () => {
  queue = queue.then(register).catch((err) => console.error(err));
};

browser.permissions.onAdded.addListener(schedule);
browser.permissions.onRemoved.addListener(schedule);
schedule();

// Older versions stored a three-way "bar" setting (full / compact / hidden) and a hover
// value of "none". Convert them once to the independent compact / autohide / expand settings.
async function migrateSettings() {
  const s = await browser.storage.local.get(["bar", "hover"]);
  if (s.bar === undefined && s.hover !== "none") return;
  const patch = {};
  if (s.bar !== undefined) {
    patch.compact = s.bar === "compact";
    patch.autohide = s.bar === "hidden" ? "tabs" : "none";
  }
  if (s.hover === "none") {
    patch.hover = "overlay";
    patch.expand = false;
  }
  await browser.storage.local.set(patch);
  if (s.bar !== undefined) await browser.storage.local.remove("bar");
}
migrateSettings().catch((err) => console.error(err));
