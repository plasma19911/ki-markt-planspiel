import assert from 'node:assert/strict';
import {scoreNewsCatalystV31710,applyNewsCatalystSnapshotV31710,enforceNewsCatalystPlanV31710,matchesCompanyNewsV31713,selectNewsRefreshTargetsV31714} from '../src/news-catalyst-v31710.js';

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

{
  // COST.L is Costain, not Costco and not the normal English word "cost".
  const costain={symbol:'COST.L',name:'Costain Group PLC',momentum5Pct:.3,momentum20Pct:.2,volumeRatio:1.3};
  assert.equal(matchesCompanyNewsV31713(costain,'A Career Change Could Cost More Than You Think'),false);
  assert.equal(matchesCompanyNewsV31713(costain,"Apple's first foldable iPhone may cost $2,000"),false);
  assert.equal(matchesCompanyNewsV31713(costain,'Costain wins major UK infrastructure contract'),true);
  const good=scoreNewsCatalystV31710(costain,[row('Costain wins major UK infrastructure contract')],now);
  const merged=applyNewsCatalystSnapshotV31710({candidates:[{...costain,headlines:[{headline:'A Career Change Could Cost More Than You Think'}]}],positions:[]},{symbols:[good]});
  assert.equal(merged.candidates[0].headlines.some(x=>String(x?.headline||x).includes('Career Change')),false,'old unrelated headlines must be removed');
  const cleaned=applyNewsCatalystSnapshotV31710({candidates:[{...costain,headlines:[{headline:"Apple's first foldable iPhone may cost $2,000"}]}],positions:[]},{symbols:[{symbol:'COST.L',headline:'',rows:[]}]});
  assert.equal(cleaned.candidates[0].headlines.length,0,'unrelated cached headlines must also be removed when no new matching story exists');
}

{
  const costco={symbol:'COST',name:'Costco Wholesale Corporation'};
  assert.equal(matchesCompanyNewsV31713(costco,'COST stock rises after earnings'),true,'explicit uppercase US ticker plus stock context remains valid');
  assert.equal(matchesCompanyNewsV31713(costco,'The cost of food rises again'),false,'ordinary lowercase word is not a ticker match');
}

{
  const c={symbol:'CLUSTER',name:'Cluster Systems AG',momentum5Pct:.3,momentum20Pct:.2,volumeRatio:1.2};
  const p=scoreNewsCatalystV31710(c,[
    row('Cluster Systems raises full-year guidance after record orders','Reuters'),
    row('Cluster Systems raises full year guidance after record orders','Bloomberg'),
    row('Cluster Systems appoints a new finance director','Company Wire')
  ],now);
  assert.equal(p.sourceCount,2,'only sources corroborating the same top event may raise event confidence');
  assert.equal(p.allSourceCount,3,'the diagnostic may still expose all distinct sources');
  assert.equal(p.clusteredStories,2,'syndicated variants must form one event cluster');
  assert.equal(p.decisionState,'POSITIVE_CONFIRMED');
  assert.ok(p.importance>=60);
}

{
  const targets=[
    {symbol:'HELD1',held:true,urgent:false,priority:3,score:55},
    {symbol:'HELD2',held:true,urgent:false,priority:3,score:54},
    {symbol:'NEW1',held:false,urgent:false,priority:2,score:66}
  ];
  const selected=selectNewsRefreshTargetsV31714(targets,{},now).map(x=>x.symbol);
  assert.equal(selected.length,2);
  assert.ok(selected.some(x=>x.startsWith('HELD')),'one normal position gets refreshed');
  assert.ok(selected.includes('NEW1'),'one opportunity must not be starved by normal positions');
  const urgent=selectNewsRefreshTargetsV31714(targets.map(x=>({...x,urgent:x.held})),{},now);
  assert.deepEqual(urgent.map(x=>x.symbol),['HELD1','HELD2'],'two genuine risk targets may consume both protected slots');
}

console.log('V31.7.10 fresh news catalyst regression OK');
