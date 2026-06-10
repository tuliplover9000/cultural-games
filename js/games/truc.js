/**
 * truc.js — Truc (Catalonia — 2-player heads-up bluffing card game)
 * Catalan rules per pagat.com. DOM card UI (no canvas), prefix: tu-
 *
 * SECTIONS:
 *   1.  Constants — deck, trick ranking (STRENGTH), goal
 *   2.  Card art — inline-SVG Spanish-deck faces (la pinta, pips, court cards)
 *   3.  State model (serializable blob) + helpers
 *   4.  Rules engine — trick compare, hand resolution, raise legality
 *   5.  Rendering — hands, played cards, trick history, stake, score, modal
 *   6.  Callout / overlay / status
 *   7.  Turn flow — deal → trick play → resolution → hand end → redeal
 *   8.  Betting — Truc/Retruc ladder, accept / counter-raise / fold
 *   9.  AI — hand equity, value/bluff raises, raise responses, card play
 *   10. Input — card clicks, Truc!, Fold Hand, modal buttons
 *   11. Multiplayer (RoomBridge) — full-state blob, echo suppression
 *   12. End-game hooks (Auth / Achievements) + init + tutorial
 *
 * TERMINAL-STATE AUDIT: the game ends ONLY when a score reaches >= 12 (GOAL),
 * checked after every point award. Every hand always terminates: a hand is at
 * most 3 tricks (each trick consumes one card from each 3-card hand) and
 * decideHand() always returns a winner once 3 tricks are recorded (all-tie →
 * the mà wins); folds and declined raises end the hand even earlier. Raises
 * cannot loop: each acceptance raises the stake and the stake is hard-capped
 * at 3, after which canRaise() is always false. No draw state exists.
 */
(function () {
  'use strict';

  // ── 1. Constants ────────────────────────────────────────────────────────────
  var P1 = 'P1', P2 = 'P2';            // P1 = seat 0 (human in solo), P2 = AI/opponent
  var SUITS = ['oros', 'copes', 'espases', 'bastos'];
  var RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];   // 10=sota, 11=cavall, 12=rei
  // Trick ranking strongest→weakest: 3 > 2 > 1 > 12 > 11 > 10 > 7 > 6 > 5 > 4
  var STRENGTH = { 3: 10, 2: 9, 1: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1 };
  var GOAL = 12;
  var RANK_LABEL = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 10: '10', 11: '11', 12: '12' };

  // ── 2. Card art (inline SVG) ────────────────────────────────────────────────
  var ART_BG    = '#FDFBF3';
  var ART_OUT   = '#3a2a16';
  var ART_GOLD  = '#E0A92E';
  var ART_GOLDD = '#8a6010';
  var ART_RED   = '#B83232';
  var ART_BLUE  = '#5b7a99';
  var ART_GREEN = '#3e7d3a';
  var ART_SKIN  = '#e8b88a';
  var ART_BROWN = '#7a4a22';
  var ART_HORSE = '#c98a4b';
  var SUIT_COLOR = { oros: ART_GOLD, copes: ART_RED, espases: ART_BLUE, bastos: ART_GREEN };

  function N(v) { return String(Math.round(v * 100) / 100); }

  // LA PINTA — the frame-line breaks that identify the suit on real Spanish
  // decks: oros unbroken, copes 1 break, espases 2 breaks, bastos 3 breaks.
  var PINTA = {
    oros:    [[10, 90]],
    copes:   [[10, 47], [53, 90]],
    espases: [[10, 34], [40, 60], [66, 90]],
    bastos:  [[10, 27], [33, 49], [55, 71], [77, 90]],
  };
  function pintaLines(suit) {
    var segs = PINTA[suit], out = '', ys = [12, 138], k, i;
    for (k = 0; k < 2; k++) {
      for (i = 0; i < segs.length; i++) {
        out += '<line x1="' + segs[i][0] + '" y1="' + ys[k] + '" x2="' + segs[i][1] +
               '" y2="' + ys[k] + '" stroke="' + ART_OUT + '" stroke-width="2"/>';
      }
    }
    return out;
  }

  function pipOros(x, y, s) {
    return '<circle cx="' + N(x) + '" cy="' + N(y) + '" r="' + N(8 * s) + '" fill="' + ART_GOLD +
           '" stroke="' + ART_GOLDD + '" stroke-width="' + N(1.4 * s) + '"/>' +
           '<circle cx="' + N(x) + '" cy="' + N(y) + '" r="' + N(4.6 * s) + '" fill="none" stroke="' +
           ART_GOLDD + '" stroke-width="' + N(s) + '"/>' +
           '<circle cx="' + N(x) + '" cy="' + N(y) + '" r="' + N(1.6 * s) + '" fill="' + ART_GOLDD + '"/>';
  }
  function pipCopes(x, y, s) {
    // chalice: bowl + red band + stem + foot
    return '<path d="M' + N(x - 7 * s) + ' ' + N(y - 7 * s) + ' L' + N(x + 7 * s) + ' ' + N(y - 7 * s) +
           ' Q' + N(x + 7 * s) + ' ' + N(y + 1.5 * s) + ' ' + N(x) + ' ' + N(y + 1.5 * s) +
           ' Q' + N(x - 7 * s) + ' ' + N(y + 1.5 * s) + ' ' + N(x - 7 * s) + ' ' + N(y - 7 * s) +
           ' Z" fill="' + ART_GOLD + '" stroke="' + ART_GOLDD + '" stroke-width="' + N(1.2 * s) + '"/>' +
           '<rect x="' + N(x - 6.4 * s) + '" y="' + N(y - 6 * s) + '" width="' + N(12.8 * s) +
           '" height="' + N(2.6 * s) + '" fill="' + ART_RED + '"/>' +
           '<rect x="' + N(x - 1.4 * s) + '" y="' + N(y + 1.5 * s) + '" width="' + N(2.8 * s) +
           '" height="' + N(4.2 * s) + '" fill="' + ART_GOLDD + '"/>' +
           '<ellipse cx="' + N(x) + '" cy="' + N(y + 6.4 * s) + '" rx="' + N(5.6 * s) + '" ry="' +
           N(1.8 * s) + '" fill="' + ART_GOLD + '" stroke="' + ART_GOLDD + '"/>';
  }
  function pipEspases(x, y, s) {
    // upward sword: blade + gold crossguard + brown grip
    return '<path d="M' + N(x) + ' ' + N(y - 10 * s) + ' L' + N(x + 2 * s) + ' ' + N(y - 3 * s) +
           ' L' + N(x + 1.3 * s) + ' ' + N(y + 3.4 * s) + ' L' + N(x - 1.3 * s) + ' ' + N(y + 3.4 * s) +
           ' L' + N(x - 2 * s) + ' ' + N(y - 3 * s) + ' Z" fill="' + ART_BLUE + '" stroke="' + ART_OUT +
           '" stroke-width="' + N(s) + '"/>' +
           '<rect x="' + N(x - 4.6 * s) + '" y="' + N(y + 3.2 * s) + '" width="' + N(9.2 * s) +
           '" height="' + N(2 * s) + '" fill="' + ART_GOLD + '" stroke="' + ART_OUT +
           '" stroke-width="' + N(0.8 * s) + '"/>' +
           '<rect x="' + N(x - 1.2 * s) + '" y="' + N(y + 5.2 * s) + '" width="' + N(2.4 * s) +
           '" height="' + N(4.4 * s) + '" fill="' + ART_BROWN + '" stroke="' + ART_OUT +
           '" stroke-width="' + N(0.8 * s) + '"/>';
  }
  function pipBastos(x, y, s) {
    // knobbly club: tapered rounded shape + bump circles
    return '<path d="M' + N(x - 1.6 * s) + ' ' + N(y - 9 * s) +
           ' Q' + N(x + 3.6 * s) + ' ' + N(y - 5 * s) + ' ' + N(x + 2.6 * s) + ' ' + N(y + 4 * s) +
           ' L' + N(x + 2 * s) + ' ' + N(y + 9 * s) + ' L' + N(x - 2 * s) + ' ' + N(y + 9 * s) +
           ' L' + N(x - 2.6 * s) + ' ' + N(y + 4 * s) +
           ' Q' + N(x - 3.6 * s) + ' ' + N(y - 5 * s) + ' ' + N(x - 1.6 * s) + ' ' + N(y - 9 * s) +
           ' Z" fill="' + ART_GREEN + '" stroke="' + ART_OUT + '" stroke-width="' + N(1.2 * s) + '"/>' +
           '<circle cx="' + N(x + 2.6 * s) + '" cy="' + N(y - 4.4 * s) + '" r="' + N(1.7 * s) +
           '" fill="' + ART_GREEN + '" stroke="' + ART_OUT + '"/>' +
           '<circle cx="' + N(x - 3 * s) + '" cy="' + N(y - 0.6 * s) + '" r="' + N(1.7 * s) +
           '" fill="' + ART_GREEN + '" stroke="' + ART_OUT + '"/>';
  }
  function pip(suit, x, y, s) {
    if (suit === 'oros')    return pipOros(x, y, s);
    if (suit === 'copes')   return pipCopes(x, y, s);
    if (suit === 'espases') return pipEspases(x, y, s);
    return pipBastos(x, y, s);
  }

  // Scattered pip layouts for number cards (kept within x 25–75, y 30–120).
  var PIP_LAYOUT = {
    1: [[50, 75, 2]],
    2: [[50, 52, 1.2], [50, 98, 1.2]],
    3: [[50, 45, 1.1], [50, 75, 1.1], [50, 105, 1.1]],
    4: [[35, 50, 1.1], [65, 50, 1.1], [35, 100, 1.1], [65, 100, 1.1]],
    5: [[35, 48, 1], [65, 48, 1], [35, 102, 1], [65, 102, 1], [50, 75, 1.1]],
    6: [[35, 45, 1], [35, 75, 1], [35, 105, 1], [65, 45, 1], [65, 75, 1], [65, 105, 1]],
    7: [[35, 45, 0.95], [35, 75, 0.95], [35, 105, 0.95],
        [65, 45, 0.95], [65, 75, 0.95], [65, 105, 0.95], [50, 57, 0.95]],
  };

  // Court cards — simplified, bold, readable at 64px height.
  function faceSota(suit) {              // standing page with hat + suit pip in hand
    var c = SUIT_COLOR[suit];
    return '<path d="M43 36 L57 36 L55 27 L45 27 Z" fill="' + ART_RED + '" stroke="' + ART_OUT + '" stroke-width="2"/>' +
           '<line x1="40" y1="36" x2="60" y2="36" stroke="' + ART_OUT + '" stroke-width="2"/>' +
           '<circle cx="50" cy="46" r="9" fill="' + ART_SKIN + '" stroke="' + ART_OUT + '" stroke-width="2"/>' +
           '<path d="M39 57 L61 57 L66 96 L34 96 Z" fill="' + c + '" stroke="' + ART_OUT + '" stroke-width="2"/>' +
           '<line x1="36" y1="78" x2="64" y2="78" stroke="' + ART_OUT + '" stroke-width="1.5" opacity="0.5"/>' +
           '<line x1="44" y1="96" x2="43" y2="116" stroke="' + ART_BROWN + '" stroke-width="5"/>' +
           '<line x1="56" y1="96" x2="57" y2="116" stroke="' + ART_BROWN + '" stroke-width="5"/>' +
           '<line x1="61" y1="66" x2="71" y2="74" stroke="' + ART_SKIN + '" stroke-width="4"/>' +
           pip(suit, 73, 80, 0.6);
  }
  function faceCavall(suit) {            // horse profile (neck, head, mane) + rider
    var c = SUIT_COLOR[suit];
    return '<path d="M30 92 Q22 96 24 106" fill="none" stroke="' + ART_OUT + '" stroke-width="2.5" stroke-linecap="round"/>' +   // tail
           '<path d="M30 92 Q32 84 44 84 L60 84 Q72 84 72 96 Q72 106 62 106 L40 106 Q30 106 30 92 Z" fill="' + ART_HORSE +
           '" stroke="' + ART_OUT + '" stroke-width="2"/>' +                                                                       // body
           '<path d="M60 86 Q64 72 62 60 L74 62 Q76 74 72 88 Z" fill="' + ART_HORSE +
           '" stroke="' + ART_OUT + '" stroke-width="2"/>' +                                                                       // neck
           '<path d="M62 62 L74 60 Q84 62 86 68 Q84 72 76 71 Q66 70 62 66 Z" fill="' + ART_HORSE +
           '" stroke="' + ART_OUT + '" stroke-width="2"/>' +                                                                       // head/muzzle
           '<path d="M65 60 L68 51 L72 59 Z" fill="' + ART_HORSE + '" stroke="' + ART_OUT + '" stroke-width="1.5"/>' +             // ear
           '<circle cx="73" cy="65" r="1.6" fill="' + ART_OUT + '"/>' +                                                            // eye
           '<path d="M63 58 Q59 66 61 74 Q57 80 59 86" fill="none" stroke="' + ART_OUT + '" stroke-width="2" opacity="0.6"/>' +    // mane
           '<line x1="36" y1="104" x2="35" y2="122" stroke="#6b4520" stroke-width="3"/>' +
           '<line x1="46" y1="106" x2="46" y2="122" stroke="#6b4520" stroke-width="3"/>' +
           '<line x1="58" y1="106" x2="58" y2="122" stroke="#6b4520" stroke-width="3"/>' +
           '<line x1="66" y1="104" x2="68" y2="122" stroke="#6b4520" stroke-width="3"/>' +                                         // legs
           '<path d="M41 66 L55 66 L53 86 L43 86 Z" fill="' + c + '" stroke="' + ART_OUT + '" stroke-width="2"/>' +                // rider torso
           '<circle cx="48" cy="58" r="6" fill="' + ART_SKIN + '" stroke="' + ART_OUT + '" stroke-width="2"/>' +                   // rider head
           '<path d="M42 56 Q48 49 54 56" fill="none" stroke="' + ART_RED + '" stroke-width="3" stroke-linecap="round"/>' +        // cap
           '<line x1="43" y1="70" x2="34" y2="63" stroke="' + ART_SKIN + '" stroke-width="3.5" stroke-linecap="round"/>' +         // arm
           pip(suit, 29, 57, 0.55);
  }
  function faceRei(suit) {               // standing king: crown, beard, long robe
    var c = SUIT_COLOR[suit];
    return '<path d="M40 40 L40 31 L45 37 L50 29 L55 37 L60 31 L60 40 Z" fill="' + ART_GOLD +
           '" stroke="' + ART_OUT + '" stroke-width="2"/>' +
           '<circle cx="50" cy="50" r="9" fill="' + ART_SKIN + '" stroke="' + ART_OUT + '" stroke-width="2"/>' +
           '<path d="M43 53 Q50 63 57 53 L56 58 Q50 65 44 58 Z" fill="#e8e0d0" stroke="' + ART_OUT +
           '" stroke-width="1.5"/>' +
           '<path d="M37 62 L63 62 L69 114 L31 114 Z" fill="' + c + '" stroke="' + ART_OUT + '" stroke-width="2"/>' +
           '<rect x="33" y="104" width="34" height="6" fill="' + ART_GOLD + '" stroke="' + ART_OUT +
           '" stroke-width="1"/>' +
           '<line x1="62" y1="68" x2="72" y2="54" stroke="' + ART_SKIN + '" stroke-width="4"/>' +
           pip(suit, 74, 46, 0.6);
  }

  function middleArt(rank, suit) {
    if (rank === 10) return faceSota(suit);
    if (rank === 11) return faceCavall(suit);
    if (rank === 12) return faceRei(suit);
    var lay = PIP_LAYOUT[rank], out = '', i;
    for (i = 0; i < lay.length; i++) out += pip(suit, lay[i][0], lay[i][1], lay[i][2]);
    return out;
  }
  function cornerIndex(rank, suit) {
    return '<text x="8" y="28" font-size="16" font-weight="bold" font-family="Georgia, serif" fill="' +
           SUIT_COLOR[suit] + '" stroke="' + ART_OUT + '" stroke-width="0.4">' + RANK_LABEL[rank] + '</text>' +
           pip(suit, 14, 42, 0.45);
  }
  // All strings here are internal constants — innerHTML-safe by construction.
  function cardSVG(rank, suit) {
    return '<svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
           '<rect x="0" y="0" width="100" height="150" rx="8" fill="' + ART_BG + '"/>' +
           pintaLines(suit) +
           cornerIndex(rank, suit) +
           '<g transform="rotate(180 50 75)">' + cornerIndex(rank, suit) + '</g>' +
           middleArt(rank, suit) +
           '</svg>';
  }

  // ── 3. State model ──────────────────────────────────────────────────────────
  var state;
  function freshState() {
    return {
      hands: { P1: [], P2: [] },         // remaining hand cards: [{r, s}, …]
      played: { P1: null, P2: null },    // current trick's face-up cards
      trickResults: [],                  // 'P1' | 'P2' | 'tie' per resolved trick
      leader: P1,                        // who leads the current trick
      turn: null,                        // whose turn to play a card (null = resolving)
      dealer: P2,                        // first hand of every game: P2 deals → P1 is mà
      stake: 1,                          // current accepted value of the hand (1/2/3)
      pendingRaise: null,                // null | {by: 'P1'|'P2', to: 2|3}
      raiseRight: 'both',                // 'both' | 'P1' | 'P2' — who may raise next
      scores: { P1: 0, P2: 0 },
      handOver: true,
      winner: null,
      last_actor: null,
    };
  }
  function other(p) { return p === P1 ? P2 : P1; }
  function maPlayer() { return other(state.dealer); }   // mà = non-dealer

  // Mode flags
  var vsAI = true;
  var vsRoom = false;
  var mySeat = 0;
  var myPlayer = P1;
  var winReported = false;
  var ended = false;          // end-screen / achievements fired once guard
  var aiBluffing = false;     // AI bluff-raised this hand (drives its card play)

  // Generation counter — bumped on newGame / newHand-reset / room overwrite so
  // stale AI/flow timers never fire into a fresh state.
  var gen = 0;
  var aiTimer = null, flowTimer = null, modalTimer = null, calloutTimer = null;
  function clearTimers() {
    if (aiTimer)    { clearTimeout(aiTimer);    aiTimer = null; }
    if (flowTimer)  { clearTimeout(flowTimer);  flowTimer = null; }
    if (modalTimer) { clearTimeout(modalTimer); modalTimer = null; }
  }
  function scheduleFlow(delay, fn) {
    var myGen = gen;
    if (flowTimer) clearTimeout(flowTimer);
    flowTimer = setTimeout(function () {
      flowTimer = null;
      if (myGen !== gen || !state) return;
      fn();
    }, delay);
  }
  function scheduleAITimer(delay, fn) {
    var myGen = gen;
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = setTimeout(function () {
      aiTimer = null;
      if (myGen !== gen || !state) return;
      fn();
    }, delay);
  }
  function aiDelay() { return 550 + Math.floor(Math.random() * 350); }

  // One-shot render animation flags (consumed per render)
  var anim = { deal: false, thrownYou: false, thrownOpp: false };
  var modalHold = false;      // delay the raise modal until the callout lands

  // Element refs (filled in init)
  var els = {};

  function isSpectator() {
    return !!(vsRoom && window.RoomBridge && RoomBridge.isSpectator && RoomBridge.isSpectator());
  }
  // Is side p driven by a local human?
  function isLocalSide(p) {
    if (vsRoom) return p === myPlayer && !isSpectator();
    if (vsAI) return p === P1;
    return true;              // hotseat: both sides local
  }
  function opponentWord() {
    return vsRoom ? 'Opponent' : (vsAI ? 'Player 2 (AI)' : 'Player 2');
  }
  function sideLabel(p) { return p === myPlayer ? 'You' : opponentWord(); }
  function setActor() {
    state.last_actor = vsRoom ? ('room:' + mySeat) : 'local';
  }

  // ── 4. Rules engine ─────────────────────────────────────────────────────────
  function buildDeck() {
    var deck = [], i, j, t, si, ri;
    for (si = 0; si < SUITS.length; si++) {
      for (ri = 0; ri < RANKS.length; ri++) deck.push({ r: RANKS[ri], s: SUITS[si] });
    }
    for (i = deck.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  // Hand resolution — checked after EVERY completed trick (see audit above):
  //  • any tie + any decided trick → winner of the FIRST decided trick
  //  • a player with 2 trick wins → that player
  //  • 3 tricks, all tied → the mà (non-dealer)
  //  • otherwise null (play continues)
  function decideHand(res) {
    var hasTie = false, first = null, w = { P1: 0, P2: 0 }, i, r;
    for (i = 0; i < res.length; i++) {
      r = res[i];
      if (r === 'tie') hasTie = true;
      else { if (!first) first = r; w[r]++; }
    }
    if (hasTie && first) return first;
    if (w.P1 >= 2) return P1;
    if (w.P2 >= 2) return P2;
    if (res.length === 3) return maPlayer();   // all three tied
    return null;
  }
  function firstDecidedWinner() {
    var i;
    for (i = 0; i < state.trickResults.length; i++) {
      if (state.trickResults[i] !== 'tie') return state.trickResults[i];
    }
    return null;
  }

  // A raise may be made only by the player whose turn it is to play a card,
  // before playing it, while no other raise is pending, below the cap, and
  // only if they hold the raise right.
  function canRaise(p) {
    return !!(state && !state.winner && !state.handOver && !state.pendingRaise &&
              state.turn === p && state.stake < 3 &&
              (state.raiseRight === 'both' || state.raiseRight === p));
  }
  function canPlayLocal(p) {
    return !!(state && !state.winner && !state.handOver && !state.pendingRaise &&
              state.turn === p && isLocalSide(p));
  }

  // ── 5. Rendering ────────────────────────────────────────────────────────────
  function cardDiv(card, extraClass) {
    var d = document.createElement('div');
    d.className = 'tu-card' + (extraClass ? ' ' + extraClass : '');
    d.innerHTML = cardSVG(card.r, card.s);
    return d;
  }

  function renderOppHand() {
    var oppP = other(myPlayer);
    var el = els.oppHand;
    if (!el) return;
    el.innerHTML = '';
    var n = state.hands[oppP].length, i, d;
    for (i = 0; i < n; i++) {
      d = document.createElement('div');
      d.className = 'tu-card tu-card--back' + (anim.deal ? ' tu-card--dealt' : '');
      if (anim.deal) d.style.animationDelay = (i * 0.08) + 's';
      // Hotseat: Player 2 plays by tapping their face-down cards.
      if (!vsRoom && !vsAI) {
        (function (idx) {
          d.addEventListener('click', function () {
            if (canPlayLocal(oppP)) playCard(oppP, idx);
          });
        }(i));
      }
      el.appendChild(d);
    }
  }

  function renderMyHand() {
    var el = els.hand;
    if (!el) return;
    el.innerHTML = '';
    var hand = state.hands[myPlayer];
    var playable = canPlayLocal(myPlayer);
    var i, d;
    for (i = 0; i < hand.length; i++) {
      d = cardDiv(hand[i], (playable ? 'tu-card--playable' : '') + (anim.deal ? ' tu-card--dealt' : ''));
      if (anim.deal) d.style.animationDelay = (i * 0.08) + 's';
      d.setAttribute('role', 'button');
      d.setAttribute('aria-label', 'Play card');
      (function (idx) {
        d.addEventListener('click', function () {
          if (canPlayLocal(myPlayer)) playCard(myPlayer, idx);
        });
      }(i));
      el.appendChild(d);
    }
  }

  function renderPlayed() {
    var oppP = other(myPlayer);
    if (els.playedOpp) {
      els.playedOpp.innerHTML = '';
      if (state.played[oppP]) {
        els.playedOpp.appendChild(cardDiv(state.played[oppP], anim.thrownOpp ? 'tu-card--thrown' : ''));
      }
    }
    if (els.playedYou) {
      els.playedYou.innerHTML = '';
      if (state.played[myPlayer]) {
        els.playedYou.appendChild(cardDiv(state.played[myPlayer], anim.thrownYou ? 'tu-card--thrown' : ''));
      }
    }
  }

  function renderTricks() {
    var el = els.trickHistory;
    if (!el) return;
    el.innerHTML = '';
    var i, r, d, cls, word;
    for (i = 0; i < state.trickResults.length; i++) {
      r = state.trickResults[i];
      d = document.createElement('div');
      if (r === 'tie') { cls = 'tu-trick-dot--tie'; word = 'Empat'; }
      else if (r === myPlayer) { cls = 'tu-trick-dot--you'; word = 'You'; }
      else { cls = 'tu-trick-dot--opp'; word = opponentWord(); }
      d.className = 'tu-trick-dot ' + cls;
      d.title = 'Trick ' + (i + 1) + ': ' + (r === 'tie' ? 'tied' : word);
      d.appendChild(document.createTextNode(word));
      el.appendChild(d);
    }
  }

  function updateStake() {
    if (els.stake) els.stake.textContent = 'Val ' + state.stake;
  }

  function updateScore() {
    var oppP = other(myPlayer);
    var ma = maPlayer();
    if (els.score) {
      els.score.innerHTML =
        '<span class="tu-score__you">You: ' + state.scores[myPlayer] +
          (ma === myPlayer ? ' (mà)' : '') + '</span>' +
        '<span class="tu-score__ai">' + opponentWord() + ': ' + state.scores[oppP] +
          (ma === oppP ? ' (mà)' : '') + '</span>';
    }
    if (els.oppLabel) {
      els.oppLabel.textContent = opponentWord() + (ma === oppP ? ' (mà)' : '');
    }
  }

  function updateControls() {
    var p = state ? state.turn : null;
    var raiseOk = !!(p && isLocalSide(p) && canRaise(p));
    if (els.trucBtn) {
      els.trucBtn.textContent = (state && state.stake >= 2) ? 'Retruc!' : 'Truc!';
      els.trucBtn.disabled = !raiseOk;
      if (raiseOk) els.trucBtn.classList.add('tu-truc-btn--hot');
      else els.trucBtn.classList.remove('tu-truc-btn--hot');
    }
    if (els.foldBtn) {
      els.foldBtn.disabled = !(state && !state.winner && !state.handOver &&
                               !state.pendingRaise && p && isLocalSide(p));
    }
  }

  // Raise modal — shown only to the LOCAL human who must answer a raise.
  function updateModal() {
    if (!els.raiseModal) return;
    var pr = state ? state.pendingRaise : null;
    var show = !!(pr && !state.winner && !state.handOver && !modalHold &&
                  isLocalSide(other(pr.by)));
    if (!show) { els.raiseModal.hidden = true; return; }
    if (els.raiseText) {
      els.raiseText.textContent = sideLabel(pr.by) + (pr.by === myPlayer ? ' call ' : ' calls ') +
        (pr.to === 2 ? 'TRUC' : 'RETRUC') + '! Play for ' + pr.to + ' points?';
    }
    // Counter-raising is only legal as a retruc answer to a truc (to === 2).
    if (els.reraiseBtn) els.reraiseBtn.style.display = (pr.to === 2) ? '' : 'none';
    els.raiseModal.hidden = false;
  }
  function hideModal() {
    if (els.raiseModal) els.raiseModal.hidden = true;
  }

  function renderAll() {
    if (!state) return;
    updateScore();
    renderOppHand();
    renderMyHand();
    renderPlayed();
    renderTricks();
    updateStake();
    updateControls();
    updateModal();
    anim.deal = false;
    anim.thrownYou = false;
    anim.thrownOpp = false;
  }

  // ── 6. Callout / overlay / status ───────────────────────────────────────────
  function setStatus(msg) {
    if (els.status) els.status.textContent = msg;
  }
  function refreshStatus() {
    if (!state || state.winner || state.handOver) return;
    var pr = state.pendingRaise;
    if (pr) {
      if (isLocalSide(other(pr.by))) {
        setStatus(sideLabel(pr.by) + (pr.by === myPlayer ? ' call ' : ' calls ') +
          (pr.to === 2 ? 'TRUC' : 'RETRUC') + '! Respond.');
      } else {
        setStatus('Waiting for ' + sideLabel(other(pr.by)) + ' to answer the ' +
          (pr.to === 2 ? 'Truc' : 'Retruc') + '…');
      }
      return;
    }
    if (!state.turn) return;                 // trick resolving — keep last message
    if (state.turn === myPlayer && isLocalSide(myPlayer)) {
      setStatus(canRaise(myPlayer)
        ? 'Your turn — play a card or call ' + (state.stake >= 2 ? 'Retruc' : 'Truc') + '!'
        : 'Your turn — play a card.');
    } else if (isLocalSide(state.turn)) {
      setStatus(sideLabel(state.turn) + '’s turn — tap a face-down card to play it.');
    } else {
      setStatus(vsRoom ? 'Waiting for ' + opponentWord() + '…'
                       : opponentWord() + ' is thinking…');
    }
  }

  function showCallout(text) {
    var el = els.callout;
    if (!el) return;
    if (calloutTimer) { clearTimeout(calloutTimer); calloutTimer = null; }
    el.classList.remove('tu-callout--show');
    el.textContent = text;
    void el.offsetWidth;                     // force reflow so the animation retriggers
    el.classList.add('tu-callout--show');
    calloutTimer = setTimeout(function () {
      calloutTimer = null;
      el.classList.remove('tu-callout--show');
    }, 900);
  }
  function clearCallout() {
    if (calloutTimer) { clearTimeout(calloutTimer); calloutTimer = null; }
    if (els.callout) {
      els.callout.classList.remove('tu-callout--show');
      els.callout.textContent = '';
    }
  }

  function showOverlay(winner) {
    var title, sub;
    if (winner === myPlayer) {
      title = 'You Win!';
      sub = state.scores[winner] + ' points — la cama és teva.';
    } else if (vsRoom || vsAI) {
      title = 'You Lost';
      sub = opponentWord() + ' reaches ' + state.scores[winner] + ' points first.';
    } else {
      title = 'Player 2 Wins!';
      sub = state.scores[winner] + ' points — la cama és seva.';
    }
    if (els.overlayTitle) els.overlayTitle.textContent = title;
    if (els.overlaySub)   els.overlaySub.textContent = sub;
    if (els.overlay)      els.overlay.classList.add('active');
    setStatus(title);
  }
  function hideOverlay() {
    if (els.overlay) els.overlay.classList.remove('active');
  }

  // ── 7. Turn flow ────────────────────────────────────────────────────────────
  // Deal 3 cards each, one at a time starting with the non-dealer (the mà).
  function newHand(keepDealer) {
    if (!state || state.winner) return;
    if (!keepDealer) state.dealer = other(state.dealer);
    var deck = buildDeck();
    var nd = other(state.dealer);
    var hands = { P1: [], P2: [] }, i;
    for (i = 0; i < 6; i++) hands[(i % 2 === 0) ? nd : state.dealer].push(deck.pop());
    state.hands = hands;
    state.played = { P1: null, P2: null };
    state.trickResults = [];
    state.leader = nd;                       // mà leads trick 1
    state.turn = nd;
    state.stake = 1;
    state.pendingRaise = null;
    state.raiseRight = 'both';
    state.handOver = false;
    aiBluffing = false;
    modalHold = false;
    hideModal();
    anim.deal = true;
    setActor();
    if (vsRoom) syncRoom();
    if (window.SFX && SFX.roll) SFX.roll();
    renderAll();
    refreshStatus();
    maybeScheduleAI();
  }

  function playCard(p, idx) {
    if (!state || state.winner || state.handOver || state.pendingRaise) return;
    if (state.turn !== p) return;
    if (idx < 0 || idx >= state.hands[p].length) return;
    var card = state.hands[p].splice(idx, 1)[0];
    state.played[p] = card;
    if (p === myPlayer) anim.thrownYou = true; else anim.thrownOpp = true;
    if (window.SFX && SFX.place) SFX.place();
    var oppP = other(p);
    if (state.played[oppP]) {
      state.turn = null;                     // both down — lock input while resolving
      setActor();
      if (vsRoom) syncRoom();
      renderAll();
      scheduleFlow(900, resolveTrick);       // the client that completed the trick resolves it
    } else {
      state.turn = oppP;
      setActor();
      if (vsRoom) syncRoom();
      renderAll();
      refreshStatus();
      maybeScheduleAI();
    }
  }

  function resolveTrick() {
    if (!state || state.winner || state.handOver) return;
    var a = state.played[P1], b = state.played[P2];
    if (!a || !b) return;
    var sa = STRENGTH[a.r], sb = STRENGTH[b.r];
    var res;
    if (sa === sb) {
      res = 'tie';                           // empat: nobody wins, same leader leads again
    } else {
      res = (sa > sb) ? P1 : P2;
      state.leader = res;                    // trick winner leads next
      if (window.SFX && SFX.capture) SFX.capture();
    }
    state.trickResults.push(res);
    state.played = { P1: null, P2: null };
    state.turn = state.leader;

    var hw = decideHand(state.trickResults);
    if (hw) {
      var pts = state.stake;
      finishHand(hw, pts, true);
      if (!state.winner) {
        setStatus(hw === myPlayer
          ? 'You won the hand (+' + pts + '). New deal…'
          : sideLabel(hw) + ' wins the hand (+' + pts + '). New deal…');
      }
      return;
    }
    setActor();
    if (vsRoom) syncRoom();
    renderAll();
    if (res === 'tie') {
      setStatus('Trick tied — ' +
        (state.leader === myPlayer ? 'you lead' : sideLabel(state.leader) + ' leads') + ' again.');
    } else {
      setStatus(res === myPlayer ? 'You won the trick!' : sideLabel(res) + ' won the trick.');
    }
    // After the trick-result beat, restore the turn prompt (same lingering-status
    // pattern as the Vull! message in applyAccept).
    var myGen = gen;
    setTimeout(function () {
      if (myGen !== gen || !state || state.winner || state.handOver || state.pendingRaise) return;
      refreshStatus();
    }, 1300);
    maybeScheduleAI();
  }

  // Award pts to winner and end the hand. playedOut=true means the hand was
  // decided by the cards (not a fold). Game ends only here, at score >= GOAL.
  function finishHand(winner, pts, playedOut) {
    state.handOver = true;
    state.pendingRaise = null;
    state.turn = null;
    state.scores[winner] += pts;
    if (state.scores[winner] >= GOAL) state.winner = winner;
    hideModal();
    // tu_retruc_win: local player wins a hand that was PLAYED OUT at stake 3.
    if (playedOut && pts === 3 && winner === myPlayer && !isSpectator() && window.Achievements) {
      Achievements.checkAction('tu_retruc_win');
    }
    setActor();
    if (vsRoom) syncRoom();                  // syncRoom also fires reportWin once
    renderAll();
    if (state.winner) { endGame(state.winner); return; }
    scheduleFlow(1400, function () { newHand(false); });
  }

  // ── 8. Betting — the TRUC ladder ────────────────────────────────────────────
  function callRaise(p) {
    if (!canRaise(p)) return;
    state.pendingRaise = { by: p, to: state.stake + 1 };
    showCallout(state.pendingRaise.to === 2 ? 'TRUC!' : 'RETRUC!');
    setActor();
    if (vsRoom) syncRoom();
    armResponse(p);
    renderAll();
  }

  // After p raises (or counter-raises), arrange for the other side to answer.
  function armResponse(p) {
    var resp = other(p);
    if (isLocalSide(resp)) {
      // A local human answers via the modal — hold it until the callout lands.
      modalHold = true;
      var myGen = gen;
      if (modalTimer) clearTimeout(modalTimer);
      modalTimer = setTimeout(function () {
        modalTimer = null;
        if (myGen !== gen) return;
        modalHold = false;
        updateModal();
        refreshStatus();
      }, 700);
      refreshStatus();
    } else if (!vsRoom && vsAI && resp === P2) {
      setStatus('Waiting…');
      scheduleAITimer(650, aiRespondRaise);
    } else {
      setStatus('Waiting for ' + sideLabel(resp) + '…');
    }
  }

  // ACCEPT: stake becomes the raised value; the accepter alone may raise next.
  function applyAccept(q) {
    if (!state.pendingRaise) return;
    state.stake = state.pendingRaise.to;
    state.pendingRaise = null;
    state.raiseRight = q;
    modalHold = false;
    hideModal();
    setActor();
    if (vsRoom) syncRoom();
    renderAll();
    setStatus((q === myPlayer ? 'Vull! ' : sideLabel(q) + ': Vull! ') + 'Val ' + state.stake + '.');
    // After the "Vull!" beat, restore the turn prompt so the player knows
    // play has resumed (otherwise the accept message lingers indefinitely).
    var myGen = gen;
    setTimeout(function () {
      if (myGen !== gen || !state || state.winner || state.handOver || state.pendingRaise) return;
      refreshStatus();
    }, 1200);
    maybeScheduleAI();
  }

  // COUNTER-RAISE: answering a truc with retruc implies accepting the truc;
  // the decision passes back to the original raiser (accept 3 or fold for 2).
  function applyReraise(q) {
    if (!state.pendingRaise || state.pendingRaise.to !== 2) return;
    state.stake = 2;
    state.raiseRight = q;
    state.pendingRaise = { by: q, to: 3 };
    modalHold = false;
    hideModal();
    showCallout('RETRUC!');
    setActor();
    if (vsRoom) syncRoom();
    armResponse(q);
    renderAll();
  }

  // FOLD / decline: the hand ends instantly; the raiser scores the stake in
  // effect BEFORE the raise (state.stake is only bumped on acceptance).
  function applyFold(q) {
    if (!state.pendingRaise) return;
    var raiser = state.pendingRaise.by;
    var pts = state.stake;
    // tu_fold_steal: the opponent folded to the LOCAL player's truc/retruc.
    if (raiser === myPlayer && q !== myPlayer && !isSpectator() && window.Achievements) {
      Achievements.checkAction('tu_fold_steal');
    }
    modalHold = false;
    finishHand(raiser, pts, false);
    if (!state.winner) {
      setStatus(q === myPlayer
        ? 'No vull — you fold. ' + sideLabel(raiser) + ' scores ' + pts + '.'
        : sideLabel(q) + ' folds — ' +
          (raiser === myPlayer ? 'you score ' + pts + '!' : sideLabel(raiser) + ' scores ' + pts + '.'));
    }
  }

  // FOLD HAND button: concede on your turn (never while your own raise pends —
  // the button is disabled whenever any raise is pending).
  function foldHandConcede() {
    if (!state || state.winner || state.handOver || state.pendingRaise) return;
    var p = state.turn;
    if (!p || !isLocalSide(p)) return;
    var oppP = other(p);
    var pts = state.stake;
    finishHand(oppP, pts, false);
    if (!state.winner) {
      setStatus((p === myPlayer ? 'No vull — you fold the hand. ' : sideLabel(p) + ' folds. ') +
        (oppP === myPlayer ? 'You score ' + pts + '!' : sideLabel(oppP) + ' scores ' + pts + '.'));
    }
  }

  // ── 9. AI — the bluffing brain ──────────────────────────────────────────────
  // Hand equity from the AI's top two remaining cards plus situation bonuses.
  function aiEquity() {
    var hs = [], i;
    for (i = 0; i < state.hands.P2.length; i++) hs.push(STRENGTH[state.hands.P2[i].r]);
    hs.sort(function (a, b) { return b - a; });
    var s1 = hs.length > 0 ? hs[0] : 0;
    var s2 = hs.length > 1 ? hs[1] : 0;
    var e = (s1 * 1.4 + s2) / 24;
    if (maPlayer() === P2) e += 0.06;          // mà wins all-tie hands
    var fd = firstDecidedWinner();
    if (fd === P2) e += 0.10;
    else if (fd === P1) e -= 0.12;
    if (e < 0.05) e = 0.05;
    if (e > 0.95) e = 0.95;
    return e;
  }

  // Raise decision at the AI's turn, before playing: value bets and bluffs.
  function aiDecideRaise() {
    var e = aiEquity();
    if (e > 0.62) return (Math.random() < 0.8) ? 'value' : null;
    if (e < 0.35) {
      var p = 0.18 +
        ((state.scores.P1 - state.scores.P2 >= 4) ? 0.12 : 0) +
        ((maPlayer() === P2 && state.trickResults.length === 0) ? 0.06 : 0);
      return (Math.random() < p) ? 'bluff' : null;
    }
    return null;
  }

  // Answer a pending raise from the human.
  function aiRespondRaise() {
    if (!vsAI || vsRoom || !state || state.winner || state.handOver) return;
    if (!state.pendingRaise || state.pendingRaise.by !== P1) return;
    var e = aiEquity();
    var to = state.pendingRaise.to;
    var acc = (to === 2) ? 0.45 : 0.50;
    if (state.scores.P1 >= 10) acc -= 0.08;                       // desperation
    if (state.scores.P2 >= 10 && state.scores.P1 <= 2) acc += 0.08; // protect a big lead
    if (to === 2 && e > 0.7 && Math.random() < 0.6) { applyReraise(P2); return; }
    if (e > acc) { applyAccept(P2); return; }
    applyFold(P2);
  }

  function aiHandIdxBy(pickFn) {
    var hand = state.hands.P2, best = 0, i;
    for (i = 1; i < hand.length; i++) {
      if (pickFn(STRENGTH[hand[i].r], STRENGTH[hand[best].r])) best = i;
    }
    return best;
  }
  function aiWeakestIdx()   { return aiHandIdxBy(function (a, b) { return a < b; }); }
  function aiStrongestIdx() { return aiHandIdxBy(function (a, b) { return a > b; }); }
  function aiMiddleIdx() {
    var hand = state.hands.P2;
    if (hand.length < 3) return aiStrongestIdx();
    var order = [0, 1, 2];
    order.sort(function (a, b) { return STRENGTH[hand[b].r] - STRENGTH[hand[a].r]; });
    return order[1];
  }

  function aiPlayCard() {
    if (!vsAI || vsRoom || !state || state.winner || state.handOver) return;
    if (state.pendingRaise || state.turn !== P2) return;
    var hand = state.hands.P2;
    if (!hand.length) return;
    var idx, i;
    var led = state.played.P1;
    if (led) {
      // FOLLOWING: lowest card that wins; else a beneficial tie; else dump weakest.
      var ls = STRENGTH[led.r];
      var winIdx = -1, tieIdx = -1;
      for (i = 0; i < hand.length; i++) {
        var st = STRENGTH[hand[i].r];
        if (st > ls && (winIdx === -1 || st < STRENGTH[hand[winIdx].r])) winIdx = i;
        if (st === ls) tieIdx = i;
      }
      var fd = firstDecidedWinner();
      var likesTies = (fd === P2) || (maPlayer() === P2 && fd === null);
      if (winIdx !== -1) idx = winIdx;
      else if (tieIdx !== -1 && likesTies) idx = tieIdx;
      else idx = aiWeakestIdx();
    } else {
      // LEADING: dump weakest after winning a decided trick; middle card while
      // bluffing on trick 1; otherwise lead the strongest.
      if (firstDecidedWinner() === P2) idx = aiWeakestIdx();
      else if (aiBluffing && state.trickResults.length === 0) idx = aiMiddleIdx();
      else idx = aiStrongestIdx();
    }
    playCard(P2, idx);
  }

  function aiTakeTurn() {
    if (!vsAI || vsRoom || !state || state.winner || state.handOver) return;
    if (state.pendingRaise || state.turn !== P2) return;
    if (canRaise(P2)) {
      var d = aiDecideRaise();
      if (d) {
        if (d === 'bluff') aiBluffing = true;
        callRaise(P2);
        return;                              // play resumes once the human answers
      }
    }
    aiPlayCard();
  }

  // Every AI code path ends in an action or a wait on human input — the AI can
  // never hang the hand. Stale timers are killed by the gen counter.
  function maybeScheduleAI() {
    if (!vsAI || vsRoom || !state || state.winner || state.handOver) return;
    if (state.pendingRaise) {
      if (state.pendingRaise.by === P1) scheduleAITimer(aiDelay(), aiRespondRaise);
      return;                                // raise by P2 → human modal is up
    }
    if (state.turn !== P2) return;
    scheduleAITimer(aiDelay(), aiTakeTurn);
  }

  // ── 10. Input ───────────────────────────────────────────────────────────────
  function onTrucClick() {
    if (!state) return;
    var p = state.turn;
    if (!p || !isLocalSide(p) || !canRaise(p)) return;
    callRaise(p);
  }
  function onAcceptClick() {
    if (!state || !state.pendingRaise) return;
    var resp = other(state.pendingRaise.by);
    if (!isLocalSide(resp)) return;
    applyAccept(resp);
  }
  function onReraiseClick() {
    if (!state || !state.pendingRaise || state.pendingRaise.to !== 2) return;
    var resp = other(state.pendingRaise.by);
    if (!isLocalSide(resp)) return;
    applyReraise(resp);
  }
  function onDeclineClick() {
    if (!state || !state.pendingRaise) return;
    var resp = other(state.pendingRaise.by);
    if (!isLocalSide(resp)) return;
    applyFold(resp);
  }

  function newGame() {
    gen++;                       // invalidate every pending AI/flow timer
    clearTimers();
    clearCallout();
    hideModal();
    hideOverlay();
    state = freshState();
    state.dealer = P2;           // first hand: P2 deals, P1 is mà and leads
    ended = false;
    winReported = false;
    aiBluffing = false;
    modalHold = false;
    if (vsRoom && window.RoomBridge && RoomBridge.resetWin) RoomBridge.resetWin();
    newHand(true);               // keep the P2 dealer for the opening hand
  }

  // ── 11. Multiplayer (RoomBridge) ────────────────────────────────────────────
  // Full-state blob published after every resolved event (deal, card play,
  // trick resolution, raise call/response, hand end, game end, rematch).
  // last_actor carries our seat for echo suppression; the incoming blob is the
  // source of truth and fully overwrites local state.
  function syncRoom() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState({
      hands: { P1: state.hands.P1.slice(), P2: state.hands.P2.slice() },
      played: { P1: state.played.P1, P2: state.played.P2 },
      trickResults: state.trickResults.slice(),
      leader: state.leader,
      turn: state.turn,
      dealer: state.dealer,
      stake: state.stake,
      pendingRaise: state.pendingRaise
        ? { by: state.pendingRaise.by, to: state.pendingRaise.to } : null,
      raiseRight: state.raiseRight,
      scores: { P1: state.scores.P1, P2: state.scores.P2 },
      handOver: state.handOver,
      winner: state.winner,
      last_actor: 'room:' + mySeat,
    });
    if ((state.winner === P1 || state.winner === P2) && !winReported) {
      winReported = true;
      RoomBridge.reportWin(state.winner === P1 ? 0 : 1);
    }
  }

  function receiveRoomState(data) {
    if (!data || !state) return;
    if (data.last_actor === 'room:' + mySeat) return;     // ignore our own echo
    var oppP = other(myPlayer);
    var prev = {
      scores: { P1: state.scores.P1, P2: state.scores.P2 },
      pendingRaise: state.pendingRaise,
      handOver: state.handOver,
      tricks: state.trickResults.length,
      myHandLen: state.hands[myPlayer].length,
      oppPlayed: state.played[oppP],
    };
    gen++;                                                // kill stale local timers
    clearTimers();
    modalHold = false;

    if (data.hands) state.hands = { P1: (data.hands.P1 || []).slice(), P2: (data.hands.P2 || []).slice() };
    if (data.played) state.played = { P1: data.played.P1 || null, P2: data.played.P2 || null };
    state.trickResults = (data.trickResults || []).slice();
    if (data.leader) state.leader = data.leader;
    state.turn = (data.turn === undefined) ? null : data.turn;
    if (data.dealer) state.dealer = data.dealer;
    if (data.stake) state.stake = data.stake;
    state.pendingRaise = data.pendingRaise
      ? { by: data.pendingRaise.by, to: data.pendingRaise.to } : null;
    if (data.raiseRight) state.raiseRight = data.raiseRight;
    if (data.scores) state.scores = { P1: data.scores.P1, P2: data.scores.P2 };
    state.handOver = !!data.handOver;
    state.winner = (data.winner === undefined) ? null : data.winner;

    // Diff-driven effects (the remote acted; we only narrate locally):
    var pr = state.pendingRaise;
    if (pr && pr.by !== myPlayer &&
        (!prev.pendingRaise || prev.pendingRaise.to !== pr.to || prev.pendingRaise.by !== pr.by)) {
      showCallout(pr.to === 2 ? 'TRUC!' : 'RETRUC!');
    }
    if (!state.handOver && state.hands[myPlayer].length === 3 && prev.myHandLen < 3) {
      anim.deal = true;                                   // a fresh deal arrived
      if (window.SFX && SFX.roll) SFX.roll();
    }
    if (state.played[oppP] && !prev.oppPlayed) {
      anim.thrownOpp = true;
      if (window.SFX && SFX.place) SFX.place();
    }
    if (state.trickResults.length > prev.tricks &&
        state.trickResults[state.trickResults.length - 1] !== 'tie') {
      if (window.SFX && SFX.capture) SFX.capture();
    }

    var handEnded = state.handOver && !prev.handOver;
    var meGain = state.scores[myPlayer] - prev.scores[myPlayer];
    var opGain = state.scores[oppP] - prev.scores[oppP];
    if (handEnded) {
      var playedOut = decideHand(state.trickResults) !== null;
      if (meGain > 0) {
        if (playedOut) {
          if (meGain === 3 && !isSpectator() && window.Achievements) {
            Achievements.checkAction('tu_retruc_win');    // mirrored remote-resolution path
          }
          setStatus('You won the hand (+' + meGain + '). New deal…');
        } else {
          // Opponent folded — to our raise (steal) or by conceding the hand.
          if (prev.pendingRaise && prev.pendingRaise.by === myPlayer &&
              !isSpectator() && window.Achievements) {
            Achievements.checkAction('tu_fold_steal');
          }
          setStatus(opponentWord() + ' folds — you score ' + meGain + '!');
        }
      } else if (opGain > 0) {
        setStatus(playedOut
          ? opponentWord() + ' wins the hand (+' + opGain + ').'
          : 'Folded — ' + opponentWord() + ' scores ' + opGain + '.');
      }
    }

    renderAll();
    if (state.winner === P1 || state.winner === P2) {
      endGame(state.winner);                              // once-guarded internally
    } else {
      ended = false;
      hideOverlay();
      if (!handEnded) refreshStatus();
    }
  }

  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive || !RoomBridge.isActive()) return;
    vsRoom = true;
    vsAI = false;
    mySeat = RoomBridge.getSeat();
    myPlayer = (mySeat === 0) ? P1 : P2;     // seat 0 = P1 (mà of the first hand)
    clearTimers();

    // Hide solo-only controls; online rematch happens via the Play Again button.
    var aiLabel = document.querySelector('.tu-ai-label'); if (aiLabel) aiLabel.style.display = 'none';
    var newBtn  = document.getElementById('tu-new-btn');  if (newBtn)  newBtn.style.display  = 'none';

    RoomBridge.onState(receiveRoomState);    // also signals 'ready' → parent pushes latest state
    if (mySeat === 0) syncRoom();            // host seeds the opening deal
    renderAll();
    refreshStatus();
  }

  // ── 12. End-game hooks + init + tutorial ────────────────────────────────────
  // Outcome is always from the LOCAL player's perspective.
  function endGame(winner) {
    state.winner = winner;
    clearTimers();
    hideModal();
    if (ended) { showOverlay(winner); return; }
    ended = true;
    var outcome = (winner === myPlayer) ? 'win' : 'loss';
    if (window.Achievements && !isSpectator()) {
      // tu_shutout_win: won the game 12–0 (opponent never scored).
      if (outcome === 'win' && state.scores[other(myPlayer)] === 0) {
        Achievements.checkAction('tu_shutout_win');
      }
    }
    if (vsRoom) {
      // Room stats/coins flow through RoomBridge.reportWin (fired in syncRoom);
      // only evaluate online achievements locally here.
      if (window.Achievements && !isSpectator()) {
        Achievements.evaluate({
          gameId: 'truc', result: outcome, isOnline: true,
          isHost: !!(window.RoomBridge && RoomBridge.isRoomHost && RoomBridge.isRoomHost()),
        });
      }
    } else if (window.Auth && Auth.recordResult) {
      Auth.recordResult('truc', outcome);    // guest-safe; updates local stats too
    }
    showOverlay(winner);
    updateControls();
  }

  function init() {
    els = {
      score:        document.getElementById('tu-score'),
      status:       document.getElementById('tu-status'),
      oppLabel:     document.getElementById('tu-opp-label'),
      oppHand:      document.getElementById('tu-opp-hand'),
      trickHistory: document.getElementById('tu-trick-history'),
      playedOpp:    document.getElementById('tu-played-opp'),
      playedYou:    document.getElementById('tu-played-you'),
      stake:        document.getElementById('tu-stake'),
      hand:         document.getElementById('tu-hand'),
      callout:      document.getElementById('tu-callout'),
      raiseModal:   document.getElementById('tu-raise-modal'),
      raiseText:    document.getElementById('tu-raise-text'),
      acceptBtn:    document.getElementById('tu-accept-btn'),
      reraiseBtn:   document.getElementById('tu-reraise-btn'),
      declineBtn:   document.getElementById('tu-decline-btn'),
      overlay:      document.getElementById('tu-overlay'),
      overlayTitle: document.getElementById('tu-overlay-title'),
      overlaySub:   document.getElementById('tu-overlay-sub'),
      rematchBtn:   document.getElementById('tu-rematch-btn'),
      trucBtn:      document.getElementById('tu-truc-btn'),
      foldBtn:      document.getElementById('tu-fold-btn'),
      newBtn:       document.getElementById('tu-new-btn'),
      aiToggle:     document.getElementById('tu-ai-toggle'),
    };
    if (!els.hand || !els.oppHand) return;

    if (window.Achievements && Achievements.init) Achievements.init();

    if (els.trucBtn)    els.trucBtn.addEventListener('click', onTrucClick);
    if (els.foldBtn)    els.foldBtn.addEventListener('click', foldHandConcede);
    if (els.newBtn)     els.newBtn.addEventListener('click', newGame);
    if (els.rematchBtn) els.rematchBtn.addEventListener('click', newGame);
    if (els.acceptBtn)  els.acceptBtn.addEventListener('click', onAcceptClick);
    if (els.reraiseBtn) els.reraiseBtn.addEventListener('click', onReraiseClick);
    if (els.declineBtn) els.declineBtn.addEventListener('click', onDeclineClick);
    if (els.aiToggle) {
      vsAI = !!els.aiToggle.checked;
      els.aiToggle.addEventListener('change', function () {
        if (vsRoom) return;                  // forced off in rooms
        vsAI = els.aiToggle.checked;
        newGame();
      });
    }

    newGame();
    initRoomMode();                          // switches to multiplayer inside a room iframe
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Tutorial ────────────────────────────────────────────────────────────────
  if (window.CGTutorial) {
    CGTutorial.register('truc', [
      {
        target: '#tu-table',
        title: 'The Loud Game of the Catalans',
        body: 'Truc is played with a 40-card Spanish deck and exactly one rule that matters: the trick ranking. Strongest to weakest it runs 3 > 2 > 1 (ace) > rei (12) > cavall (11) > sota (10) > 7 > 6 > 5 > 4. Suits NEVER matter — a 3 of bastos beats everything except another 3.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#tu-hand',
        title: 'The Deal & the Mà',
        body: 'Each hand you get 3 cards, dealt one at a time starting with the non-dealer — called the "mà" (the hand). The mà leads the first trick, the deal alternates every hand, and being mà quietly matters: if every trick ties, the mà wins the hand.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#tu-play-area',
        title: 'Tricks & Ties',
        body: 'Play any card — there is no following suit. The stronger card wins the trick and its owner leads the next one. Equal cards TIE the trick ("empat"): nobody wins it and the same player leads again. Win 2 tricks to take the hand — but once any trick has tied, the winner of the FIRST decided trick takes the whole hand.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#tu-stake',
        title: 'Truc! and Retruc!',
        body: 'A hand starts worth 1 point ("Val 1"). On your turn, before playing a card, shout Truc! to raise it to 2. Whoever accepts a raise — "Vull!" — earns the only right to raise again: Retruc! makes it 3, the cap. Decline a raise ("No vull") and the raiser instantly scores the stake as it stood BEFORE the raise.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#tu-opp-hand',
        title: 'Reading the Bluff',
        body: 'Those cards are hidden for a reason. A Truc! can mean a monster hand — or nothing at all. Players who are far behind bet freely (they have little to lose), and a confident raise on a tied trick is the oldest trap in the game. Watch what your opponent plays, not what they shout.',
        position: 'bottom', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#tu-fold-btn',
        title: 'Knowing When to Fold',
        body: 'On your turn you may fold the whole hand and concede the current stake. Folding a 1-point hand to save yourself from losing 2 or 3 is not cowardice — it is arithmetic. The maths of folding to a raise is the heart of Truc.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
      {
        target: '#tu-truc-btn',
        title: 'First to 12',
        body: 'Points accumulate hand after hand; the first player to reach 12 wins the game ("la cama"). When the red button is pulsing, the raise is yours to make. Shout Truc! with conviction — whether or not your cards agree.',
        position: 'top', highlight: true, beforeStep: null, afterStep: null,
      },
    ]);
    CGTutorial.initTrigger('truc');
  }

}());
