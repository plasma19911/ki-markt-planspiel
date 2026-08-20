import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreAllV287,enforceV287} from '../src/calibrated-action-score-v287.js';
import {buildBroadLeaderPool,applyRotatingBreadth} from '../src/scanner-breadth-v287.js';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const compat=read('public/ui-v283-fix.js');
const ui=read('public/v287-live-ui.js');
const entry=read('src/index-v19.js');
const prod=read('src/compact-portfolio-v11.js');
const dashboard=read('src/index-v20.js');
const wrangler=read('wrangler.jsonc');
assert.match(compat,/compatibilityOnly:true/);assert.match(compat,/scoreRenderer:false/);
assert.match(ui,/Kaufscore 0–100/);assert.match(ui,/75\+ Kaufbereit/);assert.match(ui,/Haltescore/);assert.match(ui,/Verkaufsscore/);assert.match(ui,/Mo–Fr 07:30–23:00/);assert.match(ui,/singleScoreRenderer:true/);
assert.match(entry,/v287-live-ui\.js/);assert.match(prod,/compact-portfolio-v288-pc-first\.js/);assert.match(dashboard,/pc-first-full-master-v288/);assert.match(wrangler,/"main"\s*:\s*"src\/index-v20\.js"/);

const now=Date.parse('2026-08-20T17:40:00Z');
function storage(seed={}){const m=new Map(Object.entries(seed));return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v))},_m:m}}
{
 const s=storage(),state={candidates:[
  {symbol:'MARA.MX',price:20,score:6.45,confidence:.63,day_change:13.3},
  {symbol:'GOOD',price:100,score:6.2,confidence:.75,day_change:3,momentum20:.45,momentum5:.18,volumeRatio:1.6,newsScore:.4},
  {symbol:'CHASE',price:50,score:7,confidence:.85,day_change:15,momentum20:1.2,momentum5:1,momentumAcceleration5:.3,volumeRatio:4.5,newsScore:.6,rsi:85}
 ],positions:[]};
 const r=scoreAllV287(state,s,now,false);assert.equal(r.candidateCount,3);assert.equal(r.allDecisionCandidatesScored,true);assert.ok(r.ranking.find(x=>x.symbol==='GOOD').buyScore>75);assert.ok(r.ranking.find(x=>x.symbol==='CHASE').buyScore<78);assert.ok(r.ranking.find(x=>x.symbol==='MARA.MX').buyScore<70);
}
{
 const seed={'state/calibrated-action-score-v287':{version:1,snapshots:{GOOD:{at:now-60_000,score:82}},recent:[],lastRotationAt:0,stats:{}}};const s=storage(seed),state={config:{cash:6000},candidates:[{symbol:'GOOD',price:100,score:6.2,confidence:.75,day_change:3,momentum20:.45,momentum5:.18,volumeRatio:1.6,newsScore:.4}],positions:[]};const p={summary:'x',actions:[{symbol:'GOOD',action:'HOLD',reason:'wait'}]};const r=enforceV287(p,state,s,now);assert.equal(r.plan.actions[0].action,'BUY');
}
{
 const master=Array.from({length:80},(_,i)=>({symbol:`S${i+1}`,marketCapUSD:1_000_000_000})),entries=[];for(let i=0;i<70;i++){entries.push({symbol:`S${i+1}`,market:'GLOBAL',source:'A',rank:i+1});if(i<30)entries.push({symbol:`S${i+1}`,market:'GLOBAL',source:'B',rank:i+1})};const b=buildBroadLeaderPool(entries,master);assert.equal(b.pool.length,60);const base={equities:[...b.pool.slice(0,25),{...master[70],forwardWatch:true}]};const a=applyRotatingBreadth(base,b,{config:{scan_count:1},positions:[]}),c=applyRotatingBreadth(base,b,{config:{scan_count:2},positions:[]});assert.ok(a.breadthRotationApplied);assert.notDeepEqual(a.equities.map(x=>x.symbol),c.equities.map(x=>x.symbol));
}
console.log('V28.7 score + V28.8 production-entry regression tests: OK');
