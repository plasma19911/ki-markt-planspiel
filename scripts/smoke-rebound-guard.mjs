import assert from 'node:assert/strict';
import {ReboundAiGuard} from '../src/rebound-ai-guard.js';

const makeStorage=()=>{const m=new Map();return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,v)},_m:m}};
const adapter={peekState:()=>({reboundWatch:{candidates:[{symbol:'TEST.DE',rank:1,source:'SMOKE'}]}})};
const buyAi={run:async()=>({response:JSON.stringify({summary:'AI BUY',actions:[{symbol:'TEST.DE',action:'BUY',confidence:.74,allocation_pct:25,reason:'AI möchte kaufen'}]})})};
const holdAi={run:async()=>({response:JSON.stringify({summary:'Optimizer hält Cash',actions:[{symbol:'TEST.DE',action:'HOLD',confidence:.64,allocation_pct:0,reason:'Erwartungswert noch nicht gut genug'}]})})};
const inputFor=c=>({messages:[{role:'user',content:`JSON-only. Kandidaten=${JSON.stringify([c])} Gehalten=[]`}]});

const falling={symbol:'TEST.DE',type:'EQUITY',day:-5.2,intraday5m:-.35,intraday20m:-1.4,intradayRsi:30,volumeRatio:1.5,momentumState:'NORMAL',momentumSellSignal:'NONE',eventRisk:'NONE',news:0,liveScore:5.2,liveConfidence:.7};
const blocked=JSON.parse((await new ReboundAiGuard(buyAi,adapter,makeStorage()).run('test',inputFor(falling))).response);
const blockedAction=blocked.actions.find(x=>x.symbol==='TEST.DE');
assert.equal(blockedAction.action,'HOLD','Weiter fallender Tagesverlierer muss HOLD bleiben');
assert.equal(blockedAction.allocation_pct,0);
assert.match(blockedAction.reason,/REBOUND-BLOCK/);

const turning={symbol:'TEST.DE',type:'EQUITY',day:-4.0,intraday5m:.30,intraday20m:.10,intradayRsi:46,volumeRatio:1.45,momentumState:'BUILDING',momentumSellSignal:'NONE',eventRisk:'NONE',news:.10,liveScore:5.4,liveConfidence:.72};
const allowed=JSON.parse((await new ReboundAiGuard(buyAi,adapter,makeStorage()).run('test',inputFor(turning))).response);
const buy=allowed.actions.find(x=>x.symbol==='TEST.DE'&&x.action==='BUY');
assert.ok(buy,'Vom Profit-Layer vorgeschlagener BUY darf nach bestätigter Umkehr passieren');
assert.ok(buy.allocation_pct>=10&&buy.allocation_pct<=35,'Rebound-Startposition muss zwischen 10% und 35% bleiben');
assert.match(buy.reason,/REBOUND/);

const cashPlan=JSON.parse((await new ReboundAiGuard(holdAi,adapter,makeStorage()).run('test',inputFor(turning))).response);
assert.equal(cashPlan.actions.some(x=>x.action==='BUY'),false,'Rebound-Radar darf keinen BUY ergänzen, wenn der innere Profit-Optimizer Cash gewählt hat');

const eventRisk={...turning,eventRisk:'HIGH'};
const riskBlocked=JSON.parse((await new ReboundAiGuard(buyAi,adapter,makeStorage()).run('test',inputFor(eventRisk))).response);
assert.equal(riskBlocked.actions.find(x=>x.symbol==='TEST.DE').action,'HOLD','HIGH-Event-Risiko muss Rebound-BUY blockieren');

console.log(JSON.stringify({ok:true,fallingKnifeBlocked:true,confirmedReboundValidated:true,noForcedReboundBuy:true,eventRiskBlocked:true,buy},null,2));
