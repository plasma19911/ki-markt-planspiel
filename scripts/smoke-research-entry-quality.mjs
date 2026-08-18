import assert from 'node:assert/strict';
import {assessResearchEntryQuality,ResearchEntryQualityGuard} from '../src/research-entry-quality-guard.js';

const action={symbol:'TEST',action:'BUY',allocation_pct:45,reason:'PULLBACK-FIRST EARLY_BREAKOUT: test'};
const weak={symbol:'TEST',score:3.95,confidence:.65,intraday5m:.09,intraday20m:.30,momentumAcceleration5:.01,day:2.3,intradayRsi:61,volumeRatio:.92};
const strong={symbol:'TEST',score:5.5,confidence:.77,intraday5m:.16,intraday20m:.38,momentumAcceleration5:.05,day:2.1,intradayRsi:63,volumeRatio:1.28};
const nearMiss={symbol:'TEST',score:5.25,confidence:.75,intraday5m:.08,intraday20m:.10,momentumAcceleration5:.01,day:2.2,intradayRsi:63,volumeRatio:.96};
assert.equal(assessResearchEntryQuality(action,weak).allow,false,'Normaler SAP-artiger schwacher Early-Breakout soll warten');
assert.equal(assessResearchEntryQuality(action,weak).softAllow,false,'Schwache Gesamtqualitaet darf Soft-Override nicht nutzen');
const good=assessResearchEntryQuality(action,strong);assert.equal(good.allow,true);assert.equal(good.allocationCap,35);
const soft=assessResearchEntryQuality(action,nearMiss);assert.equal(soft.allow,false);assert.equal(soft.softAllow,true,'Sehr starke Gesamtqualitaet darf eine knapp verfehlte weiche Schwelle kompensieren');assert.ok(soft.allocationCap>=22&&soft.allocationCap<=26);

const base={run:async()=>({response:JSON.stringify({summary:'base',actions:[{symbol:'OLD',action:'SELL',allocation_pct:0,reason:'CAPITAL-MOTION-ROTATION: TEST besser'},action]})})};
const input={messages:[{role:'user',content:`JSON-only Kandidaten=${JSON.stringify([weak])} Gehalten=${JSON.stringify([{symbol:'OLD'}])}`}]};
const r=await new ResearchEntryQualityGuard(base).run('x',input),plan=JSON.parse(r.response);
assert.equal(plan.actions.some(x=>x.action==='BUY'),false);
assert.equal(plan.actions.some(x=>x.action==='SELL'&&/ROTATION/.test(x.reason)),false,'Keine Rotation verkaufen, wenn der Ersatz-BUY wirklich zu schwach ist');
assert.equal(plan.actions.some(x=>x.action==='HOLD'&&x.symbol==='TEST'),true);

const base2={run:async()=>({response:JSON.stringify({summary:'base',actions:[action]})})};
const input2={messages:[{role:'user',content:`JSON-only Kandidaten=${JSON.stringify([strong])} Gehalten=[]`}]};
const p2=JSON.parse((await new ResearchEntryQualityGuard(base2).run('x',input2)).response);
assert.equal(p2.actions[0].action,'BUY');assert.equal(p2.actions[0].allocation_pct,35);
const input3={messages:[{role:'user',content:`JSON-only Kandidaten=${JSON.stringify([nearMiss])} Gehalten=[]`}]};
const p3=JSON.parse((await new ResearchEntryQualityGuard(base2).run('x',input3)).response);
assert.equal(p3.actions[0].action,'BUY');assert.ok(p3.actions[0].allocation_pct<=26,'Near-Miss darf nur kleine Starterposition bekommen');
console.log(JSON.stringify({ok:true,weakBlocked:true,strongAllowed:true,strongCap:p2.actions[0].allocation_pct,nearMissStarter:p3.actions[0].allocation_pct},null,2));

// Dieser Smoke ist bewusst Teil des bestehenden Pflicht-Research-Checks. Damit darf
// spaeter niemand die weichen Regeln wieder unbemerkt in harte Alles-oder-Nichts-
// Sperren verwandeln.
await import('./smoke-balanced-adaptive.mjs');
