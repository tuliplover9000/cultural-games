(function () {
  'use strict';

  /* ════════════════════════════════════════════════════
     CONSTANTS
  ════════════════════════════════════════════════════ */
  var DICE_PER_PLAYER = 5;
  var STARTING_LIVES  = 5;
  var IS_ACE_WILD     = true;

  var AI_NAMES = ['Valentina', 'Mateo', 'Isabella', 'Sebasti\u00e1n', 'Camila', 'Andr\u00e9s'];

  // To show face N, apply this transform to the whole die element
  var FACE_ROTATIONS = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateX(0deg) rotateY(-90deg)',
    3: 'rotateX(90deg) rotateY(0deg)',
    4: 'rotateX(-90deg) rotateY(0deg)',
    5: 'rotateX(0deg) rotateY(90deg)',
    6: 'rotateX(0deg) rotateY(180deg)'
  };

  // CSS grid positions for pips on each face
  var PIP_CONFIGS = {
    1: ['mc'],
    2: ['tr', 'bl'],
    3: ['tr', 'mc', 'bl'],
    4: ['tl', 'tr', 'bl', 'br'],
    5: ['tl', 'tr', 'mc', 'bl', 'br'],
    6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br']
  };

  // face index → the die value on that physical face
  // order: front, back, right, left, top, bottom
  var FACE_VALUES = [1, 6, 2, 5, 3, 4];

  /* ════════════════════════════════════════════════════
     STATE
  ════════════════════════════════════════════════════ */
  var state      = null;
  var aiTimeout  = null;
  var _selFace   = 2;
  var _selQty    = 1;

  /* ════════════════════════════════════════════════════
     DATA MODEL
  ════════════════════════════════════════════════════ */

  function rollDice(count) {
    var d = [];
    for (var i = 0; i < count; i++) d.push(Math.floor(Math.random() * 6) + 1);
    return d;
  }

  function isValidBid(nb, cb) {
    if (!cb) return nb.quantity >= 1 && nb.face >= 1 && nb.face <= 6;
    var nq = nb.quantity, nf = nb.face;
    var cq = cb.quantity, cf = cb.face;
    if (nf === cf && nq > cq)                             return true;
    if (nf !== 1 && cf !== 1 && nf > cf && nq >= 1)       return true;
    if (nf === 1 && cf !== 1 && nq >= Math.ceil(cq / 2)) return true;
    if (nf !== 1 && cf === 1 && nq >= cq * 2)             return true;
    if (nf === 1 && cf === 1 && nq > cq)                  return true;
    return false;
  }

  function countDiceOnTable(face) {
    var count = 0;
    state.players.forEach(function (p) {
      if (p.isEliminated) return;
      p.dice.forEach(function (d) {
        if (d === face) { count++; return; }
        if (IS_ACE_WILD && d === 1 && face !== 1) count++;
      });
    });
    return count;
  }

  function eliminatePlayer(pid) {
    var p = state.players[pid];
    p.lives--;
    if (p.lives <= 0) {
      p.lives = 0;
      p.isEliminated = true;
      p.dice = [];
      state.activePlayers = state.activePlayers.filter(function (id) { return id !== pid; });
    } else {
      p.dice = p.dice.slice(0, p.dice.length - 1);
    }
    state.totalDiceInPlay = 0;
    state.players.forEach(function (pl) {
      if (!pl.isEliminated) state.totalDiceInPlay += pl.dice.length;
    });
  }

  function resetRound(firstPlayerId) {
    state.currentBid = null;
    state.phase = 'bidding';
    state.round++;
    state.players.forEach(function (p) {
      if (!p.isEliminated) {
        p.dice = rollDice(p.dice.length);
        p.isRevealed = false;
      }
    });
    var idx = state.activePlayers.indexOf(firstPlayerId);
    state.currentTurn = idx !== -1 ? idx : 0;
  }

  function initGame(playerCount) {
    clearTimeout(aiTimeout);
    playerCount = parseInt(playerCount, 10);
    var names = AI_NAMES.slice().sort(function () { return Math.random() - 0.5; });
    var personalities = ['cautious', 'aggressive', 'balanced'];
    var players = [];
    for (var i = 0; i < playerCount; i++) {
      players.push({
        id:           i,
        name:         i === 0 ? 'You' : names[i - 1],
        isHuman:      i === 0,
        lives:        STARTING_LIVES,
        dice:         rollDice(DICE_PER_PLAYER),
        isRevealed:   false,
        isEliminated: false,
        personality:  i === 0 ? null : personalities[Math.floor(Math.random() * personalities.length)]
      });
    }
    var active = [];
    for (var j = 0; j < playerCount; j++) active.push(j);
    state = {
      playerCount:     playerCount,
      players:         players,
      activePlayers:   active,
      currentBid:      null,
      currentTurn:     0,
      phase:           'bidding',
      round:           1,
      lastChallenge:   null,
      gameOver:        false,
      winner:          null,
      totalDiceInPlay: playerCount * DICE_PER_PLAYER,
      animating:       false
    };
  }

  /* ════════════════════════════════════════════════════
     DOM HELPERS
  ════════════════════════════════════════════════════ */

  function makePips(face) {
    return (PIP_CONFIGS[face] || []).map(function (pos) {
      return '<div class="ca-pip ca-pip--' + pos + '"></div>';
    }).join('');
  }

  function getCupSVG() {
    return '<svg class="ca-cup-svg" viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="30" cy="10" rx="24" ry="6" fill="#A0522D" stroke="#5C2E00" stroke-width="1.5"/>' +
      '<path d="M6 10 Q4 10 5 16 L12 70 Q13 76 30 76 Q47 76 48 70 L55 16 Q56 10 54 10 Z" fill="#8B4513" stroke="#5C2E00" stroke-width="1.5"/>' +
      '<line x1="12" y1="28" x2="48" y2="28" stroke="#6B3410" stroke-width="1" stroke-linecap="round" opacity="0.6"/>' +
      '<line x1="10" y1="44" x2="50" y2="44" stroke="#6B3410" stroke-width="1" stroke-linecap="round" opacity="0.45"/>' +
      '<line x1="11" y1="58" x2="49" y2="58" stroke="#6B3410" stroke-width="1" stroke-linecap="round" opacity="0.3"/>' +
      '<ellipse cx="30" cy="10" rx="23" ry="5" fill="none" stroke="#C4854A" stroke-width="1" opacity="0.45"/>' +
      '</svg>';
  }

  function createDieEl(val) {
    var wrap = document.createElement('div');
    wrap.className = 'ca-die-wrap';
    var die = document.createElement('div');
    die.className = 'ca-die';
    die.style.transform = FACE_ROTATIONS[val] || FACE_ROTATIONS[1];
    var faceNames = ['front', 'back', 'right', 'left', 'top', 'bottom'];
    faceNames.forEach(function (fname, fi) {
      var fv   = FACE_VALUES[fi];
      var face = document.createElement('div');
      face.className = 'ca-die__face ca-die__face--' + fname + (fv === 1 ? ' ca-die__face--ace' : '');
      face.setAttribute('aria-label', 'Die showing ' + fv);
      (PIP_CONFIGS[fv] || []).forEach(function (pos) {
        var pip = document.createElement('div');
        pip.className = 'ca-pip ca-pip--' + pos;
        face.appendChild(pip);
      });
      die.appendChild(face);
    });
    wrap.appendChild(die);
    return wrap;
  }

  function createPlayerZone(player) {
    var zone = document.createElement('div');
    zone.className = 'ca-player-zone ' + (player.isHuman ? 'ca-player-zone--human' : 'ca-player-zone--ai');
    zone.id = 'ca-zone-' + player.id;
    zone.setAttribute('data-player-id', player.id);

    // dice-wrap is position:relative; cup-cover sits inside as absolute overlay
    var diceWrap = document.createElement('div');
    diceWrap.className = 'ca-dice-wrap';
    diceWrap.id = 'ca-dice-' + player.id;

    var cupDiv = document.createElement('div');
    cupDiv.className = 'ca-cup-cover';
    cupDiv.id = 'ca-cup-' + player.id;
    cupDiv.innerHTML = getCupSVG();
    diceWrap.appendChild(cupDiv);   // cup lives inside diceWrap

    var info = document.createElement('div');
    info.className = 'ca-player-info';
    var nameEl = document.createElement('span');
    nameEl.className = 'ca-player-name';
    nameEl.textContent = player.name;
    var livesEl = document.createElement('div');
    livesEl.className = 'ca-lives';
    livesEl.id = 'ca-lives-' + player.id;
    info.appendChild(nameEl);
    info.appendChild(livesEl);

    zone.appendChild(diceWrap);
    zone.appendChild(info);
    return zone;
  }

  /* ════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════ */

  function renderDiceForPlayer(player) {
    var wrap = document.getElementById('ca-dice-' + player.id);
    if (!wrap) return;
    // Remove only die elements — preserve the cup-cover overlay
    wrap.querySelectorAll('.ca-die-wrap').forEach(function (el) { el.remove(); });
    player.dice.forEach(function (val) {
      wrap.appendChild(createDieEl(val));
    });
  }

  function renderLives(pid) {
    var el = document.getElementById('ca-lives-' + pid);
    if (!el) return;
    el.innerHTML = '';
    var p = state.players[pid];
    for (var i = 0; i < STARTING_LIVES; i++) {
      var pip = document.createElement('span');
      pip.className = 'ca-life-pip' + (i < p.lives ? ' ca-life-pip--full' : '');
      el.appendChild(pip);
    }
  }

  function renderAllLives() {
    state.players.forEach(function (p) { renderLives(p.id); });
  }

  function renderAllDice() {
    state.players.forEach(function (p) {
      if (!p.isEliminated) renderDiceForPlayer(p);
    });
  }

  /* ── Cup helpers ──────────────────────────────────────────────────── */

  function liftCup(pid) {
    var cup = document.getElementById('ca-cup-' + pid);
    if (!cup) return;
    cup.classList.remove('ca-cup-cover--shaking');
    cup.classList.add('ca-cup-cover--lifted');
  }

  function lowerCup(pid) {
    var cup = document.getElementById('ca-cup-' + pid);
    if (!cup) return;
    cup.classList.remove('ca-cup-cover--lifted');
    cup.classList.remove('ca-cup-cover--shaking');
  }

  function shakeCup(pid, cb) {
    var cup = document.getElementById('ca-cup-' + pid);
    if (!cup) { setTimeout(cb || function(){}, 650); return; }
    cup.classList.remove('ca-cup-cover--shaking');
    void cup.offsetWidth;                          // force reflow so animation restarts
    cup.classList.add('ca-cup-cover--shaking');
    setTimeout(function () {
      cup.classList.remove('ca-cup-cover--shaking');
      if (cb) cb();
    }, 650);
  }

  function updateBidDisplay() {
    var emptyEl = document.querySelector('.ca-bid-display__empty');
    var bidEl   = document.querySelector('.ca-bid-display__bid');
    var qtyEl   = document.getElementById('ca-bid-quantity');
    var faceEl  = document.getElementById('ca-bid-face');
    if (!state.currentBid) {
      if (emptyEl) emptyEl.style.display = '';
      if (bidEl)   bidEl.style.display   = 'none';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (bidEl)   bidEl.style.display   = '';
    if (qtyEl)   qtyEl.textContent = state.currentBid.quantity;
    if (faceEl) {
      var isAce = state.currentBid.face === 1;
      faceEl.innerHTML = '<div class="ca-face-mini ca-face-mini--large' + (isAce ? ' ca-bid-face--ace' : '') + '">' + makePips(state.currentBid.face) + '</div>';
    }
  }

  function updateRoundCounter() {
    var el = document.getElementById('ca-round-counter');
    if (el) el.textContent = 'Round ' + state.round + ' \u00b7 ' + state.totalDiceInPlay + ' dice in play';
    var td = document.getElementById('ca-total-dice');
    if (td) td.textContent = state.totalDiceInPlay;
  }

  function highlightActiveTurn() {
    state.players.forEach(function (p) {
      var z = document.getElementById('ca-zone-' + p.id);
      if (z) z.classList.remove('ca-zone--active');
    });
    var cid = state.activePlayers[state.currentTurn];
    var az  = document.getElementById('ca-zone-' + cid);
    if (az) az.classList.add('ca-zone--active');
  }

  /* ════════════════════════════════════════════════════
     TABLE BUILD
  ════════════════════════════════════════════════════ */

  function buildTable() {
    var container = document.getElementById('game-container');
    container.innerHTML = '';
    container.className = 'game-container ca-game';
    container.style.position = 'relative';

    var table = document.createElement('div');
    table.className = 'ca-table ca-players-' + state.playerCount;
    table.id = 'ca-table';

    // AI zones
    var aiZones = document.createElement('div');
    aiZones.className = 'ca-ai-zones';
    for (var i = 1; i < state.playerCount; i++) {
      aiZones.appendChild(createPlayerZone(state.players[i]));
    }

    // Center
    var center = document.createElement('div');
    center.className = 'ca-center';
    center.innerHTML =
      '<div class="ca-round-counter" id="ca-round-counter">Round 1</div>' +
      '<div class="ca-bid-display" id="ca-bid-display">' +
        '<div class="ca-bid-display__context">Claiming across <span id="ca-total-dice">' + state.totalDiceInPlay + '</span> dice total</div>' +
        '<span class="ca-bid-display__empty">No bid yet \u2014 be the first!</span>' +
        '<div class="ca-bid-display__bid" style="display:none">' +
          '<span class="ca-bid-quantity" id="ca-bid-quantity"></span>' +
          '<span class="ca-bid-x">\u00d7</span>' +
          '<div id="ca-bid-face"></div>' +
        '</div>' +
      '</div>' +
      '<div class="ca-result-msg" id="ca-result-msg" hidden></div>';

    // Human zone + controls
    var humanZone = createPlayerZone(state.players[0]);
    var bidControls = buildBidControls();
    humanZone.appendChild(bidControls);

    table.appendChild(aiZones);
    table.appendChild(center);
    table.appendChild(humanZone);
    container.appendChild(table);

    wireControls();
    renderAllLives();
    renderAllDice();
    // Cups all start down; startGame() will shake then lift the human cup
  }

  function buildBidControls() {
    var div = document.createElement('div');
    div.className = 'ca-bid-controls';
    div.id = 'ca-bid-controls';
    div.innerHTML =
      '<div class="ca-qty-row">' +
        '<button class="ca-qty-btn" id="ca-qty-minus" aria-label="Decrease quantity">\u2212</button>' +
        '<span class="ca-qty-val" id="ca-qty-val">1</span>' +
        '<button class="ca-qty-btn" id="ca-qty-plus" aria-label="Increase quantity">+</button>' +
      '</div>' +
      '<div class="ca-face-row" id="ca-face-row" role="group" aria-label="Choose face">' +
        [1,2,3,4,5,6].map(function (f) {
          return '<button class="ca-face-btn' + (f === 2 ? ' active' : '') + '" data-face="' + f + '" aria-label="Face ' + f + '">' +
            '<div class="ca-face-mini">' + makePips(f) + '</div>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<p class="ca-bid-hint">Higher face \u2192 quantity can reset to 1. Same face \u2192 must bid more.</p>' +
      '<div class="ca-action-row">' +
        '<button class="ca-bid-btn" id="ca-place-bid-btn">Place Bid</button>' +
        '<button class="ca-challenge-btn" id="ca-challenge-btn" disabled>\u00a1Dudo!</button>' +
      '</div>';
    return div;
  }

  /* ════════════════════════════════════════════════════
     CONTROLS WIRING
  ════════════════════════════════════════════════════ */

  function wireControls() {
    _selFace = 2;
    _selQty  = 1;
    var qv = document.getElementById('ca-qty-val');
    if (qv) qv.textContent = _selQty;

    var qMinus = document.getElementById('ca-qty-minus');
    var qPlus  = document.getElementById('ca-qty-plus');
    var fRow   = document.getElementById('ca-face-row');
    var bidBtn = document.getElementById('ca-place-bid-btn');
    var chalBtn= document.getElementById('ca-challenge-btn');

    if (qMinus) qMinus.addEventListener('click', function () {
      var min = getMinQty(_selFace);
      if (_selQty > min) { _selQty--; if (qv) qv.textContent = _selQty; validateBidUI(); }
    });
    if (qPlus) qPlus.addEventListener('click', function () {
      _selQty++;
      if (qv) qv.textContent = _selQty;
      validateBidUI();
    });
    if (fRow) fRow.addEventListener('click', function (e) {
      var btn = e.target.closest('.ca-face-btn');
      if (!btn) return;
      document.querySelectorAll('.ca-face-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _selFace = parseInt(btn.dataset.face, 10);
      _selQty  = Math.max(_selQty, getMinQty(_selFace));
      if (qv) qv.textContent = _selQty;
      validateBidUI();
    });
    if (bidBtn) bidBtn.addEventListener('click', function () {
      if (state.animating || !isHumanTurn()) return;
      var bid = { quantity: _selQty, face: _selFace, playerId: 0 };
      if (!isValidBid(bid, state.currentBid)) return;
      placeBid(bid);
    });
    if (chalBtn) chalBtn.addEventListener('click', function () {
      if (state.animating || !isHumanTurn() || !state.currentBid) return;
      setControlsEnabled(false);
      callChallenge(0);
    });
  }

  function getMinQty(face) {
    var cb = state ? state.currentBid : null;
    if (!cb) return 1;
    if (face === cb.face)                              return cb.quantity + 1;
    if (face !== 1 && cb.face !== 1 && face > cb.face) return 1;
    if (face === 1 && cb.face !== 1)                   return Math.ceil(cb.quantity / 2);
    if (face !== 1 && cb.face === 1)                   return cb.quantity * 2;
    if (face === 1 && cb.face === 1)                   return cb.quantity + 1;
    return cb.quantity + 1;
  }

  function validateBidUI() {
    var btn = document.getElementById('ca-place-bid-btn');
    if (!btn) return;
    btn.disabled = !isValidBid({ quantity: _selQty, face: _selFace }, state ? state.currentBid : null);
  }

  function isHumanTurn() {
    if (!state || state.gameOver || state.phase !== 'bidding') return false;
    return state.activePlayers[state.currentTurn] === 0;
  }

  function setControlsEnabled(on) {
    ['ca-qty-minus','ca-qty-plus','ca-place-bid-btn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = !on;
    });
    document.querySelectorAll('.ca-face-btn').forEach(function (b) { b.disabled = !on; });
    var cBtn = document.getElementById('ca-challenge-btn');
    if (cBtn) cBtn.disabled = !on || !state.currentBid;
    if (on) {
      _selQty = Math.max(_selQty, getMinQty(_selFace));
      var qv = document.getElementById('ca-qty-val');
      if (qv) qv.textContent = _selQty;
      validateBidUI();
    }
  }

  /* ════════════════════════════════════════════════════
     TURN FLOW
  ════════════════════════════════════════════════════ */

  function advanceTurn() {
    if (state.gameOver || state.phase !== 'bidding') return;
    state.currentTurn = (state.currentTurn + 1) % state.activePlayers.length;
    var pid    = state.activePlayers[state.currentTurn];
    var player = state.players[pid];
    updateRoundCounter();
    highlightActiveTurn();
    if (player.isHuman) {
      setControlsEnabled(true);
    } else {
      setControlsEnabled(false);
      aiTimeout = setTimeout(function () { aiTakeTurn(player); }, 800 + Math.random() * 700);
    }
  }

  /* ════════════════════════════════════════════════════
     CORE GAME LOGIC
  ════════════════════════════════════════════════════ */

  function placeBid(bid) {
    state.currentBid = bid;
    updateBidDisplay();
    var cBtn = document.getElementById('ca-challenge-btn');
    if (cBtn) cBtn.disabled = false;
    var zone = document.getElementById('ca-zone-' + bid.playerId);
    if (zone) {
      zone.classList.add('ca-zone--just-bid');
      setTimeout(function () { zone.classList.remove('ca-zone--just-bid'); }, 600);
    }
    advanceTurn();
  }

  function callChallenge(challengerId) {
    if (!state.currentBid) return;
    state.phase     = 'reveal';
    state.animating = true;
    setControlsEnabled(false);

    var bid     = state.currentBid;
    var actual  = countDiceOnTable(bid.face);
    var bidGood = actual >= bid.quantity;
    var loserId = bidGood ? challengerId : bid.playerId;

    state.lastChallenge = {
      challenger: challengerId, target: bid.playerId,
      actual: actual, bidQuantity: bid.quantity, bidFace: bid.face,
      challengerWon: !bidGood, loserId: loserId
    };

    revealAllCups(function () {
      showChallengeResult(state.lastChallenge, function () {
        state.animating = false;
        resolveRoundLoss(loserId);
      });
    });
  }

  function revealAllCups(cb) {
    state.players.forEach(function (p) {
      if (p.isEliminated) return;
      p.isRevealed = true;
      liftCup(p.id);
      renderDiceForPlayer(p);
    });
    setTimeout(cb, 500);
  }

  function showChallengeResult(ch, cb) {
    var msgEl = document.getElementById('ca-result-msg');
    if (!msgEl) { setTimeout(cb, 2500); return; }
    var faceName  = ch.bidFace === 1 ? 'aces' : ch.bidFace + 's';
    var loserName = state.players[ch.loserId].name;
    msgEl.innerHTML =
      '<strong>' + ch.bidQuantity + ' ' + faceName + '</strong> bid \u2014 ' +
      '<strong>' + ch.actual + ' found</strong><br>' +
      '<span class="ca-result-loser">' + loserName + ' loses a life!</span>';
    msgEl.hidden = false;
    msgEl.classList.add('ca-result-msg--show');
    highlightMatchingDice(ch.bidFace);
    setTimeout(function () {
      msgEl.classList.remove('ca-result-msg--show');
      setTimeout(function () { msgEl.hidden = true; cb(); }, 300);
    }, 2500);
  }

  function highlightMatchingDice(face) {
    state.players.forEach(function (p) {
      if (p.isEliminated) return;
      var wrap = document.getElementById('ca-dice-' + p.id);
      if (!wrap) return;
      var diceEls = wrap.querySelectorAll('.ca-die-wrap');
      p.dice.forEach(function (val, idx) {
        if (!diceEls[idx]) return;
        var match = val === face || (IS_ACE_WILD && val === 1 && face !== 1);
        diceEls[idx].classList.toggle('ca-die-wrap--match', match);
      });
    });
  }

  function resolveRoundLoss(loserId) {
    eliminatePlayer(loserId);
    renderLives(loserId);
    updateRoundCounter();

    var zone = document.getElementById('ca-zone-' + loserId);
    if (zone) {
      zone.classList.add('ca-zone--lost-life');
      setTimeout(function () { zone.classList.remove('ca-zone--lost-life'); }, 800);
    }

    if (state.players[loserId].isEliminated) showEliminationMsg(loserId);
    if (checkWinCondition()) return;

    var nextFirst = state.players[loserId].isEliminated ? state.activePlayers[0] : loserId;
    setTimeout(function () { startNextRound(nextFirst); }, 900);
  }

  function showEliminationMsg(pid) {
    var name = state.players[pid].name;
    var zone = document.getElementById('ca-zone-' + pid);
    if (zone) {
      zone.classList.add('ca-zone--eliminated');
      var ov = document.createElement('div');
      ov.className = 'ca-eliminated-overlay';
      ov.textContent = 'Eliminated';
      zone.appendChild(ov);
    }
    var center = document.querySelector('.ca-center');
    if (center) {
      var toast = document.createElement('div');
      toast.className = 'ca-elim-toast';
      toast.textContent = '\u{1F480} ' + name + ' is eliminated!';
      center.appendChild(toast);
      setTimeout(function () {
        toast.classList.add('ca-elim-toast--fade');
        setTimeout(function () { toast.remove(); }, 500);
      }, 1800);
    }
  }

  function checkWinCondition() {
    if (state.activePlayers.length > 1) return false;
    state.gameOver = true;
    state.winner   = state.activePlayers[0];
    var isHumanWin = state.winner === 0;
    if (window.Auth && Auth.recordResult) {
      Auth.recordResult('cachos', isHumanWin ? 'win' : 'loss', null);
    }
    if (window.Achievements) {
      Achievements.evaluate();
      if (isHumanWin) {
        Achievements.checkAction('ca_first_win');
        if (state.playerCount === 6) Achievements.checkAction('ca_win_6player');
      }
    }
    setTimeout(showGameOver, 700);
    return true;
  }

  function startNextRound(firstPlayerId) {
    // Lower all cups, clear highlights
    state.players.forEach(function (p) {
      if (!p.isEliminated) lowerCup(p.id);
    });
    document.querySelectorAll('.ca-die-wrap--match').forEach(function (el) {
      el.classList.remove('ca-die-wrap--match');
    });
    // Re-roll dice after a short pause (cups are closed)
    setTimeout(function () {
      resetRound(firstPlayerId);
      renderAllDice();
      renderAllLives();
      updateBidDisplay();
      updateRoundCounter();
      state.activePlayers.forEach(function (pid) {
        var z = document.getElementById('ca-zone-' + pid);
        if (z) z.classList.remove('ca-zone--active');
      });
      // Shake human cup then lift to reveal new dice
      shakeCup(0, function () {
        liftCup(0);
        highlightActiveTurn();
        var curPid    = state.activePlayers[state.currentTurn];
        var curPlayer = state.players[curPid];
        if (curPlayer.isHuman) {
          setControlsEnabled(true);
        } else {
          setControlsEnabled(false);
          aiTimeout = setTimeout(function () { aiTakeTurn(curPlayer); }, 900 + Math.random() * 500);
        }
      });
    }, 600);
  }

  function showGameOver() {
    var existing = document.getElementById('ca-gameover');
    if (existing) existing.remove();
    var isHumanWin = state.winner === 0;
    var winnerName = state.players[state.winner].name;
    var overlay = document.createElement('div');
    overlay.className = 'ca-gameover';
    overlay.id = 'ca-gameover';
    overlay.innerHTML =
      '<div class="ca-gameover__inner">' +
        '<div class="ca-gameover__emoji">' + (isHumanWin ? '\uD83C\uDFC6' : '\uD83D\uDC80') + '</div>' +
        '<h2 class="ca-gameover__title">' + (isHumanWin ? '\u00a1Ganaste!' : '\u00a1Perdiste!') + '</h2>' +
        '<p class="ca-gameover__winner">' + (isHumanWin ? 'You win!' : winnerName + ' wins!') + '</p>' +
        '<p class="ca-gameover__rounds">Lasted ' + state.round + ' round' + (state.round !== 1 ? 's' : '') + '</p>' +
        '<button class="ca-gameover__btn" id="ca-play-again-btn">Play Again</button>' +
      '</div>';
    document.body.appendChild(overlay);
    setTimeout(function () { overlay.classList.add('ca-gameover--show'); }, 30);
    document.getElementById('ca-play-again-btn').addEventListener('click', function () {
      overlay.remove();
      showModal();
    });
  }

  /* ════════════════════════════════════════════════════
     AI
  ════════════════════════════════════════════════════ */

  function calcChallengeProbability(bid, personality) {
    var totalDice = state.totalDiceInPlay;
    var pPerDie   = bid.face === 1 ? 1/6 : 2/6;
    var expected  = (totalDice * pPerDie) || 1;
    var ratio     = bid.quantity / expected;
    var prob      = Math.min(1, Math.max(0, (ratio - 0.8) / 1.2));
    if (personality === 'cautious')   prob = Math.min(1, prob * 1.25);
    if (personality === 'aggressive') prob = Math.max(0, prob * 0.75);
    return prob;
  }

  function countOwnFace(aiPlayer, face) {
    var n = 0;
    aiPlayer.dice.forEach(function (d) {
      if (d === face) n++;
      else if (IS_ACE_WILD && d === 1 && face !== 1) n++;
    });
    return n;
  }

  function generateOpeningBid(aiPlayer) {
    var best = { face: 2, count: 0 };
    for (var f = 2; f <= 6; f++) {
      var c = countOwnFace(aiPlayer, f);
      if (c > best.count) { best.face = f; best.count = c; }
    }
    var bluff = aiPlayer.personality === 'aggressive' ? Math.random() < 0.35 : Math.random() < 0.18;
    var qty = Math.max(1, best.count + (bluff ? 1 : 0));
    return { quantity: qty, face: best.face, playerId: aiPlayer.id };
  }

  function getMinQtyAI(face, cb) {
    if (!cb) return 1;
    if (face === cb.face)                               return cb.quantity + 1;
    if (face !== 1 && cb.face !== 1 && face > cb.face) return 1;
    if (face === 1 && cb.face !== 1)                   return Math.ceil(cb.quantity / 2);
    if (face !== 1 && cb.face === 1)                   return cb.quantity * 2;
    return cb.quantity + 1;
  }

  function generateRaisedBid(aiPlayer, cb) {
    var candidates = [];
    // Try same face with +1
    candidates.push({ quantity: cb.quantity + 1, face: cb.face, playerId: aiPlayer.id });
    // Try higher faces
    for (var f = (cb.face !== 1 ? cb.face + 1 : 2); f <= 6; f++) {
      var minQ = getMinQtyAI(f, cb);
      var myCount = countOwnFace(aiPlayer, f);
      var bluff   = aiPlayer.personality === 'aggressive' ? Math.random() < 0.28 : Math.random() < 0.12;
      var qty = Math.max(minQ, myCount > 0 ? minQ : minQ) + (bluff ? 1 : 0);
      candidates.push({ quantity: qty, face: f, playerId: aiPlayer.id });
    }
    // Pick lowest-quantity valid candidate
    var best = null;
    candidates.forEach(function (c) {
      if (!isValidBid(c, cb)) return;
      if (!best || c.quantity < best.quantity) best = c;
    });
    return best || { quantity: cb.quantity + 1, face: cb.face, playerId: aiPlayer.id };
  }

  function getAIDecision(aiPlayer) {
    if (!state.currentBid) {
      return { action: 'bid', bid: generateOpeningBid(aiPlayer) };
    }
    var threshold = aiPlayer.personality === 'cautious' ? 0.55 : aiPlayer.personality === 'aggressive' ? 0.75 : 0.65;
    if (calcChallengeProbability(state.currentBid, aiPlayer.personality) > threshold) {
      return { action: 'challenge' };
    }
    return { action: 'bid', bid: generateRaisedBid(aiPlayer, state.currentBid) };
  }

  function aiTakeTurn(aiPlayer) {
    if (state.gameOver || state.phase !== 'bidding') return;
    var decision = getAIDecision(aiPlayer);
    var zone = document.getElementById('ca-zone-' + aiPlayer.id);
    if (zone) zone.classList.add('ca-zone--thinking');
    setTimeout(function () {
      if (zone) zone.classList.remove('ca-zone--thinking');
      if (state.gameOver || state.phase !== 'bidding') return;
      if (decision.action === 'challenge') {
        callChallenge(aiPlayer.id);
      } else {
        var bid = decision.bid;
        if (!isValidBid(bid, state.currentBid)) {
          var cb  = state.currentBid || { quantity: 0, face: 2 };
          bid = { quantity: cb.quantity + 1, face: cb.face, playerId: aiPlayer.id };
        }
        placeBid(bid);
      }
    }, 450 + Math.random() * 350);
  }

  /* ════════════════════════════════════════════════════
     MODAL
  ════════════════════════════════════════════════════ */

  function showModal() {
    var old = document.getElementById('ca-modal-backdrop');
    if (old) old.remove();
    var backdrop = document.createElement('div');
    backdrop.className = 'ca-modal-backdrop';
    backdrop.id = 'ca-modal-backdrop';
    backdrop.innerHTML =
      '<div class="ca-modal" role="dialog" aria-modal="true" aria-labelledby="ca-modal-title">' +
        '<h2 class="ca-modal__title" id="ca-modal-title">Cachos</h2>' +
        '<p class="ca-modal__subtitle">How many players?</p>' +
        '<div class="ca-modal__player-grid">' +
          [2,3,4,5,6].map(function (n) {
            return '<button class="ca-modal__player-btn" data-count="' + n + '">' + n + '</button>';
          }).join('') +
        '</div>' +
        '<p class="ca-modal__hint">You vs AI opponents \u00b7 5 lives each</p>' +
      '</div>';
    document.body.appendChild(backdrop);
    setTimeout(function () {
      var first = backdrop.querySelector('.ca-modal__player-btn');
      if (first) first.focus();
    }, 60);
    backdrop.addEventListener('click', function (e) {
      var btn = e.target.closest('.ca-modal__player-btn');
      if (!btn) return;
      var count = parseInt(btn.dataset.count, 10);
      backdrop.remove();
      startGame(count);
    });
  }

  function startGame(playerCount) {
    initGame(playerCount);
    buildTable();
    updateRoundCounter();
    highlightActiveTurn();
    // Shake human cup then lift to reveal starting dice
    shakeCup(0, function () {
      liftCup(0);
      var pid    = state.activePlayers[state.currentTurn];
      var player = state.players[pid];
      if (player.isHuman) {
        setControlsEnabled(true);
      } else {
        setControlsEnabled(false);
        aiTimeout = setTimeout(function () { aiTakeTurn(player); }, 1200);
      }
    });
  }

  /* ════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════ */

  var caSteps = [
    {
      target:    null,
      title:     'Welcome to Cachos',
      body:      'A bluffing dice game from Latin America. You can only see your own dice \u2014 but you bet on what all players have combined.',
      position:  'center',
      highlight: false
    },
    {
      target:    null,
      title:     'Everyone Rolls Secretly',
      body:      'Each player shakes 5 dice under a cup. Only you see your own dice. The goal: be the last player with dice remaining.',
      position:  'center',
      highlight: false
    },
    {
      target:    null,
      title:     'Make a Bid',
      body:      'On your turn, state a face and quantity \u2014 e.g. "3 fours." You\u2019re claiming there are at least that many of that face across ALL cups combined.',
      position:  'center',
      highlight: false
    },
    {
      target:    null,
      title:     'Raise or Challenge',
      body:      'Each bid must go higher: more of the same face, OR the same amount of a higher face. If you think the bid is wrong, hit \u00a1Dudo! to challenge.',
      position:  'center',
      highlight: false
    },
    {
      target:    null,
      title:     'Aces Are Wild',
      body:      'Ones (aces) count as ANY face when others bid non-aces. Bidding aces directly is a special high-risk move \u2014 bid at least half the previous quantity.',
      position:  'center',
      highlight: false
    },
    {
      target:    null,
      title:     'After a Challenge',
      body:      'All cups lift. Count the matching dice. If enough exist \u2014 the challenger loses a life. If not enough \u2014 the bidder loses a life. Losing a life = losing a die.',
      position:  'center',
      highlight: false
    },
    {
      target:    null,
      title:     'Last Cup Standing',
      body:      'Lose all your dice and you\u2019re eliminated. The last player still rolling wins. Good luck \u2014 and don\u2019t trust anyone!',
      position:  'center',
      highlight: false
    }
  ];

  document.addEventListener('DOMContentLoaded', function () {
    if (window.Achievements) Achievements.init();
    if (window.CGTutorial) {
      CGTutorial.initTrigger('cachos');
      CGTutorial.register('cachos', caSteps);
    }
    var inRoom = window.parent !== window;
    if (!inRoom) showModal();
  });

}());
