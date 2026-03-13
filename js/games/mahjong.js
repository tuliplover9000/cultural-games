/**
 * mahjong.js — Hong Kong (Cantonese) Mahjong
 * 4 players · 136 tiles · 16-tile hands (13 + draw) · fan-based scoring
 *
 * Seat layout from human's perspective (seat 0 = bottom):
 *   Seat 0 = You (bottom)
 *   Seat 1 = Right opponent
 *   Seat 2 = Across (top)
 *   Seat 3 = Left opponent
 *
 * Online: host = seat 0, guest = seat 2. Mirrors tien-len.js room pattern.
 */
(function () {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────────────── */

  const SUIT_DATA = {
    c: { name: 'Characters', cls: 'char',   symbols: ['一','二','三','四','五','六','七','八','九'] },
    b: { name: 'Bamboo',     cls: 'bamboo', symbols: ['①','②','③','④','⑤','⑥','⑦','⑧','⑨'] },
    o: { name: 'Circles',    cls: 'circle', symbols: ['①','②','③','④','⑤','⑥','⑦','⑧','⑨'] },
  };

  const HONOUR_DATA = {
    wE: { name: 'East Wind',    cls: 'wind',     symbol: '東' },
    wS: { name: 'South Wind',   cls: 'wind',     symbol: '南' },
    wW: { name: 'West Wind',    cls: 'wind',     symbol: '西' },
    wN: { name: 'North Wind',   cls: 'wind',     symbol: '北' },
    dR: { name: 'Red Dragon',   cls: 'dragon-r', symbol: '中' },
    dG: { name: 'Green Dragon', cls: 'dragon-g', symbol: '發' },
    dW: { name: 'White Dragon', cls: 'dragon-w', symbol: '白' },
  };

  // Absolute seat index → screen position label
  const SEAT_POS  = ['bottom', 'right', 'top', 'left'];
  const SEAT_NAME = ['You', 'Right', 'Across', 'Left'];
  const WINDS     = ['East', 'South', 'West', 'North'];
  const WIND_SYM  = { East: '東', South: '南', West: '西', North: '北' };

  /* ── Online state ───────────────────────────────────────────────────────── */

  let vsOnline = false;
  let isHost   = false;
  let mySeat   = 0;

  /* ── Stale-timeout guard ────────────────────────────────────────────────── */

  let gameVersion = 0;

  /* ── State ──────────────────────────────────────────────────────────────── */

  let state = {};

  function freshState() {
    return {
      phase:            'idle',   // idle|dealing|player-draw|player-discard|claiming|ai-turn|round-over|game-over
      round:            1,        // wind-round counter (1=East, 2=South)
      roundWind:        'East',
      dealer:           0,        // absolute seat index
      turnIdx:          0,        // whose turn it is

      wall:             [],       // tiles to draw from (pop from end)
      deadWall:         [],       // reserved for kong replacement draws

      hands:            [[], [], [], []],
      melds:            [[], [], [], []],   // [{ type, tiles, open }]
      discards:         [[], [], [], []],

      scores:           [100, 100, 100, 100],

      lastDiscard:      null,     // { tile, fromSeat }
      drawnTileUid:     null,     // highlight the most recently drawn tile
      selectedTileUid:  null,     // human's selected tile for discard
      claimWindow:      false,
      claimDecisions:   [],       // [{ seat, action }]
      claimTimeout:     null,

      isDraw:           false,    // round ended by wall exhaustion

      statusMsg:        '',
      overlayContent:   '',
      log:              [],
    };
  }

  /* ── Tile system ─────────────────────────────────────────────────────────── */

  function buildWall() {
    const tiles = [];
    let uid = 0;
    ['c', 'b', 'o'].forEach(suit => {
      for (let n = 1; n <= 9; n++) {
        for (let copy = 0; copy < 4; copy++) {
          tiles.push({
            id:     `${suit}${n}`,
            suit,
            num:    n,
            uid:    uid++,
            cls:    SUIT_DATA[suit].cls,
            symbol: SUIT_DATA[suit].symbols[n - 1],
            name:   `${n} of ${SUIT_DATA[suit].name}`,
          });
        }
      }
    });
    Object.entries(HONOUR_DATA).forEach(([id, h]) => {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push({
          id,
          suit:   id.startsWith('w') ? 'wind' : 'dragon',
          num:    null,
          uid:    uid++,
          cls:    h.cls,
          symbol: h.symbol,
          name:   h.name,
        });
      }
    });
    return tiles; // 136 tiles
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ── Helpers ─────────────────────────────────────────────────────────────── */

  function addLog(msg) {
    state.log.unshift(msg);
    if (state.log.length > 30) state.log.length = 30;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;');
  }

  function setStatus(msg) {
    state.statusMsg = msg;
  }

  function seatWindForRound(seatIdx) {
    // Dealer = East, next clockwise = South, etc.
    const offset = (seatIdx - state.dealer + 4) % 4;
    return WINDS[offset];
  }

  function seatName(seatIdx) {
    if (!vsOnline) return SEAT_NAME[seatIdx];
    return ['You', 'Right', 'Across', 'Left'][(seatIdx - mySeat + 4) % 4];
  }

  // Returns absolute seat for screen position (0=bottom, 1=right, 2=top, 3=left)
  function viewSeat(pos) { return (mySeat + pos) % 4; }

  function myPS() { return vsOnline ? mySeat : 0; }

  function isAISeat(s) {
    if (vsOnline) return false; // no AI online (host handles nothing online for now)
    return s !== 0;
  }

  // Remove up to `count` tiles with given id from hand, return them
  function takeTilesById(hand, id, count) {
    const taken = [];
    for (let i = hand.length - 1; i >= 0 && taken.length < count; i--) {
      if (hand[i].id === id) taken.push(...hand.splice(i, 1));
    }
    return taken;
  }

  /* ── Win detection ───────────────────────────────────────────────────────── */

  function canWinWithTile(seatIdx, tile) {
    const testHand = [...state.hands[seatIdx], tile];
    return isWinningHand(testHand, state.melds[seatIdx]);
  }

  function isWinningHand(hand, melds) {
    const openSets   = melds.length;
    const setsNeeded = 4 - openSets;
    // Each kong occupies 4 tiles in the meld, chow/pung = 3
    // For isWinningHand, we count meld sizes correctly:
    const meldTileCount = melds.reduce((sum, m) => sum + m.tiles.length, 0);
    const needed = setsNeeded * 3 + 2; // tiles that should be in hand
    if (hand.length !== needed) return false;

    const handIds   = hand.map(t => t.id);
    const uniqueIds = [...new Set(handIds)];
    for (const pairId of uniqueIds) {
      if (handIds.filter(id => id === pairId).length < 2) continue;
      const remaining = [...handIds];
      remaining.splice(remaining.indexOf(pairId), 1);
      remaining.splice(remaining.indexOf(pairId), 1);
      if (canFormSets(remaining, setsNeeded)) return true;
    }
    return false;
  }

  function canFormSets(ids, setsNeeded) {
    if (setsNeeded === 0) return ids.length === 0;
    if (ids.length < 3)   return false;
    const first = ids[0];

    // Try pung
    if (ids.filter(id => id === first).length >= 3) {
      const rem = [...ids];
      for (let i = 0; i < 3; i++) rem.splice(rem.indexOf(first), 1);
      if (canFormSets(rem, setsNeeded - 1)) return true;
    }

    // Try chow (numbered tiles only)
    if (/^[cbo]\d$/.test(first)) {
      const suit = first[0], n = parseInt(first[1]);
      const s1   = `${suit}${n + 1}`, s2 = `${suit}${n + 2}`;
      if (ids.includes(s1) && ids.includes(s2)) {
        const rem = [...ids];
        rem.splice(rem.indexOf(first), 1);
        rem.splice(rem.indexOf(s1),    1);
        rem.splice(rem.indexOf(s2),    1);
        if (canFormSets(rem, setsNeeded - 1)) return true;
      }
    }

    return false;
  }

  /* ── Claim helpers ───────────────────────────────────────────────────────── */

  function getChowOptions(hand, tile) {
    if (!tile.num) return [];
    if (!['c', 'b', 'o'].includes(tile.suit)) return [];
    const suit    = tile.suit;
    const n       = tile.num;
    const handIds = hand.map(t => t.id);
    const options = [];

    if (n <= 7 && handIds.includes(`${suit}${n+1}`) && handIds.includes(`${suit}${n+2}`))
      options.push([tile.id, `${suit}${n+1}`, `${suit}${n+2}`]);
    if (n >= 2 && n <= 8 && handIds.includes(`${suit}${n-1}`) && handIds.includes(`${suit}${n+1}`))
      options.push([`${suit}${n-1}`, tile.id, `${suit}${n+1}`]);
    if (n >= 3 && handIds.includes(`${suit}${n-2}`) && handIds.includes(`${suit}${n-1}`))
      options.push([`${suit}${n-2}`, `${suit}${n-1}`, tile.id]);

    return options;
  }

  function getValidClaims(seatIdx, tile, discardingSeat) {
    if (seatIdx === discardingSeat) return [];
    const hand     = state.hands[seatIdx];
    const claims   = [];
    const matching = hand.filter(t => t.id === tile.id).length;

    if (canWinWithTile(seatIdx, tile)) claims.push('win');
    if (matching >= 3) claims.push('kong');
    if (matching >= 2) claims.push('pung');

    const leftSeat = (discardingSeat + 1) % 4;
    if (seatIdx === leftSeat) {
      getChowOptions(hand, tile).forEach(seq =>
        claims.push({ type: 'chow', sequence: seq })
      );
    }

    return claims;
  }

  /* ── Fan / scoring ───────────────────────────────────────────────────────── */

  function calculateFan(seatIdx, winType) {
    let fan      = 0;
    const hand   = state.hands[seatIdx];
    const melds  = state.melds[seatIdx];
    const all    = [...hand, ...melds.flatMap(m => m.tiles)];

    if (winType === 'self-draw') fan += 1;

    // All Pung: all 4 melds are pungs or kongs
    if (melds.length === 4 && melds.every(m => m.type === 'pung' || m.type === 'kong'))
      fan += 3;

    // Flush checks
    const suited     = all.filter(t => ['c','b','o'].includes(t.suit));
    const suits      = new Set(suited.map(t => t.suit));
    const hasHonours = all.some(t => t.suit === 'wind' || t.suit === 'dragon');

    if      (suits.size === 1 && !hasHonours) fan += 7; // Full Flush 清一色
    else if (suits.size === 1 &&  hasHonours) fan += 3; // Half Flush 混一色

    // Dragon / wind pungs
    const seatWind  = seatWindForRound(seatIdx);
    const roundWind = state.roundWind;
    melds.forEach(m => {
      if (m.type !== 'pung' && m.type !== 'kong') return;
      const t = m.tiles[0];
      if (t.suit === 'dragon')                     fan += 1;
      if (t.id === `w${seatWind[0]}`)              fan += 1;
      if (t.id === `w${roundWind[0]}`)             fan += 1;
    });

    // Last tile
    if (state.wall.length <= 1) fan += 2;

    return Math.max(fan, 1);
  }

  function calculatePayout(fan) {
    return Math.pow(2, fan);
  }

  /* ── Rendering ───────────────────────────────────────────────────────────── */

  function tileHTML(tile, opts) {
    opts = opts || {};
    const cls = [
      'mj-tile',
      opts.back        ? 'mj-tile--back'         : `mj-tile--${tile.cls}`,
      opts.selectable  ? 'mj-tile--selectable'   : '',
      opts.selected    ? 'mj-tile--selected'      : '',
      opts.latest      ? 'mj-tile--latest'        : '',
      opts.small       ? 'mj-tile--sm'            : '',
      opts.lastDiscard ? 'mj-tile--discard-last'  : '',
    ].filter(Boolean).join(' ');

    const label     = opts.back ? '' : esc(tile.symbol);
    const numSub    = (tile.num && !opts.back)
      ? `<span class="mj-tile-num">${tile.num}</span>` : '';
    const ariaLabel = opts.back ? 'Face-down tile' : tile.name;

    return `<div class="${cls}" data-uid="${tile.uid}" aria-label="${esc(ariaLabel)}" role="img">${label}${numSub}</div>`;
  }

  function meldHTML(meld) {
    return `<div class="mj-meld">${meld.tiles.map(t => tileHTML(t, {})).join('')}</div>`;
  }

  function buildDiscardPool(seatIdx) {
    const discards = state.discards[seatIdx];
    const show     = discards.slice(-12);
    return show.map((t, i) => {
      const isLast = i === show.length - 1
        && state.lastDiscard
        && state.lastDiscard.fromSeat === seatIdx;
      return tileHTML(t, { small: true, lastDiscard: isLast });
    }).join('');
  }

  function buildOpponentArea(seatIdx) {
    const pos    = SEAT_POS[seatIdx];
    const hand   = state.hands[seatIdx];
    const melds  = state.melds[seatIdx];
    const wind   = seatWindForRound(seatIdx);
    const score  = state.scores[seatIdx];
    const name   = seatName(seatIdx);
    const active = state.turnIdx === seatIdx;
    const dot    = active ? ` <span class="mj-active-dot" aria-hidden="true">●</span>` : '';

    const handTiles  = hand.map(t => tileHTML(t, { back: true })).join('');
    const meldHTMLs  = melds.map(meldHTML).join('');
    const discardPool = buildDiscardPool(seatIdx);

    return `<div class="mj-opponent mj-opponent--${pos}" data-seat="${seatIdx}">
  <div class="mj-opp-info">
    <span class="mj-opp-name">${esc(name)}${dot}</span>
    <span class="mj-opp-wind">${WIND_SYM[wind]}</span>
    <span class="mj-opp-score">${score}pt</span>
  </div>
  <div class="mj-opp-hand">${handTiles}<span style="font-size:0.72rem;color:#777;margin-left:4px">${hand.length}</span></div>
  <div class="mj-opp-melds">${meldHTMLs}</div>
  <div class="mj-discard-pool">${discardPool}</div>
</div>`;
  }

  function buildClaimButtons() {
    if (!state.claimWindow || !state.lastDiscard) return '';
    const { tile, fromSeat } = state.lastDiscard;
    if (fromSeat === myPS()) return '';

    const claims = getValidClaims(myPS(), tile, fromSeat);
    if (!claims.length) return '';

    const btns = claims.map(claim => {
      if (typeof claim === 'string') {
        const labels = { win: 'Win (糊)', kong: 'Kong (槓)', pung: 'Pung (碰)' };
        return `<button class="mj-btn mj-claim-btn" data-action="${esc(claim)}">${labels[claim]}</button>`;
      }
      const seqStr = claim.sequence.join('-');
      return `<button class="mj-btn mj-claim-btn" data-action="chow" data-sequence="${esc(seqStr)}">Chow (吃)</button>`;
    }).join('');

    return `<div class="mj-claim-btns-inner">
  ${btns}
  <button class="mj-btn mj-btn--secondary mj-claim-btn" data-action="pass">Pass</button>
</div>`;
  }

  function buildTableCenter() {
    return `<div class="mj-table-center" id="mj-table-center">
  <div class="mj-wall-count">${state.wall.length} tiles left</div>
  <div class="mj-round-info">${esc(state.roundWind)} Wind · Round ${state.round}</div>
  <p class="mj-status" id="mj-status" aria-live="assertive">${esc(state.statusMsg)}</p>
  <div class="mj-claim-btns" id="mj-claim-btns" aria-live="polite">${buildClaimButtons()}</div>
</div>`;
  }

  function buildPlayerArea() {
    const ps       = myPS();
    const hand     = state.hands[ps];
    const melds    = state.melds[ps];
    const phase    = state.phase;
    const wind     = seatWindForRound(ps);
    const score    = state.scores[ps];
    const active   = state.turnIdx === ps;
    const dot      = active ? ` <span class="mj-active-dot" aria-hidden="true">●</span>` : '';

    const isDiscard = phase === 'player-discard';
    const isDraw    = phase === 'player-draw';

    const handTiles = hand.map(t => tileHTML(t, {
      selectable:  isDiscard,
      selected:    t.uid === state.selectedTileUid,
      latest:      t.uid === state.drawnTileUid,
    })).join('');

    const meldHTMLs  = melds.map(meldHTML).join('');
    const discardPool = buildDiscardPool(ps);

    const drawDis    = !(isDraw && !state.animating);
    const discardDis = !(isDiscard && state.selectedTileUid !== null);
    const winnable   = isDiscard && isWinningHand(state.hands[ps], state.melds[ps]);
    const winDis     = !winnable;

    return `<div class="mj-player-area" id="mj-player-area">
  <div class="mj-player-melds">${meldHTMLs}</div>
  <div class="mj-player-hand" id="mj-player-hand">${handTiles}</div>
  <div class="mj-discard-pool mj-player-discards">${discardPool}</div>
  <div class="mj-player-info">
    <span class="mj-player-wind">You · ${WIND_SYM[wind]}</span>
    <span class="mj-player-score">${score}pt${dot}</span>
  </div>
  <div class="mj-controls" id="mj-controls">
    <button id="mj-draw-btn"     class="mj-btn"             ${drawDis    ? 'disabled' : ''}>Draw</button>
    <button id="mj-discard-btn"  class="mj-btn"             ${discardDis ? 'disabled' : ''}>Discard</button>
    <button id="mj-win-btn"      class="mj-btn mj-btn--win" ${winDis     ? 'disabled' : ''}>Win (糊)</button>
    <button id="mj-new-game-btn" class="mj-btn mj-btn--secondary">New Game</button>
  </div>
</div>`;
  }

  function buildLog() {
    if (!state.log.length) return '';
    const rows = state.log.slice(0, 15).map((m, i) =>
      `<li${i === 0 ? ' class="mj-log-latest"' : ''}>${esc(m)}</li>`
    ).join('');
    return `<ol class="mj-log" aria-label="Game log" reversed>${rows}</ol>`;
  }

  function buildWinOverlay() {
    if (state.phase !== 'round-over' && state.phase !== 'game-over') return '';
    const nextBtn = state.phase === 'round-over'
      ? `<button class="mj-btn" id="mj-next-round-btn">Next Round</button>` : '';
    return `<div class="mj-overlay" id="mj-overlay">
  <div class="mj-overlay-card">
    ${state.overlayContent}
    <div style="margin-top:1.5rem;display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
      ${nextBtn}
      <button class="mj-btn mj-btn--secondary" id="mj-new-game-overlay-btn">New Game</button>
    </div>
  </div>
</div>`;
  }

  function buildMahjongUI() {
    if (state.phase === 'idle') {
      return `<div class="mj-wrap">
  <div class="mj-start-area">
    <p style="color:var(--mj-gold-light);text-align:center;margin-bottom:1rem;font-size:1.1rem">
      Hong Kong Mahjong — 4 Players
    </p>
    <div style="text-align:center">
      <button class="mj-btn" id="mj-start-btn">Deal Tiles</button>
    </div>
  </div>
</div>`;
    }

    return `<div class="mj-wrap">
  ${buildOpponentArea(viewSeat(2))}
  <div class="mj-middle-row">
    ${buildOpponentArea(viewSeat(3))}
    ${buildTableCenter()}
    ${buildOpponentArea(viewSeat(1))}
  </div>
  ${buildPlayerArea()}
  ${buildLog()}
  ${buildWinOverlay()}
</div>`;
  }

  function render() {
    const el = document.getElementById('game-container');
    if (!el) return;
    el.innerHTML = buildMahjongUI();
    wireEvents(el);
  }

  function wireEvents(el) {
    // Start / new game
    el.querySelector('#mj-start-btn')?.addEventListener('click', () => {
      state.dealer  = 0;
      state.turnIdx = 0;
      dealRound();
    });

    el.querySelector('#mj-new-game-btn')?.addEventListener('click', newGame);
    el.querySelector('#mj-new-game-overlay-btn')?.addEventListener('click', newGame);
    el.querySelector('#mj-next-round-btn')?.addEventListener('click', startNextRound);

    // Draw
    el.querySelector('#mj-draw-btn')?.addEventListener('click', () => {
      if (state.phase !== 'player-draw' || state.animating) return;
      const tile = drawTile(myPS());
      if (tile) startPlayerDiscard();
    });

    // Discard button
    el.querySelector('#mj-discard-btn')?.addEventListener('click', () => {
      if (state.phase !== 'player-discard') return;
      if (state.selectedTileUid === null) { setStatus('Select a tile first.'); render(); return; }
      discardTile(myPS(), state.selectedTileUid);
    });

    // Self-draw win button
    el.querySelector('#mj-win-btn')?.addEventListener('click', () => {
      const ps = myPS();
      if (state.phase !== 'player-discard') return;
      if (!isWinningHand(state.hands[ps], state.melds[ps])) return;
      declareWin(ps, 'self-draw');
    });

    // Tile selection in hand
    el.querySelector('#mj-player-hand')?.addEventListener('click', e => {
      const tileEl = e.target.closest('.mj-tile');
      if (!tileEl || state.phase !== 'player-discard') return;
      const uid = parseInt(tileEl.dataset.uid);
      state.selectedTileUid = (state.selectedTileUid === uid) ? null : uid;
      render();
    });

    // Claim buttons (delegated from container)
    el.querySelector('#mj-claim-btns')?.addEventListener('click', e => {
      const btn = e.target.closest('.mj-claim-btn');
      if (!btn) return;
      clearTimeout(state.claimTimeout);
      const action = btn.dataset.action;
      if (action === 'chow') {
        const seq = btn.dataset.sequence.split('-');
        recordClaimDecision(myPS(), { type: 'chow', sequence: seq });
      } else {
        recordClaimDecision(myPS(), action);
      }
    });
  }

  /* ── Game logic ──────────────────────────────────────────────────────────── */

  function dealRound() {
    gameVersion++;
    state.phase           = 'dealing';
    state.wall            = shuffle(buildWall());
    state.deadWall        = state.wall.splice(0, 14);
    state.hands           = [[], [], [], []];
    state.melds           = [[], [], [], []];
    state.discards        = [[], [], [], []];
    state.lastDiscard     = null;
    state.drawnTileUid    = null;
    state.selectedTileUid = null;
    state.claimWindow     = false;
    state.claimDecisions  = [];
    clearTimeout(state.claimTimeout);

    // Deal 4 tiles × 3 passes to each player, then 1 more each
    for (let pass = 0; pass < 3; pass++) {
      for (let s = 0; s < 4; s++) {
        for (let t = 0; t < 4; t++) state.hands[s].push(state.wall.pop());
      }
    }
    for (let s = 0; s < 4; s++) state.hands[s].push(state.wall.pop());

    // Dealer draws 1 extra → starts with 14, must discard first
    state.hands[state.dealer].push(state.wall.pop());

    addLog(`Round ${state.round} · ${state.roundWind} Wind · ${seatName(state.dealer)} deals.`);

    if (state.dealer === myPS()) {
      state.turnIdx = myPS();
      startPlayerDiscard();
    } else {
      state.turnIdx = state.dealer;
      startAiTurn(state.dealer, true); // skip draw — dealer already has 14
    }
  }

  function drawTile(seatIdx) {
    if (state.wall.length === 0) { exhaustedDraw(); return null; }
    const tile = state.wall.pop();
    state.hands[seatIdx].push(tile);
    if (seatIdx === myPS()) state.drawnTileUid = tile.uid;
    return tile;
  }

  function drawFromDeadWall(seatIdx) {
    const src = state.deadWall.length > 0 ? state.deadWall : state.wall;
    if (!src.length) { exhaustedDraw(); return null; }
    const tile = src.pop();
    state.hands[seatIdx].push(tile);
    if (seatIdx === myPS()) state.drawnTileUid = tile.uid;
    return tile;
  }

  function exhaustedDraw() {
    state.phase          = 'round-over';
    state.isDraw         = true;
    state.overlayContent = '<h2>Draw Round</h2><p>The wall is exhausted — no winner. Dealer redeals.</p>';
    addLog('Wall exhausted — draw round.');
    render();
  }

  function startPlayerDiscard() {
    state.phase = 'player-discard';
    setStatus('Select a tile to discard.');
    render();
  }

  function discardTile(seatIdx, tileUid) {
    const hand = state.hands[seatIdx];
    const idx  = hand.findIndex(t => t.uid === tileUid);
    if (idx === -1) return;
    const [tile]          = hand.splice(idx, 1);
    state.discards[seatIdx].push(tile);
    state.lastDiscard     = { tile, fromSeat: seatIdx };
    state.drawnTileUid    = null;
    state.selectedTileUid = null;
    addLog(`${seatName(seatIdx)} discards ${tile.id}.`);
    render();

    if (vsOnline && seatIdx === myPS()) syncOnlineState();

    openClaimWindow(seatIdx);
  }

  function openClaimWindow(discardingSeat) {
    state.claimWindow    = true;
    state.claimDecisions = [];
    const tile           = state.lastDiscard.tile;
    const ver            = gameVersion;
    const ps             = myPS();

    // Human's claim (only if they didn't discard)
    if (discardingSeat !== ps) {
      const humanClaims = getValidClaims(ps, tile, discardingSeat);
      if (humanClaims.length > 0) {
        setStatus('Claim this tile?');
        render(); // shows claim buttons
        state.claimTimeout = setTimeout(() => {
          if (gameVersion !== ver) return;
          recordClaimDecision(ps, 'pass');
        }, 10000);
      } else {
        recordClaimDecision(ps, 'pass');
      }
    } else {
      recordClaimDecision(ps, 'pass');
    }

    // AI decisions — slight stagger so they don't all fire simultaneously
    [1, 2, 3].forEach(s => {
      const absSeat = vsOnline ? s : s; // in solo, abs seat === s
      if (absSeat !== discardingSeat) {
        setTimeout(() => {
          if (gameVersion !== ver) return;
          if (!isAISeat(absSeat) && absSeat !== ps) return;
          if (absSeat === ps) return; // human already handled
          const action = aiClaimDecision(absSeat, tile, discardingSeat);
          recordClaimDecision(absSeat, action);
        }, 60 * s);
      }
    });
  }

  function recordClaimDecision(seatIdx, action) {
    // Remove any prior decision from this seat
    state.claimDecisions = state.claimDecisions.filter(d => d.seat !== seatIdx);
    state.claimDecisions.push({ seat: seatIdx, action });

    if (!state.lastDiscard) return;
    const discardingSeat = state.lastDiscard.fromSeat;
    const nonDiscard     = [0, 1, 2, 3].filter(s => s !== discardingSeat);
    const allDecided     = nonDiscard.every(s => state.claimDecisions.some(d => d.seat === s));

    if (allDecided) {
      clearTimeout(state.claimTimeout);
      resolveClaimWindow(discardingSeat);
    }
  }

  function resolveClaimWindow(discardingSeat) {
    state.claimWindow = false;
    const decisions   = state.claimDecisions;
    const tile        = state.lastDiscard.tile;

    const winner = decisions.find(d => d.action === 'win');
    if (winner)  { executeClaim(winner.seat, 'win',  tile, discardingSeat); return; }
    const konger = decisions.find(d => d.action === 'kong');
    if (konger)  { executeClaim(konger.seat, 'kong', tile, discardingSeat); return; }
    const punger = decisions.find(d => d.action === 'pung');
    if (punger)  { executeClaim(punger.seat, 'pung', tile, discardingSeat); return; }
    const chower = decisions.find(d =>
      d.action && typeof d.action === 'object' && d.action.type === 'chow'
    );
    if (chower)  { executeClaim(chower.seat, chower.action, tile, discardingSeat); return; }

    // No claims — advance turn to the next player
    const nextSeat = (discardingSeat + 1) % 4;
    state.turnIdx  = nextSeat;
    if (nextSeat === myPS()) {
      state.phase = 'player-draw';
      setStatus('Your turn — draw a tile.');
      render();
    } else {
      startAiTurn(nextSeat, false);
    }
  }

  function executeClaim(claimingSeat, action, tile, fromSeat) {
    const actionType = typeof action === 'object' ? action.type : action;

    // Remove tile from discard pool
    const dp = state.discards[fromSeat];
    const di = dp.findIndex(t => t.uid === tile.uid);
    if (di !== -1) dp.splice(di, 1);

    state.turnIdx = claimingSeat;
    addLog(`${seatName(claimingSeat)} claims — ${actionType}.`);

    if (actionType === 'win') {
      state.hands[claimingSeat].push(tile);
      declareWin(claimingSeat, 'discard');
      return;
    }

    const hand = state.hands[claimingSeat];

    if (actionType === 'kong') {
      const taken = takeTilesById(hand, tile.id, 3);
      state.melds[claimingSeat].push({ type: 'kong', tiles: [tile, ...taken], open: true });
      render();
      const deadTile = drawFromDeadWall(claimingSeat);
      if (!deadTile) return;
      if (isWinningHand(state.hands[claimingSeat], state.melds[claimingSeat])) {
        declareWin(claimingSeat, 'self-draw');
        return;
      }
      if (claimingSeat === myPS()) startPlayerDiscard();
      else startAiDiscard(claimingSeat);
      return;
    }

    if (actionType === 'pung') {
      const taken = takeTilesById(hand, tile.id, 2);
      state.melds[claimingSeat].push({ type: 'pung', tiles: [tile, ...taken], open: true });
    }

    if (actionType === 'chow') {
      const otherIds = action.sequence.filter(id => id !== tile.id);
      const taken    = otherIds.map(id => takeTilesById(hand, id, 1)[0]).filter(Boolean);
      state.melds[claimingSeat].push({ type: 'chow', tiles: [tile, ...taken], open: true });
    }

    render();
    if (claimingSeat === myPS()) startPlayerDiscard();
    else startAiDiscard(claimingSeat);
  }

  function declareWin(winningSeat, winType) {
    state.phase    = 'round-over';
    const fan      = calculateFan(winningSeat, winType);
    const payout   = calculatePayout(fan);
    const fromSeat = winType === 'discard' ? state.lastDiscard.fromSeat : null;

    if (winType === 'self-draw') {
      [0, 1, 2, 3].filter(s => s !== winningSeat).forEach(s => {
        state.scores[s]            -= payout;
        state.scores[winningSeat]  += payout;
      });
    } else {
      state.scores[fromSeat]        -= payout * 3;
      state.scores[winningSeat]     += payout * 3;
    }

    addLog(`${seatName(winningSeat)} wins! ${fan} fan → ${payout}pt.`);

    if (window.Auth && Auth.isLoggedIn())
      Auth.recordResult('mahjong', winningSeat === myPS() ? 'win' : 'loss');

    // Build the hand display for overlay
    const winHand  = state.hands[winningSeat].map(t => tileHTML(t, {})).join('');
    const winMelds = state.melds[winningSeat].map(meldHTML).join('');
    const payDesc  = winType === 'self-draw'
      ? 'Self-draw (自摸) — all pay'
      : `Won on ${seatName(fromSeat)}'s discard`;

    state.overlayContent = `
<h2 style="color:#c0392b">${winningSeat === myPS() ? 'You Win! (糊!)' : `${esc(seatName(winningSeat))} Wins!`}</h2>
<div style="display:flex;flex-wrap:wrap;gap:3px;justify-content:center;margin:0.75rem 0">${winHand}</div>
<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin:0.5rem 0">${winMelds}</div>
<p style="margin:0.5rem 0">${esc(payDesc)}</p>
<p style="font-size:1.1rem"><strong>${fan} fan</strong> &rarr; <strong>${payout} points</strong></p>`;

    render();
  }

  function startNextRound() {
    const wasDraw       = state.isDraw;
    state.isDraw        = false;
    state.overlayContent = '';

    if (!wasDraw) {
      state.dealer = (state.dealer + 1) % 4;
      if (state.dealer === 0) {
        const windIdx    = WINDS.indexOf(state.roundWind);
        state.roundWind  = WINDS[(windIdx + 1) % 4];
        state.round++;
      }
      if (state.round > 2) { gameOver(); return; }
    }

    state.turnIdx = state.dealer;
    dealRound();
  }

  function gameOver() {
    state.phase = 'game-over';
    const sorted = [0, 1, 2, 3].sort((a, b) => state.scores[b] - state.scores[a]);
    const rows   = sorted.map((s, i) =>
      `<p style="font-size:1rem">${i + 1}. ${esc(seatName(s))}: <strong>${state.scores[s]}pt</strong></p>`
    ).join('');
    state.overlayContent = `<h2>Game Over</h2><p>Final Scores</p>${rows}`;
    addLog('Game over!');
    render();
  }

  /* ── AI logic ────────────────────────────────────────────────────────────── */

  function aiClaimDecision(seatIdx, tile, discardingSeat) {
    if (canWinWithTile(seatIdx, tile)) return 'win';

    const hand     = state.hands[seatIdx];
    const matching = hand.filter(t => t.id === tile.id).length;

    if (matching >= 3) return 'kong';

    // Pung: only claim honours (winds/dragons) or if hand has many pairs
    if (matching >= 2) {
      if (tile.suit === 'dragon' || tile.suit === 'wind') return 'pung';
      // Also claim pung if it would leave a clean hand
      const pairs = countPairs(hand);
      if (pairs >= 2) return 'pung';
    }

    // Chow: only left player, only if it completes useful sequence
    const leftSeat = (discardingSeat + 1) % 4;
    if (seatIdx === leftSeat) {
      const chows = getChowOptions(hand, tile);
      if (chows.length > 0 && aiShouldChow(seatIdx)) {
        return { type: 'chow', sequence: chows[0] };
      }
    }

    return 'pass';
  }

  function countPairs(hand) {
    const counts = {};
    hand.forEach(t => { counts[t.id] = (counts[t.id] || 0) + 1; });
    return Object.values(counts).filter(c => c >= 2).length;
  }

  function aiShouldChow(seatIdx) {
    // Chow if we have fewer than 2 open melds — still building the hand
    return state.melds[seatIdx].length < 2;
  }

  function tileSurvivalScore(hand, tile) {
    let score    = 0;
    const same   = hand.filter(t => t.id === tile.id).length;
    score += same * 10; // pairs/triplets are valuable

    if (tile.num) {
      const suit = tile.suit;
      const n    = tile.num;
      if (hand.some(t => t.id === `${suit}${n-1}`)) score += 6;
      if (hand.some(t => t.id === `${suit}${n+1}`)) score += 6;
      if (hand.some(t => t.id === `${suit}${n-2}`)) score += 3;
      if (hand.some(t => t.id === `${suit}${n+2}`)) score += 3;
      // Middle tiles are more flexible in sequences
      if (n >= 3 && n <= 7) score += 2;
    }

    return score;
  }

  function aiChooseDiscard(seatIdx) {
    const hand = state.hands[seatIdx];
    let worst  = hand[0], worstScore = Infinity;
    hand.forEach(tile => {
      const score = tileSurvivalScore(hand, tile);
      if (score < worstScore) { worstScore = score; worst = tile; }
    });
    return worst.uid;
  }

  function startAiTurn(seatIdx, skipDraw) {
    state.phase   = 'ai-turn';
    state.turnIdx = seatIdx;
    setStatus(`${seatName(seatIdx)} is thinking…`);
    render();

    const ver = gameVersion;
    setTimeout(() => {
      if (gameVersion !== ver) return;

      if (!skipDraw) {
        const tile = drawTile(seatIdx);
        if (!tile) return; // wall exhausted — exhaustedDraw already called
      }

      // Check self-draw win
      if (isWinningHand(state.hands[seatIdx], state.melds[seatIdx])) {
        declareWin(seatIdx, 'self-draw');
        return;
      }

      setTimeout(() => {
        if (gameVersion !== ver) return;
        const uid = aiChooseDiscard(seatIdx);
        discardTile(seatIdx, uid);
      }, 400);

    }, skipDraw ? 300 : 700);
  }

  function startAiDiscard(seatIdx) {
    state.phase   = 'ai-turn';
    state.turnIdx = seatIdx;
    setStatus(`${seatName(seatIdx)} is discarding…`);
    render();

    const ver = gameVersion;
    setTimeout(() => {
      if (gameVersion !== ver) return;
      const uid = aiChooseDiscard(seatIdx);
      discardTile(seatIdx, uid);
    }, 500);
  }

  /* ── Multiplayer ─────────────────────────────────────────────────────────── */

  function syncOnlineState() {
    if (!window.Multiplayer) return;
    Multiplayer.sendState({
      phase:         state.phase,
      round:         state.round,
      roundWind:     state.roundWind,
      dealer:        state.dealer,
      turnIdx:       state.turnIdx,
      hands:         state.hands,
      melds:         state.melds,
      discards:      state.discards,
      scores:        state.scores,
      lastDiscard:   state.lastDiscard,
      log:           state.log,
      overlayContent:state.overlayContent,
      isDraw:        state.isDraw,
      last_actor:    Multiplayer.getPlayerId(),
    });
  }

  function receiveOnlineState(data) {
    if (!data || !vsOnline) return;
    if (data.last_actor === Multiplayer.getPlayerId()) return;

    state.phase          = data.phase;
    state.round          = data.round;
    state.roundWind      = data.roundWind;
    state.dealer         = data.dealer;
    state.turnIdx        = data.turnIdx;
    state.hands          = data.hands;
    state.melds          = data.melds;
    state.discards       = data.discards;
    state.scores         = data.scores;
    state.lastDiscard    = data.lastDiscard;
    state.log            = data.log;
    state.overlayContent = data.overlayContent;
    state.isDraw         = data.isDraw;
    state.claimWindow    = false;
    state.selectedTileUid = null;

    render();

    if (state.phase === 'round-over' || state.phase === 'game-over') return;

    // If it's my turn after opponent's move
    if (state.turnIdx === mySeat) {
      if (state.phase === 'player-draw') {
        setStatus('Your turn — draw a tile.');
        render();
      } else if (state.phase === 'player-discard') {
        startPlayerDiscard();
      }
    }

    // Check if opponent discarded and human can claim
    if (state.lastDiscard && state.lastDiscard.fromSeat !== mySeat) {
      const claims = getValidClaims(mySeat, state.lastDiscard.tile, state.lastDiscard.fromSeat);
      if (claims.length > 0) {
        state.claimWindow = true;
        setStatus('Claim this tile?');
        render();
      }
    }
  }

  function initOnlineUI() {
    if (!window.Multiplayer) return;

    const elLobby      = document.getElementById('mj-mp-lobby');
    const elJoinForm   = document.getElementById('mj-mp-join-form');
    const elRoomPanel  = document.getElementById('mj-mp-room');
    const elCreateBtn  = document.getElementById('mj-create-btn');
    const elJoinBtn    = document.getElementById('mj-join-btn');
    const elJoinSubmit = document.getElementById('mj-join-submit');
    const elJoinCancel = document.getElementById('mj-join-cancel');
    const elLeaveBtn   = document.getElementById('mj-leave-btn');
    const elCodeInput  = document.getElementById('mj-code-input');
    const elRoomCode   = document.getElementById('mj-room-code-display');
    const elRoomSt     = document.getElementById('mj-mp-room-status');

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
      vsOnline = true;
      isHost   = (role === 'host');
      mySeat   = isHost ? 0 : 2;

      if (isHost) {
        state.dealer  = 0;
        state.turnIdx = 0;
        dealRound();
        syncOnlineState();
      } else {
        const el = document.getElementById('game-container');
        if (el) el.innerHTML = `<div style="padding:3rem 2rem;text-align:center;color:var(--color-text-muted)">
          <p style="font-size:1.2rem;margin-bottom:0.5rem">Connected!</p>
          <p>Waiting for host to deal tiles…</p>
        </div>`;
      }
    }

    function leaveRoom() {
      Multiplayer.disconnect();
      vsOnline = false;
      isHost   = false;
      mySeat   = 0;
      showLobby();
      gameVersion++;
      state = freshState();
      render();
    }

    elCreateBtn.addEventListener('click', async function () {
      elCreateBtn.disabled    = true;
      elCreateBtn.textContent = 'Creating…';
      const result = await Multiplayer.createRoom('mahjong', {
        onReady:       room  => { showRoom(room.code, 'Opponent joined! Starting…'); startOnlineGame('host'); },
        onRemoteState: receiveOnlineState,
        onError:       msg   => { showLobby(); alert('Error: ' + msg); },
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
      const result = await Multiplayer.joinRoom(code, 'mahjong', {
        onRemoteState: receiveOnlineState,
        onError:       msg => { alert('Error: ' + msg); },
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

  /* ── Init ────────────────────────────────────────────────────────────────── */

  function newGame() {
    gameVersion++;
    state = freshState();
    render();
  }

  function init() {
    if (document.getElementById('game-container')) {
      state = freshState();
      render();
    }
    initOnlineUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
