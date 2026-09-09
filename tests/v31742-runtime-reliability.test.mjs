import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const r2=read('src/r2-portfolio.js'),base=read('src/compact-portfolio.js'),v3=read('src/compact-portfolio-v3.js'),v7=read('src/compact-portfolio-v7.js');

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

console.log('V31.7.42 runtime reliability regressions passed');
