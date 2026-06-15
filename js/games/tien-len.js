/**
 * tien-len.js - Tiến Lên (Vietnamese shedding card game)
 * Supports local play (vs 3 AI) and 2-player online (host + guest, 2 AI fill remaining seats).
 *
 * Online seat layout:
 *   Seat 0 = host (human)   Seat 2 = guest (human)
 *   Seat 1 = AI (left)      Seat 3 = AI (right)
 * Host is authoritative: runs AI for seats 1 & 3, syncs state after every action.
 */
(function () {
  'use strict';

  /* ── Constants ── */
  const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
  const SUITS = ['♠','♣','♦','♥'];
  const SUIT_CLR   = { '♠':'black', '♣':'black', '♦':'red', '♥':'red' };
  const SEAT_NAMES = ['You', 'Left', 'Across', 'Right'];
  const TYPE_LABEL = {
    single:'Single', pair:'Pair', triple:'Triple',
    quad:'Four of a Kind', seq:'Sequence', seqpair:'Seq. of Pairs',
  };
  const PLAYER = 0;

  /* ── Online state ── */
  let vsOnline    = false;
  let isHost      = false;
  let mySeat      = 0;    // 0 = host, 2 = guest
  let twoPlayer   = false; // 1v1 mode: seats 0 & 2 only, 26 cards each
  let aiSeatsRoom = [];    // AI-controlled seats in room mode

  // Active seats for current mode
  function activeSeats() { return twoPlayer ? [0, 2] : [0, 1, 2, 3]; }
  // Advance to next active seat
  function nextSeat(s) {
    const seats = activeSeats();
    return seats[(seats.indexOf(s) + 1) % seats.length];
  }
  // How many passes trigger a new round
  function passThreshold() { return twoPlayer ? 1 : 3; }

  // Visual position n (0=bottom/you, 1=left, 2=across, 3=right) → absolute seat
  function viewSeat(n) { return (mySeat + n) % 4; }
  // My effective "player" seat for interaction logic
  function myPS() { return vsOnline ? mySeat : PLAYER; }
  // Is this an AI seat?
  function isAISeat(s) {
    if (vsOnline) return aiSeatsRoom.indexOf(s) !== -1; // room AI seats
    return twoPlayer ? s === 2 : s !== PLAYER; // 1v1: seat 2 is AI; 4P: all non-0
  }
  // Perspective-aware name
  function pName(idx) {
    if (idx < 0) return '-';
    if (vsOnline) return ['You','Left','Across','Right'][(idx - mySeat + 4) % 4];
    return SEAT_NAMES[idx] || '?';
  }

  /* ── Crypto-quality shuffle ── */
  function cryptoRandInt(max) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = cryptoRandInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ── State ── */
  let state = {};
  let selected = new Set();
  let gameRenderCount = 0;
  let gameSpeed = 1;
  let gameVersion = 0;

  function newGame() {
    if (vsOnline) return; // online games are started via startOnlineGame()
    gameVersion++;
    const deck  = shuffle(buildDeck());
    const hands = dealDeck(deck);
    const first = hands.findIndex(h => h.some(c => c.rank === '3' && c.suit === '♠'));

    state = {
      hands,
      current:         first,
      leader:          first,
      pile:            [],
      pileOwner:       -1,
      pileType:        null,
      passes:          0,
      log:             [],
      phase:           'playing',
      firstTurn:       true,
      winner:          -1,
      pileJustChanged: false,
      aiThinking:      false,
    };

    selected.clear();
    gameRenderCount = 0;
    render();

    if (state.current !== PLAYER) {
      scheduleAITurn();
    }
  }

  function newGameOnline() {
    // Called only by host to deal and start the game
    gameVersion++;
    const deck  = shuffle(buildDeck());
    const hands = dealDeck(deck);
    const first = hands.findIndex(h => h.some(c => c.rank === '3' && c.suit === '♠'));

    state = {
      hands,
      current:         first,
      leader:          first,
      pile:            [],
      pileOwner:       -1,
      pileType:        null,
      passes:          0,
      log:             [],
      phase:           'playing',
      firstTurn:       true,
      winner:          -1,
      pileJustChanged: false,
      aiThinking:      false,
    };

    selected.clear();
    gameRenderCount = 0;
    render();

    // Host runs AI if an AI seat goes first
    if (isAISeat(state.current)) {
      scheduleAITurn();
    }
  }

  /* ── Deck ── */
  function buildDeck() {
    const deck = [];
    for (const suit of SUITS)
      for (const rank of RANKS)
        deck.push({ rank, suit });
    return deck;
  }

  function dealDeck(deck) {
    const hands = [[], [], [], []];
    if (twoPlayer) {
      deck.slice(0, 26).forEach(c => hands[0].push(c));
      deck.slice(26).forEach(c => hands[2].push(c));
    } else {
      deck.forEach((c, i) => hands[i % 4].push(c));
    }
    hands.forEach(h => h.sort(cardCmp));
    return hands;
  }

  /* ── Card utilities ── */
  const rankVal = r => RANKS.indexOf(r);
  const suitVal = s => SUITS.indexOf(s);
  const cardVal = c => rankVal(c.rank) * 4 + suitVal(c.suit);
  function cardCmp(a, b) { return cardVal(a) - cardVal(b); }
  function cardsEq(a, b) { return a.rank === b.rank && a.suit === b.suit; }

  /* ── Hand classification ── */
  function classify(cards) {
    const n = cards.length;
    if (!n) return null;
    const s = [...cards].sort(cardCmp);

    if (n === 1) return { type:'single', len:1, value:cardVal(s[0]) };

    if (n === 2) {
      return s[0].rank === s[1].rank
        ? { type:'pair', len:2, value:cardVal(s[1]) }
        : null;
    }

    if (n === 3) {
      if (s[0].rank === s[1].rank && s[1].rank === s[2].rank)
        return { type:'triple', len:3, value:cardVal(s[2]) };
      if (isSeq(s)) return { type:'seq', len:3, value:cardVal(s[2]) };
      return null;
    }

    if (n === 4) {
      if (s.every(c => c.rank === s[0].rank))
        return { type:'quad', len:4, value:cardVal(s[3]) };
      if (isSeq(s))
        return { type:'seq', len:4, value:cardVal(s[3]) };
    }

    if (n % 2 === 0) {
      const sp = trySeqPair(s);
      if (sp) return sp;
    }

    if (n >= 3 && isSeq(s))
      return { type:'seq', len:n, value:cardVal(s[n-1]) };

    return null;
  }

  function isSeq(s) {
    if (s.some(c => c.rank === '2')) return false;
    for (let i = 1; i < s.length; i++)
      if (rankVal(s[i].rank) !== rankVal(s[i-1].rank) + 1) return false;
    return true;
  }

  function trySeqPair(s) {
    const n = s.length;
    if (n < 4 || n % 2) return null;
    if (s.some(c => c.rank === '2')) return null;
    for (let i = 0; i < n; i += 2)
      if (s[i].rank !== s[i+1].rank) return null;
    for (let i = 2; i < n; i += 2)
      if (rankVal(s[i].rank) !== rankVal(s[i-2].rank) + 1) return null;
    return { type:'seqpair', len:n, value:cardVal(s[n-1]), pairCount:n/2 };
  }

  /* ── Beat logic ── */
  function beats(me, pile) {
    if (!pile) return true;
    const { type:mt, value:mv, len:ml, pairCount:mp } = me;
    const { type:pt, value:pv, len:pl } = pile;

    // Special: single 2 beaten only by quad, 3+ seqpair, or a higher 2
    if (pt === 'single' && pv >= rankVal('2') * 4) {
      if (mt === 'single' && mv > pv) return true; // higher 2 beats lower 2
      return mt === 'quad' || (mt === 'seqpair' && mp >= 3);
    }

    if (mt !== pt) return false;
    if ((mt === 'seq' || mt === 'seqpair') && ml !== pl) return false;
    return mv > pv;
  }

  /* ── Turn mechanics ── */
  function playCards(playerIdx, cards) {
    const hand = state.hands[playerIdx];
    const info = classify(cards);
    if (!info || !beats(info, state.pileType)) return false;

    if (state.firstTurn && playerIdx === state.leader)
      if (!cards.some(c => c.rank === '3' && c.suit === '♠')) return false;

    for (const c of cards) {
      const i = hand.findIndex(h => cardsEq(h, c));
      if (i === -1) return false;
      hand.splice(i, 1);
    }

    state.pile            = [...cards].sort(cardCmp);
    state.pileOwner       = playerIdx;
    state.pileType        = info;
    state.passes          = 0;
    state.firstTurn       = false;
    state.aiThinking      = false;
    state.pileJustChanged = true;

    addLog(playerIdx, `${pName(playerIdx)} played ${cardsStr(cards)} (${TYPE_LABEL[info.type]})`);

    if (!hand.length) {
      state.phase  = 'gameover';
      state.winner = playerIdx;
      if (!vsOnline && window.Auth && Auth.isLoggedIn())
        Auth.recordResult('tien-len', playerIdx === myPS() ? 'win' : 'loss');
      if (vsOnline) syncOnlineState(); // sync game-over state before render
      render();
      return true;
    }

    advanceTurn(); // sync happens inside advanceTurn for online
    return true;
  }

  function doPass(playerIdx) {
    state.passes++;
    state.aiThinking = false;
    addLog(playerIdx, `${pName(playerIdx)} passes.`);

    if (state.passes >= passThreshold()) {
      state.pile            = [];
      state.pileType        = null;
      state.passes          = 0;
      state.current         = state.pileOwner;
      state.leader          = state.pileOwner;
      state.pileJustChanged = true;
      addLog(-1, `- New round - ${pName(state.pileOwner)} leads.`);

      if (vsOnline) {
        if (isHost || playerIdx === mySeat) syncOnlineState();
        render();
        if (isHost && isAISeat(state.current)) scheduleAITurn();
        return;
      }

      if (state.current !== PLAYER) {
        scheduleAITurn();
      } else {
        render();
      }
      return;
    }

    advanceTurn(); // sync happens inside advanceTurn for online
  }

  function advanceTurn() {
    state.current = nextSeat(state.current);

    if (vsOnline) {
      // Sync AFTER current advances so the receiver knows whose turn it now is
      syncOnlineState();
      render();
      if (isHost && isAISeat(state.current)) {
        scheduleAITurn();
      }
      return;
    }

    if (state.current !== PLAYER) {
      scheduleAITurn();
    } else {
      render();
    }
  }

  /* ── AI ── */
  function scheduleAITurn() {
    if (window.CGTutorial && CGTutorial.isActive) return;
    state.aiThinking = true;
    render();
    const id = gameVersion;
    const delay = gameSpeed === 2
      ? 300 + cryptoRandInt(300)
      : 800 + cryptoRandInt(700);
    setTimeout(() => { if (gameVersion === id) runAI(); }, delay);
  }

  function runAI() {
    if (state.phase !== 'playing') return;
    if (vsOnline && !isHost) return; // only host runs AI
    if (!isAISeat(state.current) && !(!vsOnline && state.current !== PLAYER)) return;

    const idx  = state.current;
    const hand = state.hands[idx];

    if (state.firstTurn && idx === state.leader) {
      const s3 = hand.find(c => c.rank === '3' && c.suit === '♠');
      if (s3) { playCards(idx, [s3]); return; }
    }

    const play = findAIPlay(hand, state.pileType);
    if (!play || !playCards(idx, play)) doPass(idx);
  }

  function findAIPlay(hand, pile) {
    if (!pile) return leadPlay(hand);

    const cands = allCandidates(hand);
    let best = null, bestVal = Infinity;
    for (const c of cands) {
      const info = classify(c);
      if (!info || !beats(info, pile)) continue;
      if (info.value < bestVal) { bestVal = info.value; best = c; }
    }
    return best;
  }

  function leadPlay(hand) {
    const cands = allCandidates(hand);
    let best = null, bestVal = Infinity;
    for (const c of cands) {
      const info = classify(c);
      if (!info || info.type !== 'pair') continue;
      if (info.value < bestVal) { bestVal = info.value; best = c; }
    }
    if (best) return best;
    const nonTwo = hand.filter(c => c.rank !== '2');
    return nonTwo.length ? [nonTwo[0]] : [hand[0]];
  }

  function allCandidates(hand) {
    const out = [];
    hand.forEach(c => out.push([c]));

    const byRank = {};
    hand.forEach(c => { (byRank[c.rank] = byRank[c.rank] || []).push(c); });

    for (const g of Object.values(byRank)) {
      if (g.length >= 2) out.push(g.slice(0,2));
      if (g.length >= 3) out.push(g.slice(0,3));
      if (g.length >= 4) out.push(g.slice(0,4));
    }

    const uRanks = [...new Set(hand.filter(c => c.rank !== '2').map(c => c.rank))]
      .sort((a,b) => rankVal(a) - rankVal(b));

    for (let s = 0; s < uRanks.length; s++) {
      let run = [uRanks[s]];
      for (let e = s + 1; e < uRanks.length; e++) {
        if (rankVal(uRanks[e]) !== rankVal(run[run.length-1]) + 1) break;
        run.push(uRanks[e]);
        if (run.length >= 3) out.push(run.map(r => byRank[r][0]));
      }
    }

    for (let s = 0; s < uRanks.length; s++) {
      if (!byRank[uRanks[s]] || byRank[uRanks[s]].length < 2) continue;
      let run = [uRanks[s]];
      for (let e = s + 1; e < uRanks.length; e++) {
        if (!byRank[uRanks[e]] || byRank[uRanks[e]].length < 2) break;
        if (rankVal(uRanks[e]) !== rankVal(run[run.length-1]) + 1) break;
        run.push(uRanks[e]);
        if (run.length >= 2) out.push(run.flatMap(r => byRank[r].slice(0,2)));
      }
    }

    return out;
  }

  /* ── Helpers ── */
  function cardsStr(cards) {
    return cards.map(c => c.rank + c.suit).join(' ');
  }

  function addLog(player, msg) {
    state.log.unshift({ player, msg });
    if (state.log.length > 25) state.log.length = 25;
  }

  function esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── VN Tết reskin (tl-vn): hand-drawn card art + display-only accents ──
     Visual layer only — zero game logic. Everything here is gated by the
     tl-vn root class added in buildUI()/renderGameOver(). Cuarenta has its
     own builder file and never receives tl-vn, so it is unaffected.
     All strings are internal constants — innerHTML-safe by construction. */
  var VN_SKIN = true;

  var VN_BG        = '#F4EAD8';   // card cream (điệp-paper warm stock)
  var VN_INK       = '#26221E';   // ink keyline / spades / clubs
  var VN_SUIT_RED  = '#C03A2B';   // hearts / diamonds
  var VN_DH_RED    = '#B23A2E';   // Đông Hồ stamp red
  var VN_DH_GREEN  = '#2E6B4F';   // Đông Hồ mat green
  var VN_GOLD      = '#E8B33C';   // gold leaf (court accents)
  var VN_FLESH     = '#e9bd92';
  var VN_SUIT_INK  = { '♥': VN_SUIT_RED, '♦': VN_SUIT_RED, '♠': VN_INK, '♣': VN_INK };

  function vnN(v) { return String(Math.round(v * 100) / 100); }

  // Suit pip shapes, centred on (0,0), ~18 units tall (scaled via vnPip()).
  var VN_PIP_PATH = {
    '♥': 'M0 7.4 C-8 0.6 -9.2 -6 -4.8 -8 C-1.8 -9.3 -0.2 -6.6 0 -4.8 C0.2 -6.6 1.8 -9.3 4.8 -8 C9.2 -6 8 0.6 0 7.4 Z',
    '♦': 'M0 -9 Q4 -4.4 6.2 0 Q4 4.4 0 9 Q-4 4.4 -6.2 0 Q-4 -4.4 0 -9 Z',
    '♠': 'M0 -8.8 C6.6 -2.4 8.6 2 5.2 5 C2.7 7.1 0.6 5.2 0 3.4 C-0.6 5.2 -2.7 7.1 -5.2 5 C-8.6 2 -6.6 -2.4 0 -8.8 Z M-3.3 9.2 C-1.3 7.4 -0.8 5 0 2.4 C0.8 5 1.3 7.4 3.3 9.2 Z',
  };

  function vnPip(suit, x, y, s, flip) {
    var col = VN_SUIT_INK[suit];
    var jit = ((Math.round(x) * 13 + Math.round(y) * 7) % 5) - 2;  // deterministic hand-drawn tilt
    var rot = (flip ? 180 : 0) + jit;
    var body;
    if (suit === '♣') {
      body = '<circle cx="0" cy="-4.4" r="4.5" fill="' + col + '"/>'
           + '<circle cx="-4.3" cy="2.6" r="4.5" fill="' + col + '"/>'
           + '<circle cx="4.3" cy="2.6" r="4.5" fill="' + col + '"/>'
           + '<path d="M-3.4 9.4 C-1.4 7.4 -0.9 4.4 0 1.2 C0.9 4.4 1.4 7.4 3.4 9.4 Z" fill="' + col + '"/>';
    } else {
      body = '<path d="' + VN_PIP_PATH[suit] + '" fill="' + col + '"/>';
    }
    return '<g transform="translate(' + vnN(x) + ' ' + vnN(y) + ') rotate(' + vnN(rot) + ') scale(' + vnN(s) + ')">' + body + '</g>';
  }

  // Classic pip layouts for 2–10 (viewBox 100×150; pips below y=80 flipped).
  var VN_PIP_LAYOUT = {
    2:  [[50, 46, 1.25], [50, 104, 1.25]],
    3:  [[50, 44, 1.15], [50, 75, 1.15], [50, 106, 1.15]],
    4:  [[34, 47, 1.1], [66, 47, 1.1], [34, 103, 1.1], [66, 103, 1.1]],
    5:  [[34, 46, 1.05], [66, 46, 1.05], [50, 75, 1.05], [34, 104, 1.05], [66, 104, 1.05]],
    6:  [[34, 45, 1], [66, 45, 1], [34, 75, 1], [66, 75, 1], [34, 105, 1], [66, 105, 1]],
    7:  [[34, 44, 0.95], [66, 44, 0.95], [50, 59, 0.95],
         [34, 74, 0.95], [66, 74, 0.95], [34, 104, 0.95], [66, 104, 0.95]],
    8:  [[34, 44, 0.9], [66, 44, 0.9], [50, 59, 0.9],
         [34, 74, 0.9], [66, 74, 0.9], [50, 90, 0.9], [34, 104, 0.9], [66, 104, 0.9]],
    9:  [[34, 42, 0.85], [66, 42, 0.85], [34, 64, 0.85], [66, 64, 0.85], [50, 75, 0.85],
         [34, 86, 0.85], [66, 86, 0.85], [34, 108, 0.85], [66, 108, 0.85]],
    10: [[34, 42, 0.82], [66, 42, 0.82], [50, 53, 0.82], [34, 64, 0.82], [66, 64, 0.82],
         [34, 86, 0.82], [66, 86, 0.82], [50, 97, 0.82], [34, 108, 0.82], [66, 108, 0.82]],
  };

  // Court cards — naive single full-length figures, flat woodblock fills,
  // thick ink outlines, no gradients. Tết palette: green tunic, stamp-red robes.
  function vnFaceJ(suit) {       // young page: cap + feather, green tunic
    return '<path d="M41 35 Q50 26 59 35 L59 38 L41 38 Z" fill="' + VN_DH_RED + '" stroke="' + VN_INK + '" stroke-width="2"/>'
         + '<path d="M57 30 Q63 23 66 26 Q62 30 58 33 Z" fill="' + VN_DH_GREEN + '" stroke="' + VN_INK + '" stroke-width="1.2"/>'
         + '<circle cx="50" cy="46" r="8.5" fill="' + VN_FLESH + '" stroke="' + VN_INK + '" stroke-width="2"/>'
         + '<path d="M47 49 Q50 51.5 53 49" fill="none" stroke="' + VN_INK + '" stroke-width="1.2" stroke-linecap="round"/>'
         + '<path d="M40 57 L60 57 L65 96 L35 96 Z" fill="' + VN_DH_GREEN + '" stroke="' + VN_INK + '" stroke-width="2"/>'
         + '<rect x="38.5" y="74" width="23" height="4" fill="' + VN_GOLD + '" stroke="' + VN_INK + '" stroke-width="1"/>'
         + '<line x1="44" y1="96" x2="43" y2="114" stroke="#6b4520" stroke-width="5"/>'
         + '<line x1="56" y1="96" x2="57" y2="114" stroke="#6b4520" stroke-width="5"/>'
         + '<line x1="60" y1="66" x2="70" y2="74" stroke="' + VN_FLESH + '" stroke-width="4" stroke-linecap="round"/>'
         + vnPip(suit, 72, 80, 0.6);
  }
  function vnFaceQ(suit) {       // queen: small crown, stamp-red gown, flower
    return '<path d="M42 37 L42 30 L46 34 L50 28 L54 34 L58 30 L58 37 Z" fill="' + VN_GOLD + '" stroke="' + VN_INK + '" stroke-width="2"/>'
         + '<circle cx="50" cy="47" r="8.5" fill="' + VN_FLESH + '" stroke="' + VN_INK + '" stroke-width="2"/>'
         + '<path d="M42 45 Q39 54 42 60 M58 45 Q61 54 58 60" fill="none" stroke="' + VN_INK + '" stroke-width="1.6"/>'
         + '<path d="M47 50 Q50 52.5 53 50" fill="none" stroke="' + VN_INK + '" stroke-width="1.2" stroke-linecap="round"/>'
         + '<path d="M38 59 L62 59 L68 112 L32 112 Z" fill="' + VN_DH_RED + '" stroke="' + VN_INK + '" stroke-width="2"/>'
         + '<rect x="34" y="103" width="32" height="5" fill="' + VN_GOLD + '" stroke="' + VN_INK + '" stroke-width="1"/>'
         + '<line x1="40" y1="66" x2="31" y2="59" stroke="' + VN_FLESH + '" stroke-width="4" stroke-linecap="round"/>'
         + '<line x1="29" y1="62" x2="28" y2="56" stroke="#4a6b3a" stroke-width="2"/>'
         + '<circle cx="28" cy="52" r="3.4" fill="' + VN_GOLD + '" stroke="' + VN_INK + '" stroke-width="1.2"/>'
         + '<circle cx="28" cy="52" r="1.3" fill="' + VN_DH_RED + '"/>'
         + '<line x1="60" y1="66" x2="70" y2="72" stroke="' + VN_FLESH + '" stroke-width="4" stroke-linecap="round"/>'
         + vnPip(suit, 73, 78, 0.6);
  }
  function vnFaceK(suit) {       // bearded king: crown + jewel, robe w/ gold trim
    return '<path d="M40 38 L40 29 L45 35 L50 27 L55 35 L60 29 L60 38 Z" fill="' + VN_GOLD + '" stroke="' + VN_INK + '" stroke-width="2"/>'
         + '<circle cx="50" cy="33" r="1.6" fill="' + VN_DH_RED + '"/>'
         + '<circle cx="50" cy="48" r="8.5" fill="' + VN_FLESH + '" stroke="' + VN_INK + '" stroke-width="2"/>'
         + '<path d="M43 51 Q50 62 57 51 L56 58 Q50 66 44 58 Z" fill="#ece4d4" stroke="' + VN_INK + '" stroke-width="1.5"/>'
         + '<path d="M37 62 L63 62 L69 114 L31 114 Z" fill="' + VN_DH_RED + '" stroke="' + VN_INK + '" stroke-width="2"/>'
         + '<path d="M37 62 L43 114 M63 62 L57 114" fill="none" stroke="' + VN_GOLD + '" stroke-width="2.5" opacity="0.9"/>'
         + '<rect x="33" y="105" width="34" height="5" fill="' + VN_GOLD + '" stroke="' + VN_INK + '" stroke-width="1"/>'
         + '<line x1="62" y1="68" x2="72" y2="54" stroke="' + VN_FLESH + '" stroke-width="4" stroke-linecap="round"/>'
         + vnPip(suit, 74, 47, 0.6);
  }

  // Ace: one large pip inside a fine lozenge frame.
  function vnAce(suit) {
    return '<path d="M50 32 L76 75 L50 118 L24 75 Z" fill="none" stroke="' + VN_SUIT_INK[suit] + '" stroke-width="1.4" opacity="0.3"/>'
         + vnPip(suit, 50, 75, 2.3);
  }

  function vnCorner(rank, suit) {
    var two = rank.length > 1;   // "10" needs a narrower index
    return '<text class="tl-vn-ix' + (two ? ' tl-vn-ix--10' : '') + '" x="6" y="21" font-size="' + (two ? 13 : 17)
         + '" font-weight="bold" font-family="Georgia, serif" fill="' + VN_SUIT_INK[suit] + '">' + rank + '</text>'
         + vnPip(suit, 12, 31, 0.48);
  }

  function vnCardSVG(rank, suit) {
    var mid;
    if (rank === 'J' || rank === 'Q' || rank === 'K') {
      mid = '<rect x="23" y="27" width="54" height="96" rx="3" fill="none" stroke="' + VN_INK + '" stroke-width="1.3" opacity="0.5"/>'
          + (rank === 'J' ? vnFaceJ(suit) : (rank === 'Q' ? vnFaceQ(suit) : vnFaceK(suit)));
    } else if (rank === 'A') {
      mid = vnAce(suit);
    } else {
      var lay = VN_PIP_LAYOUT[+rank], out = '', i;
      for (i = 0; i < lay.length; i++) out += vnPip(suit, lay[i][0], lay[i][1], lay[i][2], lay[i][1] > 80);
      mid = out;
    }
    return '<svg viewBox="0 0 100 150" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<rect x="1" y="1" width="98" height="148" rx="9" fill="' + VN_BG + '"/>'
      + '<rect x="3.5" y="3.5" width="93" height="143" rx="7" fill="none" stroke="' + VN_INK + '" stroke-width="1" opacity="0.25"/>'
      + vnCorner(rank, suit)
      + '<g transform="rotate(180 50 75)">' + vnCorner(rank, suit) + '</g>'
      + mid
      + '</svg>';
  }

  // Đông Hồ "Đàn lợn"-style âm-dương pig: flat woodblock shapes, ink keyline,
  // yin-yang swirl on the flank. Used on card backs + the CHẶT HEO stamp.
  function vnPig() {
    return '<g stroke="' + VN_INK + '" stroke-width="1.6" stroke-linejoin="round">'
      + '<path d="M73 69 q7 -4 5 2 q-2 5 -6 2" fill="none"/>'
      + '<path d="M38 84 L37 95 L42 95 L42 86 Z M50 87 L50 96 L55 96 L55 87 Z M63 86 L63 95 L68 95 L67 85 Z" fill="' + VN_DH_RED + '"/>'
      + '<path d="M27 58 L22 49 L33 55 Z" fill="' + VN_DH_RED + '"/>'
      + '<ellipse cx="53" cy="74" rx="21" ry="13.5" fill="' + VN_DH_RED + '"/>'
      + '<circle cx="30" cy="67" r="9.5" fill="' + VN_DH_RED + '"/>'
      + '<ellipse cx="21.5" cy="70" rx="3.6" ry="4.6" fill="' + VN_BG + '"/>'
      + '<circle cx="21" cy="68.6" r="0.8" fill="' + VN_INK + '" stroke="none"/>'
      + '<circle cx="21" cy="71.6" r="0.8" fill="' + VN_INK + '" stroke="none"/>'
      + '<circle cx="30.5" cy="64" r="1.2" fill="' + VN_INK + '" stroke="none"/>'
      + '<circle cx="55" cy="72" r="7" fill="' + VN_BG + '"/>'
      + '<path d="M55 65 a7 7 0 0 1 0 14 a3.5 3.5 0 0 1 0 -7 a3.5 3.5 0 0 0 0 -7 Z" fill="' + VN_DH_GREEN + '" stroke="none"/>'
      + '<circle cx="55" cy="68.5" r="1.1" fill="' + VN_DH_GREEN + '" stroke="none"/>'
      + '<circle cx="55" cy="75.5" r="1.1" fill="' + VN_BG + '" stroke="none"/>'
      + '</g>';
  }

  // Card back: điệp-paper cream ground, thin white border, red frame, pig medallion.
  function vnBackSVG() {
    return '<svg viewBox="0 0 100 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<rect x="0.5" y="0.5" width="99" height="139" rx="8" fill="' + VN_BG + '" stroke="#FFFFFF" stroke-width="1"/>'
      + '<rect x="4" y="4" width="92" height="132" rx="6" fill="none" stroke="#FFFFFF" stroke-width="2"/>'
      + '<rect x="7.5" y="7.5" width="85" height="125" rx="5" fill="none" stroke="' + VN_DH_RED + '" stroke-width="2"/>'
      + '<circle cx="50" cy="70" r="35" fill="none" stroke="' + VN_DH_RED + '" stroke-width="1.4" opacity="0.8"/>'
      + vnPig()
      + '</svg>';
  }
  var VN_BACK_SVG = vnBackSVG();

  function vnBackHTML(sizeCls) {
    return '<div class="tl-card-back ' + sizeCls + '">' + (VN_SKIN ? VN_BACK_SVG : '') + '</div>';
  }

  function vnPigStampSVG() {
    return '<svg class="tl-vn-callout__pig" viewBox="14 44 68 54" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + vnPig() + '</svg>';
  }

  // Display-only snapshot: was the last rendered pile a lone 2 ("heo")?
  // Lets the render path spot "bomb just chopped a 2" without touching logic,
  // and works identically for local play and synced online state.
  var vnPrevPileWasHeo = false;

  /* ── Rendering ── */
  function render() {
    const el = document.getElementById('game-container');
    if (!el) return;

    const isFirstRender   = (gameRenderCount === 0);
    const justChanged     = state.pileJustChanged;
    gameRenderCount++;
    state.pileJustChanged = false;

    if (state.phase === 'gameover') {
      renderGameOver(el);
      return;
    }

    el.innerHTML = buildUI(isFirstRender, justChanged);
    wireEvents(el);
  }

  function buildUI(isFirst, justChanged) {
    const ps       = myPS();
    const isYT     = state.current === ps && !state.aiThinking;
    const thinking = state.aiThinking && state.current !== ps;

    let statusInner, statusCls = '';
    if (thinking) {
      statusInner = `${pName(state.current)} is thinking <span class="tl-thinking-dots"><span></span><span></span><span></span></span>`;
    } else if (isYT) {
      statusInner = state.pile.length
        ? 'Your turn - beat the play or <em>pass</em>'
        : 'Your turn - lead any hand';
      statusCls = 'your-turn';
    } else {
      statusInner = `${pName(state.current)}'s turn`;
    }

    const hand     = state.hands[ps];
    const selCards = [...selected].map(i => hand[i]);
    const selInfo  = selCards.length ? classify(selCards) : null;
    let hintText = '', hintCls = '';
    if (selCards.length) {
      if (selInfo) { hintText = `✓ ${TYPE_LABEL[selInfo.type]}`; hintCls = 'valid'; }
      else         { hintText = '✗ Not a valid hand';            hintCls = 'invalid'; }
    }

    return `<div class="tl-game${VN_SKIN ? ' tl-vn' : ''}${gameSpeed === 2 ? ' tl-fast' : ''}${twoPlayer ? ' tl-1v1' : ''}">
  <div class="tl-status-bar ${statusCls}">${statusInner}</div>
  <div class="tl-table">
    ${zoneTop()}
    ${twoPlayer ? '' : zoneSide(viewSeat(1), 'left')}
    ${centerArea(justChanged)}
    ${twoPlayer ? '' : zoneSide(viewSeat(3), 'right')}
  </div>
  ${playerArea(isYT, isFirst)}
  <div class="tl-hint ${hintCls}">${hintText}</div>
  ${logArea()}
</div>`;
  }

  function zoneTop() {
    const abs    = viewSeat(2);
    const n      = state.hands[abs].length;
    const active = state.current === abs;
    const show   = Math.min(n, 11);
    const backs  = Array(show).fill(vnBackHTML('tl-card-back--sm')).join('');
    return `<div class="tl-zone tl-zone--top">
  <div class="tl-zone__name${active ? ' active' : ''}">${pName(abs)}${active ? ' ●' : ''}</div>
  <div class="tl-opp-cards--top">${backs}</div>
  <div class="tl-zone__count">${n} card${n !== 1 ? 's' : ''}</div>
</div>`;
  }

  function zoneSide(idx, side) {
    const n      = state.hands[idx].length;
    const active = state.current === idx;
    const name   = pName(idx);
    const show   = Math.min(n, 6);
    const backs  = Array(show).fill(vnBackHTML('tl-card-back--xs')).join('');
    return `<div class="tl-zone tl-zone--${side}">
  <div class="tl-zone__name${active ? ' active' : ''}">${name}${active ? ' ●' : ''}</div>
  <div class="tl-opp-cards--side">${backs}</div>
  <div class="tl-zone__count">${n}</div>
</div>`;
  }

  /* ── Pile animation helpers ── */
  function fromDir(playerIdx) {
    const view = (playerIdx - mySeat + 4) % 4;
    switch (view) {
      case 1:  return { x: '-260px', y:  '20px' };
      case 2:  return { x:    '0px', y: '-160px' };
      case 3:  return { x:  '260px', y:  '20px' };
      default: return { x:    '0px', y:  '160px' };
    }
  }

  function pileRot(card, i) {
    return ((cardVal(card) + i * 7) % 11) - 5;
  }

  function centerArea(justChanged) {
    const hasPile = state.pile.length > 0;
    const pileHTML = hasPile
      ? state.pile.map((c, i) => {
          const rot = pileRot(c, i);
          const dir = justChanged ? fromDir(state.pileOwner) : null;
          const sty = dir
            ? `--play-i:${i};--from-x:${dir.x};--from-y:${dir.y};--rot:${rot}deg`
            : `--rot:${rot}deg`;
          return faceCard(c, justChanged ? 'played-in' : '', sty);
        }).join('')
      : `<span class="tl-play-area-empty">Play area</span>`;

    const info = hasPile && state.pileType
      ? `<div class="tl-play-info">by ${pName(state.pileOwner)} · ${TYPE_LABEL[state.pileType.type]}</div>`
      : '';

    // VN display accents — derived purely from already-rendered pile data.
    // CHẶT HEO: the previously rendered pile was a lone 2 and a bomb
    // (four-of-a-kind, or 3+ consecutive pairs) just landed on it.
    const isBomb = hasPile && state.pileType &&
      (state.pileType.type === 'quad' ||
       (state.pileType.type === 'seqpair' && state.pileType.len >= 6));
    const chatHeo = VN_SKIN && justChanged && isBomb && vnPrevPileWasHeo;
    vnPrevPileWasHeo = hasPile && state.pileType &&
      state.pileType.type === 'single' && state.pile[0].rank === '2';
    const heoTag = VN_SKIN && hasPile && state.pile.some(c => c.rank === '2')
      ? '<span class="tl-vn-heo">heo!</span>'
      : '';
    const callout = chatHeo
      ? `<div class="tl-vn-callout">${vnPigStampSVG()}<div class="tl-vn-callout__text">CHẶT HEO!</div></div>`
      : '';

    return `<div class="tl-center">
  <div class="tl-play-area${hasPile ? ' has-cards' : ''}">${pileHTML}${heoTag}</div>
  ${info}
  ${callout}
</div>`;
  }

  function playerArea(isYT, isFirst) {
    const hand    = state.hands[myPS()];
    const canPlay = isYT && selected.size > 0;
    const canPass = isYT && state.pile.length > 0;

    const cards = hand.map((c, i) => {
      const cls = [
        isYT            ? 'clickable' : '',
        selected.has(i) ? 'selected'  : '',
        isFirst         ? 'dealing'   : '',
      ].filter(Boolean).join(' ');
      const sty = isFirst ? `--deal-i:${i}` : '';
      return faceCard(c, cls, sty, String(i));
    }).join('');

    return `<div class="tl-player-area">
  <div class="tl-zone__name${isYT ? ' active' : ''}">You${isYT ? ' ●' : ''} · ${hand.length} cards</div>
  <div class="tl-hand">${cards}</div>
  <div class="tl-actions">
    <div class="tl-actions__main">
      <button class="tl-btn tl-btn--pass" id="tl-pass" ${canPass ? '' : 'disabled'}>Pass</button>
      <button class="tl-btn tl-btn--play" id="tl-play" ${canPlay ? '' : 'disabled'}>Play</button>
    </div>
    <div class="tl-actions__secondary">
      ${!vsOnline ? `<button class="tl-btn tl-btn--ghost" id="tl-new">New Game</button>` : ''}
      ${!vsOnline ? `<button class="tl-btn tl-btn--ghost" id="tl-mode">${twoPlayer ? '4-Player' : '1v1'}</button>` : ''}
      ${!vsOnline || isHost ? `<button class="tl-btn tl-btn--ghost tl-speed-btn${gameSpeed === 2 ? ' active' : ''}" id="tl-speed">2×</button>` : ''}
    </div>
  </div>
</div>`;
  }

  function logArea() {
    const rows = state.log.slice(0, 10).map(e => {
      const cls = e.player === myPS() ? ' you' : e.player < 0 ? ' sys' : '';
      return `<li class="tl-log__entry${cls}">${esc(e.msg)}</li>`;
    }).join('');
    return `<div class="tl-log">
  <div class="tl-log__title">Game log</div>
  <ul class="tl-log__list">${rows}</ul>
</div>`;
  }

  /* Render a face-up card div */
  function faceCard(card, cls, style, dataIdx) {
    const color    = SUIT_CLR[card.suit];
    const clsStr   = cls   ? ` ${cls}`           : '';
    const styleStr = style ? ` style="${style}"`  : '';
    const dataStr  = dataIdx !== undefined ? ` data-idx="${dataIdx}"` : '';
    return `<div class="tl-card tl-card--${color}${clsStr}"${styleStr}${dataStr}>${cardInner(card)}</div>`;
  }

  function cardInner(c) {
    if (VN_SKIN) return vnCardSVG(c.rank, c.suit);
    return `<div class="tl-card__corner tl-card__corner--tl"><div class="tl-card__rank">${c.rank}</div><div class="tl-card__suit-s">${c.suit}</div></div><div class="tl-card__center">${c.suit}</div><div class="tl-card__corner tl-card__corner--br"><div class="tl-card__rank">${c.rank}</div><div class="tl-card__suit-s">${c.suit}</div></div>`;
  }

  function renderGameOver(el) {
    const w   = state.winner;
    const isP = w === myPS();

    let btnLabel = 'Play Again';
    if (vsOnline && !isHost) btnLabel = 'Waiting for host…';

    el.innerHTML = `<div class="tl-game${VN_SKIN ? ' tl-vn' : ''}">
  <div class="tl-gameover visible">
    <div class="tl-gameover__icon">${isP ? '🏆' : '🃏'}</div>
    <h2>${isP ? 'Tiến Lên!' : `${pName(w)} Wins!`}</h2>
    ${VN_SKIN ? '<p class="tl-vn-flavor">Tới rồi!</p>' : ''}
    <p>${isP ? 'You emptied your hand first. Go forward!' : `${pName(w)} played all their cards first.`}</p>
    <button class="tl-btn tl-btn--play" id="tl-new"${vsOnline && !isHost ? ' disabled' : ''}>${btnLabel}</button>
    ${vsOnline ? `<button class="tl-btn tl-btn--ghost" id="tl-leave" style="margin-top:0.5rem">Leave Room</button>` : ''}
  </div>
</div>`;

    el.querySelector('#tl-new')?.addEventListener('click', () => {
      if (vsOnline) {
        if (isHost) {
          // Re-deal in the same room - guest receives via subscription
          newGameOnline();
          syncOnlineState();
        }
      } else {
        newGame();
      }
    });

    el.querySelector('#tl-leave')?.addEventListener('click', () => {
      const leaveBtn = document.getElementById('tl-leave-btn');
      if (leaveBtn) leaveBtn.click();
    });
  }

  /* ── Event wiring ── */
  function wireEvents(el) {
    const ps = myPS();

    el.querySelectorAll('.tl-hand .tl-card.clickable').forEach(card => {
      card.addEventListener('click', () => {
        if (state.current !== ps || state.aiThinking) return;
        const i = +card.dataset.idx;
        selected.has(i) ? selected.delete(i) : selected.add(i);
        render();
      });
    });

    el.querySelector('#tl-play')?.addEventListener('click', () => {
      if (state.current !== ps || state.aiThinking) return;
      const cards = [...selected].map(i => state.hands[ps][i]);
      const info  = classify(cards);
      const hint  = el.querySelector('.tl-hint');

      function showHint(msg) {
        if (hint) { hint.textContent = msg; hint.className = 'tl-hint invalid'; }
      }

      if (!info) {
        showHint('✗ Not a valid hand type'); return;
      }
      if (state.firstTurn && state.leader === ps && !cards.some(c => c.rank === '3' && c.suit === '♠')) {
        showHint('✗ First play must include the 3♠'); return;
      }
      if (state.pileType && !beats(info, state.pileType)) {
        showHint('✗ Doesn\'t beat current play - try higher or pass'); return;
      }

      selected.clear();
      playCards(ps, cards);
    });

    el.querySelector('#tl-pass')?.addEventListener('click', () => {
      if (state.current !== ps || state.aiThinking) return;
      selected.clear();
      doPass(ps);
    });

    el.querySelector('#tl-new')?.addEventListener('click', () => {
      if (vsOnline) return;
      newGame();
    });

    el.querySelector('#tl-mode')?.addEventListener('click', () => {
      if (vsOnline) return;
      twoPlayer = !twoPlayer;
      newGame();
    });

    el.querySelector('#tl-speed')?.addEventListener('click', () => {
      gameSpeed = gameSpeed === 2 ? 1 : 2;
      render();
    });
  }

  /* ── Online multiplayer ── */
  function syncOnlineState() {
    var blob = {
      hands:      state.hands,
      current:    state.current,
      leader:     state.leader,
      pile:       state.pile,
      pileOwner:  state.pileOwner,
      pileType:   state.pileType,
      passes:     state.passes,
      phase:      state.phase,
      firstTurn:  state.firstTurn,
      winner:     state.winner,
      log:        state.log,
    };
    if (window.RoomBridge && RoomBridge.isActive()) {
      blob.last_actor = 'room:' + RoomBridge.getSeat();
      RoomBridge.sendState(blob);
      // Report win to the room (RoomBridge deduplicates internally)
      if (state.winner >= 0) RoomBridge.reportWin(state.winner);
      return;
    }
    if (!window.Multiplayer) return;
    blob.last_actor = Multiplayer.getPlayerId();
    Multiplayer.sendState(blob);
  }

  function receiveOnlineState(data) {
    if (!data || !vsOnline) return;
    // Echo suppression - works for both Multiplayer and RoomBridge paths
    if (window.RoomBridge && RoomBridge.isActive()) {
      if (data.last_actor === 'room:' + RoomBridge.getSeat()) return;
    } else if (window.Multiplayer) {
      if (data.last_actor === Multiplayer.getPlayerId()) return;
    }

    state.hands          = data.hands;
    state.current        = data.current;
    state.leader         = data.leader;
    state.pile           = data.pile;
    state.pileOwner      = data.pileOwner;
    state.pileType       = data.pileType;
    state.passes         = data.passes;
    state.phase          = data.phase;
    state.firstTurn      = data.firstTurn;
    state.winner         = data.winner;
    state.log            = data.log;
    state.pileJustChanged = true;
    state.aiThinking     = false;

    selected.clear();
    gameRenderCount = Math.max(gameRenderCount, 1); // not a first render
    render();

    if (state.phase !== 'playing') return;

    // If it's my turn, player interacts (render already called)
    if (state.current === mySeat) return;

    // Host runs AI for AI seats
    if (isHost && isAISeat(state.current)) {
      scheduleAITurn();
    }
  }

  function initOnlineUI() {
    // ── Room System bridge (iframe mode) ───────────────────────────────────
    if (window.RoomBridge && RoomBridge.isActive()) {
      var tlPanel = document.getElementById('tl-mp-panel');
      if (tlPanel) tlPanel.hidden = true;
      vsOnline    = true;
      mySeat      = RoomBridge.getSeat();
      isHost      = RoomBridge.isRoomHost ? RoomBridge.isRoomHost() : (mySeat === 0);
      aiSeatsRoom = RoomBridge.getAiSeats ? RoomBridge.getAiSeats() : [];
      twoPlayer   = RoomBridge.getMode && RoomBridge.getMode() === '1v1';
      RoomBridge.onState(receiveOnlineState);
      if (isHost) {
        newGameOnline();
        syncOnlineState();
      }
      return;
    }
    // ── Legacy Multiplayer (standalone page) ───────────────────────────────
    if (!window.Multiplayer) return;

    const elLobby      = document.getElementById('tl-mp-lobby');
    const elJoinForm   = document.getElementById('tl-mp-join-form');
    const elRoomPanel  = document.getElementById('tl-mp-room');
    const elCreateBtn  = document.getElementById('tl-create-btn');
    const elJoinBtn    = document.getElementById('tl-join-btn');
    const elJoinSubmit = document.getElementById('tl-join-submit');
    const elJoinCancel = document.getElementById('tl-join-cancel');
    const elLeaveBtn   = document.getElementById('tl-leave-btn');
    const elCodeInput  = document.getElementById('tl-code-input');
    const elRoomCode   = document.getElementById('tl-room-code-display');
    const elRoomSt     = document.getElementById('tl-mp-room-status');

    if (!elLobby) return;

    function showLobby() {
      elLobby.hidden = false; elJoinForm.hidden = true; elRoomPanel.hidden = true;
    }
    function showJoinForm() {
      elLobby.hidden = true; elJoinForm.hidden = false; elRoomPanel.hidden = true;
      elCodeInput.value = ''; elCodeInput.focus();
    }
    function showRoom(code, status) {
      elLobby.hidden = true; elJoinForm.hidden = true; elRoomPanel.hidden = false;
      elRoomCode.textContent = code;
      elRoomSt.textContent   = status;
    }

    function startOnlineGame(role) {
      vsOnline  = true;
      twoPlayer = true; // online is always 1v1 - no AI
      isHost    = (role === 'host');
      mySeat    = isHost ? 0 : 2;

      if (isHost) {
        newGameOnline();
        syncOnlineState();
      } else {
        // Show waiting message; receiveOnlineState will start the game
        const el = document.getElementById('game-container');
        if (el) el.innerHTML = `<div style="padding:3rem 2rem;text-align:center;color:var(--color-text-muted)">
          <p style="font-size:1.2rem;margin-bottom:0.5rem">Connected!</p>
          <p>Waiting for host to deal cards…</p>
        </div>`;
      }
    }

    function leaveRoom() {
      Multiplayer.disconnect();
      vsOnline  = false;
      twoPlayer = false;
      isHost    = false;
      mySeat    = 0;
      showLobby();
      // Resume local game
      gameVersion++;
      const deck  = shuffle(buildDeck());
      const hands = dealDeck(deck);
      const first = hands.findIndex(h => h.some(c => c.rank === '3' && c.suit === '♠'));
      state = {
        hands, current: first, leader: first, pile: [], pileOwner: -1,
        pileType: null, passes: 0, log: [], phase: 'playing', firstTurn: true,
        winner: -1, pileJustChanged: false, aiThinking: false,
      };
      selected.clear();
      gameRenderCount = 0;
      render();
      if (state.current !== PLAYER) scheduleAITurn();
    }

    elCreateBtn.addEventListener('click', async function () {
      elCreateBtn.disabled    = true;
      elCreateBtn.textContent = 'Creating…';
      const result = await Multiplayer.createRoom('tien-len', {
        onReady: function (room) {
          showRoom(room.code, 'Opponent joined! Starting…');
          startOnlineGame('host');
        },
        onRemoteState: receiveOnlineState,
        onError: function (msg) { showLobby(); alert('Error: ' + msg); },
      });
      elCreateBtn.disabled    = false;
      elCreateBtn.textContent = 'Create Room';
      if (result) showRoom(result.code, 'Waiting for opponent to join…');
    });

    elJoinBtn.addEventListener('click', showJoinForm);
    elJoinCancel.addEventListener('click', showLobby);
    elCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') elJoinSubmit.click(); });

    elJoinSubmit.addEventListener('click', async function () {
      const code = elCodeInput.value.trim().toUpperCase();
      if (code.length !== 4) { alert('Enter a 4-letter room code.'); return; }
      elJoinSubmit.disabled    = true;
      elJoinSubmit.textContent = 'Joining…';
      const result = await Multiplayer.joinRoom(code, 'tien-len', {
        onRemoteState: receiveOnlineState,
        onError: function (msg) { alert('Error: ' + msg); },
      });
      elJoinSubmit.disabled    = false;
      elJoinSubmit.textContent = 'Join';
      if (result) {
        showRoom(code, 'Connected! You play as Across (seat 2).');
        startOnlineGame('guest');
      }
    });

    elLeaveBtn.addEventListener('click', leaveRoom);
  }

  /* ── Init ── */
  function init() {
    if (document.getElementById('game-container')) newGame();
    initOnlineUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Fullscreen resize hooks ──────────────────────────────────────────────
  if (window.FSMode) {
    FSMode.onEnter = function () { _fsResize(); };
    FSMode.onExit  = function () { _fsResize(); };
  }

  function _fsResize() {
    setTimeout(function () {
      if (typeof render === 'function') render();
    }, 50);
  }

  // DOM-based game - re-render to let CSS fill the new available space
  window.GameResize = function (availW, availH) {
    if (typeof render === 'function') render();
  };

}());

/* ── Tutorial ────────────────────────────────────────────────────────────── */
if (window.CGTutorial) {
  CGTutorial.register('tien-len', [
    {
      target:   '#game-container',
      title:    'Welcome to Tiến Lên',
      body:     'Tiến Lên ("Go Forward") is the most popular card game in Vietnam. Be the first to get rid of all your cards. Cards rank 3 (low) → 2 (highest).',
      position: 'center',
      highlight: false,
    },
    {
      target:   '.tl-hand',
      title:    'Your Hand',
      body:     'Your cards are shown at the bottom. Click a card to select it (it will lift up), then click Play to submit your selection.',
      position: 'top',
    },
    {
      target:   '#tl-play',
      title:    'Play Cards',
      body:     'Click Play to submit your selected cards. You must beat the previous play with a higher combination of the same type.',
      position: 'top',
    },
    {
      target:   '#tl-pass',
      title:    'Pass Your Turn',
      body:     'If you can\'t or don\'t want to beat the current play, click Pass. Once all others pass, the last player to play leads the next trick freely.',
      position: 'top',
    },
    {
      target:   '.tl-status-bar',
      title:    'Game Status',
      body:     'Watch here to see whose turn it is, what combination was last played, and when a new round begins.',
      position: 'bottom',
    },
    {
      target:   '#tl-new',
      title:    'New Game',
      body:     'Start a fresh hand of Tiến Lên at any time.',
      position: 'bottom',
    },
  ]);
  CGTutorial.initTrigger('tien-len');
}
