import assert from 'node:assert/strict';
import {clearRunScopedDecisionState,RUN_SCOPED_KV_KEYS} from '../src/run-reset-hygiene.js';
import {setSecondChanceRuntime,getSecondChanceRuntime} from '../src/second-chance-runtime.js';

const data=new Map([
 ['quota/zero-ai-v1',{planAt:123,newsAt:456,lastNewsResponse:'alt'}],
 ['state/zero-fast-profit-peaks-v1',{ABC:{peakPnlPct:4.2}}],
 ['state/order-approvals-v1',{rows:[{id:'old'}]}],
 ['quota/free-ai-daily-v2',{day:'2026-08-20',estimatedNeurons:321}],
 ['runtime-trade-config-v1',{source:'live-runtime',entryScoreMin:3.8}],
 ['learning/example-v1',{samples:77}]
]);
const kv={get:k=>data.get(k),put:(k,v)=>data.set(k,v),delete:k=>data.delete(k)};
const storage={kv};
const freeAiGuard={planAt:999,newsAt:999,lastNewsResponse:'alte News'};
setSecondChanceRuntime([{symbol:'OLD.DE',score:9}]);
assert.equal(getSecondChanceRuntime().length,1,'Vorbedingung: alte Second-Chance-Runtime vorhanden');

const r=clearRunScopedDecisionState({storage,freeAiGuard});
assert.equal(r.ok,true);
for(const k of RUN_SCOPED_KV_KEYS)assert.equal(data.has(k),false,`${k} muss beim Neustart gelöscht werden`);
assert.deepEqual(data.get('state/order-approvals-v1')?.rows,[],'alte Ordervorschläge müssen geleert werden');
assert.equal(getSecondChanceRuntime().length,0,'alte Second-Chance-Watchlist darf nicht in neuen Lauf gelangen');
assert.equal(freeAiGuard.planAt,0,'lokaler Plan-Cooldown muss zurückgesetzt werden');
assert.equal(freeAiGuard.newsAt,0,'lokaler News-Cooldown muss zurückgesetzt werden');
assert.equal(freeAiGuard.lastNewsResponse,'','alte News-Antwort darf nicht in neuen Lauf gelangen');

assert.equal(data.get('quota/free-ai-daily-v2')?.estimatedNeurons,321,'Tagesbudget darf durch Neustart nicht umgangen werden');
assert.equal(data.get('runtime-trade-config-v1')?.entryScoreMin,3.8,'Runtime-Konfiguration soll erhalten bleiben');
assert.equal(data.get('learning/example-v1')?.samples,77,'langfristiges Lernen soll erhalten bleiben');

console.log('V26.2 restart isolation tests: OK');
