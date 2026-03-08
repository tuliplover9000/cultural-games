/**
 * tien-len.js — Tiến Lên (Vietnamese shedding card game)
 * Phase 4 — crypto shuffle, proper card design, animations, AI thinking.
 *
 * Rules:
 *  - 4 players, 52-card deck, 13 cards each
 *  - Rank (low→high): 3 4 5 6 7 8 9 10 J Q K A 2
 *  - Suit (low→high): Spades Clubs Diamonds Hearts
 *  - Hands: single, pair, triple, four-of-a-kind,
 *           sequence (3+ consecutive, no 2s),
 *           sequence of pairs (2+ consecutive pairs, no 2s)
 *  - Beat same type + same length (for seq/seqpair) with higher value
 *  - Single 2 beaten only by four-of-a-kind or 3+ consecutive pairs
 *  - Player with 3♠ goes first and must include it in opening play
 *  - Pass: all others pass → pile owner leads new round freely
 *  - First to empty hand wins
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
  let selected = new Set();   // indices into player's hand
  let gameRenderCount = 0;    // tracks first render for deal animation
  let gameSpeed = 1;          // 1 = normal, 2 = fast (persists across games)
  let gameVersion = 0;        // incremented on new game to cancel stale AI timeouts

  function newGame() {
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
    deck.forEach((c, i) => hands[i % 4].push(c));
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

    // Special: single 2 beaten only by quad or 3+ seqpair
    if (pt === 'single' && pv >= rankVal('2') * 4)
      return mt === 'quad' || (mt === 'seqpair' && mp >= 3);

    if (mt !== pt) return false;
    if ((mt === 'seq' || mt === 'seqpair') && ml !== pl) return false;
    return mv > pv;
  }

  /* ── Turn mechanics ── */
  function playCards(playerIdx, cards) {
    const hand = state.hands[playerIdx];
    const info = classify(cards);
    if (!info || !beats(info, state.pileType)) return false;

    // First play of the game must include 3♠
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
      render();
      return true;
    }

    advanceTurn();
    return true;
  }

  function doPass(playerIdx) {
    state.passes++;
    state.aiThinking = false;
    addLog(playerIdx, `${pName(playerIdx)} passes.`);

    if (state.passes >= 3) {
      // All others passed — pile owner leads a new round
      state.pile            = [];
      state.pileType        = null;
      state.passes          = 0;
      state.current         = state.pileOwner;
      state.leader          = state.pileOwner;
      state.pileJustChanged = true;
      addLog(-1, `— New round — ${pName(state.pileOwner)} leads.`);
      if (state.current !== PLAYER) {
        scheduleAITurn();
      } else {
        render();
      }
      return;
    }

    advanceTurn();
  }

  function advanceTurn() {
    state.current = (state.current + 1) % 4;
    if (state.current !== PLAYER) {
      scheduleAITurn();
    } else {
      render();
    }
  }

  /* ── AI ── */
  function scheduleAITurn() {
    state.aiThinking = true;
    render();
    const id = gameVersion;
    const delay = gameSpeed === 2
      ? 300 + cryptoRandInt(300)   // fast: 300–600 ms
      : 800 + cryptoRandInt(700);  // normal: 800–1500 ms
    setTimeout(() => { if (gameVersion === id) runAI(); }, delay);
  }

  function runAI() {
    if (state.phase !== 'playing' || state.current === PLAYER) return;
    const idx  = state.current;
    const hand = state.hands[idx];

    // First turn: leader must play 3♠
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
    // Prefer lowest pair; fallback to lowest non-2 single
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

    // Sequences (3+ cards)
    for (let s = 0; s < uRanks.length; s++) {
      let run = [uRanks[s]];
      for (let e = s + 1; e < uRanks.length; e++) {
        if (rankVal(uRanks[e]) !== rankVal(run[run.length-1]) + 1) break;
        run.push(uRanks[e]);
        if (run.length >= 3) out.push(run.map(r => byRank[r][0]));
      }
    }

    // Sequence of pairs (2+ consecutive pairs)
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
  function pName(idx) {
    if (idx < 0) return '—';
    return SEAT_NAMES[idx] || '?';
  }

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
    const isYT     = state.current === PLAYER && !state.aiThinking;
    const thinking = state.aiThinking;

    let statusInner, statusCls = '';
    if (thinking) {
      statusInner = `${pName(state.current)} is thinking <span class="tl-thinking-dots"><span></span><span></span><span></span></span>`;
    } else if (isYT) {
      statusInner = state.pile.length
        ? 'Your turn — beat the play or <em>pass</em>'
        : 'Your turn — lead any hand';
      statusCls = 'your-turn';
    } else {
      statusInner = `${pName(state.current)}'s turn`;
    }

    // Hand-type hint for selected cards
    const hand     = state.hands[PLAYER];
    const selCards = [...selected].map(i => hand[i]);
    const selInfo  = selCards.length ? classify(selCards) : null;
    let hintText = '', hintCls = '';
    if (selCards.length) {
      if (selInfo) { hintText = `✓ ${TYPE_LABEL[selInfo.type]}`; hintCls = 'valid'; }
      else         { hintText = '✗ Not a valid hand';            hintCls = 'invalid'; }
    }

    return `<div class="tl-game${gameSpeed === 2 ? ' tl-fast' : ''}">
  <div class="tl-status-bar ${statusCls}">${statusInner}</div>
  <div class="tl-table">
    ${zoneTop()}
    ${zoneSide(1, 'left')}
    ${centerArea(justChanged)}
    ${zoneSide(3, 'right')}
  </div>
  ${playerArea(isYT, isFirst)}
  <div class="tl-hint ${hintCls}">${hintText}</div>
  ${logArea()}
</div>`;
  }

  function zoneTop() {
    const n      = state.hands[2].length;
    const active = state.current === 2;
    const show   = Math.min(n, 11);
    const backs  = Array(show).fill('<div class="tl-card-back tl-card-back--sm"></div>').join('');
    return `<div class="tl-zone tl-zone--top">
  <div class="tl-zone__name${active ? ' active' : ''}">Across${active ? ' ●' : ''}</div>
  <div class="tl-opp-cards--top">${backs}</div>
  <div class="tl-zone__count">${n} card${n !== 1 ? 's' : ''}</div>
</div>`;
  }

  function zoneSide(idx, side) {
    const n      = state.hands[idx].length;
    const active = state.current === idx;
    const name   = SEAT_NAMES[idx];
    const show   = Math.min(n, 6);
    const backs  = Array(show).fill('<div class="tl-card-back tl-card-back--xs"></div>').join('');
    return `<div class="tl-zone tl-zone--${side}">
  <div class="tl-zone__name${active ? ' active' : ''}">${name}${active ? ' ●' : ''}</div>
  <div class="tl-opp-cards--side">${backs}</div>
  <div class="tl-zone__count">${n}</div>
</div>`;
  }

  /* ── Pile animation helpers ── */
  function fromDir(playerIdx) {
    // Returns CSS translate offsets representing where cards fly FROM
    switch (playerIdx) {
      case 1:  return { x: '-260px', y:  '20px' };   // Left
      case 2:  return { x:    '0px', y: '-160px' };  // Across / Top
      case 3:  return { x:  '260px', y:  '20px' };   // Right
      default: return { x:    '0px', y:  '160px' };  // You / Bottom
    }
  }

  function pileRot(card, i) {
    // Deterministic rotation in [-5, +5] degrees — looks like cards thrown on a table
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

    return `<div class="tl-center">
  <div class="tl-play-area${hasPile ? ' has-cards' : ''}">${pileHTML}</div>
  ${info}
</div>`;
  }

  function playerArea(isYT, isFirst) {
    const hand    = state.hands[PLAYER];
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
      <button class="tl-btn tl-btn--play" id="tl-play" ${canPlay ? '' : 'disabled'}>Play</button>
      <button class="tl-btn tl-btn--pass" id="tl-pass" ${canPass ? '' : 'disabled'}>Pass</button>
    </div>
    <div class="tl-actions__secondary">
      <button class="tl-btn tl-btn--ghost" id="tl-new">New Game</button>
      <button class="tl-btn tl-btn--ghost tl-speed-btn${gameSpeed === 2 ? ' active' : ''}" id="tl-speed">2× Speed</button>
    </div>
  </div>
</div>`;
  }

  function logArea() {
    const rows = state.log.slice(0, 10).map(e => {
      const cls = e.player === PLAYER ? ' you' : e.player < 0 ? ' sys' : '';
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
    return `<div class="tl-card__corner tl-card__corner--tl"><div class="tl-card__rank">${c.rank}</div><div class="tl-card__suit-s">${c.suit}</div></div><div class="tl-card__center">${c.suit}</div><div class="tl-card__corner tl-card__corner--br"><div class="tl-card__rank">${c.rank}</div><div class="tl-card__suit-s">${c.suit}</div></div>`;
  }

  function renderGameOver(el) {
    const w   = state.winner;
    const isP = w === PLAYER;
    el.innerHTML = `<div class="tl-game">
  <div class="tl-gameover visible">
    <div class="tl-gameover__icon">${isP ? '🏆' : '🃏'}</div>
    <h2>${isP ? 'Tiến Lên!' : `${pName(w)} Wins!`}</h2>
    <p>${isP ? 'You emptied your hand first. Go forward!' : `${pName(w)} played all their cards first.`}</p>
    <button class="tl-btn tl-btn--play" id="tl-new">Play Again</button>
  </div>
</div>`;
    el.querySelector('#tl-new').addEventListener('click', newGame);
  }

  /* ── Event wiring ── */
  function wireEvents(el) {
    // Card selection
    el.querySelectorAll('.tl-hand .tl-card.clickable').forEach(card => {
      card.addEventListener('click', () => {
        const i = +card.dataset.idx;
        selected.has(i) ? selected.delete(i) : selected.add(i);
        render();
      });
    });

    // Play
    el.querySelector('#tl-play')?.addEventListener('click', () => {
      if (state.current !== PLAYER || state.aiThinking) return;
      const cards = [...selected].map(i => state.hands[PLAYER][i]);
      const info  = classify(cards);
      const hint  = el.querySelector('.tl-hint');

      function showHint(msg) {
        if (hint) { hint.textContent = msg; hint.className = 'tl-hint invalid'; }
      }

      if (!info) {
        showHint('✗ Not a valid hand type'); return;
      }
      if (state.firstTurn && state.leader === PLAYER && !cards.some(c => c.rank === '3' && c.suit === '♠')) {
        showHint('✗ First play must include the 3♠'); return;
      }
      if (state.pileType && !beats(info, state.pileType)) {
        showHint('✗ Doesn\'t beat current play — try higher or pass'); return;
      }

      selected.clear();
      playCards(PLAYER, cards);
    });

    // Pass
    el.querySelector('#tl-pass')?.addEventListener('click', () => {
      if (state.current !== PLAYER || state.aiThinking) return;
      selected.clear();
      doPass(PLAYER);
    });

    // New game
    el.querySelector('#tl-new')?.addEventListener('click', newGame);

    // Speed toggle
    el.querySelector('#tl-speed')?.addEventListener('click', () => {
      gameSpeed = gameSpeed === 2 ? 1 : 2;
      render();
    });
  }

  /* ── Init ── */
  function init() {
    if (document.getElementById('game-container')) newGame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
