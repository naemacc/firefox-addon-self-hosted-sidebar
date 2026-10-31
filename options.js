const DEFAULTS = {
  layout: "vertical",
  placement: "left",
  compact: false,
  autohide: false,
  expand: true,
  hover: "overlay",
  display: "both",
  size: "medium",
  essBox: "all",
  showToggle: true,
  showBack: true,
  showForward: true,
};
const form = document.getElementById("f");
const $ = (id) => document.getElementById(id);
const radios = (name) => [...form.querySelectorAll(`input[name="${name}"]`)];

async function load() {
  const s = await browser.storage.local.get([...Object.keys(DEFAULTS), "bar"]);
  const v = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (s[k] !== undefined) v[k] = s[k];
  // older versions (until background.js migrates them)
  if (s.bar !== undefined) {
    v.compact = s.bar === "compact";
    v.autohide = s.bar === "hidden";
  }
  if (s.hover === "none") {
    v.hover = "overlay";
    if (s.expand === undefined) v.expand = false;
  }

  for (const k of ["layout", "placement", "hover", "display", "size", "essBox"])
    for (const r of radios(k)) r.checked = r.value === v[k];
  for (const k of ["compact", "expand", "autohide", "showToggle", "showBack", "showForward"]) form.elements[k].checked = v[k] === true;

  // Only offer controls that change something for the current combination.
  const horiz = v.layout === "horizontal";
  $("fsPlacement").disabled = horiz;
  form.elements.compact.disabled = horiz;
  form.elements.expand.disabled = horiz || !v.compact;
  $("fsHover").disabled = !(v.autohide || (!horiz && v.compact && v.expand));
}

form.addEventListener("change", (e) => {
  const t = e.target;
  if (t.type === "radio") browser.storage.local.set({ [t.name]: t.value });
  else if (t.type === "checkbox") browser.storage.local.set({ [t.name]: t.checked });
});

browser.storage.onChanged.addListener((_c, area) => {
  if (area === "local") load();
});

load();
