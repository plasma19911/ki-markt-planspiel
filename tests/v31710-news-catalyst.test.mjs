import assert from 'node:assert/strict';
import {scoreNewsCatalystV31710,applyNewsCatalystSnapshotV31710,enforceNewsCatalystPlanV31710} from '../src/news-catalyst-v31710.js';

const now=Date.UTC(2026,8,3,10,30,0),iso=new Date(now-5*60000).toISOString();
const row=(headline,source='Reuters')=>({headline,publishedAt:iso,source});

{
  const c={symbol:'GOOD',name:'Good Semiconductor AG',momentum5Pct:.35,momentum20Pct:.42,volumeRatio:1.34,day_change:1.2};
  const p=scoreNewsCatalystV31710(c,[row('Good Semiconductor raises full-year forecast after strong AI demand')],now);
  assert.equal(p.positive,true);assert.equal(p.positiveConfirmed,true);assert.equal(p.chaseRisk,false);assert.ok(p.newsScore>.25);
  const s=applyNewsCatalystSnapshotV31710({candidates:[c],positions:[]},{symbols:[p]});
  assert.ok(s.candidates[0].newsScore>=p.newsScore);assert.ok(s.candidates[0].newsConfidence>=.4);assert.ok(s.candidates[0].headlines.length>0);
}

{
  // Broadcom-like case: positive headline, but the tape rejects it. News must not
  // become a positive canonical confirmation just because the headline sounds good.
  const c={symbol:'BEAT',name:'Beat Networks Inc',momentum5Pct:-.32,momentum20Pct:-.18,volumeRatio:1.45,day_change:-1.4,newsScore:0};
  const p=scoreNewsCatalystV31710(c,[row('Beat Networks beats estimates and raises guidance')],now);
  assert.equal(p.positive,true);assert.equal(p.positiveConfirmed,false);
  const s=applyNewsCatalystSnapshotV31710({candidates:[c],positions:[]},{symbols:[p]});
  assert.equal(s.candidates[0].newsScore,0,'unconfirmed positive headline must not boost canonical news score');
  const out=enforceNewsCatalystPlanV31710({actions:[{symbol:'BEAT',action:'HOLD'}]},s);
  assert.equal(out.plan.actions[0].action,'HOLD','news alone must never create BUY');
}

{
  const p0={symbol:'CUT',name:'Cut Software Corp',momentum5Pct:-.45,momentum20Pct:-.60,chartDirectionMode:'DOWN',scoreDeltaThisScan:-2,chartMoveLastScanPct:-.3};
  const p=scoreNewsCatalystV31710(p0,[row('Cut Software cuts guidance after weak enterprise demand','Reuters'),row('Cut Software lowers full-year forecast','Bloomberg')],now);
  assert.equal(p.negative,true);assert.equal(p.negativeConfirmed,true);assert.equal(p.criticalNegative,true);
  const s=applyNewsCatalystSnapshotV31710({candidates:[],positions:[p0]},{symbols:[p]});
  const out=enforceNewsCatalystPlanV31710({actions:[{symbol:'CUT',action:'HOLD',reason:'wait'}]},s);
  assert.equal(out.plan.actions[0].action,'SELL');assert.equal(out.plan.actions[0].newsCatalystExitV31710,true);
}

{
  const c={symbol:'CHASE',name:'Chase Materials SA',momentum5Pct:.05,momentum20Pct:2.4,volumeRatio:1.8,day_change:6.2};
  const p=scoreNewsCatalystV31710(c,[row('Chase Materials raises outlook on record order')],now);
  assert.equal(p.chaseRisk,true);assert.equal(p.positiveConfirmed,false);
  const s=applyNewsCatalystSnapshotV31710({candidates:[c],positions:[]},{symbols:[p]});
  const out=enforceNewsCatalystPlanV31710({actions:[{symbol:'CHASE',action:'BUY',allocation_pct:20}]},s);
  assert.equal(out.plan.actions[0].action,'HOLD');assert.equal(out.counters.chaseBlocks,1);
}

{
  const old=new Date(now-3*60*60000).toISOString(),c={symbol:'OLD',name:'Old News AG',momentum5Pct:.4,momentum20Pct:.5,volumeRatio:1.4};
  const p=scoreNewsCatalystV31710(c,[{headline:'Old News AG raises guidance',publishedAt:old,source:'Reuters'}],now);
  assert.equal(p.eventType,'NONE');assert.equal(p.positiveConfirmed,false);assert.equal(p.newsScore,0);
}

console.log('V31.7.10 fresh news catalyst regression OK');
