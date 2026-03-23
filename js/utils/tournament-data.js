/**
 * tournament-data.js — Shared tournament utilities.
 * Exposes window.TournamentData for tournament.js and bracket.js.
 */
(function () {
  'use strict';

  var SB_URL = 'https://pnyvlqgllrpslhgimgve.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXZscWdsbHJwc2xoZ2ltZ3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjQ3OTMsImV4cCI6MjA4ODYwMDc5M30.7MwZTEJuYGSLaOjfs0EP4wFAi3CanDzSRMbTvPiIasw';

  var _db = null;

  function db() {
    if (!_db) _db = window.supabase.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return _db;
  }

  // Tournament-eligible games only (no bau-cua — group betting, not bracket-compatible)
  var GAMES = [
    { key: 'fanorona',    name: 'Fanorona',            maxPlayers: 2 },
    { key: 'hnefatafl',   name: 'Hnefatafl',           maxPlayers: 2 },
    { key: 'o-an-quan',   name: 'Ô Ăn Quan',           maxPlayers: 2 },
    { key: 'oware',       name: 'Oware',               maxPlayers: 2 },
    { key: 'pallanguzhi', name: 'Pallanguzhi',          maxPlayers: 2 },
    { key: 'patolli',     name: 'Patolli',             maxPlayers: 2 },
    { key: 'puluc',       name: 'Puluc',               maxPlayers: 2 },
    { key: 'latrunculi',  name: 'Ludus Latrunculorum', maxPlayers: 2 },
    { key: 'tien-len',    name: 'Tiến Lên',            maxPlayers: 4 },
    { key: 'mahjong',     name: 'Hong Kong Mahjong',   maxPlayers: 4 },
    { key: 'ganjifa',     name: 'Ganjifa',             maxPlayers: 4 },
    { key: 'pachisi',     name: 'Pachisi',             maxPlayers: 4 },
    { key: 'cachos',      name: 'Cachos',              maxPlayers: 6 },
  ];

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTimeAgo(iso) {
    var diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function formatCountdown(iso) {
    var diff = Math.floor((new Date(iso) - Date.now()) / 1000);
    if (diff <= 0)    return 'Expired';
    if (diff < 3600)  return Math.floor(diff / 60) + 'm left';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h left';
    return Math.floor(diff / 86400) + 'd left';
  }

  function gameName(key) {
    var g = GAMES.find(function (g) { return g.key === key; });
    return g ? g.name : key;
  }

  async function callRpc(fn, params) {
    var res = await db().rpc(fn, params || {});
    if (res.error) throw res.error;
    return res.data;
  }

  window.TournamentData = {
    GAMES: GAMES,
    db: db,
    esc: esc,
    formatTimeAgo: formatTimeAgo,
    formatCountdown: formatCountdown,
    gameName: gameName,
    callRpc: callRpc,
  };

}());
