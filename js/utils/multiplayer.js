/**
 * multiplayer.js - Online room management via Supabase Realtime.
 * Exposes window.Multiplayer for game modules to use.
 */
(function () {
  'use strict';

  var URL = 'https://pnyvlqgllrpslhgimgve.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXZscWdsbHJwc2xoZ2ltZ3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjQ3OTMsImV4cCI6MjA4ODYwMDc5M30.7MwZTEJuYGSLaOjfs0EP4wFAi3CanDzSRMbTvPiIasw';

  var _db      = null;
  var _channel = null;
  var _room    = null;
  var _cbs     = {};
  var _pid     = null;

  function db() {
    if (!_db) _db = window.supabase.createClient(URL, KEY);
    return _db;
  }

  function getPlayerId() {
    if (_pid) return _pid;
    _pid = localStorage.getItem('cg_pid');
    if (!_pid) {
      _pid = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      localStorage.setItem('cg_pid', _pid);
    }
    return _pid;
  }

  function randomCode() {
    var alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    var s = '';
    for (var i = 0; i < 4; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
    return s;
  }

  // Apply a freshly-seen room row: fire onReady once on start, deliver state.
  function handleRoomRow(u) {
    if (!u) return;
    _room = u;
    if (u.status === 'playing' && _cbs.onReady) {
      var cb = _cbs.onReady;
      _cbs.onReady = null; // fire once
      cb(u);
    }
    if (u.board_state && _cbs.onRemoteState) {
      _cbs.onRemoteState(u.board_state);
    }
  }

  function subscribe(roomId) {
    if (_channel) db().removeChannel(_channel);
    _channel = db()
      .channel('room_' + roomId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rooms',
        filter: 'id=eq.' + roomId,
      }, function (payload) {
        handleRoomRow(payload.new);
      })
      .subscribe(function (status) {
        // Realtime only delivers UPDATEs that land AFTER the channel is live.
        // Re-fetch once on SUBSCRIBED to catch a guest who joined (or a state
        // push that arrived) during the subscribe gap — otherwise the host
        // can sit forever waiting for an onReady that already fired.
        if (status === 'SUBSCRIBED') {
          db().from('rooms').select().eq('id', roomId).single().then(function (res) {
            if (!res.error) handleRoomRow(res.data);
          });
        }
      });
  }

  window.Multiplayer = {
    getPlayerId: getPlayerId,

    createRoom: async function (game, cbs) {
      _cbs = cbs || {};
      var room = null;
      for (var i = 0; i < 8 && !room; i++) {
        var res = await db().from('rooms')
          .insert({ code: randomCode(), game: game, host_id: getPlayerId(), status: 'waiting' })
          .select().single();
        if (!res.error) {
          room = res.data;
        } else if (res.error.code !== '23505') {
          // Not a code-collision (unique violation) - retrying won't help; report and stop.
          if (_cbs.onError) _cbs.onError('Could not create room: ' + (res.error.message || 'unknown error'));
          return null;
        }
        // else: 23505 unique-violation on code -> loop and try a new random code
      }
      if (!room) {
        if (_cbs.onError) _cbs.onError('Could not create room. Try again.');
        return null;
      }
      _room = room;
      subscribe(room.id);
      return { code: room.code, role: 'host' };
    },

    joinRoom: async function (code, game, cbs) {
      _cbs = cbs || {};
      // Look up by code only - avoids any game-name or status mismatch issues
      var res = await db().from('rooms')
        .select().eq('code', code.toUpperCase().trim()).limit(1);
      if (res.error || !res.data || !res.data.length) {
        if (_cbs.onError) _cbs.onError('Room not found. Check the code and try again.');
        return null;
      }
      if (res.data[0].status !== 'waiting') {
        if (_cbs.onError) _cbs.onError('That room has already started or ended. Ask the host to create a new room.');
        return null;
      }
      // Claim the seat atomically: only flip to 'playing' if the row is STILL
      // 'waiting'. Without this guard two guests racing the same code both pass
      // the check above and both "join" (TOCTOU) — the second silently
      // overwrites the first's guest_id. Detect 0 rows updated = lost the race.
      var res2 = await db().from('rooms')
        .update({ guest_id: getPlayerId(), status: 'playing' })
        .eq('id', res.data[0].id).eq('status', 'waiting').select();
      if (res2.error) {
        if (_cbs.onError) _cbs.onError('Failed to join. Try again.');
        return null;
      }
      if (!res2.data || !res2.data.length) {
        if (_cbs.onError) _cbs.onError('That room was just taken. Ask the host to create a new room.');
        return null;
      }
      _room = res2.data[0];
      subscribe(res2.data[0].id);
      return { code: code, role: 'guest' };
    },

    sendState: async function (gameState) {
      if (!_room) return;
      var res = await db().from('rooms').update({ board_state: gameState }).eq('id', _room.id);
      if (res && res.error && _cbs.onError) _cbs.onError('Lost sync with opponent.');
    },

    disconnect: function () {
      if (_channel) { db().removeChannel(_channel); _channel = null; }
      if (_room) db().from('rooms').update({ status: 'finished' }).eq('id', _room.id);
      _room = null; _cbs = {};
    },
  };
}());
