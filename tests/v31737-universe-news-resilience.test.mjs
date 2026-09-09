import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectScannerUniverse,SCANNER_CORE_MIN_CAP_USD,SCANNER_SATELLITE_LIMIT} from '../src/market-v3-base.js';
import {MAX_EVENTS_PER_UPDATE} from '../src/news-learning.js';

const rows=[
 {symbol:'CORE',type:'EQUITY',marketCapUSD:SCANNER_CORE_MIN_CAP_USD},
 {symbol:'HELD',type:'EQUITY',marketCapUSD:0},
 {symbol:'SMALL',type:'EQUITY',marketCapUSD:499_999_999},
 {symbol:'UNKNOWN',type:'EQUITY',marketCapUSD:0},
 ...Array.from({length:350},(_,i)=>({symbol:`MID${String(i).padStart(3,'0')}`,type:'EQUITY',marketCapUSD:750_000_000}))
];
const selected=selectScannerUniverse(rows,['HELD'],new Date('2026-09-09T08:00:00Z'));
assert(selected.items.some(x=>x.symbol==='CORE'));
assert(selected.items.some(x=>x.symbol==='HELD'));
assert(!selected.items.some(x=>x.symbol==='SMALL'));
assert(!selected.items.some(x=>x.symbol==='UNKNOWN'));
assert.equal(selected.profile.satelliteCount,SCANNER_SATELLITE_LIMIT);
assert.equal(selected.profile.catalogCount,354);
const compactSource=await readFile(new URL('../src/compact-portfolio-v2.js',import.meta.url),'utf8');
assert.match(compactSource,/NEWS_LEARNING_COOLDOWN_MS=60\*60\*1000/);
assert.equal(MAX_EVENTS_PER_UPDATE,12);
console.log('v31.7.37 universe/news resilience tests passed');
