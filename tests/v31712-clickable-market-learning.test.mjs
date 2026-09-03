import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {persistedOutcomeStatusV31712} from '../src/persisted-learning-status-v31712.js';

const ui=readFileSync('public/clickable-market-ui-v31712.js','utf8');
const entry=readFileSync('src/index-v21.js','utf8');
const wrangler=readFileSync('wrangler.jsonc','utf8');
const bootstrap=readFileSync('src/index-v19.js','utf8');
const chart=readFileSync('src/position-chart-history.js','utf8');

assert.ok(ui.includes('data-stock-symbol'),'universal stock click target missing');
assert.ok(ui.includes('window.openPlanspielStockChart'),'global stock chart opener missing');
assert.ok(ui.includes('/api/position-chart?symbol='),'chart API call missing');
assert.ok(ui.includes('/api/news-feed'),'live news fetch missing');
assert.ok(ui.includes('marketNewsLink'),'clickable headline rendering missing');
assert.ok(ui.includes('googleNewsUrl'),'headline search fallback missing');
assert.ok(ui.includes('arr(s.candidates)')&&ui.includes('arr(s.positions)')&&ui.includes('arr(s.newsRadar)'),'candidate/position/news enhancement missing');
assert.ok(entry.includes("u.pathname==='/api/position-chart'")&&entry.includes('positionChartHistoryData'),'production chart override missing');
assert.ok(entry.includes("u.pathname==='/api/news-feed'")&&entry.includes('buildLiveNewsFeed'),'production news override missing');
assert.ok(chart.includes("range==='trade'&&!pos&&!events.length"),'only trade-range should require a prior trade');
assert.ok(wrangler.includes('"main": "src/index-v21.js"'),'V31.7.12 production entry not active');
assert.ok(bootstrap.includes('clickable-market-ui-v31712.js'),'clickable UI is not bootstrapped');

const now=Date.now();
const memory={
 symbols:{AAA:{lastSeenAt:now-1000},BBB:{lastSeenAt:now-2000}},
 weights:{velocity:3.5},
 recent20:[
  {ts:now-60_000,action:'BUY',returnPct:.8,netReturnPct:.35},
  {ts:now-120_000,action:'HOLD',returnPct:.6,netReturnPct:.6}
 ]
};
const recovered=persistedOutcomeStatusV31712(memory,[{symbol:'AAA',price:12},{symbol:'BBB',price:4},{symbol:'BAD',price:0}],{trackedSymbols:0,currentCandidates:0,matured:0,buySamples:0,weights:null},now);
assert.equal(recovered.trackedSymbols,2);
assert.equal(recovered.currentCandidates,2);
assert.equal(recovered.matured,2);
assert.equal(recovered.buySamples,1);
assert.equal(recovered.buyHitRate,100);
assert.equal(recovered.avgBuy20mReturnPct,.35);
assert.equal(recovered.weights.velocity,3.5);
assert.equal(recovered.persistedMemoryRecovered,true);
assert.equal(recovered.statusSource,'PERSISTED_MEMORY+CURRENT_STATE');

console.log(JSON.stringify({ok:true,universalCharts:true,clickableNews:true,untradedChartBackend:true,persistedLearningRecovered:true},null,2));
