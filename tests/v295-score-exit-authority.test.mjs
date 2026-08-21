import assert from 'node:assert/strict';
import {enforceScoreExitAuthorityV295,SCORE_EXIT_AUTHORITY_V295} from '../src/score-exit-authority-v295.js';

const state={positions:[{symbol:'BDL.NS',name:'Bharat Dynamics'}],candidates:[{symbol:'BDL.NS'}]};

{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,reason:'POSITION-SCORE V29.1 SELL: legacy score fell'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);assert.equal(out.plan.actions[0].action,'HOLD','legacy position SELL must be blocked');assert.equal(out.counters.legacySellsSuppressed,1);
}
{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,reason:'V29.4 SCORE-EXIT: text only fake +10'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);assert.equal(out.plan.actions[0].action,'HOLD','reason text alone must never authorize a score SELL');assert.equal(out.counters.invalidScoreSellsSuppressed,1);
}
{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,scoreExitV294:true,scoreExitKind:'PLUS_10',scoreExitEntry:60,scoreExitCurrent:70,scoreExitDelta:10,scoreExitChartMovePct:1.2,reason:'V29.4 SCORE-EXIT'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);assert.equal(out.plan.actions[0].action,'SELL','structured +10 with positive chart must remain SELL');assert.equal(out.counters.scoreSellsAllowed,1);
}
{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,scoreExitV294:true,scoreExitKind:'PLUS_10',scoreExitEntry:60,scoreExitCurrent:70,scoreExitDelta:10,scoreExitChartMovePct:-1.2,reason:'V29.4 SCORE-EXIT'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);assert.equal(out.plan.actions[0].action,'HOLD','+10 with negative chart must not pass authority');
}
{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,scoreExitV294:true,scoreExitKind:'MINUS_15',scoreExitEntry:60,scoreExitCurrent:45,scoreExitDelta:-15,scoreExitChartMovePct:-2,reason:'V29.4 SCORE-EXIT'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);assert.equal(out.plan.actions[0].action,'SELL','structured -15 score exit must remain SELL');
}
{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,reason:'HARD-EVENT: bestätigte Insolvenz des Unternehmens'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);assert.equal(out.plan.actions[0].action,'SELL','a terminal insolvency event must remain an emergency SELL');assert.equal(out.plan.actions[0].emergencyExitV296,true);assert.equal(out.counters.terminalEmergencySellsAllowed,1);
}
{
  const plan={actions:[{symbol:'BDL.NS',action:'SELL',allocation_pct:0,reason:'Trend schwächer, Momentum fällt'}],summary:'test'};
  const out=enforceScoreExitAuthorityV295(plan,state);assert.equal(out.plan.actions[0].action,'HOLD','ordinary soft weakness must still be governed by +10/-15, not an emergency bypass');
}

assert.equal(SCORE_EXIT_AUTHORITY_V295.positiveExitDelta,10);
assert.equal(SCORE_EXIT_AUTHORITY_V295.negativeExitDelta,-15);
assert.equal(SCORE_EXIT_AUTHORITY_V295.onlyNormalSellRule,true);
assert.equal(SCORE_EXIT_AUTHORITY_V295.structuredAuthorization,true);
assert.equal(SCORE_EXIT_AUTHORITY_V295.terminalEmergencyExitAllowed,true);
console.log('V29.5 structured score exits + terminal emergency exit tests: OK');
