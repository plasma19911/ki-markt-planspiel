import assert from 'node:assert/strict';
import {DAYTRADE_LIVE_FEEDBACK_V302,daytradeAllocationV302,repairExecutedEntryBaselinesV302} from '../src/daytrade-live-feedback-v302.js';
import {dipQualityV300} from '../src/daytrade-dip-v300.js';
import {entryTimingV301} from '../src/daytrade-entry-v301.js';

assert.equal(DAYTRADE_LIVE_FEEDBACK_V302.immediateBuyMin,56);
assert.equal(DAYTRADE_LIVE_FEEDBACK_V302.maxOpenPositions,4);
assert.equal(DAYTRADE_LIVE_FEEDBACK_V302.maxSinglePositionPctOfEquity,25);
assert.equal(DAYTRADE_LIVE_FEEDBACK_V302.maxTargetCashDeploymentPct,90);

// Regression aus dem echten BDL-artigen Live-Fall: hoher Basisscore direkt am Hoch
// darf nicht nur wegen des alten -7 Dip-Malus noch knapp ueber 56 bleiben.
{
  const c={drawdownFrom20mHighPct:-.05,dayPct:3.1,momentum5Pct:.50,momentum20Pct:.35,acceleration5Pct:.08,intradayRsi:74,quoteAgeMinutes:.5,sellerShare:49,newsScore:.1,volumeRatio:1.4};
  const dip=dipQualityV300(c);assert.equal(dip.label,'HIGH_CHASE');assert.equal(dip.points,-7);
  const timing=entryTimingV301(c,dip);assert.ok(timing.points>=0,'frische Daten koennen vor dem Live-Fix noch etwas Timingbonus geben');
  const final=67.3+dip.points+timing.points+DAYTRADE_LIVE_FEEDBACK_V302.highChaseExtraPenalty;
  assert.ok(final<56,`BDL-artiger High-Chase muss unter BUY 56 fallen, war ${final}`);
}

// Vier gute Daytrades koennen konzentriert investieren, aber keiner verletzt 25%.
{
  const p=[1,2,3,4].map(rank=>daytradeAllocationV302({selectedCount:4,rank,score:72,dipQuality:1,timingQuality:1}));
  assert.ok(p.every(x=>x<=25),'keine neue Position darf ueber 25% Scan-Startcash liegen');
  assert.ok(p.reduce((a,b)=>a+b,0)<=90.001,'vier Slots duerfen zusammen max. 90% Zielauslastung haben');
  assert.ok(p.reduce((a,b)=>a+b,0)>=80,'vier starke Setups sollen weiterhin konzentriert Kapital nutzen');
}

// Wenige Setups werden nicht kuenstlich auf 90% hochgehebelt.
{
  const one=daytradeAllocationV302({selectedCount:1,rank:1,score:80,dipQuality:1,timingQuality:1});
  const two=[1,2].map(rank=>daytradeAllocationV302({selectedCount:2,rank,score:80,dipQuality:1,timingQuality:1}));
  assert.equal(one,25);assert.ok(two.reduce((a,b)=>a+b,0)<=50.001);
}

// Ausgefuehrter finaler DecisionScore aus dem Kauf-Log repariert eine alte falsche
// Positionsbasis (z.B. gespeicherte 46.8 statt tatsaechlichem Kaufscore 60.3).
{
  const map=new Map();const storage={kv:{get:k=>map.get(k),put:(k,v)=>map.set(k,structuredClone(v))}};
  map.set('state/score-entry-exit-v294',{entries:{'BDL.NS':{score:46.8,lastStable:49.8,entryPrice:1363,lastPrice:1359,source:'CONFIRMED_POSITION_BASELINE'}},stats:{}});
  const state={positions:[{symbol:'BDL.NS',entry_price:1363,last_price:1359,opened_at:'2026-08-21T09:53:08.814Z'}],history:[{action:'KAUF',symbol:'BDL.NS',ts:'2026-08-21T09:53:08.814Z',reason:'V30.0 DAYTRADE-BUY: BDL.NS Score 67.3 -7 Dip = 60.3/100 · HIGH_CHASE'}]};
  const out=repairExecutedEntryBaselinesV302(state,storage,Date.parse('2026-08-21T10:15:00Z'));
  const e=map.get('state/score-entry-exit-v294').entries['BDL.NS'];
  assert.deepEqual(out.corrected,['BDL.NS']);assert.equal(e.score,60.3);assert.equal(e.lastStable,49.8,'laufender geglaetteter Score darf nicht hart springen');assert.equal(e.executionBaselineFixedV302,true);assert.equal(e.seedSource,'V30.2_EXECUTED_FINAL_DECISION');
}

console.log('V30.2 live-feedback daytrade tests passed');
