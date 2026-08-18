import assert from 'node:assert/strict';
import {classifyEntryTiming,getEntryTimingAdjustment,getLiveLearningStatus} from '../src/live-signal-learning.js';

const KEY='state/zero-live-signal-learning-v1';
const makeStorage=state=>{const m=new Map([[KEY,state]]);return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,v)},_m:m}};

const reboundCandidate={symbol:'REB.DE',reboundWatch:true,day:-4.5,intraday5m:.22,intraday20m:.05,intradayRsi:45,momentumState:'BUILDING',momentumSellSignal:'NONE'};
assert.equal(classifyEntryTiming(reboundCandidate),'REBOUND_REVERSAL','Bestätigte Rebound-Umkehr braucht eigenen Lern-Bucket');

const badReboundState={version:3,open:{},pending:{},stats:{},completed:0,timedCompleted:18,timingStats:{REBOUND_REVERSAL:{15:{count:18,wins:4,sumPnl:-9,sumAbsPnl:12,sumMae:-15,sumMfe:5}}},recentTiming:[]};
const badStorage=makeStorage(badReboundState),bad=getEntryTimingAdjustment(badStorage,reboundCandidate);
assert.equal(bad.block,true,'Nach genügend klar schlechten Rebound-Fällen muss das Muster blockierbar sein');
assert.ok(bad.scoreDelta<0&&bad.sizeMultiplier<1);

const pullbackCandidate={symbol:'PB.DE',day:1.1,intraday5m:.05,intraday20m:.35,intradayRsi:55,drawdownFrom20mHighPct:-.6,momentumState:'NORMAL'};
assert.equal(classifyEntryTiming(pullbackCandidate),'PULLBACK_RETEST');
const goodPullbackState={version:3,open:{},pending:{},stats:{},completed:0,timedCompleted:18,timingStats:{PULLBACK_RETEST:{15:{count:6,wins:5,sumPnl:2.4,sumAbsPnl:2.8,sumMae:-.8,sumMfe:3.2},30:{count:6,wins:5,sumPnl:3.0,sumAbsPnl:3.3,sumMae:-1,sumMfe:4},60:{count:6,wins:5,sumPnl:3.6,sumAbsPnl:4,sumMae:-1.1,sumMfe:5}}},recentTiming:[]};
const goodStorage=makeStorage(goodPullbackState),good=getEntryTimingAdjustment(goodStorage,pullbackCandidate);
assert.equal(good.block,false);
assert.ok(good.scoreDelta>0&&good.confidenceDelta>0&&good.sizeMultiplier>1,'Wiederholt guter Pullback darf konservativ aufgewertet werden');

const status=getLiveLearningStatus(badStorage);
assert.equal(status.reboundTimingLearning,true);
assert.equal(status.horizonsMinutes.join(','),'15,30,60');
assert.equal(status.reboundTiming.block,true);

console.log(JSON.stringify({ok:true,reboundBucket:true,badReboundBlocked:bad,goodPullbackBoosted:good},null,2));
