/**
 * game-bridge.js — Room System bridge for game iframes (Phase H).
 *
 * When a game is loaded inside a room iframe, this script detects the
 * ?roomId= URL param and exposes window.RoomBridge so the game can:
 *   • send its state to the parent page  →  parent persists to Supabase
 *   • receive state from the parent page ←  parent forwards Supabase updates
 *   • report a win                       →  parent calls Room.endGame()
 *
 * If ?roomId= is absent (standalone mode) RoomBridge is null and the game
 * falls back to window.Multiplayer as before.
 */
(function () {
  'use strict';

  var params   = new URLSearchParams(location.search);
  var roomId   = params.get('roomId');

  // Not running inside a Room iframe — leave RoomBridge null.
  if (!roomId) {
    window.RoomBridge = null;
    return;
  }

  // Hide site chrome (nav, back link, footer) — only the game should show.
  document.documentElement.classList.add('room-mode');

  var seat       = parseInt(params.get('seat') || '-1', 10);
  var role       = params.get('role')     || 'player';
  var instance   = params.get('instance') || '0';
  var gen        = params.get('gen')      || '0';
  var mode       = params.get('mode')     || 'normal';
  var isRoomHost = params.get('isHost')   === '1';
  var aiSeatsStr = params.get('aiSeats')  || '';
  var aiSeats    = aiSeatsStr
    ? aiSeatsStr.split(',').map(function(x){ return parseInt(x, 10); }).filter(function(n){ return !isNaN(n); })
    : [];

  var _onStateFn    = null;
  var _winReported  = false;

  // Listen for messages from the parent room page.
  window.addEventListener('message', function (e) {
    if (!e.data) return;
    // Parent pushes a board-state update.
    if (e.data.type === 'room-state' && _onStateFn) {
      _onStateFn(e.data.data);
    }
  });

  // Spectator: inject a visible banner and block all input
  var isSpectatorMode = (role === 'spectator');
  if (isSpectatorMode) {
    document.addEventListener('DOMContentLoaded', function () {
      var banner = document.createElement('div');
      banner.id  = 'spectator-banner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:rgba(44,122,122,0.9);color:#fff;text-align:center;padding:6px 12px;font-size:0.82rem;font-weight:600;letter-spacing:0.04em;pointer-events:none;';
      banner.textContent = '\uD83D\uDC41\uFE0F Spectating — view only';
      document.body.appendChild(banner);
    });
  }

  window.RoomBridge = {

    isActive:      function () { return true; },
    getSeat:       function () { return seat; },
    getRole:       function () { return role; },
    getInstanceId: function () { return instance; },
    getMode:       function () { return mode; },
    getAiSeats:    function () { return aiSeats; },
    isRoomHost:    function () { return isRoomHost; },
    isSpectator:   function () { return isSpectatorMode; },

    /**
     * Send a full game-state blob to the parent.
     * No-op for spectators — they only receive state, never send it.
     */
    sendState: function (blob) {
      if (isSpectatorMode) return;  // spectators cannot modify board state
      try {
        parent.postMessage({ type: 'game-sync', instance: instance, gen: gen, data: blob }, '*');
      } catch (err) { /* cross-origin safety, should never fire */ }
    },

    /**
     * Report that this game instance has a winner.
     * Spectators cannot report wins — no-op if in spectator mode.
     * @param {number} winnerSeat - 0-based seat index of the winner
     * @param {*}      score      - optional score to display on end screen
     */
    reportWin: function (winnerSeat, score) {
      if (isSpectatorMode) return;  // spectators cannot report wins
      if (_winReported) return;
      _winReported = true;
      try {
        parent.postMessage({
          type: 'game-win',
          instance: instance,
          gen: gen,
          winnerSeat: winnerSeat,
          score: score || null,
        }, '*');
      } catch (err) { /* cross-origin safety */ }
    },

    /**
     * Register a callback to receive remote state updates from the parent.
     * Immediately signals the parent that this iframe is ready so the parent
     * can push the latest board state (useful on reconnect / page refresh).
     * @param {function} fn - called with (stateBlob)
     */
    onState: function (fn) {
      _onStateFn = fn;
      // Tell the parent we're ready; it will push current board_state if any.
      try {
        parent.postMessage({ type: 'game-ready', instance: instance, gen: gen }, '*');
      } catch (err) { /* cross-origin safety */ }
    },

    /** Reset the win-reported guard (called by the game on rematch). */
    resetWin: function () {
      _winReported = false;
    },
  };

}());
