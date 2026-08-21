import assert from 'node:assert/strict';
import {SCORE_ENTRY_EXIT_V294,scoreEntryExitDecisionV294,positionScoresV294,enforceScoreEntryExitV294} from '../src/score-entry-exit-v294.js';

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

// An inner legacy BUY is not enough to create a position baseline. V29.6 can still reject
// that BUY later, therefore only a symbol that really appears in state.positions may own a baseline.
{
  const {storage}=makeStorage();
  const candidate={symbol:'GHOST',price:100,score:5.8,confidence:.92,day_change:1,intraday20m:.8,intraday5m:.4,momentumAcceleration5:.15,volumeRatio:1.5,news_score:.4,targetVenueVerified:true};
  const state={positions:[],candidates:[candidate],marketRegime:{regime:'BROAD_UP'},newsRadar:[]};
  const out=enforceScoreEntryExitV294({actions:[{symbol:'GHOST',action:'BUY',allocation_pct:8,reason:'inner legacy BUY'}],summary:'test'},state,storage,now);
  assert.equal(out.entries.GHOST,undefined,'unconfirmed inner BUY must not leave a fake held-position baseline');
}

// Old pending baseline migration: once a real position appears, replace the pending score
// with the coherent V29.6 memory and the actual broker-simulated entry price.
{
  const {storage}=makeStorage();
  storage.kv.put('state/score-entry-exit-v294',{version:29.4,entries:{'BDL.NS':{score:44,lastStable:44,entryPrice:90,lastPrice:90,at:now-3600_000,lastAt:now-3600_000,source:'BUY_DECISION_SCORE'}},recent:[],stats:{}});
  storage.kv.put('state/decision-score-v296',{version:29.6,candidates:{'BDL.NS':{at:now-60_000,stable:60,raw:60,coverage:1,price:100,parts:{}}},positions:{},stats:{}});
  const state={positions:[{symbol:'BDL.NS',entry_price:100,last_price:100.05,score:-2,signal_confidence:.5,opened_at:new Date(now-5*60_000).toISOString()}],candidates:[],marketRegime:{regime:'UNKNOWN'},newsRadar:[]};
  const row=positionScoresV294(state,storage,now,true).positionScores[0];
  assert.equal(row.entryDecisionScore,60,'real position must replace old pending baseline with coherent score memory');
  assert.ok(Math.abs(row.chartMoveFromEntryPct-.05)<.02,'actual position entry price must replace stale pending entry quote');
}

// Flat chart: even a strong full signal may only move the held score slowly.
{
  const {storage}=makeStorage();
  storage.kv.put('state/score-entry-exit-v294',{version:29.4,entries:{'BDL.NS':{score:60,lastStable:60,entryPrice:99,lastPrice:100,at:now-60_000,lastAt:now-60_000,source:'CONFIRMED_POSITION_BASELINE',fullSeen:true}},recent:[],stats:{}});
  const strong={symbol:'BDL.NS',name:'Bharat Dynamics',price:105,score:5.8,confidence:.92,day_change:1.2,intraday20m:.9,intraday5m:.45,momentumAcceleration5:.16,volumeRatio:1.6,news_score:.4,targetVenueVerified:true};
  const state={positions:[{symbol:'BDL.NS',entry_price:100,last_price:100.10,score:4,signal_confidence:.8,opened_at:new Date(now-20*60_000).toISOString()}],candidates:[strong],marketRegime:{regime:'BROAD_UP'},newsRadar:[]};
  const row=positionScoresV294(state,storage,now,false).positionScores[0];
  assert.ok(Math.abs(row.scoreDeltaThisScan)<=1.01,'bei <0,25% Chartbewegung darf der Held-Score pro Entscheidung maximal 1 Punkt laufen');
  assert.ok(Math.abs(row.scoreDeltaFromEntry)<=3.01,'bei <0,25% seit Kauf bleibt der Score innerhalb von +/-3 Punkten um den Einstieg');
  assert.ok(Math.abs(row.chartMoveFromEntryPct-.1)<.02,'der echte Positions-Einstiegskurs muss Vorrang vor dem gespeicherten Kandidatenkurs haben');
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
assert.equal(SCORE_ENTRY_EXIT_V294.baselineRequiresActualPosition,true);
console.log('V29.4/V29.6 confirmed baseline + coherent chart-anchored +10/-15 exit tests: OK');
