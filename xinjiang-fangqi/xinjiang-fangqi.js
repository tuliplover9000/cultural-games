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
    animating: false,
    cellSize: 80,
    padX: PADDING,
    padY: PADDING
  };

  var canvas, ctx;
  var aiTimeout = null;

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
      animateCaptures(captures, function() {
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
    if (checkWinConditions()) return;
    state.currentTurn = getOpponent(state.currentTurn);
    render();
    if (state.aiEnabled && state.currentTurn !== state.humanColor) {
      aiTimeout = setTimeout(aiTakeTurn, 400 + Math.floor(Math.random() * 300));
    }
  }

  // ── Capture animation ──────────────────────────────────────────────
  function animateCaptures(captures, callback) {
    var frame = 0;
    var totalFrames = 18;
    function step() {
      render();
      var alpha = Math.sin((frame / totalFrames) * Math.PI) * 0.75;
      captures.forEach(function(c) {
        var xy = getCellXY(c.row, c.col);
        ctx.fillStyle = 'rgba(180,30,30,' + alpha + ')';
        ctx.beginPath();
        ctx.arc(xy.x, xy.y, state.cellSize * 0.35, 0, Math.PI * 2);
        ctx.fill();
      });
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
    // Background - warm parchment
    ctx.fillStyle = '#F5EDD6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative border
    renderBorder();

    // Grid lines
    ctx.strokeStyle = '#2C1810';
    ctx.lineWidth = 1.5;
    var gridEnd = (BOARD_SIZE - 1) * state.cellSize;
    for (var i = 0; i < BOARD_SIZE; i++) {
      var startX = state.padX + i * state.cellSize;
      var startY = state.padY + i * state.cellSize;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(startX, state.padY);
      ctx.lineTo(startX, state.padY + gridEnd);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(state.padX, startY);
      ctx.lineTo(state.padX + gridEnd, startY);
      ctx.stroke();
    }

    // Intersection dots
    ctx.fillStyle = '#2C1810';
    for (var r = 0; r < BOARD_SIZE; r++) {
      for (var c = 0; c < BOARD_SIZE; c++) {
        var xy = getCellXY(r, c);
        ctx.beginPath();
        ctx.arc(xy.x, xy.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function renderBorder() {
    // Xinjiang stepped-diamond geometric border (terracotta on parchment)
    var boardPx = (BOARD_SIZE - 1) * state.cellSize;
    var x0 = state.padX;
    var y0 = state.padY;
    var x1 = state.padX + boardPx;
    var y1 = state.padY + boardPx;
    var margin = 18;

    ctx.save();
    ctx.strokeStyle = '#8B4513';
    ctx.fillStyle   = '#8B4513';
    ctx.lineWidth   = 1.5;

    // Outer border frame
    ctx.strokeRect(x0 - margin, y0 - margin, boardPx + 2 * margin, boardPx + 2 * margin);

    // Inner border line (double-line effect)
    ctx.strokeRect(x0 - margin + 4, y0 - margin + 4, boardPx + 2 * margin - 8, boardPx + 2 * margin - 8);

    // Diamond motifs on each edge (4 per edge)
    var diamondSize = 6;
    var i;

    // Top edge
    for (i = 0; i < 4; i++) {
      var cx = x0 + (i + 0.5) * (boardPx / 4);
      var cy = y0 - margin + 2;
      ctx.beginPath();
      ctx.moveTo(cx,               cy - diamondSize);
      ctx.lineTo(cx + diamondSize, cy);
      ctx.lineTo(cx,               cy + diamondSize);
      ctx.lineTo(cx - diamondSize, cy);
      ctx.closePath();
      ctx.fill();
    }
    // Bottom edge
    for (i = 0; i < 4; i++) {
      cx = x0 + (i + 0.5) * (boardPx / 4);
      cy = y1 + margin - 2;
      ctx.beginPath();
      ctx.moveTo(cx,               cy - diamondSize);
      ctx.lineTo(cx + diamondSize, cy);
      ctx.lineTo(cx,               cy + diamondSize);
      ctx.lineTo(cx - diamondSize, cy);
      ctx.closePath();
      ctx.fill();
    }
    // Left edge
    for (i = 0; i < 4; i++) {
      cx = x0 - margin + 2;
      cy = y0 + (i + 0.5) * (boardPx / 4);
      ctx.beginPath();
      ctx.moveTo(cx - diamondSize, cy);
      ctx.lineTo(cx,               cy + diamondSize);
      ctx.lineTo(cx + diamondSize, cy);
      ctx.lineTo(cx,               cy - diamondSize);
      ctx.closePath();
      ctx.fill();
    }
    // Right edge
    for (i = 0; i < 4; i++) {
      cx = x1 + margin - 2;
      cy = y0 + (i + 0.5) * (boardPx / 4);
      ctx.beginPath();
      ctx.moveTo(cx - diamondSize, cy);
      ctx.lineTo(cx,               cy + diamondSize);
      ctx.lineTo(cx + diamondSize, cy);
      ctx.lineTo(cx,               cy - diamondSize);
      ctx.closePath();
      ctx.fill();
    }

    // Corner diamond accents
    var corners = [
      [x0 - margin, y0 - margin],
      [x1 + margin, y0 - margin],
      [x0 - margin, y1 + margin],
      [x1 + margin, y1 + margin]
    ];
    corners.forEach(function(corner) {
      ctx.beginPath();
      ctx.moveTo(corner[0],               corner[1] - diamondSize - 2);
      ctx.lineTo(corner[0] + diamondSize + 2, corner[1]);
      ctx.lineTo(corner[0],               corner[1] + diamondSize + 2);
      ctx.lineTo(corner[0] - diamondSize - 2, corner[1]);
      ctx.closePath();
      ctx.fill();
    });

    ctx.restore();
  }

  function renderHighlights() {
    // Last placed piece highlight
    if (state.selectedCell) {
      var xy = getCellXY(state.selectedCell.row, state.selectedCell.col);
      ctx.strokeStyle = '#D4A017';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(xy.x, xy.y, state.cellSize * 0.38, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Hover ghost piece
    if (state.hoverCell && state.currentTurn === state.humanColor && !state.gameOver && !state.animating) {
      var hxy = getCellXY(state.hoverCell.row, state.hoverCell.col);
      var ghostColor = state.humanColor === BLACK ? 'rgba(26,16,8,0.35)' : 'rgba(240,234,214,0.55)';
      ctx.fillStyle = ghostColor;
      ctx.beginPath();
      ctx.arc(hxy.x, hxy.y, state.cellSize * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderSquareIndicators() {
    if (!state.hoverCell) return;
    if (state.currentTurn !== state.humanColor) return;
    if (state.gameOver || state.animating) return;

    var row = state.hoverCell.row;
    var col = state.hoverCell.col;
    var player = state.humanColor;

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
        // Draw gold square outline
        var topLeft = getCellXY(r, c);
        ctx.strokeStyle = '#D4A017';
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

        // Shadow
        ctx.beginPath();
        ctx.arc(xy.x + 1.5, xy.y + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Body
        ctx.beginPath();
        ctx.arc(xy.x, xy.y, radius, 0, Math.PI * 2);

        if (piece === BLACK) {
          ctx.fillStyle = '#1A1008';
          ctx.fill();
          // Subtle highlight
          ctx.fillStyle = 'rgba(80,50,20,0.5)';
          ctx.beginPath();
          ctx.arc(xy.x - radius * 0.25, xy.y - radius * 0.25, radius * 0.45, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#F0EAD6';
          ctx.fill();
          ctx.strokeStyle = '#2C1810';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(xy.x, xy.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          // Subtle highlight
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.beginPath();
          ctx.arc(xy.x - radius * 0.25, xy.y - radius * 0.25, radius * 0.35, 0, Math.PI * 2);
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
    var snapX = PADDING + col * state.cellSize;
    var snapY = PADDING + row * state.cellSize;
    var dist  = Math.sqrt((x - snapX) * (x - snapX) + (y - snapY) * (y - snapY));
    if (dist > state.cellSize * 0.45) return null;
    return { row: row, col: col };
  }

  function handleCellClick(cell) {
    if (!cell) return;
    if (state.gameOver) return;
    if (state.animating) return;
    if (window.CGTutorial && CGTutorial.isActive) return;
    if (state.aiEnabled && state.currentTurn !== state.humanColor) return;

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
      selectedCell: state.selectedCell
    };
  }

  function applyRemoteState(blob) {
    if (!blob) return;
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
    render();
  };

  // ── DOMContentLoaded ───────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    canvas = document.getElementById('xf-board');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

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
      var seat = RoomBridge.getSeat();
      state.humanColor = (seat === 0) ? BLACK : WHITE;
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
      if (state.gameOver || state.animating || state.currentTurn !== state.humanColor) {
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
          resizeCanvas();
          render();
        }, 50);
      };
    }

    initGame();
  });
})();
