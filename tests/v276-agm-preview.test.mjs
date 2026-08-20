import assert from 'node:assert/strict';
import {scoreAgmOpportunity,AGM_PREVIEW_RULES} from '../src/agm-opportunity-scoring.js';
import {AgmPreviewAiGuard} from '../src/agm-preview-ai-guard.js';

const plusDays=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const event={date:plusDays(5),symbol:'HVTEST.DE',name:'HV Test AG',baseScore:76,fundamentalScore:76,fundamentalConfidence:.72,profitForecastPositive:true,fundamentalReasons:['Forward-EPS über Vorjahr']};
const candidate={symbol:'HVTEST.DE',name:'HV Test AG',instrument_type:'EQUITY',currency:'EUR',fx_rate:1,fx_verified:true,fresh:true,score:3.8,confidence:.64,liveScore:3.8,liveConfidence:.64,dayChange:1.2,day:1.2,momentum5:.06,intraday5m:.06,momentum20:.18,intraday20m:.18,momentumAcceleration5:.04,rsi:61,momentumState:'NORMAL',momentumSellSignal:'NONE',eventRisk:'NONE',newsScore:.12,newsConfidence:.65,headlines:['Nachfrage bleibt robust']};

// Positive profit outlook + safe technical confirmation can become an early AGM candidate.
const positive=scoreAgmOpportunity(event,{candidate,news:{score:.18,confidence:.7,headlines:['Unternehmen hebt Prognose an']},now:Date.now()});
assert.equal(positive.tradeEligible,true);
assert.ok(positive.score>=AGM_PREVIEW_RULES.minimumScore);
assert.ok(positive.score<=100);

// AGM alone must never justify buying into a negative guidance revision.
const warning=scoreAgmOpportunity(event,{candidate,news:{score:-.45,confidence:.9,headlines:['Gewinnwarnung: Prognose gesenkt']},now:Date.now()});
assert.equal(warning.tradeEligible,false);
assert.equal(warning.profitOutlookPositive,true,'stored positive forecast may remain visible, but negative fresh guidance must still block trade eligibility');

// Do not chase an already extended move just because an AGM is near.
const extended=scoreAgmOpportunity(event,{candidate:{...candidate,dayChange:7,day:7,rsi:82},news:{score:.15,confidence:.6,headlines:[]},now:Date.now()});
assert.equal(extended.tradeEligible,false);

// Too distant AGM is calendar context, not an immediate entry trigger.
const distant=scoreAgmOpportunity({...event,date:plusDays(25)},{candidate,news:{score:.2,confidence:.7,headlines:[]},now:Date.now()});
assert.equal(distant.tradeEligible,false);

// New information really changes the score on re-evaluation.
const neutral=scoreAgmOpportunity(event,{candidate,news:{score:0,confidence:.7,headlines:[]},now:Date.now()});
const upgraded=scoreAgmOpportunity(event,{candidate,news:{score:.3,confidence:.8,headlines:['Prognose erhöht und Erwartungen übertroffen']},now:Date.now()});
assert.ok(upgraded.score>neutral.score,'fresh positive news/figures must increase the live AGM score');

// Guard can add AGM_PREVIEW, but only as a small allocation and without scale-up.
const calendar={version:1,modelVersion:27.6,updatedAt:new Date().toISOString(),source:'test',events:[event]};
const env={ASSETS:{fetch:async()=>new Response(JSON.stringify(calendar),{status:200,headers:{'content-type':'application/json'}})}};
const state={config:{cash:10000,currency:'EUR'},positions:[],candidates:[candidate],newsRadar:[{symbol:'HVTEST.DE',score:.2,confidence:.7,headlines:['Prognose erhöht']}]};
const inner={run:async()=>({response:JSON.stringify({summary:'FINAL-CONTROLLER V27.5',actions:[]})})};
const guard=new AgmPreviewAiGuard(inner,{env,getState:()=>state});
const prompt=`PAPER-TRADING. Kandidaten=${JSON.stringify([candidate])} Gehalten=[]`;
const out=await guard.run({messages:[{role:'user',content:prompt}]});
const plan=JSON.parse(out.response);
const buy=plan.actions.find(x=>x.symbol==='HVTEST.DE');
assert.equal(buy?.action,'BUY');
assert.match(buy.reason,/AGM_PREVIEW/);
assert.ok(buy.allocation_pct<=18&&buy.allocation_pct>=2);

const heldGuard=new AgmPreviewAiGuard(inner,{env,getState:()=>({...state,positions:[{symbol:'HVTEST.DE',invested:1000,entry_price:10,last_price:10,entry_fx:1,last_fx:1,currency:'EUR'}]})});
const heldPlan=JSON.parse((await heldGuard.run({messages:[{role:'user',content:prompt}]})).response);
assert.equal(heldPlan.actions.some(x=>x.symbol==='HVTEST.DE'&&x.action==='BUY'),false,'AGM preview must never scale up an already held symbol');

console.log('V27.6 AGM preview/calendar regression tests: OK');
