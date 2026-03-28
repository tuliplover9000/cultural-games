/**
 * cuarenta.js — Cuarenta (Ecuador's national card game)
 * DOM-based rendering, reuses .tl- CSS classes from games.css.
 * Prefix: cu-   Key: cuarenta
 */
(function () {
  'use strict';

  // ── Deck constants ──────────────────────────────────────────────────────────
  var SUITS      = ['oros', 'copas', 'espadas', 'bastos'];
  var RANK_ORDER = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
  var RANK_NAMES = { 1:'A', 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 10:'J', 11:'Kn', 12:'K' };
  var SUIT_SYM   = { oros:'◉', copas:'♥', espadas:'♠', bastos:'♣' };
  var TARGET     = 40;

  // ── State ───────────────────────────────────────────────────────────────────
  var G           = {};
  var selectedIdx = null;
  var aiThinkTimer = null;
  var gameLog     = [];

  // Animation flags — consumed once per render
  var anim = {
    dealHand:      false,   // animate player hand cards in (new deal)
    dealAI:        false,   // animate AI card backs in
    newTableIdx:   -1,      // index of card just placed on table (played-in from bottom)
    aiTableIdx:    -1,      // index of card AI just placed on table (played-in from top)
    flashMsg:      '',      // message to flash in status bar (Caída / Table cleared)
  };

  // ── Deck helpers ─────────────────────────────────────────────────────────────
  function buildDeck() {
    var deck = [];
    SUITS.forEach(function (s) {
      RANK_ORDER.forEach(function (r) { deck.push({ suit: s, rank: r }); });
    });
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  // ── New game ─────────────────────────────────────────────────────────────────
  function newGame() {
    if (aiThinkTimer) clearTimeout(aiThinkTimer);
    gameLog = [];
    G = {
      deck:           buildDeck(),
      playerHand:     [],
      aiHand:         [],
      table:          [],
      playerCaptured: [],
      aiCaptured:     [],
      playerMesas:    0,
      aiMesas:        0,
      playerScore:    0,
      aiScore:        0,
      turn:           'player',
      phase:          'playing',
      lastCapture:    null,
      handsDealt:     0,
      roundScores:    null,
    };
    selectedIdx = null;
    dealHand();
    addLog('system', 'New game started. First to ' + TARGET + ' pts wins.');
    render();
  }

  function dealHand() {
    if (G.handsDealt === 0) {
      for (var i = 0; i < 5 && G.deck.length; i++) G.table.push(G.deck.pop());
    }
    for (var i = 0; i < 10 && G.deck.length; i++) G.playerHand.push(G.deck.pop());
    for (var i = 0; i < 10 && G.deck.length; i++) G.aiHand.push(G.deck.pop());
    G.handsDealt++;
    selectedIdx = null;
    anim.dealHand = true;
    anim.dealAI   = true;
  }

  // ── Game logic ───────────────────────────────────────────────────────────────
  function rankIdx(r) { return RANK_ORDER.indexOf(r); }

  function findCaptures(card) {
    var seq = findSequence(card);
    if (seq && seq.length) return { type: 'sequence', cards: seq };
    var pairs = G.table.filter(function (c) { return c.rank === card.rank; });
    if (pairs.length) return { type: 'pair', cards: pairs };
    return null;
  }

  function findSequence(card) {
    var ci = rankIdx(card.rank);
    if (ci === -1) return null;
    var byIdx = {};
    G.table.forEach(function (c) {
      var i = rankIdx(c.rank);
      if (i !== -1) { byIdx[i] = byIdx[i] || []; byIdx[i].push(c); }
    });
    byIdx[ci] = byIdx[ci] || [];
    byIdx[ci].push(card);
    var lo = ci, hi = ci;
    while (lo > 0 && byIdx[lo - 1] && byIdx[lo - 1].length) lo--;
    while (hi < RANK_ORDER.length - 1 && byIdx[hi + 1] && byIdx[hi + 1].length) hi++;
    if (hi - lo + 1 < 3) return null;
    var captured = [];
    for (var i = lo; i <= hi; i++) {
      if (i === ci) {
        G.table.filter(function (c) { return rankIdx(c.rank) === i; })
               .forEach(function (c) { captured.push(c); });
      } else {
        if (byIdx[i] && byIdx[i].length) captured.push(byIdx[i][0]);
      }
    }
    return captured;
  }

  function isCaida(card, who) {
    if (!G.lastCapture) return false;
    var opp = who === 'player' ? 'ai' : 'player';
    return G.lastCapture.who === opp && G.lastCapture.cardRank === card.rank;
  }

  function playCard(who, handIdx) {
    var hand = who === 'player' ? G.playerHand : G.aiHand;
    var card = hand.splice(handIdx, 1)[0];
    var pile = who === 'player' ? G.playerCaptured : G.aiCaptured;
    var cap  = findCaptures(card);
    var caida = isCaida(card, who);
    var name  = who === 'player' ? 'You' : 'CPU';
    var rn    = RANK_NAMES[card.rank];
    var sym   = SUIT_SYM[card.suit];

    if (cap) {
      cap.cards.forEach(function (cc) {
        var idx = G.table.indexOf(cc);
        if (idx !== -1) G.table.splice(idx, 1);
      });
      pile.push(card);
      cap.cards.forEach(function (c) { pile.push(c); });

      var capDesc = cap.cards.map(function (c) { return RANK_NAMES[c.rank] + SUIT_SYM[c.suit]; }).join(', ');
      addLog(who, name + ' captured ' + capDesc + ' with ' + rn + sym
        + (cap.type === 'sequence' ? ' (sequence)' : ' (pair)'));

      if (caida) {
        anim.flashMsg = '⚡ Caída! +1 bonus';
        addLog(who, '⚡ Caída! ' + name + ' scored +1 bonus');
        if (who === 'player') { G.playerMesas++; if (window.Achievements) Achievements.track('cu_caida'); }
        else G.aiMesas++;
      }
      if (G.table.length === 0) {
        anim.flashMsg = anim.flashMsg ? anim.flashMsg + ' · Table cleared! +1' : '✓ Table cleared! +1';
        addLog(who, '✓ Table cleared! ' + name + ' scored +1 mesa');
        if (who === 'player') {
          G.playerMesas++;
          if (G.playerMesas >= 3 && window.Achievements) Achievements.track('cu_triple_mesa');
        } else {
          G.aiMesas++;
        }
      }
      G.lastCapture = { who: who, cardRank: card.rank };
    } else {
      // Track new table card index for played-in animation
      if (who === 'player') anim.newTableIdx = G.table.length;
      else                  anim.aiTableIdx  = G.table.length;
      G.table.push(card);
      addLog(who, name + ' placed ' + rn + sym + ' on table');
    }
    selectedIdx = null;
  }

  function checkProgress() {
    if (G.playerHand.length || G.aiHand.length) return false;
    if (G.deck.length > 0) {
      dealHand();
      G.turn = 'player';
      addLog('system', 'New hand dealt (' + G.deck.length + ' cards left in deck)');
      return false;
    }
    // Round ends
    if (G.table.length && G.lastCapture) {
      var pile = G.lastCapture.who === 'player' ? G.playerCaptured : G.aiCaptured;
      G.table.forEach(function (c) { pile.push(c); });
      G.table = [];
    }
    var rs = scoreRound();
    G.roundScores = rs;
    G.playerScore += rs.player;
    G.aiScore     += rs.ai;
    addLog('system', 'Round scored — You +' + rs.player + ' pts, CPU +' + rs.ai + ' pts');
    if (G.playerScore >= TARGET || G.aiScore >= TARGET) {
      G.phase = 'game-end';
    } else {
      G.phase = 'round-end';
    }
    return true;
  }

  function scoreRound() {
    function count(pile, mesas) {
      var s = mesas;
      pile.forEach(function (c) {
        if (c.rank === 1) s++;
        if (c.rank === 7  && c.suit === 'oros') s++;
        if (c.rank === 10 && c.suit === 'oros') s++;
      });
      return s;
    }
    var p = count(G.playerCaptured, G.playerMesas);
    var a = count(G.aiCaptured,     G.aiMesas);
    if (G.playerCaptured.length > G.aiCaptured.length) p++;
    else if (G.aiCaptured.length > G.playerCaptured.length) a++;
    return { player: p, ai: a };
  }

  // ── AI ────────────────────────────────────────────────────────────────────────
  function aiChoose() {
    var best = 0, bestScore = -Infinity;
    G.aiHand.forEach(function (card, i) {
      var cap  = findCaptures(card);
      var cai  = isCaida(card, 'ai');
      var mesa = cap && cap.cards.length === G.table.length;
      var s    = 0;
      if (cap && cai)                       s += 80;
      if (mesa)                             s += 60;
      if (cap && cap.type === 'sequence')   s += 40;
      if (cap && cap.type === 'pair')       s += 20;
      if (cap) cap.cards.forEach(function (c) {
        if (c.rank === 1)                       s += 10;
        if (c.rank === 7  && c.suit === 'oros') s += 8;
        if (c.rank === 10 && c.suit === 'oros') s += 8;
      });
      if (!cap) s = rankIdx(card.rank) * 0.5;
      if (s > bestScore) { bestScore = s; best = i; }
    });
    return best;
  }

  function scheduleAI() {
    if (aiThinkTimer) clearTimeout(aiThinkTimer);
    aiThinkTimer = setTimeout(function () {
      if (G.phase !== 'playing' || G.turn !== 'ai') return;
      var idx = aiChoose();
      playCard('ai', idx);
      var done = checkProgress();
      if (!done) G.turn = 'player';
      render();
    }, 1000);
  }

  function commitPlay() {
    if (selectedIdx === null || G.turn !== 'player' || G.phase !== 'playing') return;
    playCard('player', selectedIdx);
    var done = checkProgress();
    if (!done) { G.turn = 'ai'; render(); scheduleAI(); }
    else render();
  }

  // ── Log helper ───────────────────────────────────────────────────────────────
  function addLog(who, msg) {
    gameLog.unshift({ who: who, msg: esc(msg) });
    if (gameLog.length > 20) gameLog.length = 20;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  function render() {
    var el = document.getElementById('game-container');
    if (!el) return;
    if (G.phase === 'game-end')   { renderGameEnd(el);   return; }
    if (G.phase === 'round-end')  { renderRoundEnd(el);  return; }
    el.innerHTML = buildUI();
    wireEvents(el);
  }

  function buildUI() {
    var isYT = G.turn === 'player' && G.phase === 'playing';
    var card  = selectedIdx !== null ? G.playerHand[selectedIdx] : null;
    var cap   = card ? findCaptures(card) : null;
    var caida = card ? isCaida(card, 'player') : false;

    // Consume flash message once
    var flash = anim.flashMsg;
    anim.flashMsg = '';

    var statusInner, statusCls = '';
    if (flash) {
      statusInner = flash;
      statusCls   = 'cu-flash';
    } else if (G.turn === 'ai') {
      statusInner = 'CPU is thinking <span class="tl-thinking-dots"><span></span><span></span><span></span></span>';
    } else if (isYT) {
      statusInner = selectedIdx !== null
        ? (cap ? (caida ? '⚡ Caída available! Click table to capture' : 'Click the table to ' + (cap.type === 'sequence' ? 'capture sequence' : 'capture pair'))
               : 'Click the table to place card')
        : 'Your turn — select a card from your hand';
      statusCls = 'your-turn';
    } else {
      statusInner = 'Cuarenta';
    }

    return '<div class="tl-game cu-game">'
      + '<div class="tl-status-bar ' + statusCls + '">' + statusInner + '</div>'
      + cpuZone()
      + tableZone(cap)
      + scoreStrip()
      + playerZone(isYT, cap)
      + logArea()
      + '</div>';
  }

  function cpuZone() {
    var n      = G.aiHand.length;
    var active = G.turn === 'ai' && G.phase === 'playing';
    var show   = Math.min(n, 13);
    var dealing = anim.dealAI;
    anim.dealAI = false;
    var backs  = '';
    for (var i = 0; i < show; i++) {
      var dcls = dealing ? ' dealing' : '';
      var dsty = dealing ? ' style="--deal-i:' + i + '"' : '';
      backs += '<div class="tl-card-back tl-card-back--sm' + dcls + '"' + dsty + '></div>';
    }
    return '<div class="tl-zone tl-zone--top cu-cpu-zone">'
      + '<div class="tl-zone__name' + (active ? ' active' : '') + '">CPU' + (active ? ' ●' : '') + '</div>'
      + '<div class="tl-opp-cards--top">' + backs + '</div>'
      + '<div class="tl-zone__count">' + n + ' card' + (n !== 1 ? 's' : '') + ' &nbsp;·&nbsp; ' + G.aiCaptured.length + ' captured &nbsp;·&nbsp; ' + G.aiMesas + ' clears</div>'
      + '</div>';
  }

  function tableZone(cap) {
    var hlSet = {};
    if (cap) cap.cards.forEach(function (c) { hlSet[G.table.indexOf(c)] = true; });

    var newPIdx = anim.newTableIdx;
    var aiPIdx  = anim.aiTableIdx;
    anim.newTableIdx = -1;
    anim.aiTableIdx  = -1;

    var tableCards = G.table.map(function (card, i) {
      var cls = hlSet[i] ? 'cu-capture-hl' : '';
      var sty = '';
      if (i === newPIdx) { cls += (cls ? ' ' : '') + 'played-in'; sty = ' style="--from-y:80px;--from-x:0;--play-i:0"'; }
      else if (i === aiPIdx) { cls += (cls ? ' ' : '') + 'played-in'; sty = ' style="--from-y:-80px;--from-x:0;--play-i:0"'; }
      return cuCard(card, cls, undefined, sty);
    }).join('');

    var emptyMsg = G.table.length === 0
      ? '<span class="tl-play-area-empty">Table is empty</span>'
      : '';

    return '<div class="cu-center">'
      + '<div class="cu-table-label">Table &nbsp;<span class="cu-table-count">(' + G.table.length + ')</span></div>'
      + '<div class="tl-play-area' + (G.table.length ? ' has-cards' : '') + ' cu-table-area">'
      + (tableCards || emptyMsg)
      + '</div>'
      + '</div>';
  }

  function scoreStrip() {
    return '<div class="cu-score-strip">'
      + '<span>You: <strong>' + G.playerScore + '</strong> pts &nbsp;·&nbsp; ' + G.playerCaptured.length + ' cap &nbsp;·&nbsp; ' + G.playerMesas + ' clears</span>'
      + '<span class="cu-score-mid">Deck: ' + G.deck.length + ' &nbsp;·&nbsp; Goal: ' + TARGET + '</span>'
      + '<span>CPU: <strong>' + G.aiScore + '</strong> pts &nbsp;·&nbsp; ' + G.aiCaptured.length + ' cap &nbsp;·&nbsp; ' + G.aiMesas + ' clears</span>'
      + '</div>';
  }

  function playerZone(isYT, cap) {
    var canPlay = isYT && selectedIdx !== null;
    var dealing = anim.dealHand;
    anim.dealHand = false;
    var cards = G.playerHand.map(function (card, i) {
      var cls = [
        isYT      ? 'clickable' : '',
        selectedIdx === i ? 'selected' : '',
        dealing   ? 'dealing'  : '',
      ].filter(Boolean).join(' ');
      var sty = dealing ? ' style="--deal-i:' + i + '"' : '';
      return cuCard(card, cls, String(i), sty);
    }).join('');

    var hint = '', hintCls = '';
    if (selectedIdx !== null) {
      if (cap) {
        var capLabel = cap.type === 'sequence' ? 'Sequence capture' : 'Pair capture ×' + cap.cards.length;
        hint = '✓ ' + capLabel;
        hintCls = 'valid';
        if (isCaida(G.playerHand[selectedIdx], 'player')) hint += ' &nbsp;⚡ Caída bonus!';
      } else {
        hint = 'No capture — will place on table';
        hintCls = '';
      }
    }

    return '<div class="tl-player-area">'
      + '<div class="tl-zone__name' + (isYT ? ' active' : '') + '">You' + (isYT ? ' ●' : '') + ' &nbsp;·&nbsp; ' + G.playerHand.length + ' cards</div>'
      + '<div class="tl-hand">' + cards + '</div>'
      + '<div class="tl-hint ' + hintCls + '">' + hint + '</div>'
      + '<div class="tl-actions">'
      + '<div class="tl-actions__main">'
      + '<button class="tl-btn tl-btn--play" id="cu-play-btn" ' + (canPlay ? '' : 'disabled') + '>Play Card</button>'
      + '</div>'
      + '<div class="tl-actions__secondary">'
      + '<button class="tl-btn tl-btn--ghost" id="cu-new-btn">New Game</button>'
      + '</div>'
      + '</div>'
      + '</div>';
  }

  function logArea() {
    var rows = gameLog.slice(0, 10).map(function (e) {
      var cls = e.who === 'player' ? ' you' : e.who === 'system' ? ' sys' : '';
      return '<li class="tl-log__entry' + cls + '">' + e.msg + '</li>';
    }).join('');
    return '<div class="tl-log">'
      + '<div class="tl-log__title">Game log</div>'
      + '<ul class="tl-log__list">' + rows + '</ul>'
      + '</div>';
  }

  // ── Round-end screen ─────────────────────────────────────────────────────────
  function renderRoundEnd(el) {
    var rs = G.roundScores || { player: 0, ai: 0 };
    el.innerHTML = '<div class="tl-game cu-game">'
      + '<div class="tl-gameover visible">'
      + '<div class="tl-gameover__icon">🃏</div>'
      + '<h2>Round Over</h2>'
      + '<p>You +' + rs.player + ' pts &nbsp;·&nbsp; CPU +' + rs.ai + ' pts</p>'
      + '<p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:0.25rem">Score — You: ' + G.playerScore + ' &nbsp;·&nbsp; CPU: ' + G.aiScore + ' &nbsp;·&nbsp; Goal: ' + TARGET + '</p>'
      + '<button class="tl-btn tl-btn--play" id="cu-next-round" style="margin-top:1.5rem">Next Round</button>'
      + '</div>'
      + '</div>';

    var btn = el.querySelector('#cu-next-round');
    if (btn) btn.addEventListener('click', function () {
      G.playerCaptured = []; G.aiCaptured = [];
      G.playerMesas = 0; G.aiMesas = 0;
      G.deck = buildDeck();
      G.table = [];
      G.playerHand = []; G.aiHand = [];
      G.lastCapture = null;
      G.handsDealt = 0;
      G.phase = 'playing';
      G.turn = 'player';
      G.roundScores = null;
      addLog('system', 'New round started.');
      dealHand();
      render();
    });
  }

  // ── Game-end screen ──────────────────────────────────────────────────────────
  function renderGameEnd(el) {
    var won = G.playerScore >= TARGET;
    el.innerHTML = '<div class="tl-game cu-game">'
      + '<div class="tl-gameover visible">'
      + '<div class="tl-gameover__icon">' + (won ? '🏆' : '🃏') + '</div>'
      + '<h2>' + (won ? 'You win!' : 'CPU wins') + '</h2>'
      + '<p>You: ' + G.playerScore + ' pts &nbsp;·&nbsp; CPU: ' + G.aiScore + ' pts</p>'
      + '<button class="tl-btn tl-btn--play" id="cu-play-again" style="margin-top:1.5rem">Play Again</button>'
      + '</div>'
      + '</div>';

    var btn = el.querySelector('#cu-play-again');
    if (btn) btn.addEventListener('click', newGame);

    if (won && window.Achievements) {
      Achievements.track('cu_first_win');
      Achievements.increment('cuarenta', 'wins');
    }
  }

  // ── Card HTML helper ─────────────────────────────────────────────────────────
  function cuCard(card, cls, dataIdx, styStr) {
    var colorCls = 'cu-card--' + card.suit;
    var sym      = SUIT_SYM[card.suit];
    var rn       = RANK_NAMES[card.rank];
    var dataStr  = dataIdx !== undefined ? ' data-idx="' + dataIdx + '"' : '';
    var clsStr   = cls ? ' ' + cls : '';
    return '<div class="tl-card ' + colorCls + clsStr + '"' + dataStr + (styStr || '') + '>'
      + '<div class="tl-card__corner tl-card__corner--tl"><div class="tl-card__rank">' + rn + '</div><div class="tl-card__suit-s">' + sym + '</div></div>'
      + '<div class="tl-card__center">' + sym + '</div>'
      + '<div class="tl-card__corner tl-card__corner--br"><div class="tl-card__rank">' + rn + '</div><div class="tl-card__suit-s">' + sym + '</div></div>'
      + '</div>';
  }

  // ── Wire events ──────────────────────────────────────────────────────────────
  function wireEvents(el) {
    // Card clicks in hand
    el.querySelectorAll('.tl-hand .tl-card[data-idx]').forEach(function (card) {
      card.addEventListener('click', function () {
        if (G.turn !== 'player' || G.phase !== 'playing') return;
        var i = parseInt(card.dataset.idx, 10);
        selectedIdx = selectedIdx === i ? null : i;
        render();
      });
    });

    var playBtn = el.querySelector('#cu-play-btn');
    if (playBtn) playBtn.addEventListener('click', commitPlay);

    var newBtn = el.querySelector('#cu-new-btn');
    if (newBtn) newBtn.addEventListener('click', function () {
      if (confirm('Start a new game?')) newGame();
    });
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('game-container')) newGame();
  });
})();
