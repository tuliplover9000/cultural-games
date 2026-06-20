/**
 * scopa.js — Scopa (Italy's traditional "sweep" card game)
 * DOM-based rendering, reuses .tl- CSS classes from games.css.
 * Prefix: sc-   Key: scopa
 *
 * vs-CPU single player. Card-art helpers + deck constants + esc() are copied
 * verbatim from cuarenta.js; the engine, AI, flow, scoring and rendering are
 * Scopa's own.
 */
(function () {
  'use strict';

  // ── Deck constants ──────────────────────────────────────────────────────────
  var SUITS      = ['oros', 'copas', 'espadas', 'bastos'];
  var RANK_ORDER = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
  var RANK_NAMES = { 1:'A', 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 10:'J', 11:'Q', 12:'K' };
  // Internal suit keys map to French-deck art & symbols:
  // copas→hearts, oros→diamonds (= Coins / Denari), espadas→spades, bastos→clubs.
  var SUIT_SYM   = { oros:'♦', copas:'♥', espadas:'♠', bastos:'♣' };
  var TARGET     = 11;

  // Scopa capture value: A=1..7=7, Fante(J)=8, Cavallo(Q)=9, Re(K)=10.
  function value(rank) {
    return rank <= 7 ? rank : (rank === 10 ? 8 : (rank === 11 ? 9 : 10));
  }
  // Primiera (prime) value table — best-per-suit summed.
  var PRIME = { 7:21, 6:18, 1:16, 5:15, 4:14, 3:13, 2:12, 10:10, 11:10, 12:10 };

  // ── Card art (inline SVG, hand-drawn French-suited poker faces) ─────────────
  var ART_BG   = '#FDFBF7';   // card cream
  var ART_INK  = '#2b2320';   // ink outline
  var ART_RED  = '#C03A2B';   // hearts / diamonds
  var ART_BLK  = '#26221E';   // spades / clubs
  var ART_GOLD = '#D9A441';   // court accent
  var ART_BLUE = '#44608c';   // court accent
  var ART_SKIN = '#e9bd92';
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
    return '<text class="sc-ix" x="6" y="21" font-size="17" font-weight="bold" font-family="Georgia, serif" fill="'
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

  // ── State ───────────────────────────────────────────────────────────────────
  var G            = {};
  var selectedIdx  = null;   // hand card the player has selected (pre-play)
  var aiThinkTimer = null;
  var gameLog      = [];

  // ── Multiplayer (RoomBridge) flags ──────────────────────────────────────────
  // vsRoom: this instance is running inside a room iframe (remote human opponent).
  // mySeat: 0 or 1 — this client's seat. The render is ALWAYS local-perspective
  // (my hand at the bottom = G.playerHand, opponent = G.aiHand, turn 'player' =
  // my turn). Seat↔perspective mapping happens only at the sync boundary in
  // serializeState()/receiveRoomState(). Seat 0 seeds the opening deal.
  var vsRoom      = false;
  var mySeat      = 0;
  var vsAI        = true;     // local AI scheduler runs only when true (never in a room)
  var winReported = false;
  var roomEnded   = false;    // online end-screen achievements fired once guard

  // Animation / flash flags — consumed once per render
  var anim = {
    dealHand:    false,
    dealAI:      false,
    newTableIdx: -1,   // index of a card the player just placed (a monte) — animates in
    aiTableIdx:  -1,   // index of a card the CPU just placed
    flashMsg:    '',
    callout:     '',
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
    if (aiThinkTimer) { clearTimeout(aiThinkTimer); aiThinkTimer = null; }
    winReported = false;
    roomEnded   = false;
    if (vsRoom && window.RoomBridge && RoomBridge.resetWin) RoomBridge.resetWin();

    // In a room, only seat 0 builds the authoritative deck + opening deal and
    // broadcasts it; seat 1 waits for that first state (renders an empty board
    // until receiveRoomState() arrives). Out of a room this is the normal solo
    // deal — byte-for-byte the same behaviour as before.
    if (vsRoom && mySeat !== 0) {
      gameLog = [];
      G = {
        deck:         [],
        playerHand:   [],
        aiHand:       [],
        table:        [],
        playerPile:   [],
        aiPile:       [],
        playerScope:  0,
        aiScope:      0,
        playerScore:  0,
        aiScore:      0,
        lastCapturer: null,
        turn:         'ai',         // seat 0 (opponent) opens
        phase:        'playing',
        pendingCard:  null,
        pendingOptions: [],
        pendingWho:   null,
        selectedTable: [],
        roundBreakdown: null,
      };
      selectedIdx = null;
      render();
      return;
    }

    gameLog = [];
    G = {
      deck:         [],
      playerHand:   [],
      aiHand:       [],
      table:        [],
      playerPile:   [],
      aiPile:       [],
      playerScope:  0,
      aiScope:      0,
      playerScore:  0,
      aiScore:      0,
      lastCapturer: null,           // 'player' | 'ai' | null
      turn:         'player',       // non-dealer (human) plays first
      phase:        'playing',      // 'playing' | 'select-capture' | 'round-end' | 'game-end'
      pendingCard:  null,
      pendingOptions: [],
      pendingWho:   null,
      selectedTable: [],
      roundBreakdown: null,
    };
    selectedIdx = null;
    startDeal();
    addLog('system', 'New game — first to ' + TARGET + ' wins.');
    render();
    if (vsRoom) syncRoom();   // seat 0 broadcasts the opening deal
  }

  // Begin a fresh deal: build/shuffle deck, 3+3 to hands, 4 to the table (once).
  function startDeal() {
    G.deck         = buildDeck();
    G.playerHand   = [];
    G.aiHand       = [];
    G.table        = [];
    G.playerPile   = [];
    G.aiPile       = [];
    G.playerScope  = 0;
    G.aiScope      = 0;
    G.lastCapturer = null;
    G.pendingCard  = null;
    G.pendingOptions = [];
    G.pendingWho   = null;
    G.selectedTable  = [];
    G.roundBreakdown = null;
    for (var i = 0; i < 4 && G.deck.length; i++) G.table.push(G.deck.pop());
    dealHands();
    G.turn  = 'player';
    G.phase = 'playing';
    selectedIdx = null;
  }

  // Deal 3 cards to each hand from the stock (table is never replenished).
  function dealHands() {
    for (var i = 0; i < 3 && G.deck.length; i++) G.playerHand.push(G.deck.pop());
    for (i = 0; i < 3 && G.deck.length; i++) G.aiHand.push(G.deck.pop());
    selectedIdx = null;
    anim.dealHand = true;
    anim.dealAI   = true;
  }

  // ── Capture resolution ───────────────────────────────────────────────────────
  // Returns { forced:bool, sets:[ [tableCardRefs...], ... ] }.
  // Single-card capture is FORCED and takes precedence over any combination.
  function legalCaptures(card) {
    var v = value(card.rank);
    var singles = G.table.filter(function (c) { return value(c.rank) === v; });
    if (singles.length) {
      return { forced: true, sets: singles.map(function (s) { return [s]; }) };
    }
    // No single matches — enumerate subsets of size >= 2 summing to v.
    var sets = [];
    var t = G.table;
    var n = t.length;
    for (var mask = 1; mask < (1 << n); mask++) {
      var sum = 0, cnt = 0, subset = [];
      for (var b = 0; b < n; b++) {
        if (mask & (1 << b)) { subset.push(t[b]); sum += value(t[b].rank); cnt++; }
      }
      if (cnt >= 2 && sum === v) sets.push(subset);
    }
    return { forced: false, sets: sets };
  }

  // Move a played card + captured set into the capturer's pile; handle scopa.
  function applyCapture(who, card, capSet) {
    var pile = who === 'player' ? G.playerPile : G.aiPile;
    capSet.forEach(function (cc) {
      var idx = G.table.indexOf(cc);
      if (idx !== -1) G.table.splice(idx, 1);
    });
    pile.push(card);
    capSet.forEach(function (c) { pile.push(c); });
    G.lastCapturer = who;

    var name    = who === 'player' ? 'You' : 'CPU';
    var capDesc = capSet.map(function (c) { return RANK_NAMES[c.rank] + SUIT_SYM[c.suit]; }).join(', ');
    addLog(who, name + ' captured ' + capDesc + ' with ' + RANK_NAMES[card.rank] + SUIT_SYM[card.suit]);

    // Scopa: table cleared, UNLESS this is the final card of the final deal.
    var finalCard = G.deck.length === 0 && G.playerHand.length === 0 && G.aiHand.length === 0;
    if (G.table.length === 0 && !finalCard) {
      if (who === 'player') G.playerScope++; else G.aiScope++;
      anim.callout  = 'SCOPA!';
      anim.flashMsg = '✦ Scopa! ' + name + ' swept the table (+1)';
      addLog(who, '✦ Scopa! ' + name + ' swept the table (+1)');
      if (who === 'player' && !vsRoom && window.Achievements) Achievements.track('sc_scopa');
    }
  }

  // ── Play a hand card ──────────────────────────────────────────────────────────
  function playCard(who, handIdx) {
    var hand = who === 'player' ? G.playerHand : G.aiHand;
    var card = hand.splice(handIdx, 1)[0];
    var lc   = legalCaptures(card);
    var name = who === 'player' ? 'You' : 'CPU';

    if (lc.sets.length === 0) {
      // A monte — no capture possible; card stays on the table (animates in).
      if (who === 'player') anim.newTableIdx = G.table.length;
      else                  anim.aiTableIdx  = G.table.length;
      G.table.push(card);
      addLog(who, name + ' placed ' + RANK_NAMES[card.rank] + SUIT_SYM[card.suit] + ' on the table');
      return false;       // resolved, advance immediately
    }

    if (lc.sets.length === 1) {
      applyCapture(who, card, lc.sets[0]);
      return false;       // resolved
    }

    // Multiple legal options.
    if (who === 'ai') {
      applyCapture(who, card, aiPickCaptureSet(card, lc));
      return false;
    }
    // Human must choose via the select-capture UI.
    G.pendingCard    = card;
    G.pendingOptions = lc.sets;
    G.pendingWho     = 'player';
    G.selectedTable  = [];
    G.phase          = 'select-capture';
    return true;          // pending — do not advance
  }

  // Resolve the human's pending capture once selectedTable matches an option.
  function resolvePending() {
    var card = G.pendingCard;
    var sel  = G.selectedTable;
    applyCapture('player', card, sel.slice());
    G.pendingCard    = null;
    G.pendingOptions = [];
    G.pendingWho     = null;
    G.selectedTable  = [];
    G.phase          = 'playing';
    afterPlay('player');
  }

  function cancelPending() {
    // Return the card to the player's hand.
    if (G.pendingCard) G.playerHand.push(G.pendingCard);
    G.pendingCard    = null;
    G.pendingOptions = [];
    G.pendingWho     = null;
    G.selectedTable  = [];
    G.phase          = 'playing';
    selectedIdx      = null;
    render();
    if (vsRoom) syncRoom();   // broadcast the un-pend so the opponent's view clears
  }

  // Does selectedTable exactly equal one of the legal option sets?
  function selectionMatchesOption() {
    var sel = G.selectedTable;
    return G.pendingOptions.some(function (opt) {
      if (opt.length !== sel.length) return false;
      return opt.every(function (c) { return sel.indexOf(c) !== -1; });
    });
  }

  // Is this table card part of ANY legal option for the pending card?
  function tableCardInAnyOption(c) {
    return G.pendingOptions.some(function (opt) { return opt.indexOf(c) !== -1; });
  }

  // ── Flow ──────────────────────────────────────────────────────────────────────
  // Called after a play has fully resolved (no pending choice). Advances turn,
  // re-deals, or ends the deal.
  function afterPlay(who) {
    // Both hands empty?
    if (G.playerHand.length === 0 && G.aiHand.length === 0) {
      if (G.deck.length > 0) {
        dealHands();
        G.turn = who === 'player' ? 'ai' : 'player';
        addLog('system', 'Dealt 3 more cards each (' + G.deck.length + ' left in stock).');
        render();
        if (vsRoom) { syncRoom(); return; }
        if (G.turn === 'ai') scheduleAI();
        return;
      }
      endDeal();
      return;
    }
    // Switch turn.
    G.turn = who === 'player' ? 'ai' : 'player';
    render();
    if (vsRoom) { syncRoom(); return; }   // broadcast; the remote human replies
    if (G.turn === 'ai') scheduleAI();
  }

  function endDeal() {
    // Last trick: leftover table cards go to the last capturer (no scopa).
    if (G.table.length && G.lastCapturer) {
      var pile = G.lastCapturer === 'player' ? G.playerPile : G.aiPile;
      G.table.forEach(function (c) { pile.push(c); });
      addLog('system', 'Last trick — remaining table cards go to ' + (G.lastCapturer === 'player' ? 'You' : 'CPU') + '.');
      G.table = [];
    }
    var bd = scoreDeal();
    G.roundBreakdown = bd;
    G.playerScore += bd.player.total;
    G.aiScore     += bd.ai.total;
    addLog('system', 'Deal scored — You +' + bd.player.total + ', CPU +' + bd.ai.total + '.');
    if (G.playerScore >= TARGET || G.aiScore >= TARGET) G.phase = 'game-end';
    else G.phase = 'round-end';
    render();
    if (vsRoom) syncRoom();   // broadcast deal-end / game-end state
  }

  // ── Scoring ───────────────────────────────────────────────────────────────────
  function scoreDeal() {
    var p = sideScore(G.playerPile, G.playerScope);
    var a = sideScore(G.aiPile,     G.aiScope);

    // Most cards (need 21+/40); tie 20-20 = 0.
    if (p.cards > a.cards) p.ptCards = 1;
    else if (a.cards > p.cards) a.ptCards = 1;

    // Most coins (oros) (need 6+/10); tie = 0.
    if (p.coins > a.coins) p.ptCoins = 1;
    else if (a.coins > p.coins) a.ptCoins = 1;

    // Settebello — 7 of oros — awarded to whoever has it.
    if (p.sette) p.ptSette = 1;
    if (a.sette) a.ptSette = 1;

    // Primiera — best prime per suit summed; higher total wins; tie = 0.
    if (p.prime > a.prime) p.ptPrime = 1;
    else if (a.prime > p.prime) a.ptPrime = 1;

    p.total = p.ptCards + p.ptCoins + p.ptSette + p.ptPrime + p.scope;
    a.total = a.ptCards + a.ptCoins + a.ptSette + a.ptPrime + a.scope;
    return { player: p, ai: a };
  }

  function sideScore(pile, scope) {
    var s = {
      cards: pile.length, coins: 0, sette: false, prime: 0, scope: scope,
      ptCards: 0, ptCoins: 0, ptSette: 0, ptPrime: 0, total: 0,
    };
    var bestPrime = { oros: 0, copas: 0, espadas: 0, bastos: 0 };
    pile.forEach(function (c) {
      if (c.suit === 'oros') {
        s.coins++;
        if (c.rank === 7) s.sette = true;
      }
      var pv = PRIME[c.rank] || 0;
      if (pv > bestPrime[c.suit]) bestPrime[c.suit] = pv;
    });
    s.prime = bestPrime.oros + bestPrime.copas + bestPrime.espadas + bestPrime.bastos;
    return s;
  }

  // ── AI ────────────────────────────────────────────────────────────────────────
  // Pick a capture set when multiple options exist for an already-chosen card.
  function aiPickCaptureSet(card, lc) {
    var best = lc.sets[0], bestScore = -Infinity;
    lc.sets.forEach(function (set) {
      var sc = scoreCaptureSet(card, set);
      if (sc > bestScore) { bestScore = sc; best = set; }
    });
    return best;
  }

  // Heuristic value of capturing `set` with `card`.
  function scoreCaptureSet(card, set) {
    var s = 0;
    var clears = set.length === G.table.length;   // would empty the table
    set.forEach(function (c) {
      if (c.rank === 7 && c.suit === 'oros') s += 40;   // settebello
      if (c.suit === 'oros')                  s += 6;   // coins
      if (c.rank === 7)                       s += 5;   // prime 7s
      if (c.rank === 6)                       s += 3;   // prime 6s
      s += 1;                                            // each card taken
    });
    var finalCard = G.deck.length === 0 && G.playerHand.length === 0 && G.aiHand.length === 0;
    if (clears && !finalCard) s += 25;                  // scopa
    return s;
  }

  // Choose the AI's hand card. Capture is compulsory; otherwise discard safely.
  function aiChoose() {
    var bestIdx = 0, bestScore = -Infinity, anyCapture = false;
    G.aiHand.forEach(function (card, i) {
      var lc = legalCaptures(card);
      var s;
      if (lc.sets.length) {
        anyCapture = true;
        var best = -Infinity;
        lc.sets.forEach(function (set) {
          var v = scoreCaptureSet(card, set);
          if (v > best) best = v;
        });
        s = 1000 + best;   // any capture dominates any discard
      } else {
        // Discard: least valuable. Penalize giving away high-value cards and
        // leaving a clean sum the opponent can sweep.
        s = -discardCost(card);
      }
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    });
    return bestIdx;
  }

  function discardCost(card) {
    var cost = value(card.rank);              // prefer discarding low pips
    if (card.rank === 7) cost += 30;          // never throw a 7 lightly
    if (card.suit === 'oros') cost += 12;     // protect coins
    if (card.rank === 7 && card.suit === 'oros') cost += 100;  // never the settebello
    // Avoid leaving the table at a tidy total (7/10/15) the opponent can sweep.
    var tableSum = G.table.reduce(function (t, c) { return t + value(c.rank); }, 0);
    var after = tableSum + value(card.rank);
    if (after === 7 || after === 10 || after === 15) cost += 8;
    return cost;
  }

  function scheduleAI() {
    if (vsRoom || !vsAI) return;   // in a room the opponent is a remote human
    if (aiThinkTimer) clearTimeout(aiThinkTimer);
    aiThinkTimer = setTimeout(function () {
      aiThinkTimer = null;
      if (G.phase !== 'playing' || G.turn !== 'ai') return;
      var idx = aiChoose();
      playCard('ai', idx);     // AI never enters select-capture
      afterPlay('ai');
    }, 900);
  }

  // ── Human play ──────────────────────────────────────────────────────────────
  function commitPlay() {
    if (selectedIdx === null || G.turn !== 'player' || G.phase !== 'playing') return;
    var idx = selectedIdx;
    selectedIdx = null;
    var pending = playCard('player', idx);
    if (pending) {                          // select-capture UI
      render();
      if (vsRoom) syncRoom();   // broadcast the pending choice so the opponent sees it locked to me
      return;
    }
    afterPlay('player');
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
    if (G.phase === 'game-end')  { renderGameEnd(el);  return; }
    if (G.phase === 'round-end') { renderRoundEnd(el); return; }
    el.innerHTML = buildUI();
    wireEvents(el);
  }

  function buildUI() {
    // select-capture is interactive ONLY for the player who is actually choosing.
    // Solo: always me. Room: only when the pending choice belongs to my seat
    // (G.pendingWho === 'player'); the opponent's choice renders as a wait state.
    var mySelect  = G.phase === 'select-capture' && (!vsRoom || G.pendingWho !== 'ai');
    var oppSelect = G.phase === 'select-capture' && vsRoom && G.pendingWho === 'ai';
    var selecting = mySelect;
    var isYT = G.turn === 'player' && G.phase === 'playing';
    var card = (!selecting && selectedIdx !== null) ? G.playerHand[selectedIdx] : null;
    var lc   = card ? legalCaptures(card) : null;

    var flash = anim.flashMsg; anim.flashMsg = '';

    var statusInner, statusCls = '';
    if (flash) {
      statusInner = flash; statusCls = 'sc-flash';
    } else if (oppSelect) {
      statusInner = 'Opponent is choosing a capture <span class="tl-thinking-dots"><span></span><span></span><span></span></span>';
    } else if (selecting) {
      var v = value(G.pendingCard.rank);
      var singleOpts = G.pendingOptions.length && G.pendingOptions[0].length === 1;
      statusInner = singleOpts
        ? 'Pick which ' + RANK_NAMES[G.pendingCard.rank] + ' to take'
        : 'Choose table cards that sum to ' + v;
      statusCls = 'your-turn';
    } else if (G.turn === 'ai') {
      statusInner = (vsRoom ? 'Opponent is playing ' : 'CPU is thinking ')
        + '<span class="tl-thinking-dots"><span></span><span></span><span></span></span>';
    } else if (isYT) {
      if (selectedIdx !== null) {
        if (lc && lc.forced)            statusInner = 'Must take the ' + RANK_NAMES[card.rank] + (lc.sets.length > 1 ? ' — pick which' : '');
        else if (lc && lc.sets.length)  statusInner = 'Capture available — play to take';
        else                            statusInner = 'No capture — card goes to the table';
      } else {
        statusInner = 'Your turn — select a card from your hand';
      }
      statusCls = 'your-turn';
    } else {
      statusInner = 'Scopa';
    }

    return '<div class="tl-game sc-game">'
      + '<div class="tl-status-bar ' + statusCls + '">' + statusInner + '</div>'
      + cpuZone()
      + tableZone(lc, selecting)
      + scoreStrip()
      + playerZone(isYT, lc, selecting)
      + logArea()
      + '</div>';
  }

  function cpuZone() {
    var n      = G.aiHand.length;
    var active = G.turn === 'ai' && (G.phase === 'playing'
      || (vsRoom && G.phase === 'select-capture' && G.pendingWho === 'ai'));
    var dealing = anim.dealAI; anim.dealAI = false;
    var backs = '';
    for (var i = 0; i < n; i++) {
      var dcls = dealing ? ' dealing' : '';
      var dsty = dealing ? ' style="--deal-i:' + i + '"' : '';
      backs += '<div class="tl-card-back tl-card-back--sm' + dcls + '"' + dsty + '></div>';
    }
    var oppName = vsRoom ? 'Opponent' : 'CPU';
    return '<div class="tl-zone tl-zone--top sc-cpu-zone">'
      + '<div class="tl-zone__name' + (active ? ' active' : '') + '">' + oppName + (active ? ' ●' : '') + '</div>'
      + '<div class="tl-opp-cards--top">' + backs + '</div>'
      + '<div class="tl-zone__count">' + n + ' card' + (n !== 1 ? 's' : '')
      + ' &nbsp;·&nbsp; ' + G.aiPile.length + ' captured &nbsp;·&nbsp; ' + G.aiScope + ' scopa</div>'
      + '</div>';
  }

  function tableZone(lc, selecting) {
    // Highlight: in select-capture, mark cards that belong to any option and
    // mark the player's current selection distinctly. In normal play with a
    // forced/single capture preview, highlight what would be captured.
    var hlSet = {}, selSet = {};
    if (selecting) {
      G.table.forEach(function (c, i) {
        if (tableCardInAnyOption(c)) hlSet[i] = true;
        if (G.selectedTable.indexOf(c) !== -1) selSet[i] = true;
      });
    } else if (lc && lc.sets.length === 1) {
      lc.sets[0].forEach(function (c) { hlSet[G.table.indexOf(c)] = true; });
    } else if (lc && lc.forced) {
      // multiple singles — highlight all candidate singles
      lc.sets.forEach(function (set) { hlSet[G.table.indexOf(set[0])] = true; });
    }

    var callout = anim.callout; anim.callout = '';
    var newPIdx = anim.newTableIdx, aiPIdx = anim.aiTableIdx;
    anim.newTableIdx = -1; anim.aiTableIdx = -1;

    var tableCards = G.table.map(function (card, i) {
      var cls = '';
      if (selSet[i])      cls = 'sc-selected-table';
      else if (hlSet[i])  cls = 'sc-capture-hl';
      var sty;
      if (i === newPIdx)     { cls += (cls ? ' ' : '') + 'played-in'; sty = ' style="--from-y:80px;--from-x:0;--play-i:0"'; }
      else if (i === aiPIdx) { cls += (cls ? ' ' : '') + 'played-in'; sty = ' style="--from-y:-80px;--from-x:0;--play-i:0"'; }
      var data = selecting ? String(i) : undefined;
      return scCard(card, cls, data, sty);
    }).join('');

    var emptyMsg = G.table.length === 0
      ? '<span class="tl-play-area-empty">Table is empty</span>' : '';

    return '<div class="sc-center">'
      + '<div class="sc-table-label">Table &nbsp;<span class="sc-table-count">(' + G.table.length + ')</span></div>'
      + '<div class="tl-play-area' + (G.table.length ? ' has-cards' : '') + ' sc-table-area">'
      + (tableCards || emptyMsg)
      + '</div>'
      + (callout ? '<div class="sc-callout sc-callout--show">' + callout + '</div>' : '')
      + '</div>';
  }

  function scoreStrip() {
    var pCoins = countCoins(G.playerPile), aCoins = countCoins(G.aiPile);
    return '<div class="sc-score-strip">'
      + '<span class="sc-score-side">You: <strong>' + G.playerScore + '</strong> pts'
      + '<span class="sc-score-sub">' + G.playerPile.length + ' cap · ' + pCoins + ' coins · ' + G.playerScope + ' scopa</span></span>'
      + '<span class="sc-score-mid">Deck: ' + G.deck.length + ' &nbsp;·&nbsp; Goal: ' + TARGET + '</span>'
      + '<span class="sc-score-side sc-score-side--cpu">CPU: <strong>' + G.aiScore + '</strong> pts'
      + '<span class="sc-score-sub">' + G.aiPile.length + ' cap · ' + aCoins + ' coins · ' + G.aiScope + ' scopa</span></span>'
      + '</div>';
  }

  function countCoins(pile) {
    return pile.filter(function (c) { return c.suit === 'oros'; }).length;
  }

  function playerZone(isYT, lc, selecting) {
    var dealing = anim.dealHand; anim.dealHand = false;

    if (selecting) {
      // Show the held (pending) card and the running selection sum.
      var v   = value(G.pendingCard.rank);
      var sum = G.selectedTable.reduce(function (t, c) { return t + value(c.rank); }, 0);
      var ready = selectionMatchesOption();
      var held = '<div class="tl-hand">' + scCard(G.pendingCard, 'selected') + '</div>';
      var hint = 'Selected sum: <strong>' + sum + '</strong> / ' + v
        + (ready ? ' &nbsp;✓ ready' : '');
      return '<div class="tl-player-area">'
        + '<div class="tl-zone__name active">You ● &nbsp;·&nbsp; choosing capture</div>'
        + held
        + '<div class="tl-hint ' + (ready ? 'valid' : '') + '">' + hint + '</div>'
        + '<div class="tl-actions">'
        + '<div class="tl-actions__main">'
        + '<button class="tl-btn tl-btn--play" id="sc-capture-btn" ' + (ready ? '' : 'disabled') + '>Capture</button>'
        + '</div>'
        + '<div class="tl-actions__secondary">'
        + '<button class="tl-btn tl-btn--ghost" id="sc-cancel-btn">Cancel</button>'
        + '</div>'
        + '</div>'
        + '</div>';
    }

    var canPlay = isYT && selectedIdx !== null;
    var cards = G.playerHand.map(function (card, i) {
      var cls = [
        isYT ? 'clickable' : '',
        selectedIdx === i ? 'selected' : '',
        dealing ? 'dealing' : '',
      ].filter(Boolean).join(' ');
      var sty = dealing ? ' style="--deal-i:' + i + '"' : '';
      return scCard(card, cls, String(i), sty);
    }).join('');

    var hint = '', hintCls = '';
    if (selectedIdx !== null && lc) {
      if (lc.sets.length === 0) { hint = 'No capture — will be placed on the table'; }
      else if (lc.forced) {
        hint = lc.sets.length > 1 ? '✓ Forced single — pick which card to take' : '✓ Forced capture (single)';
        hintCls = 'valid';
      } else {
        hint = lc.sets.length > 1 ? '✓ Combination capture — you\'ll pick which' : '✓ Combination capture (sum)';
        hintCls = 'valid';
      }
    }

    return '<div class="tl-player-area">'
      + '<div class="tl-zone__name' + (isYT ? ' active' : '') + '">You' + (isYT ? ' ●' : '') + ' &nbsp;·&nbsp; ' + G.playerHand.length + ' cards</div>'
      + '<div class="tl-hand">' + cards + '</div>'
      + '<div class="tl-hint ' + hintCls + '">' + hint + '</div>'
      + '<div class="tl-actions">'
      + '<div class="tl-actions__main">'
      + '<button class="tl-btn tl-btn--play" id="sc-play-btn" ' + (canPlay ? '' : 'disabled') + '>Play Card</button>'
      + '</div>'
      + '<div class="tl-actions__secondary">'
      + '<button class="tl-btn tl-btn--ghost" id="sc-new-btn">New Game</button>'
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
  function breakdownRows(bd) {
    function row(label, p, a) {
      return '<tr><td>' + label + '</td><td>' + p + '</td><td>' + a + '</td></tr>';
    }
    var P = bd.player, A = bd.ai;
    return '<table class="sc-breakdown"><thead><tr><th>&nbsp;</th><th>You</th><th>CPU</th></tr></thead><tbody>'
      + row('Most cards (' + P.cards + ' vs ' + A.cards + ')', P.ptCards, A.ptCards)
      + row('Most coins (' + P.coins + ' vs ' + A.coins + ')', P.ptCoins, A.ptCoins)
      + row('Settebello (7♦)', P.ptSette, A.ptSette)
      + row('Primiera (' + P.prime + ' vs ' + A.prime + ')', P.ptPrime, A.ptPrime)
      + row('Scope (sweeps)', P.scope, A.scope)
      + '<tr class="sc-breakdown__total"><td>Deal total</td><td>' + P.total + '</td><td>' + A.total + '</td></tr>'
      + '</tbody></table>';
  }

  function renderRoundEnd(el) {
    anim.callout = '';
    var bd = G.roundBreakdown;
    el.innerHTML = '<div class="tl-game sc-game">'
      + '<div class="tl-gameover visible">'
      + '<div class="tl-gameover__icon">🃏</div>'
      + '<h2>Deal Over</h2>'
      + (bd ? breakdownRows(bd) : '')
      + '<p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:0.75rem">Game score — You: ' + G.playerScore + ' &nbsp;·&nbsp; CPU: ' + G.aiScore + ' &nbsp;·&nbsp; Goal: ' + TARGET + '</p>'
      + '<button class="tl-btn tl-btn--play" id="sc-next-round" style="margin-top:1.5rem">Next Deal</button>'
      + '</div>'
      + '</div>';
    var btn = el.querySelector('#sc-next-round');
    if (btn) btn.addEventListener('click', function () {
      startDeal();              // keeps cumulative scores; reshuffles + re-deals
      addLog('system', 'New deal.');
      render();
      if (vsRoom) syncRoom();   // broadcast the fresh deal to the opponent
    });
  }

  // ── Game-end screen ──────────────────────────────────────────────────────────
  function renderGameEnd(el) {
    anim.callout = '';
    // If both reached target in the same deal, the higher total wins; an exact
    // equal total is a genuine draw.
    var draw = false, won;
    if (G.playerScore >= TARGET && G.aiScore >= TARGET && G.playerScore === G.aiScore) {
      draw = true;
    } else if (G.playerScore >= TARGET && G.aiScore >= TARGET) {
      won = G.playerScore > G.aiScore;
    } else {
      won = G.playerScore >= TARGET;
    }
    var bd = G.roundBreakdown;
    var icon  = draw ? '🤝' : (won ? '🏆' : '🃏');
    var head  = draw ? "It's a draw!" : (won ? 'You win!' : 'CPU wins');
    var phrase = draw ? 'Dead heat — an even sweep.'
               : (won ? 'Scopa! The table is yours.' : 'Buona partita — better luck next deal.');
    el.innerHTML = '<div class="tl-game sc-game">'
      + '<div class="tl-gameover visible">'
      + '<div class="tl-gameover__icon">' + icon + '</div>'
      + '<h2>' + head + '</h2>'
      + '<p class="sc-win-phrase">' + phrase + '</p>'
      + (bd ? breakdownRows(bd) : '')
      + '<p style="margin-top:0.75rem">You: ' + G.playerScore + ' pts &nbsp;·&nbsp; CPU: ' + G.aiScore + ' pts</p>'
      + '<button class="tl-btn tl-btn--play" id="sc-play-again" style="margin-top:1.5rem">Play Again</button>'
      + '</div>'
      + '</div>';
    var btn = el.querySelector('#sc-play-again');
    if (btn) btn.addEventListener('click', newGame);

    if (vsRoom) {
      // Room mode: stats/coins are recorded per-seat by the room end-screen via
      // RoomBridge.reportWin (fired in syncRoom). Do NOT record solo achievements
      // or win counts here — that would double-record. Report the outcome once.
      reportRoomWin();
      return;
    }

    if (won && window.Achievements) {
      Achievements.track('sc_first_win');
      Achievements.increment('scopa', 'wins');
    }
  }

  // ── Card HTML helper ─────────────────────────────────────────────────────────
  function scCard(card, cls, dataIdx, styStr) {
    var colorCls = 'sc-card--' + card.suit;
    var dataStr  = dataIdx !== undefined ? ' data-idx="' + dataIdx + '"' : '';
    var clsStr   = cls ? ' ' + cls : '';
    return '<div class="tl-card ' + colorCls + clsStr + '"' + dataStr + (styStr || '') + '>'
      + cardSVG(card.rank, card.suit)
      + '</div>';
  }

  // ── Wire events ──────────────────────────────────────────────────────────────
  function wireEvents(el) {
    // Only the player who is actually choosing gets the select-capture controls.
    // In a room, the opponent's select-capture renders as a non-interactive wait
    // state (no data-idx cards, no buttons), so fall through to normal wiring.
    var mySelect = G.phase === 'select-capture' && (!vsRoom || G.pendingWho !== 'ai');
    if (mySelect) {
      // Tap table cards (that are part of an option) to build the selection.
      el.querySelectorAll('.sc-table-area .tl-card[data-idx]').forEach(function (card) {
        card.addEventListener('click', function () {
          var i = parseInt(card.dataset.idx, 10);
          var c = G.table[i];
          if (!tableCardInAnyOption(c)) return;
          var pos = G.selectedTable.indexOf(c);
          if (pos === -1) G.selectedTable.push(c);
          else G.selectedTable.splice(pos, 1);
          render();
        });
      });
      var capBtn = el.querySelector('#sc-capture-btn');
      if (capBtn) capBtn.addEventListener('click', function () {
        if (selectionMatchesOption()) resolvePending();
      });
      var cancelBtn = el.querySelector('#sc-cancel-btn');
      if (cancelBtn) cancelBtn.addEventListener('click', cancelPending);
      return;
    }

    // Normal play — select a hand card.
    el.querySelectorAll('.tl-hand .tl-card[data-idx]').forEach(function (card) {
      card.addEventListener('click', function () {
        if (G.turn !== 'player' || G.phase !== 'playing') return;
        var i = parseInt(card.dataset.idx, 10);
        selectedIdx = selectedIdx === i ? null : i;
        render();
      });
    });

    var playBtn = el.querySelector('#sc-play-btn');
    if (playBtn) playBtn.addEventListener('click', commitPlay);

    var newBtn = el.querySelector('#sc-new-btn');
    if (newBtn) newBtn.addEventListener('click', function () {
      if (confirm('Start a new game?')) newGame();
    });
  }

  // ── Multiplayer (RoomBridge) ─────────────────────────────────────────────────
  // The blob is SEAT-relative (hands/piles/scope/scores by seat, turnSeat, who-by-
  // seat) so both clients share one canonical state regardless of which seat each
  // sits in. The local G is always PERSPECTIVE-relative (playerHand = mine, turn
  // 'player' = mine). serializeState() maps perspective→seat on send;
  // receiveRoomState() maps seat→perspective on receive. The full state (both
  // hands, table, deck, piles, scope counts, scores, turn, phase, lastCapturer,
  // and the interactive select-capture choice) travels in the blob — same accepted
  // trust model as truc/cuarenta (each client only renders its own hand; the
  // opponent's hand is shown face-down).
  //
  // SELECT-CAPTURE: pendingCard/pendingOptions/selectedTable reference objects in
  // G.table, so they are serialized as TABLE INDICES (resolved back to refs on
  // receive). pendingSeat names the acting seat; only that seat's client renders
  // the interactive chooser — the other client shows a "choosing capture" wait.

  // 'player'/'ai' refer to the LOCAL perspective. Convert local side ↔ absolute seat.
  function sideToSeat(who) { return who === 'player' ? mySeat : (1 - mySeat); }
  function seatToSide(seat) { return seat === mySeat ? 'player' : 'ai'; }

  // Map a list of table-card object refs → their indices in G.table.
  function tableIdxOf(cards) {
    return (cards || []).map(function (c) { return G.table.indexOf(c); })
                        .filter(function (i) { return i !== -1; });
  }
  // Map a list of indices → object refs from a (freshly rebuilt) table array.
  function idxToCards(idxs, table) {
    return (idxs || []).map(function (i) { return table[i]; })
                       .filter(function (c) { return !!c; });
  }

  function serializeState() {
    var hands = [];
    hands[mySeat]     = G.playerHand.slice();
    hands[1 - mySeat] = G.aiHand.slice();
    var piles = [];
    piles[mySeat]     = G.playerPile.slice();
    piles[1 - mySeat] = G.aiPile.slice();
    var scope = [];
    scope[mySeat]     = G.playerScope;
    scope[1 - mySeat] = G.aiScope;
    var scores = [];
    scores[mySeat]     = G.playerScore;
    scores[1 - mySeat] = G.aiScore;

    // select-capture choice (by table index), gated to its acting seat.
    var pendingCard    = G.pendingCard ? { suit: G.pendingCard.suit, rank: G.pendingCard.rank } : null;
    var pendingOptions = (G.pendingOptions || []).map(tableIdxOf);
    var selectedTable  = tableIdxOf(G.selectedTable);
    var pendingSeat    = G.pendingWho ? sideToSeat(G.pendingWho) : null;

    // roundBreakdown carries the deal scorecard by seat (p0/p1) for the end screen.
    var rb = null;
    if (G.roundBreakdown) {
      rb = {};
      rb[mySeat]     = G.roundBreakdown.player;
      rb[1 - mySeat] = G.roundBreakdown.ai;
    }

    return {
      hands:        hands,                                  // by seat
      deck:         G.deck.slice(),
      table:        G.table.slice(),
      piles:        piles,                                  // by seat
      scope:        scope,                                  // by seat
      scores:       scores,                                 // by seat
      turnSeat:     G.turn === 'player' ? mySeat : (1 - mySeat),
      phase:        G.phase,
      lastCapturerSeat: G.lastCapturer ? sideToSeat(G.lastCapturer) : null,
      pendingCard:  pendingCard,
      pendingOptions: pendingOptions,
      selectedTable:  selectedTable,
      pendingSeat:    pendingSeat,
      roundBreakdown: rb,
      last_actor:   'room:' + mySeat,
    };
  }

  function syncRoom() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState(serializeState());
    reportRoomWin();
  }

  // Compute the room outcome from current G (used by all callers).
  function roomOutcome() {
    var p = G.playerScore, a = G.aiScore;
    var draw = (p >= TARGET && a >= TARGET && p === a);
    var iWon;
    if (p >= TARGET && a >= TARGET) iWon = p > a;
    else iWon = p >= TARGET;
    return { draw: draw, iWon: iWon };
  }

  // Report the winner's SEAT exactly once (room end-screen records per-seat). On a
  // genuine draw, report this seat as a fallback winner so the room can settle.
  function reportRoomWin() {
    if (!vsRoom || !window.RoomBridge || winReported) return;
    if (G.phase !== 'game-end') return;
    winReported = true;
    var o = roomOutcome();
    var winnerSeat = o.draw ? mySeat : (o.iWon ? mySeat : (1 - mySeat));
    RoomBridge.reportWin(winnerSeat);
    if (!roomEnded) {
      roomEnded = true;
      if (window.Achievements && Achievements.evaluate) {
        Achievements.evaluate({
          gameId: 'scopa',
          result: o.draw ? 'draw' : (o.iWon ? 'win' : 'loss'),
          isOnline: true,
          isHost: !!(window.RoomBridge && RoomBridge.isRoomHost && RoomBridge.isRoomHost()),
        });
      }
    }
  }

  // Security: a room-state blob is attacker-controlled (a peer can run a
  // modified client). A card's suit is concatenated into an innerHTML class
  // (sc-card--<suit>), so coerce every incoming card to a whitelisted suit/rank
  // before it can reach the DOM. Honest peers only send valid cards (no-op for
  // normal play); a forged suit/rank becomes a safe known value, preventing
  // HTML/script injection (and render crashes on bad ranks).
  function cleanCard(c) {
    if (!c || typeof c !== 'object') return { suit: SUITS[0], rank: RANK_ORDER[0] };
    return {
      suit: SUITS.indexOf(c.suit) >= 0 ? c.suit : SUITS[0],
      rank: RANK_ORDER.indexOf(c.rank) >= 0 ? c.rank : RANK_ORDER[0],
    };
  }
  function cleanHand(arr) { return (arr || []).map(cleanCard); }

  function receiveRoomState(data) {
    if (!data || !vsRoom) return;
    if (data.last_actor === 'room:' + mySeat) return;       // ignore our own echo
    if (aiThinkTimer) { clearTimeout(aiThinkTimer); aiThinkTimer = null; }

    var hands  = data.hands  || [];
    var piles  = data.piles  || [];
    var scope  = data.scope  || [];
    var scores = data.scores || [];

    G.playerHand  = cleanHand(hands[mySeat]);
    G.aiHand      = cleanHand(hands[1 - mySeat]);
    G.deck        = cleanHand(data.deck);
    G.table       = cleanHand(data.table);
    G.playerPile  = cleanHand(piles[mySeat]);
    G.aiPile      = cleanHand(piles[1 - mySeat]);
    G.playerScope = scope[mySeat]     || 0;
    G.aiScope     = scope[1 - mySeat] || 0;
    G.playerScore = scores[mySeat]     || 0;
    G.aiScore     = scores[1 - mySeat] || 0;
    G.turn        = (data.turnSeat === mySeat) ? 'player' : 'ai';
    G.phase       = data.phase || 'playing';
    G.lastCapturer = (data.lastCapturerSeat === null || data.lastCapturerSeat === undefined)
      ? null : seatToSide(data.lastCapturerSeat);

    // Rebuild the select-capture choice from indices against the fresh table.
    if (data.phase === 'select-capture' && data.pendingCard) {
      G.pendingCard    = cleanCard(data.pendingCard);
      G.pendingOptions = (data.pendingOptions || []).map(function (idxs) { return idxToCards(idxs, G.table); });
      G.selectedTable  = idxToCards(data.selectedTable, G.table);
      G.pendingWho     = (data.pendingSeat === null || data.pendingSeat === undefined)
        ? null : seatToSide(data.pendingSeat);
    } else {
      G.pendingCard    = null;
      G.pendingOptions = [];
      G.selectedTable  = [];
      G.pendingWho     = null;
    }

    G.roundBreakdown = null;
    if (data.roundBreakdown) {
      G.roundBreakdown = {
        player: data.roundBreakdown[mySeat]     || null,
        ai:     data.roundBreakdown[1 - mySeat] || null,
      };
    }

    selectedIdx = null;
    render();
    if (G.phase === 'game-end') reportRoomWin();   // loser also reports (no-op after first)
  }

  function initRoom() {
    if (!window.RoomBridge || !RoomBridge.isActive || !RoomBridge.isActive()) return;
    vsRoom = true;
    vsAI   = false;                                  // disable the local AI scheduler
    mySeat = RoomBridge.getSeat();
    RoomBridge.onState(receiveRoomState);            // also signals 'ready' → parent pushes latest state
    newGame();                                       // seat 0 seeds + broadcasts; seat 1 waits for state
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('game-container')) return;
    if (window.RoomBridge && RoomBridge.isActive && RoomBridge.isActive()) {
      initRoom();
    } else {
      newGame();
    }
  });
})();
