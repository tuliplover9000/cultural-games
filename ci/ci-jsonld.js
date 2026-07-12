// CI: every <script type="application/ld+json"> block on every HTML page must
// be valid JSON. Exits 1 on any parse error (broken structured data silently
// kills rich results).
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');

var pages = [];
function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return;
    var p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    if (e.name.endsWith('.html')) pages.push(p);
  });
}
walk(ROOT);

var blocks = 0, bad = 0;
pages.forEach(function (f) {
  var html = fs.readFileSync(f, 'utf8');
  var re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, m;
  while ((m = re.exec(html))) {
    blocks++;
    try { JSON.parse(m[1]); } catch (e) {
      bad++;
      console.error('JSON-LD FAIL: ' + path.relative(ROOT, f) + ' — ' + e.message);
    }
  }
});
console.log('json-ld: ' + (blocks - bad) + '/' + blocks + ' blocks valid across ' + pages.length + ' pages');
process.exit(bad ? 1 : 0);
