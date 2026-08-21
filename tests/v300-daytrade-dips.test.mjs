import assert from 'node:assert/strict';
import {DAYTRADE_DIP_V300,intradayMetricsV300,dipQualityV300,daytradeAllocationV300} from '../src/daytrade-dip-v300.js';
import {persistExecutedEntryBaselinesV301} from '../src/executed-entry-baseline-v301.js';

assert.equal(DAYTRADE_DIP_V300.immediateBuyMin,56,'BUY threshold must remain 56');
assert.equal(DAYTRADE_DIP_V300.maxOpenPositions,4,'daytrade book must stay concentrated');
assert.equal(DAYTRADE_DIP_V300.targetCashDeploymentPct,90,'daytrade target should use most available cash');

// PC-FIRST aliases must be read directly, otherwise the fastest 1m/5m signals are lost.
{
  const m=intradayMetricsV300({dayPct:1.2,momentum5Pct:-.04,momentum20Pct:.42,acceleration5Pct:.08});
  assert.equal(m.day,1.2);assert.equal(m.m5,-.04);assert.equal(m.m20,.42);assert.equal(m.acc,.08);
}

// Healthy dip from prior strength with reclaim gets the strongest bonus.
{
  const d=dipQualityV300({drawdownFrom20mHighPct:-1.1,momentum20Pct:.35,momentum5Pct:.01,acceleration5Pct:.05,intradayRsi:57,sellerShare:48,newsScore:.05,volumeRatio:1.2});
  assert.equal(d.label,'IDEAL_DIP_RECLAIM');assert.equal(d.points,8);
}

// Same pullback while still accelerating down must NOT be rewarded.
{
  const d=dipQualityV300({drawdownFrom20mHighPct:-1.1,momentum20Pct:.20,momentum5Pct:-.28,acceleration5Pct:-.05,intradayRsi:52,sellerShare:61});
  assert.equal(d.label,'WEAK_DIP');assert.ok(d.points<0);
}

// Deep/accelerating selloff is a falling knife, not a bargain.
{
  const d=dipQualityV300({drawdownFrom20mHighPct:-5.4,momentum20Pct:-.7,momentum5Pct:-.45,acceleration5Pct:-.08,sellerShare:70});
  assert.equal(d.label,'FALLING_KNIFE');assert.equal(d.points,-12);
}

// Buying right at a running high is penalized.
{
  const d=dipQualityV300({drawdownFrom20mHighPct:-.04,dayPct:3.4,momentum20Pct:.8,momentum5Pct:.55,acceleration5Pct:.12,intradayRsi:75});
  assert.equal(d.label,'HIGH_CHASE');assert.ok(d.points<0);
}

// If PC-FIRST has no high drawdown field, a brief 5m pullback inside positive 20m trend is recognized.
{
  const d=dipQualityV300({dayPct:1.6,momentum20Pct:.48,momentum5Pct:-.08,acceleration5Pct:.06,intradayRsi:58,sellerShare:49});
  assert.equal(d.label,'MOMENTUM_DIP_RECLAIM');assert.equal(d.points,5);
}

// Concentrated allocations must be materially larger than the old 3-12% sizing.
{
  const first=daytradeAllocationV300({score:68,dipQuality:1,selectedCount:4,rank:1});
  const fourth=daytradeAllocationV300({score:62,dipQuality:.6,selectedCount:4,rank:4});
  assert.ok(first>=25,'best of four should get a large allocation');
  assert.ok(fourth>=16,'even fourth slot should be meaningful');
  assert.ok(first<=34&&fourth<=34,'single-position concentration remains capped');
}

// V30.1 regression: the executed FINAL BUY score is the held-position baseline.
// It must not fall back to the older scanner score or a later coherent-score memory value.
{
  const kv=new Map(),storage={kv:{get:k=>kv.get(k),put:(k,v)=>kv.set(k,structuredClone(v))}};
  const now=Date.parse('2026-08-21T09:45:00Z');
  const state={positions:[{symbol:'BDL.NS',opened_at:'2026-08-21T09:44:30Z',entry_price:1520,last_price:1519}]};
  const selected=[{symbol:'BDL.NS',daytradeDipScore:59.8,decisionScore:59.8}];
  const out=persistExecutedEntryBaselinesV301(state,selected,storage,now),mem=kv.get('state/score-entry-exit-v294');
  assert.equal(out.stored,1);
  assert.equal(mem.entries['BDL.NS'].score,59.8,'executed final BUY score must be stored exactly');
  assert.equal(mem.entries['BDL.NS'].lastStable,59.8);
  assert.equal(mem.entries['BDL.NS'].seedSource,'EXECUTED_FINAL_BUY_V301');
  assert.notEqual(mem.entries['BDL.NS'].score,45.6,'later/legacy scanner memory must not become the entry baseline');
}

console.log('V30.1 better-dip/concentrated-daytrade + executed-baseline tests passed');
