import test from 'node:test';
import assert from 'node:assert/strict';
import {updateOutcomeLearningMemoryV312,recordOutcomeDecisionsV312,enforceOutcomeEarlyEntryV312} from '../src/outcome-learning-core-v312.js';

const t0=Date.UTC(2026,7,27,12,0,0);
const exact={symbol:'TEST',name:'Test AG',isin:'DE0000000001',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic assets master'};
const candidate=(price=100,score=64)=>({...exact,price,daytradeLiveScore:score,confidence:.74,momentum5Pct:.24,momentum20Pct:.3,acceleration5Pct:.08,newsScore:.2,day_change:1.1,intradayRsi:61,chartDirectionMode:'UP',eventRisk:'NONE',momentumSellSignal:'NONE',theme:'TECH'});

test('tracks ordinary candidates, not only early signals',()=>{
  let l=updateOutcomeLearningMemoryV312({}, {candidates:[candidate(100,55)],positions:[]},t0);
  l=recordOutcomeDecisionsV312(l.memory,{candidates:[candidate(100,55)],positions:[]},{actions:[{symbol:'TEST',action:'HOLD'}]},l.predictions,t0);
  assert.equal(l.status.trackedSymbols,1);
});

test('learns a missed HOLD opportunity after 20 minutes',()=>{
  let l=updateOutcomeLearningMemoryV312({}, {candidates:[candidate(100,62)],positions:[]},t0);
  let rec=recordOutcomeDecisionsV312(l.memory,{candidates:[candidate(100,62)],positions:[]},{actions:[{symbol:'TEST',action:'HOLD'}]},l.predictions,t0);
  l=updateOutcomeLearningMemoryV312(rec.memory,{candidates:[candidate(101.2,66)],positions:[]},t0+21*60000);
  assert.equal(l.status.matured,1);
  assert.equal(l.status.missedOpportunities,1);
  assert.ok(l.status.weights.velocity!==undefined);
});

test('BUY outcome updates online weights and buy statistics',()=>{
  let l=updateOutcomeLearningMemoryV312({}, {candidates:[candidate(100,64)],positions:[]},t0);
  let rec=recordOutcomeDecisionsV312(l.memory,{candidates:[candidate(100,64)],positions:[]},{actions:[{symbol:'TEST',action:'BUY'}]},l.predictions,t0);
  const before={...rec.memory.weights};
  l=updateOutcomeLearningMemoryV312(rec.memory,{candidates:[candidate(101,69)],positions:[]},t0+21*60000);
  assert.equal(l.status.matured,1);
  assert.equal(l.status.buySamples,1);
  assert.equal(l.status.buyHitRate,100);
  assert.ok(Object.keys(before).some(k=>Math.abs(before[k]-l.status.weights[k])>1e-9));
});

test('safe learned forecast may convert HOLD to bounded BUY',()=>{
  const old=t0-5*60000;
  const memory={version:31.2,weights:{velocity:3.6,m5:2.8,m20:2.6,accel:2.2,news:1.8,confidence:1.2,direction:1.2},symbols:{TEST:{lastSeenAt:old,samples:[{ts:old,price:99,score:58,action:'HOLD',forecast20mScore:63,features:{},evaluations:{}}]}},recent20:[],stats:{},groupStats:{regime:{},theme:{},source:{}}};
  const c=candidate(100,64),l=updateOutcomeLearningMemoryV312(memory,{candidates:[c],positions:[]},t0);
  assert.equal(l.predictions.TEST.earlySignal,true);
  const out=enforceOutcomeEarlyEntryV312({actions:[{symbol:'TEST',action:'HOLD',reason:'noch nicht'}]}, {positions:[],candidates:[c]},l,[exact]);
  assert.equal(out.plan.actions[0].action,'BUY');
  assert.equal(out.plan.actions[0].outcomeEntryV312,true);
  assert.ok(out.plan.actions[0].allocation_pct<=42);
});
