(function () {
  'use strict';

  /* ─── Palette data ─── */
  var THEMES = [
    { id: 'light',    bg: ['#f8f2e4', '#efe4cf'] },
    { id: 'sepia',    bg: ['#efe2c6', '#e3d2ac'] },
    { id: 'arctic',   bg: ['#eef3f8', '#dde7f0'] },
    { id: 'dark',     bg: ['#2a2520', '#1f1b16'] },
    { id: 'midnight', bg: ['#161d33', '#0f1424'] },
    { id: 'slate',    bg: ['#222730', '#191d24'] },
    { id: 'noir',     bg: ['#000000', '#0a0a0a'] },
  ];
  var PRESETS = [
    { id: 'terracotta', color: '#c2703d', dark: '#e2914f' },
    { id: 'sage',       color: '#7c8b5b', dark: '#9caf74' },
    { id: 'ocean',      color: '#2f7e9e', dark: '#56b0cf' },
    { id: 'plum',       color: '#8a5a8f', dark: '#b585ba' },
    { id: 'rose',       color: '#c25b72', dark: '#e58198' },
    { id: 'amber',      color: '#bf8f2e', dark: '#e3b34f' },
    { id: 'forest',     color: '#3f7d52', dark: '#5fa877' },
    { id: 'indigo',     color: '#5b63c2', dark: '#868ee6' },
    { id: 'crimson',    color: '#b8493f', dark: '#e0695c' },
    { id: 'teal',       color: '#2f9e8f', dark: '#52c6b6' },
    { id: 'cocoa',      color: '#8a5a3c', dark: '#c2895a' },
    { id: 'graphite',   color: '#6b6257', dark: '#b8ab95' },
  ];
  var DARK_THEMES = ['dark', 'midnight', 'slate', 'noir'];
  var SEARCH_ENGINES = {
    google:     'https://www.google.com/search?q=',
    bing:       'https://www.bing.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    brave:      'https://search.brave.com/search?q=',
    startpage:  'https://www.startpage.com/sp/search?query=',
    ecosia:     'https://www.ecosia.org/search?q=',
  };
  var ENGINE_LABELS = {
    google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo',
    brave: 'Brave', startpage: 'Startpage', ecosia: 'Ecosia',
  };
  // New-tab background presets (chrome:// assets bundled via jar.inc.mn).
  var BACKGROUNDS = [
    { id: 'none',       label: 'None' },
    { id: 'cream',      label: 'Drift' },
    { id: 'terracotta', label: 'Terracotta' },
    { id: 'sage',       label: 'Sage' },
    { id: 'ocean',      label: 'Ocean' },
    { id: 'plum',       label: 'Plum' },
    { id: 'dusk',       label: 'Dusk' },
  ];
  function bgUrl(id) { return 'chrome://browser/skin/drift-backgrounds/' + id + '.svg'; }

  /* ─── Persistence ─── */
  function lsGet(k, fallback) {
    try { var v = localStorage.getItem(k); return v !== null ? v : fallback; } catch (e) { return fallback; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsGetJSON(k, fallback) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v !== null ? v : fallback; } catch (e) { return fallback; }
  }
  function lsSetJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ─── Theme & accent ─── */
  var curTheme  = lsGet('drift.theme',  'light');
  var curPreset = lsGet('drift.preset', 'terracotta');
  if (!THEMES.some(function (t) { return t.id === curTheme; }))  curTheme  = 'light';
  if (!PRESETS.some(function (p) { return p.id === curPreset; })) curPreset = 'terracotta';

  function isDark() { return DARK_THEMES.indexOf(curTheme) >= 0; }

  function darken(hex, amount) {
    var n = parseInt(hex.replace('#', ''), 16);
    var r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)));
    var g = Math.max(0, Math.round(((n >> 8)  & 0xff) * (1 - amount)));
    var b = Math.max(0, Math.round(( n        & 0xff) * (1 - amount)));
    return '#' + [r, g, b].map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  function applyTheme() {
    var de = document.documentElement;
    de.dataset.theme = curTheme;
    var preset = PRESETS.filter(function (p) { return p.id === curPreset; })[0] || PRESETS[0];
    var accent = isDark() ? preset.dark : preset.color;
    de.style.setProperty('--accent', accent);
    de.style.setProperty('--accent-deep', darken(accent, isDark() ? 0.12 : 0.16));
  }

  applyTheme();

  /* ─── Background ─── */
  var curBg = lsGet('drift.bg', 'none');

  function applyBackground() {
    var de = document.documentElement;
    var body = document.body;
    var src = null;
    if (curBg === 'custom') {
      src = lsGet('drift.bgCustom', '') || null;
    } else if (curBg && curBg !== 'none') {
      src = bgUrl(curBg);
    }
    if (src) {
      body.style.backgroundImage =
        'linear-gradient(var(--bg-scrim), var(--bg-scrim)), url("' + src + '")';
      body.style.backgroundSize = 'cover';
      body.style.backgroundPosition = 'center';
      body.style.backgroundAttachment = 'fixed';
      de.style.setProperty('--blob-op', '0');
    } else {
      body.style.backgroundImage = '';
      body.style.backgroundSize = '';
      de.style.removeProperty('--blob-op');
    }
  }
  if (document.body) {
    applyBackground();
  } else {
    document.addEventListener('DOMContentLoaded', applyBackground);
  }

  /* ─── Clock ─── */
  function pad(n) { return String(n).padStart(2, '0'); }
  function tick() {
    var now = new Date();
    var timeEl = document.getElementById('time');
    var dateEl = document.getElementById('date');
    var greetEl = document.getElementById('greeting');
    if (timeEl) timeEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
    if (dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    if (greetEl) {
      var h = now.getHours();
      greetEl.textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    }
  }
  tick();
  setInterval(tick, 20000);

  /* ─── Search ─── */
  function toURL(input) {
    var q = (input || '').trim();
    if (!q) return null;
    if (/^(https?|file|data|about):/i.test(q)) return q;
    if (/^localhost(:\d+)?(\/.*)?$/i.test(q)) return 'http://' + q;
    if (!/\s/.test(q) && /^[^\s]+\.[a-z]{2,}([:/?#].*)?$/i.test(q)) return 'https://' + q;
    var se = lsGet('drift.se', 'google');
    return (SEARCH_ENGINES[se] || SEARCH_ENGINES.google) + encodeURIComponent(q);
  }

  var searchForm = document.getElementById('searchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var url = toURL(document.getElementById('q').value);
      if (url) window.location.href = url;
    });
    var inp = document.getElementById('q');
    if (inp) inp.focus();
  }

  /* ─── Quick links dock ─── */
  var linksEl = document.getElementById('links');

  function loadDock() { return lsGetJSON('drift.dock', []); }
  function saveDock(list) { lsSetJSON('drift.dock', list); }

  function dockHost(u) { try { return new URL(u).hostname; } catch (e) { return ''; } }
  function dockName(u) { var h = dockHost(u).replace(/^www\./, ''); return h ? h.charAt(0).toUpperCase() + h.slice(1).replace(/\..*$/, '') : u; }
  function dockNormUrl(raw) {
    var s = String(raw || '').trim(); if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    try { var u = new URL(s); if (u.hostname.indexOf('.') === -1) return null; return u.href; } catch (e) { return null; }
  }

  function renderDock() {
    if (!linksEl) return;
    var list = loadDock();
    linksEl.innerHTML = '';
    list.forEach(function (s, i) {
      var host = dockHost(s.url);
      var a = document.createElement('a');
      a.className = 'link'; a.href = s.url; a.style.setProperty('--i', i);
      var ic = document.createElement('div'); ic.className = 'ic';
      var img = document.createElement('img');
      img.src = 'https://www.google.com/s2/favicons?sz=64&domain=' + host;
      img.alt = '';
      img.addEventListener('error', function () {
        var fb = document.createElement('span'); fb.className = 'fb';
        fb.textContent = (s.name || dockName(s.url)).charAt(0).toUpperCase();
        img.replaceWith(fb);
      }, { once: true });
      ic.appendChild(img);
      var lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = s.name || dockName(s.url);
      var rm = document.createElement('button');
      rm.className = 'rm'; rm.type = 'button'; rm.title = 'Remove'; rm.setAttribute('aria-label', 'Remove shortcut'); rm.innerHTML = '&times;';
      rm.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var l = loadDock(); l.splice(i, 1); saveDock(l); renderDock();
      });
      a.append(ic, lbl, rm); linksEl.appendChild(a);
    });
    var add = document.createElement('button');
    add.className = 'link add'; add.type = 'button'; add.title = 'Add a shortcut'; add.style.setProperty('--i', list.length);
    add.innerHTML = '<div class="ic"><span class="plus">+</span></div><span class="lbl">Add</span>';
    add.addEventListener('click', openDockModal);
    linksEl.appendChild(add);
  }

  function openDockModal() {
    var ov = document.createElement('div'); ov.className = 'dock-modal';
    ov.innerHTML = '<div class="dm-card"><div class="dm-title">Add a shortcut</div>' +
      '<input class="dm-input" type="text" placeholder="example.com" autocomplete="off" spellcheck="false" />' +
      '<div class="dm-row"><button class="dm-btn ghost" data-act="cancel">Cancel</button><button class="dm-btn" data-act="ok">Add</button></div></div>';
    document.body.appendChild(ov);
    var input = ov.querySelector('.dm-input');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 20);
    function close() { ov.remove(); }
    function commit() {
      var url = dockNormUrl(input.value);
      if (!url) { input.classList.add('bad'); input.focus(); return; }
      var l = loadDock();
      if (!l.some(function (s) { return s.url === url; })) { l.push({ url: url, name: dockName(url) }); saveDock(l); renderDock(); }
      close();
    }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('[data-act="cancel"]').addEventListener('click', close);
    ov.querySelector('[data-act="ok"]').addEventListener('click', commit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') close(); });
  }

  renderDock();

  /* ─── Widgets (toggled via settings, persisted in localStorage) ─── */
  function escHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function renderWidgets() {
    var wrap = document.getElementById('widgets');
    if (!wrap) return;
    var showWeather   = lsGet('drift.weather',   '0') === '1';
    var showReminders = lsGet('drift.reminders_on', '0') === '1';
    var wloc = lsGet('drift.wloc', '');
    wrap.innerHTML = '';
    if (!showWeather && !showReminders) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    function card(cls) { var d = document.createElement('div'); d.className = 'widget ' + cls; wrap.appendChild(d); return d; }
    if (showWeather) {
      var wc = card('weather-w');
      if (!wloc) {
        wc.innerHTML = '<div class="w-title">Weather</div><div class="w-hint">Set a location in settings to enable weather.</div>';
      } else {
        wc.innerHTML = '<div class="w-title">Weather</div><div class="w-hint">Loading…</div>';
        loadWeather(wc, wloc, escHtml);
      }
    }
    if (showReminders) renderReminders(card('rem-w'), escHtml);
  }
  renderWidgets();

  function weatherIcon(code, isDay) {
    var sun = isDay ? '☀️' : '🌙';
    var m = {
      0: [sun, 'Clear sky'], 1: [sun, 'Mainly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
      45: ['🌫️', 'Fog'], 51: ['🌦️', 'Light drizzle'], 63: ['🌧️', 'Rain'],
      65: ['🌧️', 'Heavy rain'], 71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'],
      80: ['🌦️', 'Showers'], 95: ['⛈️', 'Thunderstorm'],
    };
    return m[code] || [sun, '—'];
  }

  function loadWeather(wc, loc, esc) {
    fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(loc))
      .then(function (r) { return r.json(); })
      .then(function (g) {
        if (!g.results || !g.results.length) throw new Error('geo');
        var pl = g.results[0];
        return fetch('https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code,is_day&latitude=' + pl.latitude + '&longitude=' + pl.longitude)
          .then(function (r) { return r.json(); }).then(function (w) { return { pl: pl, w: w }; });
      })
      .then(function (d) {
        var c = d.w.current || {}; var info = weatherIcon(c.weather_code, c.is_day);
        var temp = c.temperature_2m != null ? Math.round(c.temperature_2m) : '–';
        var place = d.pl.name + (d.pl.country_code ? ', ' + d.pl.country_code : '');
        wc.innerHTML = '<div class="w-title">Weather</div>' +
          '<div class="w-top"><span class="w-ico">' + info[0] + '</span><span class="w-temp">' + temp + '°</span></div>' +
          '<div class="w-cond">' + info[1] + '</div><div class="w-loc">' + esc(place) + '</div>';
      })
      .catch(function () {
        wc.innerHTML = '<div class="w-title">Weather</div><div class="w-hint">Couldn’t load weather for “' + esc(loc) + '”.</div>';
      });
  }

  function renderReminders(rc, esc) {
    rc.innerHTML = '<div class="w-title">Reminders</div><ul class="rem-list"></ul>' +
      '<form class="rem-add"><input type="text" placeholder="Add a reminder…" aria-label="Add a reminder" maxlength="120"><button type="submit" aria-label="Add">+</button></form>';
    var list = rc.querySelector('.rem-list');
    var form = rc.querySelector('.rem-add');
    var reminderInput = rc.querySelector('input');
    function loadRem() { return lsGetJSON('drift.reminders', []); }
    function saveRem(a) { lsSetJSON('drift.reminders', a); }
    function renderRem() {
      var a = loadRem(); list.innerHTML = '';
      if (!a.length) {
        var li = document.createElement('li'); li.className = 'rem-empty';
        li.textContent = 'Nothing yet — add one below.'; list.appendChild(li); return;
      }
      a.forEach(function (t, i) {
        var li = document.createElement('li');
        var s = document.createElement('span'); s.textContent = t; li.appendChild(s);
        var x = document.createElement('button'); x.className = 'rem-x'; x.type = 'button'; x.innerHTML = '&times;'; x.title = 'Remove';
        x.addEventListener('click', function () { var arr = loadRem(); arr.splice(i, 1); saveRem(arr); renderRem(); });
        li.appendChild(x); list.appendChild(li);
      });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var v = reminderInput.value.trim(); if (!v) return;
      var a = loadRem(); a.push(v); saveRem(a); reminderInput.value = ''; renderRem();
    });
    renderRem();
  }

  /* ─── Settings panel ─── */
  var settingsBtn   = document.getElementById('settingsBtn');
  var settingsPanel = document.getElementById('settingsPanel');

  function buildSettings() {
    var themeGrid  = document.getElementById('themeGrid');
    var accentGrid = document.getElementById('accentGrid');
    if (!themeGrid || !accentGrid) return;

    THEMES.forEach(function (t) {
      var btn = document.createElement('button');
      btn.className = 'theme-swatch';
      btn.title = t.id.charAt(0).toUpperCase() + t.id.slice(1);
      btn.setAttribute('aria-label', 'Theme: ' + t.id);
      btn.setAttribute('aria-pressed', t.id === curTheme ? 'true' : 'false');
      btn.style.background = 'linear-gradient(135deg, ' + t.bg[0] + ', ' + t.bg[1] + ')';
      btn.addEventListener('click', function () {
        curTheme = t.id; lsSet('drift.theme', curTheme); applyTheme();
        themeGrid.querySelectorAll('.theme-swatch').forEach(function (s) { s.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
      });
      themeGrid.appendChild(btn);
    });

    PRESETS.forEach(function (p) {
      var btn = document.createElement('button');
      btn.className = 'accent-dot';
      btn.title = p.id.charAt(0).toUpperCase() + p.id.slice(1);
      btn.setAttribute('aria-label', 'Accent: ' + p.id);
      btn.setAttribute('aria-pressed', p.id === curPreset ? 'true' : 'false');
      btn.style.background = p.color;
      btn.addEventListener('click', function () {
        curPreset = p.id; lsSet('drift.preset', curPreset); applyTheme();
        accentGrid.querySelectorAll('.accent-dot').forEach(function (d) { d.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
      });
      accentGrid.appendChild(btn);
    });

    /* ── Background ── */
    var bgSection = document.createElement('div');
    var bgLabel = document.createElement('div'); bgLabel.className = 'sp-label'; bgLabel.textContent = 'Background';
    bgSection.appendChild(bgLabel);
    var bgGrid = document.createElement('div');
    bgGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;';
    function refreshBgSel() {
      bgGrid.querySelectorAll('button').forEach(function (b) {
        var on = b.dataset.bg === curBg;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.style.outline = on ? '2px solid var(--accent)' : 'none';
        b.style.outlineOffset = '1px';
      });
    }
    BACKGROUNDS.forEach(function (b) {
      var sw = document.createElement('button');
      sw.type = 'button'; sw.dataset.bg = b.id; sw.title = b.label;
      sw.style.cssText = 'height:32px;border-radius:8px;border:1px solid var(--border);cursor:pointer;background-size:cover;background-position:center;font-size:13px;';
      if (b.id === 'none') { sw.style.background = 'var(--surface)'; sw.textContent = '—'; sw.style.color = 'var(--text-3)'; }
      else { sw.style.backgroundImage = 'url("' + bgUrl(b.id) + '")'; }
      sw.addEventListener('click', function () { curBg = b.id; lsSet('drift.bg', curBg); applyBackground(); refreshBgSel(); });
      bgGrid.appendChild(sw);
    });
    bgSection.appendChild(bgGrid);
    var up = document.createElement('label');
    up.textContent = 'Upload image…';
    up.style.cssText = 'display:inline-block;margin-top:8px;font-size:12px;color:var(--accent);cursor:pointer;';
    var upInput = document.createElement('input');
    upInput.type = 'file'; upInput.accept = 'image/*'; upInput.style.display = 'none';
    upInput.addEventListener('change', function () {
      var f = upInput.files && upInput.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { lsSet('drift.bgCustom', String(reader.result)); curBg = 'custom'; lsSet('drift.bg', curBg); applyBackground(); refreshBgSel(); } catch (e) {}
      };
      reader.readAsDataURL(f);
    });
    up.appendChild(upInput);
    bgSection.appendChild(up);
    settingsPanel.appendChild(bgSection);
    refreshBgSel();

    /* ── Search engine ── */
    var seSection = document.createElement('div');
    var seLabel = document.createElement('div'); seLabel.className = 'sp-label'; seLabel.textContent = 'Search engine';
    seSection.appendChild(seLabel);
    var seSel = document.createElement('select');
    seSel.style.cssText = 'width:100%;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text-1);font:inherit;';
    var curSe = lsGet('drift.se', 'google');
    Object.keys(SEARCH_ENGINES).forEach(function (id) {
      var opt = document.createElement('option'); opt.value = id; opt.textContent = ENGINE_LABELS[id] || id;
      if (id === curSe) opt.selected = true;
      seSel.appendChild(opt);
    });
    seSel.addEventListener('change', function () { lsSet('drift.se', seSel.value); });
    seSection.appendChild(seSel);
    settingsPanel.appendChild(seSection);

    /* ── Widgets ── */
    var wSection = document.createElement('div');
    var wLabel = document.createElement('div'); wLabel.className = 'sp-label'; wLabel.textContent = 'Widgets';
    wSection.appendChild(wLabel);
    function toggleRow(labelText, key, onChange) {
      var row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;color:var(--text-1);margin:4px 0;cursor:pointer;';
      var span = document.createElement('span'); span.textContent = labelText;
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = lsGet(key, '0') === '1';
      cb.addEventListener('change', function () { lsSet(key, cb.checked ? '1' : '0'); if (onChange) onChange(); });
      row.append(span, cb);
      return row;
    }
    wSection.appendChild(toggleRow('Weather', 'drift.weather', renderWidgets));
    var locInput = document.createElement('input');
    locInput.type = 'text'; locInput.placeholder = 'Weather location (e.g. London)';
    locInput.value = lsGet('drift.wloc', '');
    locInput.style.cssText = 'width:100%;padding:6px 8px;margin:4px 0;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text-1);font:inherit;';
    locInput.addEventListener('change', function () { lsSet('drift.wloc', locInput.value.trim()); renderWidgets(); });
    wSection.appendChild(locInput);
    wSection.appendChild(toggleRow('Reminders', 'drift.reminders_on', renderWidgets));
    settingsPanel.appendChild(wSection);

    settingsPanel.style.maxHeight = '82vh';
    settingsPanel.style.overflowY = 'auto';
  }

  buildSettings();

  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener('click', function () {
      var hidden = settingsPanel.hasAttribute('hidden');
      if (hidden) { settingsPanel.removeAttribute('hidden'); } else { settingsPanel.setAttribute('hidden', ''); }
      settingsBtn.setAttribute('aria-expanded', String(hidden));
    });
    document.addEventListener('click', function (e) {
      if (!settingsPanel.hasAttribute('hidden') &&
          !settingsPanel.contains(e.target) && e.target !== settingsBtn) {
        settingsPanel.setAttribute('hidden', '');
        settingsBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
})();
