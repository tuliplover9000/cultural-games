/**
 * yut-nori.js — Yut Nori (윷놀이) complete implementation
 * Phases B–J: board graph, rendering, input, move/capture/stack logic,
 *             AI, animations, win detection, room mode, mobile.
 *
 * Exposes: window.GameResize(availW, availH)
 * Prefix:  yn-
 */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════════════════════════ */

  var THROW_NAMES = {
    1: { name: 'Do',   ko: '도', extra: false },
    2: { name: 'Gae',  ko: '개', extra: false },
    3: { name: 'Geol', ko: '걸', extra: false },
    4: { name: 'Yut',  ko: '윷', extra: true  },
    5: { name: 'Mo',   ko: '모', extra: true  },
  };

  /* 29 node positions as [x, y] fractions of the inner board area.
     Diamond board: corners at bottom(0), right(5), top(10), left(15).
     Inner shortcut nodes: 20-28.
     (0,0) = top-left of inner area, (1,1) = bottom-right. */
  var NODE_UNIT = [
    /* outer ring */
    [0.5,  1.0 ], // 0  START/bottom — corner
    [0.6,  0.9 ], // 1
    [0.7,  0.8 ], // 2
    [0.8,  0.7 ], // 3
    [0.9,  0.6 ], // 4
    [1.0,  0.5 ], // 5  RIGHT corner
    [0.9,  0.4 ], // 6
    [0.8,  0.3 ], // 7
    [0.7,  0.2 ], // 8
    [0.6,  0.1 ], // 9
    [0.5,  0.0 ], // 10 TOP corner
    [0.4,  0.1 ], // 11
    [0.3,  0.2 ], // 12
    [0.2,  0.3 ], // 13
    [0.1,  0.4 ], // 14
    [0.0,  0.5 ], // 15 LEFT corner
    [0.1,  0.6 ], // 16
    [0.2,  0.7 ], // 17
    [0.3,  0.8 ], // 18
    [0.4,  0.9 ], // 19
    /* inner shortcuts */
    [0.833, 0.5  ], // 20 SE-arm inner 1  (5→center)
    [0.667, 0.5  ], // 21 SE-arm inner 2
    [0.5,   0.5  ], // 22 CENTER
    [0.5,   0.667], // 23 center exit 1   (center→start)
    [0.5,   0.167], // 24 N-arm inner 1   (10→center)
    [0.5,   0.333], // 25 N-arm inner 2
    [0.167, 0.5  ], // 26 NW-arm inner 1  (15→center)
    [0.333, 0.5  ], // 27 NW-arm inner 2
    [0.5,   0.833], // 28 center exit 2
  ];

  /* Next node per route.
     'outer' = clockwise outer ring.
     'se'/'ne'/'nw' = shortcuts into center.
     'exit' = center→start path (shared by all three shortcuts). */
  var NEXT = {
    outer: { 0:1,1:2,2:3,3:4,4:5,5:6,6:7,7:8,8:9,9:10,10:11,11:12,12:13,13:14,14:15,15:16,16:17,17:18,18:19,19:0 },
    se:    { 5:20, 20:21, 21:22 },
    ne:    { 10:24, 24:25, 25:22 },
    nw:    { 15:26, 26:27, 27:22 },
    exit:  { 22:23, 23:28, 28:0 },
  };

  /* Shortcut entry mapping: which corner → which route → first inner node */
  var CORNER_ROUTE  = { 5: 'se', 10: 'ne', 15: 'nw' };
  var CORNER_FIRST  = { 5: 20,   10: 24,   15: 26  };
  var OUTER_CORNERS = [0, 5, 10, 15]; // all four outer corners
  var SC_CORNERS    = [5, 10, 15];    // the three shortcut-entry corners

  var TEAM_COLOR  = { a: '#c0392b', b: '#1a3a6b' };
  var TEAM_DARK   = { a: '#7a0000', b: '#0a1a3b' };

  /* Computed at resize */
  var NODE_R = 10;

  /* ══════════════════════════════════════════════════════════════════
     STATE
  ══════════════════════════════════════════════════════════════════ */

  var state = newState();

  function newState() {
    return {
      mode:              '2p',
      phase:             'gameover',   // set properly in startGame
      currentTeam:       'a',
      pendingMoves:      [],           // queue of move values to spend
      pendingExtraThrows: 0,           // extra throws from captures
      lastThrow:         null,         // { sticks, value, name, ko }
      throwHistory:      [],
      moCount:           0,            // Mo throws this game (for achievement)
      captureCount:      { a: 0, b: 0 },
      winner:            null,
      aiEnabled:         true,
      pieces:            makePieces(),
      selectedPieceId:   null,
      shortcutPending:   null,         // { pieceIds, cornerNode, shortcutRoute, outerNext, shortcutFirst }
      animLock:          false,
      boardSize:         480,
      padX:              48,
      padY:              48,
    };
  }

  function makePieces() {
    var p = {};
    ['a1','a2','a3','a4','b1','b2','b3','b4'].forEach(function (id) {
      p[id] = {
        id: id, team: id[0],
        nodeId:   null,    // null=off-board | 0-28=on board | 'finish'
        route:    'outer', // current path type
        entered:  false,   // has piece left the start node?
        finished: false,
      };
    });
    return p;
  }

  /* ══════════════════════════════════════════════════════════════════
     DOM
  ══════════════════════════════════════════════════════════════════ */

  var canvas     = document.getElementById('yn-canvas');
  var ctx        = canvas ? canvas.getContext('2d') : null;
  var elStatus   = document.getElementById('yn-status');
  var elThrowBtn = document.getElementById('yn-throw-btn');
  var elNewBtn   = document.getElementById('yn-new-btn');
  var elAiToggle = document.getElementById('yn-ai-toggle');
  var elThrowRes = document.getElementById('yn-throw-result');
  var elPending  = document.getElementById('yn-pending-moves');

  if (!canvas || !ctx) return;

  /* ══════════════════════════════════════════════════════════════════
     BOARD MATH
  ══════════════════════════════════════════════════════════════════ */

  /** Pixel position of a node on the canvas. */
  function npos(id) {
    var u   = NODE_UNIT[id];
    var pad = state.padX;
    var inn = state.boardSize - 2 * pad;
    return { x: pad + u[0] * inn, y: pad + u[1] * inn };
  }

  /**
   * Walk `steps` steps from nodeId along route.
   * @returns { nodeId, route, finished }
   */
  function walk(nodeId, route, steps, entered) {
    for (var i = 0; i < steps; i++) {
      var map = NEXT[route];
      /* fall back to outer if map missing (safety) */
      if (!map || map[nodeId] === undefined) { map = NEXT.outer; route = 'outer'; }
      nodeId = map[nodeId];
      /* arriving at center via shortcut arm → switch to exit path */
      if (nodeId === 22 && route !== 'exit') route = 'exit';
      /* finish: piece has entered board and reaches start node */
      if (entered && nodeId === 0) return { nodeId: 'finish', route: route, finished: true };
    }
    return { nodeId: nodeId, route: route, finished: false };
  }

  function teamPieces(team) {
    return Object.keys(state.pieces).filter(function (id) { return id[0] === team; })
      .map(function (id) { return state.pieces[id]; });
  }

  function piecesAt(nodeId) {
    return Object.values(state.pieces).filter(function (p) { return p.nodeId === nodeId; });
  }

  function allFinished(team) {
    return teamPieces(team).every(function (p) { return p.finished; });
  }

  /* ══════════════════════════════════════════════════════════════════
     MOVE / CAPTURE / STACK LOGIC
  ══════════════════════════════════════════════════════════════════ */

  /**
   * Apply one pending move for pieceId.
   * Returns { event: 'move'|'capture'|'finish', ... }
   */
  function applyMove(pieceId, moveValue) {
    var piece = state.pieces[pieceId];
    var enemy = piece.team === 'a' ? 'b' : 'a';

    /* All friendly pieces at same node move together (stack) */
    var stack = piece.nodeId === null
      ? [piece]
      : teamPieces(piece.team).filter(function (p) { return p.nodeId === piece.nodeId && !p.finished; });

    /* Compute destination */
    var dest;
    if (piece.nodeId === null) {
      /* Entering board: Mo(5) → node 4, Do(1) → node 0 */
      dest = { nodeId: moveValue - 1, route: 'outer', finished: false };
    } else {
      dest = walk(piece.nodeId, piece.route, moveValue, piece.entered);
    }

    /* Finish */
    if (dest.finished) {
      stack.forEach(function (p) { p.nodeId = 'finish'; p.finished = true; });
      checkWin();
      return { event: 'finish', team: piece.team };
    }

    var destId = dest.nodeId;

    /* Capture any enemy pieces at destination */
    var captured = teamPieces(enemy).filter(function (p) { return p.nodeId === destId && !p.finished; });
    if (captured.length) {
      captured.forEach(function (p) { p.nodeId = null; p.route = 'outer'; p.entered = false; });
      state.captureCount[piece.team] += captured.length;
    }

    /* Move stack */
    stack.forEach(function (p) { p.nodeId = destId; p.route = dest.route; p.entered = true; });

    /* Shortcut choice: landed on a shortcut corner via outer ring */
    if (SC_CORNERS.indexOf(destId) >= 0 && dest.route === 'outer' && !captured.length) {
      state.shortcutPending = {
        pieceIds:      stack.map(function (p) { return p.id; }),
        cornerNode:    destId,
        shortcutRoute: CORNER_ROUTE[destId],
        outerNext:     NEXT.outer[destId],
        shortcutFirst: CORNER_FIRST[destId],
      };
    }

    return { event: captured.length ? 'capture' : 'move', captured: captured };
  }

  function checkWin() {
    if (allFinished('a')) endGame('a');
    else if (allFinished('b')) endGame('b');
  }

  /* ══════════════════════════════════════════════════════════════════
     TURN MANAGEMENT
  ══════════════════════════════════════════════════════════════════ */

  function afterMove(result) {
    state.selectedPieceId = null;

    if (state.phase === 'gameover') { render(); return; }

    /* Toasts */
    if (result.event === 'capture')  showToast('잡았다! Captured!');
    if (result.event === 'finish')   showToast('완주! Finished!');

    /* Capture → extra throw */
    if (result.event === 'capture') state.pendingExtraThrows++;

    /* AI auto-resolves shortcut choice */
    if (state.shortcutPending) {
      if (state.aiEnabled && state.currentTeam === 'b') {
        resolveShortcut(true); // AI always takes shortcut
      } else {
        state.phase = 'shortcut-choice';
        setStatus('Choose: 지름길 (shortcut) or 외곽 (outer)?');
        render();
        return;
      }
    }

    advance();
  }

  function advance() {
    if (state.phase === 'gameover') return;

    if (state.pendingMoves.length > 0) {
      /* Still have move values to spend */
      state.phase = 'move';
      updateStatus();
      setThrowBtnActive(false);
      if (state.aiEnabled && state.currentTeam === 'b') setTimeout(aiMove, 600);
    } else if (state.pendingExtraThrows > 0) {
      /* Earned a re-throw from capture */
      state.pendingExtraThrows--;
      state.phase = 'throw';
      updateStatus();
      setThrowBtnActive(!(state.aiEnabled && state.currentTeam === 'b'));
      if (state.aiEnabled && state.currentTeam === 'b') setTimeout(aiThrow, 800);
    } else {
      /* End of turn */
      state.currentTeam = state.currentTeam === 'a' ? 'b' : 'a';
      state.pendingMoves = [];
      state.pendingExtraThrows = 0;
      state.phase = 'throw';
      updateHUD();
      updateStatus();
      setThrowBtnActive(!(state.aiEnabled && state.currentTeam === 'b'));
      if (state.aiEnabled && state.currentTeam === 'b') setTimeout(aiThrow, 800);
    }
    renderPendingMoves();
    render();
  }

  function resolveShortcut(useShortcut) {
    var sp = state.shortcutPending;
    if (!sp) return;
    sp.pieceIds.forEach(function (id) {
      state.pieces[id].route = useShortcut ? sp.shortcutRoute : 'outer';
    });
    state.shortcutPending = null;
    state.phase = 'move';
  }

  /* ══════════════════════════════════════════════════════════════════
     THROW LOGIC
  ══════════════════════════════════════════════════════════════════ */

  function rollSticks() {
    var sticks = [0,0,0,0].map(function () { return Math.random() < 0.5 ? 1 : 0; });
    var flat   = sticks.reduce(function (s, v) { return s + v; }, 0);
    var value  = flat === 0 ? 5 : flat; /* Mo = all round = 5 */
    return { sticks: sticks, value: value, name: THROW_NAMES[value].name, ko: THROW_NAMES[value].ko };
  }

  function doThrow() {
    if (state.phase !== 'throw' || state.animLock) return;
    setThrowBtnActive(false);
    state.animLock = true;

    animThrow(function (result) {
      state.animLock = false;
      state.lastThrow = result;
      state.throwHistory.push(result.value);
      if (result.value === 5) { state.moCount++; checkMoAchievement(); }

      state.pendingMoves.push(result.value);
      renderPendingMoves();
      setThrowResult(result);

      if (THROW_NAMES[result.value].extra) {
        /* Extra throw: Yut or Mo */
        if (result.value === 4) showToast('윷!');
        if (result.value === 5) showToast('모!');
        state.phase = 'throw';
        updateStatus();
        setThrowBtnActive(!(state.aiEnabled && state.currentTeam === 'b'));
        if (state.aiEnabled && state.currentTeam === 'b') setTimeout(aiThrow, 600);
        render();
      } else {
        state.phase = 'move';
        updateStatus();
        if (state.aiEnabled && state.currentTeam === 'b') setTimeout(aiMove, 800);
        render();
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     STICK THROW ANIMATION
  ══════════════════════════════════════════════════════════════════ */

  var throwAnim = { active: false, progress: 0, sticks: [0,0,0,0], cb: null };

  function animThrow(cb) {
    var result  = rollSticks();
    var start   = null;
    var dur     = 520;
    throwAnim.active   = true;
    throwAnim.sticks   = result.sticks;
    throwAnim.progress = 0;
    throwAnim.cb       = cb;

    (function tick(ts) {
      if (!start) start = ts;
      throwAnim.progress = Math.min((ts - start) / dur, 1);
      render();
      if (throwAnim.progress < 1) { requestAnimationFrame(tick); }
      else { throwAnim.active = false; render(); cb(result); }
    }(performance.now()));
  }

  /* ══════════════════════════════════════════════════════════════════
     PIECE MOVE ANIMATION
  ══════════════════════════════════════════════════════════════════ */

  var moveAnim = { active: false, progress: 0, ids: [], fx: 0, fy: 0, tx: 0, ty: 0 };

  function animMove(ids, fromId, toId, cb) {
    if (fromId === null || toId === null || toId === 'finish') { if (cb) cb(); return; }
    var fp = npos(fromId), tp = npos(toId);
    var start = null, dur = 280;
    moveAnim.active = true;
    moveAnim.ids = ids;
    moveAnim.fx = fp.x; moveAnim.fy = fp.y;
    moveAnim.tx = tp.x; moveAnim.ty = tp.y;
    moveAnim.progress = 0;

    (function tick(ts) {
      if (!start) start = ts;
      moveAnim.progress = Math.min((ts - start) / dur, 1);
      render();
      if (moveAnim.progress < 1) { requestAnimationFrame(tick); }
      else { moveAnim.active = false; render(); if (cb) cb(); }
    }(performance.now()));
  }

  /* ══════════════════════════════════════════════════════════════════
     APPLY MOVE WITH ANIMATION
  ══════════════════════════════════════════════════════════════════ */

  function doMove(pieceId) {
    if (state.animLock || state.phase !== 'move') return;
    var mv = state.pendingMoves[0];
    if (!mv) return;

    var piece    = state.pieces[pieceId];
    var fromNode = piece.nodeId;
    state.pendingMoves.shift();
    state.animLock = true;

    var result   = applyMove(pieceId, mv);
    var toNode   = piece.finished ? 'finish' : piece.nodeId;

    /* Collect IDs that logically moved (the stack that just moved) */
    var movedIds;
    if (toNode === 'finish') {
      movedIds = teamPieces(piece.team).filter(function (p) { return p.finished; }).map(function (p) { return p.id; });
    } else {
      movedIds = piecesAt(toNode).filter(function (p) { return p.team === piece.team; }).map(function (p) { return p.id; });
    }

    animMove(movedIds, fromNode, typeof toNode === 'number' ? toNode : null, function () {
      state.animLock = false;
      updateHUD();
      renderPendingMoves();
      render();
      afterMove(result);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     AI
  ══════════════════════════════════════════════════════════════════ */

  function aiThrow() { if (state.phase === 'throw') doThrow(); }

  function aiMove() {
    if (state.phase !== 'move') return;
    var mv = state.pendingMoves[0];
    if (!mv) return;

    var chosen = aiBestPiece(state.currentTeam, mv);
    if (chosen) {
      state.selectedPieceId = chosen;
      render();
      setTimeout(function () { doMove(chosen); }, 350);
    }
  }

  function aiBestPiece(team, mv) {
    var enemy = team === 'a' ? 'b' : 'a';
    var candidates = teamPieces(team).filter(function (p) { return !p.finished; });
    if (!candidates.length) return null;

    var best = null, bestScore = -Infinity;

    candidates.forEach(function (p) {
      /* Deduplicate stacks: only consider one piece per node */
      if (p.nodeId !== null && p !== teamPieces(team).filter(function (q) { return q.nodeId === p.nodeId && !q.finished; })[0]) return;

      var dest;
      if (p.nodeId === null) {
        dest = { nodeId: mv - 1, route: 'outer', finished: false };
      } else {
        dest = walk(p.nodeId, p.route, mv, p.entered);
      }

      var score = 0;
      if (dest.finished) {
        score = 2000;
      } else {
        var dn = dest.nodeId;
        /* Capture */
        if (teamPieces(enemy).some(function (ep) { return ep.nodeId === dn && !ep.finished; })) score += 800;
        /* Shortcut corner landing */
        if (SC_CORNERS.indexOf(dn) >= 0) score += 80;
        /* Already on shortcut */
        if (dest.route !== 'outer') score += 40;
        /* Stack with friendly */
        if (teamPieces(team).some(function (fp) { return fp.id !== p.id && fp.nodeId === dn && !fp.finished; })) score += 25;
        /* Progress */
        score += progressScore(dn, dest.route);
      }

      if (score > bestScore) { bestScore = score; best = p.id; }
    });

    return best;
  }

  function progressScore(nodeId, route) {
    if (nodeId === null) return 0;
    if (route === 'exit') return 28 + (nodeId === 23 ? 1 : nodeId === 28 ? 2 : 0);
    if (nodeId === 22) return 26;
    if (route !== 'outer') return 22; // on a shortcut arm
    /* outer ring: nodes 0-19, with wrap. Score = distance from start */
    return nodeId >= 0 && nodeId <= 19 ? nodeId : 0;
  }

  /* ══════════════════════════════════════════════════════════════════
     WIN / GAME END
  ══════════════════════════════════════════════════════════════════ */

  function endGame(winner) {
    state.winner   = winner;
    state.phase    = 'gameover';
    setThrowBtnActive(false);
    renderPendingMoves();

    /* Record result */
    if (window.Auth && window.Auth.recordResult) {
      window.Auth.recordResult('yut-nori', winner === 'a' ? 'win' : 'loss');
    }

    /* Achievements */
    if (window.Achievements) {
      window.Achievements.evaluate({ gameId: 'yut-nori', result: winner === 'a' ? 'win' : 'loss', isOnline: !!window.currentRoomId });
      if (state.captureCount[winner] >= 4 && window.Achievements.trigger) {
        window.Achievements.trigger('yn_clean_sweep');
      }
    }

    /* Room mode: seat 0/2 = team A, seat 1/3 = team B */
    if (window.RoomBridge) {
      window.RoomBridge.reportWin(winner === 'a' ? 0 : 1);
    }

    render(); /* will draw the win overlay */
  }

  function checkMoAchievement() {
    if (state.moCount >= 3 && window.Achievements && window.Achievements.trigger) {
      window.Achievements.trigger('yn_triple_mo');
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDERING
  ══════════════════════════════════════════════════════════════════ */

  function render() {
    if (!ctx) return;
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    /* Board background — warm golden-brown for margin zones */
    ctx.fillStyle = '#c8a97a';
    ctx.fillRect(0, 0, w, h);

    drawBoardLines();
    drawNodes();
    drawOffBoard();
    drawOnBoard();
    drawSticks();
    drawFinished();

    if (state.phase === 'gameover') drawWinOverlay();
    if (state.phase === 'shortcut-choice') drawShortcutHints();
  }

  /* ── Board lines ─────────────────────────────────────────────── */

  function drawBoardLines() {
    var i, p;

    /* 1. Fill diamond interior with warm rice-paper */
    ctx.beginPath();
    [0, 5, 10, 15].forEach(function (cid, idx) {
      var cp = npos(cid);
      idx === 0 ? ctx.moveTo(cp.x, cp.y) : ctx.lineTo(cp.x, cp.y);
    });
    ctx.closePath();
    ctx.fillStyle = '#f5ecd5';
    ctx.fill();

    /* 2. Thick shortcut track lanes (warm rose) */
    var scLW = Math.max(7, Math.round(NODE_R * 0.82));
    ctx.strokeStyle = '#e8c4b8';
    ctx.lineWidth   = scLW;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.setLineDash([]);
    strokePath([5,  20, 21, 22]);
    strokePath([10, 24, 25, 22]);
    strokePath([15, 26, 27, 22]);
    strokePath([22, 23, 28, 0]);

    /* 3. Thick outer ring track lane (warm tan) */
    ctx.beginPath();
    for (i = 0; i < 20; i++) {
      p = npos(i);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#d4a97a';
    ctx.lineWidth   = Math.max(9, Math.round(NODE_R * 0.95));
    ctx.lineJoin    = 'round';
    ctx.stroke();

    /* 4. Outer ring dark outline */
    ctx.beginPath();
    for (i = 0; i < 20; i++) {
      p = npos(i);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#7a3a10';
    ctx.lineWidth   = 2;
    ctx.lineJoin    = 'round';
    ctx.setLineDash([]);
    ctx.stroke();

    /* 5. Shortcut dashed dark outline */
    ctx.setLineDash([Math.max(5, NODE_R * 0.55), Math.max(3, NODE_R * 0.35)]);
    ctx.strokeStyle = '#a02020';
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = 'round';
    strokePath([5,  20, 21, 22]);
    strokePath([10, 24, 25, 22]);
    strokePath([15, 26, 27, 22]);
    strokePath([22, 23, 28, 0]);
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
  }

  function strokePath(ids) {
    ctx.beginPath();
    ids.forEach(function (id, i) {
      var p = npos(id);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
  }

  /* ── Nodes ───────────────────────────────────────────────────── */

  function drawNodes() {
    for (var id = 0; id < 29; id++) {
      var pos      = npos(id);
      var isCorner = OUTER_CORNERS.indexOf(id) >= 0;
      var isCenter = id === 22;
      var isSC     = SC_CORNERS.indexOf(id) >= 0; // shortcut-entry corners (5/10/15)
      var r, fill, stroke;

      if (id === 0)       { r = NODE_R * 2.0; fill = '#8B1a1a'; stroke = '#5a0000'; }
      else if (isSC)      { r = NODE_R * 1.9; fill = '#c0392b'; stroke = '#7a0000'; }
      else if (isCenter)  { r = NODE_R * 1.7; fill = '#6b3a1f'; stroke = '#3d1a00'; }
      else                { r = NODE_R;       fill = '#8B4513'; stroke = '#4a200a'; }

      /* Shortcut choice highlight */
      if (state.shortcutPending) {
        var sp = state.shortcutPending;
        if (id === sp.outerNext || id === sp.shortcutFirst) {
          fill = '#f39c12'; stroke = '#8B5000'; r *= 1.35;
        }
      }

      /* Selected piece destination highlight */
      if (state.selectedPieceId && state.phase === 'move') {
        var destId = getDestNodeId(state.selectedPieceId);
        if (destId !== null && destId === id) {
          fill = '#f39c12'; stroke = '#8B5000'; r *= 1.25;
        }
      }

      /* Drop shadow */
      ctx.beginPath();
      ctx.arc(pos.x + r * 0.14, pos.y + r * 0.14, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fill();

      /* Main circle */
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isCorner || isCenter ? 2 : 1.5;
      ctx.stroke();

      /* Inner ring (depth ring) */
      if (r > NODE_R * 0.9) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r * 0.65, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      /* Specular highlight spot */
      ctx.beginPath();
      ctx.arc(pos.x - r * 0.27, pos.y - r * 0.30, r * 0.30, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();

      /* Labels */
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (id === 0) {
        ctx.font = 'bold ' + Math.max(8, Math.floor(r * 0.70)) + 'px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText('출발', pos.x, pos.y);
      } else if (isCenter) {
        ctx.font = 'bold ' + Math.max(9, Math.floor(r * 0.80)) + 'px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
        ctx.fillStyle = '#f5deb3';
        ctx.fillText('中', pos.x, pos.y);
      } else if (isSC) {
        /* Small star to signal shortcut entry */
        ctx.font = Math.max(7, Math.floor(r * 0.55)) + 'px sans-serif';
        ctx.fillStyle = 'rgba(255,255,220,0.80)';
        ctx.fillText('★', pos.x, pos.y);
      }
    }
  }

  function getDestNodeId(pieceId) {
    var piece = state.pieces[pieceId];
    if (!piece || piece.finished) return null;
    var mv = state.pendingMoves[0];
    if (!mv) return null;
    var d = piece.nodeId === null
      ? { nodeId: mv - 1, finished: false }
      : walk(piece.nodeId, piece.route, mv, piece.entered);
    return d.finished ? null : d.nodeId;
  }

  /* ── On-board pieces ─────────────────────────────────────────── */

  function drawOnBoard() {
    /* Group by nodeId */
    var groups = {};
    Object.values(state.pieces).forEach(function (p) {
      if (p.nodeId === null || p.finished) return;
      (groups[p.nodeId] = groups[p.nodeId] || []).push(p);
    });

    Object.keys(groups).forEach(function (nid) {
      var pieces = groups[nid];
      var pos;

      /* Animate pieces that just moved */
      if (moveAnim.active && pieces.some(function (p) { return moveAnim.ids.indexOf(p.id) >= 0; })) {
        var t = ease(moveAnim.progress);
        pos = { x: moveAnim.fx + (moveAnim.tx - moveAnim.fx) * t,
                y: moveAnim.fy + (moveAnim.ty - moveAnim.fy) * t };
      } else {
        pos = npos(parseInt(nid));
      }

      drawPieceGroup(pieces, pos);
    });
  }

  function drawPieceGroup(pieces, pos) {
    if (!pieces.length) return;
    var team     = pieces[0].team;
    var count    = pieces.length;
    var r        = NODE_R * 1.45;
    var col      = TEAM_COLOR[team];
    var dark     = TEAM_DARK[team];
    var selected = state.selectedPieceId && pieces.some(function (p) { return p.id === state.selectedPieceId; });

    /* Selection glow */
    if (selected) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * 1.85, 0, Math.PI * 2);
      ctx.strokeStyle = '#f5c518';
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }

    /* Drop shadow */
    ctx.beginPath();
    ctx.arc(pos.x + r * 0.14, pos.y + r * 0.14, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fill();

    /* Main piece */
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    /* Inner detail ring */
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r * 0.68, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    /* Specular highlight */
    ctx.beginPath();
    ctx.arc(pos.x - r * 0.30, pos.y - r * 0.33, r * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();

    var lbl = count > 1 ? '\xd7' + count : (team === 'a' ? '\ud64d' : '\uccad'); // 홍 or 청
    ctx.font = 'bold ' + Math.max(9, Math.floor(r * 0.85)) + 'px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lbl, pos.x, pos.y);
  }

  /* ── Off-board (staging) pieces ──────────────────────────────── */

  function drawOffBoard() {
    ['a', 'b'].forEach(function (team) {
      var all = teamPieces(team);
      var off = all.filter(function (p) { return p.nodeId === null; });
      var base = stagingPos(team);
      var r    = Math.max(7, NODE_R * 0.78);
      var sel  = state.selectedPieceId && off.some(function (p) { return p.id === state.selectedPieceId; });
      var col  = TEAM_COLOR[team];
      var dark = TEAM_DARK[team];

      /* Zone label (always visible) */
      ctx.font = 'bold ' + Math.max(8, Math.floor(r * 0.80)) + 'px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
      ctx.fillStyle = col + 'cc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(team === 'a' ? '홍' : '청', base.x, base.y - r * 2.4);

      if (!off.length) return;

      if (sel) {
        ctx.beginPath();
        ctx.arc(base.x, base.y, r * off.length * 1.5 + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#f5c518';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      off.forEach(function (p, i) {
        var ox = base.x + (i - (off.length - 1) / 2) * r * 2.5;

        /* Shadow */
        ctx.beginPath();
        ctx.arc(ox + r * 0.12, base.y + r * 0.12, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fill();

        /* Body */
        ctx.beginPath();
        ctx.arc(ox, base.y, r, 0, Math.PI * 2);
        ctx.fillStyle = sel ? '#f39c12' : col + 'bb';
        ctx.fill();
        ctx.strokeStyle = sel ? '#8B5000' : dark;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });
  }

  /* ── Finished pieces ─────────────────────────────────────────── */

  function drawFinished() {
    ['a', 'b'].forEach(function (team) {
      var fin = teamPieces(team).filter(function (p) { return p.finished; });
      if (!fin.length) return;

      var base = finishedPos(team);
      var r    = NODE_R * 0.65;

      fin.forEach(function (p, i) {
        var ox = base.x + (i - 1.5) * r * 2.3;
        ctx.beginPath();
        ctx.arc(ox, base.y, r, 0, Math.PI * 2);
        ctx.fillStyle = TEAM_COLOR[team];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = Math.max(6, Math.floor(r * 0.9)) + 'px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2714', ox, base.y);
      });
    });
  }

  /* ── Yut sticks display ──────────────────────────────────────── */

  function drawSticks() {
    var sticks = throwAnim.active ? throwAnim.sticks : (state.lastThrow ? state.lastThrow.sticks : null);
    if (!sticks) return;

    var pad = state.padX;
    /* Sticks live in the bottom margin, centered horizontally */
    var nodeZeroY = npos(0).y;
    var cy  = nodeZeroY + (canvas.height - nodeZeroY) * 0.52;
    var sw  = Math.max(6, Math.floor(pad * 0.30));
    var sh  = Math.max(16, Math.floor(pad * 0.80));
    var spacing = sw * 2.6;
    var cx0 = canvas.width / 2 - spacing * 1.5;

    sticks.forEach(function (flat, i) {
      var cx    = cx0 + i * spacing;
      var angle = 0;
      if (throwAnim.active) {
        var t   = throwAnim.progress;
        var dir = i % 2 === 0 ? 1 : -1;
        angle   = dir * Math.PI * 5 * (1 - ease(t));
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      var hw = sw / 2, hh = sh / 2;

      /* Stick shadow */
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(-hw + 1.5, -hh + 1.5, sw, sh, hw); }
      else { ctx.rect(-hw + 1.5, -hh + 1.5, sw, sh); }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();

      /* Stick body */
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(-hw, -hh, sw, sh, hw); }
      else { ctx.rect(-hw, -hh, sw, sh); }
      ctx.fillStyle   = flat ? '#f5deb3' : '#5d4037';
      ctx.fill();
      ctx.strokeStyle = flat ? '#8B4513' : '#2e1a10';
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      /* Grain lines on flat (light) side */
      if (flat) {
        ctx.strokeStyle = 'rgba(139,69,19,0.28)';
        ctx.lineWidth   = 0.7;
        for (var g = -1; g <= 1; g++) {
          ctx.beginPath();
          ctx.moveTo(-hw + 1, g * hh * 0.45);
          ctx.lineTo( hw - 1, g * hh * 0.45);
          ctx.stroke();
        }
      }

      ctx.restore();
    });
  }

  /* ── Shortcut choice hints ───────────────────────────────────── */

  function drawShortcutHints() {
    if (!state.shortcutPending) return;
    var sp = state.shortcutPending;

    [[sp.outerNext, '외곽'], [sp.shortcutFirst, '지름길']].forEach(function (pair) {
      var p = npos(pair[0]);
      ctx.font = 'bold ' + Math.max(9, NODE_R) + 'px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
      ctx.fillStyle = cssVar('--yn-highlight', '#f39c12');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(pair[1], p.x, p.y - NODE_R * 1.4);
    });
  }

  /* ── Win overlay ─────────────────────────────────────────────── */

  function drawWinOverlay() {
    var w = canvas.width, h = canvas.height;
    ctx.fillStyle = 'rgba(26,14,6,0.84)';
    ctx.fillRect(0, 0, w, h);

    var ko  = state.winner === 'a' ? '\ud300 A \uc2b9\ub9ac!' : '\ud300 B \uc2b9\ub9ac!';
    var en  = state.winner === 'a' ? 'Team A (Red) Wins!' : 'Team B (Blue) Wins!';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.floor(h * 0.072) + 'px "Playfair Display",serif';
    ctx.fillStyle = cssVar('--color-accent-gold', '#C89B3C');
    ctx.fillText(ko, w / 2, h / 2 - h * 0.055);

    ctx.font = Math.floor(h * 0.038) + 'px sans-serif';
    ctx.fillStyle = '#f5deb3';
    ctx.fillText(en, w / 2, h / 2 + h * 0.025);

    ctx.font = Math.floor(h * 0.028) + 'px sans-serif';
    ctx.fillStyle = '#c8a46e';
    ctx.fillText('Click \u201cNew Game\u201d to play again', w / 2, h / 2 + h * 0.09);
  }

  /* ── Position helpers ────────────────────────────────────────── */

  function stagingPos(team) {
    var pad = state.padX, w = canvas.width, h = canvas.height;
    /* Team A staging: lower-right corner; Team B: upper-left */
    return team === 'a'
      ? { x: w - pad * 0.55, y: h - pad * 0.55 }
      : { x: pad * 0.55,     y: pad * 0.55 };
  }

  function finishedPos(team) {
    var w = canvas.width, h = canvas.height;
    return team === 'a'
      ? { x: w * 0.84, y: h * 0.87 }
      : { x: w * 0.16, y: h * 0.13 };
  }

  /* ══════════════════════════════════════════════════════════════════
     INPUT HANDLING
  ══════════════════════════════════════════════════════════════════ */

  canvas.addEventListener('click', function (e) {
    if (state.animLock) return;

    var rect = canvas.getBoundingClientRect();
    var mx   = (e.clientX - rect.left)  * (canvas.width  / rect.width);
    var my   = (e.clientY - rect.top)   * (canvas.height / rect.height);

    if (state.phase === 'shortcut-choice') { onShortcutClick(mx, my); return; }
    if (state.phase !== 'move')            return;
    if (state.aiEnabled && state.currentTeam === 'b') return;

    onMoveClick(mx, my);
  });

  function onMoveClick(mx, my) {
    var team = state.currentTeam;
    var best = null, bestD = Infinity;
    var seen = {};

    /* On-board stacks */
    teamPieces(team).filter(function (p) { return !p.finished && p.nodeId !== null; })
      .forEach(function (p) {
        if (seen[p.nodeId]) return;
        seen[p.nodeId] = true;
        var d = dist(mx, my, npos(p.nodeId));
        if (d < Math.max(NODE_R * 2.2, 22) && d < bestD) { bestD = d; best = p.id; }
      });

    /* Off-board staging zone */
    var off = teamPieces(team).filter(function (p) { return p.nodeId === null; });
    if (off.length) {
      var sp = stagingPos(team);
      var d  = dist(mx, my, sp);
      if (d < Math.max(NODE_R * 3, 32) && d < bestD) { bestD = d; best = off[0].id; }
    }

    if (best) doMove(best);
  }

  function onShortcutClick(mx, my) {
    var sp = state.shortcutPending;
    if (!sp) return;
    var dOuter = dist(mx, my, npos(sp.outerNext));
    var dShort = dist(mx, my, npos(sp.shortcutFirst));
    resolveShortcut(dShort < dOuter);
    state.phase = 'move';
    advance();
  }

  /* ══════════════════════════════════════════════════════════════════
     HUD / UI HELPERS
  ══════════════════════════════════════════════════════════════════ */

  function updateHUD() {
    var elA = document.getElementById('yn-label-a');
    var elB = document.getElementById('yn-label-b');
    var fa  = teamPieces('a').filter(function (p) { return p.finished; }).length;
    var fb  = teamPieces('b').filter(function (p) { return p.finished; }).length;
    if (elA) elA.textContent = '\ud300 A (\ud64d) ' + fa + '/4';
    if (elB) elB.textContent = '\ud300 B (\uccad) ' + fb + '/4';
  }

  function updateStatus() {
    var t = state.currentTeam === 'a' ? '\ud300 A' : '\ud300 B';
    var msgs = {
      throw: t + '\uc758 \ucc28\ub808 \u2014 \uc724 \ub358\uc9c0\uae30!',
      move:  t + '\uc758 \ucc28\ub808 \u2014 \ub9d0 \uc120\ud0dd ' + (state.pendingMoves[0] ? '(' + state.pendingMoves[0] + ')' : ''),
    };
    setStatus(msgs[state.phase] || '');
  }

  function setStatus(msg) {
    if (elStatus) elStatus.textContent = msg;
  }

  function setThrowBtnActive(on) {
    if (elThrowBtn) elThrowBtn.disabled = !on;
  }

  function setThrowResult(result) {
    if (!elThrowRes) return;
    var extra = THROW_NAMES[result.value].extra;
    elThrowRes.innerHTML = '<span class="yn-throw-ko">' + result.ko + '</span>'
      + ' (' + result.name + ') \u2014 ' + result.value + ' move' + (result.value !== 1 ? 's' : '')
      + (extra ? ' <strong>+ throw again!</strong>' : '');
  }

  function renderPendingMoves() {
    if (!elPending) return;
    elPending.innerHTML = '';
    state.pendingMoves.forEach(function (v) {
      var chip = document.createElement('span');
      chip.className = 'yn-move-chip';
      chip.textContent = v;
      elPending.appendChild(chip);
    });
  }

  function showToast(msg) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:76px;left:50%;transform:translateX(-50%);'
      + 'background:#1A0E06;color:#f5deb3;padding:7px 18px;border-radius:20px;'
      + 'font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:15px;'
      + 'font-weight:bold;z-index:9999;pointer-events:none;'
      + 'animation:yn-toast-fade 2.2s forwards';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2300);
  }

  /* ══════════════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════════════ */

  function dist(mx, my, pos) { var dx = mx - pos.x, dy = my - pos.y; return Math.sqrt(dx*dx + dy*dy); }
  function ease(t) { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }

  function cssVar(name, fb) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fb;
    } catch (e) { return fb; }
  }

  /* ══════════════════════════════════════════════════════════════════
     MODE SELECTION (shown on new game before first throw)
  ══════════════════════════════════════════════════════════════════ */

  function showModeSelect() {
    /* Overlay via HTML buttons rendered on top of canvas. Reuse the
       game container — just prompt via status and the new-game button.
       For room mode the mode is pre-set by the room. */
    var overlay = document.createElement('div');
    overlay.id = 'yn-mode-overlay';
    overlay.className = 'yn-mode-overlay';
    overlay.innerHTML = '<h2>Select Mode</h2>'
      + '<div class="yn-mode-buttons">'
      + '<button class="btn btn-primary" id="yn-mode-2p">2 Players</button>'
      + '<button class="btn btn-secondary" id="yn-mode-4p">4 Players</button>'
      + '</div>';

    var wrap = document.getElementById('yn-board-wrap');
    if (wrap) {
      wrap.style.position = 'relative';
      wrap.appendChild(overlay);
    }

    document.getElementById('yn-mode-2p').onclick = function () {
      overlay.parentNode.removeChild(overlay);
      startGame('2p');
    };
    document.getElementById('yn-mode-4p').onclick = function () {
      overlay.parentNode.removeChild(overlay);
      startGame('4p');
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     RESIZE
  ══════════════════════════════════════════════════════════════════ */

  window.GameResize = function (availW, availH) {
    /* Use the actual container width — no artificial cap */
    var size = Math.max(availW || 360, 200);
    canvas.width  = size;
    canvas.height = size; /* square canvas — sticks live in corner margins */
    state.boardSize = size;
    state.padX = state.padY = Math.round(size * 0.1);
    NODE_R = Math.max(9, Math.round(size * 0.038));
    render();
  };

  /* ══════════════════════════════════════════════════════════════════
     GAME FLOW
  ══════════════════════════════════════════════════════════════════ */

  function startGame(mode) {
    /* Remove any leftover mode overlay */
    var old = document.getElementById('yn-mode-overlay');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    state = newState();
    state.mode      = mode || '2p';
    state.aiEnabled = !window.RoomBridge && (elAiToggle ? elAiToggle.checked : true);
    state.phase     = 'throw';

    /* Re-size to current wrapper — no cap */
    var wrap = document.getElementById('yn-board-wrap');
    var sz   = wrap ? (wrap.clientWidth || 480) : 480;
    window.GameResize(sz, sz);

    updateHUD();
    setStatus('\ud300 A\uc758 \ucc28\ub808 (Team A\u2019s turn) \u2014 \uc724 \ub358\uc9c0\uae30!');
    setThrowBtnActive(true);
    if (elThrowRes) elThrowRes.innerHTML = '';
    renderPendingMoves();
    render();

    /* If room mode: disable AI, signal ready */
    if (window.RoomBridge) {
      window.RoomBridge.gameReady && window.RoomBridge.gameReady();
    }
  }

  function newGame() {
    /* Show mode selection unless in room (room pre-sets mode) */
    if (window.RoomBridge) {
      startGame(state.mode);
    } else {
      showModeSelect();
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     EVENT LISTENERS
  ══════════════════════════════════════════════════════════════════ */

  if (elThrowBtn) elThrowBtn.addEventListener('click', function () {
    if (state.aiEnabled && state.currentTeam === 'b') return;
    doThrow();
  });

  if (elNewBtn)   elNewBtn.addEventListener('click', newGame);

  if (elAiToggle) elAiToggle.addEventListener('change', function () {
    state.aiEnabled = elAiToggle.checked && !window.RoomBridge;
  });

  document.addEventListener('fs-enter', function () {
    var wrap = document.getElementById('yn-board-wrap');
    if (wrap) window.GameResize(wrap.clientWidth, wrap.clientHeight);
  });
  document.addEventListener('fs-exit', function () {
    var wrap = document.getElementById('yn-board-wrap');
    if (wrap) window.GameResize(wrap.clientWidth, wrap.clientHeight);
  });

  /* Toast animation keyframe (injected once) */
  if (!document.getElementById('yn-anim-style')) {
    var s = document.createElement('style');
    s.id = 'yn-anim-style';
    s.textContent = '@keyframes yn-toast-fade{0%{opacity:1;transform:translateX(-50%) translateY(0)}75%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-18px)}}';
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */

  (function init() {
    var wrap = document.getElementById('yn-board-wrap');
    var sz   = wrap ? (wrap.clientWidth || 480) : 480;
    window.GameResize(sz, sz);

    /* Show mode select on first load (skipped in room mode) */
    if (window.RoomBridge) {
      startGame('2p');
    } else {
      showModeSelect();
    }
  }());

}());
