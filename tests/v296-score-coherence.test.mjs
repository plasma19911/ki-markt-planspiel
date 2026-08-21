import assert from 'node:assert/strict';
import {DECISION_SCORE_V296,stableDecisionScoresV296,enforceDecisionScoreV296} from '../src/decision-score-v296.js';

const makeStorage=()=>{const m=new Map();return{m,storage:{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v))}}}};
const now=Date.parse('2026-08-21T09:00:00Z');
const strong={symbol:'TEST',name:'Test AG',price:100,score:5.8,confidence:.92,day_change:2,intraday20m:.8,intraday5m:.4,momentumAcceleration5:.15,volumeRatio:1.5,news_score:.5,targetVenueVerified:true,quoteAgeMinutes:.2};
const weak={symbol:'TEST',name:'Test AG',price:99.8,score:0,confidence:.1,day_change:-5,intraday20m:-1,intraday5m:-.6,momentumAcceleration5:-.2,volumeRatio:.2,news_score:-.6,targetVenueVerified:true,quoteAgeMinutes:.2};
const crash={...weak,price:96};
const state=(candidate,positions=[])=>({config:{cash:10000},candidates:candidate?[candidate]:[],positions,marketRegime:{regime:candidate===strong?'BROAD_UP':'RISK_OFF'},newsRadar:[]});

// Flat/near-flat market: scan frequency itself must not multiply score movement.
{
  const {storage}=makeStorage();
  const first=stableDecisionScoresV296(state(strong),storage,now,true).ranking[0];assert.ok(first.decisionScore>=56,'strong full candidate must clear immediate-buy threshold');
  const second=stableDecisionScoresV296(state(weak),storage,now+20_000,true).ranking[0];
  stableDecisionScoresV296(state(weak),storage,now+40_000,true);
  const fourth=stableDecisionScoresV296(state(weak),storage,now+60_000,false).ranking[0];
  assert.ok(first.rawDecisionScore-second.rawDecisionScore>=20,'test must create a large raw score collapse');
  assert.ok(first.decisionScore-second.decisionScore<=1.01,'after only 20 seconds and almost flat price a large raw drop may move the DecisionScore by about one point');
  assert.ok(first.decisionScore-fourth.decisionScore<=3.1,'three rapid near-flat scans within one minute must not create a 20+ point collapse');
  assert.equal(second.scoreChartAccelerated,false);
}

// Real chart shock in the same direction as the score may accelerate the response.
{
  const {storage}=makeStorage();
  const first=stableDecisionScoresV296(state(strong),storage,now,true).ranking[0];
  const second=stableDecisionScoresV296(state(crash),storage,now+20_000,false).ranking[0];
  assert.equal(second.scoreChartAccelerated,true,'a real 4% chart break must be allowed to accelerate the score response');
  assert.ok(first.decisionScore-second.decisionScore>5,'real chart movement must react materially faster than flat-chart noise');
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

// +10 profit exit: no immediate fee-churn re-buy at the unchanged high score. A meaningful
// score pullback rearms the symbol; then the normal >=56 rule applies again.
{
  const {storage}=makeStorage();
  const held={symbol:'TEST',entry_price:100,last_price:101,score:4,signal_confidence:.8};
  let plan={actions:[{symbol:'TEST',action:'SELL',allocation_pct:0,scoreExitV294:true,scoreExitKind:'PLUS_10',scoreExitEntry:60,scoreExitCurrent:70,scoreExitDelta:10,scoreExitChartMovePct:1,reason:'V29.4 SCORE-EXIT'}],summary:'sell'};
  let out=enforceDecisionScoreV296(plan,state(strong,[held]),storage,now);assert.equal(out.plan.actions[0].action,'SELL','the current authorized score exit remains SELL');
  assert.equal(out.reentry.locks.TEST.rearmScore,65,'profit exit at 70 rearms after a 5-point score pullback, not only below 56');

  plan={actions:[{symbol:'TEST',action:'BUY',allocation_pct:8,reason:'inner V29.3 immediate buy'}],summary:'next'};
  out=enforceDecisionScoreV296(plan,state(strong,[]),storage,now+60_000);assert.equal(out.plan.actions[0].action,'HOLD','unchanged high score immediately after exit must not cause a fee-churn re-buy');assert.ok(out.counters.reentryBlocks>=1);

  plan={actions:[{symbol:'TEST',action:'HOLD',allocation_pct:0}],summary:'pullback'};
  out=enforceDecisionScoreV296(plan,state(weak,[]),storage,now+7*3600_000);assert.ok(out.counters.reentryUnlocks>=1,'a meaningful pullback below the stored rearm score unlocks the symbol');

  plan={actions:[{symbol:'TEST',action:'HOLD',allocation_pct:0}],summary:'new signal'};
  out=enforceDecisionScoreV296(plan,state(strong,[]),storage,now+14*3600_000);assert.equal(out.plan.actions.find(a=>a.symbol==='TEST')?.action,'BUY','after rearm, a fresh >=56 signal is immediately buyable again');
}

// A terminal corporate emergency is categorically different from a normal score exit.
// Once sold for insolvency/delisting/fraud, the automatic >=56 re-entry must stay locked.
{
  const {storage}=makeStorage();
  const held={symbol:'TEST',entry_price:100,last_price:100,score:4,signal_confidence:.8};
  let plan={actions:[{symbol:'TEST',action:'SELL',allocation_pct:0,emergencyExitV296:true,emergencyExitKind:'TERMINAL_CORPORATE_EVENT',reason:'V29.6 NOTFALL-SELL: Insolvenz'}],summary:'terminal'};
  let out=enforceDecisionScoreV296(plan,state(strong,[held]),storage,now);assert.equal(out.plan.actions[0].action,'SELL');assert.equal(out.reentry.locks.TEST.kind,'TERMINAL');
  plan={actions:[{symbol:'TEST',action:'BUY',allocation_pct:8,reason:'inner immediate buy'}],summary:'next'};
  out=enforceDecisionScoreV296(plan,state(strong,[]),storage,now+24*3600_000);assert.equal(out.plan.actions[0].action,'HOLD','terminal emergency exit must never auto-rebuy merely because score is still >=56');assert.equal(out.reentry.locks.TEST.kind,'TERMINAL');
}

assert.equal(DECISION_SCORE_V296.immediateBuyMin,56);
assert.equal(DECISION_SCORE_V296.profitReentryResetPoints,5);
assert.equal(DECISION_SCORE_V296.lossReentryRecoveryPoints,5);
assert.equal(DECISION_SCORE_V296.terminalEmergencyReentry,'LOCKED');
assert.equal(DECISION_SCORE_V296.noSoftBuyBlocks,true);
console.log('V29.6 time/quality/chart coherent DecisionScore + directional/terminal reentry tests: OK');
