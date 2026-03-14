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

  var seat     = parseInt(params.get('seat') || '-1', 10);
  var role     = params.get('role')     || 'player';
  var instance = params.get('instance') || '0';

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

  window.RoomBridge = {

    isActive: function ()       { return true; },
    getSeat:  function ()       { return seat; },
    getRole:  function ()       { return role; },
    getInstanceId: function ()  { return instance; },

    /**
     * Send a full game-state blob to the parent.
     * The parent will forward it to other iframes and persist to Supabase.
     */
    sendState: function (blob) {
      try {
        parent.postMessage({ type: 'game-sync', instance: instance, data: blob }, '*');
      } catch (err) { /* cross-origin safety, should never fire */ }
    },

    /**
     * Report that this game instance has a winner.
     * Only call once per game; RoomBridge itself guards against duplicates.
     * @param {number} winnerSeat - 0-based seat index of the winner
     * @param {*}      score      - optional score to display on end screen
     */
    reportWin: function (winnerSeat, score) {
      if (_winReported) return;
      _winReported = true;
      try {
        parent.postMessage({
          type: 'game-win',
          instance: instance,
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
        parent.postMessage({ type: 'game-ready', instance: instance }, '*');
      } catch (err) { /* cross-origin safety */ }
    },

    /** Reset the win-reported guard (called by the game on rematch). */
    resetWin: function () {
      _winReported = false;
    },
  };

}());
