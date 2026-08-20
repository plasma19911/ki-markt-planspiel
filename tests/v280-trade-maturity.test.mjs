import assert from 'node:assert/strict';
import {enforceTradeMaturityV280} from '../src/trade-maturity-v280.js';

function storage(){const m=new Map();return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v)),delete:k=>m.delete(k)}}}
function plan(action){return{summary:'x',actions:[action]}}
const t=Date.parse('2026-08-20T15:00:00Z');

{
 const s=storage(),c={symbol:'FAST.DE',score:5.25,confidence:.61,price:100,day_change:1,momentum5:.12,momentum20:.12,momentum_acceleration5:.04,rsi:59,news_score:.10};
 let st={config:{cash:7000},positions:[],candidates:[{...c,score:4.95,confidence:.58,news_score:.05}]};
 enforceTradeMaturityV280(plan({symbol:'FAST.DE',action:'HOLD',confidence:.7,allocation_pct:0,reason:'ENTRY-CONFIRM V27.8: erster Snapshot'}),st,s,t);
 st={config:{cash:7000},positions:[],candidates:[c]};
 const r=enforceTradeMaturityV280(plan({symbol:'FAST.DE',action:'HOLD',confidence:.7,allocation_pct:0,reason:'ENTRY-CONFIRM V27.8: wartet'}),st,s,t+60000);
 assert.equal(r.plan.actions[0].action,'BUY','verbesserndes Setup soll vor spätem Breakout erkannt werden');
 assert.match(r.plan.actions[0].reason,/ACCELERATING_SETUP/);
}

{
 const s=storage(),p={symbol:'NEW.DE',invested:1000,entry_price:100,last_price:99.4,entry_fx:1,last_fx:1,opened_at:'2026-08-20T14:52:00Z'},c={symbol:'NEW.DE',price:99.4,momentum5:-.08,momentum20:-.12,momentum_acceleration5:-.02,seller_share:54,news_score:0};
 const st={config:{cash:5000},positions:[p],candidates:[c]};
 const r=enforceTradeMaturityV280(plan({symbol:'NEW.DE',action:'SELL',confidence:.76,allocation_pct:0,reason:'FINAL-CONTROLLER THESIS-INVALIDATION EXIT'}),st,s,t);
 assert.equal(r.plan.actions[0].action,'HOLD','frische kleine Verlustposition darf nicht wegen Rauschen verkauft werden');
 assert.match(r.plan.actions[0].reason,/THESIS-MATURITY/);
}

{
 const s=storage(),p={symbol:'BREAK.DE',invested:1000,entry_price:100,last_price:97,entry_fx:1,last_fx:1,opened_at:'2026-08-20T14:55:00Z'},c={symbol:'BREAK.DE',price:97,momentum5:-.6,momentum20:-.5,momentum_acceleration5:-.09,seller_share:72,news_score:0};
 const st={config:{cash:5000},positions:[p],candidates:[c]};
 const r=enforceTradeMaturityV280(plan({symbol:'BREAK.DE',action:'SELL',confidence:.8,allocation_pct:0,reason:'THESIS EXIT'}),st,s,t);
 assert.equal(r.plan.actions[0].action,'SELL','schwerer Strukturbruch muss trotz kurzer Haltedauer raus dürfen');
}

{
 const s=storage(),p={symbol:'HARD.DE',invested:1000,entry_price:100,last_price:99,entry_fx:1,last_fx:1,opened_at:'2026-08-20T14:58:00Z'},c={symbol:'HARD.DE',price:99,event_risk:'HIGH',event_text:'Regulatory rejection',news_score:-.8,momentum5:-.1,momentum20:-.1,momentum_acceleration5:-.02};
 const st={config:{cash:5000},positions:[p],candidates:[c]};
 const r=enforceTradeMaturityV280(plan({symbol:'HARD.DE',action:'SELL',confidence:.9,allocation_pct:0,reason:'HARD-EVENT EXIT'}),st,s,t);
 assert.equal(r.plan.actions[0].action,'SELL','Hard Risk muss immer sofort möglich bleiben');
}

console.log('V28.0 trade maturity regression tests: OK');
