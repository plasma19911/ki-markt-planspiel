import assert from 'node:assert/strict';
import {ENTRY_PROFIT_V290,entryDecisionV290,entryAllocationPctV290,positionDecisionV290,rotationDecisionV290,profitDecisionV290} from '../src/entry-profit-behavior-v290-core.js';

const now=Date.parse('2026-08-20T20:05:00Z');
const h=(score,min=1)=>[{at:now-min*60_000,score}];
const row=(buyScore,coverage=.92,extra={})=>({buyScore,coverage,hardBlocked:false,overextended:false,day:1.2,parts:{momentum:2.6,news:4.5,volume:2.2,scanner:7,confidence:3,...(extra.parts||{})},...extra});
const pos=(holdScore,coverage=.9,partial=false)=>({holdScore,fusionScore:holdScore,coverage,partial});
const opened=min=>({opened_at:new Date(now-min*60_000).toISOString()});

let d=entryDecisionV290(row(49,.95),h(42),now);
assert.equal(d.action,'AVOID','unter 50 bleibt schwach');
d=entryDecisionV290(row(50,.95),h(44),now);assert.equal(d.action,'WATCH','50–52 ist Beobachtungszone');
d=entryDecisionV290(row(52,.95),h(44),now);assert.equal(d.action,'WATCH','52 darf trotz Beschleunigung noch keinen Scout öffnen');
d=entryDecisionV290(row(53,.92),h(46),now);assert.equal(d.action,'BUY_SCOUT','53 darf bei starker Bestätigung Scout werden');assert.ok(entryAllocationPctV290(6000,d)>=2&&entryAllocationPctV290(6000,d)<=3);
d=entryDecisionV290(row(53,.92),h(52),now);assert.equal(d.action,'WATCH','53 ohne Beschleunigung bleibt Watch');
d=entryDecisionV290(row(54,.94,{parts:{momentum:0,news:7,volume:0,scanner:8,confidence:4}}),h(47),now);assert.equal(d.action,'WATCH','News allein ohne Marktstruktur reicht nicht');
d=entryDecisionV290(row(56,.86),h(51),now);assert.equal(d.action,'BUY_MICRO','56–57 ist bestätigter Mikro-Starter');
d=entryDecisionV290(row(57,.92,{parts:{momentum:3.2,news:5.5,volume:3.2,scanner:8,confidence:3.5}}),[],now);assert.equal(d.action,'BUY_MICRO','außergewöhnlicher frischer Katalysator darf Mikro direkt öffnen');
d=entryDecisionV290(row(59,.82),h(56),now);assert.equal(d.action,'BUY_EARLY','58–61 ist früher Einstieg bei positiver Richtung');
d=entryDecisionV290(row(62,.78),h(59),now);assert.equal(d.action,'BUY','62+ ist regulärer Kauf bei sauberem Trend');
d=entryDecisionV290(row(72,.95,{overextended:true,reclaim:false}),h(66),now);assert.equal(d.action,'WAIT','Überdehnung blockiert auch hohen Score');
d=entryDecisionV290(row(90,.95,{hardBlocked:true}),h(82),now);assert.equal(d.action,'AVOID','Hard-Block bleibt bindend');
d=entryDecisionV290(row(78,.95,{day:9.5}),h(70),now);assert.notEqual(d.action,'BUY','später Tages-Chase darf nicht normal kaufen');

let q=positionDecisionV290(pos(64),h(61),opened(40),now);assert.equal(q.action,'HOLD');assert.equal(q.tier,'STRONG_HOLD');
q=positionDecisionV290(pos(59),h(61),opened(40),now);assert.equal(q.action,'HOLD','58–61 bleibt HOLD');
q=positionDecisionV290(pos(55),h(56),opened(40),now);assert.equal(q.action,'HOLD','53–57 bleibt HOLD/WATCH');
q=positionDecisionV290(pos(51),h(52),opened(40),now);assert.equal(q.action,'HOLD','50–52 ist Achtung, kein automatischer SELL');
q=positionDecisionV290(pos(48),h(49),opened(40),now);assert.equal(q.action,'SELL_WATCH','46–49 ist Verkauf beobachten');
q=positionDecisionV290(pos(44),h(50),opened(40),now);assert.equal(q.action,'SELL','<=45 mit bestätigtem Fall darf verkaufen');
q=positionDecisionV290(pos(41),h(50),opened(40),now);assert.equal(q.action,'SELL','<=42 mit starkem Trendbruch darf verkaufen');
q=positionDecisionV290(pos(31),[],opened(20),now);assert.equal(q.action,'SELL','<=32 ist dringender Score-Exit nach Mindestalter');
q=positionDecisionV290(pos(31,.4,true),h(20),opened(60),now);assert.equal(q.action,'HOLD','Teilscore darf nie automatisch verkaufen');
q=positionDecisionV290(pos(44),h(40),opened(40),now);assert.equal(q.action,'HOLD','klar steigende Erholung darf niedrigen Score vor Exit schützen');

let r=rotationDecisionV290({candidate:{score:64,action:'BUY'},position:{score:50,age:45},cash:300,lastRotationAt:now-30*60_000,now});assert.equal(r.rotate,true,'64er regulärer Kauf darf bei knappem Cash 50er Position mit ausreichendem Abstand ersetzen');
r=rotationDecisionV290({candidate:{score:70,action:'BUY'},position:{score:56,age:45},cash:300,lastRotationAt:now-30*60_000,now});assert.equal(r.rotate,true,'starker 68+ Kandidat darf mäßige Position bis 56 bei 12+ Abstand ersetzen');
r=rotationDecisionV290({candidate:{score:64,action:'BUY'},position:{score:50,age:45},cash:900,lastRotationAt:now-30*60_000,now});assert.equal(r.rotate,false,'bei genug Cash nicht unnötig rotieren');
r=rotationDecisionV290({candidate:{score:61,action:'BUY_EARLY'},position:{score:48,age:45},cash:200,lastRotationAt:now-30*60_000,now});assert.equal(r.rotate,false,'unter regulärer Kaufzone 62 keine Position nur für Rotation verkaufen');

let p=profitDecisionV290({pnlPct:3.20,peakPnlPct:4.00,holdScore:75,peakHoldScore:84,lastHoldScore:80,coverage:.90,partial:false,ageMinutes:40,m5:-.22,m20:-.28,acc:-.05});assert.equal(p.action,'SELL','Gewinn darf bei Score 75 gesichert werden, wenn Peak und Momentum brechen');
p=profitDecisionV290({pnlPct:3.20,peakPnlPct:4.00,holdScore:75,peakHoldScore:84,lastHoldScore:72,coverage:.90,partial:false,ageMinutes:40,m5:.20,m20:.30,acc:.05});assert.equal(p.action,'HOLD','Score 75 mit wieder anziehendem Trend muss weiterlaufen');
p=profitDecisionV290({pnlPct:4.45,peakPnlPct:6.00,holdScore:70,peakHoldScore:86,lastHoldScore:76,coverage:.92,partial:false,ageMinutes:60,m5:-.18,m20:-.25,acc:-.04});assert.equal(p.action,'SELL','starker Gewinner darf auch bei Score 70 dynamisch gesichert werden');
p=profitDecisionV290({pnlPct:.72,peakPnlPct:1.00,holdScore:65,peakHoldScore:70,lastHoldScore:66,coverage:.92,partial:false,ageMinutes:30,m5:-.04,m20:.02,acc:-.01});assert.equal(p.action,'HOLD','kleines normales Gewinnrauschen nicht zu früh verkaufen');
p=profitDecisionV290({pnlPct:2.2,peakPnlPct:3.0,holdScore:68,peakHoldScore:78,lastHoldScore:72,coverage:.40,partial:true,ageMinutes:50,m5:-.2,m20:-.3,acc:-.05});assert.equal(p.action,'HOLD','unvollständige Daten dürfen keinen Gewinnverkauf auslösen');

assert.equal(ENTRY_PROFIT_V290.version,29.1);
assert.deepEqual([ENTRY_PROFIT_V290.entry.watchMin,ENTRY_PROFIT_V290.entry.scoutMin,ENTRY_PROFIT_V290.entry.microMin,ENTRY_PROFIT_V290.entry.earlyMin,ENTRY_PROFIT_V290.entry.regularMin],[50,53,56,58,62]);
assert.deepEqual([ENTRY_PROFIT_V290.position.strongHoldMin,ENTRY_PROFIT_V290.position.holdMin,ENTRY_PROFIT_V290.position.watchHoldMin,ENTRY_PROFIT_V290.position.cautionMin,ENTRY_PROFIT_V290.position.sellWatchMin,ENTRY_PROFIT_V290.position.confirmedExitMax,ENTRY_PROFIT_V290.position.urgentExitMax],[62,58,53,50,46,45,32]);
assert.equal(ENTRY_PROFIT_V290.rotation.candidateMin,62);assert.equal(ENTRY_PROFIT_V290.rotation.weakHoldMax,52);assert.equal(ENTRY_PROFIT_V290.rotation.minGap,10);
assert.ok(ENTRY_PROFIT_V290.entry.scoutCoverage>ENTRY_PROFIT_V290.entry.regularCoverage);
assert.ok(ENTRY_PROFIT_V290.profit.tiers.some(x=>x.maxExitScore>=75));
console.log('V29.1 canonical entry/position/rotation/profit score tests: OK');
