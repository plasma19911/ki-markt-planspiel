import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {replayRows,extendReplayQueue} from '../src/day-replay-learning.js';

const now=Date.parse('2026-09-07T10:30:00Z');
const date='2026-09-07';
const capture={symbols:{
  OLD:{symbol:'OLD',firstSeenAt:'2026-09-07T09:29:00Z',maxPriority:20},
  EXACT:{symbol:'EXACT',firstSeenAt:'2026-09-07T09:30:00Z',maxPriority:30},
  NEW:{symbol:'NEW',firstSeenAt:'2026-09-07T09:31:00Z',maxPriority:90},
  TRADED:{symbol:'TRADED',firstSeenAt:'2026-09-07T10:25:00Z',maxPriority:5}
}};
const state={history:[{ts:'2026-09-07T10:26:00Z',symbol:'TRADED',action:'KAUF'}]};

const mature=replayRows(capture,state,date,true,now);
assert.deepEqual(mature.map(x=>x.symbol),['TRADED','EXACT','OLD'],'hourly replay must include traded or at least 60-minute-old candidates only');

const report={queue:['OLD'],rows:{OLD:capture.symbols.OLD},processed:1,total:1,status:'COMPLETE',completedAt:'x',summary:{done:true}};
assert.equal(extendReplayQueue(report,mature),2,'only newly matured candidates should be appended');
assert.deepEqual(report.queue,['OLD','TRADED','EXACT']);
assert.equal(report.status,'RUNNING','a complete report must reopen when new candidates mature');
assert.equal(report.completedAt,null);
assert.equal(report.summary,null);
assert.equal(extendReplayQueue(report,mature),0,'the hourly queue extension must be idempotent');

const worker=readFileSync(new URL('../src/index-v20.js',import.meta.url),'utf8');
const endpoint=readFileSync(new URL('../src/index-core.js',import.meta.url),'utf8');
const pc=readFileSync(new URL('../public/pc-agent-latest.ps1',import.meta.url),'utf8');
const quota=readFileSync(new URL('../public/quota-guard.js',import.meta.url),'utf8');
assert.match(worker,/session\.localMinute>=510&&\(session\.localMinute-510\)%60===0/,'worker cron must trigger at 08:30 and hourly thereafter');
assert.match(worker,/if\(!agent\?\.online\)return/,'worker cron must require an online PC agent');
assert.match(worker,/hourlyDayReplay\(10\)/,'worker cron must keep the replay batch bounded');
assert.match(endpoint,/if\(!session\.open\).*market-closed/s,'agent endpoint must reject closed-market replay calls');
assert.match(endpoint,/if\(!agent\?\.online\).*pc-agent-offline/s,'agent endpoint must reject replay calls from a stale/offline PC agent');
assert.match(pc,/LastReplaySlot/,'PC agent must suppress duplicate hourly submissions');
assert.match(pc,/api\/agent\/day-replay/,'PC agent must submit the hourly replay trigger');
assert.match(quota,/folgende Entscheidungen/,'late replay UI must not restore the obsolete next-trading-day-only text');
assert.match(quota,/mindestens 60 Minuten gereifte Beobachtungen/,'runtime UI must explain the hourly maturity gate');

console.log('hourly day replay tests passed');
