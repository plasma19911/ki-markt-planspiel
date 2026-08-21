import assert from 'node:assert/strict';
import {enforceScoreExitAuthorityV295,SCORE_EXIT_AUTHORITY_V295} from '../src/score-exit-authority-v295.js';

const state={positions:[{symbol:'BDL.NS',name:'Bharat Dynamics'}]};

{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,reason:'POSITION-SCORE V29.1 SELL: legacy score fell'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);
  const a=out.plan.actions[0];
  assert.equal(a.action,'HOLD','legacy position SELL must be blocked');
  assert.equal(out.counters.legacySellsSuppressed,1);
}

{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,reason:'PROFIT-LOCK V29.1: old profit rule'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);
  assert.equal(out.plan.actions[0].action,'HOLD','legacy profit-lock SELL must be blocked');
}

{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,reason:'V29.4 SCORE-EXIT: BDL.NS Einstiegsscore 60.0 -> chart-verankerter DecisionScore 70.0 (+10.0 Punkte).'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);
  assert.equal(out.plan.actions[0].action,'SELL','+10 score exit must remain SELL');
  assert.equal(out.counters.scoreSellsAllowed,1);
}

{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,reason:'V29.4 SCORE-EXIT: BDL.NS Einstiegsscore 60.0 -> chart-verankerter DecisionScore 45.0 (-15.0 Punkte).'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);
  assert.equal(out.plan.actions[0].action,'SELL','-15 score exit must remain SELL');
}

assert.equal(SCORE_EXIT_AUTHORITY_V295.positiveExitDelta,10);
assert.equal(SCORE_EXIT_AUTHORITY_V295.negativeExitDelta,-15);
assert.equal(SCORE_EXIT_AUTHORITY_V295.onlyNormalSellRule,true);
console.log('V29.5 authoritative +10/-15 score exit tests: OK');
