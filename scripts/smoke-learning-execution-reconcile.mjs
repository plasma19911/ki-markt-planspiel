import assert from 'node:assert/strict';
import {reconcileLearningWithExecutedPositions,getLearningExecutionReconcileStatus} from '../src/live-learning-execution-reconcile.js';

const KEY='state/zero-live-signal-learning-v1',now=1_800_000_000_000;
const state={version:3,open:{},pending:{
  BLOCKED:{at:now-60_000,timingBucket:'CHASE_NEAR_HIGH'},
  EXECUTED:{at:now-90_000,timingBucket:'PULLBACK_RETEST'},
  STALE_HELD:{at:now-20*60_000,timingBucket:'NORMAL_ENTRY'}
},stats:{},timingStats:{}};
const m=new Map([[KEY,state]]),storage={kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,v)}};
const r=reconcileLearningWithExecutedPositions(storage,[{symbol:'EXECUTED'},{symbol:'STALE_HELD'}],now);
assert.equal(r.pendingBefore,3);
assert.equal(r.pendingAfter,1,'Nur frisch ausgefuehrte Position darf pending bleiben');
assert.equal(r.removed,2);
assert.equal(r.staleHeldRemoved,1);
assert.ok(m.get(KEY).pending.EXECUTED);
assert.equal(m.get(KEY).pending.BLOCKED,undefined,'Geblockter BUY-Vorschlag darf nicht im Lernen bleiben');
assert.equal(m.get(KEY).pending.STALE_HELD,undefined,'Alter Vorschlag darf spaeteren Kauf nicht kontaminieren');
const status=getLearningExecutionReconcileStatus(storage);
assert.equal(status.pendingOnlyForExecutedPositions,true);
assert.equal(status.pendingEntries,1);
assert.equal(status.maxFreshPendingMinutes,8);
console.log(JSON.stringify({ok:true,...r,status},null,2));
