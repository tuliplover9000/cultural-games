/**
 * tien-len.js — Tiến Lên (Vietnamese shedding card game)
 * Phase 4 implementation.
 *
 * Rules:
 *  - 4 players, 52-card deck, 13 cards each
 *  - Rank order (low→high): 3 4 5 6 7 8 9 10 J Q K A 2
 *  - Suit order (low→high): Spades Clubs Diamonds Hearts
 *  - Valid hands: single, pair, triple, four-of-a-kind,
 *                 sequence (3+ consecutive ranks), sequence of pairs (2+ consecutive pairs)
 *  - Beat same hand type with higher value
 *  - 2 beaten only by four-of-a-kind or sequence of 3+ pairs
 *  - Player with 3♠ goes first; must include 3♠ in first play
 *  - Pass if can't/won't beat; all others pass → last player leads freely
 *  - First to empty hand wins
 */
(function () {
  'use strict';

  /* ── Constants ── */
  const RANKS       = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
  const SUITS       = ['♠','♣','♦','♥'];  // low → high
  const SUIT_COLORS = { '♠': 'black', '♣': 'black', '♦': 'red', '♥': 'red' };

  const PLAYER = 0;  // index of human player
  const AI     = [1, 2, 3];

  /* ── State ── */
  let state = {};

  function newGame() {
    const deck   = buildDeck();
    const hands  = dealDeck(deck);
    const first  = hands.findIndex(h => h.some(c => c.rank === '3' && c.suit === '♠'));

    state = {
      hands,                // hands[0..3]
      current:    first,    // whose turn
      leader:     first,    // who leads this round (won last)
      pile:       [],       // last played cards (face-up center)
      pileOwner:  -1,       // who played pile
      pileType:   null,     // classified hand type of pile
      passes:     0,        // consecutive passes since last play
      log:        [],
      phase:      'playing',// 'playing' | 'gameover'
      firstTurn:  true,     // must include 3♠ on very first play
      winner:     -1,
      scores:     [0,0,0,0],
    };

    render();
    if (state.current !== PLAYER) {
      setTimeout(aiTurn, 600);
    }
  }

  /* ── Deck ── */
  function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit });
      }
    }
    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function dealDeck(deck) {
    const hands = [[], [], [], []];
    deck.forEach((card, i) => hands[i % 4].push(card));
    hands.forEach(h => sortHand(h));
    return hands;
  }

  /* ── Card utilities ── */
  function rankVal(rank) { return RANKS.indexOf(rank); }
  function suitVal(suit) { return SUITS.indexOf(suit); }

  function cardVal(card) {
    // Combined value for comparison: rank is primary, suit is tiebreaker
    return rankVal(card.rank) * 4 + suitVal(card.suit);
  }

  function cardCmp(a, b) { return cardVal(a) - cardVal(b); }

  function sortHand(hand) {
    hand.sort(cardCmp);
  }

  function cardsEqual(a, b) {
    return a.rank === b.rank && a.suit === b.suit;
  }

  /* ── Hand classification ── */
  // Returns { type, value } or null if invalid
  // type: 'single' | 'pair' | 'triple' | 'quad' | 'seq' | 'seqpair'
  // value: number for comparison (higher = beats lower of same type/length)

  function classifyHand(cards) {
    const n = cards.length;
    if (n === 0) return null;
    const sorted = [...cards].sort(cardCmp);

    if (n === 1) {
      return { type: 'single', len: 1, value: cardVal(sorted[0]) };
    }

    if (n === 2) {
      if (sorted[0].rank === sorted[1].rank) {
        return { type: 'pair', len: 2, value: cardVal(sorted[1]) };
      }
      return null;
    }

    if (n === 3) {
      if (sorted[0].rank === sorted[1].rank && sorted[1].rank === sorted[2].rank) {
        return { type: 'triple', len: 3, value: cardVal(sorted[2]) };
      }
      // 3-card sequence?
      if (isSeq(sorted)) {
        return { type: 'seq', len: 3, value: cardVal(sorted[n-1]) };
      }
      return null;
    }

    if (n === 4) {
      // Four-of-a-kind?
      if (sorted.every(c => c.rank === sorted[0].rank)) {
        return { type: 'quad', len: 4, value: cardVal(sorted[3]) };
      }
      // 4-card sequence?
      if (isSeq(sorted)) {
        return { type: 'seq', len: 4, value: cardVal(sorted[n-1]) };
      }
      // 2 consecutive pairs?
      if (n === 4 && sorted[0].rank === sorted[1].rank && sorted[2].rank === sorted[3].rank) {
        if (rankVal(sorted[2].rank) === rankVal(sorted[0].rank) + 1) {
          return { type: 'seqpair', len: 4, value: cardVal(sorted[3]), pairCount: 2 };
        }
      }
      return null;
    }

    // n >= 5
    // Sequence of pairs?
    if (n % 2 === 0) {
      const sp = trySeqPair(sorted);
      if (sp) return sp;
    }

    // Plain sequence (3+)?
    if (isSeq(sorted) && !sorted.some(c => c.rank === '2')) {
      return { type: 'seq', len: n, value: cardVal(sorted[n-1]) };
    }

    return null;
  }

  function isSeq(sorted) {
    // All consecutive ranks, no 2s allowed in sequences
    if (sorted.some(c => c.rank === '2')) return false;
    for (let i = 1; i < sorted.length; i++) {
      if (rankVal(sorted[i].rank) !== rankVal(sorted[i-1].rank) + 1) return false;
    }
    return true;
  }

  function trySeqPair(sorted) {
    const n = sorted.length;
    if (n < 4 || n % 2 !== 0) return null;
    // Group into pairs
    for (let i = 0; i < n; i += 2) {
      if (sorted[i].rank !== sorted[i+1].rank) return null;
    }
    // Check ranks are consecutive
    for (let i = 2; i < n; i += 2) {
      if (rankVal(sorted[i].rank) !== rankVal(sorted[i-2].rank) + 1) return null;
    }
    // No 2s (except seqpair can beat a single 2 if 3+ pairs — handled in beats())
    // Actually 2s can't be in a seqpair sequence
    if (sorted.some(c => c.rank === '2')) return null;
    const pairCount = n / 2;
    return { type: 'seqpair', len: n, value: cardVal(sorted[n-1]), pairCount };
  }

  /* ── Beat logic ── */
  function beats(challenger, pile) {
    if (!pile) return true;  // leading freely

    const ct = challenger.type;
    const pt = pile.type;

    // Special: beating a single 2
    if (pt === 'single' && pile.value >= rankVal('2') * 4) {
      // Only quad or seqpair with 3+ pairs can beat a 2
      return (ct === 'quad') ||
             (ct === 'seqpair' && challenger.pairCount >= 3);
    }

    // Types must match (and same length for seqs)
    if (ct !== pt) return false;
    if (ct === 'seq' || ct === 'seqpair') {
      if (challenger.len !== pile.len) return false;
    }

    return challenger.value > pile.value;
  }

  /* ── Turn management ── */
  function nextPlayer(p) { return (p + 1) % 4; }

  function playCards(playerIdx, cards) {
    const hand  = state.hands[playerIdx];
    const info  = classifyHand(cards);
    if (!info) return false;
    if (!beats(info, state.pileType)) return false;

    // First turn: must include 3♠
    if (state.firstTurn && playerIdx === state.leader) {
      const has3S = cards.some(c => c.rank === '3' && c.suit === '♠');
      if (!has3S) return false;
    }

    // Remove cards from hand
    for (const c of cards) {
      const idx = hand.findIndex(h => cardsEqual(h, c));
      if (idx === -1) return false;
      hand.splice(idx, 1);
    }

    state.pile      = cards.sort(cardCmp);
    state.pileOwner = playerIdx;
    state.pileType  = info;
    state.passes    = 0;
    state.firstTurn = false;

    addLog(playerIdx, describePlay(playerIdx, cards, info));

    // Check win
    if (hand.length === 0) {
      state.phase  = 'gameover';
      state.winner = playerIdx;
      state.scores[playerIdx]++;
      render();
      return true;
    }

    advanceTurn();
    return true;
  }

  function pass(playerIdx) {
    state.passes++;
    addLog(playerIdx, playerName(playerIdx) + ' passes.');

    // How many active players remain (not the pile owner)?
    const others = 3; // always 3 others
    if (state.passes >= others) {
      // All others passed — pile owner leads new round
      state.pile     = [];
      state.pileType = null;
      state.passes   = 0;
      state.current  = state.pileOwner;
      state.leader   = state.pileOwner;
      addLog(-1, '— New round — ' + playerName(state.pileOwner) + ' leads.');
      render();
      if (state.current !== PLAYER) {
        setTimeout(aiTurn, 700);
      }
      return;
    }

    advanceTurn();
  }

  function advanceTurn() {
    state.current = nextPlayer(state.current);
    render();
    if (state.current !== PLAYER) {
      setTimeout(aiTurn, 700);
    }
  }

  /* ── AI logic ── */
  function aiTurn() {
    if (state.phase !== 'playing') return;
    if (state.current === PLAYER) return;

    const idx  = state.current;
    const hand = state.hands[idx];
    const play = findAIPlay(hand, state.pileType, idx);

    if (play) {
      playCards(idx, play);
    } else {
      pass(idx);
    }
  }

  function findAIPlay(hand, pile, playerIdx) {
    // Generate all candidate plays and pick the lowest that beats the pile
    const candidates = generateCandidates(hand);
    let best = null;
    let bestVal = Infinity;

    for (const cards of candidates) {
      const info = classifyHand(cards);
      if (!info) continue;
      if (!beats(info, pile)) continue;
      if (info.value < bestVal) {
        bestVal = info.value;
        best    = cards;
      }
    }

    // If leading (no pile), play the single lowest non-2 card, or lowest pair, etc.
    if (!pile) {
      return findLeadPlay(hand, playerIdx);
    }

    return best;
  }

  function findLeadPlay(hand, playerIdx) {
    // Prefer pairs/triples of low cards; fallback to single lowest non-2
    const cands = generateCandidates(hand);

    // Try to play lowest pair first
    let best = null;
    let bestVal = Infinity;

    for (const cards of cands) {
      const info = classifyHand(cards);
      if (!info) continue;
      if (info.type === 'pair' && info.value < bestVal) {
        bestVal = info.value;
        best    = cards;
      }
    }
    if (best) return best;

    // Fallback: lowest single non-2
    const nonTwo = hand.filter(c => c.rank !== '2');
    if (nonTwo.length > 0) {
      return [nonTwo[0]];
    }
    // Last resort: lowest card
    return [hand[0]];
  }

  // Enumerate candidate plays from a hand
  function generateCandidates(hand) {
    const results = [];

    // Singles
    for (const c of hand) results.push([c]);

    // Group by rank
    const byRank = {};
    for (const c of hand) {
      if (!byRank[c.rank]) byRank[c.rank] = [];
      byRank[c.rank].push(c);
    }

    // Pairs, triples, quads
    for (const rank in byRank) {
      const group = byRank[rank];
      if (group.length >= 2) results.push(group.slice(0,2));
      if (group.length >= 3) results.push(group.slice(0,3));
      if (group.length >= 4) results.push(group.slice(0,4));
    }

    // Sequences of 3+
    const ranks = [...new Set(hand.map(c => c.rank))]
      .filter(r => r !== '2')
      .sort((a,b) => rankVal(a) - rankVal(b));

    for (let start = 0; start < ranks.length; start++) {
      let run = [ranks[start]];
      for (let end = start + 1; end < ranks.length; end++) {
        if (rankVal(ranks[end]) === rankVal(run[run.length-1]) + 1) {
          run.push(ranks[end]);
          if (run.length >= 3) {
            // Pick one card per rank
            const seqCards = run.map(r => byRank[r][0]);
            results.push(seqCards);
          }
        } else {
          break;
        }
      }
    }

    // Sequence of pairs (2 pairs minimum)
    for (let start = 0; start < ranks.length; start++) {
      if (!byRank[ranks[start]] || byRank[ranks[start]].length < 2) continue;
      let run = [ranks[start]];
      for (let end = start + 1; end < ranks.length; end++) {
        if (!byRank[ranks[end]] || byRank[ranks[end]].length < 2) break;
        if (rankVal(ranks[end]) === rankVal(run[run.length-1]) + 1) {
          run.push(ranks[end]);
          if (run.length >= 2) {
            const spCards = run.flatMap(r => byRank[r].slice(0,2));
            results.push(spCards);
          }
        } else {
          break;
        }
      }
    }

    return results;
  }

  /* ── Helpers ── */
  function playerName(idx) {
    if (idx === -1) return 'System';
    return idx === PLAYER ? 'You' : `AI ${idx}`;
  }

  function describePlay(idx, cards, info) {
    const who  = playerName(idx);
    const desc = cardsToString(cards);
    return `${who} played ${desc} (${info.type})`;
  }

  function cardsToString(cards) {
    return cards.map(c => c.rank + c.suit).join(' ');
  }

  function addLog(player, msg) {
    state.log.unshift({ player, msg });
    if (state.log.length > 20) state.log.length = 20;
  }

  /* ── Rendering ── */
  let selected = new Set(); // indices into player hand

  function render() {
    const container = document.getElementById('game-container');
    if (!container) return;

    if (state.phase === 'gameover') {
      renderGameOver(container);
      return;
    }

    container.innerHTML = buildGameHTML();
    wireEvents(container);
  }

  function buildGameHTML() {
    const isYourTurn = state.current === PLAYER;
    const statusMsg  = isYourTurn
      ? (state.pile.length === 0 ? 'Your turn — lead any hand.' : 'Your turn — beat the current play or pass.')
      : `${playerName(state.current)} is thinking…`;
    const statusCls  = isYourTurn ? 'your-turn' : 'ai-turn';

    return `
<div class="tl-game">
  <div class="tl-status-bar ${statusCls}">${statusMsg}</div>

  <div class="tl-table">
    ${renderOpponentTop()}
    ${renderOpponentSide(1, 'left')}
    ${renderCenter()}
    ${renderOpponentSide(3, 'right')}
  </div>

  ${renderPlayerArea()}
  ${renderLog()}
</div>`;
  }

  function renderOpponentTop() {
    return `
<div class="tl-opponent tl-opponent--top">
  ${renderOpponentInner(2)}
</div>`;
  }

  function renderOpponentSide(idx, side) {
    return `
<div class="tl-opponent tl-opponent--${side}">
  ${renderOpponentInner(idx)}
</div>`;
  }

  function renderOpponentInner(idx) {
    const n      = state.hands[idx].length;
    const active = state.current === idx ? ' active' : '';
    const backs  = Array(Math.min(n, 10)).fill('<div class="tl-card-back"></div>').join('');
    return `
  <span class="tl-opponent__name${active}">${playerName(idx)}${state.current === idx ? ' ●' : ''}</span>
  <div class="tl-opponent__cards">${backs}</div>
  <span class="tl-opponent__count">${n} card${n !== 1 ? 's' : ''}</span>`;
  }

  function renderCenter() {
    const pileHTML = state.pile.length === 0
      ? `<span class="tl-play-area-label">Play area</span>`
      : state.pile.map(c => cardHTML(c, false)).join('');

    const lastPlayer = state.pile.length > 0 && state.pileOwner >= 0
      ? `<div class="tl-last-player">Played by ${playerName(state.pileOwner)}</div>`
      : '';

    return `
<div class="tl-center">
  <div class="tl-play-area">${pileHTML}</div>
  ${lastPlayer}
</div>`;
  }

  function renderPlayerArea() {
    const hand = state.hands[PLAYER];
    const isYourTurn = state.current === PLAYER;
    const labelCls = isYourTurn ? ' active' : '';
    const canPlay  = isYourTurn && selected.size > 0;
    const canPass  = isYourTurn && state.pile.length > 0;

    const handHTML = hand.map((c, i) => {
      const isSel    = selected.has(i);
      const cls      = isYourTurn ? ' clickable' : '';
      const selCls   = isSel ? ' selected' : '';
      return `<div class="tl-card tl-card--${SUIT_COLORS[c.suit]}${cls}${selCls}" data-idx="${i}">${cardInner(c)}</div>`;
    }).join('');

    return `
<div class="tl-player-area">
  <div class="tl-player-label${labelCls}">You${isYourTurn ? ' ●' : ''} · ${hand.length} cards</div>
  <div class="tl-hand">${handHTML}</div>
  <div class="tl-actions">
    <button class="btn btn--primary" id="tl-play" ${canPlay ? '' : 'disabled'}>Play</button>
    <button class="btn btn--outline" id="tl-pass" ${canPass ? '' : 'disabled'}>Pass</button>
    <button class="btn btn--ghost"   id="tl-new">New Game</button>
  </div>
</div>`;
  }

  function renderLog() {
    const entries = state.log.slice(0, 8).map(e => {
      const cls = e.player === PLAYER ? ' you' : '';
      return `<li class="tl-log__entry${cls}">${escHtml(e.msg)}</li>`;
    }).join('');
    return `
<div class="tl-log">
  <div class="tl-log__title">Game log</div>
  <ul class="tl-log__list">${entries}</ul>
</div>`;
  }

  function cardHTML(card, clickable) {
    const color = SUIT_COLORS[card.suit];
    const cls   = clickable ? ' clickable' : '';
    return `<div class="tl-card tl-card--${color}${cls}">${cardInner(card)}</div>`;
  }

  function cardInner(card) {
    return `<span class="tl-card__rank">${card.rank}</span><span class="tl-card__suit">${card.suit}</span>`;
  }

  function renderGameOver(container) {
    const winner = state.winner;
    const isPlayer = winner === PLAYER;
    const icon = isPlayer ? '🏆' : '😔';
    const headline = isPlayer ? 'You Win!' : `${playerName(winner)} Wins`;
    const msg = isPlayer
      ? 'Congratulations! You played all your cards first.'
      : `${playerName(winner)} played all their cards first.`;

    container.innerHTML = `
<div class="tl-game">
  <div class="tl-gameover visible">
    <div class="tl-gameover__icon">${icon}</div>
    <h2>${headline}</h2>
    <p>${msg}</p>
    <button class="btn btn--primary" id="tl-new">Play Again</button>
  </div>
</div>`;

    const newBtn = container.querySelector('#tl-new');
    if (newBtn) newBtn.addEventListener('click', () => { selected.clear(); newGame(); });
  }

  function wireEvents(container) {
    // Card selection
    container.querySelectorAll('.tl-hand .tl-card.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        if (selected.has(idx)) selected.delete(idx);
        else selected.add(idx);
        render();
      });
    });

    // Play button
    const playBtn = container.querySelector('#tl-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (state.current !== PLAYER) return;
        const cards = [...selected].map(i => state.hands[PLAYER][i]);
        const ok = playCards(PLAYER, cards);
        if (ok) selected.clear();
        else {
          showError(container, 'Invalid play — that hand doesn\'t beat the current play.');
        }
      });
    }

    // Pass button
    const passBtn = container.querySelector('#tl-pass');
    if (passBtn) {
      passBtn.addEventListener('click', () => {
        if (state.current !== PLAYER) return;
        selected.clear();
        pass(PLAYER);
      });
    }

    // New game
    const newBtn = container.querySelector('#tl-new');
    if (newBtn) {
      newBtn.addEventListener('click', () => { selected.clear(); newGame(); });
    }
  }

  function showError(container, msg) {
    let err = container.querySelector('.tl-error');
    if (!err) {
      err = document.createElement('div');
      err.className = 'tl-error';
      err.style.cssText = 'color:#ff7070;font-size:var(--text-xs);text-align:center;padding:4px 0;';
      const actions = container.querySelector('.tl-actions');
      if (actions) actions.after(err);
    }
    err.textContent = msg;
    clearTimeout(err._t);
    err._t = setTimeout(() => { err.textContent = ''; }, 2500);
  }

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Bootstrap ── */
  function init() {
    const container = document.getElementById('game-container');
    if (!container) return;
    selected.clear();
    newGame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
