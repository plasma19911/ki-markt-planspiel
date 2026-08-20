import assert from 'node:assert/strict';
import {normalizePcFirstScanV288,pcFirstFromWideSweepV288,buildPcFirstBroadPoolV288,trimPcFirstValidationSliceV288} from '../src/compact-portfolio-v288-pc-first.js';

{
 const candidates=Array.from({length:75},(_,i)=>({symbol:`S${i}`,rank:i+1,pcPreScore:80-i/2,pcDeepScore:90-i/2,price:10+i,dayPct:1,momentum20Pct:.2,momentum5Pct:.1,confidence:.7}));
 const p=normalizePcFirstScanV288({masterUniverseCount:8523,prescannedCount:8523,stage2Count:400,deepCount:120,fullCycleCoveragePct:100,shardCount:1,targetFullCycleMinutes:1,candidates});
 assert.equal(p.version,28.8);assert.equal(p.masterUniverseCount,8523);assert.equal(p.stage2Count,400);assert.equal(p.deepCount,120);assert.equal(p.candidates.length,75);assert.equal(p.candidates[0].symbol,'S0');assert.equal(p.targetFullCycleMinutes,1);
}
{
 const now=Date.parse('2026-08-20T18:30:00Z');
 const entries=Array.from({length:500},(_,i)=>({symbol:`W${i}.DE`,last:10+i/10,wideScore:10-i/100,m5Pct:.12-(i%8)*.01,m20Pct:.28-(i%9)*.02,accelerationPct:.04,sessionPct:1+(i%5)*.2,observedAt:new Date(now-(i%3)*10_000).toISOString(),source:'CSHARP'}));
 const pc=pcFirstFromWideSweepV288(entries,{masterCount:8523,scannedCount:8523,fullMasterCycleMinutes:1,profile:'SINGLE_SUPER_SCANNER'},now);
 assert.equal(pc.mode,'CSHARP_PC_FIRST_FULL_MASTER');assert.equal(pc.masterUniverseCount,8523);assert.equal(pc.prescannedCount,8523);assert.equal(pc.fullCycleCoveragePct,100);assert.equal(pc.stage2Count,400);assert.equal(pc.deepCount,120);assert.equal(pc.finalistCount,60);assert.equal(pc.targetFullCycleMinutes,1);assert.match(pc.source,/SINGLE_SUPER_SCANNER/);
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
