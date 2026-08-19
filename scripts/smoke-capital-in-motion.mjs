import assert from 'node:assert/strict';
import {evaluateCapitalMotion,buildCapitalMotionAllocations,buildConfirmedScaleUpActions,shouldRotateCapital,CAPITAL_MOTION_MIN_EXPECTED} from '../src/profit-optimizer-v2.js';
import {evaluateEntryPriceTiming,buildPullbackFirstAllocations} from '../src/pullback-first-ai-guard.js';

const base={symbol:'BEST',score:3.6,confidence:.68,day_change:1.2,news_score:.05,eventRisk:'NONE',momentum5:.06,momentum20:.18,momentumAcceleration5:.02,drawdownFrom20mHighPct:-.4,rsi:61,volumeRatio:1.05,momentumBreakoutScore:.4,momentumState:'BUILDING',momentumSellSignal:'NONE',pro:['EMA9 über EMA21'],contra:[]};
const alt={...base,symbol:'ALT',score:3.2,confidence:.64,momentum5:.04,momentum20:.12};
const unsafe={...base,symbol:'BAD',score:8,confidence:.9,eventRisk:'HIGH'};

const ev=evaluateCapitalMotion(base,null);
assert.equal(ev.confirmed,true,'Solides, nicht perfektes Setup soll im Capital-in-Motion-Modus investierbar sein');
assert.ok(ev.expected>=CAPITAL_MOTION_MIN_EXPECTED,'Capital-Floor muss positiven Mindest-Erwartungswert halten');
assert.equal(evaluateCapitalMotion(unsafe,null).confirmed,false,'HIGH-Event bleibt harte Sperre');
assert.equal(evaluateCapitalMotion({...base,momentumState:'REVERSAL',momentumSellSignal:'STRONG'},null).confirmed,false,'Reversal bleibt harte Sperre');
assert.equal(evaluateCapitalMotion({...base,symbol:'BAD.V'},null).confirmed,false,'Venture-/OTC-artiges Symbol bleibt gesperrt');
assert.equal(evaluateCapitalMotion({...base,momentum5:-.4,momentum20:-.35,score:2},null).confirmed,false,'Klar fallendes Tape darf nicht nur wegen Always-Invested gekauft werden');

const alloc=buildCapitalMotionAllocations([base,alt],null);
assert.ok(alloc.length>=1,'Mindestens ein hart-sicherer Kandidat muss Kapital erhalten');
const total=alloc.reduce((a,x)=>a+x.allocation_pct,0);
assert.ok(Math.abs(total-100)<0.01,`Freies Cash muss auf 100% normalisiert werden, ist ${total}`);
assert.equal(alloc.some(x=>x.symbol==='BAD'),false,'Unsichere Kandidaten duerfen nie in die Allokation');

const weak=evaluateCapitalMotion({...base,symbol:'HELD',score:2.4,confidence:.55,momentum5:-.05,momentum20:.01},null);
const strong=evaluateCapitalMotion({...base,symbol:'NEW',score:4.2,confidence:.75,momentum5:.12,momentum20:.3},null);
assert.equal(shouldRotateCapital({current:weak,alternative:strong,ageMinutes:20,pnlPct:-.2}),true,'Verlierende schwache Position soll frueh in deutlich besseres Setup rotieren');
assert.equal(shouldRotateCapital({current:strong,alternative:{...strong,expected:strong.expected+.4},ageMinutes:30,pnlPct:1.8}),false,'Gesunder Gewinner darf nicht wegen Mini-Vorsprung hektisch rotiert werden');

// Bereits gehaltene Starter duerfen nach erneuter Qualifikation weiter wachsen.
const heldCandidate={...base,symbol:'HELDGOOD',score:4.4,confidence:.76,day_change:.8,momentum5:.12,momentum20:.30,momentumAcceleration5:.06,drawdownFrom20mHighPct:-.55,rsi:60,volumeRatio:1.1,momentumBreakoutScore:.7};
const held=[{symbol:'HELDGOOD',invested:520,pnlPct:.9,opened_at:new Date(Date.now()-35*60_000).toISOString(),last_added_at:new Date(Date.now()-20*60_000).toISOString()}];
const scaleUps=buildConfirmedScaleUpActions(held,[heldCandidate],{cash:8000,storage:null});
assert.equal(scaleUps.length,1,'Erneut bestaetigter Starter muss einen Ausbauvorschlag erhalten');
assert.equal(scaleUps[0].action,'BUY');
assert.match(scaleUps[0].reason,/STARTER-AUSBAU/);
assert.ok(scaleUps[0].allocation_pct>=2&&scaleUps[0].allocation_pct<=10,'Starter-Ausbau bleibt klein und begrenzt');
const tooSoon=buildConfirmedScaleUpActions([{...held[0],last_added_at:new Date(Date.now()-5*60_000).toISOString()}],[heldCandidate],{cash:8000});
assert.equal(tooSoon.length,0,'Innerhalb der 10-Minuten-Hysterese darf nicht erneut aufgestockt werden');
const losing=buildConfirmedScaleUpActions([{...held[0],pnlPct:-2.6}],[{...heldCandidate,momentumBreakoutScore:.2,drawdownFrom20mHighPct:-.5}],{cash:8000});
assert.equal(losing.length,0,'Normaler deutlicher Verlust darf nicht blind averaged-down werden');

// Preis-Timing: nicht am Peak kaufen, sondern Ruecksetzer + erneutes Hochdrehen bevorzugen.
const pullback={...base,symbol:'PULLBACK',score:4.0,confidence:.73,day_change:2.4,drawdownFrom20mHighPct:-.82,momentum5:.09,momentum20:.22,momentumAcceleration5:.06,rsi:59};
const peak={...base,symbol:'PEAK',score:5.2,confidence:.79,day_change:5.7,drawdownFrom20mHighPct:-.03,momentum5:.34,momentum20:1.35,momentumAcceleration5:-.03,rsi:75};
const early={...base,symbol:'EARLY',score:4.3,confidence:.75,day_change:2.1,drawdownFrom20mHighPct:-.06,momentum5:.18,momentum20:.46,momentumAcceleration5:.08,rsi:66,momentumState:'BREAKOUT',momentumBreakoutScore:1.3};
const fallingValley={...pullback,symbol:'FALLING',momentum5:-.18,momentum20:-.22,momentumAcceleration5:-.09};

const pullbackTiming=evaluateEntryPriceTiming(pullback,null),peakTiming=evaluateEntryPriceTiming(peak,null),earlyTiming=evaluateEntryPriceTiming(early,null),fallingTiming=evaluateEntryPriceTiming(fallingValley,null);
assert.equal(pullbackTiming.buyable,true,'Bestaetigter Ruecksetzer soll kaufbar sein');
assert.equal(pullbackTiming.pullbackConfirmed,true,'Ruecksetzer muss als PULLBACK_RETEST erkannt werden');
assert.equal(peakTiming.buyable,false,'Spaeter Peak darf trotz hohem Rohscore nicht gekauft werden');
assert.equal(peakTiming.peakRisk,true,'Peak-Risiko muss explizit erkannt werden');
assert.equal(earlyTiming.buyable,true,'Frueher, nicht ueberhitzter Breakout soll weiterhin kaufbar sein');
assert.equal(earlyTiming.earlyBreakout,true,'Frueher Breakout muss klassifiziert werden');
assert.equal(fallingTiming.buyable,false,'Ein Tal ohne erneutes Hochdrehen ist ein fallendes Messer und bleibt blockiert');

const pullbackAlloc=buildPullbackFirstAllocations([peak,pullback],null);
assert.ok(pullbackAlloc.length>=1,'Ruecksetzer muss Kapital erhalten');
assert.equal(pullbackAlloc[0].symbol,'PULLBACK','Ruecksetzer muss den bereits weit gelaufenen Peak schlagen');
assert.equal(pullbackAlloc.some(x=>x.symbol==='PEAK'),false,'Peak darf nicht durch 100%-Cash-Zwang wieder hineinkommen');
assert.ok(Math.abs(pullbackAlloc.reduce((a,x)=>a+x.allocation_pct,0)-100)<.01,'Wenn ein normaler guter Pullback vorhanden ist, darf das verfuegbare Cash weiterhin voll eingesetzt werden');

console.log(JSON.stringify({ok:true,capitalFloor:ev,allocation:alloc.map(x=>({symbol:x.symbol,pct:x.allocation_pct,expected:x.expected,tier:x.tier})),rotation:true,hardSafety:true,scaleUp:{enabled:true,count:scaleUps.length,pct:scaleUps[0].allocation_pct,hysteresis:true,noBlindAverageDown:true},pullbackFirst:{pullback:pullbackTiming,peakBlocked:peakTiming.peakRisk,earlyBreakout:earlyTiming.earlyBreakout,fallingKnifeBlocked:!fallingTiming.buyable,allocation:pullbackAlloc.map(x=>({symbol:x.symbol,pct:x.allocation_pct,mode:x.entryMode,score:x.adjustedExpected}))}},null,2));
