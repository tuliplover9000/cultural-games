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
  var RANK_NAMES = { 1:'A', 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 10:'J', 11:'Q', 12:'K' };
  // Internal suit keys are unchanged (logic untouched); they map to French-deck
  // art & symbols: copas→hearts, oros→diamonds, espadas→spades, bastos→clubs.
  var SUIT_SYM   = { oros:'♦', copas:'♥', espadas:'♠', bastos:'♣' };
  var TARGET     = 40;

  // ── Card art (inline SVG, hand-drawn French-suited poker faces) ─────────────
  var ART_BG   = '#FDFBF7';   // card cream
  var ART_INK  = '#2b2320';   // ink outline
  var ART_RED  = '#C03A2B';   // hearts / diamonds
  var ART_BLK  = '#26221E';   // spades / clubs
  var ART_GOLD = '#D9A441';   // court accent
  var ART_BLUE = '#44608c';   // court accent
  var ART_SKIN = '#e9bd92';
  var ART_BACK = '#8E2323';   // tienda-deck back red
  var ART_CREAM = '#F3E6C8';
  var SUIT_INK = { oros: ART_RED, copas: ART_RED, espadas: ART_BLK, bastos: ART_BLK };

  function N(v) { return String(Math.round(v * 100) / 100); }

  // Suit pip shapes, centred on (0,0), ~18 units tall (scaled via pip()).
  var PIP_PATH = {
    copas:   'M0 7.4 C-8 0.6 -9.2 -6 -4.8 -8 C-1.8 -9.3 -0.2 -6.6 0 -4.8 C0.2 -6.6 1.8 -9.3 4.8 -8 C9.2 -6 8 0.6 0 7.4 Z',
    oros:    'M0 -9 Q4 -4.4 6.2 0 Q4 4.4 0 9 Q-4 4.4 -6.2 0 Q-4 -4.4 0 -9 Z',
    espadas: 'M0 -8.8 C6.6 -2.4 8.6 2 5.2 5 C2.7 7.1 0.6 5.2 0 3.4 C-0.6 5.2 -2.7 7.1 -5.2 5 C-8.6 2 -6.6 -2.4 0 -8.8 Z M-3.3 9.2 C-1.3 7.4 -0.8 5 0 2.4 C0.8 5 1.3 7.4 3.3 9.2 Z',
  };

  function pip(suit, x, y, s, flip) {
    var col = SUIT_INK[suit];
    var jit = ((Math.round(x) * 13 + Math.round(y) * 7) % 5) - 2;  // deterministic hand-drawn tilt
    var rot = (flip ? 180 : 0) + jit;
    var body;
    if (suit === 'bastos') {
      body = '<circle cx="0" cy="-4.4" r="4.5" fill="' + col + '"/>'
           + '<circle cx="-4.3" cy="2.6" r="4.5" fill="' + col + '"/>'
           + '<circle cx="4.3" cy="2.6" r="4.5" fill="' + col + '"/>'
           + '<path d="M-3.4 9.4 C-1.4 7.4 -0.9 4.4 0 1.2 C0.9 4.4 1.4 7.4 3.4 9.4 Z" fill="' + col + '"/>';
    } else {
      body = '<path d="' + PIP_PATH[suit] + '" fill="' + col + '"/>';
    }
    return '<g transform="translate(' + N(x) + ' ' + N(y) + ') rotate(' + N(rot) + ') scale(' + N(s) + ')">' + body + '</g>';
  }

  // Classic pip layouts for A, 2–7 (viewBox 100×150; lower pips flipped).
  var PIP_LAYOUT = {
    1: [[50, 75, 2.5]],
    2: [[50, 46, 1.25], [50, 104, 1.25]],
    3: [[50, 44, 1.15], [50, 75, 1.15], [50, 106, 1.15]],
    4: [[34, 47, 1.1], [66, 47, 1.1], [34, 103, 1.1], [66, 103, 1.1]],
    5: [[34, 46, 1.05], [66, 46, 1.05], [50, 75, 1.05], [34, 104, 1.05], [66, 104, 1.05]],
    6: [[34, 45, 1], [66, 45, 1], [34, 75, 1], [66, 75, 1], [34, 105, 1], [66, 105, 1]],
    7: [[34, 44, 0.95], [66, 44, 0.95], [50, 59, 0.95],
        [34, 74, 0.95], [66, 74, 0.95], [34, 104, 0.95], [66, 104, 0.95]],
  };

  // Court cards — naive single full-length figures (Truc house style), flat
  // fills, thick ink outlines, no gradients.
  function faceJ(suit) {       // young page: cap + feather, blue tunic, holds suit pip
    return '<path d="M41 35 Q50 26 59 35 L59 38 L41 38 Z" fill="' + ART_RED + '" stroke="' + ART_INK + '" stroke-width="2"/>'
         + '<path d="M57 30 Q63 23 66 26 Q62 30 58 33 Z" fill="' + ART_BLUE + '" stroke="' + ART_INK + '" stroke-width="1.2"/>'
         + '<circle cx="50" cy="46" r="8.5" fill="' + ART_SKIN + '" stroke="' + ART_INK + '" stroke-width="2"/>'
         + '<path d="M47 49 Q50 51.5 53 49" fill="none" stroke="' + ART_INK + '" stroke-width="1.2" stroke-linecap="round"/>'
         + '<path d="M40 57 L60 57 L65 96 L35 96 Z" fill="' + ART_BLUE + '" stroke="' + ART_INK + '" stroke-width="2"/>'
         + '<rect x="38.5" y="74" width="23" height="4" fill="' + ART_GOLD + '" stroke="' + ART_INK + '" stroke-width="1"/>'
         + '<line x1="44" y1="96" x2="43" y2="114" stroke="#6b4520" stroke-width="5"/>'
         + '<line x1="56" y1="96" x2="57" y2="114" stroke="#6b4520" stroke-width="5"/>'
         + '<line x1="60" y1="66" x2="70" y2="74" stroke="' + ART_SKIN + '" stroke-width="4" stroke-linecap="round"/>'
         + pip(suit, 72, 80, 0.6);
  }
  function faceQ(suit) {       // queen: small crown, red gown, flower + suit pip
    return '<path d="M42 37 L42 30 L46 34 L50 28 L54 34 L58 30 L58 37 Z" fill="' + ART_GOLD + '" stroke="' + ART_INK + '" stroke-width="2"/>'
         + '<circle cx="50" cy="47" r="8.5" fill="' + ART_SKIN + '" stroke="' + ART_INK + '" stroke-width="2"/>'
         + '<path d="M42 45 Q39 54 42 60 M58 45 Q61 54 58 60" fill="none" stroke="' + ART_INK + '" stroke-width="1.6"/>'
         + '<path d="M47 50 Q50 52.5 53 50" fill="none" stroke="' + ART_INK + '" stroke-width="1.2" stroke-linecap="round"/>'
         + '<path d="M38 59 L62 59 L68 112 L32 112 Z" fill="' + ART_RED + '" stroke="' + ART_INK + '" stroke-width="2"/>'
         + '<rect x="34" y="103" width="32" height="5" fill="' + ART_GOLD + '" stroke="' + ART_INK + '" stroke-width="1"/>'
         + '<line x1="40" y1="66" x2="31" y2="59" stroke="' + ART_SKIN + '" stroke-width="4" stroke-linecap="round"/>'
         + '<line x1="29" y1="62" x2="28" y2="56" stroke="#4a6b3a" stroke-width="2"/>'
         + '<circle cx="28" cy="52" r="3.4" fill="' + ART_GOLD + '" stroke="' + ART_INK + '" stroke-width="1.2"/>'
         + '<circle cx="28" cy="52" r="1.3" fill="' + ART_RED + '"/>'
         + '<line x1="60" y1="66" x2="70" y2="72" stroke="' + ART_SKIN + '" stroke-width="4" stroke-linecap="round"/>'
         + pip(suit, 73, 78, 0.6);
  }
  function faceK(suit) {       // bearded king: crown + jewel, robe with gold trim
    return '<path d="M40 38 L40 29 L45 35 L50 27 L55 35 L60 29 L60 38 Z" fill="' + ART_GOLD + '" stroke="' + ART_INK + '" stroke-width="2"/>'
         + '<circle cx="50" cy="33" r="1.6" fill="' + ART_RED + '"/>'
         + '<circle cx="50" cy="48" r="8.5" fill="' + ART_SKIN + '" stroke="' + ART_INK + '" stroke-width="2"/>'
         + '<path d="M43 51 Q50 62 57 51 L56 58 Q50 66 44 58 Z" fill="#ece4d4" stroke="' + ART_INK + '" stroke-width="1.5"/>'
         + '<path d="M37 62 L63 62 L69 114 L31 114 Z" fill="' + ART_RED + '" stroke="' + ART_INK + '" stroke-width="2"/>'
         + '<path d="M37 62 L43 114 M63 62 L57 114" fill="none" stroke="' + ART_GOLD + '" stroke-width="2.5" opacity="0.9"/>'
         + '<rect x="33" y="105" width="34" height="5" fill="' + ART_GOLD + '" stroke="' + ART_INK + '" stroke-width="1"/>'
         + '<line x1="62" y1="68" x2="72" y2="54" stroke="' + ART_SKIN + '" stroke-width="4" stroke-linecap="round"/>'
         + pip(suit, 74, 47, 0.6);
  }

  function cornerIndex(rank, suit) {
    return '<text class="cu-ix" x="6" y="21" font-size="17" font-weight="bold" font-family="Georgia, serif" fill="'
         + SUIT_INK[suit] + '">' + RANK_NAMES[rank] + '</text>'
         + pip(suit, 12, 31, 0.48);
  }

  // All strings here are internal constants — innerHTML-safe by construction.
  function cardSVG(rank, suit) {
    var mid;
    if (rank >= 10) {
      mid = '<rect x="23" y="27" width="54" height="96" rx="3" fill="none" stroke="' + ART_INK + '" stroke-width="1.3" opacity="0.5"/>'
          + (rank === 10 ? faceJ(suit) : (rank === 11 ? faceQ(suit) : faceK(suit)));
    } else {
      var lay = PIP_LAYOUT[rank], out = '', i;
      for (i = 0; i < lay.length; i++) out += pip(suit, lay[i][0], lay[i][1], lay[i][2], lay[i][1] > 80);
      mid = out;
    }
    return '<svg viewBox="0 0 100 150" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<rect x="1" y="1" width="98" height="148" rx="9" fill="' + ART_BG + '"/>'
      + '<rect x="3.5" y="3.5" width="93" height="143" rx="7" fill="none" stroke="' + ART_INK + '" stroke-width="1" opacity="0.25"/>'
      + cornerIndex(rank, suit)
      + '<g transform="rotate(180 50 75)">' + cornerIndex(rank, suit) + '</g>'
      + mid
      + '</svg>';
  }

  // Mini score-cards (pure visualization of the score integer):
  // perro = face-down back with a dog badge (10 pts), tanto = face-up 8/9/10 (2 pts).
  function perroSVG() {
    return '<svg viewBox="0 0 100 150" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<rect x="1" y="1" width="98" height="148" rx="10" fill="' + ART_BACK + '"/>'
      + '<rect x="7" y="7" width="86" height="136" rx="7" fill="none" stroke="' + ART_CREAM + '" stroke-width="4"/>'
      + '<rect x="14" y="14" width="72" height="122" rx="5" fill="none" stroke="' + ART_CREAM + '" stroke-width="2" opacity="0.6"/>'
      + '<circle cx="50" cy="75" r="29" fill="' + ART_CREAM + '"/>'
      + '<path d="M36 93 Q33 79 40 71 Q46 63 55 61 Q56 53 62 51 Q68 49 70 55 L75 57 L70 61 Q72 65 68 68 Q70 77 67 93 L61 93 L60 85 Q52 87 46 85 L45 93 Z" fill="' + ART_BACK + '"/>'
      + '<path d="M38 86 Q29 84 30 75" fill="none" stroke="' + ART_BACK + '" stroke-width="4" stroke-linecap="round"/>'
      + '</svg>';
  }
  function tantoSVG(lbl) {
    return '<svg viewBox="0 0 100 150" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<rect x="1" y="1" width="98" height="148" rx="10" fill="' + ART_BG + '"/>'
      + '<rect x="5" y="5" width="90" height="140" rx="8" fill="none" stroke="' + ART_INK + '" stroke-width="2" opacity="0.3"/>'
      + '<text x="50" y="95" text-anchor="middle" font-size="58" font-weight="bold" font-family="Georgia, serif" fill="' + ART_RED + '">' + lbl + '</text>'
      + pip('oros', 16, 24, 0.65)
      + '<g transform="rotate(180 50 75)">' + pip('oros', 16, 24, 0.65) + '</g>'
      + '</svg>';
  }
  function scoreMinis(score) {
    var perros = Math.floor(score / 10);
    var tantos = Math.floor((score % 10) / 2);
    if (perros + tantos <= 0) return '';
    var labels = ['8', '9', '10'];
    var out = '<span class="cu-minis" aria-hidden="true">', i;
    for (i = 0; i < perros; i++) out += '<span class="cu-mini" title="Perro — 10 pts">' + perroSVG() + '</span>';
    for (i = 0; i < tantos; i++) out += '<span class="cu-mini" title="Tanto — 2 pts">' + tantoSVG(labels[i % 3]) + '</span>';
    return out + '</span>';
  }

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
    callout:       '',      // big table-centre shout (¡CAÍDA! / ¡LIMPIA!) — display only
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
      lastPlay:       null,
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
    if (!G.lastPlay) return false;
    var opp = who === 'player' ? 'ai' : 'player';
    return G.lastPlay.who === opp && G.lastPlay.cardRank === card.rank;
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
        anim.callout  = '¡CAÍDA!';
        anim.flashMsg = '⚡ Caída! +1 bonus';
        addLog(who, '⚡ Caída! ' + name + ' scored +1 bonus');
        if (who === 'player') { G.playerMesas++; if (window.Achievements) Achievements.track('cu_caida'); }
        else G.aiMesas++;
      }
      if (G.table.length === 0) {
        anim.callout  = anim.callout === '¡CAÍDA!' ? '¡CAÍDA Y LIMPIA!' : '¡LIMPIA!';
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
    G.lastPlay = { who: who, cardRank: card.rank };
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

    // Consume the shout once (display only — set at the existing detection sites)
    var callout = anim.callout;
    anim.callout = '';

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
      + (callout ? '<div class="cu-callout cu-callout--show">' + callout + '</div>' : '')
      + '</div>';
  }

  function scoreStrip() {
    return '<div class="cu-score-strip">'
      + '<span class="cu-score-side">You: <strong>' + G.playerScore + '</strong> pts'
      + scoreMinis(G.playerScore)
      + '<span class="cu-score-sub">' + G.playerCaptured.length + ' cap · ' + G.playerMesas + ' clears</span></span>'
      + '<span class="cu-score-mid">Deck: ' + G.deck.length + ' &nbsp;·&nbsp; Goal: ' + TARGET + '</span>'
      + '<span class="cu-score-side cu-score-side--cpu">CPU: <strong>' + G.aiScore + '</strong> pts'
      + scoreMinis(G.aiScore)
      + '<span class="cu-score-sub">' + G.aiCaptured.length + ' cap · ' + G.aiMesas + ' clears</span></span>'
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
    anim.callout = '';                       // drop any pending shout (display only)
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
      G.lastPlay = null;
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
    anim.callout = '';                       // drop any pending shout (display only)
    var won = G.playerScore >= TARGET;
    var phrase = won
      ? '¡Cuarenta señores, gracias!'
      : (G.playerScore < 10 ? '¡Zapatero! Shut out under 10 points.' : 'Better luck next time.');
    el.innerHTML = '<div class="tl-game cu-game">'
      + '<div class="tl-gameover visible">'
      + '<div class="tl-gameover__icon">' + (won ? '🏆' : '🃏') + '</div>'
      + '<h2>' + (won ? 'You win!' : 'CPU wins') + '</h2>'
      + '<p class="cu-win-phrase">' + phrase + '</p>'
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
    var dataStr  = dataIdx !== undefined ? ' data-idx="' + dataIdx + '"' : '';
    var clsStr   = cls ? ' ' + cls : '';
    return '<div class="tl-card ' + colorCls + clsStr + '"' + dataStr + (styStr || '') + '>'
      + cardSVG(card.rank, card.suit)
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

    var tbl = el.querySelector('.cu-table-area');
    if (tbl) tbl.addEventListener('click', commitPlay);

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
