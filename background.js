// Lets the sidebar embed pages from hosts the user has granted access to.
//
// For those hosts only, and only for frames loaded inside this extension's own
// sidebar, it removes X-Frame-Options and the frame-ancestors part of any
// Content-Security-Policy. Hosts are granted one at a time through
// browser.permissions.request() when the user adds or edits a tab.

const EXT_BASE = browser.runtime.getURL("");
let current = null;

function allowEmbedding(details) {
  // Leave frames alone unless the top of the frame tree is our own sidebar page.
  const chain = details.frameAncestors;
  const top = chain && chain.length ? chain[chain.length - 1].url : details.documentUrl;
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
  if (current) {
    browser.webRequest.onHeadersReceived.removeListener(current);
    current = null;
  }
  const { origins = [] } = await browser.permissions.getAll();
  const urls = origins.filter((o) => /^(https?|\*):\/\//.test(o));
  if (!urls.length) return;
  current = allowEmbedding;
  browser.webRequest.onHeadersReceived.addListener(
    current,
    { urls, types: ["sub_frame"] },
    ["blocking", "responseHeaders"]
  );
}

browser.permissions.onAdded.addListener(register);
browser.permissions.onRemoved.addListener(register);
register();
