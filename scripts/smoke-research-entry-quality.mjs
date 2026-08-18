import assert from 'node:assert/strict';
import {assessResearchEntryQuality,ResearchEntryQualityGuard} from '../src/research-entry-quality-guard.js';

const action={symbol:'TEST',action:'BUY',allocation_pct:45,reason:'PULLBACK-FIRST EARLY_BREAKOUT: test'};
const weak={symbol:'TEST',intraday5m:.09,intraday20m:.30,momentumAcceleration5:.01,day:2.3,intradayRsi:61,volumeRatio:.92};
const strong={symbol:'TEST',intraday5m:.16,intraday20m:.38,momentumAcceleration5:.05,day:2.1,intradayRsi:63,volumeRatio:1.28};
assert.equal(assessResearchEntryQuality(action,weak).allow,false,'SAP-artiger schwacher Early-Breakout soll warten');
const good=assessResearchEntryQuality(action,strong);assert.equal(good.allow,true);assert.equal(good.allocationCap,35);

const base={run:async()=>({response:JSON.stringify({summary:'base',actions:[{symbol:'OLD',action:'SELL',allocation_pct:0,reason:'CAPITAL-MOTION-ROTATION: TEST besser'},action]})})};
const input={messages:[{role:'user',content:`JSON-only Kandidaten=${JSON.stringify([weak])} Gehalten=${JSON.stringify([{symbol:'OLD'}])}`}]};
const r=await new ResearchEntryQualityGuard(base).run('x',input),plan=JSON.parse(r.response);
assert.equal(plan.actions.some(x=>x.action==='BUY'),false);
assert.equal(plan.actions.some(x=>x.action==='SELL'&&/ROTATION/.test(x.reason)),false,'Keine Rotation verkaufen, wenn der Ersatz-BUY wegen Qualitaet wegfaellt');
assert.equal(plan.actions.some(x=>x.action==='HOLD'&&x.symbol==='TEST'),true);

const base2={run:async()=>({response:JSON.stringify({summary:'base',actions:[action]})})};
const input2={messages:[{role:'user',content:`JSON-only Kandidaten=${JSON.stringify([strong])} Gehalten=[]`}]};
const p2=JSON.parse((await new ResearchEntryQualityGuard(base2).run('x',input2)).response);
assert.equal(p2.actions[0].action,'BUY');assert.equal(p2.actions[0].allocation_pct,35);
console.log(JSON.stringify({ok:true,weakBlocked:true,strongAllowed:true,strongCap:p2.actions[0].allocation_pct},null,2));
