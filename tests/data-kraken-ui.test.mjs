import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/data-kraken-ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/data-kraken.css',import.meta.url),'utf8');
const changelog=readFileSync(new URL('../public/changelog-current-v31712.js',import.meta.url),'utf8');

assert.match(index,/id="dataFlow"/,'dashboard must contain the central data-flow section');
assert.match(index,/id="krakenCore"/,'depot core must be present');
assert.match(index,/id="krakenPageLinks"/,'the whole dashboard must connect to the central data core');
assert.match(index,/id="krakenDecisionPipeline"/,'the active decision pipeline must be visible');
assert.match(index,/id="krakenPlanktonField"/,'news plankton field must be present');
assert.match(index,/id="krakenCompactAll"/,'the user must be able to collapse all organs into an overview');
assert.match(index,/id="krakenExpandAll"/,'the user must be able to open every organ');
assert.match(index,/id="krakenOrganCount"/,'the complete overview must show its connected organ count');
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
assert.match(ui,/WOCHENENDPAUSE/,'expected weekend downtime must not be shown as an outage');
assert.match(ui,/marketHeaderStatus/,'the legacy market header must agree with the weekend state');
assert.match(ui,/scannerLiveTitle/,'the legacy scanner banner must agree with the weekend state');
assert.match(ui,/newsCatalystPolicy/,'UI must show the news that actually reaches the decision layer');
assert.match(ui,/function renderCommandDeck/,'the top priority and processing chain must be rendered');
assert.match(ui,/function renderPlankton/,'news must drive the plankton visualization');
assert.match(ui,/function setOrganExpanded/,'every dashboard organ must be independently expandable');
assert.match(ui,/function organSummary/,'collapsed organs must retain a useful live summary');
assert.match(ui,/localStorage\.setItem\(ORGAN_PREF_KEY/,'the chosen organ layout must persist');
assert.match(ui,/newsSamples/,'the bounded news outcome-learning sample count must be visible');
assert.match(ui,/decoratePageOrgans/,'the complete dashboard must become part of the data organism');
assert.match(ui,/positionTradeChart.*CHART-AUGE/,'the dynamically created trade chart must become an organ');
assert.match(ui,/newsLearning.*NEWS-GEDÄCHTNIS/,'the dynamically created news learning card must become an organ');
assert.match(ui,/agmCalendarBottom.*TERMINSINN/,'the dynamically created AGM calendar must become an organ');
assert.match(ui,/MutationObserver/,'later UI modules must be discovered automatically');
assert.match(ui,/krakenScannerNerve/,'the scanner status must be inside the connected overview');
assert.match(ui,/KPI_SENSES/,'depot KPIs must be represented as live sensory cells');
assert.match(ui,/drawPageLinks/,'the dashboard organs must be connected visually');
assert.match(ui,/normalizedScore\(b\)-normalizedScore\(a\)/,'focus stocks must be sorted strongest first');
assert.match(ui,/normalizedScore\(candidate\)>=50/,'weak candidates must not be pulled into the foreground');
assert.match(ui,/held\.has/,'held positions must not duplicate the opportunity focus');

assert.match(css,/@keyframes krakenFlow/,'data arms must visibly flow');
assert.match(css,/@keyframes corePulse/,'depot core must pulse');
assert.match(css,/@keyframes newsFly/,'fresh news must visibly fly into processing');
assert.match(css,/@keyframes planktonIn/,'news plankton must flow into the depot core');
assert.match(css,/\.krakenDecisionPipeline/,'decision processing must be legible');
assert.match(css,/\.krakenOrgan\.organCollapsed/,'the complete dashboard must support a compact organ overview');
assert.match(css,/\.krakenOrganToggle/,'organ expand controls must be styled consistently');
assert.match(css,/prefers-reduced-motion/,'all living UI motion must respect reduced-motion preferences');
assert.match(css,/\.krakenOrgan/,'dashboard cards must be styled as connected organs');
assert.match(css,/#newsLearning[^}]*\.krakenOrgan\{display:block!important\}/,'legacy rescue CSS must not hide the connected news-learning organ');
assert.match(css,/@keyframes pageTentacleFlow/,'page-wide data arms must flow');
assert.match(css,/\.krakenStage\.is-stale/,'stale status must slow or stop activity');
assert.match(css,/@container \(max-width:620px\)/,'visualization must remain usable on mobile');
assert.match(changelog,/05\.09\.2026 · 23:59/,'newest UI change must be documented first');
assert.match(changelog,/keine zusätzlichen Cloudflare-Statusaufrufe/,'load behavior must be documented');

console.log('data-kraken-ui tests passed');
