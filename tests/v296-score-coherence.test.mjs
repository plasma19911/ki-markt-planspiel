import assert from 'node:assert/strict';
import {DECISION_SCORE_V296,stableDecisionScoresV296,enforceDecisionScoreV296} from '../src/decision-score-v296.js';

const makeStorage=()=>{const m=new Map();return{m,storage:{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v))}}}};
const now=Date.parse('2026-08-21T09:00:00Z');
const strong={symbol:'TEST',name:'Test AG',price:100,score:5.8,confidence:.92,day_change:2,intraday20m:.8,intraday5m:.4,momentumAcceleration5:.15,volumeRatio:1.5,news_score:.5,targetVenueVerified:true,quoteAgeMinutes:.2};
const weak={symbol:'TEST',name:'Test AG',price:99.8,score:0,confidence:.1,day_change:-5,intraday20m:-1,intraday5m:-.6,momentumAcceleration5:-.2,volumeRatio:.2,news_score:-.6,targetVenueVerified:true,quoteAgeMinutes:.2};
const state=(candidate,positions=[])=>({config:{cash:10000},candidates:candidate?[candidate]:[],positions,marketRegime:{regime:candidate===strong?'BROAD_UP':'RISK_OFF'},newsRadar:[]});

// Score changes must depend on elapsed time, not on how often the scanner happens to call.
{
  const {storage}=makeStorage();
  const first=stableDecisionScoresV296(state(strong),storage,now,true).ranking[0];assert.ok(first.decisionScore>=56,'strong full candidate must clear immediate-buy threshold');
  const second=stableDecisionScoresV296(state(weak),storage,now+20_000,true).ranking[0];
  const third=stableDecisionScoresV296(state(weak),storage,now+40_000,true).ranking[0];
  const fourth=stableDecisionScoresV296(state(weak),storage,now+60_000,false).ranking[0];
  assert.ok(first.rawDecisionScore-second.rawDecisionScore>=20,'test must create a large raw score collapse');
  assert.ok(first.decisionScore-second.decisionScore<=1.01,'after only 20 seconds a large drop may move the DecisionScore by about one point, not eight');
  assert.ok(first.decisionScore-fourth.decisionScore<=3.1,'three rapid scans within one minute must not multiply the per-scan drop into a 20+ point collapse');
  assert.equal(second.scoreSmoothed,true);
}

// Missing evidence is not a separate blocker; it is reflected inside the score itself.
{
  const {storage}=makeStorage();
  const sparse={symbol:'SPARSE',price:100,score:5.5,quoteAgeMinutes:.2};
  const row=stableDecisionScoresV296({config:{cash:10000},candidates:[sparse],positions:[],marketRegime:{regime:'UNKNOWN'},newsRadar:[]},storage,now,false).ranking[0];
  assert.ok(row.coverage<.3,'sparse fixture must have low coverage');
  assert.ok(row.scoreQualityFactor<.65,'low coverage must reduce score amplitude toward neutral');
  assert.ok(row.decisionScore<56,'one isolated scanner field must not accidentally become a 56+ immediate buy');
}

// After any +10/-15 score exit the same still-high signal must not be sold and bought back
// every scan. It has to reset below 56 once; after a later fresh rise above 56 it is eligible again.
{
  const {storage}=makeStorage();
  const held={symbol:'TEST',entry_price:100,last_price:101,score:4,signal_confidence:.8};
  let plan={actions:[{symbol:'TEST',action:'SELL',allocation_pct:0,scoreExitV294:true,scoreExitKind:'PLUS_10',scoreExitEntry:60,scoreExitCurrent:70,scoreExitDelta:10,scoreExitChartMovePct:1,reason:'V29.4 SCORE-EXIT'}],summary:'sell'};
  let out=enforceDecisionScoreV296(plan,state(strong,[held]),storage,now);assert.equal(out.plan.actions[0].action,'SELL','the current authorized score exit remains SELL');
  assert.ok(out.reentry.locks.TEST,'score exit must create a reset lock');

  plan={actions:[{symbol:'TEST',action:'BUY',allocation_pct:8,reason:'inner V29.3 immediate buy'}],summary:'next'};
  out=enforceDecisionScoreV296(plan,state(strong,[]),storage,now+60_000);assert.equal(out.plan.actions[0].action,'HOLD','still-high score immediately after exit must not cause a fee-churn re-buy');assert.ok(out.counters.reentryBlocks>=1);

  plan={actions:[{symbol:'TEST',action:'HOLD',allocation_pct:0}],summary:'reset'};
  out=enforceDecisionScoreV296(plan,state(weak,[]),storage,now+7*3600_000);assert.ok(out.counters.reentryUnlocks>=1,'a later observed score below 56 unlocks the symbol');

  plan={actions:[{symbol:'TEST',action:'HOLD',allocation_pct:0}],summary:'rise'};
  out=enforceDecisionScoreV296(plan,state(strong,[]),storage,now+14*3600_000);assert.equal(out.plan.actions.find(a=>a.symbol==='TEST')?.action,'BUY','after reset, a new fresh >=56 signal is immediately buyable again');
}

assert.equal(DECISION_SCORE_V296.immediateBuyMin,56);
assert.equal(DECISION_SCORE_V296.reentryResetBelow,56);
assert.equal(DECISION_SCORE_V296.noSoftBuyBlocks,true);
console.log('V29.6 time/quality coherent DecisionScore + reentry reset tests: OK');
