import assert from 'node:assert/strict';
import {PROFIT_EXIT_V297,requiredProfitScoreDeltaV297,profitDecisionV297} from '../src/profit-exit-v297.js';

{
  const d=profitDecisionV297({entryScore:60,currentScore:55,chartMovePct:.5,scoreDeltaThisScan:-2,chartMoveLastScanPct:-.2});
  assert.equal(d.action,'HOLD','normal profit exit must not fire below +0.8% chart profit');
  assert.equal(d.reason,'profit_below_minimum');
}
{
  const d=profitDecisionV297({entryScore:73.7,currentScore:69.7,chartMovePct:1.9,scoreDeltaThisScan:0,chartMoveLastScanPct:0});
  assert.equal(d.action,'SELL','a +1.9% winner with score deterioration from entry should be protected');
  assert.equal(d.reason,'profit_0_8_fade_lock');
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:70,chartMovePct:.9,scoreDeltaThisScan:.2,chartMoveLastScanPct:.05});
  assert.equal(d.action,'HOLD','a healthy profitable position should not be sold merely because its score improved');
  assert.equal(d.reason,'profit_running_not_fading');
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:67,chartMovePct:2.1,scoreDeltaThisScan:0,chartMoveLastScanPct:0});
  assert.equal(d.action,'HOLD','a +2% winner with a healthy score should be allowed to run');
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:59,chartMovePct:2.1,scoreDeltaThisScan:-.2,chartMoveLastScanPct:0});
  assert.equal(d.action,'SELL','a +2% winner that has faded to/below entry quality should lock profit');
  assert.equal(d.reason,'profit_2_fade_lock');
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:64,chartMovePct:3.6,scoreDeltaThisScan:.2,chartMoveLastScanPct:.05});
  assert.equal(d.action,'HOLD','a large winner may continue while score and chart are not fading');
}
{
  const d=profitDecisionV297({entryScore:60,currentScore:64,chartMovePct:3.6,scoreDeltaThisScan:-.1,chartMoveLastScanPct:0});
  assert.equal(d.action,'SELL','any clear score fade should secure a large +3.5% winner');
  assert.equal(d.reason,'profit_3_5_fade_lock');
}
{
  assert.equal(requiredProfitScoreDeltaV297(94,.9),5,'legacy diagnostic headroom remains reachable for high entry scores');
  assert.equal(requiredProfitScoreDeltaV297(98,.9),1,'legacy diagnostic headroom remains reachable near score 99');
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
  const d=profitDecisionV297({entryScore:60,currentScore:66,chartMovePct:1.2,scoreDeltaThisScan:-1.2,chartMoveLastScanPct:-.15});
  assert.equal(d.action,'SELL','joint short-term score+chart fade should protect even a modest existing winner');
}

assert.equal(PROFIT_EXIT_V297.minProfitPct,.8);
assert.equal(PROFIT_EXIT_V297.mediumProfitPct,2);
assert.equal(PROFIT_EXIT_V297.largeProfitPct,3.5);
assert.equal(PROFIT_EXIT_V297.profitLockPct,5);
assert.equal(PROFIT_EXIT_V297.smallProfitFadeDelta,-3);
assert.equal(PROFIT_EXIT_V297.mediumProfitFadeDelta,-1);
assert.equal(PROFIT_EXIT_V297.largeProfitFadeDelta,0);
console.log('V29.7.1 profit-fade exit tests: OK');
