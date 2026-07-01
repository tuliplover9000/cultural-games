/**
 * activity.js — live activity strip on the rooms page.
 *
 * Shows honest, real numbers as social proof:
 *   • games played  — cumulative, from get_public_stats() RPC
 *   • players       — cumulative registered profiles, from the same RPC
 *   • tables open   — set by entry.js after each room load (real rooms +
 *                     open "vs Computer" practice tables you can actually sit at)
 *
 * No fabricated figures: the cumulative stats come straight from the database,
 * and "tables open" counts tables that genuinely exist in the browser below.
 */
(function () {
  'use strict';

  var elGames, elPlayers, elTables, _tablesPending = null, _ready = false;

  function fmt(n) {
    n = Number(n) || 0;
    return n.toLocaleString('en-US');
  }

  // Small count-up so the numbers feel alive. Animates from whatever is
  // currently shown (not from 0), so repeat updates — e.g. "tables open now"
  // changing as you filter — nudge smoothly instead of flickering back to 0.
  // A per-element token cancels any in-flight animation before starting a new one.
  function countUp(el, target) {
    if (!el) return;
    target = Number(target) || 0;
    var start = parseInt(String(el.textContent).replace(/[^0-9]/g, ''), 10);
    if (isNaN(start)) start = 0;
    if (start === target) { el.textContent = fmt(target); return; }
    var token = (el._animToken || 0) + 1;
    el._animToken = token;
    var dur = 600, t0 = null;
    function step(ts) {
      if (el._animToken !== token) return;   // superseded by a newer update
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(start + (target - start) * eased));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  async function loadStats() {
    if (!(window.Room && Room.getPublicStats)) return;
    var s = null;
    try { s = await Room.getPublicStats(); } catch (e) { s = null; }
    if (!s) return;
    if (elGames && s.games_played != null) countUp(elGames, s.games_played);
    if (elPlayers && s.players != null) countUp(elPlayers, s.players);
  }

  function setTablesOpen(n) {
    if (!_ready) { _tablesPending = n; return; }
    if (elTables) countUp(elTables, n);
  }

  function init() {
    elGames   = document.getElementById('rb-stat-games');
    elPlayers = document.getElementById('rb-stat-players');
    elTables  = document.getElementById('rb-stat-tables');
    if (!elGames && !elPlayers && !elTables) return;
    _ready = true;
    loadStats();
    if (_tablesPending !== null) { setTablesOpen(_tablesPending); _tablesPending = null; }
  }

  window.Activity = { init: init, setTablesOpen: setTablesOpen };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
