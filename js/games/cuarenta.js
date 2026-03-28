/**
 * cuarenta.js — Cuarenta (Ecuador's national card game)
 * Prefix: cu-   Key: cuarenta
 *
 * Rules:
 *  - 40-card Spanish deck (oros, copas, espadas, bastos), ranks 1-7 and 10-12
 *  - 2 players. First deal: 5 cards face-up on table, 10 to each player.
 *  - Subsequent deals: 10 to each player (no new table cards).
 *  - Captures: pairs (same rank) or sequences (3+ consecutive by RANK_ORDER index).
 *  - Sequences beat pairs when both are possible.
 *  - Caída: opponent made the last capture AND you play the same rank they played → +1 bonus.
 *  - Mesa: clearing the table entirely → +1 bonus per clear.
 *  - Scoring per ronda: Ases (1 pt each), 7 de oros (1 pt), Sota de oros (1 pt),
 *    each mesa (1 pt). Tie on cards = no bonus; most cards = +1 pt.
 *  - First to reach 40 cumulative points wins.
 */
(function () {
  'use strict';

  // ── Deck constants ──────────────────────────────────────────────────────────
  var SUITS      = ['oros', 'copas', 'espadas', 'bastos'];
  var RANK_ORDER = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
  var RANK_NAMES = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5',
                     6: '6', 7: '7', 10: 'J', 11: 'Kn', 12: 'K' };
  var SUIT_LABELS = { oros: 'Coins', copas: 'Cups', espadas: 'Swords', bastos: 'Clubs' };
  var TARGET      = 40;

  // ── Canvas geometry ─────────────────────────────────────────────────────────
  var CW = 48, CH = 72;          // card logical size
  var LW = 600, LH = 430;        // canvas logical size
  var PAD = 20;

  // ── Colors ──────────────────────────────────────────────────────────────────
  var C = {
    felt:       '#1b3a1b',
    feltLight:  '#234523',
    gold:       '#C89B3C',
    goldLight:  '#e8bf6a',
    cardBg:     '#FBF5E6',
    cardSel:    '#fffbe8',
    cardBack:   '#1a4a7a',
    cardBackPat:'#0f3260',
    oros:       '#b8860b',
    copas:      '#cc2200',
    espadas:    '#1a4a8a',
    bastos:     '#2a6a2a',
    text:       'rgba(240,230,208,0.9)',
    textMuted:  'rgba(240,230,208,0.45)',
    green:      '#4aff7a',
    orange:     '#ffaa44',
    capture:    'rgba(74,255,74,0.35)',
  };

  // ── State ───────────────────────────────────────────────────────────────────
  var G = {};     // game state
  var canvas, ctx;
  var aiThinkTimer = null;

  // ── Build deck ──────────────────────────────────────────────────────────────
  function buildDeck() {
    var deck = [];
    SUITS.forEach(function (s) {
      RANK_ORDER.forEach(function (r) { deck.push({ suit: s, rank: r }); });
    });
    // Fisher-Yates shuffle
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  // ── Init / new game ─────────────────────────────────────────────────────────
  function newGame() {
    if (aiThinkTimer) clearTimeout(aiThinkTimer);
    G = {
      deck:            buildDeck(),
      playerHand:      [],
      aiHand:          [],
      table:           [],
      playerCaptured:  [],
      aiCaptured:      [],
      playerMesas:     0,
      aiMesas:         0,
      playerScore:     0,
      aiScore:         0,
      turn:            'player',
      selectedIdx:     null,   // hand index of selected card
      highlightTable:  [],     // table indices that would be captured
      lastCapture:     null,   // { who, cardRank } – card played (not captured)
      phase:           'playing', // 'playing' | 'round-end' | 'game-end'
      message:         '',
      messageTimer:    0,
      handsDealt:      0,
    };
    dealHand();
    render();
  }

  function dealHand() {
    var firstDeal = G.handsDealt === 0;
    if (firstDeal) {
      // 5 face-up table cards
      for (var i = 0; i < 5 && G.deck.length; i++) G.table.push(G.deck.pop());
    }
    // 10 to each player (or as many as available)
    for (var i = 0; i < 10 && G.deck.length; i++) G.playerHand.push(G.deck.pop());
    for (var i = 0; i < 10 && G.deck.length; i++) G.aiHand.push(G.deck.pop());
    G.handsDealt++;
    G.selectedIdx = null;
    G.highlightTable = [];
  }

  // ── Rank index helper ────────────────────────────────────────────────────────
  function rankIdx(r) { return RANK_ORDER.indexOf(r); }

  // ── Find captures for a given card ─────────────────────────────────────────
  function findCaptures(card) {
    // Try sequence first (takes priority)
    var seq = findSequence(card);
    if (seq) return { type: 'sequence', cards: seq };
    // Try pairs
    var pairs = G.table.filter(function (c) { return c.rank === card.rank; });
    if (pairs.length) return { type: 'pair', cards: pairs };
    return null;
  }

  function findSequence(card) {
    var ci = rankIdx(card.rank);
    if (ci === -1) return null;

    // Map of rank index → array of table cards at that rank
    var byIdx = {};
    G.table.forEach(function (c) {
      var i = rankIdx(c.rank);
      if (i !== -1) { byIdx[i] = byIdx[i] || []; byIdx[i].push(c); }
    });
    byIdx[ci] = byIdx[ci] || [];
    byIdx[ci].push(card); // include the played card

    // Extend the run containing ci
    var lo = ci, hi = ci;
    while (lo > 0 && byIdx[lo - 1] && byIdx[lo - 1].length) lo--;
    while (hi < RANK_ORDER.length - 1 && byIdx[hi + 1] && byIdx[hi + 1].length) hi++;

    if (hi - lo + 1 < 3) return null;

    // Collect one table card per rank (exclude the played card's slot)
    var captured = [];
    for (var i = lo; i <= hi; i++) {
      if (i === ci) {
        // Take any extra table card of this rank (duplicate)
        var extras = G.table.filter(function (c) { return rankIdx(c.rank) === i; });
        extras.forEach(function (c) { captured.push(c); });
      } else {
        if (byIdx[i] && byIdx[i].length) captured.push(byIdx[i][0]);
      }
    }
    return captured; // cards to capture from table
  }

  // ── Caída check ─────────────────────────────────────────────────────────────
  function isCaida(card, who) {
    if (!G.lastCapture) return false;
    var opp = who === 'player' ? 'ai' : 'player';
    return G.lastCapture.who === opp && G.lastCapture.cardRank === card.rank;
  }

  // ── Play a card ──────────────────────────────────────────────────────────────
  function playCard(who, handIdx) {
    var hand = who === 'player' ? G.playerHand : G.aiHand;
    var card = hand.splice(handIdx, 1)[0];
    var pile = who === 'player' ? G.playerCaptured : G.aiCaptured;

    var cap = findCaptures(card);
    var caida = isCaida(card, who);
    var msgs = [];

    if (cap) {
      // Remove captured table cards
      cap.cards.forEach(function (cc) {
        var idx = G.table.indexOf(cc);
        if (idx !== -1) G.table.splice(idx, 1);
      });
      pile.push(card);
      cap.cards.forEach(function (c) { pile.push(c); });

      if (caida) {
        msgs.push('Caída! +1');
        if (who === 'player') {
          G.playerMesas++;
          if (window.Achievements) Achievements.track('cu_caida');
        } else {
          G.aiMesas++;
        }
      }
      if (G.table.length === 0) {
        msgs.push('Table cleared! +1');
        if (who === 'player') {
          G.playerMesas++;
          if (G.playerMesas >= 3 && window.Achievements) Achievements.track('cu_triple_mesa');
        } else {
          G.aiMesas++;
        }
      }
      G.lastCapture = { who: who, cardRank: card.rank };
    } else {
      G.table.push(card);
      // lastCapture persists — do not reset
    }

    G.selectedIdx = null;
    G.highlightTable = [];
    G.message = msgs.join(' · ');
    return msgs.join(' · ');
  }

  // ── Check if round/game is done ─────────────────────────────────────────────
  function checkProgress() {
    if (G.playerHand.length || G.aiHand.length) return false;

    if (G.deck.length > 0) {
      // Deal next hand
      dealHand();
      G.turn = 'player';
      return false;
    }

    // All cards played: score the ronda
    // Give remaining table cards to last capturer
    if (G.table.length && G.lastCapture) {
      var pile = G.lastCapture.who === 'player' ? G.playerCaptured : G.aiCaptured;
      G.table.forEach(function (c) { pile.push(c); });
      G.table = [];
    }

    var rs = scoreRonda();
    G.playerScore += rs.player;
    G.aiScore    += rs.ai;

    if (G.playerScore >= TARGET || G.aiScore >= TARGET) {
      G.phase = 'game-end';
    } else {
      G.phase = 'round-end';
    }
    return true;
  }

  // ── Score a ronda ────────────────────────────────────────────────────────────
  function scoreRonda() {
    function count(pile, mesas) {
      var s = mesas;
      pile.forEach(function (c) {
        if (c.rank === 1) s++;                                // Ases
        if (c.rank === 7  && c.suit === 'oros') s++;          // 7 de oros
        if (c.rank === 10 && c.suit === 'oros') s++;          // Sota de oros
      });
      return s;
    }
    var p = count(G.playerCaptured, G.playerMesas);
    var a = count(G.aiCaptured,     G.aiMesas);
    if (G.playerCaptured.length > G.aiCaptured.length) p++;   // most captured
    else if (G.aiCaptured.length > G.playerCaptured.length) a++;
    return { player: p, ai: a };
  }

  // ── AI logic ─────────────────────────────────────────────────────────────────
  function aiChoose() {
    var best = 0, bestScore = -Infinity;
    G.aiHand.forEach(function (card, i) {
      var cap  = findCaptures(card);
      var cai  = isCaida(card, 'ai');
      var mesa = cap && cap.cards.length === G.table.length;
      var s    = 0;

      if (cap && cai)          s += 80;
      if (mesa)                s += 60;
      if (cap && cap.type === 'sequence') s += 40;
      if (cap && cap.type === 'pair')     s += 20;
      // Bonus for capturing valuable cards
      if (cap) cap.cards.forEach(function (c) {
        if (c.rank === 1)                           s += 10;
        if (c.rank === 7  && c.suit === 'oros')     s += 8;
        if (c.rank === 10 && c.suit === 'oros')     s += 8;
      });
      // If no capture: prefer low-value table deposits
      if (!cap) s = rankIdx(card.rank) * 0.5; // lower rank → lower score

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
      G.turn = done ? G.turn : 'player';
      render();
      if (done) { if (G.phase === 'round-end') showRoundEnd(); else showGameEnd(); }
    }, 1000);
  }

  // ── Update table highlights based on selected card ──────────────────────────
  function updateHighlights() {
    G.highlightTable = [];
    if (G.selectedIdx === null) return;
    var card = G.playerHand[G.selectedIdx];
    var cap = findCaptures(card);
    if (cap) {
      G.highlightTable = cap.cards.map(function (c) { return G.table.indexOf(c); });
    }
  }

  // ── Click handling ───────────────────────────────────────────────────────────
  function handleCanvasClick(cx, cy) {
    if (G.phase !== 'playing' || G.turn !== 'player') return;

    var playerY   = LH - CH - PAD;
    var pSpacing  = cardSpacing(G.playerHand.length);
    var pStartX   = handStartX(G.playerHand.length, pSpacing);

    // Click on player hand?
    for (var i = G.playerHand.length - 1; i >= 0; i--) {
      var x  = pStartX + i * pSpacing;
      var dy = G.selectedIdx === i ? -10 : 0;
      if (cx >= x && cx <= x + CW && cy >= playerY + dy && cy <= playerY + CH + dy) {
        if (G.selectedIdx === i) {
          G.selectedIdx = null;
          G.highlightTable = [];
        } else {
          G.selectedIdx = i;
          updateHighlights();
        }
        render();
        return;
      }
    }

    // Click in table zone with a card selected?
    var tableY = 135;
    if (G.selectedIdx !== null && cy >= tableY - 25 && cy <= tableY + CH + 35) {
      commitPlay();
      return;
    }
  }

  function commitPlay() {
    if (G.selectedIdx === null || G.turn !== 'player' || G.phase !== 'playing') return;
    playCard('player', G.selectedIdx);
    var done = checkProgress();
    if (!done) {
      G.turn = 'ai';
      render();
      scheduleAI();
    } else {
      render();
      if (G.phase === 'round-end') showRoundEnd(); else showGameEnd();
    }
  }

  // ── Layout helpers ───────────────────────────────────────────────────────────
  function cardSpacing(n) { return n <= 1 ? CW + 8 : Math.min(CW + 8, (LW - 2 * PAD - CW) / (n - 1)); }
  function handStartX(n, sp) { return Math.max(PAD, (LW - (sp * (n - 1) + CW)) / 2); }

  // ── Rendering ────────────────────────────────────────────────────────────────
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, LW, LH);

    // Felt background
    ctx.fillStyle = C.felt;
    ctx.fillRect(0, 0, LW, LH);

    // Subtle grid lines
    ctx.strokeStyle = C.feltLight;
    ctx.lineWidth = 0.5;
    for (var gx = 0; gx < LW; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, LH); ctx.stroke(); }
    for (var gy = 0; gy < LH; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(LW, gy); ctx.stroke(); }

    drawScoreBar();
    drawAIHand();
    drawTable();
    drawPlayerHand();
    drawMessage();
    drawTurnIndicator();
  }

  function drawScoreBar() {
    // Left: player score
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 13px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('You: ' + G.playerScore + ' pts', PAD, 18);
    ctx.fillStyle = C.textMuted;
    ctx.font = '11px Outfit, sans-serif';
    ctx.fillText('cap. ' + G.playerCaptured.length + '  clears ' + G.playerMesas, PAD, 32);

    // Right: AI score
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 13px Outfit, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('CPU: ' + G.aiScore + ' pts', LW - PAD, 18);
    ctx.fillStyle = C.textMuted;
    ctx.font = '11px Outfit, sans-serif';
    ctx.fillText('cap. ' + G.aiCaptured.length + '  clears ' + G.aiMesas, LW - PAD, 32);

    // Center: deck
    ctx.fillStyle = C.textMuted;
    ctx.font = '11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Deck: ' + G.deck.length, LW / 2, 18);

    // Target indicator
    ctx.fillStyle = C.textMuted;
    ctx.fillText('Goal: ' + TARGET, LW / 2, 32);
  }

  function drawAIHand() {
    var y = 45;
    var sp = cardSpacing(G.aiHand.length);
    var sx = handStartX(G.aiHand.length, sp);

    ctx.fillStyle = C.textMuted;
    ctx.font = '11px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CPU (' + G.aiHand.length + ' cards)', PAD, y - 5);

    G.aiHand.forEach(function (_, i) {
      drawCardShape(sx + i * sp, y, null, false, true);
    });
  }

  function drawTable() {
    var y = 135;
    // Table zone background
    roundRect(ctx, PAD, y - 12, LW - 2 * PAD, CH + 24, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,155,60,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = C.textMuted;
    ctx.font = '11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Table (' + G.table.length + ')', LW / 2, y - 16);

    if (G.table.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.font = '14px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Table is empty', LW / 2, y + CH / 2 + 6);
      return;
    }

    var sp = cardSpacing(Math.min(G.table.length, 12));
    var sx = handStartX(Math.min(G.table.length, 12), sp);

    G.table.slice(0, 12).forEach(function (card, i) {
      var highlighted = G.highlightTable.indexOf(i) !== -1;
      if (highlighted) {
        ctx.shadowColor = C.green;
        ctx.shadowBlur  = 12;
      }
      drawCardShape(sx + i * sp, y, card, false, false);
      ctx.shadowBlur = 0;
    });

    if (G.table.length > 12) {
      ctx.fillStyle = C.textMuted;
      ctx.font = '11px Outfit, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('+' + (G.table.length - 12) + ' more', LW - PAD, y + CH + 18);
    }
  }

  function drawPlayerHand() {
    var y = LH - CH - PAD;
    var sp = cardSpacing(G.playerHand.length);
    var sx = handStartX(G.playerHand.length, sp);

    ctx.fillStyle = C.textMuted;
    ctx.font = '11px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('You (' + G.playerHand.length + ' cards)', PAD, y - 5);

    G.playerHand.forEach(function (card, i) {
      var sel = G.selectedIdx === i;
      var dy  = sel ? -10 : 0;
      if (sel) { ctx.shadowColor = C.gold; ctx.shadowBlur = 14; }
      drawCardShape(sx + i * sp, y + dy, card, sel, false);
      ctx.shadowBlur = 0;
    });

    // Prompt when card selected
    if (G.selectedIdx !== null && G.turn === 'player') {
      ctx.fillStyle = G.highlightTable.length ? C.green : C.gold;
      ctx.font = '12px Outfit, sans-serif';
      ctx.textAlign = 'center';
      var hint = G.highlightTable.length
        ? 'Click the table to capture'
        : 'Click the table to place card';
      ctx.fillText(hint, LW / 2, y - 18);
    }
  }

  function drawMessage() {
    if (!G.message) return;
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 16px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(G.message, LW / 2, LH - CH - PAD - 35);
  }

  function drawTurnIndicator() {
    if (G.phase !== 'playing') return;
    ctx.fillStyle = G.turn === 'player' ? C.green : C.orange;
    ctx.font = '12px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(G.turn === 'player' ? '— Your turn —' : '— CPU thinking… —', LW / 2, 108);
  }

  // ── Draw a single card ───────────────────────────────────────────────────────
  function drawCardShape(x, y, card, selected, faceDown) {
    var r = 4;
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, x + 2, y + 3, CW, CH, r);
    ctx.fill();

    if (faceDown) {
      ctx.fillStyle = C.cardBack;
      roundRect(ctx, x, y, CW, CH, r);
      ctx.fill();
      // Pattern
      ctx.strokeStyle = C.cardBackPat;
      ctx.lineWidth = 0.8;
      for (var i = 0; i < CW; i += 8) {
        ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i, y + CH); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(200,155,60,0.3)';
      ctx.lineWidth = 1;
      roundRect(ctx, x + 3, y + 3, CW - 6, CH - 6, 2);
      ctx.stroke();
      return;
    }

    // Card face
    ctx.fillStyle = selected ? C.cardSel : C.cardBg;
    roundRect(ctx, x, y, CW, CH, r);
    ctx.fill();

    var col = C[card.suit] || '#333';
    var sym = suitSymbol(card.suit);
    var rn  = RANK_NAMES[card.rank];

    // Rank top-left
    ctx.fillStyle = col;
    ctx.font = 'bold 10px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(rn, x + 3, y + 13);

    // Suit top-left (small)
    ctx.font = '10px sans-serif';
    ctx.fillText(sym, x + 3, y + 24);

    // Center symbol large
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sym, x + CW / 2, y + CH / 2 + 8);

    // Rank bottom-right (rotated)
    ctx.save();
    ctx.translate(x + CW, y + CH);
    ctx.rotate(Math.PI);
    ctx.font = 'bold 10px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = col;
    ctx.fillText(rn, 3, 13);
    ctx.restore();

    // Border
    ctx.strokeStyle = selected ? C.gold : 'rgba(0,0,0,0.12)';
    ctx.lineWidth   = selected ? 2 : 1;
    roundRect(ctx, x, y, CW, CH, r);
    ctx.stroke();
  }

  function suitSymbol(suit) {
    return { oros: '◉', copas: '♥', espadas: '♠', bastos: '♣' }[suit] || '?';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ── Round-end / game-end overlays ────────────────────────────────────────────
  function showRoundEnd() {
    var rs = lastRoundScores();
    showOverlay(
      'Round over',
      'You +' + rs.player + ' pts · CPU +' + rs.ai + ' pts\n' +
      'Total — You: ' + G.playerScore + ' · CPU: ' + G.aiScore,
      'Next round',
      function () {
        // Reset ronda state but keep scores
        G.playerCaptured = []; G.aiCaptured = [];
        G.playerMesas = 0; G.aiMesas = 0;
        G.deck = buildDeck();
        G.table = [];
        G.playerHand = []; G.aiHand = [];
        G.lastCapture = null;
        G.message = '';
        G.handsDealt = 0;
        G.phase = 'playing';
        G.turn = 'player';
        dealHand();
        render();
      }
    );
  }

  function showGameEnd() {
    var winner = G.playerScore >= TARGET ? 'player' : 'ai';
    showOverlay(
      winner === 'player' ? 'You win!' : 'CPU wins',
      'You: ' + G.playerScore + ' pts · CPU: ' + G.aiScore + ' pts',
      'Play again',
      function () { newGame(); }
    );
    if (winner === 'player' && window.Achievements) {
      Achievements.track('cu_first_win');
      Achievements.increment('cuarenta', 'wins');
    }
  }

  var lastRondaScores = { player: 0, ai: 0 };
  function lastRoundScores() {
    // scores were already added to totals in checkProgress → scoreRonda
    // we can't re-run, so we track separately
    return lastRondaScores;
  }

  function showOverlay(title, body, btnLabel, onBtn) {
    var el = document.getElementById('cu-overlay');
    if (!el) return;
    document.getElementById('cu-overlay-title').textContent = title;
    document.getElementById('cu-overlay-body').textContent  = body;
    var btn = document.getElementById('cu-overlay-btn');
    btn.textContent = btnLabel;
    btn.onclick = function () { el.hidden = true; onBtn(); };
    el.hidden = false;
  }

  // ── Play button (HTML control) ───────────────────────────────────────────────
  function bindControls() {
    var playBtn  = document.getElementById('cu-play-btn');
    var newBtn   = document.getElementById('cu-new-btn');

    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (G.selectedIdx !== null && G.turn === 'player' && G.phase === 'playing') {
          commitPlay();
        }
      });
    }
    if (newBtn) {
      newBtn.addEventListener('click', function () {
        if (confirm('Start a new game?')) newGame();
      });
    }
  }

  // Keep play button state synced
  var _renderOrig = render;
  render = function () {
    _renderOrig();
    var pb = document.getElementById('cu-play-btn');
    if (pb) {
      pb.disabled = G.selectedIdx === null || G.turn !== 'player' || G.phase !== 'playing';
    }
  };

  // ── Track ronda scores before resetting ─────────────────────────────────────
  var _scoreRondaOrig = scoreRonda;
  scoreRonda = function () {
    var r = _scoreRondaOrig();
    lastRondaScores = r;
    return r;
  };

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('cu-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Fill container at full DPR — CSS scales visually, click handler uses getBoundingClientRect
    var dpr = window.devicePixelRatio || 1;
    canvas.width  = LW * dpr;
    canvas.height = LH * dpr;
    canvas.style.width  = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    ctx.scale(dpr, dpr);

    // Click
    canvas.addEventListener('click', function (e) {
      var rect   = canvas.getBoundingClientRect();
      var scaleX = LW / rect.width;
      var scaleY = LH / rect.height;
      handleCanvasClick((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    });

    // Touch
    canvas.addEventListener('touchend', function (e) {
      e.preventDefault();
      var t      = e.changedTouches[0];
      var rect   = canvas.getBoundingClientRect();
      var scaleX = LW / rect.width;
      var scaleY = LH / rect.height;
      handleCanvasClick((t.clientX - rect.left) * scaleX, (t.clientY - rect.top) * scaleY);
    }, { passive: false });

    bindControls();
    newGame();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
