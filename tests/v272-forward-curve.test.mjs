import assert from 'node:assert/strict';
import {updateForwardCurveLearning,getForwardCurveForecast,marketRegime} from '../src/forward-curve-learning.js';
import {calibratedEntryExpectation} from '../src/portfolio-risk-calibration.js';

const KEY='state/forward-curve-learning-v1';
const candidate=(symbol='CURVE.DE',price=100,extra={})=>({symbol,price,score:5.2,confidence:.72,day_change:1.2,momentum5:.10,momentum20:.25,momentum_acceleration5:.05,rsi:61,drawdown_from_20m_high_pct:-.75,volume_ratio:1.2,news_score:.1,...extra});
const storage=()=>{const data=new Map();return{data,kv:{get:k=>data.get(k),put:(k,v)=>data.set(k,v)}}};

{
 const r=marketRegime([candidate('A',100,{momentum20:.3,momentum5:.12}),candidate('B',100,{momentum20:.25,momentum5:.08}),candidate('C',100,{momentum20:.2,momentum5:.09})]);
 assert.equal(r.regime,'BROAD_UP');
}

function matureScenario(finalPrice){
 const s=storage(),c=candidate();
 updateForwardCurveLearning(s,{candidates:[c]});
 let state=s.data.get(KEY),p=state.pending[0];
 state.pending=Array.from({length:20},()=>({...structuredClone(p),at:Date.now()-6*60000,done:{}}));s.data.set(KEY,state);
 updateForwardCurveLearning(s,{candidates:[candidate('CURVE.DE',finalPrice)]});
 state=s.data.get(KEY);state.pending=state.pending.filter(x=>x.price===100).map(x=>({...x,at:Date.now()-16*60000}));s.data.set(KEY,state);
 updateForwardCurveLearning(s,{candidates:[candidate('CURVE.DE',finalPrice)]});
 state=s.data.get(KEY);state.pending=state.pending.filter(x=>x.price===100).map(x=>({...x,at:Date.now()-31*60000}));s.data.set(KEY,state);
 updateForwardCurveLearning(s,{candidates:[candidate('CURVE.DE',finalPrice)]});
 return{s,forecast:getForwardCurveForecast(s,candidate('CURVE.DE',finalPrice),[candidate('CURVE.DE',finalPrice)])};
}

{
 const {forecast}=matureScenario(99);
 assert.ok(forecast.samples>=18,'mindestens 18 ähnliche Fälle müssen als reif gelten');
 assert.equal(forecast.block,true,'reifes deutlich negatives 15/30m-Muster muss BUY blockieren');
 assert.ok(forecast.horizons[15].expectedPct<-.4);
 const e=calibratedEntryExpectation({...candidate('CURVE.DE',99),forwardForecast:forecast},{buckets:[]});
 assert.equal(e.block,true,'negative Vorwärtsprognose muss in finale Setup-Kalibrierung eingehen');
}

{
 const {forecast}=matureScenario(101);
 assert.equal(forecast.block,false);
 assert.ok(forecast.horizons[15].expectedPct>.4);
 assert.ok(forecast.sizeMultiplier>1&&forecast.sizeMultiplier<=1.12,'positive Prognose darf nur moderat die Größe erhöhen');
 const e=calibratedEntryExpectation({...candidate('CURVE.DE',101),forwardForecast:forecast},{buckets:[]});
 assert.equal(e.block,false);
 assert.ok(e.sizeMultiplier<=1.18,'auch kombiniert bleibt die Größenanhebung gedeckelt');
}

console.log('V27.2 forward curve learning regression tests: OK');
