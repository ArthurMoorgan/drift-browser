/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Drift split view (experimental, Zen/Vivaldi-style tiling).
// Tiles the selected tab's browser next to one other tab's browser, side by
// side, by laying out the tab panels in a row and keeping both docshells
// active. Opt-in only and fully guarded: any failure cleanly no-ops so normal
// browsing is never affected.
"use strict";

var DriftSplit = {
  active: false,
  _second: null,

  panels() {
    try { return window.gBrowser && (window.gBrowser.tabpanels || document.getElementById("tabbrowser-tabpanels")); }
    catch (e) { return null; }
  },

  toggle() { if (this.active) { this.off(); } else { this.on(); } },

  on() {
    try {
      const gb = window.gBrowser;
      const panels = this.panels();
      if (!gb || !panels) { return; }

      if (gb.tabs.length < 2) {
        gb.addTab("about:newtab", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      }
      const sel = gb.selectedBrowser;
      const others = gb.browsers.filter(b => b && b !== sel);
      const second = others[others.length - 1];
      if (!second) { return; }
      this._second = second;

      // Keep both render layers live so the second pane isn't blanked.
      try { second.docShellIsActive = true; } catch (e) {}
      try { sel.docShellIsActive = true; } catch (e) {}

      // Tag the two browsers' containing panels so CSS can tile them.
      const panelOf = b => {
        let n = b;
        while (n && n.parentElement !== panels) { n = n.parentElement; }
        return n;
      };
      const p1 = panelOf(sel), p2 = panelOf(second);
      if (p1) { p1.setAttribute("drift-split-pane", "true"); }
      if (p2) { p2.setAttribute("drift-split-pane", "true"); }
      panels.setAttribute("drift-split", "true");
      this.active = true;
    } catch (e) {
      this.active = false;
    }
  },

  off() {
    try {
      const panels = this.panels();
      if (panels) {
        panels.removeAttribute("drift-split");
        for (const n of [...panels.querySelectorAll("[drift-split-pane]")]) {
          n.removeAttribute("drift-split-pane");
        }
      }
      if (this._second) {
        try { this._second.docShellIsActive = this._second === window.gBrowser.selectedBrowser; } catch (e) {}
      }
    } catch (e) {}
    this._second = null;
    this.active = false;
  },
};

window.DriftSplit = DriftSplit;
