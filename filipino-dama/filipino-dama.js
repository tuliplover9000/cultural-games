(function () {
  'use strict';
  // Filipino Dama (Filipino Draughts)
  // CONFIRMED: 8×8 board, dark squares only, 12 pieces per player
  // CONFIRMED: regular pieces move forward diagonally, capture in ALL 4 diagonal directions
  // CONFIRMED: mandatory capture, multi-jump mandatory continuation
  // CONFIRMED: Dama (king) slides long-range all 4 diagonal directions
  // RECONSTRUCTED: mid-chain promotion ends chain (piece becomes Dama, turn ends)
  // RECONSTRUCTED: 40-move no-capture draw rule
  // Source: multiple Filipino Dama rule sets + Alquerque family conventions

  // ── Constants ────────────────────────────────────────────────────────
  var EMPTY = 0, LIGHT = 1, DARK = 2, LIGHT_DAMA = 3, DARK_DAMA = 4;
  var BOARD_SIZE = 8;
  var PADDING = 24;

  // ── Board helpers ────────────────────────────────────────────────────
  function isDarkSq(r, c) { return (r + c) % 2 === 1; }

  function playerOf(piece) {
    if (piece === LIGHT || piece === LIGHT_DAMA) return LIGHT;
    if (piece === DARK  || piece === DARK_DAMA)  return DARK;
    return 0;
  }

  function isPieceOf(piece, player) { return playerOf(piece) === player; }
  function isDama(piece) { return piece === LIGHT_DAMA || piece === DARK_DAMA; }
  function opp(player) { return player === LIGHT ? DARK : LIGHT; }
  function promRow(player) { return player === LIGHT ? 0 : 7; }

  function promoted(piece) {
    if (piece === LIGHT) return LIGHT_DAMA;
    if (piece === DARK)  return DARK_DAMA;
    return piece;
  }

  function fwdDirs(player) {
    return player === LIGHT ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
  }

  var ALL_DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  function inBounds(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }

  function copyBoard(board) {
    var nb = [];
    for (var r = 0; r < BOARD_SIZE; r++) nb[r] = board[r].slice();
    return nb;
  }

  function copyAlready(already) {
    var result = {};
    for (var k in already) if (already.hasOwnProperty(k)) result[k] = true;
    return result;
  }

  // ── Initial board ────────────────────────────────────────────────────
  function initialBoard() {
    var b = [];
    for (var r = 0; r < BOARD_SIZE; r++) {
      b[r] = [];
      for (var c = 0; c < BOARD_SIZE; c++) {
        if (!isDarkSq(r, c)) { b[r][c] = EMPTY; continue; }
        if (r <= 2)      b[r][c] = DARK;
        else if (r >= 5) b[r][c] = LIGHT;
        else             b[r][c] = EMPTY;
      }
    }
    return b;
  }

  // ── State ────────────────────────────────────────────────────────────
  var state = {
    board:          [],
    currentTurn:    LIGHT,
    phase:          'playing',
    selected:       null,
    validMoves:     [],
    lastMove:       null,
    hoverCell:      null,
    gameOver:       false,
    winner:         null,
    noCaptureCount: 0,
    moveCount:      0,
    humanColor:     LIGHT,
    aiEnabled:      true,
    animating:      false,
    cellSize:       64,
    padX:           PADDING,
    padY:           PADDING
  };

  var canvas, ctx;
  var aiTimeout = null;

  // ── Move generation ──────────────────────────────────────────────────

  // Regular piece: find one capture landing in direction (dr, dc)
  function regularCapInDir(board, r, c, dr, dc, already) {
    var er = r + dr, ec = c + dc;
    var lr = r + 2 * dr, lc = c + 2 * dc;
    if (!inBounds(er, ec) || !inBounds(lr, lc)) return [];
    var ep = board[er][ec];
    if (ep === EMPTY || isPieceOf(ep, playerOf(board[r][c]))) return [];
    if (already[er + ',' + ec]) return [];
    if (board[lr][lc] !== EMPTY) return [];
    return [{ er: er, ec: ec, lr: lr, lc: lc }];
  }

  // Dama: find all capture landings in direction (dr, dc)
  function damaCapInDir(board, r, c, dr, dc, already) {
    // Slide to first non-empty
    var sr = r + dr, sc = c + dc;
    while (inBounds(sr, sc) && board[sr][sc] === EMPTY) { sr += dr; sc += dc; }
    if (!inBounds(sr, sc)) return [];
    var ep = board[sr][sc];
    if (isPieceOf(ep, playerOf(board[r][c]))) return [];
    if (already[sr + ',' + sc]) return []; // can't re-capture or pass through deferred
    // Collect landing squares beyond enemy
    var results = [];
    var lr = sr + dr, lc = sc + dc;
    while (inBounds(lr, lc) && board[lr][lc] === EMPTY) {
      results.push({ er: sr, ec: sc, lr: lr, lc: lc });
      lr += dr; lc += dc;
    }
    return results;
  }

  // Recursive capture-chain generator. Returns array of complete Move objects.
  // board: current board state (deferred pieces still on it)
  // r,c:   current piece position
  // piece: piece type at (r,c)
  // already: {key: true} dict of already-captured squares in this chain
  // captured: array of {row,col} already captured in this chain
  function findCaptureChains(board, r, c, piece, already, captured) {
    var chains = [];
    var player = playerOf(piece);

    for (var di = 0; di < ALL_DIAG.length; di++) {
      var dr = ALL_DIAG[di][0], dc = ALL_DIAG[di][1];
      var landings = isDama(piece)
        ? damaCapInDir(board, r, c, dr, dc, already)
        : regularCapInDir(board, r, c, dr, dc, already);

      for (var li = 0; li < landings.length; li++) {
        var land = landings[li];
        var newAlready = copyAlready(already);
        newAlready[land.er + ',' + land.ec] = true;
        var newCaptured = captured.concat({ row: land.er, col: land.ec });

        // Build temp board: move piece to landing, keep captured (deferred)
        var nb = copyBoard(board);
        nb[r][c] = EMPTY;
        nb[land.lr][land.lc] = piece;

        // Check mid-chain promotion (RECONSTRUCTED: ends chain)
        var becomesDama = (!isDama(piece) && land.lr === promRow(player));
        var newPiece = becomesDama ? promoted(piece) : piece;

        if (!becomesDama) {
          var continuations = findCaptureChains(nb, land.lr, land.lc, newPiece, newAlready, newCaptured);
          if (continuations.length > 0) {
            for (var ci = 0; ci < continuations.length; ci++) {
              var cont = continuations[ci];
              chains.push({
                from:       { row: r, col: c },
                finalPos:   cont.finalPos,
                captures:   cont.captures,
                becomesDama: cont.becomesDama,
                isCapture:  true
              });
            }
            continue;
          }
        }

        // Terminal node: push complete chain
        chains.push({
          from:       { row: r, col: c },
          finalPos:   { row: land.lr, col: land.lc },
          captures:   newCaptured,
          becomesDama: becomesDama,
          isCapture:  true
        });
      }
    }

    return chains;
  }

  // Non-capture moves for a piece
  function findRegularMoves(board, r, c, piece) {
    var moves = [];
    var player = playerOf(piece);
    var dirs = isDama(piece) ? ALL_DIAG : fwdDirs(player);

    for (var di = 0; di < dirs.length; di++) {
      var dr = dirs[di][0], dc = dirs[di][1];
      var nr = r + dr, nc = c + dc;
      if (isDama(piece)) {
        while (inBounds(nr, nc) && board[nr][nc] === EMPTY) {
          moves.push({ from: { row: r, col: c }, finalPos: { row: nr, col: nc }, captures: [], becomesDama: false, isCapture: false });
          nr += dr; nc += dc;
        }
      } else {
        if (inBounds(nr, nc) && board[nr][nc] === EMPTY) {
          moves.push({ from: { row: r, col: c }, finalPos: { row: nr, col: nc }, captures: [], becomesDama: (nr === promRow(player)), isCapture: false });
        }
      }
    }
    return moves;
  }

  // All legal moves for a player (mandatory capture enforced)
  function getLegalMoves(board, player) {
    var captureMoves = [];
    var regularMoves = [];

    for (var r = 0; r < BOARD_SIZE; r++) {
      for (var c = 0; c < BOARD_SIZE; c++) {
        var piece = board[r][c];
        if (!isPieceOf(piece, player)) continue;

        var caps = findCaptureChains(board, r, c, piece, {}, []);
        for (var i = 0; i < caps.length; i++) captureMoves.push(caps[i]);

        var mvs = findRegularMoves(board, r, c, piece);
        for (var j = 0; j < mvs.length; j++) regularMoves.push(mvs[j]);
      }
    }
    return captureMoves.length > 0 ? captureMoves : regularMoves;
  }

  // Does a piece at (r,c) have any valid moves?
  function pieceHasMoves(r, c) {
    for (var i = 0; i < state.validMoves.length; i++) {
      var m = state.validMoves[i];
      if (m.from.row === r && m.from.col === c) return true;
    }
    return false;
  }

  // Find a move with given from/to
  function findMove(moves, fr, fc, tr, tc) {
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (m.from.row === fr && m.from.col === fc && m.finalPos.row === tr && m.finalPos.col === tc) return m;
    }
    return null;
  }

  // ── Apply move ───────────────────────────────────────────────────────
  function applyMove(move) {
    var piece = state.board[move.from.row][move.from.col];
    state.board[move.from.row][move.from.col] = EMPTY;
    for (var i = 0; i < move.captures.length; i++) {
      state.board[move.captures[i].row][move.captures[i].col] = EMPTY;
    }
    state.board[move.finalPos.row][move.finalPos.col] = move.becomesDama ? promoted(piece) : piece;
    if (move.captures.length > 0) state.noCaptureCount = 0;
    else state.noCaptureCount++;
    state.moveCount++;
    state.lastMove = move;
  }

  // ── Counters ─────────────────────────────────────────────────────────
  function countPieces(player) {
    var n = 0;
    for (var r = 0; r < BOARD_SIZE; r++)
      for (var c = 0; c < BOARD_SIZE; c++)
        if (isPieceOf(state.board[r][c], player)) n++;
    return n;
  }

  function countDama(player) {
    var damaType = player === LIGHT ? LIGHT_DAMA : DARK_DAMA;
    var n = 0;
    for (var r = 0; r < BOARD_SIZE; r++)
      for (var c = 0; c < BOARD_SIZE; c++)
        if (state.board[r][c] === damaType) n++;
    return n;
  }

  // ── Win detection ────────────────────────────────────────────────────
  function checkWinConditions() {
    var lightCount = countPieces(LIGHT);
    var darkCount  = countPieces(DARK);

    if (lightCount === 0) { triggerGameOver(DARK);  return true; }
    if (darkCount  === 0) { triggerGameOver(LIGHT); return true; }

    // No legal moves = loss for current player
    if (state.validMoves.length === 0) { triggerGameOver(opp(state.currentTurn)); return true; }

    // 40-move no-capture draw (RECONSTRUCTED)
    if (state.noCaptureCount >= 40) { triggerGameOver('draw'); return true; }

    return false;
  }

  function triggerGameOver(winner) {
    state.gameOver  = true;
    state.winner    = winner;
    state.phase     = 'gameover';
    state.validMoves = [];
    state.selected  = null;

    if (window.RoomBridge && RoomBridge.isActive()) {
      RoomBridge.sendState(stateForSync());
      var winnerSeat = (winner === 'draw') ? null : (winner === LIGHT ? 0 : 1);
      if (winnerSeat !== null) RoomBridge.reportWin(winnerSeat);
    }

    if (state.aiEnabled) {
      if (winner === state.humanColor) {
        if (window.Auth) Auth.recordResult('filipino-dama', 'win');
        var opp_count = countPieces(opp(state.humanColor));
        if (opp_count === 0 && window.Achievements) Achievements.checkAction('fd_clean_sweep');
      } else if (winner !== 'draw') {
        if (window.Auth) Auth.recordResult('filipino-dama', 'loss');
      }
      if (window.Achievements) {
        Achievements.evaluate({
          gameId: 'filipino-dama',
          result: winner === state.humanColor ? 'win' : (winner === 'draw' ? 'draw' : 'loss')
        });
      }
    }
    render();
    showOverlay(winner);
  }

  // ── Turn lifecycle ───────────────────────────────────────────────────
  function doMove(move) {
    state.selected = null;
    applyMove(move);

    state.currentTurn = opp(state.currentTurn);
    state.validMoves  = getLegalMoves(state.board, state.currentTurn);

    if (checkWinConditions()) return;

    render();

    if (window.RoomBridge && RoomBridge.isActive()) {
      RoomBridge.sendState(stateForSync());
    }

    if (state.aiEnabled && state.currentTurn !== state.humanColor) {
      aiTimeout = setTimeout(aiTakeTurn, 500 + Math.floor(Math.random() * 300));
    }
  }

  // ── Input handling ───────────────────────────────────────────────────
  function getCellFromEvent(e) {
    var rect   = canvas.getBoundingClientRect();
    var scaleX = canvas.width  / rect.width;
    var scaleY = canvas.height / rect.height;
    var x = (e.clientX - rect.left) * scaleX;
    var y = (e.clientY - rect.top)  * scaleY;
    var c = Math.floor((x - state.padX) / state.cellSize);
    var r = Math.floor((y - state.padY) / state.cellSize);
    if (c < 0 || c >= BOARD_SIZE || r < 0 || r >= BOARD_SIZE) return null;
    return { row: r, col: c };
  }

  function handleCellClick(cell) {
    if (!cell) return;
    if (state.gameOver || state.animating) return;
    if (window.CGTutorial && CGTutorial.isActive) return;
    if (state.aiEnabled && state.currentTurn !== state.humanColor) return;
    // Online (room) mode: only act on your own seat's turn.
    if (window.RoomBridge && RoomBridge.isActive() && state.currentTurn !== state.humanColor) return;
    if (!isDarkSq(cell.row, cell.col)) return;

    var r = cell.row, c = cell.col;
    var piece = state.board[r][c];
    var activeColor = state.currentTurn;

    // If a piece is selected, try to execute a move to clicked cell
    if (state.selected) {
      var move = findMove(state.validMoves, state.selected.row, state.selected.col, r, c);
      if (move) { doMove(move); return; }
    }

    // Click own piece that has legal moves: select it
    if (isPieceOf(piece, activeColor) && pieceHasMoves(r, c)) {
      state.selected = { row: r, col: c };
      render();
      return;
    }

    // Deselect
    state.selected = null;
    render();
  }

  // ── Rendering ────────────────────────────────────────────────────────
  function getCellTL(r, c) {
    return { x: state.padX + c * state.cellSize, y: state.padY + r * state.cellSize };
  }

  function getCellCenter(r, c) {
    return {
      x: state.padX + c * state.cellSize + state.cellSize / 2,
      y: state.padY + r * state.cellSize + state.cellSize / 2
    };
  }

  function renderBoard() {
    var cs = state.cellSize;
    var fieldX = state.padX, fieldY = state.padY;
    var fieldW = BOARD_SIZE * cs, fieldH = BOARD_SIZE * cs;

    // (a) BACKDROP — sun-warmed gray concrete
    ctx.fillStyle = '#A8A29A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Warm late-afternoon amber wash from upper-left
    var wash = ctx.createRadialGradient(
      canvas.width * 0.30, canvas.height * 0.12, 0,
      canvas.width * 0.30, canvas.height * 0.12, canvas.width
    );
    wash.addColorStop(0, 'rgba(232,162,74,0.18)');
    wash.addColorStop(1, 'rgba(232,162,74,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Deterministic concrete mottle — soft darker blotches
    var blotches = [
      [0.18, 0.22, 0.16, 0.11],
      [0.74, 0.18, 0.13, 0.09],
      [0.55, 0.62, 0.18, 0.12],
      [0.28, 0.80, 0.14, 0.10],
      [0.86, 0.70, 0.12, 0.09]
    ];
    ctx.fillStyle = 'rgba(110,106,99,0.12)';
    for (var bi = 0; bi < blotches.length; bi++) {
      var bl = blotches[bi];
      ctx.beginPath();
      ctx.ellipse(canvas.width * bl[0], canvas.height * bl[1],
        canvas.width * bl[2], canvas.height * bl[3], 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Deterministic hairline cracks near edges
    ctx.strokeStyle = 'rgba(110,106,99,0.35)';
    ctx.lineWidth = 1;
    var cracks = [
      [[0.04, 0.30], [0.09, 0.38], [0.07, 0.47], [0.12, 0.55]],
      [[0.93, 0.20], [0.88, 0.27], [0.91, 0.35], [0.86, 0.41]],
      [[0.40, 0.94], [0.47, 0.90], [0.53, 0.95], [0.61, 0.91]]
    ];
    for (var ci = 0; ci < cracks.length; ci++) {
      var crk = cracks[ci];
      ctx.beginPath();
      for (var cp = 0; cp < crk.length; cp++) {
        var px = canvas.width * crk[cp][0], py = canvas.height * crk[cp][1];
        if (cp === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // (b) FIELD — faint scuffed-smooth concrete where the board is drawn
    ctx.fillStyle = 'rgba(242,239,230,0.06)';
    ctx.fillRect(fieldX, fieldY, fieldW, fieldH);

    // (d) PLAYABLE-CELL SCUFF — faint warm slide-marks on dark squares
    ctx.fillStyle = 'rgba(232,162,74,0.06)';
    for (var sr = 0; sr < BOARD_SIZE; sr++) {
      for (var sc = 0; sc < BOARD_SIZE; sc++) {
        if (!isDarkSq(sr, sc)) continue;
        var stl = getCellTL(sr, sc);
        ctx.fillRect(stl.x, stl.y, cs, cs);
      }
    }

    // (c) CHALK SQUARE GRID — dusty hand-drawn lattice with subtle wobble
    ctx.strokeStyle = 'rgba(242,239,230,0.5)';
    ctx.lineWidth = 1.4;
    for (var gi = 0; gi <= BOARD_SIZE; gi++) {
      var wob = ((gi % 3) - 1) * 0.6; // deterministic offset from i
      // Vertical line
      var vx = fieldX + gi * cs;
      ctx.beginPath();
      ctx.moveTo(vx + wob, fieldY);
      ctx.lineTo(vx - wob, fieldY + fieldH * 0.5);
      ctx.lineTo(vx + wob, fieldY + fieldH);
      ctx.stroke();
      // Horizontal line
      var hy = fieldY + gi * cs;
      ctx.beginPath();
      ctx.moveTo(fieldX, hy + wob);
      ctx.lineTo(fieldX + fieldW * 0.5, hy - wob);
      ctx.lineTo(fieldX + fieldW, hy + wob);
      ctx.stroke();
    }

    // (e) LINED-BOARD DIAGONALS — the signature point-to-point chalk lattice
    ctx.strokeStyle = 'rgba(242,239,230,0.6)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (var dr = 0; dr < BOARD_SIZE; dr++) {
      for (var dc = 0; dc < BOARD_SIZE; dc++) {
        if (!isDarkSq(dr, dc)) continue;
        var ctr = getCellCenter(dr, dc);
        // down-right neighbour
        if (dr + 1 < BOARD_SIZE && dc + 1 < BOARD_SIZE && isDarkSq(dr + 1, dc + 1)) {
          var drn = getCellCenter(dr + 1, dc + 1);
          ctx.beginPath();
          ctx.moveTo(ctr.x, ctr.y);
          ctx.lineTo(drn.x, drn.y);
          ctx.stroke();
        }
        // down-left neighbour
        if (dr + 1 < BOARD_SIZE && dc - 1 >= 0 && isDarkSq(dr + 1, dc - 1)) {
          var dln = getCellCenter(dr + 1, dc - 1);
          ctx.beginPath();
          ctx.moveTo(ctr.x, ctr.y);
          ctx.lineTo(dln.x, dln.y);
          ctx.stroke();
        }
      }
    }
    ctx.lineCap = 'butt';

    // Chalk point-dots at every playable-cell intersection
    ctx.fillStyle = 'rgba(242,239,230,0.7)';
    for (var pr = 0; pr < BOARD_SIZE; pr++) {
      for (var pc = 0; pc < BOARD_SIZE; pc++) {
        if (!isDarkSq(pr, pc)) continue;
        var pctr = getCellCenter(pr, pc);
        ctx.beginPath();
        ctx.arc(pctr.x, pctr.y, cs * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // (f) OUTER CHALK BORDER — hand-drawn double frame
    ctx.strokeStyle = 'rgba(242,239,230,0.55)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(fieldX - 4, fieldY - 4, fieldW + 8, fieldH + 8);
    ctx.strokeRect(fieldX - 7, fieldY - 7, fieldW + 14, fieldH + 14);
  }

  function renderHighlights() {
    var destSet = {};
    var movablePieces = {};

    if (state.selected) {
      // Highlight selected cell
      var stl = getCellTL(state.selected.row, state.selected.col);
      ctx.fillStyle = 'rgba(232,162,74,0.30)';
      ctx.fillRect(stl.x, stl.y, state.cellSize, state.cellSize);

      // Collect valid destinations for selected piece
      for (var i = 0; i < state.validMoves.length; i++) {
        var m = state.validMoves[i];
        if (m.from.row === state.selected.row && m.from.col === state.selected.col) {
          destSet[m.finalPos.row + ',' + m.finalPos.col] = true;
        }
      }
    } else {
      // Highlight all pieces that have legal moves
      for (var i = 0; i < state.validMoves.length; i++) {
        var m = state.validMoves[i];
        movablePieces[m.from.row + ',' + m.from.col] = true;
      }
    }

    // Draw movable piece highlights (subtle)
    for (var key in movablePieces) {
      if (!movablePieces.hasOwnProperty(key)) continue;
      var parts = key.split(',');
      var tl = getCellTL(parseInt(parts[0], 10), parseInt(parts[1], 10));
      ctx.fillStyle = 'rgba(242,239,230,0.14)';
      ctx.fillRect(tl.x, tl.y, state.cellSize, state.cellSize);
    }

    // Draw valid destination highlights
    for (var key in destSet) {
      if (!destSet.hasOwnProperty(key)) continue;
      var parts = key.split(',');
      var tr = parseInt(parts[0], 10), tc = parseInt(parts[1], 10);
      var tl = getCellTL(tr, tc);
      ctx.fillStyle = 'rgba(232,162,74,0.22)';
      ctx.fillRect(tl.x, tl.y, state.cellSize, state.cellSize);
      // Chalked target dot — the one jeepney-vermilion accent
      var center = getCellCenter(tr, tc);
      ctx.beginPath();
      ctx.arc(center.x, center.y, state.cellSize * 0.10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(244,81,30,0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(242,239,230,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Hover highlight (valid destination hovered while piece selected)
    if (state.hoverCell && state.selected) {
      var hKey = state.hoverCell.row + ',' + state.hoverCell.col;
      if (destSet[hKey]) {
        var htl = getCellTL(state.hoverCell.row, state.hoverCell.col);
        ctx.fillStyle = 'rgba(232,162,74,0.22)';
        ctx.fillRect(htl.x, htl.y, state.cellSize, state.cellSize);
      }
    }

    // Last move highlight
    if (state.lastMove) {
      var ftl = getCellTL(state.lastMove.from.row, state.lastMove.from.col);
      var ttl = getCellTL(state.lastMove.finalPos.row, state.lastMove.finalPos.col);
      ctx.fillStyle = 'rgba(232,162,74,0.14)';
      ctx.fillRect(ftl.x, ftl.y, state.cellSize, state.cellSize);
      ctx.fillRect(ttl.x, ttl.y, state.cellSize, state.cellSize);
    }

    // Highlight captured pieces from last move
    if (state.lastMove && state.lastMove.captures.length > 0) {
      for (var i = 0; i < state.lastMove.captures.length; i++) {
        var cap = state.lastMove.captures[i];
        var ctl = getCellTL(cap.row, cap.col);
        ctx.fillStyle = 'rgba(200,30,30,0.24)';
        ctx.fillRect(ctl.x, ctl.y, state.cellSize, state.cellSize);
      }
    }
  }

  // Draw a single tansan (crimped metal bottle cap) at (cx, cy) of radius rad.
  // kind: 'red' (Coca-Cola style) or 'tin' (bare metal).
  function drawCapBody(cx, cy, rad, kind) {
    // Crimped serrated rim: 42 points alternating outer radius
    var teeth = 21;
    ctx.beginPath();
    for (var t = 0; t < teeth * 2; t++) {
      var a = (t / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
      var rr = (t % 2 === 0) ? rad : rad * 0.92;
      var x = cx + rr * Math.cos(a);
      var y = cy + rr * Math.sin(a);
      if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    var grad = ctx.createRadialGradient(
      cx - rad * 0.15, cy - rad * 0.15, rad * 0.1,
      cx, cy, rad
    );
    if (kind === 'red') {
      grad.addColorStop(0, '#E23B4E');
      grad.addColorStop(0.55, '#C8102E');
      grad.addColorStop(1, '#7A0A18');
    } else {
      grad.addColorStop(0, '#E8ECEE');
      grad.addColorStop(0.55, '#BFC4C8');
      grad.addColorStop(1, '#8A8E90');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    // Skirt ring — the cap's pressed inner crimp ring
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 0.86, 0, Math.PI * 2);
    ctx.strokeStyle = (kind === 'red') ? '#7A0A18' : '#8A8E90';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Top face
    ctx.beginPath();
    ctx.arc(cx, cy, rad * 0.76, 0, Math.PI * 2);
    ctx.fillStyle = (kind === 'red') ? '#C8102E' : '#BFC4C8';
    ctx.fill();

    if (kind === 'tin') {
      // Rust flecks at deterministic offsets
      ctx.fillStyle = 'rgba(154,91,51,0.5)';
      var flecks = [[-0.22, 0.18, 0.10], [0.30, -0.12, 0.08], [0.05, 0.34, 0.07]];
      for (var f = 0; f < flecks.length; f++) {
        ctx.beginPath();
        ctx.arc(cx + rad * flecks[f][0], cy + rad * flecks[f][1], rad * flecks[f][2], 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Faint concentric brand ring
      ctx.beginPath();
      ctx.arc(cx, cy, rad * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Specular highlight
    ctx.beginPath();
    ctx.ellipse(cx - rad * 0.28, cy - rad * 0.30, rad * 0.30, rad * 0.20, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  }

  function drawBottleCap(cx, cy, rad, kind, dama) {
    drawCapBody(cx, cy, rad, kind);

    // DAMA — folk promotion: a second tansan stacked on top, raised slightly
    if (dama) {
      var topR = rad * 0.66;
      var topY = cy - rad * 0.16;
      drawCapBody(cx, topY, topR, kind);
      // Brass glint ring on the stacked cap's top face
      ctx.beginPath();
      ctx.arc(cx, topY, topR * 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#B8860B';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Brass centre dot
      ctx.beginPath();
      ctx.arc(cx, topY, rad * 0.10, 0, Math.PI * 2);
      ctx.fillStyle = '#B8860B';
      ctx.fill();
    }
  }

  function renderPieces() {
    for (var r = 0; r < BOARD_SIZE; r++) {
      for (var c = 0; c < BOARD_SIZE; c++) {
        var piece = state.board[r][c];
        if (piece === EMPTY) continue;

        var center = getCellCenter(r, c);
        var radius = state.cellSize * 0.38;
        var player = playerOf(piece);

        // Soft sienna shadow under the cap
        ctx.beginPath();
        ctx.arc(center.x + 1.5, center.y + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.40)';
        ctx.fill();

        // Tansan bottle cap — LIGHT → bare tin, DARK → crimson Coca-Cola cap
        var kind = (player === LIGHT) ? 'tin' : 'red';
        drawBottleCap(center.x, center.y, radius, kind, isDama(piece));
      }
    }
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderBoard();
    renderHighlights();
    renderPieces();
    updateSidebar();
  }

  function updateSidebar() {
    var lightCount = countPieces(LIGHT);
    var darkCount  = countPieces(DARK);
    var lightDama  = countDama(LIGHT);
    var darkDama   = countDama(DARK);

    setEl('fd-light-pieces', lightCount);
    setEl('fd-light-dama',   lightDama);
    setEl('fd-dark-pieces',  darkCount);
    setEl('fd-dark-dama',    darkDama);
    setEl('fd-move-count',   state.moveCount);

    var turnEl = document.getElementById('fd-turn-indicator');
    if (turnEl) {
      if (state.gameOver) {
        turnEl.textContent = state.winner === 'draw' ? 'Draw!' :
          (state.winner === LIGHT ? 'Light wins!' : 'Dark wins!');
        turnEl.dataset.color = state.winner === 'draw' ? 'draw' :
          (state.winner === LIGHT ? 'light' : 'dark');
      } else {
        turnEl.textContent = (state.currentTurn === LIGHT ? "Light's turn" : "Dark's turn");
        turnEl.dataset.color = state.currentTurn === LIGHT ? 'light' : 'dark';
      }
      var discEl = document.getElementById('fd-turn-disc');
      if (discEl) discEl.dataset.color = turnEl.dataset.color;
    }
  }

  function setEl(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Overlay ──────────────────────────────────────────────────────────
  function showOverlay(winner) {
    var overlay = document.getElementById('fd-overlay');
    var msg     = document.getElementById('fd-overlay-msg');
    var sub     = document.getElementById('fd-overlay-sub');
    if (!overlay) return;
    if (winner === 'draw') {
      msg.textContent = 'Draw!';
      sub.textContent = '40 moves without a capture — the game is declared a draw.';
    } else {
      var name = winner === LIGHT ? 'Light' : 'Dark';
      msg.textContent = name + ' wins!';
      sub.textContent = winner === LIGHT
        ? 'All dark pieces captured or immobilised.'
        : 'All light pieces captured or immobilised.';
    }
    overlay.hidden = false;
  }

  function hideOverlay() {
    var overlay = document.getElementById('fd-overlay');
    if (overlay) overlay.hidden = true;
  }

  // ── AI ───────────────────────────────────────────────────────────────
  function scoreMove(move, player) {
    var score = 0;
    // Captures are top priority
    score += move.captures.length * 100;
    // Promotion is very valuable
    if (move.becomesDama) score += 200;
    // Advancement toward promotion row
    var advRow = player === DARK ? move.finalPos.row : (7 - move.finalPos.row);
    score += advRow * 4;
    // Center control
    var distCenter = Math.abs(move.finalPos.col - 3.5) + Math.abs(move.finalPos.row - 3.5);
    score += Math.max(0, 6 - distCenter) * 2;
    // Dama pieces: slight advance bonus
    if (isDama(state.board[move.from.row][move.from.col])) score += 8;
    // Tiebreaker noise
    score += Math.random() * 5;
    return score;
  }

  function getBestMove() {
    if (!state.validMoves.length) return null;
    var best = null, bestScore = -Infinity;
    var aiColor = opp(state.humanColor);
    for (var i = 0; i < state.validMoves.length; i++) {
      var s = scoreMove(state.validMoves[i], aiColor);
      if (s > bestScore) { bestScore = s; best = state.validMoves[i]; }
    }
    return best;
  }

  function aiTakeTurn() {
    if (state.gameOver) return;
    if (window.CGTutorial && CGTutorial.isActive) return;
    var aiColor = opp(state.humanColor);
    if (state.currentTurn !== aiColor) return;
    var move = getBestMove();
    if (!move) return;
    state.animating = true;
    aiTimeout = setTimeout(function () {
      state.animating = false;
      doMove(move);
    }, 400 + Math.floor(Math.random() * 300));
  }

  // ── Room sync ────────────────────────────────────────────────────────
  function stateForSync() {
    return {
      board:          state.board.map(function (row) { return row.slice(); }),
      currentTurn:    state.currentTurn,
      moveCount:      state.moveCount,
      noCaptureCount: state.noCaptureCount,
      gameOver:       state.gameOver,
      winner:         state.winner,
      lastMove:       state.lastMove
    };
  }

  function applyRemoteState(blob) {
    if (!blob) return;
    state.board           = blob.board          || state.board;
    if (blob.currentTurn    !== undefined) state.currentTurn    = blob.currentTurn;
    if (blob.moveCount      !== undefined) state.moveCount      = blob.moveCount;
    if (blob.noCaptureCount !== undefined) state.noCaptureCount = blob.noCaptureCount;
    if (blob.lastMove       !== undefined) state.lastMove       = blob.lastMove;
    if (blob.gameOver && !state.gameOver) {
      state.gameOver = true;
      state.winner   = blob.winner;
      state.phase    = 'gameover';
      state.validMoves = [];
      showOverlay(blob.winner);
    } else if (!state.gameOver) {
      state.validMoves = getLegalMoves(state.board, state.currentTurn);
    }
    render();
  }

  // ── Tutorial steps ───────────────────────────────────────────────────
  var fdTutorialSteps = [
    { title: 'The Board',     target: '#fd-board',        text: 'Filipino Dama is played on an 8×8 board. Pieces only occupy the dark squares.' },
    { title: 'Your Pieces',   target: '#fd-light-pieces', text: 'You play the tin (silver) bottle caps at the bottom. Your goal: capture all of the red Coca-Cola caps.' },
    { title: 'Moving',        target: '#fd-board',        text: 'Click a highlighted piece, then click a highlighted square to move. Regular pieces move diagonally forward.' },
    { title: 'Capturing',     target: '#fd-board',        text: 'Jump over an enemy to capture it — uniquely, you can capture in ALL diagonal directions, not just forward. Capture is mandatory!' },
    { title: 'Multi-jump',    target: '#fd-board',        text: 'After a capture, if another capture is available with the same piece, you must continue jumping. Captured pieces are removed at the end.' },
    { title: 'Dama',          target: '#fd-light-dama',   text: 'Reach the far end to be promoted to a Dama — shown as a second cap stacked on top, the way it is marked in a real street game. A Dama slides any number of squares diagonally and captures long-range.' }
  ];

  // ── Theme hook ───────────────────────────────────────────────────────
  window.CGTheme = window.CGTheme || {};
  var _origThemeChange = window.CGTheme.onThemeChange;
  window.CGTheme.onThemeChange = function () {
    if (_origThemeChange) _origThemeChange();
    render();
  };

  // ── Init ─────────────────────────────────────────────────────────────
  function initGame() {
    if (aiTimeout) { clearTimeout(aiTimeout); aiTimeout = null; }
    state.board           = initialBoard();
    state.currentTurn     = LIGHT;
    state.phase           = 'playing';
    state.selected        = null;
    state.lastMove        = null;
    state.hoverCell       = null;
    state.gameOver        = false;
    state.winner          = null;
    state.noCaptureCount  = 0;
    state.moveCount       = 0;
    state.animating       = false;
    hideOverlay();
    state.validMoves = getLegalMoves(state.board, state.currentTurn);
    render();
    if (state.aiEnabled && state.currentTurn !== state.humanColor) {
      aiTimeout = setTimeout(aiTakeTurn, 600);
    }
  }

  // ── DOMContentLoaded ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    canvas = document.getElementById('fd-board');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    canvas.width  = 560;
    canvas.height = 560;
    // cellSize = (560 - 2*24) / 8 = 512 / 8 = 64
    state.cellSize = (canvas.width - 2 * PADDING) / BOARD_SIZE;

    if (window.Achievements) Achievements.init();
    if (window.CGTutorial)   CGTutorial.initTrigger('filipino-dama');
    if (window.PWF)          PWF.init('filipino-dama');

    // Room / multiplayer setup
    if (window.RoomBridge && RoomBridge.isActive()) {
      state.aiEnabled  = false;
      var seat         = RoomBridge.getSeat();
      state.humanColor = (seat === 0) ? LIGHT : DARK;
      RoomBridge.onState(function (blob) { applyRemoteState(blob); });
    }

    // AI toggle
    var aiToggle = document.getElementById('fd-ai-toggle');
    if (aiToggle) {
      aiToggle.checked = state.aiEnabled;
      aiToggle.addEventListener('change', function () {
        state.aiEnabled = this.checked;
        if (state.aiEnabled && !state.gameOver && state.currentTurn !== state.humanColor) {
          aiTimeout = setTimeout(aiTakeTurn, 600);
        }
      });
    }

    // Buttons
    var newGameBtn  = document.getElementById('fd-new-game');
    if (newGameBtn) newGameBtn.addEventListener('click', initGame);

    var resignBtn = document.getElementById('fd-resign');
    if (resignBtn) resignBtn.addEventListener('click', function () {
      if (!state.gameOver) triggerGameOver(opp(state.humanColor));
    });

    var playAgainBtn = document.getElementById('fd-play-again');
    if (playAgainBtn) playAgainBtn.addEventListener('click', initGame);

    // Canvas interaction
    canvas.addEventListener('click', function (e) {
      handleCellClick(getCellFromEvent(e));
    });

    canvas.addEventListener('mousemove', function (e) {
      if (state.gameOver || state.animating || state.currentTurn !== state.humanColor) {
        if (state.hoverCell) { state.hoverCell = null; render(); }
        return;
      }
      var cell = getCellFromEvent(e);
      var newHover = (cell && isDarkSq(cell.row, cell.col)) ? cell : null;
      var changed = JSON.stringify(newHover) !== JSON.stringify(state.hoverCell);
      state.hoverCell = newHover;
      if (changed) render();
    });

    canvas.addEventListener('mouseleave', function () {
      state.hoverCell = null;
      render();
    });

    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var touch = e.touches[0];
      handleCellClick(getCellFromEvent(touch));
    }, { passive: false });

    // Register tutorial
    if (window.CGTutorial) CGTutorial.register('filipino-dama', fdTutorialSteps);

    // CSS scaling for non-fullscreen display
    function resizeCanvas() {
      if (window.FSMode && window.FSMode.isActive()) return;
      var container = canvas.parentElement;
      var maxSize   = Math.min(container ? container.clientWidth : 520, 520);
      var size      = Math.max(280, maxSize);
      canvas.style.width  = size + 'px';
      canvas.style.height = size + 'px';
    }

    resizeCanvas();
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeCanvas, 60);
    });

    // Fullscreen: resize canvas buffer and re-centre board
    window.GameResize = function (availW, availH) {
      if (!canvas || !ctx) return;
      var newCell = Math.floor((Math.min(availW, availH) - 2 * PADDING) / BOARD_SIZE);
      if (newCell < 28) newCell = 28;
      state.cellSize = newCell;
      var boardPx   = BOARD_SIZE * newCell;
      state.padX    = Math.max(PADDING, Math.round((availW - boardPx) / 2));
      state.padY    = Math.max(PADDING, Math.round((availH - boardPx) / 2));
      canvas.width  = availW;
      canvas.height = availH;
      render();
    };

    if (window.FSMode) {
      FSMode.onExit = function () {
        setTimeout(function () {
          canvas.style.removeProperty('width');
          canvas.style.removeProperty('height');
          resizeCanvas();
          render();
        }, 50);
      };
    }

    initGame();
  });
}());
