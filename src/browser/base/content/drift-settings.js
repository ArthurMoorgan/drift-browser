/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Drift settings popup: an in-chrome overlay (not about:preferences) styled to
// match Drift, with a colour wheel for the background + accent, background type
// (solid / gradient / image), glass, density, layout and privacy controls.
// All controls are bound directly to drift.* (and a few native) prefs, so the
// theme engine re-applies live as they change.
"use strict";

var DriftSettings = {
  _overlay: null,
  _origOpenPreferences: null,

  el(tag, cls, attrs) {
    const n = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (cls) { n.className = cls; }
    if (attrs) { for (const k in attrs) { n.setAttribute(k, attrs[k]); } }
    return n;
  },

  /* ---------- colour wheel ---------- */
  hsvToHex(h, s, v) {
    h = ((h % 360) + 360) % 360; s /= 100; v /= 100;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return DriftTheme.rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  },

  createColorWheel(initialHex, onChange) {
    const wrap = this.el("div", "ds-wheel-wrap");
    const size = 168;
    const canvas = this.el("canvas", "ds-wheel");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    const cx = size / 2, cy = size / 2, r = size / 2 - 2;

    const grad = ctx.createConicGradient(-Math.PI / 2, cx, cy);
    for (let i = 0; i <= 360; i += 2) { grad.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`); }
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, "#fff"); rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

    const start = DriftTheme.rgbToHsl(...Object.values(DriftTheme.hexToRgb(initialHex)).slice(0, 3));
    const state = { h: start.h, s: start.s, v: Math.min(100, start.l + start.s / 2) };

    const valSlider = this.el("input", "ds-value", { type: "range", min: "0", max: "100" });
    valSlider.value = String(Math.round(state.v));
    const hexInput = this.el("input", "ds-hex", { type: "text", spellcheck: "false", maxlength: "7" });
    const preview = this.el("div", "ds-preview");

    const emit = () => {
      const hex = this.hsvToHex(state.h, state.s, state.v);
      hexInput.value = hex;
      preview.style.background = hex;
      if (onChange) { onChange(hex); }
    };

    const pick = e => {
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - rect.left - cx, dy = e.clientY - rect.top - cy;
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), r);
      state.h = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
      state.s = (dist / r) * 100;
      emit();
    };
    let dragging = false;
    canvas.addEventListener("pointerdown", e => { dragging = true; canvas.setPointerCapture(e.pointerId); pick(e); });
    canvas.addEventListener("pointermove", e => { if (dragging) { pick(e); } });
    canvas.addEventListener("pointerup", () => { dragging = false; });
    valSlider.addEventListener("input", () => { state.v = parseInt(valSlider.value, 10); emit(); });
    hexInput.addEventListener("change", () => {
      const c = DriftTheme.hexToRgb(hexInput.value);
      const hsl = DriftTheme.rgbToHsl(c.r, c.g, c.b);
      state.h = hsl.h; state.s = hsl.s; state.v = Math.min(100, hsl.l + hsl.s / 2);
      valSlider.value = String(Math.round(state.v));
      emit();
    });

    const controls = this.el("div", "ds-wheel-controls");
    controls.append(preview, hexInput);
    wrap.append(canvas, valSlider, controls);
    hexInput.value = initialHex; preview.style.background = initialHex;
    return wrap;
  },

  /* ---------- control builders ---------- */
  section(id, title) {
    const sec = this.el("div", "ds-section", { "data-sec": id });
    const h = this.el("h2", "ds-h"); h.textContent = title;
    sec.appendChild(h);
    return sec;
  },
  row(labelText, control) {
    const r = this.el("label", "ds-row");
    const s = this.el("span", "ds-label"); s.textContent = labelText;
    r.append(s, control);
    return r;
  },
  toggle(get, set) {
    const cb = this.el("input", "ds-toggle", { type: "checkbox" });
    cb.checked = !!get();
    cb.addEventListener("change", () => set(cb.checked));
    return cb;
  },
  slider(get, set, min, max, step) {
    const s = this.el("input", "ds-slider", { type: "range", min: String(min), max: String(max), step: String(step || 1) });
    s.value = String(get());
    s.addEventListener("input", () => set(parseInt(s.value, 10)));
    return s;
  },
  select(options, get, set) {
    const sel = this.el("select", "ds-select");
    options.forEach(o => {
      const opt = this.el("option"); opt.value = o.value; opt.textContent = o.label;
      if (o.value === get()) { opt.selected = true; }
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => set(sel.value));
    return sel;
  },

  /* ---------- build the overlay ---------- */
  build() {
    if (this._overlay) { return; }
    const T = DriftTheme;

    const overlay = this.el("div", "drift-settings", { hidden: "true" });
    const backdrop = this.el("div", "ds-backdrop");
    backdrop.addEventListener("click", () => this.close());
    const card = this.el("div", "ds-card");

    const head = this.el("div", "ds-head");
    const title = this.el("div", "ds-title"); title.textContent = "Drift Settings";
    const closeBtn = this.el("button", "ds-close"); closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => this.close());
    head.append(title, closeBtn);

    const body = this.el("div", "ds-body");
    const nav = this.el("div", "ds-nav");
    const content = this.el("div", "ds-content");

    const sections = {};
    const navBtns = {};
    const addNav = (id, label) => {
      const b = this.el("button", "ds-navbtn"); b.textContent = label;
      b.addEventListener("click", () => this.showSection(id));
      nav.appendChild(b); navBtns[id] = b;
    };
    ["appearance", "layout", "browsing", "privacy", "about"].forEach(id => {
      addNav(id, id.charAt(0).toUpperCase() + id.slice(1));
    });
    this._navBtns = navBtns; this._sections = sections;

    /* --- Appearance --- */
    const ap = this.section("appearance", "Appearance");
    ap.appendChild(this.el("div", "ds-sublabel")).textContent = "Background";
    const bgTypeRow = this.row("Background type", this.select(
      [{ value: "solid", label: "Solid colour" }, { value: "gradient", label: "Gradient" }, { value: "image", label: "Image" }],
      () => T.getStr("drift.bg.type", "gradient"), v => T.setStr("drift.bg.type", v)
    ));
    ap.appendChild(bgTypeRow);

    ap.appendChild(this.el("div", "ds-sublabel")).textContent = "Background colour";
    ap.appendChild(this.createColorWheel(T.getStr("drift.bg.color", "#f4ead0"), hex => T.setStr("drift.bg.color", hex)));
    const presetRow = this.el("div", "ds-swatches");
    T.BG_PRESETS.forEach(p => {
      const sw = this.el("button", "ds-swatch");
      sw.style.background = p.type === "gradient" ? `linear-gradient(135deg, ${p.color}, ${p.color2})` : p.color;
      sw.title = p.label;
      sw.addEventListener("click", () => {
        T.setStr("drift.bg.type", p.type); T.setStr("drift.bg.color", p.color); T.setStr("drift.bg.color2", p.color2);
        this.refresh();
      });
      presetRow.appendChild(sw);
    });
    ap.appendChild(presetRow);

    ap.appendChild(this.el("div", "ds-sublabel")).textContent = "Gradient second colour";
    ap.appendChild(this.createColorWheel(T.getStr("drift.bg.color2", "#e3d2ac"), hex => T.setStr("drift.bg.color2", hex)));
    ap.appendChild(this.row("Gradient angle", this.slider(() => T.getInt("drift.bg.angle", 155), v => T.setInt("drift.bg.angle", v), 0, 360, 5)));

    const imgRow = this.el("label", "ds-row");
    const imgLabel = this.el("span", "ds-label"); imgLabel.textContent = "Background image";
    const imgBtn = this.el("span", "ds-linkbtn"); imgBtn.textContent = "Choose image…";
    const imgInput = this.el("input", "ds-file", { type: "file", accept: "image/*" });
    imgInput.addEventListener("change", () => {
      const f = imgInput.files && imgInput.files[0]; if (!f) { return; }
      const reader = new FileReader();
      reader.onload = () => { T.setStr("drift.bg.image", String(reader.result)); T.setStr("drift.bg.type", "image"); this.refresh(); };
      reader.readAsDataURL(f);
    });
    imgRow.append(imgLabel, imgBtn, imgInput);
    ap.appendChild(imgRow);
    const clrImg = this.el("span", "ds-linkbtn ds-muted"); clrImg.textContent = "Clear image";
    clrImg.addEventListener("click", () => { T.setStr("drift.bg.image", ""); });
    ap.appendChild(clrImg);

    ap.appendChild(this.el("div", "ds-sublabel")).textContent = "Accent colour";
    ap.appendChild(this.createColorWheel(T.getStr("drift.accent", "#c2703d"), hex => T.setStr("drift.accent", hex)));
    const accentRow = this.el("div", "ds-swatches");
    T.ACCENT_PRESETS.forEach(c => {
      const sw = this.el("button", "ds-swatch"); sw.style.background = c; sw.title = c;
      sw.addEventListener("click", () => { T.setStr("drift.accent", c); this.refresh(); });
      accentRow.appendChild(sw);
    });
    ap.appendChild(accentRow);

    ap.appendChild(this.el("div", "ds-sublabel")).textContent = "Glass & frost";
    ap.appendChild(this.row("Translucency", this.slider(() => T.getInt("drift.glass", 45), v => T.setInt("drift.glass", v), 20, 100, 1)));
    ap.appendChild(this.row("Frost blur", this.slider(() => T.getInt("drift.blur", 20), v => T.setInt("drift.blur", v), 0, 40, 1)));
    ap.appendChild(this.row("Top bar height", this.slider(() => { const v = T.getInt("drift.titlebarH", 0); return v || 34; }, v => T.setInt("drift.titlebarH", v), 28, 52, 1)));
    sections.appearance = ap; content.appendChild(ap);

    /* --- Layout --- */
    const ly = this.section("layout", "Layout");
    ly.appendChild(this.row("Compact density", this.toggle(() => T.getBool("drift.compact", false), v => T.setBool("drift.compact", v))));
    ly.appendChild(this.row("Minimal chrome", this.toggle(() => T.getBool("drift.minimal", false), v => T.setBool("drift.minimal", v))));
    ly.appendChild(this.row("Vertical tabs", this.toggle(() => T.getBool("drift.vtabs", false), v => T.setBool("drift.vtabs", v))));
    ly.appendChild(this.row("Centre the address bar", this.toggle(() => T.getBool("drift.centerUrl", false), v => T.setBool("drift.centerUrl", v))));
    const splitRow = this.el("div", "ds-row");
    const splitLbl = this.el("span", "ds-label"); splitLbl.textContent = "Split view";
    const splitBtn = this.el("button", "ds-btn"); splitBtn.textContent = "Toggle split view";
    splitBtn.addEventListener("click", () => { if (window.DriftSplit) { window.DriftSplit.toggle(); } this.close(); });
    splitRow.append(splitLbl, splitBtn);
    ly.appendChild(splitRow);
    sections.layout = ly; content.appendChild(ly);

    /* --- Browsing --- */
    const br = this.section("browsing", "Browsing");
    br.appendChild(this.row("Show bookmarks bar", this.toggle(
      () => T.getStr("browser.toolbars.bookmarks.visibility", "never") !== "never",
      v => T.setStr("browser.toolbars.bookmarks.visibility", v ? "always" : "never")
    )));
    br.appendChild(this.row("Force dark on websites", this.toggle(
      () => T.getInt("layout.css.prefers-color-scheme.content-override", 2) === 0,
      v => T.setInt("layout.css.prefers-color-scheme.content-override", v ? 0 : 2)
    )));
    br.appendChild(this.row("Interface animations", this.toggle(
      () => T.getBool("toolkit.cosmeticAnimations.enabled", true),
      v => T.setBool("toolkit.cosmeticAnimations.enabled", v)
    )));
    br.appendChild(this.row("Unload inactive tabs", this.toggle(
      () => T.getBool("browser.tabs.unloadOnLowMemory", true),
      v => T.setBool("browser.tabs.unloadOnLowMemory", v)
    )));
    sections.browsing = br; content.appendChild(br);

    /* --- Privacy --- */
    const pv = this.section("privacy", "Privacy");
    pv.appendChild(this.row("Global Privacy Control", this.toggle(
      () => T.getBool("privacy.globalprivacycontrol.enabled", false),
      v => T.setBool("privacy.globalprivacycontrol.enabled", v)
    )));
    pv.appendChild(this.row("Clear history on exit", this.toggle(
      () => T.getBool("privacy.sanitize.sanitizeOnShutdown", false) && T.getBool("privacy.clearOnShutdown_v2.historyFormDataAndDownloads", false),
      v => { T.setBool("privacy.sanitize.sanitizeOnShutdown", v); T.setBool("privacy.clearOnShutdown_v2.historyFormDataAndDownloads", v); }
    )));
    pv.appendChild(this.row("Clear cookies on exit", this.toggle(
      () => T.getBool("privacy.sanitize.sanitizeOnShutdown", false) && T.getBool("privacy.clearOnShutdown_v2.cookiesAndStorage", false),
      v => { if (v) { T.setBool("privacy.sanitize.sanitizeOnShutdown", true); } T.setBool("privacy.clearOnShutdown_v2.cookiesAndStorage", v); }
    )));
    const note = this.el("div", "ds-note"); note.textContent = "Ad & tracker blocking is provided by the built-in uBlock Origin.";
    pv.appendChild(note);
    sections.privacy = pv; content.appendChild(pv);

    /* --- About --- */
    const ab = this.section("about", "About Drift");
    const logo = this.el("div", "ds-about-logo"); logo.textContent = "Drift";
    const ver = this.el("div", "ds-about-ver"); ver.textContent = "A calm, customisable browser built on Firefox.";
    ab.append(logo, ver);
    const adv = this.el("button", "ds-btn"); adv.textContent = "Advanced settings…";
    adv.addEventListener("click", () => { this.close(); if (this._origOpenPreferences) { this._origOpenPreferences.call(window); } });
    ab.appendChild(adv);
    sections.about = ab; content.appendChild(ab);

    body.append(nav, content);
    card.append(head, body);
    overlay.append(backdrop, card);
    document.documentElement.appendChild(overlay);
    this._overlay = overlay;
    this.showSection("appearance");
  },

  showSection(id) {
    for (const k in this._sections) {
      this._sections[k].toggleAttribute("hidden", k !== id);
      this._navBtns[k].classList.toggle("active", k === id);
    }
  },

  // Rebuild the overlay to reflect prefs changed elsewhere (presets, swatches).
  refresh() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
      this.build();
      this.open();
    }
  },

  open() { this.build(); this._overlay.removeAttribute("hidden"); },
  close() { if (this._overlay) { this._overlay.setAttribute("hidden", "true"); } },
  toggle() { if (this._overlay && !this._overlay.hasAttribute("hidden")) { this.close(); } else { this.open(); } },

  installEntryPoints() {
    try {
      if (typeof window.openPreferences === "function" && !this._origOpenPreferences) {
        this._origOpenPreferences = window.openPreferences;
        window.openPreferences = () => this.open();
      }
    } catch (e) {}
    window.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); this.toggle(); }
      else if (e.key === "Escape" && this._overlay && !this._overlay.hasAttribute("hidden")) { this.close(); }
    });
  },
};
