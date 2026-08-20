import assert from 'node:assert/strict';
import {enforceRelativeOpportunityLearningV282} from '../src/relative-opportunity-learning-v282.js';
function storage(seed={}){const m=new Map(Object.entries(seed));return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v))},_m:m}}
const research=(ranking,positions=[])=>({'state/research-signal-fusion-v281':{lastRanking:ranking,positionScores:Object.fromEntries(positions.map(x=>[x.symbol,x]))}});
const baseState=(candidates,positions=[])=>({config:{cash:6000},candidates,positions,newsRadar:[]});
{
 const st=storage(research([{symbol:'WEAK.DE',fusionScore:61,hardBlocked:false},{symbol:'STRONG.DE',fusionScore:74,hardBlocked:false}]));
 const state=baseState([{symbol:'WEAK.DE',price:100,score:5.2,confidence:.62,day_change:4.4,rsi:75,momentum20:.5,momentum5:.4},{symbol:'STRONG.DE',price:50,score:6.1,confidence:.74,day_change:1.2,rsi:62,momentum20:.4,momentum5:.15,newsScore:.4}]);
 const plan={summary:'x',actions:[{symbol:'WEAK.DE',action:'BUY',confidence:.65,allocation_pct:10,reason:'soft buy'},{symbol:'STRONG.DE',action:'HOLD',confidence:.74,allocation_pct:0,reason:'wait'}]};
 const r=enforceRelativeOpportunityLearningV282(plan,state,st,Date.parse('2026-08-20T15:00:00Z'));
 assert.equal(r.plan.actions[0].action,'HOLD');assert.equal(r.plan.actions[1].action,'BUY');assert.equal(r.counters.relativeUpgrades,1);
}
{
 const st=storage(research([{symbol:'WEAK.DE',fusionScore:61,hardBlocked:false},{symbol:'BLOCK.DE',fusionScore:80,hardBlocked:true}]));
 const state=baseState([{symbol:'WEAK.DE',price:100,score:5.2,confidence:.62},{symbol:'BLOCK.DE',price:50,score:6.5,confidence:.8,eventRisk:'HIGH',eventText:'rejection'}]);
 const plan={summary:'x',actions:[{symbol:'WEAK.DE',action:'BUY',confidence:.65,allocation_pct:10,reason:'buy'},{symbol:'BLOCK.DE',action:'HOLD',confidence:.8,allocation_pct:0,reason:'HARD EVENT'}]};
 const r=enforceRelativeOpportunityLearningV282(plan,state,st,Date.now());assert.equal(r.plan.actions[0].action,'BUY');assert.equal(r.plan.actions[1].action,'HOLD');
}
{
 const st=storage(research([], [{symbol:'WIN.DE',fusionScore:70,stage:'CONFIRM'}]));
 const state=baseState([{symbol:'WIN.DE',price:103,score:5.8,confidence:.7,momentum20:.1,momentum5:.03,momentum_acceleration5:.01}], [{symbol:'WIN.DE',entry_price:100,last_price:103,entry_fx:1,last_fx:1,invested:1000}]);
 const plan={summary:'x',actions:[{symbol:'WIN.DE',action:'SELL',confidence:.72,allocation_pct:0,reason:'FINAL-CONTROLLER PROFIT EXIT: soft structure wobble'}]};
 const r=enforceRelativeOpportunityLearningV282(plan,state,st,Date.now());assert.equal(r.plan.actions[0].action,'HOLD');assert.equal(r.counters.profitSellsProtected,1);
}
{
 const st=storage(research([], [{symbol:'RISK.DE',fusionScore:75}]));
 const state=baseState([{symbol:'RISK.DE',price:103,score:6.2,confidence:.8,eventRisk:'HIGH',eventText:'Regulatory rejection'}], [{symbol:'RISK.DE',entry_price:100,last_price:103,entry_fx:1,last_fx:1,invested:1000}]);
 const plan={summary:'x',actions:[{symbol:'RISK.DE',action:'SELL',confidence:.9,allocation_pct:0,reason:'HARD EVENT regulatory rejection'}]};
 const r=enforceRelativeOpportunityLearningV282(plan,state,st,Date.now());assert.equal(r.plan.actions[0].action,'SELL');
}
{
 const t=Date.parse('2026-08-20T15:00:00Z'),st=storage(research([{symbol:'A.DE',fusionScore:70},{symbol:'B.DE',fusionScore:68}]));
 let state=baseState([{symbol:'A.DE',price:100,score:6,confidence:.7},{symbol:'B.DE',price:100,score:5.8,confidence:.68}]);
 let plan={summary:'x',actions:[{symbol:'A.DE',action:'BUY',confidence:.7,allocation_pct:10,reason:'buy'},{symbol:'B.DE',action:'HOLD',confidence:.68,allocation_pct:0,reason:'wait'}]};
 enforceRelativeOpportunityLearningV282(plan,state,st,t);
 state=baseState([{symbol:'A.DE',price:100.1,score:6,confidence:.7},{symbol:'B.DE',price:101.2,score:5.8,confidence:.68}]);
 const r=enforceRelativeOpportunityLearningV282({summary:'x',actions:[{symbol:'A.DE',action:'HOLD',reason:'held'},{symbol:'B.DE',action:'HOLD',reason:'held'}]},state,st,t+16*60000);
 assert.equal(r.state.stats.selectionRegrets,1);assert.match(JSON.stringify(r.state.recent),/SELECTION_REGRET/);
}
console.log('V28.2 relative opportunity learning regression tests: OK');
