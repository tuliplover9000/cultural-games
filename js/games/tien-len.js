/**
 * tien-len.js — Tiến Lên (Vietnamese shedding card game)
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
  let vsOnline  = false;
  let isHost    = false;
  let mySeat    = 0;    // 0 = host, 2 = guest
  let twoPlayer = false; // 1v1 mode: seats 0 & 2 only, 26 cards each

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
    if (vsOnline) return false;              // no AI online
    return twoPlayer ? s === 2 : s !== PLAYER; // 1v1: seat 2 is AI; 4P: all non-0
  }
  // Perspective-aware name
  function pName(idx) {
    if (idx < 0) return '—';
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

    // Host runs AI if AI goes first; waits if guest (seat 2) goes first
    if (state.current !== mySeat && state.current !== 2) {
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
      if (window.Auth && Auth.isLoggedIn())
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
      addLog(-1, `— New round — ${pName(state.pileOwner)} leads.`);

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
        ? 'Your turn — beat the play or <em>pass</em>'
        : 'Your turn — lead any hand';
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

    return `<div class="tl-game${gameSpeed === 2 ? ' tl-fast' : ''}${twoPlayer ? ' tl-1v1' : ''}">
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
    const backs  = Array(show).fill('<div class="tl-card-back tl-card-back--sm"></div>').join('');
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
    const backs  = Array(show).fill('<div class="tl-card-back tl-card-back--xs"></div>').join('');
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

    return `<div class="tl-center">
  <div class="tl-play-area${hasPile ? ' has-cards' : ''}">${pileHTML}</div>
  ${info}
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
      <button class="tl-btn tl-btn--ghost" id="tl-new"${vsOnline ? ' disabled title="Leave room to start a new game"' : ''}>New Game</button>
      <button class="tl-btn tl-btn--ghost" id="tl-mode"${vsOnline ? ' disabled' : ''}>${twoPlayer ? '4-Player' : '1v1'}</button>
      <button class="tl-btn tl-btn--ghost tl-speed-btn${gameSpeed === 2 ? ' active' : ''}" id="tl-speed">2×</button>
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
    return `<div class="tl-card__corner tl-card__corner--tl"><div class="tl-card__rank">${c.rank}</div><div class="tl-card__suit-s">${c.suit}</div></div><div class="tl-card__center">${c.suit}</div><div class="tl-card__corner tl-card__corner--br"><div class="tl-card__rank">${c.rank}</div><div class="tl-card__suit-s">${c.suit}</div></div>`;
  }

  function renderGameOver(el) {
    const w   = state.winner;
    const isP = w === myPS();

    let btnLabel = 'Play Again';
    if (vsOnline && !isHost) btnLabel = 'Waiting for host…';

    el.innerHTML = `<div class="tl-game">
  <div class="tl-gameover visible">
    <div class="tl-gameover__icon">${isP ? '🏆' : '🃏'}</div>
    <h2>${isP ? 'Tiến Lên!' : `${pName(w)} Wins!`}</h2>
    <p>${isP ? 'You emptied your hand first. Go forward!' : `${pName(w)} played all their cards first.`}</p>
    <button class="tl-btn tl-btn--play" id="tl-new"${vsOnline && !isHost ? ' disabled' : ''}>${btnLabel}</button>
    ${vsOnline ? `<button class="tl-btn tl-btn--ghost" id="tl-leave" style="margin-top:0.5rem">Leave Room</button>` : ''}
  </div>
</div>`;

    el.querySelector('#tl-new')?.addEventListener('click', () => {
      if (vsOnline) {
        if (isHost) {
          // Re-deal in the same room — guest receives via subscription
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
        showHint('✗ Doesn\'t beat current play — try higher or pass'); return;
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
    if (!window.Multiplayer) return;
    Multiplayer.sendState({
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
      last_actor: Multiplayer.getPlayerId(),
    });
  }

  function receiveOnlineState(data) {
    if (!data || !vsOnline) return;
    if (data.last_actor === Multiplayer.getPlayerId()) return; // ignore own echo

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
      twoPlayer = true; // online is always 1v1 — no AI
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

}());
