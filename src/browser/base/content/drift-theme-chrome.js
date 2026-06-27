/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Drift chrome theme engine.
// Reads drift.* prefs and applies them to the browser window root as a
// `drift-theme` attribute plus inline CSS custom properties, so drift-theme.css
// can react to the active theme, accent, glass level and layout mode. Pref
// changes are observed and re-applied live without a restart.
"use strict";

var DriftTheme = {
  // Themes that resolve to a dark palette (used to pick accent light/dark variants).
  DARK_THEMES: new Set(["dark", "midnight", "slate", "noir"]),

  // Accent presets ported verbatim from the Electron Drift browser. Each has a
  // light and dark variant; the variant is chosen by the active theme.
  ACCENTS: {
    terracotta: { light: "#c2703d", dark: "#e2914f" },
    sage: { light: "#7c8b5b", dark: "#9caf74" },
    ocean: { light: "#2f7e9e", dark: "#56b0cf" },
    plum: { light: "#8a5a8f", dark: "#b585ba" },
    rose: { light: "#c25b72", dark: "#e58198" },
    amber: { light: "#bf8f2e", dark: "#e3b34f" },
    forest: { light: "#3f7d52", dark: "#5fa877" },
    indigo: { light: "#5b63c2", dark: "#868ee6" },
    crimson: { light: "#b8493f", dark: "#e0695c" },
    teal: { light: "#2f9e8f", dark: "#52c6b6" },
    cocoa: { light: "#8a5a3c", dark: "#c2895a" },
    graphite: { light: "#6b6257", dark: "#b8ab95" },
    sky: { light: "#3e8ed0", dark: "#6cb6ec" },
    fuchsia: { light: "#b34bb0", dark: "#d97ad6" },
  },

  PREFS: [
    "drift.theme",
    "drift.accent",
    "drift.accentMode",
    "drift.accentCustom",
    "drift.glass",
    "drift.blur",
    "drift.mode",
    "drift.titlebarH",
    "drift.vtabs",
    "drift.compact",
    "drift.centerUrl",
    "drift.acrylic",
  ],

  getPref(name, fallback) {
    try {
      switch (Services.prefs.getPrefType(name)) {
        case Services.prefs.PREF_STRING:
          return Services.prefs.getStringPref(name);
        case Services.prefs.PREF_INT:
          return Services.prefs.getIntPref(name);
        case Services.prefs.PREF_BOOL:
          return Services.prefs.getBoolPref(name);
        default:
          return fallback;
      }
    } catch (e) {
      return fallback;
    }
  },

  hexToRgb(hex) {
    let h = String(hex).replace("#", "").trim();
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    const n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) {
      return null;
    }
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  },

  // Darken a hex colour toward black by `amount` (0..1) for the -deep accent.
  darken(hex, amount) {
    const c = this.hexToRgb(hex);
    if (!c) {
      return hex;
    }
    const f = 1 - amount;
    const to2 = v => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0");
    return "#" + to2(c.r) + to2(c.g) + to2(c.b);
  },

  rgba(hex, alpha) {
    const c = this.hexToRgb(hex);
    if (!c) {
      return hex;
    }
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
  },

  resolveAccent(theme) {
    const isDark = this.DARK_THEMES.has(theme);
    const mode = this.getPref("drift.accentMode", "preset");
    if (mode === "custom") {
      const custom = this.getPref("drift.accentCustom", "");
      if (this.hexToRgb(custom)) {
        return custom;
      }
    }
    const presetId = this.getPref("drift.accent", "terracotta");
    const preset = this.ACCENTS[presetId] || this.ACCENTS.terracotta;
    return isDark ? preset.dark : preset.light;
  },

  apply() {
    const root = document.documentElement;
    if (!root) {
      return;
    }

    const theme = this.getPref("drift.theme", "light");
    const mode = this.getPref("drift.mode", "normal");

    root.setAttribute("drift-theme", theme);
    root.setAttribute("drift-mode", mode);

    // Layout flags as boolean attributes.
    const setFlag = (attr, prefName) => {
      if (this.getPref(prefName, false)) {
        root.setAttribute(attr, "true");
      } else {
        root.removeAttribute(attr);
      }
    };
    setFlag("drift-vtabs", "drift.vtabs");
    setFlag("drift-compact", "drift.compact");
    setFlag("drift-center-url", "drift.centerUrl");
    setFlag("drift-acrylic", "drift.acrylic");

    // Mirror the Drift vertical-tabs flag into Firefox's native vertical tabs
    // so we reuse the engine's implementation and just restyle it.
    const wantVtabs = !!this.getPref("drift.vtabs", false);
    try {
      if (Services.prefs.getBoolPref("sidebar.verticalTabs", false) !== wantVtabs) {
        Services.prefs.setBoolPref("sidebar.verticalTabs", wantVtabs);
      }
    } catch (e) {}

    // Accent: resolve to a hex then derive deep / soft / ring.
    const accent = this.resolveAccent(theme);
    root.style.setProperty("--drift-accent", accent);
    root.style.setProperty("--drift-accent-deep", this.darken(accent, 0.16));
    root.style.setProperty("--drift-accent-soft", this.rgba(accent, 0.13));
    root.style.setProperty("--drift-accent-ring", this.rgba(accent, this.DARK_THEMES.has(theme) ? 0.45 : 0.38));

    // Glass translucency (20..95 -> 0.20..0.95) and frost blur (px).
    // Lite mode is deliberately fully opaque with no frost for performance.
    let glass = parseInt(this.getPref("drift.glass", 45), 10);
    if (isNaN(glass)) {
      glass = 45;
    }
    let blur = parseInt(this.getPref("drift.blur", 20), 10);
    if (isNaN(blur)) {
      blur = 20;
    }
    if (mode === "lite") {
      glass = 100;
      blur = 0;
    }
    root.style.setProperty("--drift-glass", (glass / 100).toString());
    root.style.setProperty("--drift-blur", blur + "px");

    let tbh = parseInt(this.getPref("drift.titlebarH", 0), 10);
    if (!isNaN(tbh) && tbh > 0) {
      root.style.setProperty("--drift-titlebar-h", tbh + "px");
    } else {
      root.style.removeProperty("--drift-titlebar-h");
    }
  },

  observe() {
    this.apply();
  },

  init() {
    // Apply as early as possible to minimise flash of the default theme.
    this.apply();
    for (const p of this.PREFS) {
      Services.prefs.addObserver(p, this);
    }
    window.addEventListener(
      "unload",
      () => {
        for (const p of this.PREFS) {
          try {
            Services.prefs.removeObserver(p, this);
          } catch (e) {}
        }
      },
      { once: true }
    );
  },
};

DriftTheme.init();
