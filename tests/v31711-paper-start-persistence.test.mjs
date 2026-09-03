import assert from 'node:assert/strict';
import {hasExistingPaperRunV31711,durationMinutesV31711,existingRunSnapshotV31711} from '../src/paper-start-persistence-v31711.js';

{
  const s={config:{started_at:'2026-09-03T08:00:00Z',running:1,scan_count:756,start_capital:10000,cash:5378.21},positions:[{symbol:'RHM.DE'}],history:[{action:'START'},{action:'KAUF',symbol:'RHM.DE'}],snapshots:[{},{}]};
  assert.equal(hasExistingPaperRunV31711(s),true,'an active paper ledger must never be replaced by a repeated /api/start');
  assert.deepEqual(existingRunSnapshotV31711(s),{scanCount:756,positions:1,history:2,startCapital:10000,cash:5378.21,running:true});
}
{
  const fresh={config:{started_at:null,running:0,scan_count:0,start_capital:100,cash:100},positions:[],history:[],snapshots:[]};
  assert.equal(hasExistingPaperRunV31711(fresh),false,'a genuinely empty state may start a new paper run');
}
{
  const startedButUnused={config:{started_at:'2026-09-03T08:00:00Z',running:1,scan_count:0},positions:[],history:[{action:'START'}],snapshots:[]};
  assert.equal(hasExistingPaperRunV31711(startedButUnused),false,'a start marker with no scan/trade is still replaceable');
}
{
  const stopped={config:{started_at:'2026-09-03T08:00:00Z',running:0,scan_count:10},positions:[],history:[{action:'START'},{action:'HALTEN'}],snapshots:[{},{}]};
  assert.equal(hasExistingPaperRunV31711(stopped),true,'stopped historical runs resume instead of being wiped by start');
}
assert.equal(durationMinutesV31711({durationValue:7,durationUnit:'days'}),10080);
assert.equal(durationMinutesV31711({durationValue:2,durationUnit:'hours'}),120);
console.log('V31.7.11 idempotent paper-start persistence regression OK');
