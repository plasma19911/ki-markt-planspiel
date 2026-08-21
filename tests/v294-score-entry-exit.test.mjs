import assert from 'node:assert/strict';
import {SCORE_ENTRY_EXIT_V294,scoreEntryExitDecisionV294,positionScoresV294} from '../src/score-entry-exit-v294.js';

const makeStorage=()=>{const m=new Map();return{m,storage:{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v))}}}};
const now=Date.parse('2026-08-21T09:00:00Z');

// User-visible bug reproduction: after purchase the symbol can disappear from the full
// candidate list. V28.7 then creates a partial position score from the old position.score
// scale, which can be ~40 although the chart barely moved. V29.4 must carry the previous
// candidate DecisionScore forward instead of accepting that scale switch.
{
  const {storage}=makeStorage();
  storage.kv.put('state/decision-score-v293',{
    version:29.3,candidates:{'BDL.NS':{at:now-60_000,stable:60,raw:60,coverage:1}},positions:{},stats:{}
  });
  const state={
    positions:[{symbol:'BDL.NS',entry_price:100,last_price:100.05,score:-2,signal_confidence:.5,opened_at:new Date(now-10*60_000).toISOString()}],
    candidates:[],marketRegime:{regime:'UNKNOWN'},newsRadar:[]
  };
  const row=positionScoresV294(state,storage,now,false).positionScores[0];
  assert.ok(row,'BDL.NS muss einen V29.4 Positionsscore erhalten');
  assert.ok(row.rawDecisionScore<45,'Test muss den alten Teilscore-Absturz reproduzieren');
  assert.equal(row.decisionScore,60,'Teilscore darf den zuvor gekauften/gespeicherten DecisionScore nicht auf 40 ziehen');
  assert.equal(row.scoreFrozenPartial,true,'unvollstaendige Positionsdaten muessen den Score einfrieren');
  assert.ok(Math.abs(row.chartMoveFromEntryPct)<.1,'Chart ist im Reproduktionstest praktisch unveraendert');
}

// Even with a very strong fresh full score, a virtually flat chart may move the held
// DecisionScore only slightly per decision and only within a small envelope around entry.
{
  const {storage}=makeStorage();
  storage.kv.put('state/score-entry-exit-v294',{
    version:29.4,entries:{'BDL.NS':{score:60,lastStable:60,entryPrice:100,lastPrice:100,at:now-60_000,lastAt:now-60_000,source:'BUY_DECISION_SCORE',fullSeen:true}},recent:[],stats:{}
  });
  const strong={symbol:'BDL.NS',name:'Bharat Dynamics',price:100.10,score:5.8,confidence:.92,day_change:1.2,intraday20m:.9,intraday5m:.45,momentumAcceleration5:.16,volumeRatio:1.6,news_score:.4,targetVenueVerified:true};
  const state={positions:[{symbol:'BDL.NS',entry_price:100,last_price:100.10,score:4,signal_confidence:.8,opened_at:new Date(now-20*60_000).toISOString()}],candidates:[strong],marketRegime:{regime:'BROAD_UP'},newsRadar:[]};
  const row=positionScoresV294(state,storage,now,false).positionScores[0];
  assert.ok(Math.abs(row.scoreDeltaThisScan)<=1.01,'bei <0,25% Chartbewegung darf der Held-Score pro Entscheidung maximal 1 Punkt laufen');
  assert.ok(Math.abs(row.scoreDeltaFromEntry)<=3.01,'bei <0,25% seit Kauf bleibt der Score innerhalb von +/-3 Punkten um den Einstieg');
}

{
  let d=scoreEntryExitDecisionV294(60,69.9);assert.equal(d.action,'HOLD','+9,9 Punkte noch halten');
  d=scoreEntryExitDecisionV294(60,70);assert.equal(d.action,'SELL','+10 Punkte seit Kauf verkaufen');assert.equal(d.reason,'score_plus_10');
  d=scoreEntryExitDecisionV294(60,45.1);assert.equal(d.action,'HOLD','-14,9 Punkte noch halten');
  d=scoreEntryExitDecisionV294(60,45);assert.equal(d.action,'SELL','-15 Punkte seit Kauf verkaufen');assert.equal(d.reason,'score_minus_15');
  d=scoreEntryExitDecisionV294(60,40,{partial:true});assert.equal(d.action,'HOLD','Teilscore darf keinen falschen -15 Exit ausloesen');
}

assert.equal(SCORE_ENTRY_EXIT_V294.positiveExitDelta,10);
assert.equal(SCORE_ENTRY_EXIT_V294.negativeExitDelta,-15);
assert.equal(SCORE_ENTRY_EXIT_V294.partialScoreFreeze,true);
console.log('V29.4 chart-anchored position score +10/-15 exit tests: OK');
