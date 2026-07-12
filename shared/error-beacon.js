/**
 * error-beacon.js — client-side error reporting.
 *
 * Captures uncaught errors and unhandled promise rejections and POSTs them to
 * the `log_client_error` RPC so breakage in the wild is visible (30 games ×
 * many devices; there is no other signal). Deliberately self-contained — it
 * must not depend on auth.js or any other module, because those are exactly
 * the things that might be broken.
 *
 * Safety: at most 5 reports per page load, duplicate messages suppressed,
 * fire-and-forget fetch that swallows its own failures. The server side is
 * validated, length-capped, and globally rate-limited (migration 029).
 */
(function () {
  'use strict';

  var SB_URL = 'https://pnyvlqgllrpslhgimgve.supabase.co';
  // Public anon key (identical to auth.js) — safe to expose, RLS-guarded.
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXZscWdsbHJwc2xoZ2ltZ3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjQ3OTMsImV4cCI6MjA4ODYwMDc5M30.7MwZTEJuYGSLaOjfs0EP4wFAi3CanDzSRMbTvPiIasw';

  var MAX_REPORTS = 5;
  var sent = 0;
  var seen = {};

  // Same derivation as play-count.js: /pages/games/<id>.html or standalone /<id>/
  function gameId() {
    var p = location.pathname;
    var m = p.match(/\/games\/([a-z0-9-]+)(?:\.html)?\/?$/i);
    if (m) return m[1].toLowerCase();
    m = p.match(/\/([a-z0-9-]+)\/(?:index\.html)?$/i);
    if (m && m[1] !== 'games' && m[1] !== 'pages') return m[1].toLowerCase();
    return null;
  }

  function report(message, stack) {
    if (sent >= MAX_REPORTS) return;
    message = String(message || '').slice(0, 500);
    if (!message || seen[message]) return;
    seen[message] = true;
    sent++;
    try {
      fetch(SB_URL + '/rest/v1/rpc/log_client_error', {
        method: 'POST',
        keepalive: true,
        headers: {
          'apikey': SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_page:    location.pathname.slice(0, 200),
          p_message: message,
          p_stack:   stack ? String(stack).slice(0, 2000) : null,
          p_game_id: gameId(),
          p_ua:      navigator.userAgent.slice(0, 300)
        })
      }).catch(function () { /* never let the beacon itself cause noise */ });
    } catch (e) { /* fetch unavailable — give up silently */ }
  }

  window.addEventListener('error', function (e) {
    // Resource-load errors (img/script tags) have no message — skip those;
    // runtime errors carry message + (usually) an Error object with a stack.
    if (!e || !e.message) return;
    var loc = (e.filename ? e.filename.split('/').pop() : '') +
              (e.lineno ? ':' + e.lineno + ':' + (e.colno || 0) : '');
    report(e.message + (loc ? ' @ ' + loc : ''), e.error && e.error.stack);
  });

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    if (r === undefined || r === null) return;
    report('unhandledrejection: ' + (r.message || String(r)).slice(0, 300), r.stack);
  });
})();
