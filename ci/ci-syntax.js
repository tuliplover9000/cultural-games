// CI: node --check every first-party JS file. Exits 1 on any syntax error.
var { execFileSync } = require('child_process');
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

var files = [];
function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    if (e.name.endsWith('.js')) files.push(p);
  });
}
['js', 'shared', 'cachos', 'filipino-dama', 'xinjiang-fangqi'].forEach(function (d) {
  var p = path.join(ROOT, d);
  if (fs.existsSync(p)) walk(p);
});

var bad = 0;
files.forEach(function (f) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    bad++;
    console.error('SYNTAX FAIL: ' + path.relative(ROOT, f) + '\n' + (e.stderr || '').toString().slice(0, 500));
  }
});
console.log('syntax: ' + (files.length - bad) + '/' + files.length + ' JS files pass');
process.exit(bad ? 1 : 0);
