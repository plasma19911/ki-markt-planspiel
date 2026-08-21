import assert from 'node:assert/strict';
import {SCORE_ENTRY_EXIT_V294,scoreEntryExitDecisionV294,positionScoresV294} from '../src/score-entry-exit-v294.js';

const makeStorage=()=>{const m=new Map();return{m,storage:{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v))}}}};
const now=Date.parse('2026-08-21T09:00:00Z');

// BDL.NS regression: leaving the full candidate list after purchase must never switch
// the held position to the old partial-score scale.
{
  const {storage}=makeStorage();
  storage.kv.put('state/decision-score-v293',{version:29.3,candidates:{'BDL.NS':{at:now-60_000,stable:60,raw:60,coverage:1}},positions:{},stats:{}});
  const state={positions:[{symbol:'BDL.NS',entry_price:100,last_price:100.05,score:-2,signal_confidence:.5,opened_at:new Date(now-10*60_000).toISOString()}],candidates:[],marketRegime:{regime:'UNKNOWN'},newsRadar:[]};
  const row=positionScoresV294(state,storage,now,false).positionScores[0];
  assert.ok(row,'BDL.NS muss einen Positionsscore erhalten');
  assert.equal(row.decisionScore,60,'Teilscore darf den zuvor gekauften DecisionScore nicht auf eine andere Skala ziehen');
  assert.equal(row.scoreFrozenPartial,true,'unvollstaendige Positionsdaten muessen den Score einfrieren');
  assert.ok(Math.abs(row.chartMoveFromEntryPct)<.1,'Chart ist praktisch unveraendert');
}

// Flat chart: even a strong full signal may only move the held score slowly.
{
  const {storage}=makeStorage();
  storage.kv.put('state/score-entry-exit-v294',{version:29.4,entries:{'BDL.NS':{score:60,lastStable:60,entryPrice:99,lastPrice:100,at:now-60_000,lastAt:now-60_000,source:'BUY_DECISION_SCORE',fullSeen:true}},recent:[],stats:{}});
  const strong={symbol:'BDL.NS',name:'Bharat Dynamics',price:105,score:5.8,confidence:.92,day_change:1.2,intraday20m:.9,intraday5m:.45,momentumAcceleration5:.16,volumeRatio:1.6,news_score:.4,targetVenueVerified:true};
  const state={positions:[{symbol:'BDL.NS',entry_price:100,last_price:100.10,score:4,signal_confidence:.8,opened_at:new Date(now-20*60_000).toISOString()}],candidates:[strong],marketRegime:{regime:'BROAD_UP'},newsRadar:[]};
  const row=positionScoresV294(state,storage,now,false).positionScores[0];
  assert.ok(Math.abs(row.scoreDeltaThisScan)<=1.01,'bei <0,25% Chartbewegung darf der Held-Score pro Entscheidung maximal 1 Punkt laufen');
  assert.ok(Math.abs(row.scoreDeltaFromEntry)<=3.01,'bei <0,25% seit Kauf bleibt der Score innerhalb von +/-3 Punkten um den Einstieg');
  assert.ok(Math.abs(row.chartMoveFromEntryPct-.1)<.02,'der echte Positions-Einstiegskurs muss Vorrang vor dem vorlaeufig gespeicherten Kandidatenkurs haben');
}

{
  let d=scoreEntryExitDecisionV294(60,69.9,{chartMoveFromEntryPct:1});assert.equal(d.action,'HOLD','+9,9 Punkte noch halten');
  d=scoreEntryExitDecisionV294(60,70,{chartMoveFromEntryPct:1});assert.equal(d.action,'SELL','+10 bei positivem Chart verkaufen');assert.equal(d.reason,'score_plus_10');
  d=scoreEntryExitDecisionV294(60,70,{chartMoveFromEntryPct:-1});assert.equal(d.action,'HOLD','+10 Score bei fallendem Chart darf nicht als Gewinn-Exit missverstanden werden');assert.equal(d.reason,'plus_10_wait_positive_chart');
  d=scoreEntryExitDecisionV294(60,45.1,{chartMoveFromEntryPct:-2});assert.equal(d.action,'HOLD','-14,9 Punkte noch halten');
  d=scoreEntryExitDecisionV294(60,45,{chartMoveFromEntryPct:-2});assert.equal(d.action,'SELL','-15 Punkte seit Kauf verkaufen');assert.equal(d.reason,'score_minus_15');
  d=scoreEntryExitDecisionV294(60,40,{partial:true,chartMoveFromEntryPct:-5});assert.equal(d.action,'HOLD','Teilscore darf keinen falschen -15 Exit ausloesen');
}

assert.equal(SCORE_ENTRY_EXIT_V294.positiveExitDelta,10);
assert.equal(SCORE_ENTRY_EXIT_V294.negativeExitDelta,-15);
assert.equal(SCORE_ENTRY_EXIT_V294.partialScoreFreeze,true);
assert.equal(SCORE_ENTRY_EXIT_V294.positiveExitRequiresPositiveChart,true);
console.log('V29.4/V29.6 coherent chart-anchored +10/-15 exit tests: OK');
