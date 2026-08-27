import test from 'node:test';
import assert from 'node:assert/strict';
import {updatePredictiveLearningMemory,enforcePredictiveEarlyEntryV311} from '../src/predictive-learning-core-v311.js';

const now=Date.UTC(2026,7,27,12,0,0);
const exact={symbol:'TEST',name:'Test AG',isin:'DE0000000001',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic assets master'};
const candidate={...exact,price:101,daytradeLiveScore:64,confidence:.72,momentum5Pct:.22,momentum20Pct:.28,acceleration5Pct:.08,newsScore:.15,day_change:1.2,intradayRsi:61,chartDirectionMode:'UP',eventRisk:'NONE',momentumSellSignal:'NONE'};

test('V31.1 builds an early signal from rising score plus confirming tape',()=>{
  const memory={version:31.1,symbols:{TEST:{lastSeenAt:now-5*60000,samples:[{ts:now-5*60000,price:100,score:60,forecast20mScore:65,signalConfidence:.5,earlySignal:false,evaluated:false}]}},stats:{matured:0,wins:0,sumReturn:0,sumAbsReturn:0}};
  const learning=updatePredictiveLearningMemory(memory,[candidate],now);
  const p=learning.predictions.TEST;
  assert.equal(p.earlySignal,true);
  assert.ok(p.velocity5>=3.9);
  assert.ok(p.forecast20mScore>=72);
});

test('V31.1 can convert a safe HOLD into a bounded predictive BUY',()=>{
  const memory={version:31.1,symbols:{TEST:{lastSeenAt:now-5*60000,samples:[{ts:now-5*60000,price:100,score:60,forecast20mScore:65,signalConfidence:.5,earlySignal:false,evaluated:false}]}},stats:{matured:0,wins:0,sumReturn:0,sumAbsReturn:0}};
  const learning=updatePredictiveLearningMemory(memory,[candidate],now);
  const plan={actions:[{symbol:'TEST',action:'HOLD',reason:'Signal noch nicht bestaetigt'}],summary:'test'};
  const state={positions:[],candidates:[candidate],config:{cash:10000}};
  const out=enforcePredictiveEarlyEntryV311(plan,state,learning,[exact]);
  const action=out.plan.actions.find(a=>a.symbol==='TEST');
  assert.equal(action.action,'BUY');
  assert.equal(action.predictiveEntryV311,true);
  assert.ok(action.allocation_pct>=12&&action.allocation_pct<=36);
});

test('hard event risk still blocks predictive early entry',()=>{
  const risky={...candidate,eventRisk:'HIGH'};
  const memory={version:31.1,symbols:{TEST:{lastSeenAt:now-5*60000,samples:[{ts:now-5*60000,price:100,score:60,forecast20mScore:65,signalConfidence:.5,earlySignal:false,evaluated:false}]}},stats:{matured:0,wins:0,sumReturn:0,sumAbsReturn:0}};
  const learning=updatePredictiveLearningMemory(memory,[risky],now);
  const out=enforcePredictiveEarlyEntryV311({actions:[{symbol:'TEST',action:'HOLD',reason:'HARD-EVENT'}]}, {positions:[],candidates:[risky]},learning,[exact]);
  assert.notEqual(out.plan.actions[0].action,'BUY');
});

test('matured early signals are scored against the later price',()=>{
  const old=now-21*60000;
  const memory={version:31.1,symbols:{TEST:{lastSeenAt:old,samples:[{ts:old,price:100,score:63,forecast20mScore:74,signalConfidence:.7,earlySignal:true,evaluated:false}]}},stats:{matured:0,wins:0,sumReturn:0,sumAbsReturn:0}};
  const learning=updatePredictiveLearningMemory(memory,[candidate],now);
  assert.equal(learning.status.matured,1);
  assert.equal(learning.status.wins,1);
  assert.ok(learning.status.avg20mReturnPct>0);
});
