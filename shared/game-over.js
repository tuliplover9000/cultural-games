/**
 * game-over.js — CGEndPlaque, the shared end-of-game "exhibit plaque".
 *
 * A token-driven, always-dark plaque that floats over the (usually dark) board
 * when a game ends. Modeled on shared/dialog.js: it injects its own scoped
 * styles built from the site's CSS variables (with hard fallbacks), reuses the
 * shared .btn classes, and depends on nothing beyond an optional window.Icon.
 *
 * Life & colour: a win gets a *crafted* celebration — an animated gold-shimmer
 * sweep across the plaque border plus a slow radial ray rotation behind the
 * medallion (CSS only, ~4s loop, reduced-motion aware). Loss/draw stay warm,
 * never funereal, never sterile.
 *
 * Usage:
 *   CGEndPlaque.show({
 *     result: 'win' | 'loss' | 'draw',   // drives medallion + celebration
 *     title:   'Victory',                // Fraunces headline
 *     subtitle:'You captured 12 seeds.', // muted line under the title
 *     stats:   [                         // optional stat rows
 *       { label: 'Captured', value: 12 },
 *       { label: 'Moves',    value: 34 }
 *     ],
 *     onRematch: function () { ... },     // Rematch button (omit → hidden)
 *     rematchText: 'Rematch',
 *     onMenu:    function () { ... },     // Back/Menu button (omit → defaults to hide)
 *     menuText:  'Back to Menu',
 *     accent:   '#E0A04E',               // optional per-game gold override
 *     dismissible: false                 // ESC / backdrop closes (default false)
 *   });
 *
 *   CGEndPlaque.hide();                   // never throws, safe if nothing shown
 *
 * Every call to show() replaces any plaque already on screen. Calling twice,
 * or hide() with nothing open, never throws.
 */
(function () {
  'use strict';

  var STYLE_ID = 'cg-endplaque-styles';
  var current = null; // the live backdrop element, or null

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.cg-plaque-backdrop{position:fixed;inset:0;z-index:3200;display:flex;align-items:center;' +
        'justify-content:center;padding:20px;background:rgba(26,14,6,0.74);' +
        '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;' +
        'transition:opacity .18s ease}' +
      '.cg-plaque-backdrop--open{opacity:1}' +
      // Always-dark card, regardless of page theme — it floats over the board.
      // The card is ALWAYS dark, so its own text must be dark-safe ivory —
      // never the page's --color-text (dark in light theme → invisible here).
      '.cg-plaque{--cg-plaque-accent:var(--color-accent-gold,#C89B3C);' +
        '--cg-plaque-ink:#F1E6CE;--cg-plaque-ink-dim:rgba(241,230,206,0.68);' +
        'position:relative;background:linear-gradient(168deg,#241812 0%,#1a0f08 100%);' +
        'border:1px solid var(--color-border,rgba(255,255,255,.14));' +
        'border-radius:var(--radius-plaque,6px);padding:var(--space-6,28px) var(--space-6,28px) var(--space-5,24px);' +
        'max-width:380px;width:100%;box-shadow:var(--shadow-xl,0 20px 60px rgba(0,0,0,.55));' +
        'display:flex;flex-direction:column;align-items:center;gap:var(--space-3,12px);' +
        'text-align:center;overflow:hidden;transform:translateY(10px) scale(.97);' +
        'transition:transform .18s ease}' +
      '.cg-plaque-backdrop--open .cg-plaque{transform:none}' +
      // Shimmer border (win only) — a gold sweep travelling around a masked ring.
      '.cg-plaque__shimmer{position:absolute;inset:0;border-radius:inherit;padding:1.5px;' +
        'pointer-events:none;opacity:0;background:conic-gradient(from 0deg,' +
        'transparent 0deg,transparent 70deg,var(--cg-plaque-accent) 110deg,' +
        '#fff4d0 130deg,var(--cg-plaque-accent) 150deg,transparent 190deg,transparent 360deg);' +
        '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);' +
        '-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);' +
        'mask-composite:exclude}' +
      '.cg-plaque--win .cg-plaque__shimmer{opacity:1;animation:cg-plaque-spin 4s linear infinite}' +
      '@keyframes cg-plaque-spin{to{transform:rotate(360deg)}}' +
      // Medallion + the celebratory ray fan behind it (win only).
      '.cg-plaque__medallion{position:relative;display:flex;align-items:center;justify-content:center;' +
        'width:76px;height:76px;border-radius:50%;color:var(--cg-plaque-accent);' +
        'background:radial-gradient(circle at 50% 42%,rgba(200,155,60,0.22),rgba(200,155,60,0.05) 70%);' +
        'box-shadow:inset 0 0 0 1px rgba(200,155,60,0.35)}' +
      '.cg-plaque__medallion svg{position:relative;z-index:1}' +
      '.cg-plaque__medallion .cg-plaque__emoji{position:relative;z-index:1;font-size:40px;line-height:1}' +
      '.cg-plaque__rays{position:absolute;inset:-26px;border-radius:50%;pointer-events:none;opacity:0;' +
        'background:repeating-conic-gradient(from 0deg,rgba(255,220,130,0.16) 0deg,' +
        'rgba(255,220,130,0.16) 8deg,transparent 8deg,transparent 24deg);' +
        '-webkit-mask:radial-gradient(circle,#000 34%,transparent 72%);' +
        'mask:radial-gradient(circle,#000 34%,transparent 72%)}' +
      '.cg-plaque--win .cg-plaque__rays{opacity:1;animation:cg-plaque-rays 14s linear infinite}' +
      '@keyframes cg-plaque-rays{to{transform:rotate(360deg)}}' +
      '.cg-plaque--loss .cg-plaque__medallion,.cg-plaque--draw .cg-plaque__medallion{' +
        'color:var(--cg-plaque-ink);opacity:0.92}' +
      // Always-dark card, so use the bright accent gold (readable on dark in
      // both themes) — never --color-gold-text, which is dark brown in light mode.
      '.cg-plaque__title{font-family:var(--font-display,Fraunces,Georgia,serif);' +
        'font-size:var(--text-2xl,1.5rem);font-weight:var(--weight-bold,700);' +
        'color:var(--cg-plaque-accent);margin:0;line-height:1.1}' +
      '.cg-plaque--loss .cg-plaque__title,.cg-plaque--draw .cg-plaque__title{color:var(--cg-plaque-ink)}' +
      '.cg-plaque__subtitle{font-size:var(--text-sm,.9rem);color:var(--cg-plaque-ink-dim);' +
        'margin:0;line-height:1.5}' +
      '.cg-plaque__stats{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--space-2,8px) var(--space-5,24px);' +
        'margin:var(--space-1,4px) 0 0}' +
      '.cg-plaque__stat{display:flex;flex-direction:column;gap:2px;align-items:center;min-width:64px}' +
      '.cg-plaque__stat-val{font-family:var(--font-display,Fraunces,Georgia,serif);' +
        'font-size:var(--text-xl,1.25rem);font-weight:var(--weight-bold,700);color:var(--cg-plaque-accent)}' +
      '.cg-plaque__stat-label{font-size:var(--text-xs,.72rem);letter-spacing:var(--label-tracking,.08em);' +
        'text-transform:uppercase;color:var(--cg-plaque-ink-dim)}' +
      '.cg-plaque__actions{display:flex;gap:var(--space-2,8px);justify-content:center;margin-top:var(--space-3,12px);' +
        'width:100%}' +
      '.cg-plaque__actions .btn{min-width:120px}' +
      // Ghost button lives on a dark card — force readable ivory (the shared
      // .btn-ghost uses --color-text, which is dark in light theme).
      '.cg-plaque__actions .btn-ghost{color:var(--cg-plaque-ink);' +
        'border-color:rgba(241,230,206,0.28)}' +
      '.cg-plaque__actions .btn-ghost:hover{background:rgba(241,230,206,0.08);' +
        'border-color:rgba(241,230,206,0.5)}' +
      '@media (max-width:420px){.cg-plaque__actions{flex-direction:column-reverse}' +
        '.cg-plaque__actions .btn{width:100%}}' +
      '@media (prefers-reduced-motion:reduce){' +
        '.cg-plaque--win .cg-plaque__shimmer{animation:none}' +
        '.cg-plaque--win .cg-plaque__rays{animation:none}' +
        '.cg-plaque-backdrop,.cg-plaque{transition:none}}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function esc(s) {
    if (window.Sanitize) return window.Sanitize.text(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Medallion glyph for a result. Prefer the shared inline-SVG icon; fall back
  // to a warm emoji only if window.Icon isn't loaded. Resolved per-call.
  function medallionGlyph(result) {
    var name = result === 'loss' ? 'scales'
             : result === 'draw' ? 'handshake'
             : 'trophy';
    if (window.Icon && window.Icon.svg && window.Icon.has && window.Icon.has(name)) {
      return window.Icon.svg(name, 38);
    }
    var fallback = result === 'loss' ? '⚖️' // ⚖️
                 : result === 'draw' ? '🤝' // 🤝
                 : '🏆';                     // 🏆
    return '<span class="cg-plaque__emoji" aria-hidden="true">' + fallback + '</span>';
  }

  function hide() {
    var backdrop = current;
    current = null;
    if (!backdrop) return;
    try {
      backdrop.classList.remove('cg-plaque-backdrop--open');
      if (backdrop._onKey) document.removeEventListener('keydown', backdrop._onKey, true);
      setTimeout(function () {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      }, 190);
    } catch (e) { /* never throw from hide() */ }
  }

  function show(opts) {
    opts = opts || {};
    try {
      injectStyles();
    } catch (e) { /* styles are best-effort */ }

    // Replace any plaque already on screen (calling twice must not stack).
    if (current) {
      var stale = current;
      current = null;
      try {
        stale.classList.remove('cg-plaque-backdrop--open');
        if (stale._onKey) document.removeEventListener('keydown', stale._onKey, true);
        if (stale.parentNode) stale.parentNode.removeChild(stale);
      } catch (e2) {}
    }

    var result = (opts.result === 'loss' || opts.result === 'draw') ? opts.result : 'win';
    var accentStyle = opts.accent ? ' style="--cg-plaque-accent:' + esc(opts.accent) + '"' : '';

    var statsHtml = '';
    if (opts.stats && opts.stats.length) {
      var rows = '';
      for (var i = 0; i < opts.stats.length; i++) {
        var st = opts.stats[i] || {};
        rows += '<div class="cg-plaque__stat">' +
          '<span class="cg-plaque__stat-val">' + esc(st.value) + '</span>' +
          '<span class="cg-plaque__stat-label">' + esc(st.label) + '</span>' +
        '</div>';
      }
      statsHtml = '<div class="cg-plaque__stats">' + rows + '</div>';
    }

    var actions = '';
    if (opts.onRematch) {
      actions += '<button type="button" class="btn btn-primary cg-plaque__rematch">' +
        esc(opts.rematchText || 'Rematch') + '</button>';
    }
    actions += '<button type="button" class="btn btn-ghost cg-plaque__menu">' +
      esc(opts.menuText || 'Back to Menu') + '</button>';

    var backdrop = document.createElement('div');
    backdrop.className = 'cg-plaque-backdrop';
    backdrop.innerHTML =
      '<div class="cg-plaque cg-plaque--' + result + '"' + accentStyle +
          ' role="dialog" aria-modal="true" aria-labelledby="cg-plaque-title">' +
        '<div class="cg-plaque__shimmer" aria-hidden="true"></div>' +
        '<div class="cg-plaque__medallion" aria-hidden="true">' +
          '<div class="cg-plaque__rays"></div>' +
          medallionGlyph(result) +
        '</div>' +
        '<h2 class="cg-plaque__title" id="cg-plaque-title">' + esc(opts.title || defaultTitle(result)) + '</h2>' +
        (opts.subtitle ? '<p class="cg-plaque__subtitle">' + esc(opts.subtitle) + '</p>' : '') +
        statsHtml +
        '<div class="cg-plaque__actions">' + actions + '</div>' +
      '</div>';

    document.body.appendChild(backdrop);
    current = backdrop;
    requestAnimationFrame(function () {
      if (current === backdrop) backdrop.classList.add('cg-plaque-backdrop--open');
    });

    var btnRematch = backdrop.querySelector('.cg-plaque__rematch');
    var btnMenu = backdrop.querySelector('.cg-plaque__menu');

    if (btnRematch) {
      btnRematch.addEventListener('click', function () {
        hide();
        try { if (opts.onRematch) opts.onRematch(); } catch (e) {}
      });
    }
    if (btnMenu) {
      btnMenu.addEventListener('click', function () {
        hide();
        try { if (opts.onMenu) opts.onMenu(); } catch (e) {}
      });
    }

    if (opts.dismissible) {
      backdrop.addEventListener('mousedown', function (e) { if (e.target === backdrop) hide(); });
      var onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); hide(); } };
      backdrop._onKey = onKey;
      document.addEventListener('keydown', onKey, true);
    }

    // Focus the primary action for keyboard users.
    try { (btnRematch || btnMenu).focus(); } catch (e) {}

    return backdrop;
  }

  function defaultTitle(result) {
    return result === 'loss' ? 'Defeat' : result === 'draw' ? 'Draw' : 'Victory';
  }

  window.CGEndPlaque = { show: show, hide: hide };
}());
