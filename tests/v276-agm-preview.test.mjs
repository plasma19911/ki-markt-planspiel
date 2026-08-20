import assert from 'node:assert/strict';
import {AGM_PREVIEW_RULES} from '../src/agm-opportunity-scoring.js';
import {composeAgmBaseScore} from '../src/agm-signal-model.js';
import {evaluateAgmCalendarData} from '../src/agm-runtime.js';
import {AgmPreviewAiGuard} from '../src/agm-preview-ai-guard.js';

const plusDays=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
const fundamental={fundamentalScore:68,fundamentalConfidence:.72,profitForecastPositive:true,fundamentalReasons:['Analysten erwarten Gewinnwachstum']};
const chart={samples:220,last:120,sma50:112,sma200:100,changeM1:4,changeM3:12,position52w:72,drawdownFromHigh:-8,volatility20d:28,volumeTrend:12};
const news={delta:8,confidence:.34,guidance:1,reasons:['Meldungen deuten auf angehobenen Ausblick'],headlines:['Prognose angehoben'],count:3};
const daily=composeAgmBaseScore({fundamental,chart,news});
assert.ok(daily.baseScore>=AGM_PREVIEW_RULES.minimumScore,'daily score should recognise a strong positive setup');

const event={date:plusDays(5),symbol:'HVTEST.DE',name:'HV Test AG',...daily,baseLabel:'POSITIV',scoreEvaluatedAt:new Date().toISOString()};
const candidate={symbol:'HVTEST.DE',name:'HV Test AG',instrument_type:'EQUITY',currency:'EUR',fx_rate:1,fx_verified:true,fresh:true,score:3.8,confidence:.64,liveScore:3.8,liveConfidence:.64,dayChange:1.2,day:1.2,momentum5:.06,intraday5m:.06,momentum20:.18,intraday20m:.18,momentumAcceleration5:.04,rsi:61,momentumState:'NORMAL',momentumSellSignal:'NONE',eventRisk:'NONE',newsScore:.12,newsConfidence:.65};
const calendar={version:1,modelVersion:27.6,updatedAt:new Date().toISOString(),scoreEvaluationCadence:'daily',scoreReevaluation:'once daily only',source:'test',events:[event]};

// Core invariant: live state/news must NOT change the stored daily AGM score.
const calm=evaluateAgmCalendarData(calendar,{positions:[],candidates:[candidate],newsRadar:[{symbol:'HVTEST.DE',score:.2,headlines:['positiv']}]});
const noisy=evaluateAgmCalendarData(calendar,{positions:[],candidates:[{...candidate,newsScore:-.9,day:9,rsi:90}],newsRadar:[{symbol:'HVTEST.DE',score:-.9,headlines:['Gewinnwarnung']}]});
assert.equal(calm.events[0].score,daily.baseScore);
assert.equal(noisy.events[0].score,daily.baseScore,'live market/news scans must not re-score the AGM calendar');
assert.equal(noisy.scoreReevaluation,'once daily only');

// Guard may use current market data only as a safety gate, never to change the daily score.
const env={ASSETS:{fetch:async()=>new Response(JSON.stringify(calendar),{status:200,headers:{'content-type':'application/json'}})}};
const state={config:{cash:10000,currency:'EUR'},positions:[],candidates:[candidate],newsRadar:[]};
const inner={run:async()=>({response:JSON.stringify({summary:'FINAL-CONTROLLER V27.5',actions:[]})})};
const guard=new AgmPreviewAiGuard(inner,{env,getState:()=>state});
const prompt=`PAPER-TRADING. Kandidaten=${JSON.stringify([candidate])} Gehalten=[]`;
const plan=JSON.parse((await guard.run({messages:[{role:'user',content:prompt}]})).response);
const buy=plan.actions.find(x=>x.symbol==='HVTEST.DE');
assert.equal(buy?.action,'BUY');
assert.match(buy.reason,/Tages-Score/);
assert.ok(buy.allocation_pct<=18&&buy.allocation_pct>=2);

// An unsafe live chart blocks the trade but still must not rewrite the stored daily score.
const unsafe={...candidate,day:7,dayChange:7,rsi:82};
const unsafeGuard=new AgmPreviewAiGuard(inner,{env,getState:()=>({...state,candidates:[unsafe]})});
const unsafePrompt=`PAPER-TRADING. Kandidaten=${JSON.stringify([unsafe])} Gehalten=[]`;
const unsafePlan=JSON.parse((await unsafeGuard.run({messages:[{role:'user',content:unsafePrompt}]})).response);
assert.equal(unsafePlan.actions.some(x=>x.symbol==='HVTEST.DE'&&x.action==='BUY'),false,'live safety may block a buy without re-scoring the calendar');

const heldGuard=new AgmPreviewAiGuard(inner,{env,getState:()=>({...state,positions:[{symbol:'HVTEST.DE',invested:1000,entry_price:10,last_price:10,entry_fx:1,last_fx:1,currency:'EUR'}]})});
const heldPlan=JSON.parse((await heldGuard.run({messages:[{role:'user',content:prompt}]})).response);
assert.equal(heldPlan.actions.some(x=>x.symbol==='HVTEST.DE'&&x.action==='BUY'),false,'AGM preview must never scale up an already held symbol');

console.log('V27.6 AGM daily-score regression tests: OK');
