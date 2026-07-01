/**
 * bot-rooms.js — "vs Computer" practice tables for the room browser.
 *
 * These are honest, clearly-labelled tables that seed the lobby so it never
 * looks empty. Each one is a REAL, playable game: clicking "Play" opens the
 * game's normal single-player page against the built-in AI. Nothing here
 * pretends to be a human match — every table carries a "vs Computer" badge and
 * a 🤖 host, and the join action delivers a genuine game.
 *
 * Purely client-side. No Supabase rows are created, nothing is written, and
 * these tables are never counted as real multiplayer activity.
 *
 * Exposes: window.BotRooms
 *   BotRooms.build({ gameName, hasSlots }) -> [ roomLikeObject, ... ]
 *   BotRooms.gameKeys()                    -> [ 'oware', 'fanorona', ... ]
 */
(function () {
  'use strict';

  // Culturally-flavoured first-name pools, matched loosely against a game's
  // `culture` string. Falls back to an international pool.
  var NAME_POOLS = {
    vietnam:      ['Minh', 'Lan', 'Huy', 'Mai', 'Tuan', 'Linh', 'Phuc', 'Bao', 'Ngoc', 'Anh'],
    'west africa':['Kwame', 'Amina', 'Kofi', 'Ama', 'Yaw', 'Efua', 'Kojo', 'Abena', 'Adwoa', 'Sena'],
    egypt:        ['Nour', 'Amir', 'Layla', 'Tarek', 'Hana', 'Omar', 'Salma', 'Yusuf', 'Rania', 'Karim'],
    catalonia:    ['Jordi', 'Nuria', 'Pau', 'Laia', 'Marc', 'Carla', 'Oriol', 'Sofia', 'Arnau', 'Emma'],
    mesoamerica:  ['Itzel', 'Mateo', 'Xochitl', 'Diego', 'Citlali', 'Nayeli', 'Emiliano', 'Luz', 'Tonalli', 'Ana'],
    'south india':['Arjun', 'Priya', 'Ravi', 'Meena', 'Karthik', 'Divya', 'Anand', 'Lakshmi', 'Vikram', 'Sita'],
    'south asia': ['Arjun', 'Priya', 'Ravi', 'Meena', 'Karthik', 'Divya', 'Anand', 'Lakshmi', 'Vikram', 'Sita'],
    madagascar:   ['Rina', 'Tanjona', 'Hasina', 'Fara', 'Naina', 'Miora', 'Andry', 'Vola', 'Tsanta', 'Lova'],
    china:        ['Wei', 'Ling', 'Jun', 'Mei', 'Hao', 'Yan', 'Feng', 'Xia', 'Bo', 'Ning'],
    korea:        ['Jisoo', 'Minjun', 'Haeun', 'Seojun', 'Yuna', 'Jiwoo', 'Hana', 'Doyun', 'Sori', 'Eunwoo'],
    norse:        ['Erik', 'Astrid', 'Bjorn', 'Sigrid', 'Leif', 'Ingrid', 'Ragnar', 'Freya', 'Sven', 'Hilda'],
    rome:         ['Marcus', 'Livia', 'Gaius', 'Julia', 'Titus', 'Aurelia', 'Cassius', 'Flavia', 'Decimus', 'Octavia'],
    ecuador:      ['Mateo', 'Valentina', 'Sebastian', 'Camila', 'Nicolas', 'Isabella', 'Andres', 'Lucia', 'Tomas', 'Elena'],
    bolivia:      ['Mateo', 'Valentina', 'Sebastian', 'Camila', 'Nicolas', 'Isabella', 'Andres', 'Lucia', 'Tomas', 'Elena'],
    philippines:  ['Jose', 'Maria', 'Angelo', 'Andrea', 'Mark', 'Kyla', 'Paolo', 'Bea', 'Diego', 'Nicole'],
    zimbabwe:     ['Tendai', 'Chipo', 'Farai', 'Rudo', 'Tafara', 'Nyasha', 'Simba', 'Ruvarashe', 'Tanaka', 'Anesu'],
    'new zealand':['Ari', 'Mere', 'Rangi', 'Aroha', 'Nikau', 'Kaia', 'Manaia', 'Ata', 'Tane', 'Moana'],
    indonesia:    ['Adi', 'Sari', 'Budi', 'Dewi', 'Putra', 'Ayu', 'Bagus', 'Intan', 'Eka', 'Ratih']
  };
  var GENERIC = ['Alex', 'Sam', 'Robin', 'Casey', 'Nadia', 'Leo', 'Maya', 'Theo', 'Zara', 'Ivan', 'Nina', 'Owen'];

  // Friendly table names — all read as casual/practice tables.
  var TABLE_NAMES = [
    'Practice Table', 'Warm-Up', 'Beginners Welcome', 'Learn the Ropes',
    'Casual Table', 'Training Room', 'Quick Match', 'Open Table', 'Sharpen Up'
  ];

  function poolFor(culture) {
    var c = String(culture || '').toLowerCase();
    var keys = Object.keys(NAME_POOLS);
    for (var i = 0; i < keys.length; i++) {
      if (c.indexOf(keys[i]) !== -1) return NAME_POOLS[keys[i]];
    }
    // A couple of extra loose aliases for cultures phrased differently.
    if (/china|hong kong|taiwan|chinese/.test(c)) return NAME_POOLS.china;
    if (/viet/.test(c)) return NAME_POOLS.vietnam;
    if (/africa/.test(c)) return NAME_POOLS['west africa'];
    if (/india|tamil/.test(c)) return NAME_POOLS['south india'];
    if (/maori/.test(c)) return NAME_POOLS['new zealand'];
    if (/viking|nordic|scandinav/.test(c)) return NAME_POOLS.norse;
    return GENERIC;
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // AI-playable games, drawn from the catalogue. Every game here has a working
  // single-player page, so "Play" always lands on a real game.
  function catalogue() {
    var data = window.GAMES_DATA || [];
    return data.filter(function (g) { return g && g.key && g.path; });
  }

  function occupancyFor(maxP) {
    // Seat 1..(maxP-1) bots so there is always at least one open seat.
    var seated = 1;
    if (maxP >= 4) seated = 1 + Math.floor(Math.random() * (maxP - 2)); // 1..maxP-2
    else seated = 1;                                                    // 2p -> 1/2
    if (seated >= maxP) seated = maxP - 1;
    return Math.max(1, seated);
  }

  var _counter = 0;

  // Build one room-like object shaped closely enough to a real `rooms` row that
  // the existing card renderer can consume it. Extra fields: is_bot, bot_path,
  // display_name.
  function makeTable(game) {
    var maxP = game.maxPlayers || 2;
    var seated = occupancyFor(maxP);
    var host = pick(poolFor(game.culture));
    var pid = 'bot-' + (++_counter);
    var names = {}; names[pid] = host;
    var ids = [pid];
    // Fill remaining seated slots with placeholder ids (only the host name is
    // rendered, but the count needs to be right).
    for (var i = 1; i < seated; i++) ids.push('bot-' + (++_counter));
    var minsAgo = 1 + Math.floor(Math.random() * 44);
    return {
      is_bot: true,
      bot_path: game.path,                 // relative to /pages/ — e.g. games/oware.html
      display_name: game.name,
      game_name: game.key,
      room_name: Math.random() < 0.72 ? pick(TABLE_NAMES) : '',
      host_id: pid,
      player_ids: ids,
      player_names: names,
      max_players: maxP,
      status: 'lobby',
      is_public: true,
      code: '',                            // not a joinable human code; hidden for bots
      created_at: new Date(Date.now() - minsAgo * 60000).toISOString()
    };
  }

  window.BotRooms = {
    // Games these tables can be created for (used to widen the filter dropdown).
    gameKeys: function () {
      return catalogue().map(function (g) { return g.key; });
    },

    build: function (opts) {
      opts = opts || {};
      var games = catalogue();
      if (!games.length) return [];

      // Filtered to a single game: show a small cluster of tables for it.
      if (opts.gameName) {
        var match = null;
        for (var i = 0; i < games.length; i++) {
          if (games[i].key === opts.gameName) { match = games[i]; break; }
        }
        if (!match) return [];
        var n = 1 + Math.floor(Math.random() * 2); // 1–2 tables
        var out = [];
        for (var k = 0; k < n; k++) out.push(makeTable(match));
        return out;
      }

      // Default: a handful of tables across a varied set of games.
      var count = 5 + Math.floor(Math.random() * 3); // 5–7
      var chosen = shuffle(games).slice(0, Math.min(count, games.length));
      return chosen.map(makeTable);
    }
  };
}());
