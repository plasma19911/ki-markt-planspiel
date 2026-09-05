import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/data-kraken-ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/data-kraken.css',import.meta.url),'utf8');
const changelog=readFileSync(new URL('../public/changelog-current-v31712.js',import.meta.url),'utf8');

assert.match(index,/id="dataFlow"/,'dashboard must contain the central data-flow section');
assert.match(index,/id="krakenCore"/,'depot core must be present');
assert.match(index,/data-kraken-source="pc"/,'PC scanner must be shown as an input');
assert.match(index,/data-kraken-source="news"/,'news must be shown as an input');
assert.match(index,/data-kraken-ui\.js/,'living UI module must be loaded');
assert.match(index,/data-kraken\.css/,'living UI styles must be loaded');

assert.match(ui,/planspiel:status/,'UI must reuse the existing dashboard status event');
assert.doesNotMatch(ui,/\bfetch\s*\(/,'UI must not add a second status request');
assert.doesNotMatch(ui,/\/api\/status/,'UI must not add Cloudflare status traffic');
for(const phase of ['Sammelt','Prüft','Ordnet','Priorisiert','Wägt','Sortiert','Verwertet']){
  assert.match(ui,new RegExp(phase),`living process must expose the ${phase} phase`);
}
assert.match(ui,/scanFresh/,'animation must distinguish fresh from stale data');
assert.match(ui,/normalizedScore\(b\)-normalizedScore\(a\)/,'focus stocks must be sorted strongest first');
assert.match(ui,/held\.has/,'held positions must not duplicate the opportunity focus');

assert.match(css,/@keyframes krakenFlow/,'data arms must visibly flow');
assert.match(css,/@keyframes corePulse/,'depot core must pulse');
assert.match(css,/@keyframes newsFly/,'fresh news must visibly fly into processing');
assert.match(css,/\.krakenStage\.is-stale/,'stale status must slow or stop activity');
assert.match(css,/@container \(max-width:620px\)/,'visualization must remain usable on mobile');
assert.match(changelog,/05\.09\.2026 · 23:15/,'newest UI change must be documented');
assert.match(changelog,/keine zusätzlichen Cloudflare-Statusaufrufe/,'load behavior must be documented');

console.log('data-kraken-ui tests passed');
