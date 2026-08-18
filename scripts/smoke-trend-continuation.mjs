import assert from 'node:assert/strict';
import {applyEvidenceDiversity} from '../src/evidence-overlay.js';
import {applyExecutionCostDiscipline} from '../src/execution-cost-overlay.js';
import {enforceFastExecutionGuards} from '../src/decision-guard.js';

const baseContext={
  symbol:'TREND.DE',fastAction:'HOLD',fastScore:4.4,reason:'FAST-HOLD: BUY 4.8 / SELL 0.4 · RANGE',regime:'RANGE',
  technical:{fresh:true,vwapDistancePct:.42,adx:28,plusDI:31,minusDI:14},
  multiTimeframe:{longVotes:3,shortVotes:0},
  liquidity:{spreadPct:.12,avgVolume:500000},
  marketRelative20m:.30,sectorRelativeDay:.10,
  regionalBenchmark:{relative20m:.25,blockBuy:false},fxSafety:{valid:true}
};
const fast={actions:[],context:[baseContext],gapContext:[{symbol:'TREND.DE',state:'NORMAL',blockBuy:false}],volumeConfirmation:{minRatio:1.10,ratios:{'TREND.DE':1.45}}};
const candidates=[{symbol:'TREND.DE',type:'EQUITY',price:100,momentumState:'NORMAL',momentumSellSignal:'NONE',news:0,liveScore:2.2,liveConfidence:.68}];
const prompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 1000 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(candidates)} Gehalten=[]`;
const checked=applyEvidenceDiversity(fast,prompt),buys=checked.actions.filter(x=>x.action==='BUY');
assert.equal(buys.length,1,'Stark bestaetigter NORMAL-Aufwaertstrend soll nicht allein wegen fehlendem Breakout auf HOLD bleiben');
assert.equal(buys[0].symbol,'TREND.DE');
assert.match(buys[0].reason,/TREND-CONTINUATION/);
assert.ok(buys[0].allocation_pct>20&&buys[0].allocation_pct<=28,'Kleines offensives Depot soll kosteneffizient statt zu klein positionieren');
assert.ok(checked.evidenceDiversity.results['TREND.DE'].count>=3,'Trend-Continuation verlangt weiterhin mindestens drei unabhaengige Signalsaeulen');

const weak={...fast,context:[{...baseContext,technical:{...baseContext.technical,adx:17}}]};
const weakChecked=applyEvidenceDiversity(weak,prompt);
assert.equal(weakChecked.actions.some(x=>x.action==='BUY'),false,'Schwacher ADX darf weder Trend-Continuation noch qualifizierte Chance erzeugen');

const opportunityFast={
  actions:[],
  context:[{...baseContext,fastScore:2.8,reason:'FAST-HOLD: BUY 3.0 / SELL 0.5 · RANGE',technical:{...baseContext.technical,adx:20,vwapDistancePct:.18},multiTimeframe:{longVotes:2,shortVotes:0},regionalBenchmark:{relative20m:.24,blockBuy:false}}],
  gapContext:[{symbol:'TREND.DE',state:'NORMAL',blockBuy:false}],
  volumeConfirmation:{minRatio:1.10,ratios:{'TREND.DE':.72}}
};
const opportunity=applyEvidenceDiversity(opportunityFast,prompt),opBuy=opportunity.actions.find(x=>x.action==='BUY');
assert.ok(opBuy,'Leeres 1000-EUR-Depot soll ein solides Setup um BUY-Score 3 nicht endlos auf HOLD lassen');
assert.match(opBuy.reason,/QUALIFIED-OPPORTUNITY/);
assert.equal(opBuy.allocation_pct,24,'Offensives 1000-EUR-Depot nutzt eine kostenökonomische Erstposition');
assert.equal(opportunity.evidenceDiversity.results['TREND.DE'].count,2,'Qualifizierte Chance darf mit zwei starken unabhaengigen Saeulen starten');
assert.ok(opportunity.evidenceDiversity.qualifiedOpportunityBuyFloor<=3.0,'Ersteinstiegsschwelle muss fuer leeres Depot knapp unter 3 liegen');

const costChecked=applyExecutionCostDiscipline(opportunity,prompt),costBuy=costChecked.actions.find(x=>x.action==='BUY');
assert.ok(costBuy,'Qualifizierter 24%-Ersteinstieg muss die ZERO-Kostenstufe überleben');
assert.ok(costChecked.executionCost.bySymbol['TREND.DE'].estimatedRoundTripCostPct<2,'Ersteinstieg muss unter dem 2%-Roundtrip-Hard-Cap bleiben');

const aiHold={response:JSON.stringify({summary:'KI bleibt vorsichtig',actions:[{symbol:'TREND.DE',action:'HOLD',confidence:.58,allocation_pct:0,reason:'noch abwarten'}]})};
const finalPlan=JSON.parse(enforceFastExecutionGuards(aiHold,costChecked).response),finalBuy=finalPlan.actions.find(x=>x.action==='BUY');
assert.ok(finalBuy,'Auch wenn die generative KI HOLD sagt, muss der qualifizierte und kostenfreigegebene Ersteinstieg als BUY im finalen Plan landen');
assert.equal(finalBuy.symbol,'TREND.DE');
assert.match(finalBuy.reason,/BEST-VALIDATED-BUY|QUALIFIED-OPPORTUNITY/);

const heldPrompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 800 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(candidates)} Gehalten=[{"symbol":"ALT.DE"}]`;
const notIdle=applyEvidenceDiversity(opportunityFast,heldPrompt);
assert.equal(notIdle.actions.some(x=>String(x.reason||'').includes('QUALIFIED-OPPORTUNITY')),false,'Der abgesenkte Einstieg gilt nur fuer ein noch komplett leeres Depot');

console.log(JSON.stringify({ok:true,trendBuy:buys[0],qualifiedBuy:opBuy,cost:costChecked.executionCost.bySymbol['TREND.DE'],finalBuy,evidence:opportunity.evidenceDiversity.results['TREND.DE']},null,2));
