import assert from 'node:assert/strict';
import {DAYTRADE_ENTRY_V301,timingMetricsV301,entryTimingV301} from '../src/daytrade-entry-v301.js';

assert.equal(DAYTRADE_ENTRY_V301.immediateBuyMin,56,'one authoritative BUY threshold stays 56');
assert.equal(DAYTRADE_ENTRY_V301.maxOpenPositions,4,'concentrated daytrade book stays at max four positions');
assert.equal(DAYTRADE_ENTRY_V301.targetCashDeploymentPct,90,'cash deployment target remains concentrated');

// Fast PC fields must be recognized as real coverage, not silently defaulted to zero.
{
  const m=timingMetricsV301({momentum5Pct:.04,momentum20Pct:.32,acceleration5Pct:.06,quoteAgeMinutes:.4});
  assert.equal(m.fastPresent,3);assert.equal(m.m5,.04);assert.equal(m.m20,.32);assert.equal(m.acc,.06);assert.equal(m.quoteAgeMinutes,.4);
}

// A clean shallow retest inside strength gets rewarded.
{
  const t=entryTimingV301({drawdownFrom20mHighPct:-.45,momentum5Pct:.03,momentum20Pct:.38,acceleration5Pct:.05,dayPct:1.6,intradayRsi:58,quoteAgeMinutes:.6},{dipLabel:'SHALLOW_RESET'});
  assert.equal(t.label,'CLEAN_RETEST');assert.ok(t.points>=6,'fresh quote + clean retest should add meaningful timing points');
}

// If no high-drawdown field exists, a controlled early continuation is still tradable.
{
  const t=entryTimingV301({momentum5Pct:.08,momentum20Pct:.48,acceleration5Pct:.05,dayPct:1.8,intradayRsi:61,quoteAgeMinutes:1.1},{dipLabel:'NEUTRAL'});
  assert.equal(t.label,'CLEAN_CONTINUATION');assert.ok(t.points>0);
}

// Old intraday quotes must materially reduce the score input.
{
  const t=entryTimingV301({momentum5Pct:.05,momentum20Pct:.4,acceleration5Pct:.05,quoteAgeMinutes:8.2},{dipLabel:'NEUTRAL'});
  assert.equal(t.label,'CLEAN_CONTINUATION');
  assert.ok(t.points<0,'stale-data penalty must dominate any continuation bonus');
}

// Missing fast fields cannot masquerade as neutral healthy tape.
{
  const t=entryTimingV301({momentum20Pct:.3,quoteAgeMinutes:.5},{dipLabel:'NEUTRAL'});
  assert.equal(t.metrics.fastPresent,1);assert.ok(t.points<0);
}

// Weak short-term tape is penalized even if a historical/base score is high.
{
  const t=entryTimingV301({momentum5Pct:-.25,momentum20Pct:-.3,acceleration5Pct:-.04,quoteAgeMinutes:.5},{dipLabel:'NEUTRAL'});
  assert.equal(t.label,'WEAK_TAPE');assert.ok(t.points<0);
}

// Neutral timing gets a small negative score input rather than free passage at 56.
{
  const t=entryTimingV301({momentum5Pct:0,momentum20Pct:0,acceleration5Pct:0,quoteAgeMinutes:1},{dipLabel:'NEUTRAL'});
  assert.equal(t.label,'NEUTRAL_TIMING');assert.ok(t.points<0);
}

console.log('V30.1 fresh-tape daytrade timing tests passed');
