/**
 * consent-mode-ga.js — one-shot migration (run once, like add-ga.js).
 *
 * Upgrades the inline Google Analytics snippet in every HTML page to Google
 * Consent Mode v2: analytics/ad storage DEFAULT to 'denied' before gtag config
 * runs, and are only granted when the visitor has explicitly opted in (stored
 * by shared/cookie-consent.js under 'cg_analytics_consent'). This makes the
 * cookie banner an actual consent gate (GDPR/ePrivacy) instead of a notice.
 *
 * Idempotent: skips files already migrated. Usage: node consent-mode-ga.js
 */
const fs = require('fs');
const path = require('path');

const OLD = "function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-VWXNSYLPZE');";

const NEW = "function gtag(){dataLayer.push(arguments);}gtag('js',new Date());"
  + "gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied'});"
  + "try{if(localStorage.getItem('cg_analytics_consent')==='granted'){gtag('consent','update',{analytics_storage:'granted'});}}catch(e){}"
  + "gtag('config','G-VWXNSYLPZE');";

var ROOT = __dirname;
var SKIP = /(^|[\\/])(graphify-out|node_modules|\.git)([\\/]|$)/;
var changed = 0, already = 0, scanned = 0;

function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var full = path.join(dir, e.name);
    if (SKIP.test(full)) return;
    if (e.isDirectory()) return walk(full);
    if (!e.name.endsWith('.html')) return;
    scanned++;
    var html = fs.readFileSync(full, 'utf8');
    if (html.indexOf("gtag('consent','default'") !== -1) { already++; return; }
    if (html.indexOf(OLD) === -1) return;
    fs.writeFileSync(full, html.split(OLD).join(NEW));
    changed++;
    console.log('migrated:', path.relative(ROOT, full));
  });
}

walk(ROOT);
console.log('\nscanned ' + scanned + ' html, migrated ' + changed + ', already-done ' + already);
