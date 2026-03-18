/**
 * room.js — Global Room System v2
 * Exposes window.Room for all room-aware pages.
 *
 * Architecture: full-state blob sync via postgres_changes on the rooms table.
 * Same Supabase project as auth.js / multiplayer.js.
 *
 * Usage:
 *   Room.createRoom({ maxPlayers: 4 })  → Promise<{code, roomId, role}>
 *   Room.joinRoom('BIRD42')             → Promise<{code, roomId, role}>
 *   Room.sendChatMessage('hello')       → Promise<void>
 *   Room.suggestGame('mahjong')         → Promise<void>
 *   ... etc (see full API below)
 */
(function () {
  'use strict';

  var SB_URL = 'https://pnyvlqgllrpslhgimgve.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXZscWdsbHJwc2xoZ2ltZ3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjQ3OTMsImV4cCI6MjA4ODYwMDc5M30.7MwZTEJuYGSLaOjfs0EP4wFAi3CanDzSRMbTvPiIasw';

  // ── Private state ──────────────────────────────────────────────────────────
  var _db      = null;
  var _channel = null;
  var _room    = null;   // last received full room row
  var _pid     = null;   // this client's player ID
  var _cbs     = {};     // { onLobbyUpdate, onGameUpdate, onEndscreen, onChatUpdate, onError }

  // ── Supabase client ────────────────────────────────────────────────────────
  function db() {
    if (!_db) _db = window.supabase.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return _db;
  }

  // ── Player identity ────────────────────────────────────────────────────────
  function getPlayerId() {
    if (_pid) return _pid;
    _pid = localStorage.getItem('cg_pid');
    if (!_pid) {
      _pid = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      localStorage.setItem('cg_pid', _pid);
    }
    return _pid;
  }

  function getPlayerName() {
    // Prefer authenticated display name, fall back to stored guest name
    var user = window._user;
    if (user && user.display_name) return user.display_name;
    return localStorage.getItem('cg_name') || '';
  }

  function setPlayerName(name) {
    localStorage.setItem('cg_name', name.trim());
  }

  // ── Join code generation ───────────────────────────────────────────────────
  function randomCode() {
    var words  = ['BIRD','MOON','LAKE','FISH','DRUM','GOLD','JADE','SILK','WAVE','FIRE',
                  'STAR','RAIN','MIST','ROSE','SAGE','TIDE','DUSK','DAWN','HILL','REED'];
    var digits = '23456789';
    var word   = words[Math.floor(Math.random() * words.length)];
    var d1     = digits[Math.floor(Math.random() * digits.length)];
    var d2     = digits[Math.floor(Math.random() * digits.length)];
    return word + d1 + d2;
  }

  // ── Supabase subscription ──────────────────────────────────────────────────
  function subscribe(roomId) {
    if (_channel) db().removeChannel(_channel);
    _channel = db()
      .channel('room_' + roomId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rooms',
        filter: 'id=eq.' + roomId,
      }, function (payload) {
        var r = payload.new;
        _room = r;
        dispatch(r);
      })
      .subscribe();
  }

  function dispatch(r) {
    if (_cbs.onChatUpdate) {
      _cbs.onChatUpdate(r.chat_messages || []);
    }
    if (r.status === 'lobby' && _cbs.onLobbyUpdate) {
      _cbs.onLobbyUpdate(r);
    }
    if (r.status === 'assigning' && _cbs.onAssigning) {
      _cbs.onAssigning(r);
    }
    if (r.status === 'playing' && _cbs.onGameUpdate) {
      _cbs.onGameUpdate(r);
    }
    if (r.status === 'endscreen' && _cbs.onEndscreen) {
      _cbs.onEndscreen(r);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function err(msg) {
    if (_cbs.onError) _cbs.onError(msg);
    return null;
  }

  function roomId() {
    return _room && _room.id;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.Room = {

    getPlayerId:  getPlayerId,
    getPlayerName: getPlayerName,
    setPlayerName: setPlayerName,

    // ── currentRoom / amHost / myRole ────────────────────────────────────────
    currentRoom: function () { return _room; },

    amHost: function () {
      return _room && _room.host_id === getPlayerId();
    },

    myRole: function () {
      if (!_room) return null;
      var roles = _room.player_roles || {};
      return roles[getPlayerId()] || 'player';
    },

    // ── createRoom ───────────────────────────────────────────────────────────
    createRoom: async function (opts, cbs) {
      _cbs = cbs || {};
      var pid     = getPlayerId();
      var name    = getPlayerName();
      var max     = (opts && opts.maxPlayers) || 4;
      var preGame = (opts && opts.game) || null;

      var room = null;
      for (var i = 0; i < 8 && !room; i++) {
        var res = await db().from('rooms').insert({
          code:         randomCode(),
          game:         '',                            // legacy field, kept for compat
          host_id:      pid,
          guest_id:     null,
          status:       'lobby',
          board_state:  null,                          // legacy field
          player_ids:   [pid],
          player_names: { [pid]: name },
          player_wins:  {},
          player_roles: { [pid]: 'player' },
          player_ready: { [pid]: false },
          suggestions:  [],
          lobby_mode:   'host-pick',
          selected_game: preGame,
          dual_instance: false,
          game_instances: [],
          game_mode:      null,
          chat_messages:  [],
          max_players:    max,
          expires_at:     new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          is_public:    (opts && opts.is_public !== undefined) ? !!opts.is_public : true,
          game_name:    (opts && opts.gameName) || null,
        }).select().single();
        if (!res.error) room = res.data;
      }
      if (!room) return err('Could not create room. Please try again.');

      _room = room;
      subscribe(room.id);
      return { code: room.code, roomId: room.id, role: 'host' };
    },

    // ── joinRoom ─────────────────────────────────────────────────────────────
    joinRoom: async function (code, cbs) {
      _cbs = cbs || {};
      var pid  = getPlayerId();
      var name = getPlayerName();

      // Look up room by code
      var res = await db().from('rooms')
        .select().eq('code', code.toUpperCase().trim()).limit(1);
      if (res.error || !res.data || !res.data.length) {
        return err('Room not found. Check the code and try again.');
      }
      var r = res.data[0];
      if (r.status === 'finished') {
        return err('That room has ended. Ask the host to create a new one.');
      }
      var ids = Array.isArray(r.player_ids) ? r.player_ids.slice() : [];
      if (ids.length >= (r.max_players || 4) && !ids.includes(pid)) {
        return err('That room is full (' + (r.max_players || 4) + ' players max).');
      }

      // Add this player
      if (!ids.includes(pid)) ids.push(pid);
      var names  = Object.assign({}, r.player_names  || {});
      var wins   = Object.assign({}, r.player_wins   || {});
      var roles  = Object.assign({}, r.player_roles  || {});
      var rdyMap = Object.assign({}, r.player_ready  || {});
      names[pid]  = name;
      if (!wins[pid])   wins[pid]   = 0;
      if (!roles[pid])  roles[pid]  = 'player';
      if (rdyMap[pid] === undefined) rdyMap[pid] = false;

      var res2 = await db().from('rooms').update({
        player_ids:   ids,
        player_names: names,
        player_wins:  wins,
        player_roles: roles,
        player_ready: rdyMap,
        guest_id:     pid,                           // legacy field
        status:       'lobby',
      }).eq('id', r.id).select().single();
      if (res2.error) return err('Failed to join. Please try again.');

      _room = res2.data;
      subscribe(r.id);
      return { code: code.toUpperCase().trim(), roomId: r.id, role: 'guest' };
    },

    // ── leaveRoom ────────────────────────────────────────────────────────────
    leaveRoom: async function () {
      if (!_room) return;
      var pid  = getPlayerId();
      var ids  = (_room.player_ids || []).filter(function(p){ return p !== pid; });

      // If host leaves, close the room; otherwise just remove from list
      if (_room.host_id === pid) {
        await db().from('rooms').update({ status: 'finished' }).eq('id', _room.id);
      } else {
        await db().from('rooms').update({ player_ids: ids }).eq('id', _room.id);
      }

      if (_channel) { db().removeChannel(_channel); _channel = null; }
      _room = null;
      _cbs  = {};
    },

    // ── Lobby actions ─────────────────────────────────────────────────────────

    setPlayerReady: async function (ready) {
      if (!_room) return;
      var rdyMap = Object.assign({}, _room.player_ready || {});
      rdyMap[getPlayerId()] = !!ready;
      await db().from('rooms').update({ player_ready: rdyMap }).eq('id', _room.id);
    },

    suggestGame: async function (gameKey) {
      if (!_room) return;
      var list = (_room.suggestions || []).slice();
      list.push({ game: gameKey, suggested_by: getPlayerId(), name: getPlayerName(), ts: Date.now() });
      await db().from('rooms').update({ suggestions: list }).eq('id', _room.id);
    },

    removeSuggestion: async function (idx) {
      if (!_room) return;
      var list = (_room.suggestions || []).slice();
      list.splice(idx, 1);
      await db().from('rooms').update({ suggestions: list }).eq('id', _room.id);
    },

    setLobbyMode: async function (mode) {
      if (!_room) return;
      await db().from('rooms').update({ lobby_mode: mode }).eq('id', _room.id);
    },

    selectGame: async function (gameKey) {
      if (!_room) return;
      await db().from('rooms').update({
        selected_game: gameKey,
        status:        'assigning',
      }).eq('id', _room.id);
    },

    sendChatMessage: async function (text) {
      if (!_room || !text || !text.trim()) return;
      var msgs = (_room.chat_messages || []).slice(-199);
      msgs.push({ pid: getPlayerId(), name: getPlayerName(), text: text.trim(), ts: Date.now() });
      await db().from('rooms').update({ chat_messages: msgs }).eq('id', _room.id);
    },

    // ── In-game actions ──────────────────────────────────────────────────────

    setPlayerRoles: async function (rolesMap) {
      if (!_room) return;
      await db().from('rooms').update({ player_roles: rolesMap }).eq('id', _room.id);
    },

    setDualInstance: async function (dual) {
      if (!_room) return;
      await db().from('rooms').update({ dual_instance: !!dual }).eq('id', _room.id);
    },

    startGame: async function (gameMode) {
      if (!_room) return;
      await db().from('rooms').update({
        status:         'playing',
        game_instances: [],
        game_mode:      gameMode || 'normal',
      }).eq('id', _room.id);
    },

    updateGameInstance: async function (instanceId, blob) {
      if (!_room) return;
      var instances = (_room.game_instances || []).slice();
      var idx = instances.findIndex(function(i){ return i.instance_id === instanceId; });
      if (idx === -1) {
        instances.push({ instance_id: instanceId, board_state: blob });
      } else {
        instances[idx] = Object.assign({}, instances[idx], { board_state: blob });
      }
      await db().from('rooms').update({ game_instances: instances }).eq('id', _room.id);
    },

    endGame: async function (instanceId, winnerPid) {
      if (!_room) return;
      var instances = (_room.game_instances || []).slice();
      var idx = instances.findIndex(function(i){ return i.instance_id === instanceId; });
      if (idx !== -1) {
        instances[idx] = Object.assign({}, instances[idx], {
          status:     'finished',
          winner_pid: winnerPid,
        });
      } else {
        // Instance not yet in array (game ended before first state sync) — add it directly
        instances.push({ instance_id: instanceId, status: 'finished', winner_pid: winnerPid });
      }
      // Check if all instances are done
      var allDone = instances.length > 0 && instances.every(function(i){ return i.status === 'finished'; });
      var update = { game_instances: instances };
      if (allDone) update.status = 'endscreen';
      await db().from('rooms').update(update).eq('id', _room.id);
    },

    incrementWin: async function (playerId) {
      if (!_room) return;
      var wins = Object.assign({}, _room.player_wins || {});
      wins[playerId] = (wins[playerId] || 0) + 1;
      await db().from('rooms').update({ player_wins: wins }).eq('id', _room.id);
    },

    placeBet: async function (amount) {
      if (!_room) return;
      var bets = Object.assign({}, _room.bets || {});
      bets[getPlayerId()] = Math.max(0, amount || 0);
      await db().from('rooms').update({ bets: bets }).eq('id', _room.id);
    },

    rematch: async function () {
      if (!_room) return;
      await db().from('rooms').update({
        status:         'playing',
        game_instances: [],
        bets:           {},
      }).eq('id', _room.id);
    },

    backToLobby: async function () {
      if (!_room) return;
      await db().from('rooms').update({
        status:         'lobby',
        selected_game:  null,
        game_instances: [],
        game_mode:      null,
        player_roles:   {},
        player_ready:   {},
        dual_instance:  false,
        bets:           {},
      }).eq('id', _room.id);
    },

    // ── Subscription control ─────────────────────────────────────────────────

    // Call this after navigating to room.html with a roomId param
    rejoinRoom: async function (roomIdParam, cbs) {
      _cbs = cbs || {};
      var res = await db().from('rooms').select().eq('id', roomIdParam).single();
      if (res.error || !res.data) return err('Room not found.');
      _room = res.data;

      // If this player is not in the room's player list, add them.
      // This handles: authenticated users whose PID drifted, direct URL navigation,
      // and any edge case where createRoom/joinRoom didn't persist the player entry.
      var pid   = getPlayerId();
      var ids   = Array.isArray(_room.player_ids) ? _room.player_ids.slice() : [];
      if (!ids.includes(pid)) {
        var name   = getPlayerName() || 'Player';
        var names  = Object.assign({}, _room.player_names  || {}, { [pid]: name });
        var wins   = Object.assign({}, _room.player_wins   || {}, { [pid]: 0 });
        var roles  = Object.assign({}, _room.player_roles  || {}, { [pid]: 'player' });
        var rdyMap = Object.assign({}, _room.player_ready  || {}, { [pid]: false });
        ids.push(pid);
        var res2 = await db().from('rooms').update({
          player_ids:   ids,
          player_names: names,
          player_wins:  wins,
          player_roles: roles,
          player_ready: rdyMap,
        }).eq('id', roomIdParam).select().single();
        if (!res2.error && res2.data) _room = res2.data;
      }

      subscribe(roomIdParam);
      return _room;
    },

    // ── Re-export callbacks setter ────────────────────────────────────────────
    setCallbacks: function (cbs) {
      _cbs = Object.assign(_cbs, cbs);
    },

    // ── Public Room Browser ───────────────────────────────────────────────────

    // Max players map (used for hasSlots filter)
    fetchPublicRooms: async function(filters) {
      filters = filters || {};
      var twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      var query = db().from('rooms')
        .select('id, code, game_name, host_id, player_ids, player_names, status, is_public, created_at')
        .eq('is_public', true)
        .in('status', ['lobby', 'playing'])
        .gte('created_at', twoHoursAgo)
        .order('created_at', { ascending: false })
        .limit(50);
      if (filters.gameName) query = query.eq('game_name', filters.gameName);
      var res = await query;
      if (res.error) throw res.error;
      var data = res.data || [];
      var _MAX_PLAYERS = {
        'fanorona': 2, 'hnefatafl': 2, 'o-an-quan': 2, 'oware': 2,
        'pallanguzhi': 2, 'patolli': 2, 'puluc': 2,
        'tien-len': 4, 'mahjong': 4, 'ganjifa': 4, 'pachisi': 4, 'bau-cua': 8,
      };
      if (filters.hasSlots) {
        data = data.filter(function(r) {
          return (r.player_ids || []).length < (_MAX_PLAYERS[r.game_name] || 2);
        });
      }
      return data;
    },

    getAvailableGames: async function() {
      var twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      var res = await db().from('rooms')
        .select('game_name')
        .eq('is_public', true)
        .in('status', ['lobby', 'playing'])
        .gte('created_at', twoHoursAgo);
      if (res.error) throw res.error;
      var seen = {};
      return (res.data || []).map(function(r) { return r.game_name; })
        .filter(function(n) { return n && !seen[n] && (seen[n] = true); });
    },

    setPublic: async function(roomId, isPublic) {
      var res = await db().from('rooms').update({ is_public: !!isPublic }).eq('id', roomId);
      if (res.error) throw res.error;
    },
  };

}());
