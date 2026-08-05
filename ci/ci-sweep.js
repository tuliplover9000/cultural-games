// CI: UI-regression sweep for the museum pass + shared-module wiring.
// Committed version of the games-UI exit sweep. Exits 1 on any finding.
//
// Checks:
//  1. No UI-chrome emoji in game JS (whitelist: card suits, canvas star, inline
//     move/score dingbats; guarded Icon.svg fallbacks on the same/previous line OK).
//  2. No dead fonts (Playfair/Outfit) in canvas ctx.font.
//  3. No mojibake (euro-sign fragments) in game CSS.
//  4. No unguarded native confirm()/alert() in game JS (fallback branches,
//     CGDialog wrappers, and tien-len room alerts are allowed).
//  5. Any page whose JS uses window.Icon (or loads game-over.js) loads
//     shared/icons.js BEFORE that consumer.
//  6. Every game page includes shared/play-count.js and shared/error-beacon.js.
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(f) { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } }

var problems = [];
var gameJs = fs.readdirSync(path.join(ROOT, 'js/games')).filter(function (f) { return f.endsWith('.js'); })
  .map(function (f) { return 'js/games/' + f; })
  .concat(['cachos/cachos.js', 'filipino-dama/filipino-dama.js', 'xinjiang-fangqi/xinjiang-fangqi.js']);
var gamePages = fs.readdirSync(path.join(ROOT, 'pages/games')).filter(function (f) { return f.endsWith('.html'); })
  .map(function (f) { return 'pages/games/' + f; });
var standalonePages = ['cachos/index.html', 'filipino-dama/index.html', 'xinjiang-fangqi/index.html'];
var gameCss = ['css/games.css', 'cachos/cachos.css', 'filipino-dama/filipino-dama.css', 'xinjiang-fangqi/xinjiang-fangqi.css'];

// 1. emoji sweep
var EXEMPT = { '♠': 1, '♣': 1, '♥': 1, '♦': 1, '✓': 1, '✗': 1, '✦': 1, '⚡': 1, '★': 1, '☆': 1 };
var FALLBACK_OK = { '🏆': 1, '🤝': 1, '🃏': 1, '💰': 1 };
var GUARD = /hasIcon|window\.Icon|Icon\.svg|Icon\.has/;
var emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;
gameJs.forEach(function (f) {
  var lines = read(f).split(/\r?\n/);
  lines.forEach(function (l, i) {
    var hits = l.match(emojiRe);
    if (!hits) return;
    hits.forEach(function (ch) {
      if (EXEMPT[ch]) return;
      if (FALLBACK_OK[ch] && (GUARD.test(l) || GUARD.test(lines[i - 1] || ''))) return;
      problems.push('EMOJI ' + f + ':' + (i + 1) + ' [' + ch + '] ' + l.trim().slice(0, 60));
    });
  });
});

// 2. dead fonts in canvas
gameJs.forEach(function (f) {
  var m = read(f).match(/ctx\.font\s*=\s*[^;]*?(Playfair|Outfit)[^;]*/gi);
  if (m) problems.push('DEAD FONT ' + f + ': ' + m[0].slice(0, 60));
});

// 3. mojibake in css
gameCss.forEach(function (f) {
  var n = (read(f).match(/€/g) || []).length;
  if (n) problems.push('MOJIBAKE ' + f + ': ' + n + ' euro fragments');
});

// 4. unguarded native dialogs
gameJs.forEach(function (f) {
  read(f).split(/\r?\n/).forEach(function (l, i) {
    if (/\b(confirm|alert)\s*\(/.test(l) && !/window\.(confirm|alert)/.test(l)) {
      var allowed = /else if \(confirm/.test(l) || /CGDialog/.test(l) || /tien-len/.test(f);
      if (!allowed) problems.push('NATIVE DIALOG ' + f + ':' + (i + 1) + ' ' + l.trim().slice(0, 50));
    }
  });
});

// 5. icons.js ordering for every Icon consumer (game JS or game-over.js)
gamePages.forEach(function (p) {
  var html = read(p);
  var name = path.basename(p, '.html');
  var js = read('js/games/' + name + '.js');
  var consumes = /window\.Icon|Icon\.svg/.test(js) || html.indexOf('shared/game-over.js') > -1;
  if (!consumes) return;
  var iIcons = html.indexOf('shared/icons.js');
  var iGame = html.indexOf('games/' + name + '.js');
  var iGO = html.indexOf('shared/game-over.js');
  if (iIcons < 0) problems.push('ICONS MISSING ' + p + ' (uses Icon or CGEndPlaque)');
  else {
    if (iGame > -1 && iIcons > iGame) problems.push('ICONS AFTER game js: ' + p);
    if (iGO > -1 && iIcons > iGO) problems.push('ICONS AFTER game-over.js: ' + p);
  }
});
standalonePages.forEach(function (p) {
  var dir = p.split('/')[0];
  if (!/window\.Icon|Icon\.svg/.test(read(dir + '/' + dir + '.js'))) return;
  if (read(p).indexOf('icons.js') < 0) problems.push('ICONS MISSING ' + p);
});

// 6. shared-module wiring on every game page
gamePages.concat(standalonePages).forEach(function (p) {
  var html = read(p);
  ['shared/play-count.js', 'shared/error-beacon.js'].forEach(function (mod) {
    if (html.indexOf(mod) < 0) problems.push('MODULE MISSING ' + mod + ' on ' + p);
  });
});

// 7. Calls into shared modules must MATCH THE MODULE'S ACTUAL EXPORTS.
//    cuarenta/durak/scopa/yut-nori shipped calls to Achievements.track /
//    .increment / .trigger — none of which exist — so they threw at runtime and
//    three games could never record a finish. It lived in prod for weeks because
//    nothing checks that a call site resolves to a real function.
function exportsOf(file, globalName) {
  var src = read(file);
  var m = src.match(new RegExp('window\\.' + globalName + '\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};'));
  if (!m) return null;
  var names = [];
  m[1].replace(/(^|\n)\s*([A-Za-z_$][\w$]*)\s*:/g, function (_, __, n) { names.push(n); return ''; });
  return names;
}
[['shared/achievements.js', 'Achievements'], ['js/utils/auth.js', 'Auth']].forEach(function (mod) {
  var api = exportsOf(mod[0], mod[1]);
  if (!api) { problems.push('CI: could not parse exports of ' + mod[1]); return; }
  gameJs.forEach(function (f) {
    var src = read(f);
    var re = new RegExp('\\b' + mod[1] + '\\.([A-Za-z_$][\\w$]*)\\s*\\(', 'g'), m2;
    while ((m2 = re.exec(src))) {
      if (api.indexOf(m2[1]) < 0) {
        problems.push('UNDEFINED API ' + f + ': ' + mod[1] + '.' + m2[1] + '() is not exported by ' + mod[0]);
      }
    }
  });
});

// 8. Every game must be able to RECORD a finish, or it is invisible in the data.
gameJs.forEach(function (f) {
  var src = read(f);
  // Must be a real CALL — matching the bare word would let a code comment
  // mentioning recordResult satisfy the check.
  if (!/\.recordResult\s*\(/.test(src)) {
    problems.push('NO recordResult: ' + f + ' can never record a completed game');
  }
});

var units = gameJs.length + gamePages.length + standalonePages.length + gameCss.length;
if (problems.length === 0) {
  console.log('sweep: CLEAN across ' + units + ' files (' + gameJs.length + ' JS, ' +
    (gamePages.length + standalonePages.length) + ' pages, ' + gameCss.length + ' css)');
  process.exit(0);
}
problems.forEach(function (p) { console.error('  ! ' + p); });
console.error('sweep: ' + problems.length + ' problems');
process.exit(1);
