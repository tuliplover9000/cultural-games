/**
 * multiplayer.js — Online room management via Supabase Realtime.
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

  function subscribe(roomId) {
    if (_channel) db().removeChannel(_channel);
    _channel = db()
      .channel('room_' + roomId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rooms',
        filter: 'id=eq.' + roomId,
      }, function (payload) {
        var u = payload.new;
        _room = u;
        if (u.status === 'playing' && _cbs.onReady) {
          var cb = _cbs.onReady;
          _cbs.onReady = null; // fire once
          cb(u);
        }
        if (u.board_state && _cbs.onRemoteState) {
          _cbs.onRemoteState(u.board_state);
        }
      })
      .subscribe();
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
        if (!res.error) room = res.data;
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
      // Look up by code only — avoids any game-name or status mismatch issues
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
      var res2 = await db().from('rooms')
        .update({ guest_id: getPlayerId(), status: 'playing' })
        .eq('id', res.data[0].id).select().single();
      if (res2.error) {
        if (_cbs.onError) _cbs.onError('Failed to join. Try again.');
        return null;
      }
      _room = res2.data;
      subscribe(res2.data.id);
      return { code: code, role: 'guest' };
    },

    sendState: async function (gameState) {
      if (!_room) return;
      await db().from('rooms').update({ board_state: gameState }).eq('id', _room.id);
    },

    disconnect: function () {
      if (_channel) { db().removeChannel(_channel); _channel = null; }
      if (_room) db().from('rooms').update({ status: 'finished' }).eq('id', _room.id);
      _room = null; _cbs = {};
    },
  };
}());
