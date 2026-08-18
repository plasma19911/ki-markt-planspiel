import assert from 'node:assert/strict';
import {applyEvidenceDiversity} from '../src/evidence-overlay.js';
import {applyExecutionCostDiscipline} from '../src/execution-cost-overlay.js';
import {enforceFastExecutionGuards} from '../src/decision-guard.js';

const baseContext={
  symbol:'TREND.DE',fastAction:'HOLD',fastScore:4.8,reason:'FAST-HOLD: BUY 4.8 / SELL 0.4 · RANGE',regime:'RANGE',
  technical:{fresh:true,vwapDistancePct:.42,adx:28,plusDI:31,minusDI:14},
  multiTimeframe:{longVotes:3,shortVotes:0},
  liquidity:{spreadPct:.12,avgVolume:500000},
  marketRelative20m:.30,sectorRelativeDay:.10,
  regionalBenchmark:{relative20m:.25,blockBuy:false},fxSafety:{valid:true}
};
const candidates=[{symbol:'TREND.DE',type:'EQUITY',price:100,momentumState:'NORMAL',momentumSellSignal:'NONE',news:0,liveScore:2.2,liveConfidence:.68}];
const prompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 1000 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(candidates)} Gehalten=[]`;

// 1) Starker normaler Trend darf ohne frischen Breakout als Trend-Continuation gekauft werden.
const fast={actions:[],context:[baseContext],gapContext:[{symbol:'TREND.DE',state:'NORMAL',blockBuy:false}],volumeConfirmation:{minRatio:1.10,ratios:{'TREND.DE':1.45}}};
const checked=applyEvidenceDiversity(fast,prompt),trendBuy=checked.actions.find(x=>x.action==='BUY');
assert.ok(trendBuy,'Stark bestätigter NORMAL-Aufwärtstrend soll nicht allein wegen fehlendem Breakout auf HOLD bleiben');
assert.equal(trendBuy.symbol,'TREND.DE');
assert.match(trendBuy.reason,/TREND-CONTINUATION/);
assert.ok(checked.evidenceDiversity.results['TREND.DE'].count>=3);

// 2) Eindeutig bärische Struktur bleibt ausgeschlossen.
const weak={...fast,context:[{...baseContext,fastScore:-1.5,reason:'FAST-HOLD: BUY 0.5 / SELL 2.0 · TREND_DOWN',technical:{...baseContext.technical,adx:6,plusDI:7,minusDI:24,vwapDistancePct:-.5},multiTimeframe:{longVotes:0,shortVotes:3},regime:'TREND_DOWN'}]};
assert.equal(applyEvidenceDiversity(weak,prompt).actions.some(x=>x.action==='BUY'),false,'Eindeutig schwache technische Struktur darf keinen BUY erzeugen');

// 3) Regression für den echten Fehler: Ein Fast-BUY mit Scanner-Score 5,5 hat im Reason
// keine "BUY x / SELL y"-Zahlen. Der Score muss trotzdem korrekt übernommen werden.
const highCandidates=[{symbol:'HIGH.DE',type:'EQUITY',price:100,momentumState:'NORMAL',momentumSellSignal:'NONE',news:0,liveScore:5.5,liveConfidence:.67}];
const highPrompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 1000 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(highCandidates)} Gehalten=[]`;
const highContext={
  symbol:'HIGH.DE',fastAction:'BUY',fastScore:5.5,reason:'FAST-BUY: über VWAP · ADX stark · MTF positiv',regime:'RANGE',
  technical:{fresh:true,vwapDistancePct:.28,adx:24,plusDI:29,minusDI:15},
  multiTimeframe:{longVotes:2,shortVotes:0},
  liquidity:{spreadPct:.10,avgVolume:650000},
  marketRelative20m:.25,sectorRelativeDay:0,
  regionalBenchmark:{relative20m:.24,blockBuy:false},fxSafety:{valid:true}
};
const highFast={
  actions:[{symbol:'HIGH.DE',action:'BUY',confidence:.79,allocation_pct:20,reason:'FAST-BUY: über VWAP · ADX stark · MTF positiv',fastScore:5.5}],
  context:[highContext],gapContext:[{symbol:'HIGH.DE',state:'NORMAL',blockBuy:false}],volumeConfirmation:{minRatio:1.10,ratios:{'HIGH.DE':.75}}
};
const highEvidence=applyEvidenceDiversity(highFast,highPrompt),highBuy=highEvidence.actions.find(x=>x.action==='BUY');
assert.ok(highBuy,'Score-5,5 Fast-BUY darf beim Evidence-Handoff nicht verschwinden');
assert.match(highBuy.reason,/QUALIFIED-OPPORTUNITY/,'Bei genau zwei unabhängigen Säulen soll der starke Fast-BUY kontrolliert als QUALIFIED weiterlaufen');
assert.equal(highBuy.buyScore,5.5,'Fast-BUY-Score muss strukturiert statt per fehleranfälligem Reason-Parsing übernommen werden');
assert.equal(highBuy.liveScore,5.5,'Scanner-Score 5,5 muss im finalen Kaufkandidaten erhalten bleiben');
assert.equal(highEvidence.evidenceDiversity.results['HIGH.DE'].count,2,'Test erwartet genau Trend + relative Stärke als unabhängige Säulen');

const highCost=applyExecutionCostDiscipline(highEvidence,highPrompt),costBuy=highCost.actions.find(x=>x.action==='BUY');
assert.ok(costBuy,'Score-5,5 Kandidat muss den realen ZERO-Kostencheck überleben');
assert.ok(highCost.executionCost.bySymbol['HIGH.DE'].estimatedRoundTripCostPct<2);
assert.ok(highCost.executionCost.bySymbol['HIGH.DE'].notional>0,'Kostencheck muss einen tatsächlich ausführbaren Aktienbetrag verwenden');

const aiHold={response:JSON.stringify({summary:'KI bleibt vorsichtig',actions:[{symbol:'HIGH.DE',action:'HOLD',confidence:.58,allocation_pct:0,reason:'noch abwarten'}]})};
const finalPlan=JSON.parse(enforceFastExecutionGuards(aiHold,highCost).response),finalBuy=finalPlan.actions.find(x=>x.action==='BUY'&&x.symbol==='HIGH.DE');
assert.ok(finalBuy,'Generatives HOLD darf einen vollständig geprüften Score-5,5 Kauf nicht mehr verschwinden lassen');
assert.ok(finalBuy.confidence>=.5);
assert.ok(finalBuy.allocation_pct>0);

// 4) QUALIFIED ist nicht nur ein Ersteinstieg: auch mit bestehender anderer Aktie darf eine
// neue starke Chance gekauft werden, sofern Cash und Sicherheitschecks passen.
const heldPrompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 800 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(highCandidates)} Gehalten=[{"symbol":"ALT.DE","type":"EQUITY"}]`;
const heldEvidence=applyEvidenceDiversity(highFast,heldPrompt);
assert.ok(heldEvidence.actions.some(x=>x.action==='BUY'&&x.symbol==='HIGH.DE'),'Beste neue Aktie darf trotz bereits bestehender anderer Position gekauft werden');

console.log(JSON.stringify({ok:true,stocksOnly:true,trendBuy,score55Buy:finalBuy,cost:highCost.executionCost.bySymbol['HIGH.DE']},null,2));
