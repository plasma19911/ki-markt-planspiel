import assert from 'node:assert/strict';
import {evaluateCapitalMotion,buildCapitalMotionAllocations,shouldRotateCapital,CAPITAL_MOTION_MIN_EXPECTED} from '../src/profit-optimizer-v2.js';

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

console.log(JSON.stringify({ok:true,capitalFloor:ev,allocation:alloc.map(x=>({symbol:x.symbol,pct:x.allocation_pct,expected:x.expected,tier:x.tier})),rotation:true,hardSafety:true},null,2));
