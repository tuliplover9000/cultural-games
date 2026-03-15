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

  let vsOnline    = false;
  let isHost      = false;
  let mySeat      = 0;
  let aiSeatsRoom = []; // AI-controlled seats in room mode

  // Track which discard tile uid triggered the last claim window on host side
  let _lastClaimWindowDiscardUid = null;

  /* ── Stale-timeout guard ────────────────────────────────────────────────── */

  let gameVersion = 0;

  /* ── Drag-to-reorder state ───────────────────────────────────────────────── */

  let dragSrcUid       = null;
  let dragOverUid      = null;
  let activeTouchGhost = null; // cleaned up before every render

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
    if (vsOnline) return aiSeatsRoom.indexOf(s) !== -1; // room AI seats
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

  // ── SVG tile artwork ─────────────────────────────────────────────────────
  // All artwork uses inline SVG with preserveAspectRatio="none" so it fills
  // the tile face at every size without distortion or letterboxing.

  // Single bamboo stalk: rounded rect + two joint lines + left highlight
  function mkStalk(x, y, w, h) {
    const rx  = Math.max(1.5, w * 0.16);
    const j1  = y + h * 0.34;
    const j2  = y + h * 0.67;
    const hlw = Math.max(2, w * 0.22);
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#1b9a3d"/>` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="#0a4e1e" stroke-width="1.5"/>` +
      `<rect x="${x+rx+0.5}" y="${j1-1}" width="${w-2*rx-1}" height="2" fill="#083d18" rx="0.5"/>` +
      `<rect x="${x+rx+0.5}" y="${j2-1}" width="${w-2*rx-1}" height="2" fill="#083d18" rx="0.5"/>` +
      `<rect x="${x+2}" y="${y+rx}" width="${hlw}" height="${h-2*rx}" rx="${hlw*0.5}" fill="rgba(255,255,255,0.22)"/>`
    );
  }

  // Single circle "coin": outer green ring → cream band → navy centre → highlight
  function mkCoin(cx, cy, r) {
    return (
      `<circle cx="${cx}" cy="${cy}" r="${r}"        fill="#165c30"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r*0.76}"   fill="#e0d4be"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r*0.52}"   fill="#0f2a5c"/>` +
      `<circle cx="${cx-r*0.24}" cy="${cy-r*0.24}" r="${r*0.18}" fill="rgba(255,255,255,0.4)"/>`
    );
  }

  function bambooSVG(n) {
    // Stalk layouts in a 100×130 coordinate space [x, y, w, h]
    const L = [
      null,
      [[34,  5, 32, 120]],                                              // 1 – wide single stalk
      [[ 6,  5, 40, 120], [54,  5, 40, 120]],                         // 2
      [[ 4,  5, 28, 120], [36,  5, 28, 120], [68,  5, 28, 120]],     // 3
      [[ 7,  6, 40,  56], [53,  6, 40,  56],
       [ 7, 68, 40,  56], [53, 68, 40,  56]],                         // 4
      [[ 7,  6, 40,  54], [53,  6, 40,  54],                          // 5: 2 top
       [ 4, 68, 28,  56], [36, 68, 28,  56], [68, 68, 28,  56]],     //    3 bottom
      [[ 4,  7, 28,  54], [36,  7, 28,  54], [68,  7, 28,  54],      // 6: 3×2
       [ 4, 69, 28,  54], [36, 69, 28,  54], [68, 69, 28,  54]],
      [[ 4,  4, 28,  34], [36,  4, 28,  34], [68,  4, 28,  34],      // 7: 3+2+2
       [ 7, 46, 40,  34], [53, 46, 40,  34],
       [ 7, 88, 40,  36], [53, 88, 40,  36]],
      [[ 7,  5, 40,  24], [53,  5, 40,  24],                          // 8: 2×4
       [ 7, 35, 40,  24], [53, 35, 40,  24],
       [ 7, 65, 40,  24], [53, 65, 40,  24],
       [ 7, 95, 40,  24], [53, 95, 40,  24]],
      [[ 4,  7, 28,  34], [36,  7, 28,  34], [68,  7, 28,  34],      // 9: 3×3
       [ 4, 48, 28,  34], [36, 48, 28,  34], [68, 48, 28,  34],
       [ 4, 89, 28,  34], [36, 89, 28,  34], [68, 89, 28,  34]],
    ];

    let body;
    if (n === 1) {
      // Traditional 1-bamboo: stylised sparrow/bird
      body =
        `<ellipse cx="50" cy="80" rx="20" ry="13" fill="#1a7830"/>` +
        `<circle  cx="33" cy="62" r="11"           fill="#1e8f3a"/>` +
        `<polygon points="24,62 32,57 32,67"        fill="#c0a020"/>` +
        `<circle  cx="30" cy="59" r="3"             fill="white"/>` +
        `<circle  cx="30" cy="59" r="1.5"           fill="#111"/>` +
        `<path d="M68,74 C82,56 92,44 86,32"  stroke="#27c060" stroke-width="3.5" fill="none" stroke-linecap="round"/>` +
        `<path d="M68,78 C88,72 98,68 94,56"  stroke="#1a8a40" stroke-width="3"   fill="none" stroke-linecap="round"/>` +
        `<path d="M68,82 C84,90 92,100 88,114" stroke="#27c060" stroke-width="3"  fill="none" stroke-linecap="round"/>` +
        `<line x1="42" y1="93" x2="38" y2="112" stroke="#888" stroke-width="2.5" stroke-linecap="round"/>` +
        `<line x1="52" y1="93" x2="56" y2="112" stroke="#888" stroke-width="2.5" stroke-linecap="round"/>`;
    } else {
      body = L[n].map(([x,y,w,h]) => mkStalk(x,y,w,h)).join('');
    }
    return `<svg class="mj-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130" preserveAspectRatio="none">${body}</svg>`;
  }

  function circleSVG(n) {
    // Circle (coin) layouts [cx, cy, r]
    const L = [
      null,
      [[50,  65, 40]],                                                                         // 1
      [[50,  32, 26], [50,  98, 26]],                                                          // 2
      [[50,  22, 20], [26,  82, 20], [74,  82, 20]],                                           // 3
      [[28,  30, 20], [72,  30, 20], [28,  90, 20], [72,  90, 20]],                            // 4
      [[24,  24, 17], [76,  24, 17], [50,  65, 17], [24, 106, 17], [76, 106, 17]],             // 5
      [[28,  20, 16], [72,  20, 16], [28,  65, 16], [72,  65, 16], [28, 110, 16], [72, 110, 16]], // 6
      [[20,  18, 14], [50,  18, 14], [80,  18, 14],
       [50,  65, 14],
       [20, 112, 14], [50, 112, 14], [80, 112, 14]],                                           // 7
      [[27,  15, 13], [73,  15, 13], [27,  48, 13], [73,  48, 13],
       [27,  82, 13], [73,  82, 13], [27, 115, 13], [73, 115, 13]],                            // 8
      [[20,  18, 12], [50,  18, 12], [80,  18, 12],
       [20,  65, 12], [50,  65, 12], [80,  65, 12],
       [20, 112, 12], [50, 112, 12], [80, 112, 12]],                                           // 9
    ];
    const body = L[n].map(([cx,cy,r]) => mkCoin(cx,cy,r)).join('');
    return `<svg class="mj-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130" preserveAspectRatio="none">${body}</svg>`;
  }

  const CHAR_NUMS = ['一','二','三','四','五','六','七','八','九'];

  function buildTileContent(tile) {
    if (tile.suit === 'c')
      return `<span class="mj-hon mj-hon--char">${CHAR_NUMS[tile.num - 1]}</span><span class="mj-hon-sub">萬</span>`;
    if (tile.suit === 'b') return bambooSVG(tile.num);
    if (tile.suit === 'o') return circleSVG(tile.num);
    // Winds and dragons
    return `<span class="mj-hon mj-hon--${tile.cls}">${tile.symbol}</span>`;
  }

  // ── tileHTML ────────────────────────────────────────────────────────────

  function tileHTML(tile, opts) {
    opts = opts || {};
    const cls = [
      'mj-tile',
      opts.back        ? 'mj-tile--back'         : `mj-tile--${tile.cls}`,
      opts.selectable  ? 'mj-tile--selectable'   : '',
      opts.selected    ? 'mj-tile--selected'      : '',
      opts.latest      ? 'mj-tile--latest'        : '',
      opts.small       ? 'mj-tile--sm'            : '',
      opts.hz          ? 'mj-tile--hz'            : '',
      opts.lastDiscard ? 'mj-tile--discard-last'  : '',
      opts.claimable   ? 'mj-tile--claimable'     : '',
    ].filter(Boolean).join(' ');

    const content   = opts.back ? '' : buildTileContent(tile);
    const ariaLabel = opts.back ? 'Face-down tile' : tile.name;
    const draggable = opts.draggable ? ' draggable="true"' : '';

    return `<div class="${cls}" data-uid="${tile.uid}" aria-label="${esc(ariaLabel)}" role="img"${draggable}>${content}</div>`;
  }

  function meldHTML(meld) {
    return `<div class="mj-meld">${meld.tiles.map(t => tileHTML(t, {})).join('')}</div>`;
  }

  // Renders one player's discards for the central square
  function buildCenterDiscards(seatIdx) {
    const discards = state.discards[seatIdx];
    if (!discards.length) return '';
    return discards.map((t, i) => {
      const isLast      = i === discards.length - 1
        && state.lastDiscard
        && state.lastDiscard.fromSeat === seatIdx;
      const isClaimable = isLast && state.claimWindow;
      return tileHTML(t, { small: true, lastDiscard: isLast, claimable: isClaimable });
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

    const isSide    = pos === 'left' || pos === 'right';
    const handTiles = hand.map(t => tileHTML(t, { back: true, hz: isSide })).join('');
    const meldHTMLs = melds.map(meldHTML).join('');

    return `<div class="mj-opponent mj-opponent--${pos}" data-seat="${seatIdx}">
  <div class="mj-opp-info">
    <span class="mj-opp-name">${esc(name)}${dot}</span>
    <span class="mj-opp-wind">${WIND_SYM[wind]}</span>
    <span class="mj-opp-score">${score}pt</span>
  </div>
  <div class="mj-opp-hand">${handTiles}<span style="font-size:0.72rem;color:#777;margin-left:4px">${hand.length}</span></div>
  <div class="mj-opp-melds">${meldHTMLs}</div>
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
    // viewSeat(0)=bottom(player), (1)=right, (2)=top, (3)=left
    const topD   = buildCenterDiscards(viewSeat(2));
    const leftD  = buildCenterDiscards(viewSeat(3));
    const rightD = buildCenterDiscards(viewSeat(1));
    const botD   = buildCenterDiscards(viewSeat(0));

    // Wall ring — tiles fill clockwise: top→right→bottom→left
    // Show up to 24 tiles; each visible tile = a back-face tile
    const W_H = 8, W_V = 4; // slots across top/bottom and down left/right
    const TOTAL = 2 * W_H + 2 * W_V; // 24
    const filled = Math.min(state.wall.length, TOTAL);
    let rem = filled;
    const wt  = () => `<div class="mj-tile mj-tile--back mj-wall-tile"></div>`;
    const ws  = (hz) => hz
      ? `<div class="mj-wall-slot mj-wall-slot--hz"></div>`
      : `<div class="mj-wall-slot mj-wall-slot--vt"></div>`;
    const wallRow = (n, hz) => {
      let h = '';
      for (let i = 0; i < n; i++) h += (rem-- > 0) ? wt() : ws(hz);
      return h;
    };

    return `<div class="mj-table-center" id="mj-table-center">
  <div class="mj-wall-ring">

    <div class="mj-wall-top">${wallRow(W_H, true)}</div>

    <div class="mj-wall-middle-row">
      <div class="mj-wall-left">${wallRow(W_V, false)}</div>

      <div class="mj-discard-square">
        <div class="mj-ds-top">${topD}</div>
        <div class="mj-ds-middle">
          <div class="mj-ds-left">${leftD}</div>
          <div class="mj-ds-info">
            <span class="mj-wall-count">${state.wall.length} tiles</span>
            <span class="mj-round-info">${esc(state.roundWind)} · R${state.round}</span>
            <p class="mj-status" id="mj-status" aria-live="assertive">${esc(state.statusMsg)}</p>
            <div class="mj-claim-btns" id="mj-claim-btns" aria-live="polite">${buildClaimButtons()}</div>
          </div>
          <div class="mj-ds-right">${rightD}</div>
        </div>
        <div class="mj-ds-bottom">${botD}</div>
      </div>

      <div class="mj-wall-right">${wallRow(W_V, false)}</div>
    </div>

    <div class="mj-wall-bottom">${wallRow(W_H, true)}</div>

  </div>
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

    const isMyTurn  = state.turnIdx === ps;
    const isDiscard = phase === 'player-discard' && isMyTurn;
    const isDraw    = phase === 'player-draw'    && isMyTurn;

    const handTiles = hand.map(t => tileHTML(t, {
      selectable:  isDiscard,
      selected:    t.uid === state.selectedTileUid,
      latest:      t.uid === state.drawnTileUid,
      draggable:   true,
    })).join('');

    const meldHTMLs  = melds.map(meldHTML).join('');

    const drawDis    = !(isDraw && !state.animating);
    const discardDis = !(isDiscard && state.selectedTileUid !== null);
    const winnable   = isDiscard && isWinningHand(state.hands[ps], state.melds[ps]);
    const winDis     = !winnable;

    return `<div class="mj-player-area" id="mj-player-area">
  <div class="mj-player-melds">${meldHTMLs}</div>
  <div class="mj-player-hand" id="mj-player-hand">${handTiles}</div>
  <div class="mj-player-info">
    <span class="mj-player-wind">You · ${WIND_SYM[wind]}</span>
    <span class="mj-player-score">${score}pt${dot}</span>
  </div>
  <div class="mj-controls" id="mj-controls">
    <button id="mj-draw-btn" class="mj-btn" ${drawDis ? 'disabled' : ''}>Draw</button>
    <button id="mj-discard-btn"  class="mj-btn"             ${discardDis ? 'disabled' : ''}>Discard</button>
    <button id="mj-win-btn"      class="mj-btn mj-btn--win" ${winDis     ? 'disabled' : ''}>Win (糊)</button>
    ${!vsOnline ? `<button id="mj-new-game-btn" class="mj-btn mj-btn--secondary">New Game</button>` : ''}
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
      ? `<button class="mj-btn" id="mj-next-round-btn"${vsOnline && !isHost ? ' disabled title="Waiting for host…"' : ''}>Next Round</button>` : '';
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
    if (activeTouchGhost) { activeTouchGhost.remove(); activeTouchGhost = null; }
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
    el.querySelector('#mj-new-game-overlay-btn')?.addEventListener('click', () => {
      if (vsOnline && !isHost) return; // only host can start new game
      newGame();
      if (vsOnline) syncOnlineState();
    });
    el.querySelector('#mj-next-round-btn')?.addEventListener('click', () => {
      if (vsOnline && !isHost) return; // only host advances rounds
      startNextRound();
    });

    // Draw
    el.querySelector('#mj-draw-btn')?.addEventListener('click', () => {
      if (state.phase !== 'player-draw' || state.animating) return;
      if (state.turnIdx !== myPS()) return; // not my turn
      const tile = drawTile(myPS());
      if (tile) {
        startPlayerDiscard();
        if (vsOnline) syncOnlineState(); // sync the drawn tile to others
      }
    });

    // Discard button
    el.querySelector('#mj-discard-btn')?.addEventListener('click', () => {
      if (state.phase !== 'player-discard') return;
      if (state.turnIdx !== myPS()) return; // not my turn
      if (state.selectedTileUid === null) { setStatus('Select a tile first.'); render(); return; }
      discardTile(myPS(), state.selectedTileUid);
    });

    // Self-draw win button
    el.querySelector('#mj-win-btn')?.addEventListener('click', () => {
      const ps = myPS();
      if (state.phase !== 'player-discard') return;
      if (state.turnIdx !== ps) return; // not my turn
      if (!isWinningHand(state.hands[ps], state.melds[ps])) return;
      declareWin(ps, 'self-draw');
    });

    // Player hand — tile selection & drag-to-reorder
    const handEl = el.querySelector('#mj-player-hand');
    if (handEl) {
      // Click to select tile for discard
      handEl.addEventListener('click', e => {
        const tileEl = e.target.closest('.mj-tile');
        if (!tileEl || state.phase !== 'player-discard') return;
        if (state.turnIdx !== myPS()) return; // not my turn
        const uid = parseInt(tileEl.dataset.uid);
        state.selectedTileUid = (state.selectedTileUid === uid) ? null : uid;
        render();
      });

      // HTML5 drag to reorder — bind dragstart/dragend directly on each tile
      // (dragstart delegation via container is unreliable in all browsers)
      handEl.querySelectorAll('.mj-tile[data-uid]').forEach(tileEl => {
        tileEl.addEventListener('dragstart', e => {
          dragSrcUid = parseInt(tileEl.dataset.uid);
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(dragSrcUid));
          setTimeout(() => tileEl.classList.add('mj-tile--dragging'), 0);
        });
        tileEl.addEventListener('dragend', () => {
          tileEl.classList.remove('mj-tile--dragging');
          handEl.querySelectorAll('.mj-tile--drag-over')
                .forEach(t => t.classList.remove('mj-tile--drag-over'));
          // If drop didn't fire (drag cancelled), dragSrcUid is still set — clean up
          if (dragSrcUid !== null) {
            dragSrcUid = null; dragOverUid = null;
          }
        });
      });

      handEl.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const tileEl = e.target.closest('.mj-tile[data-uid]');
        if (!tileEl) return;
        const uid = parseInt(tileEl.dataset.uid);
        if (uid === dragSrcUid) return;
        handEl.querySelectorAll('.mj-tile--drag-over').forEach(t => t.classList.remove('mj-tile--drag-over'));
        tileEl.classList.add('mj-tile--drag-over');
        dragOverUid = uid;
      });

      handEl.addEventListener('dragleave', e => {
        if (!handEl.contains(e.relatedTarget)) {
          handEl.querySelectorAll('.mj-tile--drag-over').forEach(t => t.classList.remove('mj-tile--drag-over'));
          dragOverUid = null;
        }
      });

      handEl.addEventListener('drop', e => {
        e.preventDefault();
        if (dragSrcUid === null) return;
        const tgt     = e.target.closest('.mj-tile[data-uid]');
        const overUid = tgt ? parseInt(tgt.dataset.uid) : dragOverUid;
        const srcUid  = dragSrcUid;
        dragSrcUid = null; dragOverUid = null;
        if (overUid !== null && overUid !== srcUid) {
          const hand    = state.hands[myPS()];
          const srcIdx  = hand.findIndex(t => t.uid === srcUid);
          const destIdx = hand.findIndex(t => t.uid === overUid);
          if (srcIdx !== -1 && destIdx !== -1) {
            const [moved] = hand.splice(srcIdx, 1);
            hand.splice(destIdx, 0, moved);
          }
        }
        render();
      });

      wireTouchDrag(handEl);
    }

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

  /* ── Touch drag-to-reorder ───────────────────────────────────────────────── */

  function wireTouchDrag(handEl) {
    let touchSrcUid = null;
    let hasMoved    = false;

    function clearDragVisuals() {
      if (activeTouchGhost) { activeTouchGhost.remove(); activeTouchGhost = null; }
      handEl.querySelectorAll('.mj-tile--dragging, .mj-tile--drag-over')
            .forEach(t => t.classList.remove('mj-tile--dragging', 'mj-tile--drag-over'));
    }

    handEl.addEventListener('touchstart', e => {
      const tileEl = e.target.closest('.mj-tile[data-uid]');
      if (!tileEl) return;
      touchSrcUid = parseInt(tileEl.dataset.uid);
      hasMoved    = false;
    }, { passive: true });

    handEl.addEventListener('touchmove', e => {
      if (touchSrcUid === null) return;
      e.preventDefault();

      if (!hasMoved) {
        hasMoved = true;
        const srcTile = handEl.querySelector(`[data-uid="${touchSrcUid}"]`);
        if (srcTile && !activeTouchGhost) {
          activeTouchGhost = srcTile.cloneNode(true);
          activeTouchGhost.removeAttribute('draggable');
          activeTouchGhost.style.cssText =
            'position:fixed;pointer-events:none;z-index:9999;' +
            'transform:scale(1.2) translateY(-12px);transition:none;opacity:0.9;';
          document.body.appendChild(activeTouchGhost);
          srcTile.classList.add('mj-tile--dragging');
        }
      }

      const touch = e.touches[0];
      if (activeTouchGhost) {
        activeTouchGhost.style.left = (touch.clientX - activeTouchGhost.offsetWidth  / 2) + 'px';
        activeTouchGhost.style.top  = (touch.clientY - activeTouchGhost.offsetHeight * 1.4) + 'px';
      }

      // Find which tile is under the finger
      const under = document.elementFromPoint(touch.clientX, touch.clientY);
      const tgt   = under?.closest('#mj-player-hand .mj-tile[data-uid]');
      handEl.querySelectorAll('.mj-tile--drag-over').forEach(t => t.classList.remove('mj-tile--drag-over'));
      if (tgt && parseInt(tgt.dataset.uid) !== touchSrcUid) {
        tgt.classList.add('mj-tile--drag-over');
        dragOverUid = parseInt(tgt.dataset.uid);
      } else {
        dragOverUid = null;
      }
    }, { passive: false });

    handEl.addEventListener('touchend', e => {
      const srcUid = touchSrcUid;
      touchSrcUid  = null;
      if (srcUid === null) return;

      if (!hasMoved) {
        // Tap — treat as tile selection click
        clearDragVisuals();
        if (state.phase === 'player-discard' && state.turnIdx === myPS()) {
          state.selectedTileUid = (state.selectedTileUid === srcUid) ? null : srcUid;
          render();
        }
        return;
      }

      const dstUid = dragOverUid;
      dragOverUid  = null;
      clearDragVisuals();

      if (dstUid !== null && dstUid !== srcUid) {
        const hand    = state.hands[myPS()];
        const srcIdx  = hand.findIndex(t => t.uid === srcUid);
        const destIdx = hand.findIndex(t => t.uid === dstUid);
        if (srcIdx !== -1 && destIdx !== -1) {
          const [moved] = hand.splice(srcIdx, 1);
          hand.splice(destIdx, 0, moved);
        }
      }
      render();
    });

    handEl.addEventListener('touchcancel', () => {
      touchSrcUid = null; dragOverUid = null;
      clearDragVisuals();
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
      if (vsOnline) syncOnlineState(); // share full deal (hands + wall) with others
    } else if (vsOnline && !isAISeat(state.dealer)) {
      // Remote human dealer — host deals, signals them to discard
      state.turnIdx = state.dealer;
      state.phase   = 'player-discard';
      render();
      syncOnlineState();
    } else {
      state.turnIdx = state.dealer;
      startAiTurn(state.dealer, true); // skip draw — dealer already has 14
      if (vsOnline) syncOnlineState();
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

    if (vsOnline) {
      syncOnlineState(); // always sync in room mode (covers AI discards by host too)
      if (!isHost) return; // only host runs claim window
    }

    _lastClaimWindowDiscardUid = state.lastDiscard ? state.lastDiscard.tile.uid : null;
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

    // Decisions for all other seats — slight stagger so they don't all fire simultaneously
    [1, 2, 3].forEach(s => {
      const absSeat = s;
      if (absSeat !== discardingSeat) {
        setTimeout(() => {
          if (gameVersion !== ver) return;
          if (absSeat === ps) return; // human already handled above
          if (!isAISeat(absSeat)) {
            // In room mode, auto-pass remote human seats (claim sync not yet supported)
            if (vsOnline) { recordClaimDecision(absSeat, 'pass'); return; }
            return; // solo without AI: shouldn't reach here
          }
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
    } else if (vsOnline && !isAISeat(nextSeat)) {
      // Remote human's turn — let them draw themselves from their synced wall
      state.phase = 'player-draw';
      render();
      syncOnlineState(); // guest receives player-draw phase and draws their own tile
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
      if (claimingSeat === myPS()) {
        startPlayerDiscard();
      } else if (vsOnline && !isAISeat(claimingSeat)) {
        state.phase = 'player-discard';
        render();
        syncOnlineState();
      } else {
        startAiDiscard(claimingSeat);
      }
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
    if (claimingSeat === myPS()) {
      startPlayerDiscard();
    } else if (vsOnline && !isAISeat(claimingSeat)) {
      // Remote human claimed — signal them to discard
      state.phase = 'player-discard';
      render();
      syncOnlineState();
    } else {
      startAiDiscard(claimingSeat);
    }
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
    if (vsOnline) syncOnlineState();
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
    dealRound(); // dealRound syncs if vsOnline
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
    if (vsOnline) return 'pass'; // room mode: AI only draws/discards, no claiming
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
    if (vsOnline && !isHost) return; // only host runs AI in room mode
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
    if (vsOnline && !isHost) return; // only host runs AI in room mode
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
    var blob = {
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
      wall:          state.wall,
      deadWall:      state.deadWall,
    };
    if (window.RoomBridge && RoomBridge.isActive()) {
      blob.last_actor = 'room:' + RoomBridge.getSeat();
      RoomBridge.sendState(blob);
      // Report win when the game reaches its final phase
      if (state.phase === 'game-over') {
        var seats  = [0, 1, 2, 3];
        var winner = seats.sort(function(a, b) { return (state.scores[b] || 0) - (state.scores[a] || 0); })[0];
        RoomBridge.reportWin(winner);
      }
      return;
    }
    if (!window.Multiplayer) return;
    blob.last_actor = Multiplayer.getPlayerId();
    Multiplayer.sendState(blob);
  }

  function receiveOnlineState(data) {
    if (!data || !vsOnline) return;
    // Echo suppression — works for both Multiplayer and RoomBridge paths
    if (window.RoomBridge && RoomBridge.isActive()) {
      if (data.last_actor === 'room:' + RoomBridge.getSeat()) return;
    } else if (window.Multiplayer) {
      if (data.last_actor === Multiplayer.getPlayerId()) return;
    }

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
    if (data.wall)     state.wall     = data.wall;
    if (data.deadWall) state.deadWall = data.deadWall;
    state.claimWindow    = false;
    state.selectedTileUid = null;

    render();

    if (state.phase === 'round-over' || state.phase === 'game-over') return;

    // Host triggers AI turns, OR opens claim window after a remote human discards
    if (isHost) {
      // Remote human discarded → host opens claim window
      if (state.lastDiscard && state.lastDiscard.tile.uid !== _lastClaimWindowDiscardUid) {
        const fromSeat = state.lastDiscard.fromSeat;
        if (fromSeat !== myPS() && !isAISeat(fromSeat) && state.phase === 'player-discard') {
          _lastClaimWindowDiscardUid = state.lastDiscard.tile.uid;
          openClaimWindow(fromSeat);
          return;
        }
      }
      // AI turn
      if (isAISeat(state.turnIdx)) {
        if (state.phase === 'player-draw') {
          startAiTurn(state.turnIdx);
          return;
        }
        if (state.phase === 'player-discard') {
          startAiDiscard(state.turnIdx);
          return;
        }
      }
    }

    // If it's my turn after opponent's move
    if (state.turnIdx === mySeat) {
      if (state.phase === 'player-draw') {
        setStatus('Your turn — draw a tile.');
        render();
      } else if (state.phase === 'player-discard') {
        startPlayerDiscard();
      }
    }
  }

  function initOnlineUI() {
    // ── Room System bridge (iframe mode) ───────────────────────────────────
    if (window.RoomBridge && RoomBridge.isActive()) {
      var mjPanel = document.getElementById('mj-mp-panel');
      if (mjPanel) mjPanel.hidden = true;
      vsOnline    = true;
      mySeat      = RoomBridge.getSeat();
      isHost      = RoomBridge.isRoomHost ? RoomBridge.isRoomHost() : (mySeat === 0);
      aiSeatsRoom = RoomBridge.getAiSeats ? RoomBridge.getAiSeats() : [];
      RoomBridge.onState(receiveOnlineState);
      if (isHost) {
        state.dealer  = 0;
        state.turnIdx = 0;
        dealRound(); // dealRound calls syncOnlineState internally in room mode
      }
      return;
    }
    // ── Legacy Multiplayer (standalone page) ───────────────────────────────
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
