import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const r2=read('src/r2-portfolio.js'),base=read('src/compact-portfolio.js'),v3=read('src/compact-portfolio-v3.js'),v7=read('src/compact-portfolio-v7.js'),market=read('src/market-v3-base.js'),marketOverlay=read('src/market-v3.js'),brokerUi=read('public/zero-ui.js'),budgetSmoke=read('scripts/smoke-free-tier-24h.mjs');

assert.match(r2,/const SCAN_LOCK_MS=6\*60\*1000/);
assert.match(r2,/scan_lock_until=now\+SCAN_LOCK_MS/);
const start=base.lastIndexOf('  async status(){'),end=base.indexOf('  start(options=',start),statusBody=base.slice(start,end);
assert.doesNotMatch(statusBody,/this\._serial/);
assert.match(base,/prompt\.includes\('Mehrquellen-Nachrichtenlage'\)/);
assert.match(base,/const AI_NEWS_OUTPUT_CAP=700/);
assert.match(v3,/captureNewsLearningQuoteCache/);
assert.match(v3,/consumeScanFunnel/);
assert.match(v7,/fee_fixed=ZERO_FEE_MODEL\.standardOrderFeeEur/);
assert.match(v7,/feeFixed:ZERO_FEE_MODEL\.standardOrderFeeEur/);
const v7Status=v7.slice(v7.indexOf('  async status(){'),v7.indexOf('\n    const s=await super.status()',v7.indexOf('  async status(){')));
assert.doesNotMatch(v7Status,/ensureStocksOnlyState|repairStoredQuoteAnomalies/,'Ein reiner Statusabruf darf keine R2-Migrations- oder Reparaturrunde starten');
assert.match(market,/c\.stale=!c\.fresh;c\.quoteStale=!c\.fresh/);
assert.match(marketOverlay,/fresh:true,stale:false,quoteStale:false/);
assert.doesNotMatch(brokerUi,/Order ≥ 500 €/);
assert.match(brokerUi,/Trade-Republic-Standardgebühr: 1 €/);
assert.match(budgetSmoke,/AI_NEWS_OUTPUT_CAP=700/);

console.log('V31.7.42 runtime reliability regressions passed');
