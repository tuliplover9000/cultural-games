/**
 * play-count.js — per-game "Played N times" counter.
 *
 * On every game-page open it increments a server-side counter (all visitors,
 * logged in or not) via the public `bump_game_play` RPC and shows the running
 * total in the game header as social proof. Fully self-contained and fail-soft:
 * if Supabase is unreachable, the migration isn't applied, or the id can't be
 * derived, it simply shows nothing and never disturbs the page.
 *
 * Requires nothing else on the page — it uses the public anon key directly
 * (the same key already embedded site-wide in auth.js).
 */
(function () {
  'use strict';

  var SB_URL = 'https://pnyvlqgllrpslhgimgve.supabase.co';
  // Public anon key (identical to auth.js) — safe to expose, RLS-guarded.
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXZscWdsbHJwc2xoZ2ltZ3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjQ3OTMsImV4cCI6MjA4ODYwMDc5M30.7MwZTEJuYGSLaOjfs0EP4wFAi3CanDzSRMbTvPiIasw';

  // Derive the canonical game id from the URL.
  //   /pages/games/<id>.html         → <id>   (standard games)
  //   /<id>/  or  /<id>/index.html   → <id>   (standalone: cachos, filipino-dama, xinjiang-fangqi)
  function gameId() {
    var p = location.pathname;
    var m = p.match(/\/games\/([a-z0-9-]+)(?:\.html)?\/?$/i);
    if (m) return m[1].toLowerCase();
    m = p.match(/\/([a-z0-9-]+)\/(?:index\.html)?$/i);
    if (m && m[1] !== 'games' && m[1] !== 'pages') return m[1].toLowerCase();
    return null;
  }

  function fmt(n) {
    try { return Number(n).toLocaleString(); } catch (e) { return String(n); }
  }

  function render(count) {
    var header = document.querySelector('.game-header');
    if (!header || header.querySelector('.game-plays')) return;   // no header, or already shown
    var el = document.createElement('p');
    el.className = 'game-plays';
    el.setAttribute('aria-label', 'Times played');
    el.style.cssText =
      'margin:0.45rem 0 0;font-size:var(--text-sm,0.82rem);letter-spacing:0.06em;' +
      'text-transform:uppercase;color:var(--color-text-muted,#8a7d68);';
    el.innerHTML =
      '<span aria-hidden="true" style="color:var(--color-accent-gold,#C89B3C);margin-right:0.35em;">◈</span>' +
      'Played <strong style="color:var(--color-text,inherit);font-variant-numeric:tabular-nums;font-weight:600;">' +
      fmt(count) + '</strong> time' + (Number(count) === 1 ? '' : 's');
    var origin = header.querySelector('.game-header__origin');
    if (origin && origin.parentNode) origin.parentNode.insertBefore(el, origin.nextSibling);
    else header.appendChild(el);
    // The counter arrives after the mobile fitter's initial pass and grows the
    // header above #game-container, so re-fit the board or its bottom can clip.
    if (window.cgMobileRefit) window.cgMobileRefit();
  }

  function bump() {
    var id = gameId();
    if (!id) return;
    fetch(SB_URL + '/rest/v1/rpc/bump_game_play', {
      method: 'POST',
      keepalive: true,
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ p_game_id: id })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (n) {
        var num = Number(n);
        if (n !== null && n !== undefined && !isNaN(num) && num >= 0) render(num);
      })
      .catch(function () { /* fail-soft: no counter shown */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bump);
  } else {
    bump();
  }
})();
