import assert from 'node:assert/strict';
import fs from 'node:fs';
import {repairAiPlanResponse} from '../src/ai-plan-json-repair.js';

const input={messages:[{role:'user',content:'PAPER-TRADING ONLY. JSON-only. Kandidaten=[] Gehalten=[]'}]};

const valid={response:JSON.stringify({summary:'ok',actions:[{symbol:'AAA.DE',action:'HOLD',confidence:.6,allocation_pct:0,reason:'wait'}]})};
assert.equal(repairAiPlanResponse(valid,input),valid,'valid JSON must stay unchanged');

const truncated={response:'{"summary":"kurz","actions":[{"symbol":"AAA.DE","action":"HOLD","confidence":0.7,"allocation_pct":0,"reason":"ok"},{"symbol":"BBB.DE","action":"BUY"'};
const repaired=JSON.parse(repairAiPlanResponse(truncated,input).response);
assert.equal(repaired.actions.length,1,'only complete action objects may be salvaged');
assert.equal(repaired.actions[0].symbol,'AAA.DE');
assert.equal(repaired.actions[0].action,'HOLD');

const empty=JSON.parse(repairAiPlanResponse({response:'unvollstaendige Modellantwort'},input).response);
assert.deepEqual(empty.actions,[],'repair must never invent an action');

const nonPlan={response:'news text'};
assert.equal(repairAiPlanResponse(nonPlan,{messages:[{role:'user',content:'news'}]}),nonPlan,'non-plan calls must remain untouched');

const fc=fs.readFileSync(new URL('../src/final-decision-controller.js',import.meta.url),'utf8');
const r2=fs.readFileSync(new URL('../src/r2-portfolio.js',import.meta.url),'utf8');
assert.match(fc,/repairAiPlanResponse\(raw,input\)/,'final controller must use repair before post-processing');
assert.match(r2,/höchstens 6 actions/,'AI plan prompt must request compact action output');
assert.match(r2,/summary maximal 120 Zeichen/,'AI plan prompt must cap summary length');

console.log('V27.7 AI JSON repair regression tests: OK');
