/**
 * yote.js — Yoté (West African capture game)
 *
 * SESSIONS SO FAR:
 *   Session 1 — scaffold: canvas + CGTheme bridge + resize hooks.
 *   Session 2 — Phase C (board rendering & coordinates) + Phase D (state model
 *               & drop phase). Hotseat drop only: each turn, the active player
 *               places one piece from hand onto an empty square; turn alternates.
 *
 * NOT YET IMPLEMENTED (later phases, intentionally absent):
 *   Phase E — movement, capture (jump), and the capture-two bonus-removal rule.
 *   Phase F — win / draw detection & end screen.
 *   Phase G — AI opponent.
 *   Phase H/I/J — auth & achievements, multiplayer, tutorial/QA.
 *
 * Coordinate math is locked into a single `geo` layout object computed once per
 * resize/render; nothing re-derives cell size inline (see Phase C gotchas).
 */
(function () {
  'use strict';

  // ── Board geometry constants (LOCKED — never recompute inline) ─────────────
  var COLS = 6, ROWS = 5;                 // 6 wide × 5 tall = 30 squares
  var TOTAL = COLS * ROWS;                // 30
  var HAND_START = 12;                    // reserve pieces per player
  var PAD = 22;                           // CSS px padding around everything

  // Vertical layout factors, expressed as multiples of one cell size.
  var TRAY_H_F = 0.95;                    // hand-tray strip height
  var GAP_F    = 0.34;                    // gap between tray and board
  // Total canvas height in cell-units (excludes the fixed PAD on top & bottom):
  //   topTray + gap + board(ROWS) + gap + botTray
  var V_CELLS = TRAY_H_F + GAP_F + ROWS + GAP_F + TRAY_H_F;

  var P1 = 'P1', P2 = 'P2';

  // ── Canvas ───────────────────────────────────────────────────────────────
  var cnv, ctx;

  // ── Colour bridge (window.CGTheme) ─────────────────────────────────────────
  var C = {};
  function readColors() {
    var p = (window.CGTheme && typeof window.CGTheme.getColors === 'function')
      ? window.CGTheme.getColors() : {};
    var dark = (window.CGTheme && typeof window.CGTheme.getTheme === 'function')
      ? window.CGTheme.getTheme() === 'dark' : false;

    C = {
      bg:        dark ? '#1d1206' : '#2a1606',
      board:     dark ? '#6a4422' : '#7a5028',
      boardHi:   dark ? '#a9743f' : '#c4894f',
      cell:      dark ? '#7d5228' : '#8a5d30',
      cellEdge:  'rgba(0,0,0,0.28)',
      dot:       'rgba(0,0,0,0.18)',
      tray:      'rgba(0,0,0,0.32)',
      trayActive:p.accentGold || '#C89B3C',
      // Pieces
      p1:        '#F5E6C8',          // you (light)
      p1Ring:    '#9a7030',
      p1Shine:   'rgba(255,255,255,0.45)',
      p2:        '#b03a28',          // opponent (terracotta)
      p2Ring:    '#6e2014',
      p2Shine:   'rgba(255,255,255,0.18)',
      // Move / capture highlights
      selectRing:p.accentGold || '#E8C84A',
      moveDot:   'rgba(232,200,74,0.50)',
      jumpRing:  '#e05040',
      bonusRing: '#e05040',
      // Accents / text
      accent:    p.accentGold || '#C89B3C',
      text:      p.text       || '#F0E6D0',
      muted:     p.textMuted  || '#B09070',
    };
  }

  // ── Sizing (devicePixelRatio-aware) ─────────────────────────────────────────
  function dpr() { return Math.max(1, Math.min(window.devicePixelRatio || 1, 3)); }

  // Lay the canvas out to a given CSS width; height follows the locked aspect.
  function sizeToWidth(cssW) {
    if (!cnv) return;
    var scale = window.CGMobileScale || 1;
    var ratio = dpr();
    var wCss = Math.max(160, Math.round(cssW * scale));
    var cellCss = (wCss - PAD * 2) / COLS;
    var hCss = Math.round(PAD * 2 + cellCss * V_CELLS);
    cnv.width  = Math.round(wCss * ratio);
    cnv.height = Math.round(hCss * ratio);
    cnv.style.width  = '100%';
    cnv.style.height = 'auto';
    render();
  }

  function resizeCanvas() {
    var wrap = document.getElementById('yo-board-wrap');
    if (!wrap) return;
    sizeToWidth(wrap.clientWidth || 480);
  }

  // ── Layout (computed once per render; everything reads from `geo`) ──────────
  var geo = {};
  function computeLayout() {
    var ratio = dpr();
    var pad = PAD * ratio;
    var cell = (cnv.width - pad * 2) / COLS;
    var trayH = cell * TRAY_H_F;
    var gap = cell * GAP_F;
    geo = {
      ratio: ratio,
      pad: pad,
      cell: cell,
      gap: gap,
      trayH: trayH,
      originX: pad,
      topTrayY: pad,
      originY: pad + trayH + gap,
      boardW: cell * COLS,
      boardH: cell * ROWS,
    };
    geo.botTrayY = geo.originY + geo.boardH + gap;
  }

  // ── Cell ↔ pixel mapping (Phase C3) ─────────────────────────────────────────
  function cellToXY(c, r) {
    return {
      x: geo.originX + c * geo.cell + geo.cell / 2,
      y: geo.originY + r * geo.cell + geo.cell / 2,
    };
  }
  function idxToXY(i) { return cellToXY(i % COLS, Math.floor(i / COLS)); }
  // Returns board index 0..29 for a device-px point, or null if outside board.
  function xyToCell(x, y) {
    if (x < geo.originX || y < geo.originY) return null;
    var c = Math.floor((x - geo.originX) / geo.cell);
    var r = Math.floor((y - geo.originY) / geo.cell);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return r * COLS + c;
  }

  function roundRect(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  // ── State model (Phase D1) ──────────────────────────────────────────────────
  var state;
  function freshState() {
    var board = new Array(TOTAL);
    for (var i = 0; i < TOTAL; i++) board[i] = null;
    return {
      board: board,                          // null | 'P1' | 'P2'
      hand: { P1: HAND_START, P2: HAND_START },
      turn: P1,                              // P1 (light, you) moves first
      awaitingBonusRemoval: false,           // capture-two sub-state (Phase E)
      winner: null,
      last_actor: null,
    };
  }

  // Currently selected own piece (UI-only; not part of serialized state).
  var selected = null;

  // AI (Phase G). P1 is always the human; P2 is the AI when vsAI is on.
  var AI_PLAYER = P2;
  var vsAI = true;
  var aiTimer = null;
  // Generation counter — bumped on new game / undo so a pending AI move
  // scheduled for an old game never fires into a fresh one (rematch bug guard).
  var gen = 0;

  // End-screen overlay elements (Phase F).
  var overlayEl, overlayTitleEl, overlaySubEl;

  // Undo history (snapshots of the serializable state).
  var history = [];
  function snapshot() {
    return JSON.stringify({
      board: state.board, hand: state.hand, turn: state.turn,
      awaitingBonusRemoval: state.awaitingBonusRemoval,
      winner: state.winner, last_actor: state.last_actor,
    });
  }
  function pushHistory() { history.push(snapshot()); if (history.length > 200) history.shift(); }
  function restore(snap) {
    var s = JSON.parse(snap);
    state.board = s.board;
    state.hand = s.hand;
    state.turn = s.turn;
    state.awaitingBonusRemoval = s.awaitingBonusRemoval;
    state.winner = s.winner;
    state.last_actor = s.last_actor;
  }

  function other(p) { return p === P1 ? P2 : P1; }

  // ── Movement & capture logic (Phase E) ──────────────────────────────────────
  var DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];   // orthogonal only — no diagonals

  function colOf(i) { return i % COLS; }
  function rowOf(i) { return Math.floor(i / COLS); }
  // Index `steps` cells from `i` in direction (dc,dr), or -1 if off the grid.
  function step(i, dc, dr, steps) {
    var c = colOf(i) + dc * steps, r = rowOf(i) + dr * steps;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return r * COLS + c;
  }

  // Legal moves + jumps for the piece at `i`. Owner is read from the board.
  // Returns { moves: [idx...], jumps: [{ to, captured }...] }.
  function movesFor(i) {
    var owner = state.board[i];
    var result = { moves: [], jumps: [] };
    if (!owner) return result;
    var enemy = other(owner);
    for (var d = 0; d < DIRS.length; d++) {
      var dc = DIRS[d][0], dr = DIRS[d][1];
      var n1 = step(i, dc, dr, 1);
      if (n1 < 0) continue;
      if (state.board[n1] === null) {
        result.moves.push(n1);                       // E1 simple step
      } else if (state.board[n1] === enemy) {
        var n2 = step(i, dc, dr, 2);                 // square directly beyond
        if (n2 >= 0 && state.board[n2] === null) {
          result.jumps.push({ to: n2, captured: n1 }); // E2 jump capture
        }
      }
    }
    return result;
  }

  function countPieces(who) {
    var n = 0;
    for (var i = 0; i < TOTAL; i++) if (state.board[i] === who) n++;
    return n;
  }
  function totalPieces(who) { return countPieces(who) + state.hand[who]; }

  function existsEmptyCell() {
    for (var i = 0; i < TOTAL; i++) if (state.board[i] === null) return true;
    return false;
  }
  // Does player P have any legal action? A piece in hand is always a legal drop
  // (the 30-cell board can never fill with only 24 pieces in play).
  function hasAnyLegalMove(who) {
    if (state.hand[who] > 0 && existsEmptyCell()) return true;
    for (var i = 0; i < TOTAL; i++) {
      if (state.board[i] !== who) continue;
      var m = movesFor(i);
      if (m.moves.length || m.jumps.length) return true;
    }
    return false;
  }
  function hasAnyCapture(who) {
    for (var i = 0; i < TOTAL; i++) {
      if (state.board[i] !== who) continue;
      if (movesFor(i).jumps.length) return true;
    }
    return false;
  }

  // ── Win / draw detection (Phase F) ──────────────────────────────────────────
  // Called from finishTurn — i.e. AFTER any bonus removal has resolved.
  function checkEndConditions() {
    var next = state.turn;              // player about to move
    var prev = other(next);             // player who just acted
    // F1: opponent wiped out (no pieces on board AND none in hand).
    if (totalPieces(next) === 0) { endGame(prev, 'All enemy pieces captured.'); return; }
    // F2: the player to move has no legal move → they lose.
    if (!hasAnyLegalMove(next)) { endGame(prev, playerLabel(next) + ' has no legal move.'); return; }
    // F3: // RECONSTRUCTED draw — both sides reduced to <=3 pieces with no
    // capture possible for either side.
    if (totalPieces(P1) <= 3 && totalPieces(P2) <= 3 &&
        !hasAnyCapture(P1) && !hasAnyCapture(P2)) {
      endGame('draw', 'Both sides are down to a few pieces with no captures left.');
      return;
    }
  }

  function endGame(winner, reason) {
    state.winner = winner;             // 'P1' | 'P2' | 'draw'
    clearAI();
    selected = null;
    // Phase H will wire Auth.recordResult + Achievements here.
    showOverlay(winner, reason);
  }

  // ── Legal-action generator + AI (Phase G) ────────────────────────────────────
  function genActions(who) {
    var caps = [], moves = [], drops = [], i, k, m;
    for (i = 0; i < TOTAL; i++) {
      if (state.board[i] !== who) continue;
      m = movesFor(i);
      for (k = 0; k < m.jumps.length; k++) caps.push({ from: i, jump: m.jumps[k] });
      for (k = 0; k < m.moves.length; k++) moves.push({ from: i, to: m.moves[k] });
    }
    if (state.hand[who] > 0) {
      for (i = 0; i < TOTAL; i++) if (state.board[i] === null) drops.push(i);
    }
    return { captures: caps, moves: moves, drops: drops };
  }

  // Would a `who` piece sitting at `idx` be immediately capturable by the enemy?
  function exposedAt(boardArr, idx, who) {
    var enemy = other(who), c = idx % COLS, r = Math.floor(idx / COLS), d;
    for (d = 0; d < DIRS.length; d++) {
      var dc = DIRS[d][0], dr = DIRS[d][1];
      var ac = c + dc, ar = r + dr;          // attacker side
      var bc = c - dc, br = r - dr;          // empty landing side (opposite)
      if (ac < 0 || ac >= COLS || ar < 0 || ar >= ROWS) continue;
      if (bc < 0 || bc >= COLS || br < 0 || br >= ROWS) continue;
      if (boardArr[ar * COLS + ac] === enemy && boardArr[br * COLS + bc] === null) return true;
    }
    return false;
  }

  // Pick the bonus-removal target: prefer an enemy piece that threatens us most
  // (can capture our pieces), then one adjacent to many of our pieces.
  function chooseBonusTarget(who) {
    var enemy = other(who), best = -1, bestScore = -1, i, d;
    for (i = 0; i < TOTAL; i++) {
      if (state.board[i] !== enemy) continue;
      var score = movesFor(i).jumps.length * 10;   // jumps from an enemy capture our pieces
      var c = i % COLS, r = Math.floor(i / COLS);
      for (d = 0; d < DIRS.length; d++) {
        var nc = c + DIRS[d][0], nr = r + DIRS[d][1];
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        if (state.board[nr * COLS + nc] === who) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  // Choose a quiet (non-capturing) action: avoid exposing the moved piece;
  // prefer creating our own capture threat; mild centrality bias.
  function quietScore(action, who) {
    var sim = state.board.slice();
    var dest;
    if (action.type === 'move') { sim[action.from] = null; sim[action.to] = who; dest = action.to; }
    else { sim[action.idx] = who; dest = action.idx; }
    var score = 0;
    if (exposedAt(sim, dest, who)) score -= 8;
    // Does our piece now threaten an enemy (capture available next)?
    var c = dest % COLS, r = Math.floor(dest / COLS), enemy = other(who), d;
    for (d = 0; d < DIRS.length; d++) {
      var dc = DIRS[d][0], dr = DIRS[d][1];
      var n1c = c + dc, n1r = r + dr, n2c = c + dc * 2, n2r = r + dr * 2;
      if (n2c < 0 || n2c >= COLS || n2r < 0 || n2r >= ROWS) continue;
      if (sim[n1r * COLS + n1c] === enemy && sim[n2r * COLS + n2c] === null) score += 4;
    }
    // centrality
    score += 2 - (Math.abs(c - 2.5) + Math.abs(r - 2));
    return score;
  }

  function aiTurn() {
    if (!state || state.winner || state.turn !== AI_PLAYER) return;
    var p = AI_PLAYER;
    var actions = genActions(p);

    // 1) Always take a capture if available (capture-two is strong in Yoté).
    if (actions.captures.length) {
      var cap = actions.captures[0], bestExp = 2, i;
      for (i = 0; i < actions.captures.length; i++) {           // prefer a safe landing
        var sim = state.board.slice(), j = actions.captures[i];
        sim[j.from] = null; sim[j.jump.captured] = null; sim[j.jump.to] = p;
        var exp = exposedAt(sim, j.jump.to, p) ? 1 : 0;
        if (exp < bestExp) { bestExp = exp; cap = j; }
      }
      doCapture(cap.from, cap.jump);
      if (state.awaitingBonusRemoval) doBonusRemoval(chooseBonusTarget(p));
      return;
    }

    // 2) Otherwise pick the best quiet move or drop.
    var cands = [], k;
    for (k = 0; k < actions.moves.length; k++) {
      cands.push({ type: 'move', from: actions.moves[k].from, to: actions.moves[k].to });
    }
    for (k = 0; k < actions.drops.length; k++) {
      cands.push({ type: 'drop', idx: actions.drops[k] });
    }
    if (!cands.length) return;          // no action (checkEndConditions handles loss)
    var best = cands[0], bestS = -Infinity;
    for (k = 0; k < cands.length; k++) {
      var s = quietScore(cands[k], p);
      if (s > bestS) { bestS = s; best = cands[k]; }
    }
    if (best.type === 'move') doMove(best.from, best.to);
    else attemptDrop(best.idx);
  }

  function clearAI() { if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; } }
  function maybeScheduleAI() {
    if (!vsAI || !state || state.winner) return;
    if (state.turn !== AI_PLAYER || state.awaitingBonusRemoval) return;
    var myGen = gen;
    clearAI();
    setStatus('Player 2 (AI) is thinking…');
    aiTimer = setTimeout(function () {
      aiTimer = null;
      if (myGen !== gen || !state || state.winner || state.turn !== AI_PLAYER) return;
      aiTurn();
    }, 550);
  }

  // ── Render (Phase C1/C2) ────────────────────────────────────────────────────
  function drawPiece(x, y, r, who) {
    // soft shadow
    ctx.beginPath();
    ctx.arc(x, y + r * 0.18, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = who === P1 ? C.p1 : C.p2;
    ctx.fill();
    // ring
    ctx.lineWidth = Math.max(1.4, r * 0.14);
    ctx.strokeStyle = who === P1 ? C.p1Ring : C.p2Ring;
    ctx.stroke();
    // shine
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = who === P1 ? C.p1Shine : C.p2Shine;
    ctx.fill();
  }

  function drawTray(yTop, who, count, isActive) {
    var h = geo.trayH;
    var x = geo.originX, w = geo.boardW;
    // tray backdrop
    ctx.fillStyle = C.tray;
    roundRect(x, yTop, w, h, 8 * geo.ratio); ctx.fill();
    if (isActive) {
      ctx.lineWidth = Math.max(2, 2 * geo.ratio);
      ctx.strokeStyle = C.trayActive;
      ctx.stroke();
    }
    // reserve pieces as a row of tokens (count shown in the HUD, not here)
    var r = Math.min(h * 0.30, (w / HAND_START) * 0.40);
    var slotW = w / HAND_START;
    var cy = yTop + h / 2;
    for (var i = 0; i < count; i++) {
      var cx = x + slotW * (i + 0.5);
      drawPiece(cx, cy, r, who);
    }
  }

  function render() {
    if (!cnv || !ctx) return;
    computeLayout();
    var W = cnv.width, H = cnv.height;
    ctx.clearRect(0, 0, W, H);

    // Container background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    var active = state ? state.turn : P1;

    // Opponent tray (top = P2), your tray (bottom = P1)
    drawTray(geo.topTrayY, P2, state ? state.hand.P2 : HAND_START, active === P2);
    drawTray(geo.botTrayY, P1, state ? state.hand.P1 : HAND_START, active === P1);

    // Board body
    var cs = geo.cell;
    var bx = geo.originX - cs * 0.16, by = geo.originY - cs * 0.16;
    var bw = geo.boardW + cs * 0.32, bh = geo.boardH + cs * 0.32;
    ctx.fillStyle = C.board;
    roundRect(bx, by, bw, bh, 10 * geo.ratio); ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = C.boardHi;
    roundRect(bx + 2, by + 2, bw - 4, bh * 0.18, 8 * geo.ratio); ctx.fill();
    ctx.restore();

    // Cells + pieces
    for (var i = 0; i < TOTAL; i++) {
      var c = i % COLS, r = Math.floor(i / COLS);
      var x = geo.originX + c * cs, y = geo.originY + r * cs;
      var inset = cs * 0.08;
      ctx.fillStyle = C.cell;
      roundRect(x + inset, y + inset, cs - inset * 2, cs - inset * 2, 6 * geo.ratio);
      ctx.fill();
      ctx.lineWidth = Math.max(1, 1.2 * geo.ratio);
      ctx.strokeStyle = C.cellEdge;
      ctx.stroke();

      var occupant = state ? state.board[i] : null;
      if (occupant) {
        var ct = cellToXY(c, r);
        drawPiece(ct.x, ct.y, cs * 0.34, occupant);
      } else {
        var d = cellToXY(c, r);
        ctx.beginPath();
        ctx.arc(d.x, d.y, Math.max(2, cs * 0.06), 0, Math.PI * 2);
        ctx.fillStyle = C.dot;
        ctx.fill();
      }
    }

    drawHighlights(cs);
  }

  // Selection / move / capture / bonus-removal overlays (Phase E).
  function drawHighlights(cs) {
    if (!state) return;
    var pt, i;

    if (state.awaitingBonusRemoval) {
      // Ring every removable enemy piece — the bonus piece can be anywhere.
      var enemy = other(state.turn);
      for (i = 0; i < TOTAL; i++) {
        if (state.board[i] !== enemy) continue;
        pt = idxToXY(i);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, cs * 0.42, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, cs * 0.06);
        ctx.strokeStyle = C.bonusRing;
        ctx.stroke();
      }
      return;
    }

    if (selected === null || !state.board[selected]) return;
    var info = movesFor(selected);

    // Selected piece ring
    pt = idxToXY(selected);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, cs * 0.40, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, cs * 0.06);
    ctx.strokeStyle = C.selectRing;
    ctx.stroke();

    // Simple-move targets — soft dots
    for (i = 0; i < info.moves.length; i++) {
      pt = idxToXY(info.moves[i]);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, cs * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = C.moveDot;
      ctx.fill();
    }

    // Jump targets — red ring on the landing square + red ring on the victim
    for (i = 0; i < info.jumps.length; i++) {
      var j = info.jumps[i];
      pt = idxToXY(j.to);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, cs * 0.30, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, cs * 0.06);
      ctx.strokeStyle = C.jumpRing;
      ctx.stroke();
      var cp = idxToXY(j.captured);
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, cs * 0.42, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.5, cs * 0.045);
      ctx.strokeStyle = C.jumpRing;
      ctx.stroke();
    }
  }

  // ── HUD (Phase D3) ──────────────────────────────────────────────────────────
  function playerLabel(p) {
    if (p === P1) return 'You (light)';
    return vsAI ? 'Player 2 (AI)' : 'Player 2 (dark)';
  }

  function updateScore() {
    var el = document.getElementById('yo-score');
    if (!el || !state) return;
    el.innerHTML =
      '<span class="yo-score__you">You: ' + state.hand.P1 + ' in hand</span>' +
      '<span class="yo-score__ai">P2: ' + state.hand.P2 + ' in hand</span>';
  }
  function setStatus(msg) {
    var el = document.getElementById('yo-status');
    if (el) el.textContent = msg;
  }
  function refreshStatus() {
    if (!state) return;
    if (state.winner) return;
    var p = state.turn;
    if (state.awaitingBonusRemoval) {
      setStatus('Capture! Tap any enemy piece to remove it (capture-two).');
    } else if (state.hand[p] > 0) {
      setStatus(playerLabel(p) + ' — drop a piece, or tap one of your pieces to move it.');
    } else {
      setStatus(playerLabel(p) + ' — tap one of your pieces to move or capture.');
    }
  }
  function updateHud() { updateScore(); refreshStatus(); }

  // ── End-screen overlay (Phase F4) ─────────────────────────────────────────────
  function showOverlay(winner, reason) {
    var title;
    if (winner === 'draw') title = 'Draw';
    else if (winner === P1) title = vsAI ? 'You Win!' : 'Player 1 Wins!';
    else title = vsAI ? 'You Lost' : 'Player 2 Wins!';
    if (overlayTitleEl) overlayTitleEl.textContent = title;
    if (overlaySubEl)   overlaySubEl.textContent = reason || '';
    if (overlayEl)      overlayEl.classList.add('active');
    setStatus(title + (reason ? ' ' + reason : ''));
  }
  function hideOverlay() { if (overlayEl) overlayEl.classList.remove('active'); }

  // ── Turn resolution ─────────────────────────────────────────────────────────
  // Pass the turn after a fully-resolved action (drop, move, or capture+bonus).
  function finishTurn(p) {
    state.turn = other(p);
    state.awaitingBonusRemoval = false;
    state.last_actor = 'local:' + p;
    selected = null;
    checkEndConditions();
    render();
    updateHud();
    maybeScheduleAI();
  }

  // ── Drop action (Phase D2) ──────────────────────────────────────────────────
  function attemptDrop(idx) {
    var p = state.turn;
    if (state.board[idx] !== null) {
      setStatus('That square is taken — pick an empty one.');
      return;
    }
    if (state.hand[p] <= 0) {
      setStatus(playerLabel(p) + ' has no pieces left to drop.');
      return;
    }
    pushHistory();
    state.board[idx] = p;
    state.hand[p] -= 1;
    finishTurn(p);
  }

  // ── Move & capture (Phase E1/E2/E3/E4) ───────────────────────────────────────
  function doMove(from, to) {            // E1: simple orthogonal step
    pushHistory();
    var p = state.turn;
    state.board[to] = state.board[from];
    state.board[from] = null;
    finishTurn(p);
  }

  function doCapture(from, jump) {       // E2: jump, remove victim
    pushHistory();
    var p = state.turn, enemy = other(p);
    state.board[jump.to] = state.board[from];
    state.board[from] = null;
    state.board[jump.captured] = null;
    selected = null;
    // E3: bonus removal — unless no other enemy piece remains (skip cleanly).
    // E4: single jump only, so we never chain after this.
    if (countPieces(enemy) > 0) {
      state.awaitingBonusRemoval = true;
      state.last_actor = 'local:' + p;
      render();
      updateScore();
      setStatus('Capture! Tap any enemy piece to remove it (capture-two).');
    } else {
      finishTurn(p);
    }
  }

  function doBonusRemoval(idx) {          // E3: remove the chosen second piece
    var p = state.turn, enemy = other(p);
    if (state.board[idx] !== enemy) {
      setStatus('Capture bonus: tap one of your opponent\'s pieces to remove it.');
      return;
    }
    pushHistory();
    state.board[idx] = null;
    finishTurn(p);
  }

  // ── Input dispatcher ─────────────────────────────────────────────────────────
  function getCanvasXY(e) {
    var rect = cnv.getBoundingClientRect();
    var sx = cnv.width / rect.width;
    var sy = cnv.height / rect.height;
    var src = e.touches ? (e.changedTouches[0] || e.touches[0]) : e;
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
  }

  function handleCell(idx) {
    if (state.winner) return;
    if (vsAI && state.turn === AI_PLAYER) return;   // input locked during AI's turn
    var p = state.turn, enemy = other(p);

    // Bonus-removal sub-state: only an enemy-piece tap does anything.
    if (state.awaitingBonusRemoval) { doBonusRemoval(idx); return; }

    if (selected !== null) {
      if (idx === selected) { selected = null; render(); return; }   // tap again to deselect
      var info = movesFor(selected);
      var k;
      for (k = 0; k < info.jumps.length; k++) {
        if (info.jumps[k].to === idx) { doCapture(selected, info.jumps[k]); return; }
      }
      for (k = 0; k < info.moves.length; k++) {
        if (info.moves[k] === idx) { doMove(selected, idx); return; }
      }
      if (state.board[idx] === p) { selected = idx; render(); return; } // reselect own piece
      selected = null; render();                                       // tap elsewhere: deselect only
      return;
    }

    // Nothing selected.
    if (state.board[idx] === p) { selected = idx; render(); return; }
    if (state.board[idx] === enemy) { setStatus('That\'s your opponent\'s piece.'); return; }
    if (state.hand[p] > 0) { attemptDrop(idx); return; }              // empty square → drop
    setStatus(playerLabel(p) + ' — tap one of your pieces to move or capture.');
  }

  function onTap(e) {
    if (!state) return;
    var xy = getCanvasXY(e);
    var idx = xyToCell(xy.x, xy.y);
    if (idx == null) {                 // tap outside the board → deselect
      if (selected !== null) { selected = null; render(); }
      return;
    }
    handleCell(idx);
  }

  // ── Controls ──────────────────────────────────────────────────────────────────
  function newGame() {
    gen++;                      // invalidate any pending AI move from a prior game
    clearAI();
    hideOverlay();
    state = freshState();
    history = [];
    selected = null;
    render();
    updateHud();
    maybeScheduleAI();          // (no-op: P1 always starts, but safe)
  }
  function undo() {
    if (!history.length) { setStatus('Nothing to undo yet.'); return; }
    gen++;                      // cancel any scheduled AI move
    clearAI();
    hideOverlay();
    restore(history.pop());
    // In vs-AI mode, keep stepping back until it's the human's decision again.
    while (vsAI && history.length && state.turn === AI_PLAYER) {
      restore(history.pop());
    }
    selected = null;
    render();
    updateHud();
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    cnv = document.getElementById('yo-canvas');
    if (!cnv) return;
    ctx = cnv.getContext('2d');

    readColors();
    if (window.CGTheme) {
      var prev = window.CGTheme.onchange;
      window.CGTheme.onchange = function (t) {
        if (typeof prev === 'function') { try { prev(t); } catch (e) {} }
        readColors();
        render();
      };
    }

    overlayEl      = document.getElementById('yo-overlay');
    overlayTitleEl = document.getElementById('yo-overlay-title');
    overlaySubEl   = document.getElementById('yo-overlay-sub');

    var elNew     = document.getElementById('yo-new-btn');
    var elUndo    = document.getElementById('yo-undo-btn');
    var elRematch = document.getElementById('yo-rematch-btn');
    var elAi      = document.getElementById('yo-ai-toggle');
    if (elNew)     elNew.addEventListener('click', newGame);
    if (elUndo)    elUndo.addEventListener('click', undo);
    if (elRematch) elRematch.addEventListener('click', newGame);
    if (elAi) {
      vsAI = !!elAi.checked;
      elAi.addEventListener('change', function () { vsAI = elAi.checked; newGame(); });
    }

    cnv.addEventListener('click', onTap);
    cnv.addEventListener('touchend', function (e) { e.preventDefault(); onTap(e); }, { passive: false });

    window.addEventListener('resize', resizeCanvas);
    window.cgMobileResize = resizeCanvas;

    gen++;
    clearAI();
    state = freshState();
    history = [];
    resizeCanvas();
    updateHud();
    maybeScheduleAI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Fullscreen / mobile-fit resize hooks ─────────────────────────────────────
  if (window.FSMode) {
    FSMode.onEnter = function () { setTimeout(render, 50); };
    FSMode.onExit  = function () { setTimeout(render, 50); };
  }

  window.GameResize = function (availW, availH) {
    if (!cnv) return;
    var ratio = dpr();
    var cellByW = (availW - PAD * 2) / COLS;
    var cellByH = (availH - PAD * 2) / V_CELLS;
    var cell = Math.max(18, Math.min(cellByW, cellByH));
    var wCss = Math.round(cell * COLS + PAD * 2);
    var hCss = Math.round(cell * V_CELLS + PAD * 2);
    cnv.width  = Math.round(wCss * ratio);
    cnv.height = Math.round(hCss * ratio);
    cnv.style.width  = wCss + 'px';
    cnv.style.height = hCss + 'px';
    render();
  };

}());
