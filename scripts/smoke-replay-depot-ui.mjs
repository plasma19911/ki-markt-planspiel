import assert from 'node:assert/strict';
import fs from 'node:fs';
import {augmentDayReplayStatus,prepareFinalDayReplay} from '../src/day-replay-runtime.js';
import {importPcDayReplay} from '../src/pc-day-replay-import.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const makeStorage=()=>{const m=new Map();return{m,storage:{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,v)}}}};

// 22:30 Berlin in August: a completed early replay must still be labelled provisional.
{
 const {m,storage}=makeStorage();
 m.set('state/day-replay-capture-v1',{date:'2026-08-19',updatedAt:'2026-08-19T20:25:00Z',symbolCount:18,symbols:{}});
 m.set('state/day-replay-report-v1',{date:'2026-08-19',status:'COMPLETE',processed:18,total:18,completedAt:'2026-08-19T20:29:00Z',results:[{symbol:'AAA',mistakes:['MISSED_SAFE_MOVE']},{symbol:'BBB',mistakes:[]}],errors:[],summary:null});
 const s=augmentDayReplayStatus(storage,{},Date.parse('2026-08-19T20:30:00Z'));
 assert.equal(s.report.status,'PRELIMINARY_COMPLETE');
 assert.equal(s.report.provisional,true);
 assert.equal(s.report.summary.mistakes.MISSED_SAFE_MOVE,1);
 assert.equal(s.capture.symbolCount,18);
}

// 23:05 Berlin: reset exactly once so the final report is rebuilt from the final capture.
{
 const {m,storage}=makeStorage();
 m.set('state/day-replay-report-v1',{date:'2026-08-19',status:'COMPLETE',processed:20,total:20,results:[]});
 const first=prepareFinalDayReplay(storage,Date.parse('2026-08-19T21:05:00Z'));
 assert.equal(first.reset,true);
 assert.equal(m.get('state/day-replay-report-v1').status,'RESET_FOR_FINAL');
 const second=prepareFinalDayReplay(storage,Date.parse('2026-08-19T21:10:00Z'));
 assert.equal(second.reset,false);
}

// PC replay must learn the same NORMAL bucket as the Cloudflare replay.
{
 const {m,storage}=makeStorage();
 const result=importPcDayReplay(storage,{date:'2026-08-18',completedAt:'2026-08-18T21:10:00Z',results:[{symbol:'TEST',firstSafeAfterSeen:{mode:'NORMAL',ts:123,forward:{f30:.4,f60:.6,mfe120:1.1,mae120:-.2}}}]});
 assert.equal(result.ok,true);
 assert.equal(result.importedSamples,1);
 const learn=m.get('state/day-replay-learning-v1');
 assert.equal(learn.samples.NORMAL.count,1);
}

const wrapper=read('src/index-v18.js');
const quota=read('public/quota-guard.js');
const pcImport=read('src/pc-day-replay-import.js');
assert.match(wrapper,/22\*60\+5/,'Vorlaeufiger Tages-Replay muss ab 22:05 laufen');
assert.match(wrapper,/23\*60\+5/,'Finaler Tages-Replay muss ab 23:05 laufen');
assert.match(wrapper,/finalDayReplay\(8\)/,'Finaler Replay muss den Neuaufbaupfad nutzen');
assert.match(quota,/positionDisplayValue/,'Depotanzeige braucht eine gemeinsame Bewertungsfunktion');
assert.match(quota,/zero_quantity/,'Neue ZERO-Tranchen muessen stueckzahlbasiert dargestellt werden koennen');
assert.match(quota,/renderDepotTruth/,'Positionskarten, Tabelle und Allokation muessen gemeinsam korrigiert werden');
assert.match(quota,/PRELIMINARY_COMPLETE/,'Replay-UI muss vorlaeufige Auswertung anzeigen');
assert.doesNotMatch(quota,/CONTROL_TOKEN|x-control-token|window\.prompt\(/,'Normale Steuerung darf kein Passwort verlangen');
assert.match(pcImport,/NORMAL_ENTRY'\)return'NORMAL'/,'Legacy NORMAL_ENTRY muss auf NORMAL normalisiert werden');

console.log(JSON.stringify({ok:true,preliminaryReplay:true,finalReplayRebuild:true,pcNormalBucket:true,depotUnifiedValuation:true,passwordlessControls:true},null,2));
