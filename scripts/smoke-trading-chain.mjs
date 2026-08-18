import assert from 'node:assert/strict';
import {applyEvidenceDiversity} from '../src/evidence-overlay.js';
import {applyLiveOutcomeLearning} from '../src/live-signal-learning.js';
import {applyExecutionCostDiscipline} from '../src/execution-cost-overlay.js';
import {enforceFastExecutionGuards} from '../src/decision-guard.js';

const candidates=[
  {symbol:'BEST.DE',type:'EQUITY',price:100,momentumState:'NORMAL',momentumSellSignal:'NONE',news:.05,liveScore:5.5,liveConfidence:.68},
  {symbol:'SECOND.DE',type:'EQUITY',price:80,momentumState:'BUILDING',momentumSellSignal:'NONE',news:.10,liveScore:3.6,liveConfidence:.78},
  {symbol:'RISK.DE',type:'EQUITY',price:50,momentumState:'BUILDING',momentumSellSignal:'NONE',news:.20,liveScore:6.0,liveConfidence:.85}
];
const prompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 1000 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(candidates)} Gehalten=[]`;
const safeTech={fresh:true,vwapDistancePct:.30,adx:26,plusDI:31,minusDI:14};
const safeLiq={spreadPct:.10,avgVolume:600000};

// Dieser Zustand entspricht dem produktiven Pfad NACH Gap-/Regional-/FX-Overlay:
// RISK bleibt im Context für Diagnose/Guard, sein BUY wurde wegen GAP_FADE aber bereits entfernt.
const fast={
  actions:[
    {symbol:'BEST.DE',action:'BUY',confidence:.72,allocation_pct:20,reason:'FAST-BUY: starke Struktur',fastScore:5.3},
    {symbol:'SECOND.DE',action:'BUY',confidence:.82,allocation_pct:20,reason:'FAST-BUY: gute Struktur',fastScore:4.5}
  ],
  context:[
    {symbol:'BEST.DE',fastAction:'BUY',fastScore:5.3,reason:'FAST-BUY: starke Struktur',regime:'RANGE',technical:safeTech,multiTimeframe:{longVotes:3,shortVotes:0,alignment:3},liquidity:safeLiq,marketRelative20m:.30,sectorRelativeDay:.12,regionalBenchmark:{relative20m:.24,blockBuy:false},fxSafety:{valid:true}},
    {symbol:'SECOND.DE',fastAction:'BUY',fastScore:4.5,reason:'FAST-BUY: gute Struktur',regime:'RANGE',technical:{...safeTech,vwapDistancePct:.20,adx:23},multiTimeframe:{longVotes:3,shortVotes:0,alignment:3},liquidity:safeLiq,marketRelative20m:.15,sectorRelativeDay:.05,regionalBenchmark:{relative20m:.10,blockBuy:false},fxSafety:{valid:true}},
    {symbol:'RISK.DE',fastAction:'BUY',fastScore:5.8,reason:'FAST-BUY: nominell stark',regime:'RANGE',technical:safeTech,multiTimeframe:{longVotes:3,shortVotes:0,alignment:3},liquidity:safeLiq,marketRelative20m:.35,sectorRelativeDay:.20,regionalBenchmark:{relative20m:.30,blockBuy:false},fxSafety:{valid:true}}
  ],
  gapContext:[
    {symbol:'BEST.DE',state:'NORMAL',blockBuy:false},
    {symbol:'SECOND.DE',state:'NORMAL',blockBuy:false},
    {symbol:'RISK.DE',state:'GAP_FADE',blockBuy:true}
  ],
  volumeConfirmation:{minRatio:1.10,ratios:{'BEST.DE':1.30,'SECOND.DE':1.25,'RISK.DE':1.50}}
};

const evidence=applyEvidenceDiversity(fast,prompt);
assert.equal(evidence.actions.some(x=>x.symbol==='RISK.DE'&&x.action==='BUY'),false,'Gap-blockierter Risikotitel darf nach dem realen Overlay-Pfad nicht wieder als BUY entstehen');
const storage={kv:{state:new Map(),get(k){return this.state.get(k)},put(k,v){this.state.set(k,v)}}};
const learned=applyLiveOutcomeLearning(evidence,prompt,storage);
const costed=applyExecutionCostDiscipline(learned,prompt);
assert.ok(costed.actions.some(x=>x.symbol==='BEST.DE'&&x.action==='BUY'),'BEST.DE muss vor der generativen KI als kaufbar bestehen bleiben');
assert.ok(costed.actions.some(x=>x.symbol==='SECOND.DE'&&x.action==='BUY'),'SECOND.DE darf ebenfalls als zulässige Alternative bestehen bleiben');

const aiHold={response:JSON.stringify({summary:'KI generativ bleibt auf HOLD',actions:[
  {symbol:'BEST.DE',action:'HOLD',confidence:.60,allocation_pct:0,reason:'abwarten'},
  {symbol:'SECOND.DE',action:'HOLD',confidence:.60,allocation_pct:0,reason:'abwarten'}
]})};
const final=JSON.parse(enforceFastExecutionGuards(aiHold,costed).response),buys=final.actions.filter(x=>x.action==='BUY');
assert.equal(buys.length,1,'Bei generativem HOLD soll genau ein bester deterministisch validierter BUY ergänzt werden');
assert.equal(buys[0].symbol,'BEST.DE','Scanner-Score 5,5 + stärkere Gesamtqualität müssen gegen höhere nackte Konfidenz der Alternative gewinnen');
assert.ok(buys[0].confidence>=.5&&buys[0].allocation_pct>0);

// Ein hoher Rohscore darf harte Sicherheit niemals überstimmen, auch wenn die generative KI ihn explizit kaufen will.
const aiRisk={response:JSON.stringify({summary:'KI will Risikotitel',actions:[{symbol:'RISK.DE',action:'BUY',confidence:.9,allocation_pct:25,reason:'hoher Score'}]})};
const riskFinal=JSON.parse(enforceFastExecutionGuards(aiRisk,costed).response),risk=riskFinal.actions.find(x=>x.symbol==='RISK.DE');
assert.ok(risk&&risk.action==='HOLD','Harter Gap-Block muss auch einen Score-6,0 KI-BUY auf HOLD setzen');
assert.match(risk.reason,/HARD-BUY-BLOCK/);

console.log(JSON.stringify({ok:true,stocksOnly:true,bestBuy:buys[0],blockedRisk:risk.reason,summary:final.summary},null,2));
