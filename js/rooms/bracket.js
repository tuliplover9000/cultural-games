/**
 * bracket.js - Tournament bracket renderer.
 * Exposes window.Bracket for tournament.js to call.
 *
 * Handles: bracket DOM building, match status updates, Realtime subscription.
 */
(function () {
  'use strict';

  var _sub        = null;
  var _playerMap  = {};

  function db()  { return window.TournamentData.db(); }
  function esc(s){ return window.TournamentData.esc(s); }

  // ── Build a single match card element ─────────────────────────────────────
  function buildMatchEl(match, playerMap) {
    var map      = playerMap || _playerMap;
    var p1Name   = match.player1_id ? (map[match.player1_id] || 'TBD') : 'BYE';
    var p2Name   = match.player2_id ? (map[match.player2_id] || 'TBD') : 'BYE';
    var isBye    = match.is_bye || (!match.player1_id && !match.player2_id);
    var win1     = match.winner_id && match.winner_id === match.player1_id;
    var win2     = match.winner_id && match.winner_id === match.player2_id;
    var hasWin   = !!(match.winner_id);
    var myId     = window._user ? window._user.id : null;
    var amPlayer = myId && (myId === match.player1_id || myId === match.player2_id);

    var actionHtml = '';
    if (match.status === 'ready' && amPlayer) {
      actionHtml = '<button class="tn-match__play-btn" data-match-id="' + esc(match.id) + '">Play Match \u2192</button>';
    } else if (match.status === 'ready' && !amPlayer) {
      actionHtml = '<span class="tn-match__ready-label">Awaiting players</span>';
    } else if (match.status === 'in_progress' && match.room_id) {
      actionHtml = '<a class="tn-match__watch-btn" href="room.html?id=' + esc(match.room_id) + '" target="_blank">Watch \u2192</a>';
    }

    var walkoverBadge = match.status === 'walkover' ? '<span class="tn-match__walkover-badge">W/O</span>' : '';
    var byeLabel      = isBye && (match.status === 'bye' || !match.player2_id) ? '<span class="tn-match__bye-label">BYE</span>' : '';

    var div = document.createElement('div');
    div.className = 'tn-match';
    div.dataset.matchId = match.id;
    div.dataset.status  = match.status || 'pending';
    div.innerHTML =
      '<div class="tn-match__player' + (win1 ? ' tn-match__player--winner' : (hasWin ? ' tn-match__player--loser' : '')) + '">' +
        '<span class="tn-match__player-name">' + esc(p1Name) + '</span>' +
      '</div>' +
      '<div class="tn-match__sep">' + (isBye ? 'BYE' : 'vs') + byeLabel + '</div>' +
      '<div class="tn-match__player' + (win2 ? ' tn-match__player--winner' : (hasWin ? ' tn-match__player--loser' : '')) + '">' +
        '<span class="tn-match__player-name">' + esc(p2Name) + '</span>' +
        walkoverBadge +
      '</div>' +
      (actionHtml ? '<div class="tn-match__actions">' + actionHtml + '</div>' : '');

    return div;
  }

  // ── Wire play-match buttons inside a container ─────────────────────────────
  function wireButtons(container) {
    container.querySelectorAll('.tn-match__play-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.Tournament) Tournament.joinMatchRoom(btn.dataset.matchId);
      });
    });
  }

  // ── Build the full bracket DOM ─────────────────────────────────────────────
  function buildBracketDOM(matches, playerMap, container) {
    container.innerHTML = '';

    var rounds    = {};
    var maxRound  = 0;
    matches.forEach(function (m) {
      if (!rounds[m.round]) rounds[m.round] = [];
      rounds[m.round].push(m);
      if (m.round > maxRound) maxRound = m.round;
    });

    for (var r = 1; r <= maxRound; r++) {
      var roundDiv = document.createElement('div');
      roundDiv.className = 'tn-bracket__round';
      roundDiv.dataset.round = r;

      var label = document.createElement('p');
      label.className = 'tn-bracket__round-label';
      label.textContent = r === maxRound       ? 'Final'
                        : r === maxRound - 1   ? 'Semi-Finals'
                        : r === maxRound - 2   ? 'Quarter-Finals'
                        : 'Round ' + r;
      roundDiv.appendChild(label);

      var roundMatches = (rounds[r] || []).slice().sort(function (a, b) {
        return a.match_number - b.match_number;
      });
      roundMatches.forEach(function (m) {
        roundDiv.appendChild(buildMatchEl(m, playerMap));
      });
      container.appendChild(roundDiv);
    }

    wireButtons(container);
  }

  // ── Update a single match card in-place ──────────────────────────────────
  function updateMatchInBracket(matchData, container) {
    var existing = container.querySelector('[data-match-id="' + matchData.id + '"]');
    if (!existing) return;
    var newEl = buildMatchEl(matchData, _playerMap);
    existing.parentNode.replaceChild(newEl, existing);
    wireButtons(newEl.parentNode);

    // Notify tournament.js if this match just became ready and user is a player
    if (matchData.status === 'ready' && window.Tournament) {
      Tournament.onMatchReady(matchData);
    }
    // Notify tournament.js if tournament completed
    if (matchData.status === 'completed' && window.Tournament && window.Tournament.onMatchCompleted) {
      Tournament.onMatchCompleted(matchData);
    }
  }

  // ── Subscribe to live match updates ───────────────────────────────────────
  function subscribe(tournamentId, container) {
    if (_sub) db().removeChannel(_sub);
    _sub = db()
      .channel('bracket-' + tournamentId)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'tournament_matches',
        filter: 'tournament_id=eq.' + tournamentId,
      }, function (payload) {
        if (payload.new) updateMatchInBracket(payload.new, container);
      })
      .subscribe();
  }

  // ── Main entry point ──────────────────────────────────────────────────────
  async function renderBracket(tournamentId, container) {
    if (!container) return;
    container.innerHTML = '<p class="tn-bracket__loading">Loading bracket\u2026</p>';

    try {
      var matchRes = await db()
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round',        { ascending: true })
        .order('match_number', { ascending: true });
      if (matchRes.error) throw matchRes.error;

      var playerRes = await db()
        .from('tournament_players')
        .select('user_id, username')
        .eq('tournament_id', tournamentId);
      if (playerRes.error) throw playerRes.error;

      _playerMap = {};
      (playerRes.data || []).forEach(function (p) { _playerMap[p.user_id] = p.username; });

      buildBracketDOM(matchRes.data || [], _playerMap, container);
      subscribe(tournamentId, container);
    } catch (e) {
      container.innerHTML = '<p class="tn-bracket__error">Could not load bracket. Please refresh.</p>';
    }
  }

  function destroy() {
    if (_sub) { db().removeChannel(_sub); _sub = null; }
    _playerMap = {};
  }

  window.Bracket = { renderBracket: renderBracket, destroy: destroy };

}());
