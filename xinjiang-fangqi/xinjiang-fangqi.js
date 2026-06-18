(function() {
  'use strict';
  // Xinjiang Fangqi (新疆方棋)
  // Rules reconstruction notes:
  // CONFIRMED: 7x7 board, alternate placement, 2x2 square captures enemy pieces adjacent
  // CONFIRMED: elimination win condition (capture all opponent pieces)
  // RECONSTRUCTED: multi-capture chain resolution - using simultaneous resolution
  // RECONSTRUCTED: board-full with no captures = piece-count tiebreaker
  // RECONSTRUCTED: no placement restrictions on opening moves
  // Source: Fangqi Wikipedia article + Alquerque family conventions

  // ── Constants ──────────────────────────────────────────────────────
  var BOARD_SIZE = 7;
  var EMPTY = 0;
  var BLACK = 1;
  var WHITE = 2;
  // RECONSTRUCTED: 20 pieces per player (placement-from-pool model)
  var PIECES_PER_PLAYER = 20;
  var PADDING = 40; // canvas padding to first intersection

  // ── State ──────────────────────────────────────────────────────────
  var state = {
    board: [],
    currentTurn: BLACK,
    phase: 'placement',
    blackPlaced: 0,
    whitePlaced: 0,
    blackRemaining: PIECES_PER_PLAYER,
    whiteRemaining: PIECES_PER_PLAYER,
    blackCaptured: 0,
    whiteCaptured: 0,
    selectedCell: null,
    lastCaptures: [],
    hoverCell: null,
    gameOver: false,
    winner: null,
    moveHistory: [],
    moveCount: 0,
    humanColor: BLACK,
    aiEnabled: true,
    vsRoom: false,
    animating: false,
    cellSize: 80,
    padX: PADDING,
    padY: PADDING
  };

  var canvas, ctx;
  var aiTimeout = null;
  var vsRoom = false;       // true only inside an active room (multiplayer)
  var roomSeat = -1;        // this client's 0-based seat in room mode
  var winReported = false;  // guard so reportWin fires at most once

  // ── Colour bridge (window.CGTheme) — "oasis bazaar" palette ────────
  // Light = warm midday teahouse; dark = lamplit evening (dimmer wood,
  // deeper adobe). Re-read on every theme change, never hardcode in draws.
  var C = {};
  function readColors() {
    var dark = (window.CGTheme && typeof window.CGTheme.getTheme === 'function')
      ? window.CGTheme.getTheme() === 'dark' : false;
    C = {
      // table surround + board
      backdrop:  dark ? '#2A1D14' : '#3B2A1E',                          // deep adobe
      bezel:     dark ? '#56351C' : '#6B4226',                          // walnut bezel
      bezelEdge: dark ? '#3A2312' : '#4A2D18',
      bezelLine: dark ? 'rgba(242,227,194,0.16)' : 'rgba(242,227,194,0.25)',
      wood:      dark ? '#B89464' : '#D9B07C',                          // poplar/apricot
      woodWear:  dark ? 'rgba(74,42,12,0.32)'   : 'rgba(122,69,24,0.28)', // radial wear glaze
      grain:     dark ? 'rgba(90,56,24,0.30)'   : 'rgba(139,90,46,0.26)',
      grid:      dark ? 'rgba(74,46,22,0.75)'   : 'rgba(92,58,30,0.70)', // burnt-ink brown
      dot:       dark ? '#5E3C1E' : '#7A4F28',                          // punched chekich dots
      dotPunch:  'rgba(0,0,0,0.25)',
      // P1 (BLACK) — carnelian river pebbles
      p1:        dark ? '#96351F' : '#A33B2A',
      p1Hi:      dark ? '#C75E3E' : '#D96A4A',
      p1Rim:     dark ? '#5E1F12' : '#6E2418',
      p1Ghost:   dark ? 'rgba(150,53,31,0.50)'  : 'rgba(163,59,42,0.45)',
      // P2 (WHITE) — teal glazed ceramic discs
      p2:        dark ? '#2A726E' : '#2E7F7A',
      p2Hi:      dark ? '#5FB0A7' : '#6FC2B8',
      p2Rim:     dark ? '#15413E' : '#1A4E4A',
      p2Ghost:   dark ? 'rgba(42,114,110,0.55)' : 'rgba(46,127,122,0.50)',
      p2Spark:   'rgba(255,255,255,0.55)',
      // accents
      gold:      '#E8A013',                                             // saffron
      goldSoft:  'rgba(245,201,92,0.55)',
      ikat:      '#C2185B',                                             // capture flash
      shadow:    'rgba(0,0,0,0.30)'
    };
  }

  // Deterministic per-intersection hash — stable stone jitter, no flicker.
  function stoneHash(r, c) {
    return ((r * 31 + c * 17 + 11) * 13) % 100;
  }

  // ── Helpers ────────────────────────────────────────────────────────
  function getOpponent(player) { return player === BLACK ? WHITE : BLACK; }

  function countPieces(player) {
    var count = 0;
    for (var r = 0; r < BOARD_SIZE; r++)
      for (var c = 0; c < BOARD_SIZE; c++)
        if (state.board[r][c] === player) count++;
    return count;
  }

  function isValidPlacement(row, col) {
    if (row < 0 || row >= BOARD_SIZE) return false;
    if (col < 0 || col >= BOARD_SIZE) return false;
    return state.board[row][col] === EMPTY;
  }

  function getAllValidPlacements() {
    var moves = [];
    for (var r = 0; r < BOARD_SIZE; r++)
      for (var c = 0; c < BOARD_SIZE; c++)
        if (state.board[r][c] === EMPTY) moves.push({ row: r, col: c });
    return moves;
  }

  // ── Init ───────────────────────────────────────────────────────────
  function initGame() {
    if (aiTimeout) { clearTimeout(aiTimeout); aiTimeout = null; }
    state.board = [];
    for (var r = 0; r < BOARD_SIZE; r++) {
      state.board[r] = [];
      for (var c = 0; c < BOARD_SIZE; c++) state.board[r][c] = EMPTY;
    }
    state.currentTurn    = BLACK;
    state.phase          = 'placement';
    state.blackPlaced    = 0;
    state.whitePlaced    = 0;
    state.blackRemaining = PIECES_PER_PLAYER;
    state.whiteRemaining = PIECES_PER_PLAYER;
    state.blackCaptured  = 0;
    state.whiteCaptured  = 0;
    state.selectedCell   = null;
    state.lastCaptures   = [];
    state.hoverCell      = null;
    state.gameOver       = false;
    state.winner         = null;
    state.moveHistory    = [];
    state.moveCount      = 0;
    state.animating      = false;
    hideOverlay();
    render();
    // If AI goes first (shouldn't happen - human is always BLACK), trigger AI
    if (state.aiEnabled && state.currentTurn !== state.humanColor) {
      aiTimeout = setTimeout(aiTakeTurn, 600);
    }
  }

  // ── Capture Logic ──────────────────────────────────────────────────
  function detectCaptures(row, col, player) {
    var capturedSet = {};
    var topLeftOffsets = [[0,0],[0,-1],[-1,0],[-1,-1]];
    topLeftOffsets.forEach(function(offset) {
      var r = row + offset[0];
      var c = col + offset[1];
      if (r < 0 || r + 1 >= BOARD_SIZE || c < 0 || c + 1 >= BOARD_SIZE) return;
      var corners = [
        state.board[r][c],
        state.board[r][c+1],
        state.board[r+1][c],
        state.board[r+1][c+1]
      ];
      if (corners.every(function(p) { return p === player; })) {
        // RECONSTRUCTED: capture enemy pieces adjacent to any corner of the 2x2 square
        captureAdjacentEnemies(r, c, player, capturedSet);
      }
    });
    return Object.keys(capturedSet).map(function(key) {
      var parts = key.split(',');
      return { row: parseInt(parts[0], 10), col: parseInt(parts[1], 10) };
    });
  }

  function captureAdjacentEnemies(r, c, player, capturedSet) {
    // RECONSTRUCTED: Enemy pieces orthogonally adjacent to any of the 4 square corners are captured
    var enemy = getOpponent(player);
    var squareCorners = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
    var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    squareCorners.forEach(function(corner) {
      dirs.forEach(function(d) {
        var nr = corner[0] + d[0];
        var nc = corner[1] + d[1];
        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) return;
        if (state.board[nr][nc] === enemy) {
          capturedSet[nr + ',' + nc] = true;
        }
      });
    });
  }

  // DISPLAY ONLY — which stones belong to the 2x2 square(s) just completed
  // at (row,col). Pure read of the board, used by the capture flash; the
  // capture rules themselves live in detectCaptures above and are untouched.
  function getFangCells(row, col, player) {
    var cells = [];
    var seen = {};
    var offsets = [[0,0],[0,-1],[-1,0],[-1,-1]];
    offsets.forEach(function(offset) {
      var r = row + offset[0];
      var c = col + offset[1];
      if (r < 0 || r + 1 >= BOARD_SIZE || c < 0 || c + 1 >= BOARD_SIZE) return;
      var corners = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
      var complete = corners.every(function(k) { return state.board[k[0]][k[1]] === player; });
      if (complete) {
        corners.forEach(function(k) {
          var key = k[0] + ',' + k[1];
          if (!seen[key]) { seen[key] = true; cells.push({ row: k[0], col: k[1] }); }
        });
      }
    });
    return cells;
  }

  function removeCaptures(captures) {
    captures.forEach(function(c) {
      var capturedColor = state.board[c.row][c.col];
      state.board[c.row][c.col] = EMPTY;
      if (capturedColor === BLACK) state.blackCaptured++;
      else if (capturedColor === WHITE) state.whiteCaptured++;
    });
  }

  // ── Win Detection ──────────────────────────────────────────────────
  function checkWinConditions() {
    var blackOnBoard = countPieces(BLACK);
    var whiteOnBoard = countPieces(WHITE);
    var blackInHand  = state.blackRemaining;
    var whiteInHand  = state.whiteRemaining;

    var blackEliminated = (blackOnBoard === 0 && blackInHand === 0);
    var whiteEliminated = (whiteOnBoard === 0 && whiteInHand === 0);

    if (blackEliminated && whiteEliminated) { triggerGameOver('draw'); return true; }
    if (blackEliminated) { triggerGameOver(WHITE); return true; }
    if (whiteEliminated) { triggerGameOver(BLACK); return true; }

    // All pieces placed: end game by piece count (board rarely fills with 40 pieces on 49 spots)
    var allPlaced = (blackInHand === 0 && whiteInHand === 0);
    if (allPlaced) {
      if (blackOnBoard > whiteOnBoard) triggerGameOver(BLACK);
      else if (whiteOnBoard > blackOnBoard) triggerGameOver(WHITE);
      else triggerGameOver('draw');
      return true;
    }

    // Board full before all pieces placed
    var boardFull = (getAllValidPlacements().length === 0);
    if (boardFull) { triggerGameOver('draw'); return true; }
    return false;
  }

  function triggerGameOver(winner) {
    state.gameOver = true;
    state.winner   = winner;
    state.phase    = 'gameover';
    var humanColor = state.humanColor;
    if (state.aiEnabled) {
      if (winner === humanColor) {
        var humanOnBoard = countPieces(humanColor);
        if (humanOnBoard <= 3 && window.Achievements) Achievements.checkAction('xf_comeback_win');
        if (window.Auth) Auth.recordResult('xinjiang-fangqi', 'win');
      } else if (winner !== 'draw') {
        if (window.Auth) Auth.recordResult('xinjiang-fangqi', 'loss');
      }
      if (window.Achievements) {
        Achievements.evaluate({ gameId: 'xinjiang-fangqi', result: winner === humanColor ? 'win' : (winner === 'draw' ? 'draw' : 'loss') });
      }
    }
    render();
    showOverlay(winner);
  }

  // ── Turn lifecycle ─────────────────────────────────────────────────
  function placePiece(row, col, player) {
    state.board[row][col] = player;
    if (player === BLACK) { state.blackPlaced++; state.blackRemaining--; }
    else                  { state.whitePlaced++; state.whiteRemaining--; }
    state.selectedCell = { row: row, col: col };

    var captures = detectCaptures(row, col, player);
    state.moveHistory.push({ row: row, col: col, player: player, captures: captures.slice() });
    state.moveCount++;
    state.lastCaptures = captures;

    if (captures.length > 0) {
      state.animating = true;
      animateCaptures(captures, getFangCells(row, col, player), function() {
        removeCaptures(captures);
        state.animating = false;
        if (captures.length >= 4 && window.Achievements) Achievements.checkAction('xf_mass_capture');
        finalizeTurn();
      });
    } else {
      finalizeTurn();
    }
  }

  function finalizeTurn() {
    if (checkWinConditions()) { syncRoom(); return; }
    state.currentTurn = getOpponent(state.currentTurn);
    render();
    syncRoom();
    if (state.aiEnabled && state.currentTurn !== state.humanColor) {
      aiTimeout = setTimeout(aiTakeTurn, 400 + Math.floor(Math.random() * 300));
    }
  }

  // ── Capture animation ──────────────────────────────────────────────
  // Ikat-magenta flash: captured stones get a filled pulse, the four
  // stones of the completed fang get a ring pulse. Display only.
  function animateCaptures(captures, fangCells, callback) {
    var frame = 0;
    var totalFrames = 18;
    function step() {
      render();
      var alpha = Math.sin((frame / totalFrames) * Math.PI) * 0.75;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = C.ikat;
      captures.forEach(function(c) {
        var xy = getCellXY(c.row, c.col);
        ctx.beginPath();
        ctx.arc(xy.x, xy.y, state.cellSize * 0.35, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = Math.min(1, alpha + 0.2);
      ctx.strokeStyle = C.ikat;
      ctx.lineWidth = 3;
      fangCells.forEach(function(f) {
        var xy = getCellXY(f.row, f.col);
        ctx.beginPath();
        ctx.arc(xy.x, xy.y, state.cellSize * 0.40, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
      frame++;
      if (frame < totalFrames) requestAnimationFrame(step);
      else callback();
    }
    requestAnimationFrame(step);
  }

  // ── Rendering ──────────────────────────────────────────────────────
  function getCellXY(row, col) {
    return {
      x: state.padX + col * state.cellSize,
      y: state.padY + row * state.cellSize
    };
  }

  function renderBoard() {
    var boardPx = (BOARD_SIZE - 1) * state.cellSize;
    var x0 = state.padX, y0 = state.padY;
    var x1 = x0 + boardPx, y1 = y0 + boardPx;
    var bezelOut = 32;  // walnut bezel outer reach (PADDING is 40, so it fits)
    var woodIn   = 22;  // wood surface reach beyond the grid

    // Deep adobe surround
    ctx.fillStyle = C.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Walnut bezel
    ctx.fillStyle = C.bezel;
    ctx.fillRect(x0 - bezelOut, y0 - bezelOut, boardPx + 2 * bezelOut, boardPx + 2 * bezelOut);
    ctx.strokeStyle = C.bezelEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(x0 - bezelOut + 1.5, y0 - bezelOut + 1.5, boardPx + 2 * bezelOut - 3, boardPx + 2 * bezelOut - 3);

    // Worn poplar/apricot tabletop
    ctx.fillStyle = C.wood;
    ctx.fillRect(x0 - woodIn, y0 - woodIn, boardPx + 2 * woodIn, boardPx + 2 * woodIn);

    // Subtle radial wear toward the edges (2-stop, transparent centre)
    var wcx = (x0 + x1) / 2, wcy = (y0 + y1) / 2;
    var wear = ctx.createRadialGradient(wcx, wcy, boardPx * 0.22, wcx, wcy, boardPx * 0.85);
    wear.addColorStop(0, 'rgba(0,0,0,0)');
    wear.addColorStop(1, C.woodWear);
    ctx.fillStyle = wear;
    ctx.fillRect(x0 - woodIn, y0 - woodIn, boardPx + 2 * woodIn, boardPx + 2 * woodIn);

    // Thin silk inlay line where bezel meets wood
    ctx.strokeStyle = C.bezelLine;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - woodIn - 2.5, y0 - woodIn - 2.5, boardPx + 2 * woodIn + 5, boardPx + 2 * woodIn + 5);

    // 3 faint long grain streaks (deterministic gentle waves)
    ctx.strokeStyle = C.grain;
    var wx0 = x0 - woodIn, wx1 = x1 + woodIn;
    var woodH = boardPx + 2 * woodIn;
    var k, gy, seg, segW, amp;
    for (k = 0; k < 3; k++) {
      gy = (y0 - woodIn) + woodH * (0.20 + k * 0.30) + (k === 1 ? 6 : -4);
      amp = 2 + k;
      segW = (wx1 - wx0 - 8) / 4;
      ctx.lineWidth = 1 + k * 0.3;
      ctx.beginPath();
      ctx.moveTo(wx0 + 4, gy);
      for (seg = 0; seg < 4; seg++) {
        ctx.quadraticCurveTo(
          wx0 + 4 + segW * seg + segW / 2,
          gy + (seg % 2 === 0 ? amp : -amp),
          wx0 + 4 + segW * (seg + 1),
          gy
        );
      }
      ctx.stroke();
    }

    // Hand-inked grid lines — burnt ink, width varies deterministically
    ctx.strokeStyle = C.grid;
    var gridEnd = (BOARD_SIZE - 1) * state.cellSize;
    for (var i = 0; i < BOARD_SIZE; i++) {
      var startX = state.padX + i * state.cellSize;
      var startY = state.padY + i * state.cellSize;

      // Vertical line
      ctx.lineWidth = 1.2 + ((i * 37) % 7) * 0.1;       // 1.2 - 1.8
      ctx.beginPath();
      ctx.moveTo(startX, state.padY);
      ctx.lineTo(startX, state.padY + gridEnd);
      ctx.stroke();

      // Horizontal line
      ctx.lineWidth = 1.2 + ((i * 37 + 5) % 7) * 0.1;
      ctx.beginPath();
      ctx.moveTo(state.padX, startY);
      ctx.lineTo(state.padX + gridEnd, startY);
      ctx.stroke();
    }

    // Punched chekich dots at every intersection
    for (var r = 0; r < BOARD_SIZE; r++) {
      for (var c = 0; c < BOARD_SIZE; c++) {
        var xy = getCellXY(r, c);
        ctx.fillStyle = C.dot;
        ctx.beginPath();
        ctx.arc(xy.x, xy.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        // tiny offset pit for a punched-stamp feel
        ctx.fillStyle = C.dotPunch;
        ctx.beginPath();
        ctx.arc(xy.x + 0.5, xy.y + 0.6, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Chekich dot rosette around the centre intersection
    var mid = Math.floor(BOARD_SIZE / 2);
    var mxy = getCellXY(mid, mid);
    var rosR = state.cellSize * 0.16;
    ctx.fillStyle = C.dot;
    for (k = 0; k < 8; k++) {
      var a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      ctx.beginPath();
      ctx.arc(mxy.x + Math.cos(a) * rosR, mxy.y + Math.sin(a) * rosR, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderHighlights() {
    // Last placed piece highlight — saffron ring with a soft glow
    if (state.selectedCell) {
      var xy = getCellXY(state.selectedCell.row, state.selectedCell.col);
      ctx.strokeStyle = C.goldSoft;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(xy.x, xy.y, state.cellSize * 0.40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(xy.x, xy.y, state.cellSize * 0.40, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hover ghost piece + saffron legal-spot ring
    if (state.hoverCell && !state.gameOver && !state.animating) {
      if (!(state.aiEnabled || state.vsRoom) || state.currentTurn === state.humanColor) {
        var hxy = getCellXY(state.hoverCell.row, state.hoverCell.col);
        ctx.fillStyle = state.currentTurn === BLACK ? C.p1Ghost : C.p2Ghost;
        ctx.beginPath();
        ctx.arc(hxy.x, hxy.y, state.cellSize * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(hxy.x, hxy.y, state.cellSize * 0.38, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function renderSquareIndicators() {
    if (!state.hoverCell) return;
    if ((state.aiEnabled || state.vsRoom) && state.currentTurn !== state.humanColor) return;
    if (state.gameOver || state.animating) return;

    var row = state.hoverCell.row;
    var col = state.hoverCell.col;
    if (state.board[row][col] !== EMPTY) return;  // don't overwrite placed pieces
    var player = state.currentTurn;

    // Temporarily place to check captures
    state.board[row][col] = player;

    // Check which 2x2 squares would be completed
    var offsets = [[0,0],[0,-1],[-1,0],[-1,-1]];
    offsets.forEach(function(offset) {
      var r = row + offset[0];
      var c = col + offset[1];
      if (r < 0 || r + 1 >= BOARD_SIZE || c < 0 || c + 1 >= BOARD_SIZE) return;
      var corners = [state.board[r][c], state.board[r][c+1], state.board[r+1][c], state.board[r+1][c+1]];
      if (corners.every(function(p) { return p === player; })) {
        // Draw saffron square outline
        var topLeft = getCellXY(r, c);
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(
          topLeft.x - 4,
          topLeft.y - 4,
          state.cellSize + 8,
          state.cellSize + 8
        );
        ctx.setLineDash([]);
      }
    });

    state.board[row][col] = EMPTY;
  }

  function renderPieces() {
    for (var r = 0; r < BOARD_SIZE; r++) {
      for (var c = 0; c < BOARD_SIZE; c++) {
        var piece = state.board[r][c];
        if (piece === EMPTY) continue;
        var xy = getCellXY(r, c);
        var radius = state.cellSize * 0.32;
        var h = stoneHash(r, c);

        if (piece === BLACK) {
          // Carnelian river pebble — matte, slightly irregular.
          // Per-stone radius + rotation jitter from the deterministic hash.
          var pr   = radius * (0.96 + (h % 8) * 0.01);          // 0.96 - 1.03
          var rot  = ((h % 12) / 12) * Math.PI;                 // squash axis
          var hiA  = -2.35 + ((h % 5) - 2) * 0.12;              // highlight angle

          // Shadow
          ctx.beginPath();
          ctx.ellipse(xy.x + 1.5, xy.y + 2, pr, pr * 0.93, rot, 0, Math.PI * 2);
          ctx.fillStyle = C.shadow;
          ctx.fill();

          // Body — subtly squashed ellipse, pebble-like
          ctx.beginPath();
          ctx.ellipse(xy.x, xy.y, pr, pr * 0.93, rot, 0, Math.PI * 2);
          ctx.fillStyle = C.p1;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = C.p1Rim;
          ctx.stroke();

          // Single matte highlight, upper-left biased
          ctx.beginPath();
          ctx.arc(xy.x + Math.cos(hiA) * pr * 0.38, xy.y + Math.sin(hiA) * pr * 0.38, pr * 0.30, 0, Math.PI * 2);
          ctx.fillStyle = C.p1Hi;
          ctx.fill();
        } else {
          // Teal glazed ceramic disc — smoother and glossier than P1.
          // Shadow
          ctx.beginPath();
          ctx.arc(xy.x + 1.5, xy.y + 2, radius, 0, Math.PI * 2);
          ctx.fillStyle = C.shadow;
          ctx.fill();

          // Body — perfect circle with a dark pooled-glaze rim
          ctx.beginPath();
          ctx.arc(xy.x, xy.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = C.p2;
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = C.p2Rim;
          ctx.stroke();

          // Glaze hot-spot + small sharp gloss spark
          ctx.beginPath();
          ctx.ellipse(xy.x - radius * 0.32, xy.y - radius * 0.34, radius * 0.34, radius * 0.22, -0.6, 0, Math.PI * 2);
          ctx.fillStyle = C.p2Hi;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(xy.x - radius * 0.44, xy.y - radius * 0.46, radius * 0.09, 0, Math.PI * 2);
          ctx.fillStyle = C.p2Spark;
          ctx.fill();
        }
      }
    }
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderBoard();
    renderHighlights();
    renderSquareIndicators();
    renderPieces();
    updateSidebar();
  }

  function updateSidebar() {
    var turnEl = document.getElementById('xf-turn-indicator');
    if (turnEl) {
      if (state.gameOver) {
        turnEl.textContent = state.winner === 'draw' ? 'Draw!' :
          (state.winner === BLACK ? 'Black wins!' : 'White wins!');
        turnEl.dataset.color = state.winner === 'draw' ? 'draw' : (state.winner === BLACK ? 'black' : 'white');
      } else {
        turnEl.textContent = (state.currentTurn === BLACK ? 'Black' : 'White') + "'s turn";
        turnEl.dataset.color = state.currentTurn === BLACK ? 'black' : 'white';
      }
      // Also update the disc element
      var discEl = document.getElementById('xf-turn-disc');
      if (discEl) discEl.dataset.color = turnEl.dataset.color;
    }

    var bOnBoard = countPieces(BLACK);
    var wOnBoard = countPieces(WHITE);
    setEl('xf-black-hand',     state.blackRemaining);
    setEl('xf-black-board',    bOnBoard);
    setEl('xf-black-captured', state.whiteCaptured);
    setEl('xf-white-hand',     state.whiteRemaining);
    setEl('xf-white-board',    wOnBoard);
    setEl('xf-white-captured', state.blackCaptured);
    setEl('xf-move-count',     state.moveCount);
  }

  function setEl(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Game Over Overlay ──────────────────────────────────────────────
  function showOverlay(winner) {
    var overlay = document.getElementById('xf-overlay');
    var msg     = document.getElementById('xf-overlay-msg');
    var sub     = document.getElementById('xf-overlay-sub');
    if (!overlay) return;
    if (winner === 'draw') {
      msg.textContent = 'Draw!';
      sub.textContent = 'Pieces tied - neither player could eliminate the other.';
    } else {
      var color = winner === BLACK ? 'Black' : 'White';
      msg.textContent = color + ' wins!';
      var bp = countPieces(BLACK), wp = countPieces(WHITE);
      sub.textContent = 'Black: ' + bp + ' on board | White: ' + wp + ' on board';
    }
    overlay.hidden = false;
  }

  function hideOverlay() {
    var overlay = document.getElementById('xf-overlay');
    if (overlay) overlay.hidden = true;
  }

  // ── Input Handling ─────────────────────────────────────────────────
  function getCellFromEvent(e) {
    var rect   = canvas.getBoundingClientRect();
    var scaleX = canvas.width  / rect.width;
    var scaleY = canvas.height / rect.height;
    var x = (e.clientX - rect.left) * scaleX;
    var y = (e.clientY - rect.top)  * scaleY;
    // Adjust for padding, then snap to nearest intersection
    var col = Math.round((x - state.padX) / state.cellSize);
    var row = Math.round((y - state.padY) / state.cellSize);
    if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return null;
    // Snap distance check
    var snapX = state.padX + col * state.cellSize;
    var snapY = state.padY + row * state.cellSize;
    var dist  = Math.sqrt((x - snapX) * (x - snapX) + (y - snapY) * (y - snapY));
    if (dist > state.cellSize * 0.45) return null;
    return { row: row, col: col };
  }

  function handleCellClick(cell) {
    if (!cell) return;
    if (state.gameOver) return;
    if (state.animating) return;
    if (window.CGTutorial && CGTutorial.isActive) return;
    if (window.RoomBridge && RoomBridge.isActive() && RoomBridge.isSpectator()) return;
    if ((state.aiEnabled || state.vsRoom) && state.currentTurn !== state.humanColor) return;

    var row = cell.row, col = cell.col;
    if (!isValidPlacement(row, col)) return;
    var rem = state.currentTurn === BLACK ? state.blackRemaining : state.whiteRemaining;
    if (rem <= 0) return;

    placePiece(row, col, state.currentTurn);
  }

  // ── AI ─────────────────────────────────────────────────────────────
  function blockingValue(row, col, enemy) {
    var blocked = 0;
    var offsets = [[0,0],[0,-1],[-1,0],[-1,-1]];
    offsets.forEach(function(offset) {
      var r = row + offset[0], c = col + offset[1];
      if (r < 0 || r + 1 >= BOARD_SIZE || c < 0 || c + 1 >= BOARD_SIZE) return;
      var corners = [[r,c],[r,c+1],[r+1,c],[r+1,c+1]];
      var enemyCount = corners.filter(function(cr) { return state.board[cr[0]][cr[1]] === enemy; }).length;
      if (enemyCount === 3) blocked++;
    });
    return blocked;
  }

  function scoreMove(row, col, player) {
    var score = 0;
    var enemy = getOpponent(player);
    state.board[row][col] = player;
    try {
      var captures = detectCaptures(row, col, player);
      score += captures.length * 200;
      var centerDist = Math.abs(row - 3) + Math.abs(col - 3);
      score += Math.max(0, 6 - centerDist) * 8;
      score += blockingValue(row, col, enemy) * 150;
      var dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
      dirs.forEach(function(d) {
        var nr = row + d[0], nc = col + d[1];
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE)
          if (state.board[nr][nc] === player) score += 30;
      });
    } finally {
      state.board[row][col] = EMPTY;
    }
    return score;
  }

  function getBestMove(player) {
    var moves = getAllValidPlacements();
    if (!moves.length) return null;
    var rem = player === BLACK ? state.blackRemaining : state.whiteRemaining;
    if (rem <= 0) return null;

    var best = null, bestScore = -Infinity;
    moves.forEach(function(move) {
      var score = scoreMove(move.row, move.col, player);
      if (score > bestScore || (score === bestScore && Math.random() < 0.3)) {
        bestScore = score;
        best = move;
      }
    });
    return best;
  }

  function aiTakeTurn() {
    if (state.gameOver) return;
    if (window.CGTutorial && CGTutorial.isActive) return;
    var aiColor = getOpponent(state.humanColor);
    var move = getBestMove(aiColor);
    if (!move) return;
    state.animating = true;
    aiTimeout = setTimeout(function() {
      state.animating = false;
      placePiece(move.row, move.col, aiColor);
    }, 400 + Math.floor(Math.random() * 300));
  }

  // ── Room/Multiplayer ───────────────────────────────────────────────
  function stateForSync() {
    return {
      board: state.board.map(function(row) { return row.slice(); }),
      currentTurn: state.currentTurn,
      blackRemaining: state.blackRemaining,
      whiteRemaining: state.whiteRemaining,
      blackCaptured: state.blackCaptured,
      whiteCaptured: state.whiteCaptured,
      blackPlaced: state.blackPlaced,
      whitePlaced: state.whitePlaced,
      moveCount: state.moveCount,
      gameOver: state.gameOver,
      winner: state.winner,
      selectedCell: state.selectedCell,
      last_actor: 'room:' + roomSeat
    };
  }

  // Broadcast the current authoritative state to the opponent and, on
  // game-over, report the global winner to the room (once). No-op in
  // solo/vs-AI so solo behaviour is byte-for-byte unchanged.
  function syncRoom() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState(stateForSync());
    if (state.gameOver && state.winner !== 'draw' && !winReported && RoomBridge.reportWin) {
      winReported = true;
      RoomBridge.reportWin(state.winner === BLACK ? 0 : 1);
    }
  }

  function applyRemoteState(blob) {
    if (!blob) return;
    // Ignore our own echo relayed back by the parent.
    if (blob.last_actor === 'room:' + roomSeat) return;
    state.board          = blob.board || state.board;
    state.currentTurn    = blob.currentTurn   !== undefined ? blob.currentTurn   : state.currentTurn;
    state.blackRemaining = blob.blackRemaining !== undefined ? blob.blackRemaining: state.blackRemaining;
    state.whiteRemaining = blob.whiteRemaining !== undefined ? blob.whiteRemaining: state.whiteRemaining;
    state.blackCaptured  = blob.blackCaptured  !== undefined ? blob.blackCaptured : state.blackCaptured;
    state.whiteCaptured  = blob.whiteCaptured  !== undefined ? blob.whiteCaptured : state.whiteCaptured;
    state.blackPlaced    = blob.blackPlaced    !== undefined ? blob.blackPlaced   : state.blackPlaced;
    state.whitePlaced    = blob.whitePlaced    !== undefined ? blob.whitePlaced   : state.whitePlaced;
    state.moveCount      = blob.moveCount      !== undefined ? blob.moveCount     : state.moveCount;
    state.selectedCell   = blob.selectedCell   || null;
    if (blob.gameOver && !state.gameOver) {
      state.gameOver = true;
      state.winner   = blob.winner;
      state.phase    = 'gameover';
      showOverlay(blob.winner);
    }
    render();
  }

  // ── Tutorial steps ─────────────────────────────────────────────────
  var xfTutorialSteps = [
    { title: 'The Board',      target: '#xf-board',          text: 'Xinjiang Fangqi is played on a 7x7 grid. Pieces are placed at the intersections - the points where lines cross.' },
    { title: 'Your Pieces',    target: '#xf-black-hand',     text: 'Each player has 20 stones to place. You play Black and go first.' },
    { title: 'Place a Stone',  target: '#xf-board',          text: 'Click any empty intersection to place your stone there. Players alternate turns.' },
    { title: 'Form a Square',  target: '#xf-board',          text: 'When your 4 stones form a 2x2 square, enemy stones adjacent to that square are captured and removed.' },
    { title: 'Square Preview', target: '#xf-board',          text: 'Hover over an intersection to see a gold preview square if your move would complete a capture.' },
    { title: 'Win Condition',  target: '#xf-black-captured', text: 'Capture all of your opponent\'s stones (and they have none left to place) to win. The last stone standing wins.' }
  ];

  // ── Theme hook ─────────────────────────────────────────────────────
  window.CGTheme = window.CGTheme || {};
  var _origThemeChange = window.CGTheme.onThemeChange;
  window.CGTheme.onThemeChange = function() {
    if (_origThemeChange) _origThemeChange();
    readColors();
    render();
  };
  // theme.js fires CGTheme.onchange(theme) — chain it (senet house pattern)
  // so the canvas palette re-reads and the board repaints on toggle.
  var _origOnChange = window.CGTheme.onchange;
  window.CGTheme.onchange = function(t) {
    if (typeof _origOnChange === 'function') { try { _origOnChange(t); } catch (e) {} }
    readColors();
    render();
  };

  // ── DOMContentLoaded ───────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    canvas = document.getElementById('xf-board');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    readColors();

    // Fixed internal resolution; CSS handles display scaling
    canvas.width  = 560;
    canvas.height = 560;
    // cellSize = (560 - 2*PADDING) / (BOARD_SIZE - 1) = 480 / 6 = 80
    state.cellSize = (canvas.width - 2 * PADDING) / (BOARD_SIZE - 1);

    if (window.Achievements) Achievements.init();
    if (window.CGTutorial)   CGTutorial.initTrigger('xinjiang-fangqi');
    if (window.PWF)          PWF.init('xinjiang-fangqi');

    // Room/multiplayer setup
    if (window.RoomBridge && RoomBridge.isActive()) {
      state.aiEnabled  = false;
      vsRoom           = true;
      state.vsRoom     = true;
      roomSeat         = RoomBridge.getSeat();
      state.humanColor = (roomSeat === 0) ? BLACK : WHITE;
      RoomBridge.onState(function(blob) { applyRemoteState(blob); });
    }

    // AI toggle
    var aiToggle = document.getElementById('xf-ai-toggle');
    if (aiToggle) {
      aiToggle.checked = state.aiEnabled;
      aiToggle.addEventListener('change', function() {
        state.aiEnabled = this.checked;
        if (state.aiEnabled && !state.gameOver && state.currentTurn !== state.humanColor) {
          aiTimeout = setTimeout(aiTakeTurn, 600);
        }
      });
    }

    // New Game
    var newGameBtn = document.getElementById('xf-new-game');
    if (newGameBtn) newGameBtn.addEventListener('click', initGame);

    // Resign
    var resignBtn = document.getElementById('xf-resign');
    if (resignBtn) resignBtn.addEventListener('click', function() {
      if (state.gameOver) return;
      triggerGameOver(getOpponent(state.humanColor));
      syncRoom();
    });

    // Play Again from overlay
    var playAgainBtn = document.getElementById('xf-play-again');
    if (playAgainBtn) playAgainBtn.addEventListener('click', initGame);

    // Canvas click
    canvas.addEventListener('click', function(e) {
      handleCellClick(getCellFromEvent(e));
    });

    // Canvas hover
    canvas.addEventListener('mousemove', function(e) {
      if (state.gameOver || state.animating || ((state.aiEnabled || state.vsRoom) && state.currentTurn !== state.humanColor)) {
        if (state.hoverCell) { state.hoverCell = null; render(); }
        return;
      }
      var cell = getCellFromEvent(e);
      var newHover = (cell && isValidPlacement(cell.row, cell.col)) ? cell : null;
      var changed = JSON.stringify(newHover) !== JSON.stringify(state.hoverCell);
      state.hoverCell = newHover;
      if (changed) render();
    });

    canvas.addEventListener('mouseleave', function() {
      state.hoverCell = null;
      render();
    });

    // Touch
    canvas.addEventListener('touchstart', function(e) {
      e.preventDefault();
      var touch = e.touches[0];
      handleCellClick(getCellFromEvent(touch));
    }, { passive: false });

    // Register tutorial
    if (window.CGTutorial) CGTutorial.register('xinjiang-fangqi', xfTutorialSteps);

    // Responsive CSS scaling for normal (non-fullscreen) display
    function resizeCanvas() {
      if (window.FSMode && window.FSMode.isActive()) return;
      var container = canvas.parentElement;
      var maxSize   = Math.min(container ? container.clientWidth : 520, 520);
      var size      = Math.max(280, maxSize);
      canvas.style.width  = size + 'px';
      canvas.style.height = size + 'px';
      // Internal buffer stays 560x560; CSS scaling handles display size
    }

    resizeCanvas();
    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeCanvas, 60);
    });

    // Fullscreen resize — called by fullscreen.js with the available viewport size.
    // Resizes the canvas buffer to fill the viewport and re-centres the board.
    window.GameResize = function(availW, availH) {
      if (!canvas || !ctx) return;
      var newCell = Math.floor((Math.min(availW, availH) - 2 * PADDING) / (BOARD_SIZE - 1));
      if (newCell < 30) newCell = 30;
      state.cellSize = newCell;
      var boardPx = (BOARD_SIZE - 1) * newCell;
      state.padX = Math.max(PADDING, Math.round((availW - boardPx) / 2));
      state.padY = Math.max(PADDING, Math.round((availH - boardPx) / 2));
      canvas.width  = availW;
      canvas.height = availH;
      render();
    };

    // Re-render on fullscreen enter/exit
    if (window.FSMode) {
      FSMode.onExit = function() {
        setTimeout(function() {
          canvas.style.removeProperty('width');
          canvas.style.removeProperty('height');
          // Restore windowed canvas buffer and board geometry (GameResize mutated these in fullscreen)
          canvas.width  = 560;
          canvas.height = 560;
          state.cellSize = (560 - 2 * PADDING) / (BOARD_SIZE - 1);
          state.padX = PADDING;
          state.padY = PADDING;
          resizeCanvas();
          render();
        }, 50);
      };
    }

    initGame();
  });
})();
