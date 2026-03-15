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
    yellow: '#F4C430',
    red:    '#C0392B',
    green:  '#2E7D32',
    black:  '#2C2C2C'
  };

  var PIECE_STROKE = {
    yellow: '#8B6914',
    red:    '#7a1010',
    green:  '#1a4a1a',
    black:  '#111'
  };

  var ARM_COLORS = {
    south: '#E8A020',
    north: '#C0392B',
    west:  '#2E7D32',
    east:  '#2C2C2C'
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

  function isAIPlayer(player) {
    if (!state.vsAI) return false;
    if (state.mode === '2player') return player === 'red';
    return player === 'red' || player === 'green';
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

  // Draw a piece shape (stylised dome/cone)
  function drawPiece(x, y, color, stroke, size) {
    size = size || 1;
    var r = CELL * 0.22 * size;
    ctx.save();
    // Base ellipse
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.5, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = stroke;
    ctx.fill();
    // Body dome
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r * 0.6);
    ctx.quadraticCurveTo(x, y + r * 1.2, x - r, y + r * 0.6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5 * size;
    ctx.stroke();
    // Highlight
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
    ctx.restore();
  }

  function drawBoard() {
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // ── Outer border (carved wood frame) ─────────────────────────────────────
    ctx.fillStyle = '#2a1805';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Warm inner frame
    var PAD = 4;
    ctx.fillStyle = '#5a3315';
    ctx.fillRect(PAD, PAD, CANVAS_SIZE - PAD * 2, CANVAS_SIZE - PAD * 2);

    // ── Yard corners: colored home areas ─────────────────────────────────────
    var yardDefs = [
      { player: 'yellow', rows: [6,7,8], cols: [0,1,2], color: '#c8860a', light: '#f5d080' },
      { player: 'red',    rows: [0,1,2], cols: [0,1,2], color: '#8b1a1a', light: '#e88080' },
      { player: 'green',  rows: [0,1,2], cols: [6,7,8], color: '#1a5c1a', light: '#80d080' },
      { player: 'black',  rows: [6,7,8], cols: [6,7,8], color: '#222228', light: '#888898' },
    ];
    yardDefs.forEach(function (yd) {
      // Yard background
      var x0 = yd.cols[0] * CELL + PAD, y0 = yd.rows[0] * CELL + PAD;
      var yw = yd.cols.length * CELL - PAD * 2, yh = yd.rows.length * CELL - PAD * 2;
      var grad = ctx.createLinearGradient(x0, y0, x0 + yw, y0 + yh);
      grad.addColorStop(0, yd.color);
      grad.addColorStop(1, yd.light);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x0, y0, yw, yh, 6);
      ctx.fill();
      // Decorative inner border
      ctx.strokeStyle = 'rgba(255,220,100,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x0 + 4, y0 + 4, yw - 8, yh - 8, 4);
      ctx.stroke();
      // Yard label
      ctx.save();
      ctx.font = 'bold ' + Math.round(CELL * 0.22) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(yd.player.toUpperCase(), x0 + yw / 2, y0 + 5);
      ctx.restore();
    });

    // ── Cross cells ──────────────────────────────────────────────────────────
    var ARM_BG = {
      south: { base: '#d4860e', stripe: '#c07a0a' },
      north: { base: '#a81818', stripe: '#901010' },
      west:  { base: '#1c6b1c', stripe: '#155815' },
      east:  { base: '#252525', stripe: '#1a1a1a' },
    };

    for (var r = 0; r < GRID; r++) {
      for (var c = 0; c < GRID; c++) {
        if (!isCross(r, c)) continue;

        var x = c * CELL;
        var y = r * CELL;
        var isCenter = (r >= 3 && r <= 5 && c >= 3 && c <= 5);

        // Base arm color
        var armKey = null;
        if (r >= 6 && c >= 3 && c <= 5) armKey = 'south';
        else if (r <= 2 && c >= 3 && c <= 5) armKey = 'north';
        else if (c <= 2 && r >= 3 && r <= 5) armKey = 'west';
        else if (c >= 6 && r >= 3 && r <= 5) armKey = 'east';

        if (isCenter) {
          // Charkoni: ivory with gold vein
          ctx.fillStyle = (r + c) % 2 === 0 ? '#EDE0C4' : '#E0D0A8';
          ctx.fillRect(x, y, CELL, CELL);
        } else if (armKey) {
          var arm = ARM_BG[armKey];
          ctx.fillStyle = arm.base;
          ctx.fillRect(x, y, CELL, CELL);
          // Alternating stripe for texture
          if ((r + c) % 2 === 0) {
            ctx.fillStyle = arm.stripe;
            ctx.fillRect(x, y, CELL, CELL);
          }
        }

        // Castle square: gold star marker
        if (isCastle(r, c)) {
          ctx.fillStyle = isCenter ? '#c8960c' : 'rgba(255,220,80,0.18)';
          ctx.fillRect(x, y, CELL, CELL);
          // Cross marker
          ctx.strokeStyle = '#C8960C';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + CELL * 0.5, y + CELL * 0.18);
          ctx.lineTo(x + CELL * 0.5, y + CELL * 0.82);
          ctx.moveTo(x + CELL * 0.18, y + CELL * 0.5);
          ctx.lineTo(x + CELL * 0.82, y + CELL * 0.5);
          ctx.stroke();
          // Circle around cross
          ctx.beginPath();
          ctx.arc(x + CELL * 0.5, y + CELL * 0.5, CELL * 0.3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(200,150,12,0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Cell border
        ctx.strokeStyle = isCenter ? 'rgba(180,140,20,0.5)' : 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      }
    }

    // ── Charkoni center: lotus / star motif ───────────────────────────────────
    var ccx = cx(4), ccy = cy(4);
    var cr = CELL * 1.3; // outer radius covering the 3×3 center

    // Deep purple overlay for full center block
    ctx.fillStyle = 'rgba(60,10,100,0.82)';
    ctx.fillRect(3 * CELL, 3 * CELL, 3 * CELL, 3 * CELL);

    // Gold border ring around center
    ctx.strokeStyle = '#C8960C';
    ctx.lineWidth = 3;
    ctx.strokeRect(3 * CELL + 3, 3 * CELL + 3, 3 * CELL - 6, 3 * CELL - 6);

    // Inner lotus petals
    ctx.save();
    ctx.translate(ccx, ccy);
    for (var petal = 0; petal < 8; petal++) {
      ctx.save();
      ctx.rotate(petal * Math.PI / 4);
      ctx.fillStyle = petal % 2 === 0 ? 'rgba(200,150,12,0.55)' : 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(0, -CELL * 0.55, CELL * 0.18, CELL * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Center circle
    ctx.beginPath();
    ctx.arc(0, 0, CELL * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = '#C8960C';
    ctx.fill();
    ctx.restore();

    // HOME label
    ctx.save();
    ctx.font = 'bold ' + Math.round(CELL * 0.2) + 'px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,220,80,0.7)';
    ctx.fillText('HOME', ccx, ccy + CELL * 1.25);
    ctx.restore();

    // ── Arm separator lines ───────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    // South arm top edge
    ctx.beginPath(); ctx.moveTo(3*CELL,6*CELL); ctx.lineTo(6*CELL,6*CELL); ctx.stroke();
    // North arm bottom edge
    ctx.beginPath(); ctx.moveTo(3*CELL,3*CELL); ctx.lineTo(6*CELL,3*CELL); ctx.stroke();
    // West arm right edge
    ctx.beginPath(); ctx.moveTo(3*CELL,3*CELL); ctx.lineTo(3*CELL,6*CELL); ctx.stroke();
    // East arm left edge
    ctx.beginPath(); ctx.moveTo(6*CELL,3*CELL); ctx.lineTo(6*CELL,6*CELL); ctx.stroke();
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

    // Draw yard pieces
    state.players.forEach(function (pl) {
      var yc = YARD_CORNERS[pl];
      var pieces = playerPieces(pl).filter(function (p) { return p.state === 'yard'; });
      var positions = [
        [yc[0],   yc[1]  ],
        [yc[0],   yc[1]+1],
        [yc[0]+1, yc[1]  ],
        [yc[0]+1, yc[1]+1]
      ];
      pieces.forEach(function (piece, idx) {
        if (idx >= 4) return;
        var pr = positions[idx][0];
        var pc2 = positions[idx][1];
        drawPiece(cx(pc2), cy(pr), PIECE_COLORS[pl], PIECE_STROKE[pl], 0.75);
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
    if (isAIPlayer(state.currentPlayer)) return;

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
        var yc = YARD_CORNERS[piece.owner];
        var yardPcsH = playerPieces(piece.owner).filter(function (p) { return p.state === 'yard'; });
        var idxInYard = yardPcsH.indexOf(piece);
        var positions = [
          [yc[0],   yc[1]  ],
          [yc[0],   yc[1]+1],
          [yc[0]+1, yc[1]  ],
          [yc[0]+1, yc[1]+1]
        ];
        if (idxInYard < positions.length) {
          hx = cx(positions[idxInYard][1]);
          hy = cy(positions[idxInYard][0]);
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
        isAIPlayer(state.currentPlayer) ||
        (state.rollResult !== null && !state.rollUsed && validMoves(state.currentPlayer, state.rollResult).length > 0)
      );
    }

    updateRollResult();
    updateScores();
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

  // ── Click handling ────────────────────────────────────────────────────────

  function handleCanvasClick(e) {
    if (!state || state.gameOver) return;
    if (isAIPlayer(state.currentPlayer)) return;
    if (state.rollResult === null || state.rollUsed) return;

    var rect = canvas.getBoundingClientRect();
    var scaleX = CANVAS_SIZE / rect.width;
    var scaleY = CANVAS_SIZE / rect.height;
    var x = (e.clientX - rect.left) * scaleX;
    var y = (e.clientY - rect.top)  * scaleY;

    var roll = state.rollResult;
    var valid = validMoves(state.currentPlayer, roll);
    if (!valid.length) return;

    var clicked = null;

    // Check if clicked on a yard piece
    var yc = YARD_CORNERS[state.currentPlayer];
    var yardPieces = playerPieces(state.currentPlayer).filter(function (p) { return p.state === 'yard'; });
    var yardPositions = [
      [yc[0],   yc[1]  ],
      [yc[0],   yc[1]+1],
      [yc[0]+1, yc[1]  ],
      [yc[0]+1, yc[1]+1]
    ];
    yardPieces.forEach(function (piece, idx) {
      if (clicked) return;
      if (!valid.some(function (v) { return v.id === piece.id; })) return;
      if (idx >= yardPositions.length) return;
      var pr = yardPositions[idx][0];
      var pc2 = yardPositions[idx][1];
      if (x >= pc2 * CELL && x < (pc2 + 1) * CELL && y >= pr * CELL && y < (pr + 1) * CELL) {
        clicked = piece;
      }
    });

    // Check if clicked on a board piece
    if (!clicked) {
      var cell = cellFromPx(x, y);
      if (cell) {
        var r = cell[0], c = cell[1];
        valid.forEach(function (piece) {
          if (clicked) return;
          if (piece.state !== 'board') return;
          var pos = piecePos(piece);
          if (pos && pos[0] === r && pos[1] === c) {
            clicked = piece;
          }
        });
      }
    }

    if (!clicked) return;

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
      checkAutoPass();
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
    if (isAIPlayer(state.currentPlayer)) return;
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

    // Show game, hide lobby
    var lobby = document.getElementById('pc-lobby');
    var game  = document.getElementById('pc-game');
    if (lobby) lobby.hidden = true;
    if (game)  game.hidden  = false;

    var teamsPanel = document.getElementById('pc-teams-panel');
    if (teamsPanel) teamsPanel.hidden = (mode !== '4player');

    renderCowries(null, false);
    setStatus("Yellow's turn — roll the shells.");
    redraw();
    updateHUD();
  }

  function newGame() {
    if (!state) return;
    var mode = state.mode;
    state = freshState(mode, true);
    renderCowries(null, false);
    setStatus("Yellow's turn — roll the shells.");
    redraw();
    updateHUD();
  }

  // ── Room mode integration ─────────────────────────────────────────────────

  function initRoomMode() {
    // Minimal integration for game-bridge.js
    if (typeof RoomBridge === 'undefined' || !RoomBridge.isActive()) return;
    // Room mode would sync state here
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

    // Canvas click
    canvas.addEventListener('click', handleCanvasClick);

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

}());
