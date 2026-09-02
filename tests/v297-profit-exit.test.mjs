import assert from 'node:assert/strict';
import {PROFIT_EXIT_V297,requiredProfitScoreDeltaV297,profitDecisionV297} from '../src/profit-exit-v297.js';

{
  const d=profitDecisionV297({entryScore:60,currentScore:75,chartMovePct:.5,scoreDeltaThisScan:2,chartMoveLastScanPct:.2});
  assert.equal(d.action,'HOLD','normal profit exit must not fire below +0.8% chart profit');
  assert.equal(d.reason,'profit_below_minimum');
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:70,chartMovePct:.8});
  assert.equal(d.action,'SELL');assert.equal(d.requiredDelta,10);
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:67,chartMovePct:2.1});
  assert.equal(d.action,'SELL');assert.equal(d.requiredDelta,7);
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:64,chartMovePct:3.6});
  assert.equal(d.action,'SELL');assert.equal(d.requiredDelta,4);
}
{
  assert.equal(requiredProfitScoreDeltaV297(94,.9),5,'high entry score 94 must need only the reachable rise toward 99');
  const d=profitDecisionV297({entryScore:94,currentScore:99,chartMovePct:.9});
  assert.equal(d.action,'SELL');
}
{
  assert.equal(requiredProfitScoreDeltaV297(98,.9),1,'entry score 98 must not wait for impossible +10');
  const d=profitDecisionV297({entryScore:98,currentScore:99,chartMovePct:.9});
  assert.equal(d.action,'SELL');
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:62,chartMovePct:5.2,scoreDeltaThisScan:.2,chartMoveLastScanPct:.05});
  assert.equal(d.action,'SELL');assert.equal(d.reason,'profit_lock_5','at +5% profit, secure gains when the move is no longer strongly accelerating');
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:68,chartMovePct:5.2,scoreDeltaThisScan:1.2,chartMoveLastScanPct:.2});
  assert.equal(d.action,'HOLD');assert.equal(d.reason,'profit_5_strong_rise','strongly rising score+chart may keep a +5% winner running');
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:66,chartMovePct:2.2});
  assert.equal(d.action,'HOLD','+2% still needs +7 score unless high-score adjustment applies');
}
{
  const d=profitDecisionV297({entryScore:73.7,currentScore:69.7,chartMovePct:1.906,scoreDeltaThisScan:0,chartMoveLastScanPct:0});
  assert.equal(d.action,'SELL','a profitable position with a >=3 point score fade and no renewed acceleration should protect the gain');
  assert.equal(d.reason,'profit_fade_lock');
}
{
  const d=profitDecisionV297({entryScore:73.7,currentScore:69.7,chartMovePct:1.906,scoreDeltaThisScan:1.2,chartMoveLastScanPct:.2});
  assert.equal(d.action,'HOLD','a winner that is accelerating again must not be sold only because the score is below its entry level');
}
{
  const d=profitDecisionV297({entryScore:73.7,currentScore:71.0,chartMovePct:1.2,scoreDeltaThisScan:0,chartMoveLastScanPct:0});
  assert.equal(d.action,'HOLD','a small score fade below the configured 3 point drop must not trigger the profit fade lock');
}

assert.equal(PROFIT_EXIT_V297.minProfitPct,.8);
assert.equal(PROFIT_EXIT_V297.mediumProfitPct,2);
assert.equal(PROFIT_EXIT_V297.largeProfitPct,3.5);
assert.equal(PROFIT_EXIT_V297.profitLockPct,5);
assert.equal(PROFIT_EXIT_V297.profitFadeScoreDrop,3);
assert.equal(PROFIT_EXIT_V297.highScoreTarget,99);
console.log('V29.7.1 adaptive profit exit tests: OK');
