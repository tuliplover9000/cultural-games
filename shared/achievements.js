/**
 * achievements.js - Cultural Games Achievement Engine
 *
 * Exposes: window.Achievements
 *
 * Storage:
 *   localStorage key  "cg-unlocked-{userId}"  → JSON array of unlocked achievement IDs
 *   localStorage key  "cg-streak"              → integer win streak count
 *
 * Supabase table (run once in SQL editor):
 *   CREATE TABLE user_achievements (
 *     user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 *     achievement_id text NOT NULL,
 *     unlocked_at    timestamptz DEFAULT now(),
 *     PRIMARY KEY (user_id, achievement_id)
 *   );
 *   ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "owner read"   ON user_achievements FOR SELECT USING (auth.uid() = user_id);
 *   CREATE POLICY "owner insert" ON user_achievements FOR INSERT WITH CHECK (auth.uid() = user_id);
 */
(function () {
  'use strict';

  var SB_URL = 'https://pnyvlqgllrpslhgimgve.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBueXZscWdsbHJwc2xoZ2ltZ3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjQ3OTMsImV4cCI6MjA4ODYwMDc5M30.7MwZTEJuYGSLaOjfs0EP4wFAi3CanDzSRMbTvPiIasw';

  /* ════════════════════════════════════════════════════
     ACHIEVEMENT DEFINITIONS
  ════════════════════════════════════════════════════ */

  var ACHIEVEMENTS = [
    /* ── Combat (game-specific wins) ── */
    { id: 'fn_first_win',  gameId: 'fanorona',    title: 'First Blood',       description: 'Win your first game of Fanorona',         tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'fanorona',    stat: 'wins', threshold: 1  } },
    { id: 'fn_wins_10',    gameId: 'fanorona',    title: "Vaho's Tactician",  description: 'Win 10 games of Fanorona',                 tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'fanorona',    stat: 'wins', threshold: 10 } },
    { id: 'fn_wins_50',    gameId: 'fanorona',    title: 'Master of Fanoron', description: 'Win 50 games of Fanorona',                 tier: 'gold',   category: 'combat', condition: { type: 'stat', game: 'fanorona',    stat: 'wins', threshold: 50 } },
    { id: 'ht_first_win',  gameId: 'hnefatafl',   title: "King's Guard",      description: 'Win your first game of Hnefatafl',         tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'hnefatafl',   stat: 'wins', threshold: 1  } },
    { id: 'ht_wins_10',    gameId: 'hnefatafl',   title: 'Jarl of the Board', description: 'Win 10 games of Hnefatafl',                tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'hnefatafl',   stat: 'wins', threshold: 10 } },
    { id: 'ht_wins_50',    gameId: 'hnefatafl',   title: 'Viking Warlord',    description: 'Win 50 games of Hnefatafl',                tier: 'gold',   category: 'combat', condition: { type: 'stat', game: 'hnefatafl',   stat: 'wins', threshold: 50 } },
    { id: 'pc_first_win',  gameId: 'pachisi',     title: 'Cowrie Victor',     description: 'Win your first game of Pachisi',           tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'pachisi',     stat: 'wins', threshold: 1  } },
    { id: 'pc_wins_10',    gameId: 'pachisi',     title: 'Court Favourite',   description: 'Win 10 games of Pachisi',                  tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'pachisi',     stat: 'wins', threshold: 10 } },
    { id: 'pc_wins_50',    gameId: 'pachisi',     title: "Akbar's Champion",  description: 'Win 50 games of Pachisi',                  tier: 'gold',   category: 'combat', condition: { type: 'stat', game: 'pachisi',     stat: 'wins', threshold: 50 } },
    { id: 'gj_first_win',  gameId: 'ganjifa',     title: 'Card Sharp',        description: 'Win your first game of Ganjifa',           tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'ganjifa',     stat: 'wins', threshold: 1  } },
    { id: 'gj_wins_10',    gameId: 'ganjifa',     title: 'Mughal Dealer',     description: 'Win 10 games of Ganjifa',                  tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'ganjifa',     stat: 'wins', threshold: 10 } },
    { id: 'gj_wins_50',    gameId: 'ganjifa',     title: 'Grand Vizier',      description: 'Win 50 games of Ganjifa',                  tier: 'gold',   category: 'combat', condition: { type: 'stat', game: 'ganjifa',     stat: 'wins', threshold: 50 } },
    { id: 'tl_first_win',  gameId: 'tien-len',    title: 'Southern Rose',     description: 'Win your first game of Ti\u1ebfn L\u00ean', tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'tien-len',    stat: 'wins', threshold: 1  } },
    { id: 'tl_wins_10',    gameId: 'tien-len',    title: 'Saigon Shark',      description: 'Win 10 games of Ti\u1ebfn L\u00ean',        tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'tien-len',    stat: 'wins', threshold: 10 } },
    { id: 'tl_wins_50',    gameId: 'tien-len',    title: 'Lord of the South', description: 'Win 50 games of Ti\u1ebfn L\u00ean',        tier: 'gold',   category: 'combat', condition: { type: 'stat', game: 'tien-len',    stat: 'wins', threshold: 50 } },
    { id: 'mj_first_win',  gameId: 'mahjong',     title: 'Lucky Draw',        description: 'Win your first game of Mahjong',           tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'mahjong',     stat: 'wins', threshold: 1  } },
    { id: 'mj_wins_10',    gameId: 'mahjong',     title: 'Tile Master',       description: 'Win 10 games of Mahjong',                  tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'mahjong',     stat: 'wins', threshold: 10 } },
    { id: 'mj_wins_50',    gameId: 'mahjong',     title: 'Dragon of the East','description': 'Win 50 games of Mahjong',                tier: 'gold',   category: 'combat', condition: { type: 'stat', game: 'mahjong',     stat: 'wins', threshold: 50 } },
    { id: 'ow_first_win',  gameId: 'oware',       title: 'First Harvest',     description: 'Win your first game of Oware',             tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'oware',       stat: 'wins', threshold: 1  } },
    { id: 'ow_wins_10',    gameId: 'oware',       title: 'Seed Counter',      description: 'Win 10 games of Oware',                    tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'oware',       stat: 'wins', threshold: 10 } },
    { id: 'ow_wins_50',    gameId: 'oware',       title: 'Grand Harvester',   description: 'Win 50 games of Oware',                    tier: 'gold',   category: 'combat', condition: { type: 'stat', game: 'oware',       stat: 'wins', threshold: 50 } },
    { id: 'oaq_first_win', gameId: 'o-an-quan',   title: 'River Victor',      description: 'Win your first game of \u00d4 \u0102n Quan',  tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'o-an-quan',   stat: 'wins', threshold: 1  } },
    { id: 'oaq_wins_10',   gameId: 'o-an-quan',   title: 'Market Master',     description: 'Win 10 games of \u00d4 \u0102n Quan',         tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'o-an-quan',   stat: 'wins', threshold: 10 } },
    { id: 'pt_first_win',  gameId: 'patolli',     title: 'Sacred Stone',      description: 'Win your first game of Patolli',           tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'patolli',     stat: 'wins', threshold: 1  } },
    { id: 'pt_wins_10',    gameId: 'patolli',     title: 'Serpent Caller',    description: 'Win 10 games of Patolli',                  tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'patolli',     stat: 'wins', threshold: 10 } },
    { id: 'pu_first_win',  gameId: 'puluc',       title: 'First Strike',      description: 'Win your first game of Puluc',             tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'puluc',       stat: 'wins', threshold: 1  } },
    { id: 'pu_wins_10',    gameId: 'puluc',       title: 'War Runner',        description: 'Win 10 games of Puluc',                    tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'puluc',       stat: 'wins', threshold: 10 } },
    { id: 'pg_first_win',  gameId: 'pallanguzhi', title: 'Shell Counter',     description: 'Win your first game of Pallanguzhi',       tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'pallanguzhi', stat: 'wins', threshold: 1  } },
    { id: 'pg_wins_10',    gameId: 'pallanguzhi', title: 'Pit Master',        description: 'Win 10 games of Pallanguzhi',              tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'pallanguzhi', stat: 'wins', threshold: 10 } },
    { id: 'bc_first_win',  gameId: 'bau-cua',     title: 'Lucky Roll',        description: 'Win your first game of B\u1ea7u Cua T\u00f4m C\u00e1', tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'bau-cua',     stat: 'wins', threshold: 1  } },
    { id: 'bc_wins_10',    gameId: 'bau-cua',     title: 'Sea Gambler',       description: 'Win 10 games of B\u1ea7u Cua T\u00f4m C\u00e1',        tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'bau-cua',     stat: 'wins', threshold: 10 } },
    { id: 'lt_first_win',  gameId: 'latrunculi',  title: 'Victor of Rome',    description: 'Win your first game of Ludus Latrunculorum',             tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'latrunculi',  stat: 'wins', threshold: 1  } },
    { id: 'lt_wins_10',    gameId: 'latrunculi',  title: 'Praetorian Guard',  description: 'Win 10 games of Ludus Latrunculorum',                    tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'latrunculi',  stat: 'wins', threshold: 10 } },
    { id: 'lt_wins_50',    gameId: 'latrunculi',  title: 'Consul of the Board','description': 'Win 50 games of Ludus Latrunculorum',                  tier: 'gold',   category: 'combat', condition: { type: 'stat', game: 'latrunculi',  stat: 'wins', threshold: 50 } },
    { id: 'ca_first_win',  gameId: 'cachos',      title: 'First Shake',       description: 'Win your first game of Cachos',                          tier: 'bronze', category: 'combat', condition: { type: 'stat', game: 'cachos',       stat: 'wins', threshold: 1  } },
    { id: 'ca_wins_10',    gameId: 'cachos',      title: 'Cup Master',        description: 'Win 10 games of Cachos',                                 tier: 'silver', category: 'combat', condition: { type: 'stat', game: 'cachos',       stat: 'wins', threshold: 10 } },
    { id: 'ca_wins_50',    gameId: 'cachos',      title: 'El Gran Tah\u00far',description: 'Win 50 games of Cachos',                                 tier: 'gold',   category: 'combat', condition: { type: 'stat', game: 'cachos',       stat: 'wins', threshold: 50 } },
    { id: 'ca_bluff_catch',gameId: 'cachos',      title: 'Caught Red-Handed', description: 'Successfully call a bluff',                              tier: 'bronze', category: 'combat', condition: { type: 'action', action: 'ca_bluff_caught'  } },
    { id: 'ca_survivor',   gameId: 'cachos',      title: 'Last Cup Standing', description: 'Win a 6-player game of Cachos',                          tier: 'silver', category: 'combat', condition: { type: 'action', action: 'ca_win_6player'   } },

    /* ── Explorer (cross-game) ── */
    { id: 'exp_play_3',   gameId: null, title: 'Curious Traveller', description: 'Play 3 different games',               tier: 'bronze', category: 'explorer', condition: { type: 'games_played', threshold: 3  } },
    { id: 'exp_play_6',   gameId: null, title: 'Cultural Explorer', description: 'Play 6 different games',               tier: 'silver', category: 'explorer', condition: { type: 'games_played', threshold: 6  } },
    { id: 'exp_play_all', gameId: null, title: 'World Game Master', description: 'Play every game on the site',          tier: 'gold',   category: 'explorer', condition: { type: 'games_played', threshold: 14 } },
    { id: 'exp_win_3',    gameId: null, title: 'Renaissance Player','description': 'Win in 3 different games',           tier: 'silver', category: 'explorer', condition: { type: 'games_won', threshold: 3  } },
    { id: 'exp_win_all',  gameId: null, title: 'Grand Tour',        description: 'Win at least one game of every title', tier: 'gold',   category: 'explorer', condition: { type: 'games_won', threshold: 14 } },
    { id: 'exp_favorite', gameId: null, title: 'Patron of Culture', description: 'Save a favourite game',                tier: 'bronze', category: 'explorer', condition: { type: 'action', action: 'set_favorite' } },

    /* ── Social (multiplayer) ── */
    { id: 'soc_first_online', gameId: null, title: 'Connected',      description: 'Play your first online room game',          tier: 'bronze', category: 'social', condition: { type: 'action', action: 'online_game' } },
    { id: 'soc_online_win',   gameId: null, title: 'Online Victor',  description: 'Win an online room game',                   tier: 'silver', category: 'social', condition: { type: 'action', action: 'online_win'  } },
    { id: 'soc_host',         gameId: null, title: 'Gracious Host',  description: 'Create and complete a room game',           tier: 'bronze', category: 'social', condition: { type: 'action', action: 'host_game'   } },
    { id: 'soc_join',         gameId: null, title: 'Good Sport',     description: "Join someone else's room",                  tier: 'bronze', category: 'social', condition: { type: 'action', action: 'join_room'   } },

    /* ── Milestone (cumulative) ── */
    { id: 'mil_played_10',  gameId: null, title: 'Getting Started', description: 'Play 10 games total',     tier: 'bronze', category: 'milestone', condition: { type: 'total_stat', stat: 'played', threshold: 10  } },
    { id: 'mil_played_50',  gameId: null, title: 'Devoted Player',  description: 'Play 50 games total',     tier: 'silver', category: 'milestone', condition: { type: 'total_stat', stat: 'played', threshold: 50  } },
    { id: 'mil_played_100', gameId: null, title: 'Century',         description: 'Play 100 games total',    tier: 'gold',   category: 'milestone', condition: { type: 'total_stat', stat: 'played', threshold: 100 } },
    { id: 'mil_wins_10',    gameId: null, title: 'Rising Star',     description: 'Win 10 games total',      tier: 'bronze', category: 'milestone', condition: { type: 'total_stat', stat: 'wins',   threshold: 10  } },
    { id: 'mil_wins_50',    gameId: null, title: 'Hall of Fame',    description: 'Win 50 games total',      tier: 'silver', category: 'milestone', condition: { type: 'total_stat', stat: 'wins',   threshold: 50  } },
    { id: 'mil_wins_100',   gameId: null, title: 'Legend',          description: 'Win 100 games total',     tier: 'gold',   category: 'milestone', condition: { type: 'total_stat', stat: 'wins',   threshold: 100 } },
    { id: 'mil_streak_3',   gameId: null, title: 'On a Roll',       description: 'Win 3 games in a row',    tier: 'silver', category: 'milestone', condition: { type: 'streak', threshold: 3 } },
    { id: 'mil_streak_5',   gameId: null, title: 'Unstoppable',     description: 'Win 5 games in a row',    tier: 'gold',   category: 'milestone', condition: { type: 'streak', threshold: 5 } },
  ];

  /* ════════════════════════════════════════════════════
     INTERNAL STATE
  ════════════════════════════════════════════════════ */

  var _userId      = null;
  var _accessToken = null;
  var _unlocked    = {};      // { achievementId: true }
  var _toastQueue  = [];
  var _toasting    = false;

  /* ── localStorage helpers ── */
  function _unlockedKey(uid) { return 'cg-unlocked-' + uid; }

  function _loadLocalUnlocked(uid) {
    try {
      var v = JSON.parse(localStorage.getItem(_unlockedKey(uid)));
      if (Array.isArray(v)) {
        _unlocked = {};
        v.forEach(function (id) { _unlocked[id] = true; });
      }
    } catch (e) {}
  }

  function _saveLocalUnlocked(uid) {
    try {
      localStorage.setItem(_unlockedKey(uid), JSON.stringify(Object.keys(_unlocked)));
    } catch (e) {}
  }

  /* ── Supabase raw fetch ── */
  function _pgFetch(method, path, body, token) {
    var headers = {
      'apikey':        SB_KEY,
      'Authorization': 'Bearer ' + (token || _accessToken),
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    };
    if (method === 'POST') headers['Prefer'] = 'return=minimal';
    var opts = { method: method, headers: headers };
    if (body) opts.body = JSON.stringify(body);
    return fetch(SB_URL + '/rest/v1/' + path, opts);
  }

  /* ── Fetch unlocked from Supabase ── */
  async function _fetchRemoteUnlocked(uid, token) {
    try {
      var resp = await _pgFetch('GET', 'user_achievements?select=achievement_id&user_id=eq.' + uid, null, token);
      if (!resp.ok) return;
      var data = await resp.json();
      if (Array.isArray(data)) {
        data.forEach(function (row) { _unlocked[row.achievement_id] = true; });
        _saveLocalUnlocked(uid);
      }
    } catch (e) { /* keep local cache */ }
  }

  /* ── POST single achievement to Supabase ── */
  async function _persistRemote(achievementId) {
    if (!_userId || !_accessToken) return;
    try {
      await _pgFetch('POST', 'user_achievements', {
        user_id:        _userId,
        achievement_id: achievementId,
      });
    } catch (e) { /* fire-and-forget */ }
  }

  /* ════════════════════════════════════════════════════
     TOAST SYSTEM
  ════════════════════════════════════════════════════ */

  var TIER_COLORS = {
    bronze: '#CD7F32',
    silver: '#A8A9AD',
    gold:   '#D4A017',
  };

  var TIER_LABELS = {
    bronze: 'Bronze',
    silver: 'Silver',
    gold:   'Gold',
  };

  function _ensureContainer() {
    var c = document.getElementById('ach-toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'ach-toast-container';
      c.className = 'ach-toast-container';
      c.setAttribute('aria-live', 'polite');
      c.setAttribute('aria-label', 'Achievement notifications');
      document.body.appendChild(c);
    }
    return c;
  }

  function _showNextToast() {
    if (!_toastQueue.length) { _toasting = false; return; }
    _toasting = true;
    var ach = _toastQueue.shift();
    _renderToast(ach);
  }

  function _renderToast(ach) {
    var container = _ensureContainer();
    var color     = TIER_COLORS[ach.tier] || TIER_COLORS.bronze;
    var tierLabel = TIER_LABELS[ach.tier] || 'Bronze';

    var toast = document.createElement('div');
    toast.className = 'ach-toast ach-toast--' + ach.tier;
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      '<div class="ach-toast__icon" aria-hidden="true" style="color:' + color + '">&#127942;</div>' +
      '<div class="ach-toast__body">' +
        '<p class="ach-toast__eyebrow">Achievement Unlocked &bull; <span class="ach-toast__tier" style="color:' + color + '">' + tierLabel + '</span></p>' +
        '<p class="ach-toast__title">' + _esc(ach.title) + '</p>' +
        '<p class="ach-toast__desc">' + _esc(ach.description) + '</p>' +
      '</div>' +
      '<button class="ach-toast__close" aria-label="Dismiss">&times;</button>' +
      '<div class="ach-toast__progress"><div class="ach-toast__progress-bar" style="background:' + color + '"></div></div>';

    container.appendChild(toast);

    // Trigger slide-in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add('ach-toast--visible');
      });
    });

    var timer = setTimeout(function () { _dismissToast(toast); }, 5000);

    toast.querySelector('.ach-toast__close').addEventListener('click', function () {
      clearTimeout(timer);
      _dismissToast(toast);
    });
  }

  function _dismissToast(toast) {
    toast.classList.remove('ach-toast--visible');
    toast.classList.add('ach-toast--hiding');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      setTimeout(_showNextToast, 600);
    }, 350);
  }

  function _queueToast(ach) {
    // Skip if tutorial is active
    if (window.CGTutorial && CGTutorial.isActive) return;
    _toastQueue.push(ach);
    if (!_toasting) _showNextToast();
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ════════════════════════════════════════════════════
     CONDITION EVALUATORS
  ════════════════════════════════════════════════════ */

  function _evalCondition(cond, stats, streak) {
    if (!cond) return false;
    stats = stats || {};

    if (cond.type === 'stat') {
      var gs = stats[cond.game];
      if (!gs) return false;
      return (gs[cond.stat] || 0) >= cond.threshold;
    }

    if (cond.type === 'total_stat') {
      var total = 0;
      Object.keys(stats).forEach(function (gid) {
        total += (stats[gid][cond.stat] || 0);
      });
      return total >= cond.threshold;
    }

    if (cond.type === 'games_played') {
      var count = 0;
      Object.keys(stats).forEach(function (gid) {
        if ((stats[gid].played || 0) > 0) count++;
      });
      return count >= cond.threshold;
    }

    if (cond.type === 'games_won') {
      var wonCount = 0;
      Object.keys(stats).forEach(function (gid) {
        if ((stats[gid].wins || 0) > 0) wonCount++;
      });
      return wonCount >= cond.threshold;
    }

    if (cond.type === 'streak') {
      return (streak || 0) >= cond.threshold;
    }

    // action-type conditions are checked separately via checkAction()
    return false;
  }

  /* ════════════════════════════════════════════════════
     AWARD
  ════════════════════════════════════════════════════ */

  function award(achievementId) {
    if (_unlocked[achievementId]) return; // already unlocked

    var ach = null;
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      if (ACHIEVEMENTS[i].id === achievementId) { ach = ACHIEVEMENTS[i]; break; }
    }
    if (!ach) return;

    _unlocked[achievementId] = true;
    if (_userId) _saveLocalUnlocked(_userId);

    if (_userId && _accessToken) {
      _persistRemote(achievementId);
    } else {
      // Queue for when the user signs in
      if (window.AchievementQueue) AchievementQueue.add(achievementId);
    }

    _queueToast(ach);
  }

  /* ════════════════════════════════════════════════════
     EVALUATE (called after each game result)
  ════════════════════════════════════════════════════ */

  function evaluate(context) {
    // context: { gameId, result: 'win'|'loss', isOnline, isHost, stats, streak }
    var stats  = context.stats  || {};
    var streak = context.streak || 0;

    ACHIEVEMENTS.forEach(function (ach) {
      if (_unlocked[ach.id]) return;
      var cond = ach.condition;
      if (!cond || cond.type === 'action') return;
      if (_evalCondition(cond, stats, streak)) {
        award(ach.id);
      }
    });

    // Social action checks derived from context
    if (context.isOnline) {
      checkAction('online_game', context);
      if (context.result === 'win') checkAction('online_win', context);
      if (context.isHost) checkAction('host_game', context);
    }
  }

  /* ════════════════════════════════════════════════════
     CHECK ACTION
  ════════════════════════════════════════════════════ */

  function checkAction(actionName, context) {
    ACHIEVEMENTS.forEach(function (ach) {
      if (_unlocked[ach.id]) return;
      var cond = ach.condition;
      if (!cond || cond.type !== 'action') return;
      if (cond.action === actionName) {
        award(ach.id);
      }
    });
  }

  /* ════════════════════════════════════════════════════
     FLUSH OFFLINE QUEUE
  ════════════════════════════════════════════════════ */

  async function _flushQueue() {
    if (!window.AchievementQueue) return;
    var queued = AchievementQueue.get();
    if (!queued.length) return;

    AchievementQueue.clear();

    var newOnes = queued.filter(function (id) { return !_unlocked[id]; });
    if (!newOnes.length) return;

    // Batch insert - insert each one individually (simple, avoids conflict logic)
    for (var i = 0; i < newOnes.length; i++) {
      var id = newOnes[i];
      _unlocked[id] = true;
      try {
        await _pgFetch('POST', 'user_achievements', {
          user_id:        _userId,
          achievement_id: id,
        });
      } catch (e) { /* best-effort */ }
    }
    _saveLocalUnlocked(_userId);

    // Show summary toast if multiple, or individual toasts for few
    if (newOnes.length === 1) {
      for (var j = 0; j < ACHIEVEMENTS.length; j++) {
        if (ACHIEVEMENTS[j].id === newOnes[0]) { _queueToast(ACHIEVEMENTS[j]); break; }
      }
    } else if (newOnes.length > 1) {
      _queueToast({
        id: '_summary',
        title: newOnes.length + ' Achievements Unlocked!',
        description: 'You earned achievements while offline. Check your profile to see them.',
        tier: 'gold',
      });
    }
  }

  /* ════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════ */

  async function init() {
    var loggedIn = window.Auth && Auth.isLoggedIn();

    if (!loggedIn) {
      _userId      = null;
      _accessToken = null;
      _unlocked    = {};
      return;
    }

    // Get user + token from the session
    var user = Auth.getUser();
    if (!user) return;

    // We need the raw user id - read from localStorage session
    try {
      var session = JSON.parse(localStorage.getItem('cg_session'));
      if (session && session.user && session.user.id) {
        _userId      = session.user.id;
        _accessToken = session.access_token;
      }
    } catch (e) {}

    if (!_userId) return;

    // Load local cache first (instant)
    _loadLocalUnlocked(_userId);

    // Fetch remote in background (merge + save)
    _fetchRemoteUnlocked(_userId, _accessToken);

    // Flush any offline queue
    _flushQueue();
  }

  /* ── Re-init on auth change ── */
  if (window.Auth) {
    Auth.onAuthChange(function () { init(); });
  } else {
    // Auth not yet loaded - wait for DOMContentLoaded and try again
    document.addEventListener('DOMContentLoaded', function () {
      if (window.Auth) Auth.onAuthChange(function () { init(); });
      init();
    });
  }

  /* ════════════════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════════════════ */

  window.Achievements = {
    ACHIEVEMENTS: ACHIEVEMENTS,
    init:         init,
    evaluate:     evaluate,
    checkAction:  checkAction,
    award:        award,
    isUnlocked:   function (id) { return !!_unlocked[id]; },
    getUnlocked:  function ()   { return Object.keys(_unlocked); },
  };

}());
