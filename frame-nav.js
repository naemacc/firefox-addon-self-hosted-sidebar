// Runs inside pages framed by the sidebar (registered by background.js for
// hosts the user granted). It stays idle until the sidebar page sends a
// "hello" message, so it does nothing in normal tabs or in other sites' frames.
//
// It reports whether Back/Forward are possible (using the Navigation API when
// the browser has it) and performs back/forward when asked.
(() => {
  "use strict";
  if (window === window.top) return;

  const EXT = browser.runtime.getURL("").replace(/\/$/, ""); // moz-extension://<uuid>
  let id = null;
  let last = "";
  let timer = null;

  function snapshot() {
    const nav = window.navigation;
    const native = !!nav && typeof nav.canGoBack === "boolean";
    let index = -1;
    let length = 0;
    if (native) {
      try {
        index = nav.currentEntry ? nav.currentEntry.index : -1;
        length = nav.entries().length;
      } catch {}
    }
    return {
      native,
      canBack: native && nav.canGoBack === true,
      canForward: native && nav.canGoForward === true,
      index,
      length,
      url: location.href,
    };
  }

  function report(force) {
    if (!id) return;
    const s = snapshot();
    const sig = JSON.stringify(s);
    if (force !== true && sig === last) return;
    last = sig;
    // targetOrigin limits delivery to our own sidebar page.
    window.parent.postMessage({ ssb: "nav", id, ...s }, EXT);
  }

  function step(dir) {
    const nav = window.navigation;
    if (!nav) return;
    try {
      const r = dir === "back" ? nav.canGoBack && nav.back() : nav.canGoForward && nav.forward();
      if (r) {
        r.committed?.catch(() => {});
        r.finished?.catch(() => {});
      }
    } catch {}
    setTimeout(report, 150);
  }

  window.addEventListener("message", (e) => {
    if (e.origin !== EXT) return; // only our sidebar page may talk to us
    const m = e.data;
    if (!m || typeof m !== "object") return;

    if (m.ssb === "hello" && typeof m.id === "string") {
      id = m.id;
      report(true);
      if (!timer) {
        timer = setInterval(report, 400);
        window.navigation?.addEventListener?.("currententrychange", () => report());
      }
    } else if (m.ssb === "back" || m.ssb === "forward") {
      step(m.ssb);
    }
  });
})();
