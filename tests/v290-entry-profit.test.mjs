import assert from 'node:assert/strict';
import {ENTRY_PROFIT_V290,entryDecisionV290,entryAllocationPctV290,profitDecisionV290} from '../src/entry-profit-behavior-v290-core.js';

const now=Date.parse('2026-08-20T19:30:00Z');
const h=(score,min=1)=>[{at:now-min*60_000,score}];

let d=entryDecisionV290({buyScore:60,coverage:.90,hardBlocked:false,overextended:false},h(52),now);
assert.equal(d.action,'BUY_SCOUT','60 darf als Scout starten, wenn Score sehr stark steigt und Datenabdeckung hoch ist');
assert.equal(d.tier,'SCOUT');
assert.ok(entryAllocationPctV290(6000,d)>=3&&entryAllocationPctV290(6000,d)<=4.5,'Scout muss klein bleiben');

d=entryDecisionV290({buyScore:60,coverage:.90,hardBlocked:false,overextended:false},h(59),now);
assert.equal(d.action,'WATCH','60 ohne starke Beschleunigung darf nicht blind gekauft werden');

d=entryDecisionV290({buyScore:65,coverage:.80,hardBlocked:false,overextended:false},h(59),now);
assert.equal(d.action,'BUY_MICRO','65 mit stark steigender Richtung soll Mikro-Starter erlauben');

d=entryDecisionV290({buyScore:69,coverage:.78,hardBlocked:false,overextended:false},h(65),now);
assert.equal(d.action,'BUY_EARLY','68-71 mit steigender Richtung soll früher Einstieg sein');

d=entryDecisionV290({buyScore:73,coverage:.78,hardBlocked:false,overextended:false},h(69),now);
assert.equal(d.action,'BUY','72+ mit sauberem Trend soll regulär kaufen');

d=entryDecisionV290({buyScore:80,coverage:.95,hardBlocked:false,overextended:true,reclaim:false},h(74),now);
assert.equal(d.action,'WAIT','Überdehnung/FOMO darf auch hohe Scores blockieren');

d=entryDecisionV290({buyScore:90,coverage:.95,hardBlocked:true,overextended:false},h(82),now);
assert.equal(d.action,'AVOID','Hard-Block darf nie vom frühen Einstieg überstimmt werden');

let p=profitDecisionV290({pnlPct:3.20,peakPnlPct:4.00,holdScore:75,peakHoldScore:84,lastHoldScore:80,coverage:.90,partial:false,ageMinutes:40,m5:-.22,m20:-.28,acc:-.05});
assert.equal(p.action,'SELL','Gewinn darf bei Score 75 gesichert werden, wenn Peak und Momentum sichtbar brechen');
assert.equal(p.reason,'near_peak_exhaustion');

p=profitDecisionV290({pnlPct:3.20,peakPnlPct:4.00,holdScore:75,peakHoldScore:84,lastHoldScore:72,coverage:.90,partial:false,ageMinutes:40,m5:.20,m20:.30,acc:.05});
assert.equal(p.action,'HOLD','Score 75 mit erneut anziehendem Trend muss weiterlaufen dürfen');

p=profitDecisionV290({pnlPct:4.45,peakPnlPct:6.00,holdScore:70,peakHoldScore:86,lastHoldScore:76,coverage:.92,partial:false,ageMinutes:60,m5:-.18,m20:-.25,acc:-.04});
assert.equal(p.action,'SELL','starker Gewinner darf auch bei Score 70 dynamisch gesichert werden');

p=profitDecisionV290({pnlPct:.72,peakPnlPct:1.00,holdScore:65,peakHoldScore:70,lastHoldScore:66,coverage:.92,partial:false,ageMinutes:30,m5:-.04,m20:.02,acc:-.01});
assert.equal(p.action,'HOLD','kleines normales Gewinnrauschen darf nicht zu früh verkauft werden');

p=profitDecisionV290({pnlPct:2.2,peakPnlPct:3.0,holdScore:68,peakHoldScore:78,lastHoldScore:72,coverage:.40,partial:true,ageMinutes:50,m5:-.2,m20:-.3,acc:-.05});
assert.equal(p.action,'HOLD','Teilscore/unvollständige Daten dürfen keinen Gewinnverkauf auslösen');

p=profitDecisionV290({pnlPct:3.0,peakPnlPct:3.6,holdScore:70,peakHoldScore:82,lastHoldScore:76,coverage:.9,partial:false,ageMinutes:5,m5:-.2,m20:-.3,acc:-.05});
assert.equal(p.action,'HOLD','junge Gewinner sollen nicht bei erster kleinen Abkühlung verkauft werden');

assert.equal(ENTRY_PROFIT_V290.entry.scoutMin,60);
assert.equal(ENTRY_PROFIT_V290.entry.regularMin,72);
assert.ok(ENTRY_PROFIT_V290.profit.tiers.some(x=>x.maxExitScore>=75),'Gewinn-Lock muss Ausstieg bei noch hohem Score erlauben');
console.log('V29.0 staged entry + dynamic profit lock regression tests: OK');
