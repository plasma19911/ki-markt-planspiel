import assert from 'node:assert/strict';
import fs from 'node:fs';
import {enforceTradingBehaviorV277} from '../src/trading-behavior-v277.js';

const v11=fs.readFileSync(new URL('../src/compact-portfolio-v11.js',import.meta.url),'utf8');
assert.match(v11,/compact-portfolio-v277-trading-behavior\.js/,'production compatibility entry must route through V27.7 behavior wrapper');

function storage(){const m=new Map();return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,v),delete:k=>m.delete(k)},m}}
const baseCandidate={symbol:'TEST.DE',price:100,currency:'EUR',fx_rate:1,fx_verified:true,liveScore:4.3,liveConfidence:.60,day:1.2,intraday5m:.12,intraday20m:.26,momentumAcceleration5:.05,intradayRsi:61,newsScore:.08,eventRisk:'NONE',sellerShare:46};
const buyPlan=()=>({summary:'FINAL-CONTROLLER V27.6',actions:[{symbol:'TEST.DE',action:'BUY',confidence:.66,allocation_pct:22,reason:'FINAL-CONTROLLER V27.6 BUY PULLBACK_RECLAIM: sauber'}]});
const now=Date.parse('2026-08-20T13:00:00Z');

// 1) A normal setup must not enter from one isolated scan.
{
 const st=storage(),state={config:{cash:10000,risk_mode:'offensiv'},positions:[],candidates:[baseCandidate]};
 const first=enforceTradingBehaviorV277(buyPlan(),state,st,now).plan.actions[0];
 assert.equal(first.action,'HOLD');assert.match(first.reason,/ENTRY-CONFIRM V27\.7/);
 const second=enforceTradingBehaviorV277(buyPlan(),state,st,now+5*60000).plan.actions[0];
 assert.equal(second.action,'BUY','same healthy setup on a separated second scan may enter');
}

// 2) Exceptional clean strength may enter immediately, but only inside anti-chase bounds.
{
 const st=storage(),c={...baseCandidate,liveScore:5.1,liveConfidence:.72,intraday5m:.28,intraday20m:.52,momentumAcceleration5:.10,intradayRsi:64,day:2.0};
 const a=enforceTradingBehaviorV277(buyPlan(),{config:{cash:10000,risk_mode:'offensiv'},positions:[],candidates:[c]},st,now).plan.actions[0];
 assert.equal(a.action,'BUY');
}

// 3) OCDOL-style fast impulse must be rechecked instead of chased.
{
 const st=storage(),c={...baseCandidate,liveScore:4.8,liveConfidence:.70,intraday5m:1.35,intraday20m:1.7,momentumAcceleration5:1.05,intradayRsi:68};
 const a=enforceTradingBehaviorV277(buyPlan(),{config:{cash:10000},positions:[],candidates:[c]},st,now).plan.actions[0];
 assert.equal(a.action,'HOLD');assert.match(a.reason,/kein FOMO-Kauf/i);
}

// 4) When portfolio is already >85% invested, mediocre rest-cash BUY is rejected.
{
 const st=storage(),p={symbol:'HELD.DE',invested:9000,entry_price:100,last_price:100,entry_fx:1,last_fx:1,currency:'EUR'};
 const a=enforceTradingBehaviorV277(buyPlan(),{config:{cash:1000},positions:[p],candidates:[baseCandidate]},st,now).plan.actions[0];
 assert.equal(a.action,'HOLD');assert.match(a.reason,/Restcash bleibt/i);
}

// 5) A PROFIT EXIT that would realize only cents/small euros stays HOLD without a real winner break.
{
 const st=storage(),p={symbol:'WIN.DE',invested:500,entry_fee:1,entry_price:10,last_price:10.075,entry_fx:1,last_fx:1,currency:'EUR',zero_quantity:50,opened_at:'2026-08-20T11:00:00Z'},c={symbol:'WIN.DE',price:10.075,fx_rate:1,intraday5m:.02,intraday20m:.04,momentumAcceleration5:0,sellerShare:48,newsScore:0,eventRisk:'NONE'};
 const plan={summary:'FINAL-CONTROLLER V27.6',actions:[{symbol:'WIN.DE',action:'SELL',confidence:.73,allocation_pct:0,reason:'FINAL-CONTROLLER PROFIT EXIT: Gewinnerstruktur angeblich gebrochen.'}]};
 const a=enforceTradingBehaviorV277(plan,{config:{cash:1000,slippage_percent:.10},positions:[p],candidates:[c]},st,now).plan.actions[0];
 assert.equal(a.action,'HOLD');assert.match(a.reason,/PROFIT-PATIENCE V27\.7/);
}

// 6) A meaningful profitable exit is not blocked.
{
 const st=storage(),p={symbol:'WIN.DE',invested:500,entry_fee:1,entry_price:10,last_price:10.25,entry_fx:1,last_fx:1,currency:'EUR',zero_quantity:50,opened_at:'2026-08-20T11:00:00Z'},c={symbol:'WIN.DE',price:10.25,fx_rate:1,intraday5m:-.05,intraday20m:-.10,momentumAcceleration5:-.01,sellerShare:56,newsScore:0,eventRisk:'NONE'};
 const plan={summary:'FINAL-CONTROLLER V27.6',actions:[{symbol:'WIN.DE',action:'SELL',confidence:.73,allocation_pct:0,reason:'FINAL-CONTROLLER PROFIT EXIT: Gewinnerstruktur gebrochen.'}]};
 const a=enforceTradingBehaviorV277(plan,{config:{cash:1000,slippage_percent:.10},positions:[p],candidates:[c]},st,now).plan.actions[0];
 assert.equal(a.action,'SELL');
}

console.log('V27.7 trading behavior regression tests: OK');
