import assert from 'node:assert/strict';
import {ENTRY_PROFIT_V290,entryDecisionV290,entryAllocationPctV290,profitDecisionV290} from '../src/entry-profit-behavior-v290-core.js';

const now=Date.parse('2026-08-20T19:30:00Z');
const h=(score,min=1)=>[{at:now-min*60_000,score}];
const row=(buyScore,coverage=.92,extra={})=>({buyScore,coverage,hardBlocked:false,overextended:false,day:1.2,parts:{momentum:2.6,news:4.5,volume:2.2,scanner:7,confidence:3,...(extra.parts||{})},...extra});

let d=entryDecisionV290(row(49,.95),h(42),now);
assert.equal(d.action,'AVOID','unter 50 bleibt schwach');

d=entryDecisionV290(row(50,.95),h(44),now);
assert.equal(d.action,'WATCH','50–52 ist Beobachtungszone und noch kein Kauf');

d=entryDecisionV290(row(52,.95),h(44),now);
assert.equal(d.action,'WATCH','auch stark steigende 52 darf noch keinen Scout öffnen');

d=entryDecisionV290(row(53,.92),h(46),now);
assert.equal(d.action,'BUY_SCOUT','53 darf als Scout starten, wenn Score und echte Marktstruktur sehr stark steigen');
assert.equal(d.tier,'SCOUT');
assert.ok(entryAllocationPctV290(6000,d)>=2&&entryAllocationPctV290(6000,d)<=3,'Scout muss sehr klein bleiben');

d=entryDecisionV290(row(53,.92),h(52),now);
assert.equal(d.action,'WATCH','53 ohne starke Score-Beschleunigung darf nicht blind gekauft werden');

d=entryDecisionV290(row(54,.94,{parts:{momentum:0,news:7,volume:0,scanner:8,confidence:4}}),h(47),now);
assert.equal(d.action,'WATCH','nur News/mehr Daten ohne positive Marktstruktur darf keinen Scout erzeugen');

d=entryDecisionV290(row(56,.86),h(51),now);
assert.equal(d.action,'BUY_MICRO','56–57 mit stark steigender Richtung und positiver Marktstruktur soll Mikro-Starter erlauben');

d=entryDecisionV290(row(57,.92,{parts:{momentum:3.2,news:5.5,volume:3.2,scanner:8,confidence:3.5}}),[],now);
assert.equal(d.action,'BUY_MICRO','außergewöhnlich starker frischer Katalysator darf 56–57 schon im ersten Scan klein öffnen');

d=entryDecisionV290(row(59,.82),h(56),now);
assert.equal(d.action,'BUY_EARLY','58–61 mit steigender Richtung soll früher Einstieg sein');

d=entryDecisionV290(row(62,.78),h(59),now);
assert.equal(d.action,'BUY','62+ mit sauberem Trend soll regulär kaufen');

d=entryDecisionV290(row(72,.95,{overextended:true,reclaim:false}),h(66),now);
assert.equal(d.action,'WAIT','Überdehnung/FOMO darf auch hohe Scores blockieren');

d=entryDecisionV290(row(90,.95,{hardBlocked:true}),h(82),now);
assert.equal(d.action,'AVOID','Hard-Block darf nie vom frühen Einstieg überstimmt werden');

d=entryDecisionV290(row(78,.95,{day:9.5}),h(70),now);
assert.notEqual(d.action,'BUY','später Tages-Chase darf trotz hohem Score nicht als normaler Einstieg durchrutschen');

let p=profitDecisionV290({pnlPct:3.20,peakPnlPct:4.00,holdScore:75,peakHoldScore:84,lastHoldScore:80,coverage:.90,partial:false,ageMinutes:40,m5:-.22,m20:-.28,acc:-.05});
assert.equal(p.action,'SELL','Gewinn darf bei Score 75 gesichert werden, wenn Peak und Momentum sichtbar brechen');

p=profitDecisionV290({pnlPct:3.20,peakPnlPct:4.00,holdScore:75,peakHoldScore:84,lastHoldScore:72,coverage:.90,partial:false,ageMinutes:40,m5:.20,m20:.30,acc:.05});
assert.equal(p.action,'HOLD','Score 75 mit erneut anziehendem Trend muss weiterlaufen dürfen');

p=profitDecisionV290({pnlPct:4.45,peakPnlPct:6.00,holdScore:70,peakHoldScore:86,lastHoldScore:76,coverage:.92,partial:false,ageMinutes:60,m5:-.18,m20:-.25,acc:-.04});
assert.equal(p.action,'SELL','starker Gewinner darf auch bei Score 70 dynamisch gesichert werden');

p=profitDecisionV290({pnlPct:3.55,peakPnlPct:4.00,holdScore:75,peakHoldScore:85,lastHoldScore:81,coverage:.92,partial:false,ageMinutes:30,m5:-.20,m20:-.22,acc:-.04});
assert.equal(p.action,'SELL','schnell kippender Peak soll Gewinn schon vor großem Rücklauf sichern');

p=profitDecisionV290({pnlPct:.72,peakPnlPct:1.00,holdScore:65,peakHoldScore:70,lastHoldScore:66,coverage:.92,partial:false,ageMinutes:30,m5:-.04,m20:.02,acc:-.01});
assert.equal(p.action,'HOLD','kleines normales Gewinnrauschen darf nicht zu früh verkauft werden');

p=profitDecisionV290({pnlPct:2.2,peakPnlPct:3.0,holdScore:68,peakHoldScore:78,lastHoldScore:72,coverage:.40,partial:true,ageMinutes:50,m5:-.2,m20:-.3,acc:-.05});
assert.equal(p.action,'HOLD','Teilscore/unvollständige Daten dürfen keinen Gewinnverkauf auslösen');

p=profitDecisionV290({pnlPct:3.0,peakPnlPct:3.6,holdScore:70,peakHoldScore:82,lastHoldScore:76,coverage:.9,partial:false,ageMinutes:5,m5:-.2,m20:-.3,acc:-.05});
assert.equal(p.action,'HOLD','junge Gewinner sollen nicht bei erster Abkühlung verkauft werden');

assert.equal(ENTRY_PROFIT_V290.entry.watchMin,50);
assert.equal(ENTRY_PROFIT_V290.entry.scoutMin,53);
assert.equal(ENTRY_PROFIT_V290.entry.microMin,56);
assert.equal(ENTRY_PROFIT_V290.entry.earlyMin,58);
assert.equal(ENTRY_PROFIT_V290.entry.regularMin,62);
assert.ok(ENTRY_PROFIT_V290.entry.scoutCoverage>ENTRY_PROFIT_V290.entry.regularCoverage,'niedrigere Einstiegsscores müssen mehr Datenabdeckung verlangen');
assert.ok(ENTRY_PROFIT_V290.profit.tiers.some(x=>x.maxExitScore>=75),'Gewinn-Lock muss Ausstieg bei noch hohem Score erlauben');
console.log('V29.0 entry 50/53/56/58/62 + dynamic profit lock regression tests: OK');
