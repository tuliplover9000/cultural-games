/**
 * theme.js — Cultural Games theme toggle.
 *
 * Runs in <head> BEFORE any CSS loads to prevent flash.
 * Wires the toggle button after DOMContentLoaded.
 * Exposes window.CGTheme for canvas-based games.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'cg-theme';
  var html = document.documentElement;

  /* ── 1. Resolve & apply theme immediately (flash prevention) ──────────── */
  function _resolveTheme() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  var _theme = _resolveTheme();
  html.setAttribute('data-theme', _theme);

  /* ── 2. Suppress transitions on initial load ──────────────────────────── */
  html.classList.add('cg-no-transition');
  requestAnimationFrame(function () {
    setTimeout(function () { html.classList.remove('cg-no-transition'); }, 0);
  });

  /* ── 3. Canvas color bridge ───────────────────────────────────────────── */
  var PALETTE = {
    light: {
      bg:         '#FBF5E6',
      surface:    '#FFFFFF',
      surfaceAlt: '#F3EAD3',
      primary:    '#1A0E06',
      text:       '#1A0E06',
      textMuted:  '#6B5744',
      border:     '#DDD0B5',
      accentRed:  '#B83232',
      accentGold: '#C89B3C',
      accentTeal: '#2C7873',
      accentWarm: '#D4663A',
    },
    dark: {
      bg:         '#120C05',
      surface:    '#1E1309',
      surfaceAlt: '#2A1A0E',
      primary:    '#F0E6D0',
      text:       '#F0E6D0',
      textMuted:  '#B09070',
      border:     '#3D2A18',
      accentRed:  '#C94040',
      accentGold: '#D4A84B',
      accentTeal: '#3A9990',
      accentWarm: '#E07848',
    }
  };

  /* ── 4. Toggle & apply ────────────────────────────────────────────────── */
  function _applyTheme(t) {
    _theme = t;
    html.setAttribute('data-theme', t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch (e) {}
    _updateBtn();
    if (typeof CGTheme.onchange === 'function') CGTheme.onchange(t);
  }

  function _toggle() {
    _applyTheme(_theme === 'dark' ? 'light' : 'dark');
  }

  /* ── 5. Toggle button ─────────────────────────────────────────────────── */
  var SVG_SUN  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  var SVG_MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function _updateBtn() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var isDark = _theme === 'dark';
    btn.setAttribute('aria-pressed', String(isDark));
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.innerHTML = isDark ? SVG_SUN : SVG_MOON;
  }

  function _injectToggle() {
    if (document.getElementById('theme-toggle')) return;
    var hamburger = document.querySelector('.nav-hamburger');
    if (!hamburger) return;

    function _doInsert() {
      if (document.getElementById('theme-toggle')) return;
      var btn = document.createElement('button');
      btn.id        = 'theme-toggle';
      btn.className = 'theme-toggle';
      btn.type      = 'button';
      btn.addEventListener('click', _toggle);
      // Always place immediately after #nav-auth so toggle sits
      // right beside the sign-in / account widget with no jumping.
      var navAuth = document.getElementById('nav-auth');
      navAuth.parentNode.insertBefore(btn, navAuth.nextSibling);
      _updateBtn();
    }

    var navAuth = document.getElementById('nav-auth');
    if (navAuth) {
      _doInsert();
    } else {
      // auth.js injects #nav-auth after Supabase resolves — wait for it
      // before inserting so the toggle never appears in the wrong place.
      var obs = new MutationObserver(function (mutations, o) {
        if (document.getElementById('nav-auth')) {
          o.disconnect();
          _doInsert();
        }
      });
      obs.observe(hamburger.parentNode, { childList: true });
    }
  }

  /* ── 6. Expose global ─────────────────────────────────────────────────── */
  window.CGTheme = {
    toggle:    _toggle,
    getTheme:  function () { return _theme; },
    getColors: function () { return PALETTE[_theme] || PALETTE.light; },
    onchange:  null, // canvas games: set to function(theme){} to re-render on switch
  };

  /* ── 7. Wire up after DOM ready ───────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _injectToggle);
  } else {
    _injectToggle();
  }

}());
