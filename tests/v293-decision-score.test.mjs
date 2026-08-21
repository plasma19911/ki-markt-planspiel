import assert from 'node:assert/strict';
import {DECISION_SCORE_V293,stableDecisionScoresV293,enforceImmediateBuyV293} from '../src/decision-score-v293.js';

const makeStorage=()=>{const m=new Map();return{m,storage:{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v))}}}};
const now=Date.parse('2026-08-21T08:30:00Z');
const strong={symbol:'TEST',name:'Test AG',price:100,score:5.5,confidence:.9,day_change:2,intraday20m:.8,intraday5m:.4,momentumAcceleration5:.15,volumeRatio:1.5,news_score:.5,targetVenueVerified:false};
const weak={symbol:'TEST',name:'Test AG',price:100,score:0,confidence:.1,day_change:-5,intraday20m:-1,intraday5m:-.6,momentumAcceleration5:-.2,volumeRatio:.2,news_score:-.6,targetVenueVerified:false};
const state=c=>({config:{cash:10000},candidates:[c],positions:[],marketRegime:{regime:c===strong?'BROAD_UP':'RISK_OFF'},newsRadar:[]});

{
  const {storage}=makeStorage();
  const first=stableDecisionScoresV293(state(strong),storage,now,true).ranking[0];
  assert.ok(first.decisionScore>=56,'starker Kandidat muss ueber der Sofortkaufgrenze liegen');
  const second=stableDecisionScoresV293(state(weak),storage,now+60_000,false).ranking[0];
  assert.ok(first.rawDecisionScore-second.rawDecisionScore>=20,'Test muss einen echten grossen Rohscore-Sprung erzeugen');
  assert.ok(first.decisionScore-second.decisionScore<=DECISION_SCORE_V293.maxDropPerDecision+.01,'72->36-artige Spruenge duerfen im DecisionScore nicht mehr in einem Schritt durchschlagen');
  assert.ok(second.scoreSmoothed,'grosser Rohscore-Sprung muss als geglaettet markiert werden');
}

{
  const {storage}=makeStorage();
  const plan={actions:[{symbol:'TEST',action:'HOLD',allocation_pct:0,reason:'legacy hard block'}],summary:'test'};
  const out=enforceImmediateBuyV293(plan,state(strong),storage,now);
  assert.equal(out.plan.actions.find(a=>a.symbol==='TEST')?.action,'BUY','Score >=56 muss auch bei altem Hard-Block sofort BUY werden');
  assert.equal(out.counters.forcedBuys,1);
}

{
  const {storage}=makeStorage();
  const plan={actions:[{symbol:'TEST',action:'BUY',allocation_pct:8,reason:'legacy buy'}],summary:'test'};
  const out=enforceImmediateBuyV293(plan,state(weak),storage,now);
  assert.equal(out.plan.actions.find(a=>a.symbol==='TEST')?.action,'HOLD','unter 56 darf kein neuer BUY bestehen bleiben');
  assert.equal(out.counters.blockedBelow56,1);
}

assert.equal(DECISION_SCORE_V293.immediateBuyMin,56);
assert.equal(DECISION_SCORE_V293.noSoftBuyBlocks,true);
console.log('V29.3 stable DecisionScore + immediate BUY>=56 tests: OK');
