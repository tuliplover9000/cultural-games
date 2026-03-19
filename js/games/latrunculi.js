/**
 * latrunculi.js — Ludus Latrunculorum (Roman Empire strategy game)
 * Custodian capture on a rectangular board with rook-sliding pieces and a Dux commander.
 */
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────

  var BOARD_CONFIGS = {
    '8x8':  { rows: 8,  cols: 8,  cellSize: 72 },
    '12x8': { rows: 8,  cols: 12, cellSize: 64 }
  };

  var PIECE = { NONE: 0, WHITE: 1, BLACK: 2, WHITE_DUX: 3, BLACK_DUX: 4 };

  var DIRS_ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var DIRS_ALL  = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

  // ── DOM refs ───────────────────────────────────────────────────────────────

  var canvas    = null;
  var ctx       = null;
  var lobbyEl   = document.getElementById('ll-lobby');
  var gcEl      = document.getElementById('game-container');
  var turnEl    = document.getElementById('ll-turn');
  var capWEl    = document.getElementById('ll-cap-w');
  var capBEl    = document.getElementById('ll-cap-b');
  var movesEl   = document.getElementById('ll-moves');
  var newBtn    = document.getElementById('ll-new-btn');
  var forfeitBtn= document.getElementById('ll-forfeit-btn');
  var aiToggle  = document.getElementById('ll-ai-toggle');
  var overlay   = document.getElementById('ll-overlay');
  var overlayTitleEl = document.getElementById('ll-overlay-title');
  var overlaySubEl   = document.getElementById('ll-overlay-sub');
  var landscapeHint  = document.getElementById('ll-landscape-hint');

  // ── State ──────────────────────────────────────────────────────────────────

  var state = {
    mode: '8x8',
    board: [],
    currentTurn: 'white',
    selectedCell: null,
    validMoves: [],
    capturedWhite: 0,
    capturedBlack: 0,
    gameOver: false,
    winner: null,
    moveHistory: [],
    boardConfig: null,
    aiEnabled: true,
    aiThinking: false,
    aiTimeout: null,
    noCaptureMoves: 0,
    positionHistory: []
  };

  // ── Board helpers ──────────────────────────────────────────────────────────

  function inBounds(r, c) {
    return r >= 0 && r < state.boardConfig.rows && c >= 0 && c < state.boardConfig.cols;
  }

  function getPieceOwner(p) {
    if (p === PIECE.WHITE || p === PIECE.WHITE_DUX) return 'white';
    if (p === PIECE.BLACK || p === PIECE.BLACK_DUX) return 'black';
    return null;
  }

  function isDux(p) {
    return p === PIECE.WHITE_DUX || p === PIECE.BLACK_DUX;
  }

  function countPieces(color) {
    var count = 0;
    for (var r = 0; r < state.boardConfig.rows; r++) {
      for (var c = 0; c < state.boardConfig.cols; c++) {
        if (getPieceOwner(state.board[r][c]) === color) count++;
      }
    }
    return count;
  }

  // ── Board initialisation ───────────────────────────────────────────────────

  function buildInitialBoard(mode) {
    var cfg = BOARD_CONFIGS[mode];
    var board = [];
    var r, c;
    for (r = 0; r < cfg.rows; r++) {
      board[r] = [];
      for (c = 0; c < cfg.cols; c++) {
        board[r][c] = PIECE.NONE;
      }
    }

    var duxCol = mode === '8x8' ? 3 : 5;

    // White — rows 0 and 1
    for (c = 0; c < cfg.cols; c++) {
      board[0][c] = (c === duxCol) ? PIECE.WHITE_DUX : PIECE.WHITE;
      board[1][c] = PIECE.WHITE;
    }

    // Black — rows rows-1 and rows-2
    var lastRow = cfg.rows - 1;
    var secLast = cfg.rows - 2;
    for (c = 0; c < cfg.cols; c++) {
      board[lastRow][c] = (c === duxCol) ? PIECE.BLACK_DUX : PIECE.BLACK;
      board[secLast][c] = PIECE.BLACK;
    }

    return board;
  }

  // ── Move generation ────────────────────────────────────────────────────────

  function getValidMoves(row, col) {
    var piece = state.board[row][col];
    var moves = [];
    var r, c, dr, dc, dirs, d, i;

    if (isDux(piece)) {
      // King-style: up to 1 step in all 8 directions
      dirs = DIRS_ALL;
      for (i = 0; i < dirs.length; i++) {
        d = dirs[i];
        r = row + d[0];
        c = col + d[1];
        if (inBounds(r, c) && state.board[r][c] === PIECE.NONE) {
          moves.push({ row: r, col: c });
        }
      }
    } else {
      // Regular piece: rook-slide orthogonally
      dirs = DIRS_ORTH;
      for (i = 0; i < dirs.length; i++) {
        d = dirs[i];
        dr = d[0];
        dc = d[1];
        r = row + dr;
        c = col + dc;
        while (inBounds(r, c) && state.board[r][c] === PIECE.NONE) {
          moves.push({ row: r, col: c });
          r += dr;
          c += dc;
        }
      }
    }

    return moves;
  }

  function getAllMovesForColor(color) {
    var all = [];
    for (var r = 0; r < state.boardConfig.rows; r++) {
      for (var c = 0; c < state.boardConfig.cols; c++) {
        if (getPieceOwner(state.board[r][c]) === color) {
          var moves = getValidMoves(r, c);
          for (var i = 0; i < moves.length; i++) {
            all.push({ from: { row: r, col: c }, to: moves[i] });
          }
        }
      }
    }
    return all;
  }

  // ── Capture logic ──────────────────────────────────────────────────────────

  function isValidCapturePartner(r, c, friendlyColor) {
    var cfg = state.boardConfig;
    // Off-board edge counts as hostile partner (acts as wall for capture)
    if (r < 0 || r >= cfg.rows || c < 0 || c >= cfg.cols) return true;
    var p = state.board[r][c];
    // Friendly REGULAR piece (not Dux) counts as capture partner
    return getPieceOwner(p) === friendlyColor && !isDux(p);
  }

  function resolveCaptures(row, col, boardArg, capturedRef) {
    var board = boardArg || state.board;
    var caps = capturedRef || { white: 0, black: 0 };
    var movingPiece = board[row][col];
    var friendlyColor = getPieceOwner(movingPiece);
    var enemyColor = friendlyColor === 'white' ? 'black' : 'white';

    DIRS_ORTH.forEach(function (d) {
      var nr = row + d[0];
      var nc = col + d[1];
      if (nr < 0 || nr >= state.boardConfig.rows || nc < 0 || nc >= state.boardConfig.cols) return;
      var neighbor = board[nr][nc];
      if (getPieceOwner(neighbor) !== enemyColor) return;
      // Check opposite side from the moved piece
      var or = row - d[0];
      var oc = col - d[1];
      // Helper that uses the provided board
      var partnerValid = (function () {
        if (or < 0 || or >= state.boardConfig.rows || oc < 0 || oc >= state.boardConfig.cols) return true;
        var p = board[or][oc];
        return getPieceOwner(p) === friendlyColor && !isDux(p);
      }());
      if (partnerValid) {
        if (friendlyColor === 'white') caps.black++;
        else caps.white++;
        board[nr][nc] = PIECE.NONE;
      }
    });

    return caps;
  }

  // ── Win / draw detection ───────────────────────────────────────────────────

  function getBoardKey() {
    var rows = [];
    for (var r = 0; r < state.boardConfig.rows; r++) {
      rows.push(state.board[r].join(','));
    }
    return rows.join('|') + ':' + state.currentTurn;
  }

  function checkWinConditions() {
    var whiteCount = countPieces('white');
    var blackCount = countPieces('black');

    if (whiteCount === 0) {
      endGame('black', 'All white pieces captured');
      return;
    }
    if (blackCount === 0) {
      endGame('white', 'All black pieces captured');
      return;
    }

    // Immobilisation: if the player whose turn it is now has no legal moves, they lose
    var currentMoves = getAllMovesForColor(state.currentTurn);
    if (currentMoves.length === 0) {
      var prevTurn = state.currentTurn === 'white' ? 'black' : 'white';
      endGame(prevTurn, state.currentTurn.charAt(0).toUpperCase() + state.currentTurn.slice(1) + ' has no legal moves');
      return;
    }

    // 50-move draw rule
    if (state.noCaptureMoves >= 50) {
      endGame(null, '50 moves without capture — Draw');
      return;
    }

    // Threefold repetition
    var key = getBoardKey();
    var count = 0;
    for (var i = 0; i < state.positionHistory.length; i++) {
      if (state.positionHistory[i] === key) count++;
    }
    if (count >= 3) {
      endGame(null, 'Threefold repetition — Draw');
    }
  }

  function endGame(winner, message) {
    state.gameOver = true;
    state.winner = winner;

    // Record result
    var isWinner = winner === 'white';
    if (window.Auth && Auth.isLoggedIn()) {
      Auth.recordResult('latrunculi', isWinner ? 'win' : 'loss');
    }
    if (window.Achievements) {
      Achievements.evaluate({
        gameId: 'latrunculi',
        result: isWinner ? 'win' : 'loss',
        isOnline: false,
        isHost: false,
        stats: {}
      });
    }

    // Show overlay
    if (overlayTitleEl) {
      overlayTitleEl.textContent = winner
        ? (winner.charAt(0).toUpperCase() + winner.slice(1) + ' Wins!')
        : 'Draw!';
    }
    if (overlaySubEl) {
      overlaySubEl.textContent = message || '';
    }
    if (overlay) {
      overlay.classList.add('active');
    }

    render();
  }

  // ── Execute move ───────────────────────────────────────────────────────────

  function executeMove(fromRow, fromCol, toRow, toCol) {
    if (state.aiTimeout) {
      clearTimeout(state.aiTimeout);
      state.aiTimeout = null;
    }

    var piece = state.board[fromRow][fromCol];
    state.board[toRow][toCol] = piece;
    state.board[fromRow][fromCol] = PIECE.NONE;

    state.selectedCell = null;
    state.validMoves = [];

    // Capture resolution
    var capsBefore = state.capturedWhite + state.capturedBlack;
    var friendlyColor = getPieceOwner(piece);
    var enemyColor = friendlyColor === 'white' ? 'black' : 'white';

    DIRS_ORTH.forEach(function (d) {
      var nr = toRow + d[0];
      var nc = toCol + d[1];
      if (!inBounds(nr, nc)) return;
      var neighbor = state.board[nr][nc];
      if (getPieceOwner(neighbor) !== enemyColor) return;
      var or = toRow - d[0];
      var oc = toCol - d[1];
      var partnerValid;
      if (or < 0 || or >= state.boardConfig.rows || oc < 0 || oc >= state.boardConfig.cols) {
        partnerValid = true;
      } else {
        var p2 = state.board[or][oc];
        partnerValid = getPieceOwner(p2) === friendlyColor && !isDux(p2);
      }
      if (partnerValid) {
        if (friendlyColor === 'white') state.capturedBlack++;
        else state.capturedWhite++;
        state.board[nr][nc] = PIECE.NONE;
      }
    });

    var capsAfter = state.capturedWhite + state.capturedBlack;
    if (capsAfter > capsBefore) {
      state.noCaptureMoves = 0;
    } else {
      state.noCaptureMoves++;
    }

    state.moveHistory.push({ fromRow: fromRow, fromCol: fromCol, toRow: toRow, toCol: toCol });

    var key = getBoardKey();
    state.positionHistory.push(key);

    // Switch turns
    state.currentTurn = state.currentTurn === 'white' ? 'black' : 'white';

    checkWinConditions();
    updateUI();
    render();

    // AI turn
    if (!state.gameOver && state.aiEnabled && state.currentTurn === 'black') {
      state.aiThinking = true;
      state.aiTimeout = setTimeout(function () {
        state.aiThinking = false;
        aiTakeTurn();
      }, 450);
    }
  }

  // ── AI ─────────────────────────────────────────────────────────────────────

  function scoreMove(from, to) {
    var score = 0;
    var savedBoard = [];
    var r, c;
    for (r = 0; r < state.boardConfig.rows; r++) {
      savedBoard[r] = state.board[r].slice();
    }
    var savedCapW = state.capturedWhite;
    var savedCapB = state.capturedBlack;

    // Simulate
    var piece = state.board[from.row][from.col];
    state.board[to.row][to.col] = piece;
    state.board[from.row][from.col] = PIECE.NONE;

    var capsBefore = state.capturedWhite;
    var friendlyColor = getPieceOwner(piece);
    var enemyColor = friendlyColor === 'white' ? 'black' : 'white';

    DIRS_ORTH.forEach(function (d) {
      var nr = to.row + d[0];
      var nc = to.col + d[1];
      if (!inBounds(nr, nc)) return;
      var neighbor = state.board[nr][nc];
      if (getPieceOwner(neighbor) !== enemyColor) return;
      var or = to.row - d[0];
      var oc = to.col - d[1];
      var partnerValid;
      if (or < 0 || or >= state.boardConfig.rows || oc < 0 || oc >= state.boardConfig.cols) {
        partnerValid = true;
      } else {
        var p2 = state.board[or][oc];
        partnerValid = getPieceOwner(p2) === friendlyColor && !isDux(p2);
      }
      if (partnerValid) {
        if (friendlyColor === 'white') state.capturedWhite++;
        else state.capturedBlack++;
        state.board[nr][nc] = PIECE.NONE;
      }
    });

    // AI plays black; captures = captured white pieces
    var capsGained = state.capturedWhite - capsBefore;
    score += capsGained * 100;

    // Restore state
    for (r = 0; r < state.boardConfig.rows; r++) {
      state.board[r] = savedBoard[r];
    }
    state.capturedWhite = savedCapW;
    state.capturedBlack = savedCapB;

    // Positional: center bonus
    var centerRow = state.boardConfig.rows / 2;
    var centerCol = state.boardConfig.cols / 2;
    score += (3 - Math.abs(to.row - centerRow)) * 3;
    score += (3 - Math.abs(to.col - centerCol)) * 3;

    // Avoid moving Dux needlessly
    if (isDux(piece) && capsGained === 0) score -= 10;

    return score;
  }

  function aiTakeTurn() {
    if (window.CGTutorial && CGTutorial.isActive) return;
    if (state.gameOver) return;

    var allMoves = getAllMovesForColor('black');
    if (allMoves.length === 0) return;

    var best = null;
    var bestScore = -Infinity;

    for (var i = 0; i < allMoves.length; i++) {
      var m = allMoves[i];
      var s = scoreMove(m.from, m.to);
      if (s > bestScore || (s === bestScore && Math.random() < 0.35)) {
        bestScore = s;
        best = m;
      }
    }

    if (!best) return;

    // Flash piece briefly
    state.selectedCell = { row: best.from.row, col: best.from.col };
    state.validMoves = [best.to];
    render();

    setTimeout(function () {
      executeMove(best.from.row, best.from.col, best.to.row, best.to.col);
    }, 350);
  }

  // ── Input handling ─────────────────────────────────────────────────────────

  function getCellFromEvent(e) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var col = Math.floor((clientX - rect.left) * scaleX / state.boardConfig.cellSize);
    var row = Math.floor((clientY - rect.top)  * scaleY / state.boardConfig.cellSize);
    return { row: row, col: col };
  }

  function onBoardClick(e) {
    if (state.gameOver || state.aiThinking) return;
    if (state.currentTurn === 'black' && state.aiEnabled) return;

    var cell = getCellFromEvent(e);
    if (!cell) return;
    if (!inBounds(cell.row, cell.col)) return;

    var piece = state.board[cell.row][cell.col];
    var owner = getPieceOwner(piece);

    if (state.selectedCell) {
      // Check if clicked on a valid move target
      var isValid = false;
      for (var i = 0; i < state.validMoves.length; i++) {
        if (state.validMoves[i].row === cell.row && state.validMoves[i].col === cell.col) {
          isValid = true;
          break;
        }
      }

      if (isValid) {
        executeMove(state.selectedCell.row, state.selectedCell.col, cell.row, cell.col);
        return;
      }

      // Clicking another friendly piece
      if (owner === state.currentTurn) {
        state.selectedCell = { row: cell.row, col: cell.col };
        state.validMoves = getValidMoves(cell.row, cell.col);
        render();
        return;
      }

      // Deselect
      state.selectedCell = null;
      state.validMoves = [];
      render();
    } else {
      // Select a friendly piece
      if (owner === state.currentTurn) {
        state.selectedCell = { row: cell.row, col: cell.col };
        state.validMoves = getValidMoves(cell.row, cell.col);
        render();
      }
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  var CELL_LIGHT = '#E8D5B0';
  var CELL_DARK  = '#C4845A';
  var BORDER_BG  = '#7a1515';
  var GOLD       = '#D4A017';
  var BORDER_W   = 18;

  function render() {
    if (!ctx) return;
    var cfg = state.boardConfig;
    var cs = cfg.cellSize;
    var boardW = cfg.cols * cs;
    var boardH = cfg.rows * cs;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    renderBorder(boardW, boardH);
    renderBoard(cs, cfg);
    renderHighlights(cs);
    renderPieces(cs, cfg);
  }

  function renderBorder(boardW, boardH) {
    // Pompeiian red border with gold meander pattern
    ctx.fillStyle = BORDER_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Gold meander lines — simplified repeating L-shapes
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.5;

    var step = 12;
    var i, x, y;

    // Top border meander
    for (i = 0; i < Math.ceil(canvas.width / step); i++) {
      x = i * step;
      y = 4;
      ctx.beginPath();
      if (i % 2 === 0) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + step, y);
        ctx.lineTo(x + step, y + 6);
      } else {
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x + step, y + 6);
        ctx.lineTo(x + step, y);
      }
      ctx.stroke();
    }

    // Bottom border meander
    var by = canvas.height - BORDER_W + 4;
    for (i = 0; i < Math.ceil(canvas.width / step); i++) {
      x = i * step;
      ctx.beginPath();
      if (i % 2 === 0) {
        ctx.moveTo(x, by);
        ctx.lineTo(x + step, by);
        ctx.lineTo(x + step, by + 6);
      } else {
        ctx.moveTo(x, by + 6);
        ctx.lineTo(x + step, by + 6);
        ctx.lineTo(x + step, by);
      }
      ctx.stroke();
    }

    // Left border meander
    for (i = 0; i < Math.ceil(canvas.height / step); i++) {
      y = i * step;
      ctx.beginPath();
      if (i % 2 === 0) {
        ctx.moveTo(4, y);
        ctx.lineTo(4, y + step);
        ctx.lineTo(10, y + step);
      } else {
        ctx.moveTo(10, y);
        ctx.lineTo(10, y + step);
        ctx.lineTo(4, y + step);
      }
      ctx.stroke();
    }

    // Right border meander
    var rx = canvas.width - BORDER_W + 4;
    for (i = 0; i < Math.ceil(canvas.height / step); i++) {
      y = i * step;
      ctx.beginPath();
      if (i % 2 === 0) {
        ctx.moveTo(rx, y);
        ctx.lineTo(rx, y + step);
        ctx.lineTo(rx + 6, y + step);
      } else {
        ctx.moveTo(rx + 6, y);
        ctx.lineTo(rx + 6, y + step);
        ctx.lineTo(rx, y + step);
      }
      ctx.stroke();
    }
  }

  function renderBoard(cs, cfg) {
    var r, c;
    for (r = 0; r < cfg.rows; r++) {
      for (c = 0; c < cfg.cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? CELL_LIGHT : CELL_DARK;
        ctx.fillRect(BORDER_W + c * cs, BORDER_W + r * cs, cs, cs);

        // Subtle grid line
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(BORDER_W + c * cs, BORDER_W + r * cs, cs, cs);
      }
    }
  }

  function renderHighlights(cs) {
    var i, vm, x, y;

    // Selected cell — gold ring
    if (state.selectedCell) {
      var sc = state.selectedCell;
      x = BORDER_W + sc.col * cs;
      y = BORDER_W + sc.row * cs;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3.5;
      ctx.strokeRect(x + 2, y + 2, cs - 4, cs - 4);
    }

    // Valid moves — semi-transparent overlay
    for (i = 0; i < state.validMoves.length; i++) {
      vm = state.validMoves[i];
      x = BORDER_W + vm.col * cs;
      y = BORDER_W + vm.row * cs;
      ctx.fillStyle = 'rgba(212,160,23,0.28)';
      ctx.fillRect(x, y, cs, cs);
      // Small center dot
      ctx.fillStyle = 'rgba(212,160,23,0.7)';
      ctx.beginPath();
      ctx.arc(x + cs / 2, y + cs / 2, cs * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderPieces(cs, cfg) {
    var r, c, piece, owner, x, y, radius;
    for (r = 0; r < cfg.rows; r++) {
      for (c = 0; c < cfg.cols; c++) {
        piece = state.board[r][c];
        if (piece === PIECE.NONE) continue;

        owner = getPieceOwner(piece);
        x = BORDER_W + c * cs + cs / 2;
        y = BORDER_W + r * cs + cs / 2;
        radius = cs * 0.36;

        drawPiece(x, y, radius, owner, isDux(piece));
      }
    }
  }

  function drawPiece(x, y, radius, owner, dux) {
    var grad;

    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    if (owner === 'white') {
      // Marble white disc
      grad = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.25, radius * 0.05, x, y, radius);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.5, '#F0EAD6');
      grad.addColorStop(1, '#C8B89A');
    } else {
      // Obsidian black disc
      grad = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.25, radius * 0.05, x, y, radius);
      grad.addColorStop(0, '#5a4a3a');
      grad.addColorStop(0.4, '#2A2018');
      grad.addColorStop(1, '#0f0a05');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Piece outline
    ctx.strokeStyle = owner === 'white' ? 'rgba(160,120,60,0.5)' : 'rgba(212,160,23,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Marble veining for white
    if (owner === 'white') {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = '#c8a870';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.6, y - radius * 0.3);
      ctx.quadraticCurveTo(x - radius * 0.1, y + radius * 0.2, x + radius * 0.5, y - radius * 0.1);
      ctx.stroke();
      ctx.restore();
    }

    // Highlight reflection for black
    if (owner === 'black') {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#a08060';
      ctx.beginPath();
      ctx.arc(x - radius * 0.3, y - radius * 0.35, radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Dux marker — gold inner circle
    if (dux) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
      ctx.stroke();

      // Gold dot center
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── UI updates ─────────────────────────────────────────────────────────────

  function updateUI() {
    if (turnEl) {
      turnEl.textContent = (state.currentTurn === 'white' ? 'White' : 'Black') + "'s turn";
      turnEl.className = 'll-turn-indicator ' + state.currentTurn + '-turn';
    }
    if (capWEl) capWEl.textContent = state.capturedWhite;
    if (capBEl) capBEl.textContent = state.capturedBlack;
    if (movesEl) movesEl.textContent = state.moveHistory.length;
    updateLandscapeHint();
  }

  function updateLandscapeHint() {
    if (!landscapeHint) return;
    if (window.innerWidth < 500 && state.mode === '12x8') {
      landscapeHint.style.display = 'block';
    } else {
      landscapeHint.style.display = 'none';
    }
  }

  // ── Game init ──────────────────────────────────────────────────────────────

  function initGame(mode) {
    if (state.aiTimeout) {
      clearTimeout(state.aiTimeout);
      state.aiTimeout = null;
    }

    state.mode = mode;
    state.boardConfig = BOARD_CONFIGS[mode];
    state.board = buildInitialBoard(mode);
    state.currentTurn = 'white';
    state.selectedCell = null;
    state.validMoves = [];
    state.capturedWhite = 0;
    state.capturedBlack = 0;
    state.gameOver = false;
    state.winner = null;
    state.moveHistory = [];
    state.aiEnabled = aiToggle ? aiToggle.checked : true;
    state.aiThinking = false;
    state.noCaptureMoves = 0;
    state.positionHistory = [];

    // Setup canvas
    canvas = document.getElementById('ll-board');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    var cfg = state.boardConfig;
    canvas.width  = cfg.cols * cfg.cellSize + BORDER_W * 2;
    canvas.height = cfg.rows * cfg.cellSize + BORDER_W * 2;
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';

    // Remove old listeners safely
    var newCanvas = canvas.cloneNode(false);
    canvas.parentNode.replaceChild(newCanvas, canvas);
    canvas = newCanvas;
    ctx = canvas.getContext('2d');

    canvas.addEventListener('click', onBoardClick);
    canvas.addEventListener('touchend', function (e) {
      e.preventDefault();
      onBoardClick(e);
    }, { passive: false });

    if (overlay) overlay.classList.remove('active');

    updateUI();
    render();
  }

  // ── Lobby / mode select ────────────────────────────────────────────────────

  function showLobby() {
    if (state.aiTimeout) {
      clearTimeout(state.aiTimeout);
      state.aiTimeout = null;
    }
    if (lobbyEl) lobbyEl.style.display = '';
    if (gcEl) gcEl.style.display = 'none';
  }

  function showGame(mode) {
    if (lobbyEl) lobbyEl.style.display = 'none';
    if (gcEl) gcEl.style.display = '';
    initGame(mode);
    registerTutorial();
  }

  // ── Tutorial ───────────────────────────────────────────────────────────────

  function registerTutorial() {
    if (!window.CGTutorial) return;

    CGTutorial.register('latrunculi', [
      {
        target: '#game-container',
        title: 'The Roman Board',
        body: 'Ludus Latrunculorum is played on a rectangular grid. White (marble) starts at the top, Black (obsidian) at the bottom. You play as White.',
        position: 'bottom',
        highlight: true
      },
      {
        target: '#ll-board',
        title: 'Moving Pieces',
        body: 'Regular soldiers (latrones) slide any number of squares orthogonally — like a chess rook. They are blocked by any piece in their path.',
        position: 'bottom',
        highlight: true
      },
      {
        target: '#ll-board',
        title: 'The Dux Commander',
        body: 'The Dux (marked with a gold ring) is your commander. It moves up to 1 square in any of the 8 directions, like a chess king.',
        position: 'bottom',
        highlight: true
      },
      {
        target: '#ll-board',
        title: 'Custodian Capture',
        body: 'Capture an enemy piece by sandwiching it between two of your regular pieces (not the Dux). Move one piece to flank an enemy that already has your piece on its other side.',
        position: 'right',
        highlight: true
      },
      {
        target: '#ll-board',
        title: 'Board Edge Rule',
        body: 'The board edge counts as a friendly partner for capture! You can trap an enemy piece against the wall using just one of your pieces.',
        position: 'right',
        highlight: true
      },
      {
        target: '#ll-turn',
        title: 'Winning the Game',
        body: 'Capture all enemy pieces, or leave your opponent with no legal moves. A 50-move rule and threefold repetition result in a draw.',
        position: 'left',
        highlight: true
      }
    ]);

    CGTutorial.initTrigger('latrunculi');
  }

  // ── Event wiring ───────────────────────────────────────────────────────────

  function wireEvents() {
    // Mode buttons
    document.querySelectorAll('.ll-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-mode');
        showGame(mode);
      });
    });

    // New game → back to lobby
    if (newBtn) {
      newBtn.addEventListener('click', function () {
        showLobby();
      });
    }

    // Forfeit
    if (forfeitBtn) {
      forfeitBtn.addEventListener('click', function () {
        if (!state.gameOver) {
          endGame(state.currentTurn === 'white' ? 'black' : 'white', 'White forfeits');
        }
      });
    }

    // AI toggle
    if (aiToggle) {
      aiToggle.addEventListener('change', function () {
        state.aiEnabled = aiToggle.checked;
        // If it's now black's turn and AI was re-enabled
        if (state.aiEnabled && state.currentTurn === 'black' && !state.gameOver && !state.aiThinking) {
          state.aiThinking = true;
          state.aiTimeout = setTimeout(function () {
            state.aiThinking = false;
            aiTakeTurn();
          }, 450);
        }
      });
    }

    // Resize
    window.addEventListener('resize', function () {
      updateLandscapeHint();
    });
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  function boot() {
    wireEvents();
    showLobby();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}());
