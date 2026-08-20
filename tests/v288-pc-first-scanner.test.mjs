import assert from 'node:assert/strict';
import {normalizePcFirstScanV288,buildPcFirstBroadPoolV288,trimPcFirstValidationSliceV288} from '../src/compact-portfolio-v288-pc-first.js';

{
 const candidates=Array.from({length:75},(_,i)=>({symbol:`S${i}`,rank:i+1,pcPreScore:80-i/2,pcDeepScore:90-i/2,price:10+i,dayPct:1,momentum20Pct:.2,momentum5Pct:.1,confidence:.7}));
 const p=normalizePcFirstScanV288({masterUniverseCount:8247,prescannedCount:8247,stage2Count:400,deepCount:120,fullCycleCoveragePct:100,shardCount:4,candidates});
 assert.equal(p.version,28.8);assert.equal(p.masterUniverseCount,8247);assert.equal(p.stage2Count,400);assert.equal(p.deepCount,120);assert.equal(p.candidates.length,75);assert.equal(p.candidates[0].symbol,'S0');
}
{
 const pc=normalizePcFirstScanV288({updatedAt:new Date().toISOString(),candidates:Array.from({length:60},(_,i)=>({symbol:`A${i}.DE`,rank:i+1,pcDeepScore:95-i,pcPreScore:90-i}))});
 const rows=Array.from({length:70},(_,i)=>({symbol:`A${i}.DE`,name:`A${i}`,marketCapUSD:1e9}));
 const broad=buildPcFirstBroadPoolV288(pc,rows);assert.equal(broad.pool.length,60);assert.equal(broad.pool[0].symbol,'A0.DE');assert.equal(broad.mode,'PC_FIRST_FULL_MASTER_TOP60');
}
{
 const normal=Array.from({length:30},(_,i)=>({symbol:`N${i}.DE`})),forward=Array.from({length:8},(_,i)=>({symbol:`F${i}.DE`,forwardWatch:true})),held={symbol:'HELD.DE'};
 const out=trimPcFirstValidationSliceV288({equities:[...normal,...forward,held]},{positions:[{symbol:'HELD.DE'}]});
 assert.equal(out.pcFirstCloudflareValidationSlice,true);assert.equal(out.equities.filter(x=>!x.forwardWatch&&x.symbol!=='HELD.DE').length,18);assert.equal(out.equities.filter(x=>x.forwardWatch).length,4);assert.ok(out.equities.some(x=>x.symbol==='HELD.DE'));
}
console.log('V28.8 PC-first scanner regression tests: OK');
