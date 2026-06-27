/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Drift control module.
// Derives the whole chrome palette from a single background colour and applies
// it (plus accent, glass, density and layout flags) to the browser window from
// the drift.* prefs. Also builds the in-chrome settings popup (a Drift-styled
// overlay, not about:preferences) with a colour wheel and live controls.
"use strict";

const DRIFT_HTML_NS = "http://www.w3.org/1999/xhtml";

var DriftTheme = {
  PREFS: [
    "drift.bg.type",
    "drift.bg.color",
    "drift.bg.color2",
    "drift.bg.angle",
    "drift.bg.image",
    "drift.accent",
    "drift.glass",
    "drift.blur",
    "drift.compact",
    "drift.minimal",
    "drift.vtabs",
    "drift.centerUrl",
    "drift.acrylic",
    "drift.titlebarH",
  ],

  // Quick-pick background presets shown in the settings popup.
  BG_PRESETS: [
    { label: "Cream", type: "gradient", color: "#f4ead0", color2: "#e3d2ac" },
    { label: "Sky", type: "gradient", color: "#eef3f8", color2: "#dde7f0" },
    { label: "Roast", type: "gradient", color: "#2e2922", color2: "#1f1b16" },
    { label: "Midnight", type: "gradient", color: "#1b2238", color2: "#0f1424" },
    { label: "Slate", type: "gradient", color: "#262b34", color2: "#191d24" },
    { label: "Noir", type: "solid", color: "#0b0b0b", color2: "#0b0b0b" },
    { label: "Sage", type: "gradient", color: "#dde7d2", color2: "#c5d3b0" },
    { label: "Plum", type: "gradient", color: "#e7dcef", color2: "#d4c2e0" },
  ],

  ACCENT_PRESETS: [
    "#c2703d", "#7c8b5b", "#2f7e9e", "#8a5a8f", "#c25b72",
    "#bf8f2e", "#3f7d52", "#5b63c2", "#b8493f", "#2f9e8f",
    "#6b6257", "#3e8ed0", "#b34bb0",
  ],

  /* ---------- pref helpers ---------- */
  getStr(name, fb) {
    try { return Services.prefs.getStringPref(name, fb); } catch (e) { return fb; }
  },
  getInt(name, fb) {
    try { return Services.prefs.getIntPref(name, fb); } catch (e) { return fb; }
  },
  getBool(name, fb) {
    try { return Services.prefs.getBoolPref(name, fb); } catch (e) { return fb; }
  },
  setStr(name, v) { try { Services.prefs.setStringPref(name, v); } catch (e) {} },
  setInt(name, v) { try { Services.prefs.setIntPref(name, v); } catch (e) {} },
  setBool(name, v) { try { Services.prefs.setBoolPref(name, v); } catch (e) {} },

  /* ---------- colour maths ---------- */
  hexToRgb(hex) {
    let h = String(hex || "").replace("#", "").trim();
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    const n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) { return { r: 244, g: 234, b: 208 }; }
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  },
  rgbToHex(r, g, b) {
    const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
  },
  rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) { h = (g - b) / d + (g < b ? 6 : 0); }
      else if (max === g) { h = (b - r) / d + 2; }
      else { h = (r - g) / d + 4; }
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  },
  hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return this.rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  },
  luminance(hex) {
    const { r, g, b } = this.hexToRgb(hex);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  },
  rgba(hex, a) {
    const { r, g, b } = this.hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  },
  darken(hex, amount) {
    const hsl = (c => this.rgbToHsl(c.r, c.g, c.b))(this.hexToRgb(hex));
    return this.hslToHex(hsl.h, hsl.s, Math.max(0, hsl.l - amount * 100));
  },

  // Derive a full chrome palette from one background colour. Returns a map of
  // --drift-* custom property -> value. Chooses a light or dark scheme by the
  // base colour's luminance so text stays readable on any colour.
  derivePalette(baseHex) {
    const base = this.hexToRgb(baseHex);
    const hsl = this.rgbToHsl(base.r, base.g, base.b);
    const dark = this.luminance(baseHex) < 0.5;
    const h = hsl.h;
    const s = hsl.s;

    const p = {};
    p["--drift-cream-1"] = baseHex;
    p["--drift-cream-2"] = this.hslToHex(h, s, hsl.l + (dark ? 4 : -7));

    if (dark) {
      const surfaceL = Math.min(hsl.l + 8, 22);
      p["--drift-surface"] = this.rgba(this.hslToHex(h, Math.min(s, 25), surfaceL + 6), 0.55);
      p["--drift-surface-strong"] = this.rgba(this.hslToHex(h, Math.min(s, 25), surfaceL + 8), 0.9);
      p["--drift-surface-solid"] = this.hslToHex(h, Math.min(s, 22), surfaceL);
      p["--drift-hover"] = "rgba(255, 255, 255, 0.07)";
      p["--drift-active"] = "rgba(255, 255, 255, 0.13)";
      p["--drift-border"] = "rgba(255, 255, 255, 0.12)";
      p["--drift-border-light"] = "rgba(255, 255, 255, 0.16)";
      p["--drift-hairline"] = "rgba(255, 255, 255, 0.08)";
      p["--drift-text-1"] = this.hslToHex(h, Math.min(s, 18), 93);
      p["--drift-text-2"] = this.hslToHex(h, Math.min(s, 16), 72);
      p["--drift-text-3"] = this.hslToHex(h, Math.min(s, 14), 55);
      p["--drift-shadow-sm"] = "0 1px 3px rgba(0,0,0,0.4)";
      p["--drift-shadow-md"] = "0 6px 22px rgba(0,0,0,0.5)";
      p["--drift-inset-light"] = "inset 0 1px 0 rgba(255,255,255,0.06)";
      p["--drift-close-hover"] = "#c14a36";
    } else {
      p["--drift-surface"] = this.rgba(this.hslToHex(h, Math.min(s, 40), 99), 0.62);
      p["--drift-surface-strong"] = this.rgba(this.hslToHex(h, Math.min(s, 40), 99), 0.88);
      p["--drift-surface-solid"] = this.hslToHex(h, Math.min(s, 35), Math.min(hsl.l + 6, 97));
      p["--drift-hover"] = this.rgba(this.hslToHex(h, 40, 24), 0.08);
      p["--drift-active"] = this.rgba(this.hslToHex(h, 40, 24), 0.14);
      p["--drift-border"] = this.rgba(this.hslToHex(h, 30, 35), 0.18);
      p["--drift-border-light"] = "rgba(255, 255, 255, 0.7)";
      p["--drift-hairline"] = this.rgba(this.hslToHex(h, 30, 35), 0.1);
      p["--drift-text-1"] = this.hslToHex(h, Math.min(s, 30), 18);
      p["--drift-text-2"] = this.hslToHex(h, Math.min(s, 24), 42);
      p["--drift-text-3"] = this.hslToHex(h, Math.min(s, 20), 60);
      p["--drift-shadow-sm"] = "0 1px 3px rgba(80,60,35,0.10)";
      p["--drift-shadow-md"] = "0 6px 22px rgba(80,60,35,0.14)";
      p["--drift-inset-light"] = "inset 0 1px 0 rgba(255,255,255,0.65)";
      p["--drift-close-hover"] = "#e5573f";
    }
    return p;
  },

  // The toolbox background CSS value for the active background type.
  toolboxBackground() {
    const type = this.getStr("drift.bg.type", "gradient");
    const c1 = this.getStr("drift.bg.color", "#f4ead0");
    if (type === "image") {
      const img = this.getStr("drift.bg.image", "");
      if (img) {
        return `linear-gradient(${this.rgba(c1, 0.15)}, ${this.rgba(c1, 0.15)}), url("${CSS.escape ? img : img}") center/cover no-repeat`;
      }
    }
    if (type === "gradient") {
      const c2 = this.getStr("drift.bg.color2", "#e3d2ac");
      const angle = this.getInt("drift.bg.angle", 155);
      return `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;
    }
    return c1;
  },

  applyAccent(root) {
    const accent = this.getStr("drift.accent", "#c2703d");
    const dark = this.luminance(this.getStr("drift.bg.color", "#f4ead0")) < 0.5;
    root.style.setProperty("--drift-accent", accent);
    root.style.setProperty("--drift-accent-deep", this.darken(accent, 0.16));
    root.style.setProperty("--drift-accent-soft", this.rgba(accent, 0.13));
    root.style.setProperty("--drift-accent-ring", this.rgba(accent, dark ? 0.45 : 0.38));
  },

  apply() {
    const root = document.documentElement;
    if (!root) { return; }

    const palette = this.derivePalette(this.getStr("drift.bg.color", "#f4ead0"));
    for (const k in palette) { root.style.setProperty(k, palette[k]); }
    root.style.setProperty("--drift-toolbox-bg", this.toolboxBackground());

    this.applyAccent(root);

    let glass = this.getInt("drift.glass", 45);
    let blur = this.getInt("drift.blur", 20);
    root.style.setProperty("--drift-glass", (glass / 100).toString());
    root.style.setProperty("--drift-blur", blur + "px");

    const tbh = this.getInt("drift.titlebarH", 0);
    if (tbh > 0) { root.style.setProperty("--drift-titlebar-h", tbh + "px"); }
    else { root.style.removeProperty("--drift-titlebar-h"); }

    root.setAttribute("drift-mode", this.getBool("drift.minimal", false) ? "minimal" : "normal");

    const flag = (attr, name) => {
      if (this.getBool(name, false)) { root.setAttribute(attr, "true"); }
      else { root.removeAttribute(attr); }
    };
    flag("drift-vtabs", "drift.vtabs");
    flag("drift-center-url", "drift.centerUrl");
    flag("drift-acrylic", "drift.acrylic");

    // Compact density maps onto the native uidensity pref.
    try {
      const wantCompact = this.getBool("drift.compact", false);
      const cur = Services.prefs.getIntPref("browser.uidensity", 0);
      const target = wantCompact ? 1 : 0;
      if (cur !== target) { Services.prefs.setIntPref("browser.uidensity", target); }
    } catch (e) {}

    // Mirror vertical tabs onto Firefox's native implementation.
    try {
      const v = this.getBool("drift.vtabs", false);
      if (Services.prefs.getBoolPref("sidebar.verticalTabs", false) !== v) {
        Services.prefs.setBoolPref("sidebar.verticalTabs", v);
      }
    } catch (e) {}
  },

  observe() { this.apply(); },

  init() {
    this.apply();
    for (const p of this.PREFS) { Services.prefs.addObserver(p, this); }
    window.addEventListener("unload", () => {
      for (const p of this.PREFS) {
        try { Services.prefs.removeObserver(p, this); } catch (e) {}
      }
    }, { once: true });

    window.addEventListener("DOMContentLoaded", () => DriftSettings.installEntryPoints(), { once: true });
  },
};

DriftTheme.init();
