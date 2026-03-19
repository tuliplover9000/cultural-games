/**
 * pachisi.js — Pachisi (Indian cross-and-circle race game)
 * 9×9 logical grid, cowrie-shell dice, 2 or 4 players, AI for red/green.
 */
(function () {
  'use strict';

  // ── Path definitions ───────────────────────────────────────────────────────
  // Each path is an array of [row, col] for pathIndex 0..31
  // pathIndex >= 32 → piece is HOME (Charkoni)
  var PATH_LENGTH = 32;

  var PATHS = {
    yellow: [
      [8,3],[7,3],[6,3],
      [5,2],[5,1],[5,0],
      [4,0],[3,0],
      [3,1],[3,2],
      [2,3],[1,3],[0,3],
      [0,4],[0,5],
      [1,5],[2,5],
      [3,6],[3,7],[3,8],
      [4,8],[5,8],
      [5,7],[5,6],
      [6,5],[7,5],[8,5],
      [8,4],
      [7,4],[6,4],[5,4],[4,4]
    ],
    red: [
      [5,0],[4,0],[3,0],
      [3,1],[3,2],
      [2,3],[1,3],[0,3],
      [0,4],[0,5],
      [1,5],[2,5],
      [3,6],[3,7],[3,8],
      [4,8],[5,8],
      [5,7],[5,6],
      [6,5],[7,5],[8,5],
      [8,4],[8,3],
      [7,3],[6,3],
      [5,2],[5,1],
      [4,1],
      [4,2],[4,3],[4,4]
    ],
    green: [
      [0,5],[1,5],[2,5],
      [3,6],[3,7],[3,8],
      [4,8],[5,8],
      [5,7],[5,6],
      [6,5],[7,5],[8,5],
      [8,4],[8,3],
      [7,3],[6,3],
      [5,2],[5,1],[5,0],
      [4,0],[3,0],
      [3,1],[3,2],
      [2,3],[1,3],[0,3],
      [0,4],
      [1,4],[2,4],[3,4],[4,4]
    ],
    black: [
      [5,8],[4,8],[3,8],
      [3,7],[3,6],
      [2,5],[1,5],[0,5],
      [0,4],[0,3],
      [1,3],[2,3],
      [3,2],[3,1],[3,0],
      [4,0],[5,0],
      [5,1],[5,2],
      [6,3],[7,3],[8,3],
      [8,4],[8,5],
      [7,5],[6,5],
      [5,6],[5,7],
      [4,7],
      [4,6],[4,5],[4,4]
    ]
  };

  // Castle (safe) squares — O(1) lookup
  var CASTLE_SET = (function () {
    var squares = [
      '0,4','2,3','3,0','4,8',
      '5,8','8,4','8,3','6,5',
      '5,0','3,2','1,5','5,6'
    ];
    var s = {};
    squares.forEach(function (k) { s[k] = true; });
    return s;
  }());

  function isCastle(r, c) {
    return !!CASTLE_SET[r + ',' + c];
  }

  // Charkoni center squares (pathIndex >= PATH_LENGTH)
  var CHARKONI_CENTER = [4, 4]; // final destination

  // Yard visual positions: [row, col] of yard top-left in 9×9 grid
  // Yellow yard: rows 6-8 cols 0-2
  // Red yard: rows 0-2 cols 0-2
  // Green yard: rows 0-2 cols 6-8
  // Black yard: rows 6-8 cols 6-8
  var YARD_CORNERS = {
    yellow: [6, 0],
    red:    [0, 0],
    green:  [0, 6],
    black:  [6, 6]
  };

  // ── Colours ───────────────────────────────────────────────────────────────
  var PIECE_COLORS = {
    yellow: '#F5C518',
    red:    '#E03030',
    green:  '#27AE60',
    black:  '#2C2C2C'
  };

  var PIECE_STROKE = {
    yellow: '#8B6914',
    red:    '#7a0a0a',
    green:  '#1a5c1a',
    black:  '#667788'
  };

  // Board arm/yard palette (used in drawBoard)
  var BOARD_COLORS = {
    yellow: '#F5C518',
    red:    '#E03030',
    green:  '#27AE60',
    black:  '#3A3A8C'
  };

  // ── Canvas ────────────────────────────────────────────────────────────────
  var canvas, ctx;
  var GRID = 9;
  var CELL = 70;
  var CANVAS_SIZE = 630;

  function recalcSize() {
    var avail = Math.min(window.innerWidth - 32, 630);
    CELL = Math.floor(avail / GRID);
    CANVAS_SIZE = CELL * GRID;
    if (canvas) {
      canvas.width  = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
    }
  }

  function cx(col) { return col * CELL + CELL / 2; }
  function cy(row) { return row * CELL + CELL / 2; }
  function cellFromPx(x, y) {
    var c = Math.floor(x / CELL);
    var r = Math.floor(y / CELL);
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return null;
    return [r, c];
  }

  // Is a [row,col] cell part of the active cross?
  function isCross(r, c) {
    return (c >= 3 && c <= 5) || (r >= 3 && r <= 5);
  }

  // Is the cell in a yard corner?
  function isYard(r, c) {
    return !isCross(r, c);
  }

  // ── State ─────────────────────────────────────────────────────────────────
  var state = null;

  function recordSoloResult(win) {
    if (!win || !window.Auth || !Auth.recordResult) return;
    if (state && state.humanSeat !== undefined && state.humanSeat !== null) return; // room mode
    var humanWon = (state.mode === '2player') ? win === 'yellow'
                 : /* 4-player */               win === 'Team A';
    Auth.recordResult('pachisi', humanWon ? 'win' : 'loss');
  }

  function makePieces(owner) {
    var arr = [];
    for (var i = 0; i < 4; i++) {
      arr.push({ id: i, owner: owner, pathIndex: -1, state: 'yard' });
    }
    return arr;
  }

  function freshState(mode, vsAI) {
    var players = mode === '4player'
      ? ['yellow', 'red', 'green', 'black']
      : ['yellow', 'red'];
    return {
      mode: mode,
      players: players,
      teams: { yellow: 'A', black: 'A', red: 'B', green: 'B' },
      pieces: {
        yellow: makePieces('yellow'),
        red:    makePieces('red'),
        green:  makePieces('green'),
        black:  makePieces('black')
      },
      currentPlayer: 'yellow',
      rollResult: null,
      rollUsed: false,
      bonusRoll: false,
      gameOver: false,
      winner: null,
      vsAI: vsAI,
      moveCount: 0
    };
  }

  // ── Cowrie dice ───────────────────────────────────────────────────────────
  // Returns array of 6 booleans (true = face-up / mouth-up).
  // graceBias 0–1: chance of forcing a 6 or 25 result so pieces can enter board.
  function rollCowries(graceBias) {
    graceBias = graceBias || 0;
    // With graceBias chance, force result to 6 (all up) or 25 (all down)
    if (graceBias > 0 && Math.random() < graceBias) {
      var forceGrace = Math.random() < 0.5; // 50/50 between 6 and 25
      var val = forceGrace ? true : false;  // true=6up, false=0up=25
      var forced = [];
      for (var j = 0; j < 6; j++) forced.push(val);
      return forced;
    }
    var shells = [];
    for (var i = 0; i < 6; i++) {
      shells.push(Math.random() < 0.5);
    }
    return shells;
  }

  // Compute grace bias for current player: ramp down from 0.55 → 0 as pieces enter board
  function graceBiasFor(player) {
    var onBoard = (state.pieces[player] || []).filter(function (p) {
      return p.state === 'board';
    }).length;
    if (onBoard === 0) return 0.55;   // all in yard: 55% chance of 6 or 25
    if (onBoard === 1) return 0.30;   // 1 on board: 30%
    if (onBoard === 2) return 0.10;   // 2 on board: 10%
    return 0;                         // 3+ on board: natural odds
  }

  function shellsToValue(shells) {
    var up = shells.filter(function (s) { return s; }).length;
    return up === 0 ? 25 : up;
  }

  // ── Game logic ────────────────────────────────────────────────────────────

  // Get all pieces of a player
  function playerPieces(player) {
    return state.pieces[player];
  }

  // Get position [row, col] of a piece, or null if in yard / home
  function piecePos(piece) {
    if (piece.state === 'yard') return null;
    if (piece.state === 'home') return CHARKONI_CENTER.slice();
    var p = PATHS[piece.owner][piece.pathIndex];
    return p ? p.slice() : null;
  }

  // Check if a square [r,c] has a blockade for a given player (2+ pieces)
  function hasBlockade(r, c, player) {
    if (isCastle(r, c)) return false; // castles never blockade
    var pieces = playerPieces(player).filter(function (p) {
      if (p.state !== 'board') return false;
      var pos = piecePos(p);
      return pos && pos[0] === r && pos[1] === c;
    });
    return pieces.length >= 2;
  }

  // Check if moving piece by roll would pass through an enemy blockade
  function wouldPassThroughBlockade(piece, roll) {
    var path = PATHS[piece.owner];
    var start = piece.pathIndex;
    var otherPlayers = state.players.filter(function (pl) { return pl !== piece.owner; });
    for (var step = 1; step <= roll; step++) {
      var idx = start + step;
      if (idx >= PATH_LENGTH) break;
      var sq = path[idx];
      for (var pi = 0; pi < otherPlayers.length; pi++) {
        if (hasBlockade(sq[0], sq[1], otherPlayers[pi])) {
          return true;
        }
      }
    }
    return false;
  }

  // Get pieces that are valid moves for a given roll
  function validMoves(player, roll) {
    var pieces = playerPieces(player);
    var isGrace = (roll === 6 || roll === 25);
    var valid = [];

    pieces.forEach(function (piece) {
      if (piece.state === 'home') return;

      if (piece.state === 'yard') {
        if (!isGrace) return;
        // Can enter: pathIndex will become 0
        // Check if pathIndex 0 is blocked by enemy blockade
        var entryPath = PATHS[piece.owner];
        var entryPos = entryPath[0];
        var blocked = false;
        state.players.forEach(function (pl) {
          if (pl !== player && hasBlockade(entryPos[0], entryPos[1], pl)) {
            blocked = true;
          }
        });
        if (!blocked) valid.push(piece);
        return;
      }

      // Board piece
      var newIdx = piece.pathIndex + roll;
      if (newIdx > PATH_LENGTH) return; // overshoot — can't move
      if (newIdx === PATH_LENGTH) {
        // Exactly home
        valid.push(piece);
        return;
      }
      // Check blockade passthrough
      if (wouldPassThroughBlockade(piece, roll)) return;
      valid.push(piece);
    });

    return valid;
  }

  // Apply a move: move piece by roll
  function applyMove(piece, roll) {
    if (piece.state === 'yard') {
      piece.state = 'board';
      piece.pathIndex = 0;
    } else {
      piece.pathIndex += roll;
    }

    if (piece.pathIndex >= PATH_LENGTH) {
      piece.pathIndex = PATH_LENGTH;
      piece.state = 'home';
      return;
    }

    // Capture check
    var pos = piecePos(piece);
    if (!pos) return;
    var r = pos[0], c = pos[1];

    if (isCastle(r, c)) return; // safe square — no captures

    state.players.forEach(function (pl) {
      if (pl === piece.owner) return;
      var enemies = playerPieces(pl);
      enemies.forEach(function (ep) {
        if (ep.state !== 'board') return;
        var epos = piecePos(ep);
        if (!epos) return;
        if (epos[0] === r && epos[1] === c) {
          // Check if enemy has blockade (2+ pieces here)
          var sameSquare = enemies.filter(function (e2) {
            if (e2.state !== 'board') return false;
            var p2 = piecePos(e2);
            return p2 && p2[0] === r && p2[1] === c;
          });
          if (sameSquare.length >= 2) return; // blockade — can't capture
          // Capture
          ep.state = 'yard';
          ep.pathIndex = -1;
        }
      });
    });
  }

  // Check win condition
  function checkWin() {
    if (state.mode === '2player') {
      var players2 = ['yellow', 'red'];
      for (var i = 0; i < players2.length; i++) {
        var pl = players2[i];
        var pieces = playerPieces(pl);
        if (pieces.every(function (p) { return p.state === 'home'; })) {
          return pl;
        }
      }
      return null;
    }
    // 4-player team win
    var teams = { A: ['yellow', 'black'], B: ['red', 'green'] };
    var teamNames = ['A', 'B'];
    for (var ti = 0; ti < teamNames.length; ti++) {
      var team = teams[teamNames[ti]];
      var teamWon = team.every(function (pl) {
        var ps = playerPieces(pl);
        return ps.every(function (p) { return p.state === 'home'; });
      });
      if (teamWon) return 'Team ' + teamNames[ti];
    }
    return null;
  }

  // Advance to next player
  function nextPlayer() {
    var players = state.players;
    var idx = players.indexOf(state.currentPlayer);
    state.currentPlayer = players[(idx + 1) % players.length];
    state.rollResult = null;
    state.rollUsed = false;
    state.bonusRoll = false;
  }

  // ── AI ────────────────────────────────────────────────────────────────────

  // Seat-index for each player colour (used in room-mode AI lookup)
  var PLAYER_SEAT = { yellow: 0, red: 1, green: 2, black: 3 };

  function isAIPlayer(player) {
    // Room mode: AI controls seats listed in state.aiSeats
    if (state && state.aiSeats && state.aiSeats.length) {
      return state.aiSeats.indexOf(PLAYER_SEAT[player]) >= 0;
    }
    // Local mode
    if (!state || !state.vsAI) return false;
    if (state.mode === '2player') return player === 'red';
    return player === 'red' || player === 'green';
  }

  // True when it is the local player's turn to interact (blocks other humans' seats in room mode)
  function isMyTurn() {
    if (!state || state.gameOver) return false;
    if (isAIPlayer(state.currentPlayer)) return false;
    // Room mode: only interact on your own seat
    if (state.humanSeat !== undefined && state.humanSeat >= 0) {
      return PLAYER_SEAT[state.currentPlayer] === state.humanSeat;
    }
    return true;
  }

  function aiChoosePiece(player, roll) {
    var valid = validMoves(player, roll);
    if (!valid.length) return null;

    // Priority 1: capture an enemy
    var capture = valid.filter(function (piece) {
      var testPiece = { owner: piece.owner, pathIndex: piece.pathIndex, state: piece.state, id: piece.id };
      var newIdx = testPiece.state === 'yard' ? 0 : testPiece.pathIndex + roll;
      if (newIdx >= PATH_LENGTH) return false;
      var pos = PATHS[piece.owner][newIdx];
      if (!pos) return false;
      if (isCastle(pos[0], pos[1])) return false;
      var wouldCapture = false;
      state.players.forEach(function (pl) {
        if (pl === player) return;
        playerPieces(pl).forEach(function (ep) {
          if (ep.state !== 'board') return;
          var epos = piecePos(ep);
          if (epos && epos[0] === pos[0] && epos[1] === pos[1]) {
            wouldCapture = true;
          }
        });
      });
      return wouldCapture;
    });
    if (capture.length) return capture[0];

    // Priority 2: enter board
    var entering = valid.filter(function (p) { return p.state === 'yard'; });
    if (entering.length) return entering[0];

    // Priority 3: advance furthest piece
    var boardPieces = valid.filter(function (p) { return p.state === 'board'; });
    if (boardPieces.length) {
      boardPieces.sort(function (a, b) { return b.pathIndex - a.pathIndex; });
      return boardPieces[0];
    }

    return valid[0];
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  // Draw a piece shape (dome/cone with halo for contrast)
  function drawPiece(x, y, color, stroke, size) {
    size = size || 1;
    var r = CELL * 0.26 * size;
    ctx.save();
    // White halo ring — ensures piece is visible on any background colour
    ctx.beginPath();
    ctx.arc(x, y, r * 1.38, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    // Drop shadow ellipse
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.6, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();
    // Body dome
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r * 0.6);
    ctx.quadraticCurveTo(x, y + r * 1.22, x - r, y + r * 0.6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2 * size;
    ctx.stroke();
    // Bright gloss highlight
    ctx.beginPath();
    ctx.arc(x - r * 0.27, y - r * 0.28, r * 0.33, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.restore();
  }

  // Draw a star polygon at (cx, cy)
  function drawStar(scx, scy, points, outerR, innerR, color) {
    ctx.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var sr = i % 2 === 0 ? outerR : innerR;
      var sa = (i * Math.PI / points) - Math.PI / 2;
      if (i === 0) ctx.moveTo(scx + sr * Math.cos(sa), scy + sr * Math.sin(sa));
      else         ctx.lineTo(scx + sr * Math.cos(sa), scy + sr * Math.sin(sa));
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Yard spot pixel positions for a given player (fractional cell coords within 3×3 yard)
  var YARD_SPOT_OFFSETS = [[0.82, 0.82],[2.18, 0.82],[0.82, 2.18],[2.18, 2.18]]; // [col,row] offsets

  function yardSpotPx(player, spotIdx) {
    var yc = YARD_CORNERS[player]; // [baseRow, baseCol]
    var off = YARD_SPOT_OFFSETS[spotIdx];
    return { x: (yc[1] + off[0]) * CELL, y: (yc[0] + off[1]) * CELL };
  }

  function drawBoard() {
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    var BC = BOARD_COLORS;

    // ── Board background: cream ───────────────────────────────────────────────
    ctx.fillStyle = '#F0EAD6';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // ── Yard corners: solid player color, white inner area, 4 colored spots ──
    var yardDefs = [
      { player: 'yellow', row: 6, col: 0, color: BC.yellow },
      { player: 'red',    row: 0, col: 0, color: BC.red    },
      { player: 'green',  row: 0, col: 6, color: BC.green  },
      { player: 'black',  row: 6, col: 6, color: BC.black  },
    ];
    yardDefs.forEach(function (yd) {
      var x0 = yd.col * CELL, y0 = yd.row * CELL;
      var w  = 3 * CELL,      h  = 3 * CELL;

      // Solid colored fill
      ctx.fillStyle = yd.color;
      ctx.fillRect(x0, y0, w, h);

      // White inner rounded rectangle
      var ip = CELL * 0.18;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.roundRect(x0 + ip, y0 + ip, w - ip * 2, h - ip * 2, CELL * 0.18);
      ctx.fill();

      // 4 colored circle spots
      var spotR = CELL * 0.35;
      YARD_SPOT_OFFSETS.forEach(function (off, si) {
        var sx = x0 + off[0] * CELL;
        var sy = y0 + off[1] * CELL;
        ctx.beginPath();
        ctx.arc(sx, sy, spotR, 0, Math.PI * 2);
        ctx.fillStyle = yd.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Border outline
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
    });

    // ── Arm & cross cells ─────────────────────────────────────────────────────
    // Home column mapping: which cells get player color (the final approach lane)
    var homeCells = {};
    // South (yellow): col 4, rows 6–8
    for (var r2 = 6; r2 <= 8; r2++) homeCells[r2 + ',' + 4] = BC.yellow;
    // North (green): col 4, rows 0–2
    for (var r3 = 0; r3 <= 2; r3++) homeCells[r3 + ',' + 4] = BC.green;
    // West (red): row 4, cols 0–2
    for (var c2 = 0; c2 <= 2; c2++) homeCells['4,' + c2] = BC.red;
    // East (black): row 4, cols 6–8
    for (var c3 = 6; c3 <= 8; c3++) homeCells['4,' + c3] = BC.black;

    for (var r = 0; r < GRID; r++) {
      for (var c = 0; c < GRID; c++) {
        if (!isCross(r, c)) continue;
        var isCenter = (r >= 3 && r <= 5 && c >= 3 && c <= 5);
        if (isCenter) continue; // drawn separately below

        var cx2 = c * CELL, cy2 = r * CELL;
        var homeColor = homeCells[r + ',' + c];

        if (homeColor) {
          ctx.fillStyle = homeColor;
          ctx.fillRect(cx2, cy2, CELL, CELL);
        } else {
          ctx.fillStyle = '#FAFAF5';
          ctx.fillRect(cx2, cy2, CELL, CELL);

          // Castle squares: gold tint + star
          if (isCastle(r, c)) {
            ctx.fillStyle = 'rgba(255,210,0,0.22)';
            ctx.fillRect(cx2, cy2, CELL, CELL);
          }
        }

        // Castle star marker on all castle squares (including home column ones)
        if (isCastle(r, c)) {
          var starColor = homeColor ? 'rgba(255,255,255,0.7)' : '#C8960C';
          drawStar(cx2 + CELL / 2, cy2 + CELL / 2, 5, CELL * 0.3, CELL * 0.13, starColor);
        }

        // ── Path indicators ───────────────────────────────────────────────
        var midX = cx2 + CELL / 2, midY = cy2 + CELL / 2;
        if (homeColor) {
          // Directional chevron on home-column cells showing final approach
          // yellow home (col 4 rows 6-8): UP; green (col 4 rows 0-2): DOWN
          // red home (row 4 cols 0-2): RIGHT; black (row 4 cols 6-8): LEFT
          var chAngle = 0;
          if (c === 4 && r >= 6) chAngle = -Math.PI / 2;
          else if (c === 4 && r <= 2) chAngle = Math.PI / 2;
          else if (r === 4 && c <= 2) chAngle = 0;
          else if (r === 4 && c >= 6) chAngle = Math.PI;
          var aw = CELL * 0.17;
          ctx.save();
          ctx.translate(midX, midY);
          ctx.rotate(chAngle);
          ctx.beginPath();
          ctx.moveTo(aw, 0);
          ctx.lineTo(-aw * 0.55, -aw * 0.7);
          ctx.lineTo(-aw * 0.55,  aw * 0.7);
          ctx.closePath();
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fill();
          ctx.restore();
        } else if (!isCastle(r, c)) {
          // Small dot marker on regular path cells
          ctx.beginPath();
          ctx.arc(midX, midY, CELL * 0.07, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(80,60,30,0.3)';
          ctx.fill();
        }

        // Grid line
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(cx2 + 0.5, cy2 + 0.5, CELL - 1, CELL - 1);
      }
    }

    // ── Center 3×3: 4-color triangle pinwheel ────────────────────────────────
    var cx0 = 3 * CELL, cy0 = 3 * CELL, cw = 3 * CELL;
    var mid = cx0 + cw / 2, midy = cy0 + cw / 2;

    // 4 triangles meeting at center point
    var tris = [
      { color: BC.yellow, pts: [[cx0, cy0+cw],[cx0+cw, cy0+cw],[mid, midy]] }, // bottom → yellow
      { color: BC.green,  pts: [[cx0, cy0],[cx0+cw, cy0],[mid, midy]] },        // top → green
      { color: BC.red,    pts: [[cx0, cy0],[cx0, cy0+cw],[mid, midy]] },        // left → red
      { color: BC.black,  pts: [[cx0+cw, cy0],[cx0+cw, cy0+cw],[mid, midy]] }, // right → black
    ];
    tris.forEach(function (tri) {
      ctx.beginPath();
      ctx.moveTo(tri.pts[0][0], tri.pts[0][1]);
      ctx.lineTo(tri.pts[1][0], tri.pts[1][1]);
      ctx.lineTo(tri.pts[2][0], tri.pts[2][1]);
      ctx.closePath();
      ctx.fillStyle = tri.color;
      ctx.fill();
    });

    // White circle at center
    ctx.beginPath();
    ctx.arc(mid, midy, CELL * 0.48, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Gold star in center circle
    drawStar(mid, midy, 6, CELL * 0.34, CELL * 0.15, '#DAA520');

    // Center border
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx0, cy0, cw, cw);

    // ── Outer border ──────────────────────────────────────────────────────────
    ctx.strokeStyle = '#2a1805';
    ctx.lineWidth = 5;
    ctx.strokeRect(2.5, 2.5, CANVAS_SIZE - 5, CANVAS_SIZE - 5);
  }

  // Collect all board pieces keyed by "row,col" for stacking
  function getPiecesOnSquares() {
    var map = {};
    state.players.forEach(function (pl) {
      playerPieces(pl).forEach(function (piece) {
        if (piece.state === 'board') {
          var pos = piecePos(piece);
          if (!pos) return;
          var key = pos[0] + ',' + pos[1];
          if (!map[key]) map[key] = [];
          map[key].push(piece);
        }
      });
    });
    return map;
  }

  function drawPieces() {
    if (!state) return;

    // Draw yard pieces — placed on the 4 circular spots
    state.players.forEach(function (pl) {
      var pieces = playerPieces(pl).filter(function (p) { return p.state === 'yard'; });
      pieces.forEach(function (piece, idx) {
        if (idx >= 4) return;
        var sp = yardSpotPx(pl, idx);
        drawPiece(sp.x, sp.y, PIECE_COLORS[pl], PIECE_STROKE[pl], 0.8);
      });
    });

    // Draw board pieces (stacked with offsets)
    var boardMap = getPiecesOnSquares();
    Object.keys(boardMap).forEach(function (key) {
      var pieces = boardMap[key];
      var parts = key.split(',');
      var r = parseInt(parts[0], 10);
      var c = parseInt(parts[1], 10);
      var offsets = [
        [-5, -5], [5, -5], [-5, 5], [5, 5]
      ];
      pieces.forEach(function (piece, idx) {
        var ox = (idx < offsets.length) ? offsets[idx][0] : 0;
        var oy = (idx < offsets.length) ? offsets[idx][1] : 0;
        drawPiece(cx(c) + ox, cy(r) + oy, PIECE_COLORS[piece.owner], PIECE_STROKE[piece.owner]);
      });
    });

    // Draw home pieces at Charkoni center
    var homePieces = [];
    state.players.forEach(function (pl) {
      playerPieces(pl).forEach(function (p) {
        if (p.state === 'home') homePieces.push(p);
      });
    });
    var homeOffsets = [
      [-8, -8], [8, -8], [-8, 8], [8, 8],
      [0, -8],  [0, 8],  [-8, 0], [8, 0]
    ];
    homePieces.forEach(function (piece, idx) {
      var ox = idx < homeOffsets.length ? homeOffsets[idx][0] : 0;
      var oy = idx < homeOffsets.length ? homeOffsets[idx][1] : 0;
      drawPiece(cx(4) + ox, cy(4) + oy, PIECE_COLORS[piece.owner], PIECE_STROKE[piece.owner], 0.6);
    });
  }

  // Highlight valid move targets
  var _highlighted = []; // piece ids for current player

  function drawHighlights() {
    if (!state || state.gameOver || state.rollResult === null || state.rollUsed) return;
    if (!isMyTurn()) return;

    var roll = state.rollResult;
    var valid = validMoves(state.currentPlayer, roll);
    _highlighted = valid.map(function (p) { return p.id; });

    valid.forEach(function (piece) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;

      var hx, hy;
      if (piece.state === 'yard') {
        var yardPcsH = playerPieces(piece.owner).filter(function (p) { return p.state === 'yard'; });
        var idxInYard = yardPcsH.indexOf(piece);
        if (idxInYard >= 0) {
          var sp = yardSpotPx(piece.owner, idxInYard);
          hx = sp.x;
          hy = sp.y;
        }
      } else if (piece.state === 'board') {
        var pos = piecePos(piece);
        if (pos) { hx = cx(pos[1]); hy = cy(pos[0]); }
      }
      if (hx !== undefined) {
        // Pulsing gold ring around the piece
        ctx.beginPath();
        ctx.arc(hx, hy, CELL * 0.38, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#FFD700';
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function redraw() {
    drawBoard();
    if (state) {
      drawPieces();
      drawHighlights();
      drawHoverPreview();
    }
  }

  // ── Cowrie shell display ──────────────────────────────────────────────────

  function renderCowries(shells, animating) {
    var container = document.getElementById('pc-cowries');
    if (!container) return;
    container.innerHTML = '';

    for (var i = 0; i < 6; i++) {
      var cv = document.createElement('canvas');
      cv.width = 32;
      cv.height = 20;
      cv.className = 'pc-cowrie-shell';
      var c2 = cv.getContext('2d');
      var faceUp = animating ? (Math.random() < 0.5) : (shells ? shells[i] : false);

      // Draw cowrie: oval
      c2.beginPath();
      c2.ellipse(16, 10, 14, 8, 0, 0, Math.PI * 2);
      c2.fillStyle = faceUp ? '#F5E6C8' : '#8B6914';
      c2.fill();
      c2.strokeStyle = '#5a3a10';
      c2.lineWidth = 1.5;
      c2.stroke();

      // Slit in center
      c2.beginPath();
      c2.moveTo(4, 10);
      c2.bezierCurveTo(8, faceUp ? 14 : 6, 24, faceUp ? 14 : 6, 28, 10);
      c2.strokeStyle = faceUp ? '#8B6914' : '#F5E6C8';
      c2.lineWidth = 1.5;
      c2.stroke();

      container.appendChild(cv);
    }
  }

  var cowrieAnimTimer = null;

  function animateCowries(finalShells, onDone) {
    var elapsed = 0;
    var interval = 60;
    var duration = 600;

    function tick() {
      renderCowries(null, true);
      elapsed += interval;
      if (elapsed < duration) {
        cowrieAnimTimer = setTimeout(tick, interval);
      } else {
        renderCowries(finalShells, false);
        if (onDone) onDone();
      }
    }
    tick();
  }

  // ── UI updates ────────────────────────────────────────────────────────────

  function setStatus(msg) {
    var el = document.getElementById('pc-status');
    if (el) el.textContent = msg;
  }

  function updateHUD() {
    if (!state) return;
    var el = document.getElementById('pc-move-count');
    if (el) el.textContent = state.moveCount;

    var pl = document.getElementById('pc-player-label');
    if (pl) {
      var name = state.currentPlayer.charAt(0).toUpperCase() + state.currentPlayer.slice(1);
      pl.textContent = name;
      pl.style.color = PIECE_COLORS[state.currentPlayer];
    }

    var rollBtn = document.getElementById('pc-roll-btn');
    if (rollBtn) {
      rollBtn.disabled = !!(
        state.gameOver ||
        !isMyTurn() ||
        (state.rollResult !== null && !state.rollUsed && validMoves(state.currentPlayer, state.rollResult).length > 0)
      );
    }

    updateRollResult();
    updateScores();
    // Broadcast state to other room players (guarded so received updates don't echo back)
    if (!_receivingState) sendRoomState();
  }

  function updateRollResult() {
    var el = document.getElementById('pc-roll-result');
    var numEl = document.getElementById('pc-roll-num');
    var noteEl = document.getElementById('pc-roll-note');
    if (!el) return;

    if (state && state.rollResult !== null) {
      el.hidden = false;
      numEl.textContent = state.rollResult;
      var note = '';
      if (state.rollResult === 25) note = 'Grace! (0 up)';
      else if (state.rollResult === 6) note = 'Bonus roll!';
      noteEl.textContent = note;
    } else {
      el.hidden = true;
    }
  }

  function updateScores() {
    var el = document.getElementById('pc-scores');
    if (!el || !state) return;
    el.innerHTML = state.players.map(function (pl) {
      var home = playerPieces(pl).filter(function (p) { return p.state === 'home'; }).length;
      return '<div class="pc-score-row">' +
        '<span class="pc-score-dot" style="background:' + PIECE_COLORS[pl] + '"></span>' +
        '<span class="pc-score-name">' + pl.charAt(0).toUpperCase() + pl.slice(1) + '</span>' +
        '<span class="pc-score-val">' + home + '/4</span>' +
        '</div>';
    }).join('');
  }

  // ── Hover preview ─────────────────────────────────────────────────────────

  var _hoveredPiece    = null;
  var _receivingState  = false; // prevents echo when applying remote state

  // Find which valid piece (if any) is under canvas pixel (x, y)
  function pieceAtPx(x, y) {
    if (!state || state.gameOver || state.rollResult === null || state.rollUsed) return null;
    if (!isMyTurn()) return null;
    var roll  = state.rollResult;
    var valid = validMoves(state.currentPlayer, roll);
    if (!valid.length) return null;

    // Yard pieces — distance to spot center
    var yardPcs = playerPieces(state.currentPlayer).filter(function (p) { return p.state === 'yard'; });
    for (var i = 0; i < yardPcs.length; i++) {
      var yp = yardPcs[i];
      if (!valid.some(function (v) { return v.id === yp.id; })) continue;
      var sp = yardSpotPx(state.currentPlayer, i);
      var dx = x - sp.x, dy = y - sp.y;
      if (Math.sqrt(dx*dx + dy*dy) < CELL * 0.42) return yp;
    }

    // Board pieces — cell hit test
    var cell = cellFromPx(x, y);
    if (cell) {
      var r = cell[0], c = cell[1];
      for (var vi = 0; vi < valid.length; vi++) {
        var vp = valid[vi];
        if (vp.state !== 'board') continue;
        var pos = piecePos(vp);
        if (pos && pos[0] === r && pos[1] === c) return vp;
      }
    }
    return null;
  }

  function drawHoverPreview() {
    if (!_hoveredPiece || !state || state.rollResult === null) return;
    var roll  = state.rollResult;
    var piece = _hoveredPiece;

    // Compute destination position
    var destPos;
    if (piece.state === 'yard') {
      destPos = PATHS[piece.owner][0];
    } else {
      var newIdx = piece.pathIndex + roll;
      if (newIdx >= PATH_LENGTH) {
        destPos = [4, 4]; // Charkoni home
      } else {
        destPos = PATHS[piece.owner][newIdx];
      }
    }
    if (!destPos) return;

    var dhx = cx(destPos[1]);
    var dhy = cy(destPos[0]);

    // Outer pulsing ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(dhx, dhy, CELL * 0.44, 0, Math.PI * 2);
    ctx.strokeStyle = PIECE_COLORS[piece.owner];
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.85;
    ctx.stroke();

    // Ghost fill
    ctx.beginPath();
    ctx.arc(dhx, dhy, CELL * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = PIECE_COLORS[piece.owner];
    ctx.globalAlpha = 0.22;
    ctx.fill();

    // Ghost piece
    ctx.globalAlpha = 0.5;
    drawPiece(dhx, dhy, PIECE_COLORS[piece.owner], PIECE_STROKE[piece.owner]);
    ctx.restore();
  }

  function handleCanvasMouseMove(e) {
    if (!canvas) return;
    var rect   = canvas.getBoundingClientRect();
    var scaleX = CANVAS_SIZE / rect.width;
    var scaleY = CANVAS_SIZE / rect.height;
    var x = (e.clientX - rect.left) * scaleX;
    var y = (e.clientY - rect.top)  * scaleY;

    var prev = _hoveredPiece;
    _hoveredPiece = pieceAtPx(x, y);
    canvas.style.cursor = _hoveredPiece ? 'pointer' : '';
    if (prev !== _hoveredPiece) redraw();
  }

  function handleCanvasMouseLeave() {
    if (_hoveredPiece) {
      _hoveredPiece = null;
      canvas.style.cursor = '';
      redraw();
    }
  }

  // ── Click handling ────────────────────────────────────────────────────────

  function handleCanvasClick(e) {
    if (!state || state.gameOver) return;
    if (!isMyTurn()) return;
    if (state.rollResult === null || state.rollUsed) return;

    var rect = canvas.getBoundingClientRect();
    var scaleX = CANVAS_SIZE / rect.width;
    var scaleY = CANVAS_SIZE / rect.height;
    var x = (e.clientX - rect.left) * scaleX;
    var y = (e.clientY - rect.top)  * scaleY;

    var clicked = pieceAtPx(x, y);
    if (!clicked) return;

    _hoveredPiece = null; // clear hover on click

    var roll = state.rollResult;
    applyMove(clicked, roll);
    state.moveCount++;
    state.rollUsed = true;

    var win = checkWin();
    if (win) {
      state.gameOver = true;
      state.winner = win;
      setStatus((win.charAt(0).toUpperCase() + win.slice(1)) + ' wins!');
      redraw();
      updateHUD();
      recordSoloResult(win);
      return;
    }

    var isBonus = (roll === 6 || roll === 25);
    if (isBonus) {
      state.bonusRoll = true;
      state.rollResult = null;
      state.rollUsed = false;
      setStatus(state.currentPlayer.charAt(0).toUpperCase() + state.currentPlayer.slice(1) + ' gets a bonus roll!');
    } else {
      nextPlayer();
      setStatus(state.currentPlayer.charAt(0).toUpperCase() + state.currentPlayer.slice(1) + "'s turn — roll the shells.");
      if (isAIPlayer(state.currentPlayer)) {
        triggerAITurn();
      } else {
        checkAutoPass();
      }
    }

    redraw();
    updateHUD();
  }

  // If no valid moves exist after rolling, auto-pass
  function checkAutoPass() {
    if (!state || state.rollResult === null) return;
    var roll = state.rollResult;
    var valid = validMoves(state.currentPlayer, roll);
    if (valid.length === 0) {
      setStatus('No valid moves for ' + state.currentPlayer + ' — auto-passing…');
      var isBonus2 = (roll === 6 || roll === 25);
      setTimeout(function () {
        if (isBonus2) {
          // Even on bonus with no moves, use the extra roll
          state.rollResult = null;
          state.rollUsed = false;
          state.bonusRoll = true;
          if (isAIPlayer(state.currentPlayer)) {
            triggerAITurn();
          } else {
            setStatus(state.currentPlayer.charAt(0).toUpperCase() + state.currentPlayer.slice(1) + ' gets a bonus roll!');
            updateHUD();
          }
        } else {
          nextPlayer();
          setStatus(state.currentPlayer.charAt(0).toUpperCase() + state.currentPlayer.slice(1) + "'s turn — roll the shells.");
          updateHUD();
          if (isAIPlayer(state.currentPlayer)) triggerAITurn();
        }
      }, 1500);
    }
  }

  // ── AI turn ───────────────────────────────────────────────────────────────

  function triggerAITurn() {
    if (!state || !isAIPlayer(state.currentPlayer) || state.gameOver) return;
    setTimeout(function () { doAIRoll(); }, 600);
  }

  function doAIRoll() {
    if (window.CGTutorial && CGTutorial.isActive) return;
    if (!state || !isAIPlayer(state.currentPlayer) || state.gameOver) return;
    var shells = rollCowries(graceBiasFor(state.currentPlayer));
    var roll = shellsToValue(shells);
    state.rollResult = roll;
    state.rollUsed = false;

    animateCowries(shells, function () {
      updateRollResult();
      var valid = validMoves(state.currentPlayer, roll);
      if (!valid.length) {
        setStatus('No valid moves for ' + state.currentPlayer + ' — auto-passing…');
        setTimeout(function () {
          var isBonus3 = (roll === 6 || roll === 25);
          if (isBonus3) {
            state.rollResult = null;
            state.rollUsed = false;
            doAIRoll();
          } else {
            nextPlayer();
            setStatus(state.currentPlayer.charAt(0).toUpperCase() + state.currentPlayer.slice(1) + "'s turn.");
            updateHUD();
            redraw();
            if (isAIPlayer(state.currentPlayer)) triggerAITurn();
          }
        }, 1500);
        return;
      }

      // Choose piece
      var piece = aiChoosePiece(state.currentPlayer, roll);
      if (!piece) {
        nextPlayer();
        updateHUD();
        redraw();
        if (isAIPlayer(state.currentPlayer)) triggerAITurn();
        return;
      }

      setTimeout(function () {
        applyMove(piece, roll);
        state.moveCount++;
        state.rollUsed = true;

        var win = checkWin();
        if (win) {
          state.gameOver = true;
          state.winner = win;
          setStatus((win.charAt(0).toUpperCase() + win.slice(1)) + ' wins!');
          redraw();
          updateHUD();
          recordSoloResult(win);
          return;
        }

        var isBonus4 = (roll === 6 || roll === 25);
        if (isBonus4) {
          state.rollResult = null;
          state.rollUsed = false;
          setStatus(state.currentPlayer + ' gets a bonus roll!');
          redraw();
          updateHUD();
          setTimeout(function () { doAIRoll(); }, 500);
        } else {
          nextPlayer();
          setStatus(state.currentPlayer.charAt(0).toUpperCase() + state.currentPlayer.slice(1) + "'s turn.");
          redraw();
          updateHUD();
          if (isAIPlayer(state.currentPlayer)) triggerAITurn();
        }
      }, 400);
    });
  }

  // ── Roll button handler ───────────────────────────────────────────────────

  function doHumanRoll() {
    if (!state || state.gameOver) return;
    if (!isMyTurn()) return;
    if (state.rollResult !== null && !state.rollUsed) return;

    var rollBtn = document.getElementById('pc-roll-btn');
    if (rollBtn) rollBtn.disabled = true;

    var shells = rollCowries(graceBiasFor(state.currentPlayer));
    var roll = shellsToValue(shells);
    state.rollResult = roll;
    state.rollUsed = false;

    animateCowries(shells, function () {
      updateRollResult();

      var isBonus5 = (roll === 6 || roll === 25);
      var note = isBonus5 ? ' (bonus roll earned!)' : '';
      setStatus(state.currentPlayer.charAt(0).toUpperCase() + state.currentPlayer.slice(1) +
        ' rolled ' + roll + note + ' — pick a piece.');

      var valid = validMoves(state.currentPlayer, roll);
      if (!valid.length) {
        setStatus('Rolled ' + roll + ' — no valid moves. Auto-passing…');
        setTimeout(function () {
          if (isBonus5) {
            state.rollResult = null;
            state.rollUsed = false;
            setStatus(state.currentPlayer + ' gets a bonus roll!');
            updateHUD();
          } else {
            nextPlayer();
            setStatus(state.currentPlayer.charAt(0).toUpperCase() + state.currentPlayer.slice(1) + "'s turn — roll the shells.");
            updateHUD();
            if (isAIPlayer(state.currentPlayer)) triggerAITurn();
          }
        }, 1500);
        redraw();
        return;
      }

      redraw();
      updateHUD();
    });
  }

  // ── Init / new game ───────────────────────────────────────────────────────

  function startGame(mode) {
    var vsAI = true; // always vs AI for local play
    state = freshState(mode, vsAI);

    // Show game, hide lobby (use style.display — CSS display:flex overrides [hidden])
    var lobby = document.getElementById('pc-lobby');
    var game  = document.getElementById('pc-game');
    if (lobby) lobby.style.display = 'none';
    if (game)  game.style.display  = 'flex';

    var teamsPanel = document.getElementById('pc-teams-panel');
    if (teamsPanel) teamsPanel.hidden = (mode !== '4player');

    _hoveredPiece = null;
    renderCowries(null, false);
    setStatus("Yellow's turn — roll the shells.");
    redraw();
    updateHUD();
  }

  function newGame() {
    if (!state) return;
    var mode = state.mode;
    state = freshState(mode, true);
    _hoveredPiece = null;
    renderCowries(null, false);
    setStatus("Yellow's turn — roll the shells.");
    redraw();
    updateHUD();
  }

  // ── Room mode integration ─────────────────────────────────────────────────

  // Send current game state to all other players in the room
  function sendRoomState() {
    if (!RoomBridge || !RoomBridge.isActive()) return;
    RoomBridge.sendState({
      pieces:        state.pieces,
      currentPlayer: state.currentPlayer,
      rollResult:    state.rollResult,
      rollUsed:      state.rollUsed,
      bonusRoll:     state.bonusRoll,
      gameOver:      state.gameOver,
      winner:        state.winner,
      moveCount:     state.moveCount,
      mode:          state.mode,
      players:       state.players,
      teams:         state.teams,
    });
  }

  function initRoomMode() {
    if (!RoomBridge || !RoomBridge.isActive()) return;

    var mode        = RoomBridge.getMode();
    var seat        = RoomBridge.getSeat();
    var aiSeatsList = RoomBridge.getAiSeats();

    if (mode !== '2player' && mode !== '4player') mode = '2player';

    state = freshState(mode, false);
    state.humanSeat = seat;
    state.aiSeats   = aiSeatsList;

    // Skip the pre-game lobby (use style.display — CSS display:flex overrides [hidden])
    var lobbyEl = document.getElementById('pc-lobby');
    var gameEl  = document.getElementById('pc-game');
    if (lobbyEl) lobbyEl.style.display = 'none';
    if (gameEl)  gameEl.style.display  = 'flex';

    var teamsPanel = document.getElementById('pc-teams-panel');
    if (teamsPanel) teamsPanel.style.display = (mode === '4player') ? '' : 'none';

    _hoveredPiece = null;
    renderCowries(null, false);
    setStatus("Yellow's turn — roll the shells.");
    redraw();
    updateHUD();

    // Receive state updates from other players and apply them locally
    RoomBridge.onState(function (blob) {
      if (!blob || !blob.pieces || !state) return;
      var humanSeat = state.humanSeat;
      var aiSeats   = state.aiSeats;

      state.pieces        = blob.pieces;
      state.currentPlayer = blob.currentPlayer;
      state.rollResult    = blob.rollResult;
      state.rollUsed      = blob.rollUsed;
      state.bonusRoll     = blob.bonusRoll;
      state.gameOver      = blob.gameOver;
      state.winner        = blob.winner;
      state.moveCount     = blob.moveCount;
      state.humanSeat     = humanSeat;
      state.aiSeats       = aiSeats;

      _hoveredPiece   = null;
      _receivingState = true;
      renderCowries(null, false);
      redraw();
      updateHUD();
      _receivingState = false;

      if (state.gameOver) {
        setStatus((state.winner.charAt(0).toUpperCase() + state.winner.slice(1)) + ' wins!');
      } else {
        var capName = state.currentPlayer.charAt(0).toUpperCase() + state.currentPlayer.slice(1);
        if (state.rollResult !== null && !state.rollUsed) {
          setStatus(capName + ' rolled ' + state.rollResult + ' — pick a piece.');
        } else {
          setStatus(capName + "'s turn — roll the shells.");
        }
      }
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  function init() {
    canvas = document.getElementById('pc-board');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    recalcSize();
    redraw();

    // Lobby buttons
    var btn2 = document.getElementById('pc-btn-2p');
    var btn4 = document.getElementById('pc-btn-4p');
    if (btn2) btn2.addEventListener('click', function () { startGame('2player'); });
    if (btn4) btn4.addEventListener('click', function () { startGame('4player'); });

    // Roll button
    var rollBtn = document.getElementById('pc-roll-btn');
    if (rollBtn) rollBtn.addEventListener('click', doHumanRoll);

    // New game button
    var newBtn = document.getElementById('pc-new-btn');
    if (newBtn) newBtn.addEventListener('click', newGame);

    // Canvas interaction
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseleave', handleCanvasMouseLeave);

    // Resize
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        recalcSize();
        redraw();
      }, 150);
    });

    // Room mode
    if (typeof RoomBridge !== 'undefined' && RoomBridge.isActive()) {
      initRoomMode();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Tutorial steps ──────────────────────────────────────────────────────
  if (window.CGTutorial) {
    CGTutorial.register('pachisi', [
      {
        target: '#pc-board',
        title: 'The Board',
        body: 'This is the Pachisi cross — four arms meeting at a center square. Each player\'s pieces travel around the board and race to reach the center.',
        position: 'right',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#pc-board',
        title: 'Your Pieces',
        body: 'Your pieces start in your home yard (the corner of your arm). Move all of them to the center square to win.',
        position: 'right',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#pc-cowries',
        title: 'Cowrie Shells',
        body: 'Instead of dice, Pachisi uses cowrie shells. The number of shells landing mouth-up determines your move.',
        position: 'left',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#pc-roll-btn',
        title: 'Roll the Shells',
        body: 'Click "Roll Shells" on your turn to cast the cowries and see how many squares you can move.',
        position: 'left',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#pc-board',
        title: 'Castle Squares',
        body: 'Marked squares on the board are Castles — safe zones where your pieces cannot be captured.',
        position: 'right',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#pc-board',
        title: 'Capturing',
        body: 'Land on an opponent\'s piece (outside a Castle) to send it back to their home yard.',
        position: 'right',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#pc-status',
        title: 'Turn & Status',
        body: 'The status bar shows whose turn it is and what just happened.',
        position: 'left',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
      {
        target: '#pc-new-btn',
        title: 'New Game',
        body: 'Click here to start a fresh game and choose 2-player or 4-player mode.',
        position: 'left',
        highlight: true,
        beforeStep: null, afterStep: null,
      },
    ]);
    CGTutorial.initTrigger('pachisi');
  }

  // ── Fullscreen resize hooks ────────────────────────────────────────────────
  if (window.FSMode) {
    FSMode.onEnter = function () { _fsResize(); };
    FSMode.onExit  = function () { _fsResize(); };
  }

  function _fsResize() {
    setTimeout(function () {
      if (typeof redraw === 'function') redraw();
    }, 50);
  }

  window.GameResize = function (availW, availH) {
    if (!canvas) return;
    var avail = Math.min(availW, availH);
    CELL = Math.floor(avail / GRID);
    if (CELL < 40) CELL = 40;
    CANVAS_SIZE = CELL * GRID;
    canvas.width  = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    redraw();
  };

}());
