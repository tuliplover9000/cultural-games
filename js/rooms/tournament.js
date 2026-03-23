/**
 * tournament.js — Tournament tab controller for rooms.html.
 * Manages: open/close panel, browse/create/join sub-tabs,
 * tournament lobby, bracket view, match-ready notifications.
 *
 * Depends on: tournament-data.js, bracket.js, auth.js
 * Exposes: window.Tournament
 */
(function () {
  'use strict';

  // ── Element refs ──────────────────────────────────────────────────────────
  var elLanding     = document.getElementById('rooms-landing');
  var elTournament  = document.getElementById('rooms-tournament');
  var elBackBtn     = document.getElementById('tn-back-btn');
  var elPanelTitle  = document.getElementById('tn-panel-title');
  var elSubnav      = document.getElementById('tn-subnav');

  // Panes
  var PANE_IDS = ['browse', 'create', 'join', 'lobby', 'bracket'];
  function pane(id) { return document.getElementById('tn-' + id); }

  // Browse
  var elBrowseList    = document.getElementById('tn-browse-list');
  var elBrowseLoading = document.getElementById('tn-browse-loading');
  var elBrowseEmpty   = document.getElementById('tn-browse-empty');
  var elBrowseError   = document.getElementById('tn-browse-error');

  // Create
  var elCreateGame    = document.getElementById('tn-game');
  var elMaxPlayers    = document.getElementById('tn-max-players');
  var elEntryFee      = document.getElementById('tn-entry-fee');
  var elHostSeed      = document.getElementById('tn-host-seed');
  var elMatchLimit    = document.getElementById('tn-match-limit');
  var elExpiry        = document.getElementById('tn-expiry');
  var elIsPublic      = document.getElementById('tn-is-public');
  var elMinSeedNum    = document.getElementById('tn-min-seed-display');
  var elPrize1st      = document.getElementById('tn-prize-1st');
  var elPrize2nd      = document.getElementById('tn-prize-2nd');
  var elPrize3rd      = document.getElementById('tn-prize-3rd');
  var elTotalCost     = document.getElementById('tn-total-cost');
  var elCoinBalance   = document.getElementById('tn-coin-balance');
  var elCreateBtn     = document.getElementById('tn-create-btn');
  var elCreateError   = document.getElementById('tn-create-error');

  // Join
  var elJoinCode  = document.getElementById('tn-join-code');
  var elJoinBtn   = document.getElementById('tn-join-btn');
  var elJoinError = document.getElementById('tn-join-error');

  // Lobby
  var elLobbyName       = document.getElementById('tn-lobby-name');
  var elLobbyGame       = document.getElementById('tn-lobby-game');
  var elLobbyPlayers    = document.getElementById('tn-lobby-players');
  var elLobbyPrize      = document.getElementById('tn-lobby-prize');
  var elLobbyExpiry     = document.getElementById('tn-lobby-expiry');
  var elLobbyCode       = document.getElementById('tn-lobby-code');
  var elLobbyPlayerList = document.getElementById('tn-lobby-player-list');
  var elHostControls    = document.getElementById('tn-host-controls');
  var elLobbyWaiting    = document.getElementById('tn-lobby-waiting');
  var elStartBracketBtn = document.getElementById('tn-start-bracket-btn');
  var elCloseRegBtn     = document.getElementById('tn-close-registration-btn');
  var elCancelBtn       = document.getElementById('tn-cancel-btn');
  var elCopyCodeBtn     = document.getElementById('tn-copy-code');

  // Bracket pane
  var elBracketContainer = document.getElementById('tn-bracket-view');
  var elBracketInfo      = document.getElementById('tn-bracket-info');

  // ── State ─────────────────────────────────────────────────────────────────
  var _current        = null;    // current tournament object
  var _currentPlayers = [];      // tournament_players rows
  var _sub            = null;    // Realtime subscription
  var _activeTab      = 'browse';

  function db()  { return window.TournamentData.db(); }
  function esc(s){ return window.TournamentData.esc(s); }

  async function callRpc(fn, params) {
    return window.TournamentData.callRpc(fn, params);
  }

  // ── Panel open/close ──────────────────────────────────────────────────────
  function openPanel() {
    if (!elLanding || !elTournament) return;
    elLanding.hidden    = true;
    elTournament.hidden = false;
    switchTo('browse');
  }

  function closePanel() {
    cleanup();
    if (elTournament) elTournament.hidden = true;
    if (elLanding)    elLanding.hidden    = false;
  }

  function cleanup() {
    if (_sub) { db().removeChannel(_sub); _sub = null; }
    if (window.Bracket) Bracket.destroy();
    _current        = null;
    _currentPlayers = [];
  }

  // ── Sub-tab switching ─────────────────────────────────────────────────────
  function switchTo(tab) {
    _activeTab = tab;
    PANE_IDS.forEach(function (id) {
      var el = pane(id);
      if (el) el.hidden = (id !== tab);
    });
    if (elSubnav) {
      elSubnav.querySelectorAll('.tn-subnav__btn').forEach(function (b) {
        b.classList.toggle('tn-subnav__btn--active', b.dataset.tnTab === tab);
      });
    }
    // Show/hide subnav based on context
    var hideSubnav = (tab === 'lobby' || tab === 'bracket');
    if (elSubnav) elSubnav.hidden = hideSubnav;

    if (tab === 'browse') loadBrowser();
    if (tab === 'create') renderCreateForm();
    if (tab === 'join'  ) { if (elJoinError) elJoinError.hidden = true; }
  }

  // ── Browse ────────────────────────────────────────────────────────────────
  async function loadBrowser() {
    if (!elBrowseList) return;
    if (elBrowseLoading) elBrowseLoading.hidden = false;
    elBrowseList.innerHTML = '';
    if (elBrowseEmpty) elBrowseEmpty.hidden = true;
    if (elBrowseError) elBrowseError.hidden = true;
    try {
      var res = await db().from('tournaments')
        .select('id, code, name, game_id, status, max_players, current_players, entry_fee, prize_pool, expires_at, host_id')
        .eq('is_public', true)
        .in('status', ['registration', 'active'])
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20);
      if (res.error) throw res.error;
      var list = res.data || [];
      if (!list.length) {
        if (elBrowseEmpty) elBrowseEmpty.hidden = false;
        return;
      }
      list.forEach(function (t) { elBrowseList.appendChild(buildTournamentCard(t)); });
    } catch (e) {
      if (elBrowseError) elBrowseError.hidden = false;
    } finally {
      if (elBrowseLoading) elBrowseLoading.hidden = true;
    }
  }

  function buildTournamentCard(t) {
    var li           = document.createElement('li');
    li.className     = 'tn-card';
    var isReg        = t.status === 'registration';
    var statusLabel  = isReg ? 'Registration Open' : 'In Progress';
    var statusClass  = isReg ? 'tn-card__status--reg' : 'tn-card__status--active';
    var feeText      = t.entry_fee > 0 ? t.entry_fee.toLocaleString() + ' coin entry' : 'Free';
    var canJoin      = isReg && t.current_players < t.max_players && window.Auth && Auth.isLoggedIn();

    li.innerHTML =
      '<div class="tn-card__header">' +
        '<span class="tn-card__name">' + esc(t.name) + '</span>' +
        '<span class="tn-card__status ' + statusClass + '">' + statusLabel + '</span>' +
      '</div>' +
      '<div class="tn-card__meta">' +
        '<span class="tn-card__game">' + esc(TournamentData.gameName(t.game_id)) + '</span>' +
        '<span class="tn-card__players">' + (t.current_players || 0) + ' / ' + t.max_players + ' players</span>' +
        '<span class="tn-card__prize">\uD83C\uDFC6 ' + (t.prize_pool || 0).toLocaleString() + ' coins</span>' +
        '<span class="tn-card__fee">' + esc(feeText) + '</span>' +
      '</div>' +
      '<div class="tn-card__footer">' +
        '<span class="tn-card__expiry">' + TournamentData.formatCountdown(t.expires_at) + '</span>' +
        '<div class="tn-card__actions">' +
          (canJoin ? '<button class="btn btn-primary btn-sm tn-card__join-btn">Register</button>' : '') +
          '<button class="btn btn-ghost btn-sm tn-card__view-btn">' + (isReg ? 'Details' : 'View Bracket') + '</button>' +
        '</div>' +
      '</div>';

    if (canJoin) {
      li.querySelector('.tn-card__join-btn').addEventListener('click', function () {
        switchTo('join');
        if (elJoinCode) { elJoinCode.value = t.code; }
        setTimeout(handleJoin, 100);
      });
    }
    li.querySelector('.tn-card__view-btn').addEventListener('click', function () {
      if (t.status === 'active' || t.status === 'completed') {
        openBracket(t.id, t.name);
      } else {
        openLobbyById(t.id);
      }
    });
    return li;
  }

  // ── Create form ───────────────────────────────────────────────────────────
  function renderCreateForm() {
    var createPane = pane('create');
    if (!createPane) return;

    if (!window.Auth || !Auth.isLoggedIn()) {
      createPane.innerHTML =
        '<div class="tn-auth-gate">' +
          '<p>Sign in to host a tournament.</p>' +
          '<button class="btn btn-primary" onclick="Auth.openModal()">Sign In</button>' +
        '</div>';
      return;
    }

    // Populate game dropdown once
    if (elCreateGame && elCreateGame.options.length <= 1) {
      TournamentData.GAMES.forEach(function (g) {
        var opt = document.createElement('option');
        opt.value = g.key;
        opt.textContent = g.name + ' (\u2264' + g.maxPlayers + 'P per match)';
        elCreateGame.appendChild(opt);
      });
    }

    updatePrizePreview();
    if (elCoinBalance && Auth.getCoins) {
      elCoinBalance.textContent = Auth.getCoins().toLocaleString() + ' coins';
    }
  }

  function updatePrizePreview() {
    if (!elMaxPlayers || !elEntryFee || !elHostSeed) return;
    var maxP    = parseInt(elMaxPlayers.value, 10) || 8;
    var fee     = parseInt(elEntryFee.value,   10) || 0;
    var seed    = parseInt(elHostSeed.value,   10) || 0;
    var minSeed = 150 * maxP;
    if (elMinSeedNum) elMinSeedNum.textContent = minSeed.toLocaleString();
    if (elHostSeed)   elHostSeed.min = minSeed;

    var pool = seed + (fee * maxP);
    if (elPrize1st) elPrize1st.textContent = Math.floor(pool * 0.60).toLocaleString() + ' coins';
    if (elPrize2nd) elPrize2nd.textContent = Math.floor(pool * 0.30).toLocaleString() + ' coins';
    if (elPrize3rd) elPrize3rd.textContent = Math.floor(pool * 0.10).toLocaleString() + ' coins';
    if (elTotalCost) elTotalCost.textContent = seed.toLocaleString() + ' coins';
  }

  async function handleCreate() {
    if (!window.Auth || !Auth.isLoggedIn()) { Auth.openModal(); return; }

    var name  = (document.getElementById('tn-name') || {}).value || '';
    var game  = elCreateGame ? elCreateGame.value : '';
    var maxP  = parseInt(elMaxPlayers   ? elMaxPlayers.value  : '8',  10) || 8;
    var fee   = parseInt(elEntryFee     ? elEntryFee.value    : '0',  10) || 0;
    var seed  = parseInt(elHostSeed     ? elHostSeed.value    : '0',  10) || 0;
    var limit = parseInt(elMatchLimit   ? elMatchLimit.value  : '30', 10) || 30;
    var exp   = parseInt(elExpiry       ? elExpiry.value      : '48', 10) || 48;
    var pub   = elIsPublic ? elIsPublic.checked : true;
    var minSeed = 150 * maxP;

    name = name.trim();
    if (!name)       { showCreateError('Tournament name is required.'); return; }
    if (!game)       { showCreateError('Please select a game.'); return; }
    if (seed < minSeed) { showCreateError('Host contribution must be at least ' + minSeed.toLocaleString() + ' coins (150 \u00D7 ' + maxP + ' players).'); return; }
    if (Auth.getCoins && Auth.getCoins() < seed) { showCreateError('Not enough coins. Balance: ' + Auth.getCoins().toLocaleString() + '.'); return; }

    if (elCreateBtn) { elCreateBtn.disabled = true; elCreateBtn.textContent = 'Creating\u2026'; }
    if (elCreateError) elCreateError.hidden = true;

    try {
      var result = await callRpc('create_tournament', {
        p_name: name, p_game_id: game, p_max_players: maxP,
        p_entry_fee: fee, p_host_seed: seed,
        p_match_limit: limit, p_expires_hours: exp, p_is_public: pub,
      });
      if (!result.success) {
        var errMap = {
          'not_authenticated':     'Please sign in first.',
          'name_too_short':        'Name must be at least 3 characters.',
          'profanity_detected':    'Tournament name contains disallowed words.',
          'invalid_game':          'Please select a valid game.',
          'invalid_player_count':  'Player count must be 4\u201332.',
          'insufficient_host_seed': 'Host contribution must be at least ' + (result.minimum || minSeed).toLocaleString() + ' coins.',
          'insufficient_coins':    'Not enough coins.',
        };
        showCreateError(errMap[result.error] || ('Error: ' + result.error));
        return;
      }
      // Reflect coin deduction locally
      if (Auth.addCoins && seed > 0) Auth.addCoins(-seed);
      if (Auth.persistCoins) Auth.persistCoins();
      await openLobbyById(result.tournament_id);
    } catch (e) {
      showCreateError('Could not create tournament. Please try again.');
    } finally {
      if (elCreateBtn) { elCreateBtn.disabled = false; elCreateBtn.textContent = 'Create Tournament'; }
    }
  }

  function showCreateError(msg) {
    if (elCreateError) { elCreateError.textContent = msg; elCreateError.hidden = false; }
  }

  // ── Join by code ──────────────────────────────────────────────────────────
  async function handleJoin() {
    if (!window.Auth || !Auth.isLoggedIn()) { Auth.openModal(); return; }
    var code = elJoinCode ? elJoinCode.value.trim().toUpperCase() : '';
    if (!code) { showJoinError('Enter a tournament code.'); return; }

    if (elJoinBtn) { elJoinBtn.disabled = true; elJoinBtn.textContent = 'Joining\u2026'; }
    if (elJoinError) elJoinError.hidden = true;

    try {
      var result = await callRpc('register_for_tournament', { p_tournament_code: code });
      if (!result.success) {
        var errMap = {
          'not_authenticated':  'Please sign in first.',
          'tournament_not_found': 'Tournament not found. Check the code.',
          'registration_closed': 'Registration is closed for this tournament.',
          'tournament_full':    'This tournament is full.',
          'tournament_expired': 'This tournament has expired.',
          'already_registered': 'You are already registered for this tournament.',
          'insufficient_coins': 'Not enough coins for the entry fee.',
        };
        showJoinError(errMap[result.error] || ('Error: ' + result.error));
        return;
      }
      if (result.entry_fee_paid > 0 && Auth.addCoins) {
        Auth.addCoins(-result.entry_fee_paid);
        if (Auth.persistCoins) Auth.persistCoins();
      }
      // Check achievements
      if (window.Achievements) Achievements.checkAction('tn_registered');
      await openLobbyById(result.tournament_id);
    } catch (e) {
      showJoinError('Could not join tournament. Please try again.');
    } finally {
      if (elJoinBtn) { elJoinBtn.disabled = false; elJoinBtn.textContent = 'Join'; }
    }
  }

  function showJoinError(msg) {
    if (elJoinError) { elJoinError.textContent = msg; elJoinError.hidden = false; }
  }

  // ── Tournament lobby ──────────────────────────────────────────────────────
  async function openLobbyById(tournamentId) {
    var tRes = await db().from('tournaments').select('*').eq('id', tournamentId).single();
    if (tRes.error || !tRes.data) { showToast('Could not load tournament.', 4000); return; }
    _current = tRes.data;

    if (_current.status === 'active' || _current.status === 'completed') {
      openBracket(tournamentId, _current.name);
      return;
    }

    var pRes = await db().from('tournament_players')
      .select('*').eq('tournament_id', tournamentId)
      .order('registered_at', { ascending: true });
    _currentPlayers = pRes.data || [];

    renderLobby(_current, _currentPlayers);
    switchTo('lobby');
    if (elPanelTitle) elPanelTitle.textContent = _current.name;
    subscribeToTournament(tournamentId);
  }

  function renderLobby(tourney, players) {
    if (elLobbyName)    elLobbyName.textContent    = tourney.name;
    if (elLobbyGame)    elLobbyGame.textContent     = TournamentData.gameName(tourney.game_id);
    if (elLobbyPlayers) elLobbyPlayers.textContent  = (tourney.current_players || 0) + ' / ' + tourney.max_players;
    if (elLobbyPrize)   elLobbyPrize.textContent    = (tourney.prize_pool || 0).toLocaleString();
    if (elLobbyExpiry)  elLobbyExpiry.textContent   = TournamentData.formatCountdown(tourney.expires_at);
    if (elLobbyCode)    elLobbyCode.textContent     = tourney.code;

    if (elLobbyPlayerList) {
      elLobbyPlayerList.innerHTML = players.map(function (p) {
        return '<li class="tn-lobby__player">' +
          '<span class="tn-lobby__player-avatar">' + esc(p.username[0].toUpperCase()) + '</span>' +
          '<span class="tn-lobby__player-name">' + esc(p.username) + '</span>' +
          (p.entry_fee_paid > 0 ? '<span class="tn-lobby__player-paid">\u2713 ' + p.entry_fee_paid.toLocaleString() + ' paid</span>' : '') +
        '</li>';
      }).join('');
    }

    var isHost = window._user && window._user.id === tourney.host_id;
    if (elHostControls) elHostControls.hidden = !isHost;
    if (elLobbyWaiting) elLobbyWaiting.hidden = isHost;
    if (elStartBracketBtn) {
      elStartBracketBtn.disabled = (tourney.current_players || 0) < 2;
    }
    if (elCloseRegBtn) elCloseRegBtn.hidden = !tourney.registration_open;
  }

  function subscribeToTournament(tournamentId) {
    if (_sub) db().removeChannel(_sub);
    _sub = db()
      .channel('tourney-lobby-' + tournamentId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'tournament_players',
        filter: 'tournament_id=eq.' + tournamentId,
      }, function (payload) {
        if (!_currentPlayers.find(function (p) { return p.id === payload.new.id; })) {
          _currentPlayers.push(payload.new);
        }
        if (_current) {
          _current.current_players = (_current.current_players || 0) + 1;
          if (_current.entry_fee > 0) {
            _current.prize_pool = (_current.prize_pool || 0) + _current.entry_fee;
          }
          renderLobby(_current, _currentPlayers);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tournaments',
        filter: 'id=eq.' + tournamentId,
      }, function (payload) {
        _current = payload.new;
        if (_current.status === 'active') {
          openBracket(tournamentId, _current.name);
          return;
        }
        if (_current.status === 'cancelled') {
          showToast('Tournament cancelled. Entry fees have been refunded.', 6000);
          closePanel();
          return;
        }
        if (_current.status === 'completed') {
          openBracket(tournamentId, _current.name);
          showCompletionOverlay(_current);
          return;
        }
        renderLobby(_current, _currentPlayers);
      })
      .subscribe();
  }

  // ── Bracket view ──────────────────────────────────────────────────────────
  function openBracket(tournamentId, name) {
    if (elPanelTitle) elPanelTitle.textContent = name || 'Tournament Bracket';
    if (elSubnav) elSubnav.hidden = false;
    // Only show a "← Back to Browse" link via the subnav active state
    if (elSubnav) {
      elSubnav.querySelectorAll('.tn-subnav__btn').forEach(function (b) {
        b.classList.remove('tn-subnav__btn--active');
      });
    }
    // Show bracket info
    if (elBracketInfo) {
      elBracketInfo.textContent = name || '';
      elBracketInfo.hidden = false;
    }
    var bracketPane = pane('bracket');
    PANE_IDS.forEach(function (id) {
      var el = pane(id);
      if (el) el.hidden = (id !== 'bracket');
    });
    if (elSubnav) elSubnav.hidden = false;
    if (elBracketContainer && window.Bracket) {
      Bracket.renderBracket(tournamentId, elBracketContainer);
    }
  }

  // ── Match-ready notification (called by bracket.js) ───────────────────────
  function onMatchReady(match) {
    var myId = window._user ? window._user.id : null;
    if (!myId) return;
    if (myId !== match.player1_id && myId !== match.player2_id) return;
    showMatchReadyToast(match);
    // Achievement
    if (window.Achievements) Achievements.checkAction('tn_match_won');
  }

  function onMatchCompleted(match) {
    // If I won, fire achievement
    var myId = window._user ? window._user.id : null;
    if (myId && match.winner_id === myId) {
      if (window.Achievements) Achievements.checkAction('tn_match_won');
    }
  }

  function showMatchReadyToast(match) {
    var old = document.querySelector('.tn-match-toast');
    if (old) old.remove();

    var toast = document.createElement('div');
    toast.className = 'tn-match-toast';
    toast.innerHTML =
      '<p class="tn-match-toast__title">\u2694\uFE0F Your match is ready!</p>' +
      '<p class="tn-match-toast__sub">Round ' + match.round + '</p>' +
      '<div class="tn-match-toast__actions">' +
        '<button class="tn-match-toast__play" id="tn-toast-play">Play Now \u2192</button>' +
        '<button class="tn-match-toast__dismiss">Later</button>' +
      '</div>';
    document.body.appendChild(toast);

    toast.querySelector('#tn-toast-play').addEventListener('click', function () {
      toast.remove();
      joinMatchRoom(match.id);
    });
    toast.querySelector('.tn-match-toast__dismiss').addEventListener('click', function () {
      toast.remove();
    });
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 30000);
  }

  async function joinMatchRoom(matchId) {
    try {
      var result = await callRpc('create_match_room', { p_match_id: matchId });
      if (result && result.success && result.room_id) {
        window.location.href = 'room.html?id=' + encodeURIComponent(result.room_id);
      } else {
        showToast('Could not create match room: ' + ((result && result.error) || 'unknown error'), 5000);
      }
    } catch (e) {
      showToast('Error starting match. Please try again.', 4000);
    }
  }

  // ── Tournament completion celebration ────────────────────────────────────
  function showCompletionOverlay(tournament) {
    db().from('tournaments')
      .select('winner_1st, winner_2nd, winner_3rd, prize_pool')
      .eq('id', tournament.id).single()
      .then(function (res) {
        if (res.error || !res.data) return;
        var t = res.data;
        var pool = t.prize_pool || 0;
        var winnerIds = [t.winner_1st, t.winner_2nd, t.winner_3rd].filter(Boolean);
        if (!winnerIds.length) return;
        db().from('tournament_players')
          .select('user_id, username')
          .in('user_id', winnerIds)
          .eq('tournament_id', tournament.id)
          .then(function (pRes) {
            var nm = {};
            (pRes.data || []).forEach(function (p) { nm[p.user_id] = p.username; });
            var overlay = document.createElement('div');
            overlay.className = 'tn-completion-overlay';
            overlay.innerHTML =
              '<div class="tn-completion__inner">' +
                '<h2 class="tn-completion__title">\uD83C\uDFC6 Tournament Complete!</h2>' +
                '<div class="tn-completion__podium">' +
                  (t.winner_2nd ? '<div class="tn-podium__place tn-podium__place--2nd"><span class="tn-podium__medal">\uD83E\uDD48</span><span class="tn-podium__name">' + esc(nm[t.winner_2nd] || '\u2014') + '</span><span class="tn-podium__coins">+' + Math.floor(pool * 0.30).toLocaleString() + ' coins</span></div>' : '') +
                  (t.winner_1st ? '<div class="tn-podium__place tn-podium__place--1st"><span class="tn-podium__medal">\uD83E\uDD47</span><span class="tn-podium__name">' + esc(nm[t.winner_1st] || '\u2014') + '</span><span class="tn-podium__coins">+' + Math.floor(pool * 0.60).toLocaleString() + ' coins</span></div>' : '') +
                  (t.winner_3rd ? '<div class="tn-podium__place tn-podium__place--3rd"><span class="tn-podium__medal">\uD83E\uDD49</span><span class="tn-podium__name">' + esc(nm[t.winner_3rd] || '\u2014') + '</span><span class="tn-podium__coins">+' + Math.floor(pool * 0.05).toLocaleString() + ' ea (shared)</span></div>' : '') +
                '</div>' +
                '<button class="btn btn-primary tn-completion__close">Close</button>' +
              '</div>';
            document.body.appendChild(overlay);
            overlay.querySelector('.tn-completion__close').addEventListener('click', function () { overlay.remove(); });
            setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 12000);
          });
      });
  }

  // ── Host controls ─────────────────────────────────────────────────────────
  function initHostControls() {
    if (elStartBracketBtn) {
      elStartBracketBtn.addEventListener('click', function () {
        if (!_current) return;
        var n = _current.current_players || 0;
        if (!confirm('Start the tournament with ' + n + ' player' + (n !== 1 ? 's' : '') + '?\n\nThis will close registration and generate the bracket. This cannot be undone.')) return;
        elStartBracketBtn.disabled = true;
        elStartBracketBtn.textContent = 'Starting\u2026';
        callRpc('seed_bracket', { p_tournament_id: _current.id }).then(function (res) {
          if (!res || !res.success) {
            showToast('Could not start: ' + ((res && res.error) || 'unknown error'), 5000);
            elStartBracketBtn.disabled = false;
            elStartBracketBtn.textContent = 'Seed Bracket & Start Tournament';
          }
          // Realtime will fire status → active → openBracket
        }).catch(function () {
          showToast('Error starting tournament.', 4000);
          elStartBracketBtn.disabled = false;
          elStartBracketBtn.textContent = 'Seed Bracket & Start Tournament';
        });
        // Check achievement
        if (window.Achievements && _current.current_players >= 8) {
          Achievements.checkAction('tn_hosted_8plus');
        }
      });
    }

    if (elCloseRegBtn) {
      elCloseRegBtn.addEventListener('click', function () {
        if (!_current) return;
        db().from('tournaments').update({ registration_open: false }).eq('id', _current.id)
          .then(function () { showToast('Registration closed.', 2500); elCloseRegBtn.hidden = true; });
      });
    }

    if (elCancelBtn) {
      elCancelBtn.addEventListener('click', function () {
        if (!_current) return;
        var n = _current.current_players || 0;
        if (!confirm('Cancel this tournament?\n\nAll ' + n + ' registered player' + (n !== 1 ? 's' : '') + ' will be refunded their entry fees, and your host contribution will be returned.')) return;
        elCancelBtn.disabled = true;
        callRpc('cancel_tournament', { p_tournament_id: _current.id }).then(function (res) {
          if (res && res.success) {
            // Refund host seed locally
            if (Auth.addCoins && _current.host_seed > 0) Auth.addCoins(_current.host_seed);
            if (Auth.persistCoins) Auth.persistCoins();
            showToast('Tournament cancelled. All fees refunded.', 5000);
            closePanel();
          } else {
            showToast('Could not cancel tournament.', 3000);
            elCancelBtn.disabled = false;
          }
        });
      });
    }

    if (elCopyCodeBtn) {
      elCopyCodeBtn.addEventListener('click', function () {
        var code = _current && _current.code;
        if (!code) return;
        var url = 'https://playculturalgames.com/pages/rooms.html?tournament=' + code;
        navigator.clipboard.writeText(url).catch(function () {}).then(function () {
          elCopyCodeBtn.textContent = 'Copied!';
          setTimeout(function () { elCopyCodeBtn.textContent = 'Copy Link'; }, 2500);
        });
      });
    }
  }

  // ── Generic toast ─────────────────────────────────────────────────────────
  function showToast(msg, duration) {
    var t = document.createElement('div');
    t.className = 'tn-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, duration || 4000);
  }

  // ── Initialise ────────────────────────────────────────────────────────────
  function init() {
    // Tournament entry card → open panel
    var openBtn = document.getElementById('tn-open-btn');
    if (openBtn) openBtn.addEventListener('click', openPanel);

    // Back button
    if (elBackBtn) elBackBtn.addEventListener('click', closePanel);

    // Sub-nav clicks
    if (elSubnav) {
      elSubnav.addEventListener('click', function (e) {
        var btn = e.target.closest('.tn-subnav__btn');
        if (!btn || btn.hidden) return;
        switchTo(btn.dataset.tnTab);
      });
    }

    // Browse refresh
    var refreshBtn = document.getElementById('tn-browse-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', loadBrowser);

    // Create form live preview
    [elMaxPlayers, elEntryFee, elHostSeed].forEach(function (el) {
      if (el) el.addEventListener('input', updatePrizePreview);
    });
    if (elCreateBtn) elCreateBtn.addEventListener('click', handleCreate);

    // Join
    if (elJoinBtn) elJoinBtn.addEventListener('click', handleJoin);
    if (elJoinCode) {
      elJoinCode.addEventListener('input', function () {
        var s = elJoinCode.selectionStart;
        elJoinCode.value = elJoinCode.value.toUpperCase();
        elJoinCode.setSelectionRange(s, s);
      });
      elJoinCode.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleJoin();
      });
    }

    initHostControls();

    // URL param: ?tournament=CODE
    var params = new URLSearchParams(location.search);
    var tCode  = params.get('tournament');
    if (tCode) {
      window.history.replaceState({}, '', location.pathname);
      openPanel();
      switchTo('join');
      if (elJoinCode) elJoinCode.value = tCode.toUpperCase();
      setTimeout(handleJoin, 400);
    }
  }

  // Expose public API
  window.Tournament = {
    openPanel:        openPanel,
    closePanel:       closePanel,
    joinMatchRoom:    joinMatchRoom,
    onMatchReady:     onMatchReady,
    onMatchCompleted: onMatchCompleted,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
