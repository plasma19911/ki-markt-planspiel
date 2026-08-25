import assert from 'node:assert/strict';
import {ManualTradeNudgeGuardV307} from '../src/manual-trade-v307.js';

const mem=new Map(),storage={kv:{get:k=>mem.get(k),put:(k,v)=>mem.set(k,v)}};
const exact={symbol:'BEST.DE',name:'Best AG',decisionScore:74,momentum5Pct:.4,momentum20Pct:.7,confidence:.8,brokerVerified:true,assetClass:'EQUITY',brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'official Trade Republic universe',isin:'DE000A1EWWW0'};
const positions=[{symbol:'OLD.DE',name:'Old AG',decisionScore:45,rawDecisionScore:30},{symbol:'B.DE',decisionScore:60,rawDecisionScore:58},{symbol:'C.DE',decisionScore:61,rawDecisionScore:59},{symbol:'D.DE',decisionScore:62,rawDecisionScore:60}];
let state={positions,candidates:[exact]};
const input={messages:[{content:`Kandidaten=${JSON.stringify([exact])} Gehalten=${JSON.stringify(positions)}`}]};
const response=plan=>({response:JSON.stringify(plan)});
const inner={run:async()=>response({summary:'base',actions:[...positions.map(p=>({symbol:p.symbol,action:'HOLD',reason:'hold'})),{symbol:'BEST.DE',action:'HOLD',reason:'soft confirmation'}]})};
const guard=new ManualTradeNudgeGuardV307(inner,{getState:()=>state,getBrokerRows:async()=>[exact],storage,now:()=>Date.parse('2026-08-25T06:30:00Z')});

let req=guard.request({action:'BUY',symbol:'BEST.DE',allocationPct:100});assert.equal(req.ok,true);
let out=await guard.run('model',input),plan=JSON.parse(out.response),buy=plan.actions.find(a=>a.symbol==='BEST.DE'),sell=plan.actions.find(a=>a.symbol==='OLD.DE');
assert.equal(buy.action,'BUY');assert.equal(buy.allocation_pct,100,'manual buy must allow 100% allocation');assert.equal(buy.manualNudgeV307,true);assert.equal(sell.action,'SELL','with four occupied slots the weakest held position should make room');

req=guard.request({action:'SELL',symbol:'B.DE'});assert.equal(req.ok,true);out=await guard.run('model',input);plan=JSON.parse(out.response);assert.equal(plan.actions.find(a=>a.symbol==='B.DE')?.action,'SELL');assert.equal(plan.actions.find(a=>a.symbol==='B.DE')?.manualNudgeV307,true);

const blockedInner={run:async()=>response({summary:'blocked',actions:[{symbol:'BEST.DE',action:'HOLD',reason:'V30.6 ANTI-CHURN REENTRY blocked after SELL'}]})};
state={positions:[],candidates:[exact]};const blocked=new ManualTradeNudgeGuardV307(blockedInner,{getState:()=>state,getBrokerRows:async()=>[exact],storage,now:()=>Date.parse('2026-08-25T07:00:00Z')});blocked.request({action:'BUY',symbol:'BEST.DE',allocationPct:100});out=await blocked.run('model',{messages:[{content:`Kandidaten=${JSON.stringify([exact])} Gehalten=[]`}]});plan=JSON.parse(out.response);assert.notEqual(plan.actions.find(a=>a.symbol==='BEST.DE')?.action,'BUY','manual buy must not override anti-churn/reentry hard safety');

console.log(JSON.stringify({ok:true,manualSell:true,manualBuy100Pct:true,slotRotation:true,antiChurnStillHard:true},null,2));
