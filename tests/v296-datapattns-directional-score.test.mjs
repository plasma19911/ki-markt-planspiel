import assert from 'node:assert/strict';
import {DIRECTIONAL_POSITION_SCORE_V296,directionalLimitsV296,directionalPositionStepV296} from '../src/directional-position-score-v296.js';

// DATAPATTNS.NS regression: the old held score could already be close to -15 even though
// the actual position chart was nearly flat. The new directional layer must immediately
// pull such a legacy score back into the flat-chart corridor around the purchase score.
{
  const d=directionalPositionStepV296({entryScore:60,lastStable:46,rawScore:34,chartMovePct:-.12,lastChartMovePct:-.03,ageMinutes:1,partial:false});
  assert.equal(d.mode,'FLAT');
  assert.equal(d.lo,57);
  assert.equal(d.hi,63);
  assert.equal(d.score,57,'near-flat DATAPATTNS-style chart may not remain near a -15 sell');
  assert.equal(d.correctedPrior,true,'old over-sensitive held score must be corrected immediately');
}

// Even around one percent down, the score is allowed to weaken, but nowhere near -15.
{
  const l=directionalLimitsV296(-1.0);
  assert.ok(l.maxDown<6.1);
  const d=directionalPositionStepV296({entryScore:60,lastStable:58,rawScore:30,chartMovePct:-1.0,lastChartMovePct:-.25,ageMinutes:2});
  assert.ok(d.score>=54,'about -1% chart move must not produce a near -15 score collapse');
}

// A positive chart must not grant a large negative score corridor.
{
  const l=directionalLimitsV296(2.0);
  assert.equal(l.maxDown,DIRECTIONAL_POSITION_SCORE_V296.oppositeDirectionDistance);
  assert.ok(l.maxUp>=10,'a genuinely positive chart can still support the +10 profit exit');
}

// Conversely the -15 weakness exit becomes reachable only after a genuinely meaningful
// negative chart move, not from feed/coverage/momentum noise on a flat position.
{
  assert.ok(directionalLimitsV296(-2.0).maxDown<15);
  assert.ok(directionalLimitsV296(-3.1).maxDown>15);
}

// Partial held data is frozen after correcting it into the valid chart corridor.
{
  const d=directionalPositionStepV296({entryScore:62,lastStable:45,rawScore:20,chartMovePct:.05,lastChartMovePct:0,ageMinutes:1,partial:true});
  assert.equal(d.score,59);
  assert.equal(d.frozen,true);
}

assert.equal(DIRECTIONAL_POSITION_SCORE_V296.negativeExitDelta,-15);
assert.equal(DIRECTIONAL_POSITION_SCORE_V296.positiveExitDelta,10);
assert.equal(DIRECTIONAL_POSITION_SCORE_V296.negativeExitRequiresNegativeChart,true);
console.log('V29.6 DATAPATTNS directional held-score regression tests: OK');
