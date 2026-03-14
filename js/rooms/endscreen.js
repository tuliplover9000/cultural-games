/**
 * endscreen.js — End screen + session leaderboard controller (Phase I).
 * Handles: winner display, dual-instance results, leaderboard, rematch, back to lobby.
 *
 * Exposes window.Endscreen for lobby.js to call.
 */
(function () {
  'use strict';

  var elEndscreen    = document.getElementById('room-endscreen');
  var elSingle       = document.getElementById('endscreen-single');
  var elDual         = document.getElementById('endscreen-dual');
  var elAvatar       = document.getElementById('endscreen-avatar');
  var elName         = document.getElementById('endscreen-name');
  var elScore        = document.getElementById('endscreen-score');
  var elDualA        = document.getElementById('endscreen-dual-a');
  var elDualB        = document.getElementById('endscreen-dual-b');
  var elLbList       = document.getElementById('endscreen-lb-list');
  var elRematchBtn   = document.getElementById('endscreen-rematch-btn');
  var elLobbyBtn     = document.getElementById('endscreen-lobby-btn');

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Build a winner block HTML (used for both single and dual)
  function winnerHTML(name, score) {
    return '<div class="endscreen-winner__avatar" style="width:48px;height:48px;font-size:var(--text-2xl)">' + esc((name || '?')[0].toUpperCase()) + '</div>' +
      '<div class="endscreen-winner__name" style="font-size:var(--text-xl)">' + esc(name || 'Unknown') + '</div>' +
      '<div class="endscreen-winner__label">wins!</div>' +
      (score ? '<div class="endscreen-winner__score">' + esc(score) + '</div>' : '');
  }

  // Leaderboard
  function renderLeaderboard(room) {
    var wins  = room.player_wins  || {};
    var names = room.player_names || {};
    var ids   = room.player_ids   || [];

    // Sort by wins descending
    var sorted = ids.slice().sort(function(a,b){ return (wins[b]||0) - (wins[a]||0); });
    var maxW   = sorted.length ? (wins[sorted[0]] || 0) : 0;
    var showT  = maxW > 0;

    elLbList.innerHTML = sorted.map(function(pid, idx) {
      var name = names[pid] || 'Player';
      var w    = wins[pid]  || 0;
      var top  = showT && w === maxW;
      return '<li class="endscreen-lb-row">' +
        '<span class="endscreen-lb-rank">' + (idx+1) + '</span>' +
        '<div class="lobby-player__avatar" style="width:28px;height:28px;font-size:var(--text-sm);flex-shrink:0">' + esc(name[0].toUpperCase()) + '</div>' +
        '<span class="endscreen-lb-name">' + esc(name) + '</span>' +
        '<span class="endscreen-lb-wins">' + w + ' win' + (w !== 1 ? 's' : '') + '</span>' +
        (top ? '<span class="endscreen-lb-trophy">🏆</span>' : '') +
      '</li>';
    }).join('');
  }

  function show(room) {
    var instances = room.game_instances || [];
    var names     = room.player_names || {};
    var dual      = room.dual_instance && instances.length >= 2;

    elEndscreen.hidden = false;
    if (window.Ingame && window.Ingame.hideBoardFrame) window.Ingame.hideBoardFrame();

    if (dual) {
      elSingle.hidden = true;
      elDual.hidden   = false;

      var inst0 = instances[0] || {};
      var inst1 = instances[1] || {};
      var name0 = names[inst0.winner_pid] || '—';
      var name1 = names[inst1.winner_pid] || '—';

      elDualA.innerHTML = winnerHTML(name0);
      elDualB.innerHTML = winnerHTML(name1);

    } else {
      elSingle.hidden = false;
      elDual.hidden   = true;

      var inst = instances[0] || {};
      var winnerName = names[inst.winner_pid] || '—';

      elAvatar.textContent = (winnerName[0] || '?').toUpperCase();
      elName.textContent   = winnerName;
      elScore.textContent  = '';
    }

    renderLeaderboard(room);

    // Only host buttons are functional
    var isHost = Room.amHost();
    elRematchBtn.disabled = !isHost;
    elLobbyBtn.disabled   = !isHost;
    if (!isHost) {
      var note = document.createElement('p');
      note.style.cssText = 'font-size:var(--text-xs);color:var(--color-text-muted);text-align:center';
      note.textContent = 'Waiting for host to continue…';
      elEndscreen.querySelector('.endscreen-actions').appendChild(note);
    }
  }

  // Buttons
  if (elRematchBtn) {
    elRematchBtn.addEventListener('click', function() {
      elRematchBtn.disabled = true;
      Room.rematch();
    });
  }
  if (elLobbyBtn) {
    elLobbyBtn.addEventListener('click', function() {
      elLobbyBtn.disabled = true;
      Room.backToLobby();
    });
  }

  window.Endscreen = { show: show };

}());
