import assert from 'node:assert/strict';
import {scoreAllOpportunitiesV286,enforceComprehensiveOpportunityV286} from '../src/comprehensive-opportunity-v286.js';
function storage(seed={}){const m=new Map(Object.entries(seed));return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v))},_m:m}}
const now=Date.parse('2026-08-20T17:20:00Z');
{
 const s=storage(),state={config:{cash:6000},marketRegime:{regime:'MIXED'},candidates:[
  {symbol:'MARA.MX',price:20,score:6.45,confidence:.63,day_change:13.3},
  {symbol:'KO',price:70,score:3.2,confidence:.6,day_change:1.45},
  {symbol:'CRON.TO',price:4,score:2.4,confidence:.45,day_change:-1.99}
 ],positions:[]};
 const r=scoreAllOpportunitiesV286(state,s,now,false);
 assert.equal(r.candidateCount,3);assert.equal(r.allDecisionCandidatesScored,true);
 assert.ok(r.ranking.every(x=>x.fusionScore>0));assert.ok(r.ranking.find(x=>x.symbol==='MARA.MX').fusionScore>50);
}
{
 const s=storage({'state/comprehensive-opportunity-v286':{version:1,snapshots:{'STRONG.DE':{at:now-60000,score:76}},recent:[],lastRotationAt:0,stats:{}}});
 const state={config:{cash:6000},candidates:[{symbol:'STRONG.DE',price:100,score:6.7,confidence:.78,day_change:3,momentum20:.35,momentum5:.12}],positions:[]};
 const p={summary:'x',actions:[{symbol:'STRONG.DE',action:'HOLD',reason:'wait',confidence:.7}]};
 const r=enforceComprehensiveOpportunityV286(p,state,s,now);assert.equal(r.plan.actions[0].action,'BUY');assert.equal(r.counters.scoreBuys,1);
}
{
 const s=storage({'state/comprehensive-opportunity-v286':{version:1,snapshots:{'STRONG.DE':{at:now-60000,score:78}},recent:[],lastRotationAt:0,stats:{}}});
 const state={config:{cash:6000},candidates:[{symbol:'STRONG.DE',price:100,score:6.8,confidence:.8,day_change:2,momentum20:.4,momentum5:.15}],positions:[{symbol:'WEAK.DE',invested:900,entry_price:100,last_price:97,score:-1.1,signal_confidence:.4,opened_at:new Date(now-2*3600e3).toISOString()}]};
 const p={summary:'x',actions:[{symbol:'STRONG.DE',action:'HOLD',reason:'wait',confidence:.7},{symbol:'WEAK.DE',action:'HOLD',reason:'hold'}]};
 const r=enforceComprehensiveOpportunityV286(p,state,s,now);assert.equal(r.plan.actions.find(x=>x.symbol==='STRONG.DE').action,'BUY');assert.equal(r.plan.actions.find(x=>x.symbol==='WEAK.DE').action,'SELL');assert.equal(r.counters.betterOpportunityRotations,1);
}
{
 const s=storage({'state/comprehensive-opportunity-v286':{version:1,snapshots:{'BLOCK.DE':{at:now-60000,score:90}},recent:[],lastRotationAt:0,stats:{}}});
 const state={config:{cash:100},candidates:[{symbol:'BLOCK.DE',price:10,score:7,confidence:.9,eventRisk:'HIGH',eventText:'rejection'}],positions:[{symbol:'WEAK.DE',invested:900,entry_price:100,last_price:97,score:-1,signal_confidence:.4,opened_at:new Date(now-2*3600e3).toISOString()}]};
 const p={summary:'x',actions:[{symbol:'BLOCK.DE',action:'HOLD',reason:'hard'},{symbol:'WEAK.DE',action:'HOLD',reason:'hold'}]};
 const r=enforceComprehensiveOpportunityV286(p,state,s,now);assert.equal(r.plan.actions[0].action,'HOLD');assert.equal(r.plan.actions[1].action,'HOLD');
}
{
 const s=storage({'state/comprehensive-opportunity-v286':{version:1,snapshots:{'HOT.DE':{at:now-60000,score:80}},recent:[],lastRotationAt:0,stats:{}}});
 const state={config:{cash:6000},candidates:[{symbol:'HOT.DE',price:50,score:7,confidence:.85,day_change:14}],positions:[{symbol:'WEAK.DE',invested:900,entry_price:100,last_price:97,score:-1.2,signal_confidence:.4,opened_at:new Date(now-2*3600e3).toISOString()}]};
 const p={summary:'x',actions:[{symbol:'HOT.DE',action:'HOLD',reason:'too hot'},{symbol:'WEAK.DE',action:'HOLD',reason:'hold'}]};
 const r=enforceComprehensiveOpportunityV286(p,state,s,now);assert.equal(r.plan.actions.find(x=>x.symbol==='HOT.DE').action,'HOLD');assert.equal(r.plan.actions.find(x=>x.symbol==='WEAK.DE').action,'HOLD');assert.equal(r.counters.betterOpportunityRotations,0);
}
console.log('V28.6 comprehensive opportunity regression tests: OK');
