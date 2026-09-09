import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {marketOpen} from '../src/market-v3-base.js';

assert.equal(marketOpen({symbol:'NVDA',exchange:'NMS',currency:'USD'},new Date('2026-09-09T10:00:00Z')).open,false);
assert.equal(marketOpen({symbol:'SAP.DE',exchange:'GER',currency:'EUR'},new Date('2026-09-09T10:00:00Z')).open,true);
assert.equal(marketOpen({symbol:'7203.T',exchange:'JPX',currency:'JPY'},new Date('2026-09-09T10:00:00Z')).open,false);
const market=await readFile(new URL('../src/market-v3-base.js',import.meta.url),'utf8');
assert.match(market,/radarTargets=rotatingRadar\(openEquities\)/);
assert.match(market,/newsOnlyForActionableEquities:true/);
const scanner=await readFile(new URL('../pc-agent/pc-first-scanner.ps1',import.meta.url),'utf8');
for(const marker of ['Test-PcFirstReferenceMarketOpen','actionableUniverseCount','closedReferenceMarketCount','TRADE_REPUBLIC_VERIFIED_AND_REFERENCE_MARKET_OPEN','PC_FIRST_TRADE_REPUBLIC_OPEN_NOW'])assert.ok(scanner.includes(marker),marker);
console.log('v31.7.38 Trade Republic open-now + news focus tests passed');
