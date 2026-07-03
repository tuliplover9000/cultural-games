/**
 * durak.js — Durak (Подкидной / Russian throw-in "fool")
 * DOM-based rendering, reuses .tl- CSS classes from games.css.
 * Prefix: dk-   Key: durak
 *
 * vs-CPU single player. Card-art helpers (N, PIP_PATH, pip, faceJ/Q/K,
 * cornerIndex, the SVG card frame) and esc() reuse the shared card-art
 * helpers; the deck/rank model, cardSVG pip layouts, engine, AI, flow and rendering are
 * Durak's own (attack/defend with a trump suit).
 */
(function () {
  'use strict';

  // ── Deck constants ──────────────────────────────────────────────────────────
  // 36-card deck: ranks 6,7,8,9,10,J,Q,K,A only (NO 2/3/4/5). A is high (14).
  var SUITS      = ['oros', 'copas', 'espadas', 'bastos'];
  var RANK_ORDER = [6, 7, 8, 9, 10, 11, 12, 13, 14];
  var RANK_NAMES = { 6:'6', 7:'7', 8:'8', 9:'9', 10:'10', 11:'J', 12:'Q', 13:'K', 14:'A' };
  // Internal suit keys map to French-deck art & symbols:
  // copas→hearts, oros→diamonds, espadas→spades, bastos→clubs.
  var SUIT_SYM   = { oros:'♦', copas:'♥', espadas:'♠', bastos:'♣' };

  var HAND_TARGET = 6;
  var ATTACK_CAP  = 6;

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

  // Pip layouts (viewBox 100×150; lower pips auto-flip when y>80).
  // 6,7 reuse the existing layouts; 8,9,10 + Ace are Durak's additions.
  var PIP_LAYOUT = {
    6: [[34, 45, 1], [66, 45, 1], [34, 75, 1], [66, 75, 1], [34, 105, 1], [66, 105, 1]],
    7: [[34, 44, 0.95], [66, 44, 0.95], [50, 59, 0.95],
        [34, 74, 0.95], [66, 74, 0.95], [34, 104, 0.95], [66, 104, 0.95]],
    8:  [[34,43,.9],[66,43,.9],[34,63,.9],[66,63,.9],[34,87,.9],[66,87,.9],[34,107,.9],[66,107,.9]],
    9:  [[34,41,.82],[66,41,.82],[34,57,.82],[66,57,.82],[50,75,.82],[34,93,.82],[66,93,.82],[34,109,.82],[66,109,.82]],
    10: [[34,41,.8],[66,41,.8],[34,57,.8],[66,57,.8],[50,49,.8],[34,93,.8],[66,93,.8],[34,109,.8],[66,109,.8],[50,101,.8]],
  };
  // Ace (14): a single large centre pip.
  var ACE_LAYOUT = [[50, 75, 2.5]];

  // Court cards — naive single full-length figures, flat fills, thick ink.
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
    var fs = RANK_NAMES[rank] === '10' ? 13 : 17;   // "10" is two chars — shrink to fit
    return '<text class="dk-ix" x="6" y="21" font-size="' + fs + '" font-weight="bold" font-family="Georgia, serif" fill="'
         + SUIT_INK[suit] + '">' + RANK_NAMES[rank] + '</text>'
         + pip(suit, 12, 31, 0.48);
  }

  // All strings here are internal constants — innerHTML-safe by construction.
  function cardSVG(rank, suit) {
    var mid;
    if (rank === 11 || rank === 12 || rank === 13) {
      mid = '<rect x="23" y="27" width="54" height="96" rx="3" fill="none" stroke="' + ART_INK + '" stroke-width="1.3" opacity="0.5"/>'
          + (rank === 11 ? faceJ(suit) : (rank === 12 ? faceQ(suit) : faceK(suit)));
    } else {
      var lay = rank === 14 ? ACE_LAYOUT : PIP_LAYOUT[rank], out = '', i;
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
  var selectedIdx  = null;   // human defender's selected hand card index
  var aiThinkTimer = null;
  var gameLog      = [];

  // ── Multiplayer (RoomBridge) flags ──────────────────────────────────────────
  // vsRoom: this instance is running inside a room iframe (remote human opponent).
  // mySeat: 0 or 1 — this client's seat. The render is ALWAYS local-perspective
  // (my hand = G.playerHand, opponent = G.aiHand, attacker 'player' = ME attacks).
  // Durak has ROLES: G.attacker is the LOCAL side ('player'/'ai') that is on the
  // offence; the defender is the other side. These map to seats only at the sync
  // boundary in serializeState()/receiveRoomState(). Seat 0 seeds the deal+trump.
  var vsRoom      = false;
  var mySeat      = 0;
  var vsAI        = true;     // local AI scheduler runs only when true (never in a room)
  var winReported = false;
  var roomEnded   = false;    // online end-screen achievements fired once guard

  var anim = {
    dealHand: false,
    dealAI:   false,
    flashMsg: '',
  };

  // ── Deck helpers ─────────────────────────────────────────────────────────────
  // Build the 36-card deck, shuffle, then place the trump card so it is the LAST
  // card drawn. We draw with .shift() from the FRONT, so the trump card sits at
  // the END of the array.
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
    gameLog = [];
    winReported = false;
    roomEnded   = false;
    if (vsRoom && window.RoomBridge && RoomBridge.resetWin) RoomBridge.resetWin();

    // In a room, only seat 0 builds the authoritative deck + opening deal and
    // broadcasts it; seat 1 waits for that first state (renders an empty board
    // until receiveRoomState() arrives). Out of a room this is the normal solo
    // deal — byte-for-byte the same behaviour as before.
    if (vsRoom && mySeat !== 0) {
      G = {
        deck: [], trumpSuit: 'oros', trumpCard: { suit: 'oros', rank: 6 },
        playerHand: [], aiHand: [], table: [], discard: 0,
        attacker: 'ai', boutDefHandSize: HAND_TARGET, phase: 'attack', winner: null,
      };
      selectedIdx = null;
      render();
      return;
    }

    var deck = buildDeck();
    // The trump card is the bottom card of the stock — i.e. the LAST one drawn.
    // We draw from the front (.shift()); the last element is therefore the trump.
    var trumpCard = deck[deck.length - 1];

    G = {
      deck:           deck,        // draw from FRONT (.shift()); trumpCard is last out
      trumpSuit:      trumpCard.suit,
      trumpCard:      trumpCard,
      playerHand:     [],
      aiHand:         [],
      table:          [],          // [{ attack:card, defence:card|null }]
      discard:        0,
      attacker:       'player',
      boutDefHandSize: HAND_TARGET,
      phase:          'attack',    // 'attack' | 'defend' | 'game-end'
      winner:         null,
    };
    selectedIdx = null;

    // Deal 6 to each (from the front; the trump card stays at the bottom).
    for (var i = 0; i < HAND_TARGET; i++) G.playerHand.push(G.deck.shift());
    for (i = 0; i < HAND_TARGET; i++) G.aiHand.push(G.deck.shift());
    anim.dealHand = true;
    anim.dealAI   = true;

    sortHand(G.playerHand);
    sortHand(G.aiHand);

    // First attacker = holder of the lowest trump across both hands.
    G.attacker = firstAttacker();
    G.boutDefHandSize = defender() === 'player' ? G.playerHand.length : G.aiHand.length;
    G.phase = 'attack';

    addLog('system', 'New game. Trump is ' + SUIT_SYM[G.trumpSuit] + '. '
      + (G.attacker === 'player' ? 'You attack first.' : oppWord() + ' attacks first.'));
    render();
    if (vsRoom) { syncRoom(); return; }   // seat 0 broadcasts the opening deal; no local AI
    if (G.attacker === 'ai') scheduleAI();
  }

  // Opponent label: a remote human in a room, otherwise the CPU.
  function oppWord() { return vsRoom ? 'Opponent' : 'CPU'; }

  // Sort a hand: non-trumps first (by rank), then trumps (by rank). Readability.
  function sortHand(hand) {
    hand.sort(function (a, b) {
      var at = a.suit === G.trumpSuit ? 1 : 0;
      var bt = b.suit === G.trumpSuit ? 1 : 0;
      if (at !== bt) return at - bt;
      if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
      return a.rank - b.rank;
    });
  }

  function firstAttacker() {
    var lowest = null, who = null;
    function scan(hand, owner) {
      hand.forEach(function (c) {
        if (c.suit === G.trumpSuit && (lowest === null || c.rank < lowest)) {
          lowest = c.rank; who = owner;
        }
      });
    }
    scan(G.playerHand, 'player');
    scan(G.aiHand, 'ai');
    return who || 'player';   // guard: nobody holds a trump (impossible at 6+6)
  }

  function defender()       { return G.attacker === 'player' ? 'ai' : 'player'; }
  function handOf(who)      { return who === 'player' ? G.playerHand : G.aiHand; }

  // ── Core rules ───────────────────────────────────────────────────────────────
  // def beats atk iff: same suit & higher; OR def trump & atk not trump;
  // OR both trump & def higher. A non-trump NEVER beats a trump.
  function beats(def, atk) {
    var dT = def.suit === G.trumpSuit, aT = atk.suit === G.trumpSuit;
    if (dT && !aT) return true;
    if (!dT && aT) return false;
    if (def.suit === atk.suit) return def.rank > atk.rank;
    return false;   // different non-trump suits
  }

  function legalDefences(atk, hand) {
    return hand.filter(function (c) { return beats(c, atk); });
  }

  function rankOnTable(rank) {
    return G.table.some(function (p) {
      return p.attack.rank === rank || (p.defence && p.defence.rank === rank);
    });
  }

  function attackCount() { return G.table.length; }
  function attackCap()   { return Math.min(ATTACK_CAP, G.boutDefHandSize); }

  // Can `card` be added as an attack right now?
  function canAttackWith(card) {
    if (G.table.length === 0) return true;              // first attack — any card
    if (attackCount() >= attackCap()) return false;     // capped
    return rankOnTable(card.rank);                      // throw-in: rank must be down
  }

  function allBeaten() {
    return G.table.length > 0 && G.table.every(function (p) { return p.defence; });
  }
  function unbeatenPairs() {
    return G.table.filter(function (p) { return !p.defence; });
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  // Attacker plays one card as a new (unbeaten) attack.
  function attackerPlay(who, card) {
    var hand = handOf(who);
    var idx = hand.indexOf(card);
    if (idx === -1) return;
    hand.splice(idx, 1);
    G.table.push({ attack: card, defence: null });
    addLog(who, (who === 'player' ? 'You' : 'CPU') + ' attack with ' + cardName(card));
    G.phase = 'defend';
  }

  // Defender beats the unbeaten attack pair at table index `pairIdx` with `card`.
  function defenderBeat(who, card, pairIdx) {
    var pair = G.table[pairIdx];
    if (!pair || pair.defence) return false;
    if (!beats(card, pair.attack)) return false;
    var hand = handOf(who);
    var idx = hand.indexOf(card);
    if (idx === -1) return false;
    hand.splice(idx, 1);
    pair.defence = card;
    addLog(who, (who === 'player' ? 'You' : 'CPU') + ' beat ' + cardName(pair.attack) + ' with ' + cardName(card));
    return true;
  }

  // Defender gives up: takes ALL table cards into hand.
  function defenderTake(who) {
    var hand = handOf(who);
    var n = 0;
    G.table.forEach(function (p) {
      hand.push(p.attack); n++;
      if (p.defence) { hand.push(p.defence); n++; }
    });
    G.table = [];
    sortHand(hand);
    addLog(who, (who === 'player' ? 'You' : 'CPU') + ' took ' + n + ' card' + (n !== 1 ? 's' : '') + '.');
    anim.flashMsg = (who === 'player' ? 'You took the cards' : 'CPU took the cards');
    endBout(true);
  }

  // Attacker finishes (Бита) — only when all attacks are beaten. Table → discard.
  function attackerDone() {
    if (!allBeaten()) return;
    var n = 0;
    G.table.forEach(function (p) { n += 1; if (p.defence) n += 1; });
    G.discard += n;
    G.table = [];
    addLog('system', 'Beaten! ' + n + ' card' + (n !== 1 ? 's' : '') + ' to the bita (discard).');
    anim.flashMsg = 'Beaten — defence held';
    endBout(false);
  }

  // ── Bout resolution & replenish ──────────────────────────────────────────────
  function endBout(took) {
    var atk = G.attacker, def = defender();
    // Replenish to 6: ATTACKER draws first, then defender. No draw if deck empty.
    drawUpTo(atk);
    drawUpTo(def);
    sortHand(G.playerHand);
    sortHand(G.aiHand);

    // Win/lose — only meaningful once the deck is empty.
    if (G.deck.length === 0) {
      var pEmpty = G.playerHand.length === 0;
      var aEmpty = G.aiHand.length === 0;
      if (pEmpty && aEmpty) {
        G.winner = 'draw'; G.phase = 'game-end'; render();
        if (vsRoom) syncRoom();
        return;
      }
      if (pEmpty || aEmpty) {
        // The player still holding cards is the durak (loser).
        G.winner = pEmpty ? 'player' : 'ai';
        G.phase = 'game-end'; render();
        if (vsRoom) syncRoom();   // syncRoom also fires reportWin once
        return;
      }
    }

    // Roles: took → same attacker continues (taker defends again);
    //        defended → defender becomes attacker (roles swap).
    if (!took) G.attacker = def;
    // (if took, attacker unchanged)

    G.boutDefHandSize = handOf(defender()).length;
    G.phase = 'attack';
    selectedIdx = null;
    render();
    if (vsRoom) { syncRoom(); return; }   // broadcast the replenish + role change
    if (G.attacker === 'ai') scheduleAI();
  }

  function drawUpTo(who) {
    var hand = handOf(who);
    while (hand.length < HAND_TARGET && G.deck.length > 0) {
      hand.push(G.deck.shift());
    }
  }

  // ── AI ───────────────────────────────────────────────────────────────────────
  // The AI may need several sequential actions in one bout (attack → throw-ins →
  // finish; or beat each attack). We drive them with chained guarded setTimeouts.
  function scheduleAI() {
    if (vsRoom || !vsAI) return;   // in a room the opponent is a remote human
    if (aiThinkTimer) clearTimeout(aiThinkTimer);
    aiThinkTimer = setTimeout(aiStep, 850);
  }

  function aiStep() {
    aiThinkTimer = null;
    if (G.phase === 'game-end') return;

    if (G.attacker === 'ai') {
      // AI is the attacker.
      if (G.phase === 'attack') { aiAttackStart(); return; }
      if (G.phase === 'defend') {
        // The human defender has just beaten everything; the AI attacker now
        // decides to throw in another card or finish (Бита). If there is still
        // an unbeaten attack it means the human hasn't acted yet — do nothing.
        aiAttackerContinue();
        return;
      }
    } else {
      // AI is the defender (human attacks). AI acts only in the defend phase.
      if (G.phase === 'defend') { aiDefendStep(); return; }
    }
  }

  // AI opens a bout with its best low attack.
  function aiAttackStart() {
    var hand = G.aiHand;
    if (hand.length === 0) { return; }   // shouldn't happen while attacking
    var card = pickAttackCard(hand);
    attackerPlay('ai', card);
    render();
    // Now the human must defend (phase==='defend'); wait for the human.
  }

  // After the human (defender) has beaten everything, the AI decides throw-ins
  // or finishes. Called from the human-side flow via aiAttackerContinue().
  function aiAttackerContinue() {
    // Guard.
    if (G.attacker !== 'ai' || G.phase !== 'defend') return;
    if (!allBeaten()) return;   // there is still an unbeaten attack — human's move

    // Decide a throw-in.
    var defHand = G.playerHand;        // the human defender
    var throwIn = pickThrowIn(G.aiHand, defHand);
    if (throwIn && attackCount() < attackCap()) {
      attackerPlay('ai', throwIn);
      render();
      return;   // human must defend the new attack
    }
    // Otherwise finish.
    attackerDone();
  }

  // Choose the AI attack card: lead low non-trumps, hold trumps.
  function pickAttackCard(hand) {
    var best = null, bestScore = Infinity;
    hand.forEach(function (c) {
      if (G.table.length > 0 && !canAttackWith(c)) return;   // throw-in legality
      var trump = c.suit === G.trumpSuit;
      var score = c.rank + (trump ? 100 : 0) + (trump ? c.rank : 0);
      if (score < bestScore) { bestScore = score; best = c; }
    });
    return best || hand[0];
  }

  // Choose a legal throw-in (rank already on table) when overloading helps.
  function pickThrowIn(hand, defHand) {
    var legal = hand.filter(canAttackWith);
    if (legal.length === 0) return null;
    // Overload only when the defender's hand is small; otherwise hold material.
    var pressure = defHand.length <= 2 || G.deck.length === 0;
    if (!pressure && Math.random() > 0.55) return null;   // sometimes just finish
    // Prefer low non-trumps.
    legal.sort(function (a, b) {
      var at = a.suit === G.trumpSuit ? 1 : 0, bt = b.suit === G.trumpSuit ? 1 : 0;
      if (at !== bt) return at - bt;
      return a.rank - b.rank;
    });
    // Never throw a trump as a throw-in unless really pressing.
    if (legal[0].suit === G.trumpSuit && !pressure) return null;
    return legal[0];
  }

  // AI defends: beat one unbeaten attack, or take.
  function aiDefendStep() {
    var pairs = unbeatenPairs();
    if (pairs.length === 0) {
      // Everything beaten — control returns to the (human) attacker. Nothing to do.
      return;
    }
    var pairIdx = G.table.indexOf(pairs[0]);
    var atk = pairs[0].attack;
    var beat = pickDefenceCard(G.aiHand, atk);

    if (!beat || aiShouldTake(pairs)) {
      defenderTake('ai');
      return;
    }
    defenderBeat('ai', beat, pairIdx);
    render();

    if (allBeaten()) {
      // Defence complete for now — control returns to the human attacker.
      // Status will prompt the human to throw in or finish.
      G.phase = 'defend';   // stay in defend phase; human attacker chooses next
      render();
      return;
    }
    // More unbeaten attacks remain — continue beating after a beat.
    scheduleAI();
  }

  // The minimal legal card that beats `atk`, preferring non-trumps and low ranks.
  function pickDefenceCard(hand, atk) {
    var cands = legalDefences(atk, hand);
    if (cands.length === 0) return null;
    var best = null, bestScore = Infinity;
    cands.forEach(function (c) {
      var trump = c.suit === G.trumpSuit;
      var atkTrump = atk.suit === G.trumpSuit;
      var score = c.rank + (trump ? 50 : 0) + (trump && !atkTrump ? 30 : 0);
      if (score < bestScore) { bestScore = score; best = c; }
    });
    return best;
  }

  // Heuristic: take instead of beating when it would burn high trumps cheaply,
  // or when several attacks would each cost a trump/high card. Preserve material
  // for the deck-empty endgame.
  function aiShouldTake(pairs) {
    if (G.deck.length > 12) return false;   // early game: defend freely
    var totalCost = 0, trumpBurns = 0;
    for (var i = 0; i < pairs.length; i++) {
      var atk = pairs[i].attack;
      var card = pickDefenceCard(G.aiHand, atk);
      if (!card) return true;   // can't beat one of them → must take
      if (card.suit === G.trumpSuit) {
        trumpBurns++;
        if (atk.suit !== G.trumpSuit && atk.rank <= 9) totalCost += 3;  // high trump on cheap attack
        else totalCost += 1;
      }
    }
    var weight = G.deck.length === 0 ? 2 : 1;
    if (trumpBurns >= 2) return true;
    if (totalCost * weight >= 3) return true;
    return false;
  }

  // ── Human play ───────────────────────────────────────────────────────────────
  // Human attacker clicks a hand card to play it as an attack.
  function humanAttackClick(card) {
    if (G.attacker !== 'player' || G.phase !== 'attack' && G.phase !== 'defend') return;
    // Starting a bout (phase 'attack') OR throwing in (phase 'defend' & allBeaten).
    var starting = G.table.length === 0;
    if (!starting && !allBeaten()) return;   // can't throw in while an attack is unbeaten
    if (!canAttackWith(card)) return;
    attackerPlay('player', card);
    render();
    if (vsRoom) { syncRoom(); return; }   // broadcast; the remote defender replies
    // Defender is AI → schedule its defence.
    scheduleAI();
  }

  // Human attacker finishes the bout (Бита) — only when all attacks beaten.
  function humanDone() {
    if (G.attacker !== 'player') return;
    if (!allBeaten()) return;
    attackerDone();
  }

  // Human defender selects a hand card.
  function humanDefSelect(idx) {
    if (G.attacker === 'player' || G.phase !== 'defend') return;
    selectedIdx = selectedIdx === idx ? null : idx;
    render();
  }

  // Human defender clicks an unbeaten attack pair to beat it with the selected card.
  function humanDefTarget(pairIdx) {
    if (G.attacker === 'player' || G.phase !== 'defend') return;
    if (selectedIdx === null) return;
    var card = G.playerHand[selectedIdx];
    if (!card) return;
    if (!defenderBeat('player', card, pairIdx)) return;
    selectedIdx = null;
    render();
    if (vsRoom) { syncRoom(); return; }   // broadcast each beat; remote attacker continues

    if (allBeaten()) {
      // Defence complete — control returns to the AI attacker (throw-in or finish).
      scheduleAI();
    }
  }

  // Human defender takes all table cards.
  function humanTake() {
    if (G.attacker === 'player' || G.phase !== 'defend') return;
    selectedIdx = null;
    defenderTake('player');
  }

  // ── Log / esc ────────────────────────────────────────────────────────────────
  function cardName(card) { return RANK_NAMES[card.rank] + SUIT_SYM[card.suit]; }

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
    if (G.phase === 'game-end') { renderGameEnd(el); return; }
    el.innerHTML = buildUI();
    wireEvents(el);
  }

  function thinking() {
    return oppWord() + ' is thinking <span class="tl-thinking-dots"><span></span><span></span><span></span></span>';
  }

  function buildUI() {
    var youAttack  = G.attacker === 'player';
    var youDefend  = G.attacker === 'ai';
    var flash = anim.flashMsg; anim.flashMsg = '';

    var statusInner, statusCls = '';
    if (flash) {
      statusInner = flash; statusCls = 'dk-flash';
    } else if (aiThinkTimer || (youDefend && G.phase === 'attack')) {
      statusInner = thinking();
    } else if (youAttack) {
      if (G.table.length === 0) {
        statusInner = 'You attack — play a card'; statusCls = 'your-turn';
      } else if (allBeaten()) {
        statusInner = 'Throw in a matching rank, or press Done (Бита)'; statusCls = 'your-turn';
      } else {
        statusInner = thinking();
      }
    } else { // youDefend
      if (unbeatenPairs().length > 0) {
        statusInner = selectedIdx !== null
          ? 'Click an unbeaten attack to beat it, or Take'
          : 'Defend — select a card to beat with, or Take';
        statusCls = 'your-turn';
      } else {
        statusInner = thinking();
      }
    }

    return '<div class="tl-game dk-game">'
      + '<div class="tl-status-bar ' + statusCls + '">' + statusInner + '</div>'
      + cpuZone()
      + centerRow()
      + playerZone()
      + logArea()
      + '</div>';
  }

  function cpuZone() {
    var n      = G.aiHand.length;
    var active = G.attacker === 'ai';
    var dealing = anim.dealAI; anim.dealAI = false;
    var backs = '';
    for (var i = 0; i < n; i++) {
      var dcls = dealing ? ' dealing' : '';
      var dsty = dealing ? ' style="--deal-i:' + i + '"' : '';
      backs += '<div class="tl-card-back tl-card-back--sm' + dcls + '"' + dsty + '></div>';
    }
    var roleTag = G.attacker === 'ai' ? 'Attacking ●' : 'Defending';
    return '<div class="tl-zone tl-zone--top dk-cpu-zone">'
      + '<div class="tl-zone__name' + (active ? ' active' : '') + '">' + oppWord() + ' &middot; ' + roleTag + '</div>'
      + '<div class="tl-opp-cards--top">' + backs + '</div>'
      + '<div class="tl-zone__count">' + n + ' card' + (n !== 1 ? 's' : '') + '</div>'
      + '</div>';
  }

  // The centre: deck+trump display (left), battlefield (middle), bita (right).
  function centerRow() {
    return '<div class="dk-center">'
      + deckTrump()
      + battlefield()
      + bita()
      + '</div>';
  }

  function deckTrump() {
    var n = G.deck.length;
    var trumpVisible = n > 0;   // the trump card sits at the bottom while stock remains
    var trumpInner = trumpVisible
      ? '<div class="dk-trump"><div class="tl-card">' + cardSVG(G.trumpCard.rank, G.trumpCard.suit) + '</div></div>'
      : '';
    var stockInner = n > 0
      ? '<div class="dk-deck-stack"><div class="tl-card-back dk-deck-back"></div>'
        + '<span class="dk-deck-count">' + n + '</span></div>'
      : '<div class="dk-deck-empty">Stock empty</div>';
    return '<div class="dk-deckzone">'
      + '<div class="dk-deckzone__label">Trump ' + SUIT_SYM[G.trumpSuit] + '</div>'
      + '<div class="dk-deckzone__cards">' + trumpInner + stockInner + '</div>'
      + '</div>';
  }

  function battlefield() {
    var youDefend = G.attacker === 'ai';
    var canTarget = youDefend && G.phase === 'defend' && selectedIdx !== null;

    var pairsHTML = G.table.map(function (p, i) {
      var unbeaten = !p.defence;
      var cls = 'dk-pair' + (unbeaten ? ' dk-pair--open' : '');
      var targetable = canTarget && unbeaten && beats(G.playerHand[selectedIdx], p.attack);
      if (targetable) cls += ' dk-pair--target';
      var atkCard = '<div class="tl-card dk-atk dk-card--' + p.attack.suit + '">' + cardSVG(p.attack.rank, p.attack.suit) + '</div>';
      var defCard = p.defence
        ? '<div class="tl-card dk-def dk-card--' + p.defence.suit + '">' + cardSVG(p.defence.rank, p.defence.suit) + '</div>'
        : '';
      return '<div class="' + cls + '" data-pair="' + i + '">' + atkCard + defCard + '</div>';
    }).join('');

    var empty = G.table.length === 0
      ? '<span class="tl-play-area-empty">Battlefield empty</span>' : '';

    return '<div class="dk-field-wrap">'
      + '<div class="dk-battlefield' + (G.table.length ? ' has-cards' : '') + '">'
      + (pairsHTML || empty)
      + '</div></div>';
  }

  function bita() {
    return '<div class="dk-bitazone">'
      + '<div class="dk-bitazone__label">Bita</div>'
      + '<div class="dk-bita' + (G.discard ? ' has-cards' : '') + '">'
      + '<span class="dk-bita__count">' + G.discard + '</span>'
      + '</div>'
      + '</div>';
  }

  function playerZone() {
    var dealing = anim.dealHand; anim.dealHand = false;
    var youAttack = G.attacker === 'player';
    var youDefend = G.attacker === 'ai';
    var actionable = (youAttack && (G.table.length === 0 || allBeaten()))
                  || (youDefend && unbeatenPairs().length > 0);

    var cards = G.playerHand.map(function (card, i) {
      var clickable = false;
      if (youDefend && unbeatenPairs().length > 0) {
        clickable = true;   // can select any card; legality checked on target
      } else if (youAttack && (G.table.length === 0 || allBeaten())) {
        clickable = canAttackWith(card);
      }
      var cls = [
        'dk-card--' + card.suit,
        clickable ? 'clickable' : '',
        (youDefend && selectedIdx === i) ? 'selected' : '',
        dealing ? 'dealing' : '',
      ].filter(Boolean).join(' ');
      var sty = dealing ? ' style="--deal-i:' + i + '"' : '';
      return '<div class="tl-card ' + cls + '" data-idx="' + i + '"' + sty + '>'
        + cardSVG(card.rank, card.suit) + '</div>';
    }).join('');

    var roleLabel = youAttack ? 'Attacking ●' : 'Defending';
    var hint = '', hintCls = '';
    if (youAttack) {
      if (G.table.length === 0) hint = 'Play any card to open the attack.';
      else if (allBeaten()) { hint = 'Add a card of a rank already on the table, or finish.'; hintCls = 'valid'; }
      else hint = 'Wait — ' + oppWord() + ' is defending.';
    } else {
      if (unbeatenPairs().length > 0) {
        hint = selectedIdx !== null ? 'Now click the attack you want to beat.' : 'Pick a card, then the attack to beat — or Take.';
        if (selectedIdx !== null) hintCls = 'valid';
      } else {
        hint = 'Wait — ' + oppWord() + ' is attacking.';
      }
    }

    // Action buttons depend on role.
    var actionsMain;
    if (youAttack) {
      var doneOK = allBeaten();
      actionsMain = '<button class="tl-btn tl-btn--ghost" id="dk-done-btn"' + (doneOK ? '' : ' disabled') + '>Done (Бита)</button>';
    } else {
      var takeOK = youDefend && unbeatenPairs().length > 0;
      actionsMain = '<button class="tl-btn tl-btn--play" id="dk-take-btn"' + (takeOK ? '' : ' disabled') + '>Take</button>';
    }

    return '<div class="tl-player-area">'
      + '<div class="tl-zone__name active">You &middot; ' + roleLabel + ' &nbsp;·&nbsp; ' + G.playerHand.length + ' cards</div>'
      + '<div class="tl-hand">' + cards + '</div>'
      + '<div class="tl-hint ' + hintCls + '">' + hint + '</div>'
      + '<div class="tl-actions">'
      + '<div class="tl-actions__main">' + actionsMain + '</div>'
      + '<div class="tl-actions__secondary">'
      + '<button class="tl-btn tl-btn--ghost" id="dk-new-btn">New Game</button>'
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

  // ── Game-end ─────────────────────────────────────────────────────────────────
  function renderGameEnd(el) {
    var w = G.winner;
    var icon, head, phrase, youWon = (w === 'player');
    var hasIcon = (window.Icon && Icon.svg);
    if (w === 'draw') {
      icon = hasIcon ? Icon.svg('handshake', 44) : '🤝'; head = "It's a draw!";
      phrase = 'Both hands empty at once — nobody is the fool today.';
    } else if (youWon) {
      icon = hasIcon ? Icon.svg('trophy', 44) : '🏆'; head = 'You win!';
      phrase = 'You shed your last card — the ' + oppWord().toLowerCase() + ' is the durak.';
    } else {
      icon = hasIcon ? Icon.svg('scales', 44) : '🃏'; head = 'You are the durak';
      phrase = 'Left holding the cards — the gentle shame of the fool.';
    }
    el.innerHTML = '<div class="tl-game dk-game">'
      + '<div class="tl-gameover visible">'
      + '<div class="tl-gameover__icon">' + icon + '</div>'
      + '<h2>' + head + '</h2>'
      + '<p class="dk-win-phrase">' + phrase + '</p>'
      + '<button class="tl-btn tl-btn--play" id="dk-play-again" style="margin-top:1.5rem">Play Again</button>'
      + '</div>'
      + '</div>';
    var btn = el.querySelector('#dk-play-again');
    if (btn) btn.addEventListener('click', newGame);

    if (vsRoom) {
      // Room mode: stats/coins are recorded per-seat by the room end-screen via
      // RoomBridge.reportWin (fired in syncRoom). Do NOT record solo achievements
      // or win counts here — that would double-record. Report the winner once.
      reportRoomWin();
      return;
    }

    if (youWon && window.Achievements) {
      Achievements.track('dk_first_win');
      Achievements.increment('durak', 'wins');
    }
  }

  // ── Wire events ──────────────────────────────────────────────────────────────
  function wireEvents(el) {
    // Hand cards.
    el.querySelectorAll('.tl-hand .tl-card[data-idx]').forEach(function (cardEl) {
      cardEl.addEventListener('click', function () {
        var i = parseInt(cardEl.dataset.idx, 10);
        if (G.attacker === 'player') {
          // Attacker: clicking a legal card plays it.
          var card = G.playerHand[i];
          if (card) humanAttackClick(card);
        } else {
          // Defender: select.
          humanDefSelect(i);
        }
      });
    });

    // Battlefield pairs (defender targeting).
    el.querySelectorAll('.dk-pair[data-pair]').forEach(function (pairEl) {
      pairEl.addEventListener('click', function () {
        var i = parseInt(pairEl.dataset.pair, 10);
        humanDefTarget(i);
      });
    });

    var doneBtn = el.querySelector('#dk-done-btn');
    if (doneBtn) doneBtn.addEventListener('click', humanDone);

    var takeBtn = el.querySelector('#dk-take-btn');
    if (takeBtn) takeBtn.addEventListener('click', humanTake);

    var newBtn = el.querySelector('#dk-new-btn');
    if (newBtn) newBtn.addEventListener('click', function () {
      if (window.CGDialog) {
        CGDialog.confirm({ title: 'Start a new game?', confirmText: 'New Game' }).then(function (ok) { if (ok) newGame(); });
      } else if (confirm('Start a new game?')) {
        newGame();
      }
    });
  }

  // ── Multiplayer (RoomBridge) ─────────────────────────────────────────────────
  // The blob is SEAT-relative (hands[seat], attackerSeat, winnerSeat) so both
  // clients share one canonical state regardless of which seat each sits in. The
  // local G is always PERSPECTIVE-relative (playerHand = mine, attacker 'player'
  // = ME on the offence). serializeState() maps perspective→seat on send;
  // receiveRoomState() maps seat→perspective on receive. The full state (both
  // hands, the battlefield attack/defence pairs, deck, trump, discard count, the
  // attacker SEAT, the bout phase, boutDefHandSize, winner) travels in the blob —
  // same accepted trust model as truc/cuarenta (each client only renders its own
  // hand; the opponent's hand is shown face-down).
  //
  // ROLE MAPPING (the riskiest part): Durak's G.attacker is a LOCAL side. On the
  // wire it becomes attackerSeat (an absolute seat). On receive, the local player
  // is the attacker iff attackerSeat === mySeat → G.attacker = 'player', else the
  // defender → G.attacker = 'ai'. The defender is implicit (the other side), so
  // it follows automatically. The battlefield pairs are seat-neutral cards and
  // need no mapping. Turn-gating: the existing humanAttackClick/humanDone require
  // G.attacker==='player'; humanDefSelect/humanDefTarget/humanTake require
  // G.attacker!=='player' — both already gate the LOCAL seat correctly because
  // the render is always local-perspective. The opponent's moves arrive via
  // receiveRoomState and never run any local handler.

  // 'player'/'ai' are the LOCAL perspective. Convert a local side to its absolute
  // seat, and an absolute seat back to a local side.
  function sideToSeat(who) { return who === 'player' ? mySeat : (1 - mySeat); }
  function seatToSide(seat) { return seat === mySeat ? 'player' : 'ai'; }

  function serializeState() {
    var hands = [];
    hands[mySeat]     = G.playerHand.slice();
    hands[1 - mySeat] = G.aiHand.slice();
    // Battlefield pairs are seat-neutral cards — copy verbatim.
    var table = G.table.map(function (p) {
      return { attack: p.attack, defence: p.defence || null };
    });
    var winnerSeat = null;
    if (G.winner === 'draw') winnerSeat = 'draw';
    else if (G.winner === 'player' || G.winner === 'ai') winnerSeat = sideToSeat(G.winner);
    return {
      hands:           hands,                       // by seat: [seat0Hand, seat1Hand]
      deck:            G.deck.slice(),
      trumpSuit:       G.trumpSuit,
      trumpCard:       G.trumpCard,
      table:           table,                       // [{attack, defence|null}]
      discard:         G.discard,
      attackerSeat:    sideToSeat(G.attacker),      // absolute seat of the attacker
      boutDefHandSize: G.boutDefHandSize,
      phase:           G.phase,                     // 'attack' | 'defend' | 'game-end'
      winner:          winnerSeat,                  // seat index, 'draw', or null
      last_actor:      'room:' + mySeat,
    };
  }

  function syncRoom() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState(serializeState());
    reportRoomWin();
  }

  // Report the winner's SEAT exactly once (room end-screen records per-seat). A
  // draw reports no winner — reportWin is skipped, the end-screen still shows.
  function reportRoomWin() {
    if (!vsRoom || !window.RoomBridge || winReported) return;
    if (G.phase !== 'game-end') return;
    winReported = true;
    var youWon = (G.winner === 'player');
    if (G.winner !== 'draw') {
      var winnerSeat = (G.winner === 'player') ? mySeat : (1 - mySeat);
      RoomBridge.reportWin(winnerSeat);
    }
    if (!roomEnded) {
      roomEnded = true;
      if (window.Achievements && Achievements.evaluate) {
        Achievements.evaluate({
          gameId: 'durak',
          result: (G.winner === 'draw') ? 'draw' : (youWon ? 'win' : 'loss'),
          isOnline: true,
          isHost: !!(window.RoomBridge && RoomBridge.isRoomHost && RoomBridge.isRoomHost()),
        });
      }
    }
  }

  // Security: a room-state blob is attacker-controlled (a peer can run a
  // modified client). A card's suit is concatenated into an innerHTML class
  // (dk-card--<suit>), so coerce every incoming card to a whitelisted suit/rank
  // before it can reach the DOM. Honest peers only ever send valid cards, so
  // this is a no-op for normal play; a forged suit/rank becomes a safe known
  // value, preventing HTML/script injection (and render crashes on bad ranks).
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
    if (data.last_actor === 'room:' + mySeat) return;     // ignore our own echo
    if (aiThinkTimer) { clearTimeout(aiThinkTimer); aiThinkTimer = null; }

    var hands = data.hands || [];
    G.playerHand = cleanHand(hands[mySeat]);
    G.aiHand     = cleanHand(hands[1 - mySeat]);
    G.deck       = cleanHand(data.deck);
    G.trumpSuit  = SUITS.indexOf(data.trumpSuit) >= 0 ? data.trumpSuit : SUITS[0];
    G.trumpCard  = data.trumpCard ? cleanCard(data.trumpCard) : null;
    G.table      = (data.table || []).map(function (p) {
      return { attack: cleanCard(p.attack), defence: p.defence ? cleanCard(p.defence) : null };
    });
    G.discard         = data.discard || 0;
    // Local player is the attacker iff the attacker seat is mine.
    G.attacker        = (data.attackerSeat === mySeat) ? 'player' : 'ai';
    G.boutDefHandSize = data.boutDefHandSize != null ? data.boutDefHandSize : HAND_TARGET;
    G.phase           = data.phase || 'attack';
    if (data.winner === 'draw')      G.winner = 'draw';
    else if (data.winner === 0 || data.winner === 1) G.winner = seatToSide(data.winner);
    else                             G.winner = null;

    selectedIdx = null;
    render();
    if (G.phase === 'game-end') reportRoomWin();   // loser/draw also fire (no-op after first)
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
