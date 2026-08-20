import assert from 'node:assert/strict';
import {enforceOpportunityLearningV279,OpportunityLearningGuardV279} from '../src/opportunity-learning-v279.js';
function storage(){const m=new Map();return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v)),delete:k=>m.delete(k)},_m:m}}
function state(c,extra={}){return{config:{cash:6500,start_capital:10000,scan_count:1},positions:[{symbol:'HELD.DE',invested:3500}],candidates:[c],newsRadar:[{symbol:c.symbol,headline:'Fresh catalyst',publishedAt:'2026-08-20T14:59:00Z'}],...extra}}
const hold=(s,reason='ENTRY-CONFIRM V27.8: erster gesunder Setup-Snapshot gespeichert; aktuelle Volatilität verlangt 3 Min. stabile Struktur vor BUY.')=>({summary:'FINAL-CONTROLLER V27.8',actions:[{symbol:s,action:'HOLD',confidence:.7,allocation_pct:0,reason}]});
{
 const s=storage(),t=Date.parse('2026-08-20T15:00:00Z'),c={symbol:'CAT.DE',price:100,score:6.2,confidence:.63,news:.45,momentum5:.20,momentum20:.30,momentum_acceleration5:.05,rsi:61,day_change:1.2};
 const r=enforceOpportunityLearningV279(hold(c.symbol),state(c),s,t);assert.equal(r.plan.actions[0].action,'BUY');assert.match(r.plan.actions[0].reason,/CATALYST BUY/);assert.ok(r.plan.actions[0].allocation_pct>=500/6500*100);
}
{
 const s=storage(),t=Date.parse('2026-08-20T15:00:00Z'),hot={symbol:'HOT.DE',price:100,score:6.0,confidence:.64,news:.3,momentum5:1.20,momentum20:1.0,momentum_acceleration5:.40,rsi:70,day_change:3};
 let r=enforceOpportunityLearningV279(hold(hot.symbol,'ENTRY-PATIENCE V27.8: HOT.DE ist im aktuellen 5-Minuten-Impuls zu schnell gelaufen. Kein FOMO-Kauf; erst Stabilisierung/Reclaim und danach neue Bestätigung.'),state(hot),s,t);assert.equal(r.plan.actions[0].action,'HOLD');assert.match(r.plan.actions[0].reason,/wird gemerkt statt verworfen/);
 const reclaim={...hot,price:99.6,momentum5:.10,momentum20:.18,momentum_acceleration5:.04,rsi:63,day_change:2.3};r=enforceOpportunityLearningV279(hold(hot.symbol),state(reclaim),s,t+2*60000);assert.equal(r.plan.actions[0].action,'BUY');assert.match(r.plan.actions[0].reason,/RECLAIM BUY/);
}
{
 const s=storage(),c={symbol:'RISK.DE',price:100,score:6.4,confidence:.75,news:-.8,event_risk:'HIGH',event_text:'regulatory rejection',momentum5:.1,momentum20:.2,momentum_acceleration5:.03,rsi:60};
 const r=enforceOpportunityLearningV279(hold(c.symbol),state(c),s,Date.parse('2026-08-20T15:00:00Z'));assert.equal(r.plan.actions[0].action,'HOLD','harte Risiken dürfen nie überschrieben werden');
}
{
 let captured=null;const c={symbol:'READ.DE',price:10,score:5,confidence:.6,news:.4,momentum5:.1,momentum20:.1,momentum_acceleration5:.03,rsi:55};const st=state(c),inner={async run(model,input){captured={model,input};return{response:JSON.stringify(hold(c.symbol))}}};const g=new OpportunityLearningGuardV279(inner,{getState:()=>st,storage:storage(),now:()=>Date.parse('2026-08-20T15:00:00Z')});await g.run('@cf/test',{messages:[{role:'user',content:'Kandidaten=[] Gehalten=[]'}]});assert.match(captured.input.messages.at(-1).content,/NUR AKTIEN, KEINE ETFs/);assert.match(captured.input.messages.at(-1).content,/Fresh catalyst/);assert.equal(g.status().readsNewsRadarIntoTradingPrompt,true);
}
{
 let captured=null;const st={config:{cash:1000},positions:[],candidates:[],newsRadar:[{headline:'news'}]},inner={async run(model,input){captured=input;return{response:'News neutral'}}};const g=new OpportunityLearningGuardV279(inner,{getState:()=>st,storage:storage()});const out=await g.run('@cf/test',{messages:[{role:'user',content:'Fasse News zusammen'}]});assert.equal(captured.messages.length,1);assert.equal(out.response,'News neutral');
}

{
 const s=storage(),t=Date.parse('2026-08-20T15:00:00Z'),c={symbol:'MISS.DE',price:100,score:5.4,confidence:.62,news:.10,momentum5:.10,momentum20:.20,momentum_acceleration5:.03,rsi:60,day_change:1};
 let r=enforceOpportunityLearningV279(hold(c.symbol),state(c),s,t);assert.equal(r.plan.actions[0].action,'HOLD');
 const later={...c,price:101.0};r=enforceOpportunityLearningV279(hold(c.symbol),state(later),s,t+6*60000);assert.equal(r.counters.missedOpportunityLearned,1,'+0.8% nach abgewarteter Chance muss als False Negative gelernt werden');assert.equal(r.plan.actions[0].action,'BUY');
}

console.log('V27.9 opportunity learning regression tests: OK');
