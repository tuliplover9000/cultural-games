/* ganjifa.js — Mughal Ganjifa trick-taking card game
 * 96 cards, 8 suits × 12 ranks, 4 players (1 human south + 3 AI)
 * Multi-round scoring to 50 points.
 */
(function () {
  'use strict';

  // ── Phase B: Data Model ────────────────────────────────────────────────────

  var SUITS = [
    { id: 'ghulam',   name: 'Ghulam',   color: '#8B1A1A', motif: 'servant'    },
    { id: 'taj',      name: 'Taj',      color: '#D4A017', motif: 'crown'      },
    { id: 'shamshir', name: 'Shamshir', color: '#2C5F8A', motif: 'sword'      },
    { id: 'qimash',   name: 'Qimash',   color: '#4A7C3F', motif: 'cloth'      },
    { id: 'qulaba',   name: 'Qulaba',   color: '#7B3F9E', motif: 'harness'    },
    { id: 'chang',    name: 'Chang',    color: '#C4732A', motif: 'harp'       },
    { id: 'surkh',    name: 'Surkh',    color: '#9B0000', motif: 'gold_coins' },
    { id: 'safed',    name: 'Safed',    color: '#6A6A52', motif: 'silver'     },
  ];

  var SUIT_MAP = {};
  SUITS.forEach(function (s) { SUIT_MAP[s.id] = s; });

  var SEATS = ['south', 'west', 'north', 'east'];
  var SEAT_LABELS = { south: 'You', west: 'West', north: 'North', east: 'East' };

  function rankLabel(rank) {
    if (rank === 12) return 'M';
    if (rank === 11) return 'V';
    return String(rank);
  }

  function buildDeck() {
    var deck = [];
    SUITS.forEach(function (suit) {
      for (var rank = 1; rank <= 12; rank++) {
        deck.push({ id: suit.id + '_' + rank, suit: suit.id, rank: rank });
      }
    });
    return deck;
  }

  function shuffleDeck(deck) {
    var arr = deck.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function dealHands(deck) {
    return {
      south: deck.slice(0,  24),
      west:  deck.slice(24, 48),
      north: deck.slice(48, 72),
      east:  deck.slice(72, 96),
    };
  }

  function determineTrump(southHand) {
    // First Mir (rank 12)
    for (var i = 0; i < southHand.length; i++) {
      if (southHand[i].rank === 12) return southHand[i].suit;
    }
    // First Vizier (rank 11)
    for (var j = 0; j < southHand.length; j++) {
      if (southHand[j].rank === 11) return southHand[j].suit;
    }
    // Random
    return southHand[Math.floor(Math.random() * southHand.length)].suit;
  }

  function getLegalPlays(hand, ledSuit, isLeading) {
    if (isLeading || !ledSuit) return hand.slice();
    var suitCards = hand.filter(function (c) { return c.suit === ledSuit; });
    return suitCards.length > 0 ? suitCards : hand.slice();
  }

  function cardPower(card, ledSuit, trumpSuit) {
    if (card.suit === trumpSuit) return 200 + card.rank;
    if (card.suit === ledSuit)   return 100 + card.rank;
    return card.rank;
  }

  function trickWinner(trick, ledSuit, trumpSuit) {
    var bestSeat = null;
    var bestPower = -1;
    SEATS.forEach(function (seat) {
      var card = trick[seat];
      if (!card) return;
      // Only trump or led-suit cards can win
      if (card.suit !== trumpSuit && card.suit !== ledSuit) return;
      var power = cardPower(card, ledSuit, trumpSuit);
      if (power > bestPower) {
        bestPower = power;
        bestSeat = seat;
      }
    });
    // Fallback: if somehow no eligible card (shouldn't happen), pick lead
    if (!bestSeat) {
      // leader's card
      bestSeat = SEATS.find(function (s) { return !!trick[s]; }) || 'south';
    }
    return bestSeat;
  }

  // ── Canvas Layout Constants ────────────────────────────────────────────────

  var BASE_W  = 900;
  var BASE_H  = 660;
  var HAND_H  = 80;
  var SOUTH_H = 95;
  var FULL_R  = 36;
  var AI_R    = 22;
  var TRICK_R = 44;
  var CACHE_R = 50;

  var TABLE_X = HAND_H;         // 80
  var TABLE_Y = HAND_H;         // 80
  var TABLE_W = BASE_W - 2 * HAND_H;  // 740
  var TABLE_H = BASE_H - HAND_H - SOUTH_H;  // 485
  var CX = 450;
  var CY = TABLE_Y + TABLE_H / 2;  // 80 + 242.5 = 322.5

  // ── State ─────────────────────────────────────────────────────────────────

  var state = {
    hands:        { south: [], west: [], north: [], east: [] },
    currentTrick: { south: null, west: null, north: null, east: null },
    trickHistory: [],
    tricksWon:    { south: 0, west: 0, north: 0, east: 0 },
    currentLead:  'south',
    currentTurn:  'south',
    ledSuit:      null,
    trumpSuit:    null,
    round:        1,
    scores:       { south: 0, west: 0, north: 0, east: 0 },
    gameOver:     false,
    winner:       null,
    selectedCard: null,
    animating:    false,
    phase:        'play',
    pendingTimeouts: [],
    lastRoundResult: null,
  };

  function cancelAllTimeouts() {
    state.pendingTimeouts.forEach(function (id) { clearTimeout(id); });
    state.pendingTimeouts = [];
  }

  function delay(ms, fn) {
    var id = setTimeout(fn, ms);
    state.pendingTimeouts.push(id);
  }

  function resetGame() {
    cancelAllTimeouts();
    state.scores    = { south: 0, west: 0, north: 0, east: 0 };
    state.round     = 1;
    state.gameOver  = false;
    state.winner    = null;
    state.lastRoundResult = null;
    startRound();
  }

  function startRound() {
    var deck  = shuffleDeck(buildDeck());
    var hands = dealHands(deck);
    state.hands        = hands;
    state.currentTrick = { south: null, west: null, north: null, east: null };
    state.trickHistory = [];
    state.tricksWon    = { south: 0, west: 0, north: 0, east: 0 };
    state.currentLead  = 'south';
    state.currentTurn  = 'south';
    state.ledSuit      = null;
    state.trumpSuit    = determineTrump(hands.south);
    state.selectedCard = null;
    state.animating    = false;
    state.phase        = 'play';
    drawFrame();
    updateAriaLive();
    if (state.currentTurn !== 'south') scheduleAI();
  }

  // ── Card Cache (offscreen canvases) ────────────────────────────────────────

  var cardCache = {};

  function buildCache() {
    cardCache = {};
    var size = CACHE_R * 2 + 4;

    // Build all card faces
    SUITS.forEach(function (suit) {
      for (var rank = 1; rank <= 12; rank++) {
        var id  = suit.id + '_' + rank;
        var oc  = document.createElement('canvas');
        oc.width = oc.height = size;
        var octx = oc.getContext('2d');
        drawCardFaceOnCtx(octx, CACHE_R + 2, CACHE_R + 2, CACHE_R, suit, rank);
        cardCache[id] = oc;
      }
    });

    // Card back
    var bc = document.createElement('canvas');
    bc.width = bc.height = size;
    var bctx = bc.getContext('2d');
    drawCardBackOnCtx(bctx, CACHE_R + 2, CACHE_R + 2, CACHE_R);
    cardCache['back'] = bc;
  }

  function drawCardBackOnCtx(ctx, cx, cy, r) {
    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0D1B3E';
    ctx.fill();

    // 3 concentric gold rings
    [0.85, 0.70, 0.55].forEach(function (frac) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * frac, 0, Math.PI * 2);
      ctx.strokeStyle = '#D4A017';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    // 8-petal flower
    ctx.save();
    ctx.translate(cx, cy);
    for (var i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.35, r * 0.12, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(212,160,23,0.4)';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // Outer border
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#D4A017';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawCardFaceOnCtx(ctx, cx, cy, r, suit, rank) {
    var isCourtCard = rank >= 11;

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isCourtCard ? '#C8960C' : suit.color;
    ctx.fill();

    // Dot pattern on outer ring perimeter
    var dotCount = 10;
    for (var d = 0; d < dotCount; d++) {
      var angle = (d / dotCount) * Math.PI * 2;
      var dx = cx + Math.cos(angle) * r * 0.92;
      var dy = cy + Math.sin(angle) * r * 0.92;
      ctx.beginPath();
      ctx.arc(dx, dy, r * 0.04, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
    }

    // Middle ring
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = '#F5EDD6';
    ctx.fill();
    ctx.strokeStyle = suit.color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Rank numeral at top of middle ring
    var fontSize = Math.max(8, Math.round(r * 0.38));
    ctx.font = 'bold ' + fontSize + 'px Cinzel, "Playfair Display", serif';
    ctx.fillStyle = suit.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rankLabel(rank), cx, cy - r * 0.44);

    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = '#FAF0D8';
    ctx.fill();
    ctx.strokeStyle = isCourtCard ? '#C8960C' : suit.color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw suit motif in center
    drawMotif(ctx, cx, cy, r * 0.38, suit, rank);
  }

  function drawMotif(ctx, cx, cy, r, suit, rank) {
    ctx.strokeStyle = '#C8960C';
    ctx.fillStyle   = suit.color;
    ctx.lineWidth   = Math.max(1, r * 0.08);

    switch (suit.motif) {
      case 'servant':   drawServant(ctx, cx, cy, r, rank);   break;
      case 'crown':     drawCrown(ctx, cx, cy, r);            break;
      case 'sword':     drawSword(ctx, cx, cy, r);            break;
      case 'cloth':     drawCloth(ctx, cx, cy, r);            break;
      case 'harness':   drawHarness(ctx, cx, cy, r);          break;
      case 'harp':      drawHarp(ctx, cx, cy, r);             break;
      case 'gold_coins':drawCoins(ctx, cx, cy, r);            break;
      case 'silver':    drawSilver(ctx, cx, cy, r);           break;
    }
  }

  function drawServant(ctx, cx, cy, r, rank) {
    var lw = ctx.lineWidth;
    if (rank === 12) {
      // Mir: throne + body + head + crown
      // Throne (rectangle at bottom)
      ctx.fillStyle = '#C8960C';
      ctx.fillRect(cx - r * 0.4, cy + r * 0.3, r * 0.8, r * 0.2);
      // Body
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(cx - r * 0.15, cy - r * 0.1, r * 0.3, r * 0.4);
      // Head
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.25, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      // Crown (3 points)
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.2, cy - r * 0.42);
      ctx.lineTo(cx - r * 0.2, cy - r * 0.6);
      ctx.lineTo(cx,           cy - r * 0.72);
      ctx.lineTo(cx + r * 0.2, cy - r * 0.6);
      ctx.lineTo(cx + r * 0.2, cy - r * 0.42);
      ctx.closePath();
      ctx.fillStyle = '#C8960C';
      ctx.fill();
    } else if (rank === 11) {
      // Vizier: body + head + staff
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(cx - r * 0.12, cy - r * 0.05, r * 0.24, r * 0.45);
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.2, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
      // Staff
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.25, cy - r * 0.5);
      ctx.lineTo(cx - r * 0.05, cy + r * 0.45);
      ctx.strokeStyle = '#C8960C';
      ctx.lineWidth = lw * 1.5;
      ctx.stroke();
      ctx.lineWidth = lw;
    } else {
      // Generic servant: body + head + arms
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(cx - r * 0.1, cy, r * 0.2, r * 0.38);
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.05, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
      // Arms
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.28, cy + r * 0.12);
      ctx.lineTo(cx - r * 0.1,  cy + r * 0.08);
      ctx.moveTo(cx + r * 0.1,  cy + r * 0.08);
      ctx.lineTo(cx + r * 0.28, cy + r * 0.12);
      ctx.strokeStyle = '#C8960C';
      ctx.stroke();
    }
  }

  function drawCrown(ctx, cx, cy, r) {
    // 5-point crown
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy + r * 0.25);  // bottom-left
    ctx.lineTo(cx - r * 0.45, cy - r * 0.05);  // left side up
    ctx.lineTo(cx - r * 0.3,  cy - r * 0.3);   // left peak down
    ctx.lineTo(cx - r * 0.15, cy - r * 0.05);  // valley
    ctx.lineTo(cx,            cy - r * 0.45);  // center peak
    ctx.lineTo(cx + r * 0.15, cy - r * 0.05);  // valley
    ctx.lineTo(cx + r * 0.3,  cy - r * 0.3);   // right peak down
    ctx.lineTo(cx + r * 0.45, cy - r * 0.05);  // right side up
    ctx.lineTo(cx + r * 0.45, cy + r * 0.25);  // bottom-right
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Gem dots on band
    [-0.25, 0, 0.25].forEach(function (xOff) {
      ctx.beginPath();
      ctx.arc(cx + xOff * r, cy + r * 0.08, r * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = '#FAF0D8';
      ctx.fill();
    });
  }

  function drawSword(ctx, cx, cy, r) {
    // Curved blade
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.1, cy + r * 0.42);
    ctx.quadraticCurveTo(cx - r * 0.15, cy, cx + r * 0.15, cy - r * 0.42);
    ctx.strokeStyle = '#C8960C';
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.stroke();
    // Cross guard
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, cy + r * 0.15);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.15);
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.stroke();
    // Handle
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.05, cy + r * 0.15);
    ctx.lineTo(cx - r * 0.05, cy + r * 0.42);
    ctx.moveTo(cx + r * 0.05, cy + r * 0.15);
    ctx.lineTo(cx + r * 0.05, cy + r * 0.42);
    ctx.stroke();
  }

  function drawCloth(ctx, cx, cy, r) {
    // 3 horizontal wavy lines
    var offsets = [-r * 0.2, 0, r * 0.2];
    ctx.strokeStyle = '#C8960C';
    ctx.lineWidth = Math.max(1, r * 0.07);
    offsets.forEach(function (dy) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.4, cy + dy);
      ctx.bezierCurveTo(
        cx - r * 0.13, cy + dy - r * 0.12,
        cx + r * 0.13, cy + dy + r * 0.12,
        cx + r * 0.4,  cy + dy
      );
      ctx.stroke();
    });
    // Vertical fold lines
    ctx.lineWidth = Math.max(0.5, r * 0.04);
    ctx.globalAlpha = 0.5;
    [-r * 0.15, r * 0.15].forEach(function (dx) {
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy - r * 0.28);
      ctx.lineTo(cx + dx, cy + r * 0.28);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function drawHarness(ctx, cx, cy, r) {
    // Outer circle
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.44, 0, Math.PI * 2);
    ctx.strokeStyle = '#C8960C';
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.stroke();
    // Inner circle
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    // 4 spokes
    [0, 1, 2, 3].forEach(function (i) {
      var a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.22, cy + Math.sin(a) * r * 0.22);
      ctx.lineTo(cx + Math.cos(a) * r * 0.44, cy + Math.sin(a) * r * 0.44);
      ctx.stroke();
    });
    // Buckle dot at bottom
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.44, r * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = '#C8960C';
    ctx.fill();
  }

  function drawHarp(ctx, cx, cy, r) {
    ctx.strokeStyle = '#C8960C';
    ctx.lineWidth = Math.max(1, r * 0.07);
    // Harp neck/body arch
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy + r * 0.4);
    ctx.bezierCurveTo(
      cx - r * 0.35, cy - r * 0.1,
      cx + r * 0.1,  cy - r * 0.5,
      cx + r * 0.2,  cy - r * 0.3
    );
    ctx.stroke();
    // Base line
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy + r * 0.4);
    ctx.lineTo(cx + r * 0.2, cy + r * 0.4);
    ctx.stroke();
    // Strings
    var numStrings = 4;
    for (var s = 0; s < numStrings; s++) {
      var t = (s + 1) / (numStrings + 1);
      var bx = cx - r * 0.2 + t * r * 0.4;
      var by = cy + r * 0.4;
      // Approximate arch point
      var ax = cx - r * 0.2 + t * (r * 0.2 - (-r * 0.2)) * 0.5;
      var ay = cy - r * 0.3 * t;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ax, ay);
      ctx.lineWidth = Math.max(0.5, r * 0.04);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(1, r * 0.07);
  }

  function drawCoins(ctx, cx, cy, r) {
    // 3 stacked coin ellipses
    var coinOffsets = [r * 0.18, 0, -r * 0.18];
    coinOffsets.forEach(function (dy, i) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + dy, r * 0.32, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#D4A017';
      ctx.fill();
      ctx.strokeStyle = '#C8960C';
      ctx.lineWidth = Math.max(0.5, r * 0.05);
      ctx.stroke();
    });
  }

  function drawSilver(ctx, cx, cy, r) {
    // Trapezoid ingot
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, cy + r * 0.28);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.28);
    ctx.lineTo(cx + r * 0.22, cy - r * 0.28);
    ctx.lineTo(cx - r * 0.22, cy - r * 0.28);
    ctx.closePath();
    ctx.fillStyle = '#D4A017';
    ctx.fill();
    ctx.strokeStyle = '#C8960C';
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.stroke();
    // Shine line
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.18, cy - r * 0.05);
    ctx.lineTo(cx + r * 0.18, cy - r * 0.05);
    ctx.strokeStyle = 'rgba(255,255,220,0.6)';
    ctx.lineWidth = Math.max(0.5, r * 0.04);
    ctx.stroke();
  }

  // ── Canvas rendering ───────────────────────────────────────────────────────

  var canvas, ctx;
  var renderedCards = {};  // card.id → { cx, cy, r }

  function drawFrame() {
    if (!canvas || !ctx) return;
    renderedCards = {};

    // Clear + table fill
    ctx.clearRect(0, 0, BASE_W, BASE_H);
    ctx.fillStyle = '#1A4A3A';
    ctx.fillRect(0, 0, BASE_W, BASE_H);

    // Subtle crosshatch texture
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 0.5;
    for (var tx = 0; tx < BASE_W; tx += 12) {
      ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, BASE_H); ctx.stroke();
    }
    for (var ty = 0; ty < BASE_H; ty += 12) {
      ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(BASE_W, ty); ctx.stroke();
    }

    // Center oval decorative ring
    ctx.beginPath();
    ctx.ellipse(CX, CY, 200, 150, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(212,160,23,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawNorthHand();
    drawWestHand();
    drawEastHand();
    drawTrickArea();
    drawSouthHand();
    drawInfoPanel();

    if (state.phase === 'round-end' || state.phase === 'game-over') {
      drawOverlay();
    }
  }

  function drawNorthHand() {
    var hand = state.hands.north;
    var n = hand.length;
    if (n === 0) return;
    var spacing = Math.min(AI_R * 2.2, (TABLE_W - AI_R * 2) / Math.max(n - 1, 1));
    var totalW = (n - 1) * spacing + AI_R * 2;
    var startX = CX - totalW / 2 + AI_R;
    var y = HAND_H / 2;
    for (var i = 0; i < n; i++) {
      blitCard(startX + i * spacing, y, AI_R, hand[i], false, false);
    }
  }

  function drawWestHand() {
    var hand = state.hands.west;
    var n = hand.length;
    if (n === 0) return;
    var spacing = Math.min(AI_R * 2.2, (TABLE_H - AI_R * 2) / Math.max(n - 1, 1));
    var totalH = (n - 1) * spacing + AI_R * 2;
    var startY = CY - totalH / 2 + AI_R;
    var x = HAND_H / 2;
    for (var i = 0; i < n; i++) {
      blitCard(x, startY + i * spacing, AI_R, hand[i], false, false);
    }
  }

  function drawEastHand() {
    var hand = state.hands.east;
    var n = hand.length;
    if (n === 0) return;
    var spacing = Math.min(AI_R * 2.2, (TABLE_H - AI_R * 2) / Math.max(n - 1, 1));
    var totalH = (n - 1) * spacing + AI_R * 2;
    var startY = CY - totalH / 2 + AI_R;
    var x = BASE_W - HAND_H / 2;
    for (var i = 0; i < n; i++) {
      blitCard(x, startY + i * spacing, AI_R, hand[i], false, false);
    }
  }

  function drawTrickArea() {
    var trickPositions = {
      south: { x: CX,                       y: CY + TRICK_R * 2.2  },
      north: { x: CX,                       y: CY - TRICK_R * 2.2  },
      west:  { x: CX - TRICK_R * 2.2,       y: CY                  },
      east:  { x: CX + TRICK_R * 2.2,       y: CY                  },
    };
    // Draw lead suit label at center
    if (state.ledSuit) {
      var suit = SUIT_MAP[state.ledSuit];
      ctx.font = 'bold 12px Cinzel, serif';
      ctx.fillStyle = 'rgba(245,237,214,0.6)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Led: ' + suit.name, CX, CY);
    }
    SEATS.forEach(function (seat) {
      var card = state.currentTrick[seat];
      var pos = trickPositions[seat];
      if (card) {
        blitCard(pos.x, pos.y, TRICK_R, card, true, false);
      }
    });
  }

  function drawSouthHand() {
    var hand = state.hands.south;
    var n = hand.length;
    if (n === 0) return;

    var legal = getLegalPlays(
      hand,
      state.ledSuit,
      state.currentTurn === 'south' && !state.ledSuit
    );
    var legalSet = {};
    legal.forEach(function (c) { legalSet[c.id] = true; });

    var maxWidth = TABLE_W - 20;
    var spacing  = Math.min(FULL_R * 2.2, maxWidth / Math.max(n - 1, 1));
    var totalW   = (n - 1) * spacing + FULL_R * 2;
    var startX   = CX - totalW / 2 + FULL_R;
    var y = BASE_H - SOUTH_H / 2;

    for (var i = 0; i < n; i++) {
      var card = hand[i];
      var cardX = startX + i * spacing;
      var cardY = y;
      var isSelected = state.selectedCard && state.selectedCard.id === card.id;
      var isHovered  = !isSelected && hoveredCard && hoveredCard.id === card.id;
      var isLegal    = legalSet[card.id];
      var isTurn     = state.currentTurn === 'south' && state.phase === 'play';

      var displayR = isHovered ? Math.round(FULL_R * 1.65) : FULL_R;
      if (isSelected) cardY -= 14;
      if (isHovered)  cardY -= 22;

      ctx.save();
      if (!isTurn || !isLegal) {
        ctx.globalAlpha = isHovered ? 0.65 : 0.45;
      }
      blitCard(cardX, cardY, displayR, card, true, isSelected, true /* store in renderedCards */);
      ctx.restore();

      // Store position for hit testing (use actual rendered radius)
      renderedCards[card.id] = { cx: cardX, cy: cardY, r: displayR };
    }
  }

  function blitCard(cx, cy, r, card, faceUp, selected, storeHit) {
    var size = CACHE_R * 2 + 4;
    var cacheKey = faceUp ? card.id : 'back';
    var oc = cardCache[cacheKey];
    if (!oc) return;

    var drawSize = r * 2 + 4;
    ctx.drawImage(oc, cx - r - 2, cy - r - 2, drawSize, drawSize);

    // Pulsing gold selection ring
    if (selected) {
      var pulse = 0.7 + 0.3 * Math.sin(Date.now() / 250);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(212,160,23,' + pulse + ')';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#D4A017';
      ctx.shadowBlur = 8 * pulse;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawInfoPanel() {
    var panelX = TABLE_X + TABLE_W - 160;
    var panelY = TABLE_Y + 10;
    var panelW = 155;

    // Score box (top-right of table)
    ctx.fillStyle = 'rgba(13,27,62,0.82)';
    roundRect(ctx, panelX, panelY, panelW, 100, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,160,23,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 11px Cinzel, serif';
    ctx.fillStyle = '#D4A017';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('SCORES', panelX + 10, panelY + 8);

    ctx.font = '11px Outfit, sans-serif';
    SEATS.forEach(function (seat, i) {
      var label = SEAT_LABELS[seat];
      var score = state.scores[seat];
      ctx.fillStyle = seat === 'south' ? '#D4A017' : '#F5EDD6';
      ctx.fillText(label + ': ' + score, panelX + 10, panelY + 26 + i * 18);
    });

    // Round indicator (below score box)
    ctx.fillStyle = 'rgba(13,27,62,0.7)';
    roundRect(ctx, panelX, panelY + 108, panelW, 28, 5);
    ctx.fill();
    ctx.font = '11px Cinzel, serif';
    ctx.fillStyle = '#D4A017';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Round ' + state.round, panelX + 10, panelY + 122);

    // Tricks won box (top-left of table area)
    var tpX = TABLE_X + 5;
    var tpY = TABLE_Y + 10;
    ctx.fillStyle = 'rgba(13,27,62,0.82)';
    roundRect(ctx, tpX, tpY, 140, 100, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(212,160,23,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 11px Cinzel, serif';
    ctx.fillStyle = '#D4A017';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TRICKS', tpX + 10, tpY + 8);

    ctx.font = '11px Outfit, sans-serif';
    SEATS.forEach(function (seat, i) {
      ctx.fillStyle = seat === 'south' ? '#D4A017' : '#F5EDD6';
      ctx.fillText(SEAT_LABELS[seat] + ': ' + state.tricksWon[seat], tpX + 10, tpY + 26 + i * 18);
    });

    // Trump indicator (bottom-right of table)
    if (state.trumpSuit) {
      var suit = SUIT_MAP[state.trumpSuit];
      var tX = TABLE_X + TABLE_W - 160;
      var tY = TABLE_Y + TABLE_H - 110;
      ctx.fillStyle = 'rgba(13,27,62,0.85)';
      roundRect(ctx, tX, tY, 155, 100, 6);
      ctx.fill();
      ctx.strokeStyle = suit.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = 'bold 11px Cinzel, serif';
      ctx.fillStyle = '#D4A017';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('TRUMP', tX + 10, tY + 8);

      ctx.font = 'bold 14px Cinzel, serif';
      ctx.fillStyle = suit.color;
      ctx.fillText(suit.name, tX + 10, tY + 26);

      // Small motif preview
      drawMotif(ctx, tX + 120, tY + 55, 30, suit, 1);
    }

    // Turn indicator (below trick area)
    var turnText = '';
    if (state.phase === 'play') {
      if (state.currentTurn === 'south') {
        turnText = 'Your turn';
      } else {
        turnText = SEAT_LABELS[state.currentTurn] + ' is playing…';
      }
    }
    if (turnText) {
      ctx.font = 'bold 13px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(245,237,214,0.85)';
      ctx.fillText(turnText, CX, CY + TRICK_R * 2.2 + FULL_R + 18);
    }
  }

  function drawOverlay() {
    // Semi-transparent backdrop
    ctx.fillStyle = 'rgba(10,18,44,0.82)';
    ctx.fillRect(TABLE_X, TABLE_Y, TABLE_W, TABLE_H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (state.phase === 'game-over') {
      ctx.font = 'bold 32px Cinzel, serif';
      ctx.fillStyle = '#D4A017';
      ctx.fillText('Game Over', CX, CY - 80);

      ctx.font = 'bold 20px Cinzel, serif';
      ctx.fillStyle = '#F5EDD6';
      var winLabel = state.winner === 'south' ? 'You win!' : SEAT_LABELS[state.winner] + ' wins!';
      ctx.fillText(winLabel, CX, CY - 44);

      ctx.font = '14px Outfit, sans-serif';
      SEATS.forEach(function (seat, i) {
        ctx.fillStyle = seat === state.winner ? '#D4A017' : '#F5EDD6';
        ctx.fillText(SEAT_LABELS[seat] + ': ' + state.scores[seat] + ' pts', CX, CY - 8 + i * 22);
      });

      ctx.font = '13px Outfit, sans-serif';
      ctx.fillStyle = 'rgba(245,237,214,0.6)';
      ctx.fillText('Click to play again', CX, CY + 110);

    } else if (state.phase === 'round-end') {
      ctx.font = 'bold 26px Cinzel, serif';
      ctx.fillStyle = '#D4A017';
      ctx.fillText('Round ' + state.round + ' Complete', CX, CY - 90);

      // Tricks per seat
      ctx.font = '13px Outfit, sans-serif';
      ctx.fillStyle = '#F5EDD6';
      SEATS.forEach(function (seat, i) {
        ctx.fillText(SEAT_LABELS[seat] + ': ' + state.tricksWon[seat] + ' tricks', CX, CY - 58 + i * 20);
      });

      // Slam indicator
      var slamSeat = null;
      SEATS.forEach(function (seat) {
        if (state.tricksWon[seat] === 24) slamSeat = seat;
      });
      if (slamSeat) {
        ctx.font = 'bold 14px Cinzel, serif';
        ctx.fillStyle = '#D4A017';
        ctx.fillText('SLAM! +5 bonus for ' + SEAT_LABELS[slamSeat], CX, CY + 20);
      }

      // Scores
      ctx.font = 'bold 13px Cinzel, serif';
      ctx.fillStyle = '#D4A017';
      ctx.fillText('Cumulative Scores', CX, CY + 44);
      ctx.font = '13px Outfit, sans-serif';
      ctx.fillStyle = '#F5EDD6';
      SEATS.forEach(function (seat, i) {
        ctx.fillText(SEAT_LABELS[seat] + ': ' + state.scores[seat], CX, CY + 64 + i * 18);
      });

      ctx.font = '13px Outfit, sans-serif';
      ctx.fillStyle = 'rgba(245,237,214,0.6)';
      ctx.fillText('Click anywhere to continue', CX, CY + 150);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Input Handling ─────────────────────────────────────────────────────────

  function getScaledCoords(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = BASE_W / rect.width;
    var scaleY = BASE_H / rect.height;
    var clientX, clientY;
    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    };
  }

  function getCardFromClick(x, y) {
    var hand = state.hands.south;
    // Iterate in reverse order so topmost card gets hit first
    for (var i = hand.length - 1; i >= 0; i--) {
      var card = hand[i];
      var pos  = renderedCards[card.id];
      if (!pos) continue;
      var dx = x - pos.cx;
      var dy = y - pos.cy;
      if (Math.sqrt(dx * dx + dy * dy) <= pos.r + 4) {
        return card;
      }
    }
    return null;
  }

  function handleClick(x, y) {
    if (state.phase === 'round-end' || state.phase === 'game-over') {
      nextRoundOrGame();
      return;
    }
    if (state.animating || state.currentTurn !== 'south' || state.phase !== 'play') return;

    var card = getCardFromClick(x, y);
    if (!card) {
      state.selectedCard = null;
      drawFrame();
      return;
    }

    // Verify card is in south's hand
    var inHand = state.hands.south.some(function (c) { return c.id === card.id; });
    if (!inHand) return;

    // Check legality
    var isLeading = !state.ledSuit;
    var legal = getLegalPlays(state.hands.south, state.ledSuit, isLeading);
    var isLegal = legal.some(function (c) { return c.id === card.id; });
    if (!isLegal) return;  // Dimmed card — ignore

    if (state.selectedCard && state.selectedCard.id === card.id) {
      // Second click on same card — play it
      playCard('south', card);
    } else {
      // First click — select
      state.selectedCard = card;
      drawFrame();
      // Animate the selection ring
      requestSelectionAnimation();
    }
  }

  var hoveredCard = null;
  var selectionAnimating = false;
  function requestSelectionAnimation() {
    if (selectionAnimating) return;
    selectionAnimating = true;
    (function animLoop() {
      if (!state.selectedCard) { selectionAnimating = false; return; }
      drawFrame();
      requestAnimationFrame(animLoop);
    })();
  }

  // ── Trick Logic ────────────────────────────────────────────────────────────

  function playCard(seat, card) {
    // Remove from hand
    state.hands[seat] = state.hands[seat].filter(function (c) { return c.id !== card.id; });

    // Set led suit on first card of trick
    if (state.currentLead === seat && !state.ledSuit) {
      state.ledSuit = card.suit;
    }

    state.currentTrick[seat] = card;

    if (seat === 'south') {
      state.selectedCard = null;
    }

    // Check if all 4 played
    var allPlayed = SEATS.every(function (s) { return !!state.currentTrick[s]; });
    if (allPlayed) {
      state.animating = true;
      drawFrame();
      delay(1200, resolveTrick);
    } else {
      advanceTurn();
      drawFrame();
      updateAriaLive();
      if (state.currentTurn !== 'south') scheduleAI();
    }
  }

  function advanceTurn() {
    var idx = SEATS.indexOf(state.currentTurn);
    state.currentTurn = SEATS[(idx + 1) % 4];
  }

  function resolveTrick() {
    var winner = trickWinner(state.currentTrick, state.ledSuit, state.trumpSuit);
    state.tricksWon[winner]++;
    state.trickHistory.push({
      trick:   state.currentTrick,
      ledSuit: state.ledSuit,
      winner:  winner,
    });

    // Reset trick state
    state.currentTrick = { south: null, west: null, north: null, east: null };
    state.ledSuit      = null;
    state.currentLead  = winner;
    state.currentTurn  = winner;
    state.animating    = false;

    if (state.trickHistory.length >= 24) {
      resolveRound();
    } else {
      drawFrame();
      updateAriaLive();
      if (state.currentTurn !== 'south') scheduleAI();
    }
  }

  function resolveRound() {
    // Add tricks to scores
    SEATS.forEach(function (seat) {
      state.scores[seat] += state.tricksWon[seat];
    });

    // Slam bonus: +5 for winning all 24 tricks
    var slamSeat = null;
    SEATS.forEach(function (seat) {
      if (state.tricksWon[seat] === 24) slamSeat = seat;
    });
    if (slamSeat) {
      state.scores[slamSeat] += 5;
    }

    // Check win condition
    var winner = null;
    var maxScore = -1;
    var anyOver50 = false;
    SEATS.forEach(function (seat) {
      if (state.scores[seat] >= 50) anyOver50 = true;
    });

    if (anyOver50) {
      // Find winner (highest score, tiebreak: most tricks this round)
      SEATS.forEach(function (seat) {
        if (state.scores[seat] > maxScore) {
          maxScore = state.scores[seat];
          winner   = seat;
        } else if (state.scores[seat] === maxScore) {
          // Tiebreak: most tricks this round
          if (state.tricksWon[seat] > state.tricksWon[winner]) {
            winner = seat;
          }
        }
      });
      state.gameOver = true;
      state.winner   = winner;
      state.phase    = 'game-over';
    } else {
      state.phase = 'round-end';
    }

    drawFrame();
  }

  function nextRoundOrGame() {
    if (state.gameOver) {
      resetGame();
    } else {
      state.round++;
      startRound();
    }
  }

  // ── AI ─────────────────────────────────────────────────────────────────────

  function scheduleAI() {
    delay(700, doAITurn);
  }

  function doAITurn() {
    if (state.currentTurn === 'south') return;
    if (state.phase !== 'play') return;
    var seat = state.currentTurn;
    var card = getAIPlay(seat);
    if (card) playCard(seat, card);
  }

  function getAIPlay(seat) {
    var hand    = state.hands[seat];
    var isLead  = !state.ledSuit;
    var legal   = getLegalPlays(hand, state.ledSuit, isLead);

    if (isLead) {
      // Leading: if many trumps (>3), lead highest trump; else lead highest in longest suit
      var trumpCards = hand.filter(function (c) { return c.suit === state.trumpSuit; });
      if (trumpCards.length > 3) {
        trumpCards.sort(function (a, b) { return b.rank - a.rank; });
        return trumpCards[0];
      }
      // Find longest suit
      var suitCounts = {};
      hand.forEach(function (c) { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
      var bestSuit = null, bestCount = 0;
      Object.keys(suitCounts).forEach(function (s) {
        if (suitCounts[s] > bestCount) { bestCount = suitCounts[s]; bestSuit = s; }
      });
      var suitCards = hand.filter(function (c) { return c.suit === bestSuit; });
      suitCards.sort(function (a, b) { return b.rank - a.rank; });
      return suitCards[0] || legal[0];
    }

    // Following: try to win
    var winCard = canWinTrick(seat, legal);
    if (winCard) return winCard;

    // Can't win: discard lowest non-trump
    var nonTrump = legal.filter(function (c) { return c.suit !== state.trumpSuit; });
    if (nonTrump.length > 0) {
      nonTrump.sort(function (a, b) { return a.rank - b.rank; });
      return nonTrump[0];
    }
    // Must play trump: lowest trump
    var trumps = legal.filter(function (c) { return c.suit === state.trumpSuit; });
    if (trumps.length > 0) {
      trumps.sort(function (a, b) { return a.rank - b.rank; });
      return trumps[0];
    }
    return legal[0];
  }

  function canWinTrick(seat, legal) {
    // Find current best power in trick (only trump/led-suit eligible)
    var bestPower = -1;
    SEATS.forEach(function (s) {
      var card = state.currentTrick[s];
      if (!card) return;
      if (card.suit !== state.trumpSuit && card.suit !== state.ledSuit) return;
      var p = cardPower(card, state.ledSuit, state.trumpSuit);
      if (p > bestPower) bestPower = p;
    });

    // Find lowest legal card that beats current best
    var winners = legal.filter(function (c) {
      var p = cardPower(c, state.ledSuit, state.trumpSuit);
      return p > bestPower && (c.suit === state.trumpSuit || c.suit === state.ledSuit);
    });
    if (winners.length === 0) return null;
    winners.sort(function (a, b) {
      return cardPower(a, state.ledSuit, state.trumpSuit) - cardPower(b, state.ledSuit, state.trumpSuit);
    });
    return winners[0];
  }

  // ── Aria Live ──────────────────────────────────────────────────────────────

  function updateAriaLive() {
    var el = document.getElementById('gj-aria-live');
    if (!el) return;
    if (state.currentTurn === 'south' && state.phase === 'play') {
      el.textContent = 'Your turn';
    } else if (state.phase === 'play') {
      el.textContent = SEAT_LABELS[state.currentTurn] + ' is playing';
    }
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  var resizeTimer = null;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!canvas) return;
      canvas.style.width  = Math.min(window.innerWidth - 32, 900) + 'px';
      canvas.style.height = 'auto';
      buildCache();
      drawFrame();
    }, 60);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    canvas = document.getElementById('gj-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    // Initial responsive sizing
    canvas.style.width  = Math.min(window.innerWidth - 32, 900) + 'px';
    canvas.style.height = 'auto';

    buildCache();

    // Button handlers
    var newBtn = document.getElementById('gj-new-game-btn');
    if (newBtn) newBtn.addEventListener('click', function () { resetGame(); });

    var rulesBtn = document.getElementById('gj-rules-btn');
    var rulesPanel = document.getElementById('gj-rules-panel');
    if (rulesBtn && rulesPanel) {
      rulesBtn.addEventListener('click', function () {
        rulesPanel.hidden = !rulesPanel.hidden;
      });
    }

    // Canvas input
    canvas.addEventListener('click', function (e) {
      var coords = getScaledCoords(e);
      handleClick(coords.x, coords.y);
    });
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var coords = getScaledCoords(e);
      handleClick(coords.x, coords.y);
    }, { passive: false });

    canvas.addEventListener('mousemove', function (e) {
      var coords = getScaledCoords(e);
      var card = getCardFromClick(coords.x, coords.y);
      var prev = hoveredCard;
      hoveredCard = card || null;
      var changed = (hoveredCard ? hoveredCard.id : null) !== (prev ? prev.id : null);
      if (changed) {
        canvas.style.cursor = hoveredCard ? 'pointer' : 'default';
        drawFrame();
      }
    });

    canvas.addEventListener('mouseleave', function () {
      if (hoveredCard) {
        hoveredCard = null;
        canvas.style.cursor = 'default';
        drawFrame();
      }
    });

    // Resize
    window.addEventListener('resize', onResize);

    // Start first game
    resetGame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
