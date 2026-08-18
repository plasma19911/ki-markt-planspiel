import assert from 'node:assert/strict';
import {assessBalancedSoftEntry,marginalExitDecision,replayBalancePressure,BalancedAdaptiveAiGuard} from '../src/balanced-adaptive-guard.js';
import {rotationCostDecision} from '../src/rotation-cost-guard.js';

function memoryStorage(report={}){
 const data=new Map([
  ['state/day-replay-report-v1',report],
  ['state/day-replay-learning-v1',{completedDays:1,samples:{}}]
 ]);
 return{kv:{get:k=>data.get(k),put:(k,v)=>data.set(k,v)},data};
}

const report={status:'COMPLETE',processed:60,summary:{symbolsAnalysed:60,mistakes:{PEAK_ENTRY:3,LATE_EXPENSIVE_ENTRY:5,MISSED_SAFE_MOVE:12},churn:{rapidRoundTrips:13,totalRapidTradePnl:-18,fees:28}}};
const storage=memoryStorage(report);
const pressure=replayBalancePressure(storage);
assert.ok(pressure.opportunityBoost>.035,'Missed/Late Replay muss einen moderaten Opportunity-Druck erzeugen');
assert.ok(pressure.peakPenalty>0,'Peak-Fehler muessen ebenfalls in die Balance einfliessen');

const strongNearMiss={symbol:'GOOD',score:5.35,confidence:.74,day_change:2.4,momentum5:.07,momentum20:.10,momentumAcceleration5:.01,rsi:64,volumeRatio:.96,drawdownFrom20mHighPct:-.28,eventRisk:'NONE',momentumState:'NORMAL',momentumSellSignal:'NONE'};
const soft=assessBalancedSoftEntry(strongNearMiss,storage);
assert.equal(soft.allow,true,'Sehr guter Kandidat darf trotz knapp verfehlter weicher Vollbestaetigung eine Starterchance erhalten');
assert.ok(soft.allocationCap>=16&&soft.allocationCap<=28,'Soft-Override muss klein bleiben');

const hardRisk={...strongNearMiss,symbol:'RISK',eventRisk:'HIGH'};
assert.equal(assessBalancedSoftEntry(hardRisk,storage).allow,false,'Harte Event-Safety darf nie durch Replay gelockert werden');
const reversal={...strongNearMiss,symbol:'REV',momentumState:'REVERSAL',momentumSellSignal:'STRONG'};
assert.equal(assessBalancedSoftEntry(reversal,storage).allow,false,'Starkes Reversal darf nie als Soft-Entry gekauft werden');

const exitStorage=memoryStorage(report),action={symbol:'HELD',action:'SELL',reason:'Momentum-Risk-Exit: leichter Ruecklauf'};
const held={symbol:'HELD',momentum5:-.15,momentum20:.08,pnlPct:-.2,momentumState:'NORMAL',momentumSellSignal:'WATCH'};
const first=marginalExitDecision({held,action,storage:exitStorage,now:1_800_000_000_000});
const second=marginalExitDecision({held,action,storage:exitStorage,now:1_800_000_060_000});
assert.equal(first.allow,false,'Ein einzelner leichter Momentum-Ruecklauf soll nicht sofort verkaufen');
assert.equal(second.allow,true,'Zweites bestaetigendes Signal darf verkaufen');
const hard=marginalExitDecision({held:{...held,momentumState:'REVERSAL',momentumSellSignal:'STRONG'},action,storage:exitStorage,now:1_800_000_120_000});
assert.equal(hard.allow,true,'Harter Reversal-Exit muss sofort erlaubt bleiben');

const rotationStorage=memoryStorage(report);
const rot=rotationCostDecision({held:{symbol:'OLD',ageMinutes:7,invested:600,pnlPct:-.9,momentumState:'NORMAL',momentumSellSignal:'NONE'},action:{symbol:'OLD',action:'SELL',reason:'CAPITAL-MOTION-ROTATION: NEW besser · Differenz 2.60'},storage:rotationStorage});
assert.equal(rot.allow,true,'Aussergewoehnlich klar bessere Alternative darf trotz Replay-Churn frueher rotieren');

const base={run:async()=>({response:JSON.stringify({summary:'base',actions:[{symbol:'GOOD',action:'HOLD',confidence:.62,allocation_pct:0,reason:'RESEARCH-ENTRY-WAIT: knapp'}]})})};
const input={messages:[{role:'user',content:`JSON-only Kandidaten=${JSON.stringify([strongNearMiss])} Gehalten=[]`}]};
const plan=JSON.parse((await new BalancedAdaptiveAiGuard(base,storage).run('x',input)).response);
assert.equal(plan.actions.some(a=>a.action==='BUY'&&a.symbol==='GOOD'),true,'Balance-Schicht muss einen guten Near-Miss als kleine Starterposition retten koennen');

console.log(JSON.stringify({ok:true,pressure,softStarterPct:soft.allocationCap,firstMarginalExitHeld:true,secondMarginalExitAllowed:true,hardSafetyPreserved:true,exceptionalRotationAllowed:true},null,2));
