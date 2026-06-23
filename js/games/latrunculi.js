/**
 * latrunculi.js - Ludus Latrunculorum (Roman Empire strategy game)
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

  // ── Online room multiplayer ──────────────────────────────────────────────
  var vsRoom = false;          // true inside a room iframe (remote opponent)
  var mySeat = 0;              // 0 = White (moves first), 1 = Black
  var winReported = false;
  function seatColor(seat) { return seat === 0 ? 'white' : 'black'; }
  function mySideColor() { return seatColor(mySeat); }

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

    // White - rows 0 and 1
    for (c = 0; c < cfg.cols; c++) {
      board[0][c] = (c === duxCol) ? PIECE.WHITE_DUX : PIECE.WHITE;
      board[1][c] = PIECE.WHITE;
    }

    // Black - rows rows-1 and rows-2
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
      endGame('white', 'All blue pieces captured');
      return;
    }

    // Immobilisation: if the player whose turn it is now has no legal moves, they lose
    var currentMoves = getAllMovesForColor(state.currentTurn);
    if (currentMoves.length === 0) {
      var prevTurn = state.currentTurn === 'white' ? 'black' : 'white';
      endGame(prevTurn, colorLabel(state.currentTurn) + ' has no legal moves');
      return;
    }

    // 50-move draw rule
    if (state.noCaptureMoves >= 50) {
      endGame(null, '50 moves without capture - Draw');
      return;
    }

    // Threefold repetition
    var key = getBoardKey();
    var count = 0;
    for (var i = 0; i < state.positionHistory.length; i++) {
      if (state.positionHistory[i] === key) count++;
    }
    if (count >= 3) {
      endGame(null, 'Threefold repetition - Draw');
    }
  }

  // Display-name helper: state values stay 'white'/'black'; UI shows White/Blue
  function colorLabel(color) {
    return color === 'black' ? 'Blue' : 'White';
  }

  function endGame(winner, message) {
    state.gameOver = true;
    state.winner = winner;

    // Record result (vs-AI only — human plays White; online results are recorded
    // per-seat by the room end screen, so skip the solo write there).
    var isWinner = winner === 'white';
    if (!vsRoom && window.Auth && Auth.isLoggedIn()) {
      Auth.recordResult('latrunculi', isWinner ? 'win' : 'loss');
    }
    if (!vsRoom && window.Achievements) {
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
        ? (colorLabel(winner) + ' Wins!')
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

    // Switch turns
    state.currentTurn = state.currentTurn === 'white' ? 'black' : 'white';

    var key = getBoardKey();
    state.positionHistory.push(key);

    checkWinConditions();
    updateUI();
    render();

    if (vsRoom) { syncRoomState(); return; }   // online: broadcast the move; no AI

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
        if (friendlyColor === 'white') state.capturedBlack++;
        else state.capturedWhite++;
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
    var src = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
    var clientX = src.clientX;
    var clientY = src.clientY;
    // Subtract the wood border so taps map to the cell actually drawn there
    var col = Math.floor(((clientX - rect.left) * scaleX - BORDER_W) / state.boardConfig.cellSize);
    var row = Math.floor(((clientY - rect.top)  * scaleY - BORDER_W) / state.boardConfig.cellSize);
    return { row: row, col: col };
  }

  function onBoardClick(e) {
    if (state.gameOver || state.aiThinking) return;
    if (state.currentTurn === 'black' && state.aiEnabled) return;
    if (vsRoom && state.currentTurn !== mySideColor()) return;   // online: only on my turn

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

  var STONE       = '#C4B69C';
  var STONE_LIGHT = '#D8CDB4';
  var STONE_DARK  = '#A89A7F';
  var LINE        = '#7A6E59';
  var LINE_DEEP   = '#5E5443';
  var WOOD        = '#5F432C';
  var LAMP        = '#E0A04E';
  var OCHRE       = '#9E3B2B';
  var BORDER_W    = 18;

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
    // Barracks wood surround
    ctx.fillStyle = WOOD;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle plank grain - deterministic horizontal streaks
    ctx.strokeStyle = 'rgba(40,26,14,0.35)';
    ctx.lineWidth = 1;
    var fractions = [0.18, 0.42, 0.67, 0.88];
    var gi, gy;
    for (gi = 0; gi < fractions.length; gi++) {
      gy = Math.round(canvas.height * fractions[gi]) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(canvas.width, gy);
      ctx.stroke();
    }

    // Inner bevel around the stone area
    var bx = BORDER_W, by = BORDER_W;
    // light line just outside the board rect
    ctx.strokeStyle = 'rgba(224,160,78,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 1.5, by - 1.5, boardW + 3, boardH + 3);
    // dark line inside it
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, boardW - 1, boardH - 1);
  }

  function renderBoard(cs, cfg) {
    var r, c, h, x, y, i;
    var boardW = cfg.cols * cs;
    var boardH = cfg.rows * cs;

    // (a) Fill the whole board rect with stone
    ctx.fillStyle = STONE;
    ctx.fillRect(BORDER_W, BORDER_W, boardW, boardH);

    // (b) Deterministic mottling - soft irregular patches
    for (r = 0; r < cfg.rows; r++) {
      for (c = 0; c < cfg.cols; c++) {
        h = (r * 31 + c * 17) % 13;
        x = BORDER_W + c * cs;
        y = BORDER_W + r * cs;
        if (h < 3) {
          ctx.fillStyle = 'rgba(216,205,180,0.25)'; // STONE_LIGHT
          ctx.fillRect(x, y, cs, cs);
        } else if (h > 10) {
          ctx.fillStyle = 'rgba(168,154,127,0.22)'; // STONE_DARK
          ctx.fillRect(x, y, cs, cs);
        }
      }
    }

    // Larger worn blotches - fixed-position radial gradients
    var blotches = [[0.28, 0.32], [0.7, 0.6], [0.5, 0.85]];
    var bi, bcx, bcy, br, bg;
    for (bi = 0; bi < blotches.length; bi++) {
      bcx = BORDER_W + boardW * blotches[bi][0];
      bcy = BORDER_W + boardH * blotches[bi][1];
      br = Math.min(boardW, boardH) * 0.22;
      bg = ctx.createRadialGradient(bcx, bcy, 0, bcx, bcy, br);
      bg.addColorStop(0, 'rgba(216,205,180,0.18)');
      bg.addColorStop(1, 'rgba(216,205,180,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(BORDER_W, BORDER_W, boardW, boardH);
    }

    // (c) Incised grid lines on cell boundaries, hand-scratched bow
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.4;
    // Vertical lines
    for (c = 0; c <= cfg.cols; c++) {
      x = BORDER_W + c * cs;
      var vMid = BORDER_W + boardH / 2;
      var vBow = x + (((c * 7) % 3) - 1) * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, BORDER_W);
      ctx.quadraticCurveTo(vBow, vMid, x, BORDER_W + boardH);
      ctx.stroke();
    }
    // Horizontal lines
    for (r = 0; r <= cfg.rows; r++) {
      y = BORDER_W + r * cs;
      var hMid = BORDER_W + boardW / 2;
      var hBow = y + (((r * 7) % 3) - 1) * 0.6;
      ctx.beginPath();
      ctx.moveTo(BORDER_W, y);
      ctx.quadraticCurveTo(hMid, hBow, BORDER_W + boardW, y);
      ctx.stroke();
    }

    // (d) Darker intersection ticks
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = LINE_DEEP;
    for (r = 0; r <= cfg.rows; r++) {
      for (c = 0; c <= cfg.cols; c++) {
        x = BORDER_W + c * cs;
        y = BORDER_W + r * cs;
        ctx.fillRect(x - 1.1, y - 1.1, 2.2, 2.2);
      }
    }
    ctx.restore();

    // (e) Outer slab edge
    ctx.strokeStyle = LINE_DEEP;
    ctx.lineWidth = 2;
    ctx.strokeRect(BORDER_W, BORDER_W, boardW, boardH);
  }

  function renderHighlights(cs) {
    var i, vm, x, y;

    // Selected cell - gold ring
    if (state.selectedCell) {
      var sc = state.selectedCell;
      x = BORDER_W + sc.col * cs;
      y = BORDER_W + sc.row * cs;
      ctx.strokeStyle = LAMP;
      ctx.lineWidth = 3.5;
      ctx.strokeRect(x + 2, y + 2, cs - 4, cs - 4);
    }

    // Valid moves - oil-lamp glow overlay
    for (i = 0; i < state.validMoves.length; i++) {
      vm = state.validMoves[i];
      x = BORDER_W + vm.col * cs;
      y = BORDER_W + vm.row * cs;
      ctx.fillStyle = 'rgba(224,160,78,0.22)';
      ctx.fillRect(x, y, cs, cs);
      // Small center dot
      ctx.fillStyle = 'rgba(224,160,78,0.7)';
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
      // Tinted-white glass dome (never pure white)
      grad = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.25, radius * 0.05, x, y, radius);
      grad.addColorStop(0, '#FBFDF8');
      grad.addColorStop(0.45, '#E6EBE0');
      grad.addColorStop(1, '#C2D2C8');
    } else {
      // Blue glass dome
      grad = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.25, radius * 0.05, x, y, radius);
      grad.addColorStop(0, '#9FD6D2');
      grad.addColorStop(0.45, '#2E7F85');
      grad.addColorStop(1, '#1E5A63');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Piece outline
    ctx.strokeStyle = owner === 'white' ? 'rgba(122,110,89,0.5)' : 'rgba(20,60,66,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Specular highlight (glass catch)
    ctx.save();
    ctx.fillStyle = owner === 'white' ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.38, radius * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Dux marker - red-ochre ring + dot (reads on both fills)
    if (dux) {
      ctx.strokeStyle = OCHRE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = OCHRE;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── UI updates ─────────────────────────────────────────────────────────────

  function updateUI() {
    if (turnEl) {
      turnEl.textContent = (state.currentTurn === 'white' ? 'White' : 'Blue') + "'s turn";
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
    state.boardConfig = Object.assign({}, BOARD_CONFIGS[mode]);
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
        body: 'Ludus Latrunculorum is played on a grid scratched into stone. White glass counters start at the top, blue glass at the bottom. You play as White.',
        position: 'bottom',
        highlight: true
      },
      {
        target: '#ll-board',
        title: 'Moving Pieces',
        body: 'Regular soldiers (latrones) slide any number of squares orthogonally - like a chess rook. They are blocked by any piece in their path.',
        position: 'bottom',
        highlight: true
      },
      {
        target: '#ll-board',
        title: 'The Dux Commander',
        body: 'The Dux (marked with a red-ochre ring) is your commander. It moves up to 1 square in any of the 8 directions, like a chess king.',
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

  // ── Online room sync (RoomBridge) ──────────────────────────────────────────
  // Board cells arrive from a peer (untrusted); coerce each to a valid piece value.
  function cleanBoard(b) {
    if (!Array.isArray(b)) return null;
    return b.map(function (row) {
      return (Array.isArray(row) ? row : []).map(function (v) { return (v >= 0 && v <= 4) ? v : 0; });
    });
  }

  function syncRoomState() {
    if (!vsRoom || !window.RoomBridge) return;
    RoomBridge.sendState({
      board:          state.board.map(function (row) { return row.slice(); }),
      currentTurn:    state.currentTurn,
      capturedWhite:  state.capturedWhite,
      capturedBlack:  state.capturedBlack,
      noCaptureMoves: state.noCaptureMoves,
      gameOver:       state.gameOver,
      winner:         state.winner,
      mode:           state.mode,
      last_actor:     'room:' + mySeat,
    });
    if (state.gameOver) reportRoomWin();
  }

  function reportRoomWin() {
    if (!vsRoom || !window.RoomBridge || winReported) return;
    winReported = true;
    if (state.winner !== 'white' && state.winner !== 'black') return;   // draw / no winner
    RoomBridge.reportWin(state.winner === 'white' ? 0 : 1);             // seat 0 white, seat 1 black
  }

  function receiveRoomState(data) {
    if (!data || data.last_actor === 'room:' + mySeat) return;          // ignore our own echo
    var b = cleanBoard(data.board);
    if (b) state.board = b;
    state.currentTurn    = (data.currentTurn === 'white' || data.currentTurn === 'black') ? data.currentTurn : state.currentTurn;
    state.capturedWhite  = typeof data.capturedWhite  === 'number' ? data.capturedWhite  : state.capturedWhite;
    state.capturedBlack  = typeof data.capturedBlack  === 'number' ? data.capturedBlack  : state.capturedBlack;
    state.noCaptureMoves = typeof data.noCaptureMoves === 'number' ? data.noCaptureMoves : state.noCaptureMoves;
    state.selectedCell   = null;
    state.validMoves     = [];
    state.aiThinking     = false;
    if (data.gameOver && (data.winner === 'white' || data.winner === 'black' || data.winner === 'draw')) {
      state.gameOver = true; state.winner = data.winner;
    }
    updateUI();
    render();
    if (state.gameOver) reportRoomWin();
  }

  function initRoomMode() {
    if (!window.RoomBridge || !RoomBridge.isActive || !RoomBridge.isActive()) return;
    vsRoom = true;
    mySeat = RoomBridge.getSeat();
    initGame('8x8');                 // deterministic start — both seats build the same board
    state.aiEnabled = false;         // no AI online
    if (lobbyEl) lobbyEl.style.display = 'none';
    if (gcEl)    gcEl.style.display    = '';
    // Hide single-player controls.
    [newBtn, forfeitBtn].forEach(function (el) { if (el) el.style.display = 'none'; });
    if (aiToggle) { var w = aiToggle.closest('label') || aiToggle.parentElement; if (w) w.style.display = 'none'; }
    RoomBridge.onState(receiveRoomState);
    if (mySeat === 0) syncRoomState();   // seat 0 broadcasts the opening
    updateUI();
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  function boot() {
    wireEvents();
    if (window.RoomBridge && RoomBridge.isActive && RoomBridge.isActive()) {
      initRoomMode();
    } else {
      showLobby();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // ── Fullscreen resize hooks ────────────────────────────────────────────────
  if (window.FSMode) {
    FSMode.onEnter = function () { _fsResize(); };
    FSMode.onExit  = function () { _fsResize(); };
  }

  function _fsResize() {
    setTimeout(function () {
      if (typeof render === 'function') render();
    }, 50);
  }

  window.GameResize = function (availW, availH) {
    if (!state || !state.boardConfig) return;
    if (!canvas) return;
    var cfg = state.boardConfig;
    var cs = Math.floor(Math.min(availW / cfg.cols, availH / cfg.rows) * 0.92);
    cs = Math.max(cs, 24);
    cfg.cellSize = cs;
    canvas.width  = availW;
    canvas.height = availH;
    render();
  };

  window.cgMobileResize = function () {
    var scale = window.CGMobileScale || 1;
    var wrap = document.getElementById('ll-canvas-wrap');
    var containerW = wrap ? wrap.clientWidth : (window.innerWidth - 32);
    var availW = Math.min(containerW, 800) * scale;
    var availH = (window.innerHeight - 56) * scale;
    window.GameResize(availW, availH);
  };

}());
