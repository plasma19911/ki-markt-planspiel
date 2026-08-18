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

const weak={...fast,context:[{...baseContext,technical:{...baseContext.technical,adx:6,plusDI:7,minusDI:24},multiTimeframe:{longVotes:0,shortVotes:3},reason:'FAST-HOLD: BUY 0.5 / SELL 2.0 · TREND_DOWN',regime:'TREND_DOWN'}]};
assert.equal(applyEvidenceDiversity(weak,prompt).actions.some(x=>x.action==='BUY'),false,'Eindeutig schwache technische Struktur darf keinen BUY erzeugen');

const opportunityFast={actions:[],context:[{...baseContext,fastScore:2.8,reason:'FAST-HOLD: BUY 3.0 / SELL 0.5 · RANGE',technical:{...baseContext.technical,adx:20,vwapDistancePct:.18},multiTimeframe:{longVotes:2,shortVotes:0},regionalBenchmark:{relative20m:.24,blockBuy:false}}],gapContext:[{symbol:'TREND.DE',state:'NORMAL',blockBuy:false}],volumeConfirmation:{minRatio:1.10,ratios:{'TREND.DE':.72}}};
const opportunity=applyEvidenceDiversity(opportunityFast,prompt),opBuy=opportunity.actions.find(x=>x.action==='BUY');
assert.ok(opBuy,'Leeres 1000-EUR-Depot soll ein solides Setup um BUY-Score 3 nicht endlos auf HOLD lassen');
assert.match(opBuy.reason,/QUALIFIED-OPPORTUNITY/);
assert.equal(opBuy.allocation_pct,24);
const costChecked=applyExecutionCostDiscipline(opportunity,prompt);
assert.ok(costChecked.actions.find(x=>x.action==='BUY'));
assert.ok(costChecked.executionCost.bySymbol['TREND.DE'].estimatedRoundTripCostPct<2);

const aiHold={response:JSON.stringify({summary:'KI bleibt vorsichtig',actions:[{symbol:'TREND.DE',action:'HOLD',confidence:.58,allocation_pct:0,reason:'noch abwarten'}]})};
assert.ok(JSON.parse(enforceFastExecutionGuards(aiHold,costChecked).response).actions.find(x=>x.action==='BUY'),'Qualifizierter Ersteinstieg muss trotz generativem HOLD als BUY enden');

const activeFast={actions:[],context:[{...baseContext,fastScore:1.35,reason:'FAST-HOLD: BUY 1.8 / SELL 0.4 · RANGE',technical:{...baseContext.technical,adx:14,vwapDistancePct:-.02,plusDI:18,minusDI:17},multiTimeframe:{longVotes:1,shortVotes:1},marketRelative20m:.04,sectorRelativeDay:0,regionalBenchmark:{relative20m:.02,blockBuy:false}}],gapContext:[{symbol:'TREND.DE',state:'NORMAL',blockBuy:false}],volumeConfirmation:{minRatio:1.10,ratios:{'TREND.DE':.70}}};
const active=applyEvidenceDiversity(activeFast,prompt),activeBuy=active.actions.find(x=>x.action==='BUY');
assert.ok(activeBuy);assert.match(activeBuy.reason,/ACTIVE-FIRST-ENTRY/);assert.equal(activeBuy.allocation_pct,24);
const activeCost=applyExecutionCostDiscipline(active,prompt);assert.ok(JSON.parse(enforceFastExecutionGuards(aiHold,activeCost).response).actions.find(x=>x.action==='BUY'));

const deployCandidates=[{...candidates[0],liveScore:.35,liveConfidence:.32,news:-.05}];
const deployPrompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 1000 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(deployCandidates)} Gehalten=[]`;
const deployFast={actions:[],context:[{...baseContext,fastScore:.3,reason:'FAST-HOLD: BUY 0.8 / SELL 0.5 · RANGE',technical:{...baseContext.technical,adx:10,vwapDistancePct:-.10,plusDI:12,minusDI:15},multiTimeframe:{longVotes:0,shortVotes:1},marketRelative20m:-.03,sectorRelativeDay:0,regionalBenchmark:{relative20m:-.02,blockBuy:false}}],gapContext:[{symbol:'TREND.DE',state:'NORMAL',blockBuy:false}],volumeConfirmation:{minRatio:1.10,ratios:{'TREND.DE':.65}}};
const deploy=applyEvidenceDiversity(deployFast,deployPrompt),deployBuy=deploy.actions.find(x=>x.action==='BUY');
assert.ok(deployBuy,'Roh-Konfidenz 0.32 darf im offensiven leeren Depot nicht mehr pauschal blockieren');
assert.match(deployBuy.reason,/BEST-SAFE-CASH-DEPLOY/);assert.equal(deployBuy.allocation_pct,24);
assert.ok(deploy.evidenceDiversity.bestSafeRawConfidenceFloor<=.32,'Scanner-konforme Confidence-Schwelle erwartet');
const deployCost=applyExecutionCostDiscipline(deploy,deployPrompt),deployFinalBuy=JSON.parse(enforceFastExecutionGuards(aiHold,deployCost).response).actions.find(x=>x.action==='BUY');
assert.ok(deployFinalBuy,'BEST-SAFE-CASH-DEPLOY muss bis zum finalen BUY durchlaufen');assert.ok(deployFinalBuy.confidence>=.5);

const negativeCandidates=[{...deployCandidates[0],liveScore:-.5,liveConfidence:.32,news:-.15}];
const negativePrompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 1000 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(negativeCandidates)} Gehalten=[]`;
assert.equal(applyEvidenceDiversity(deployFast,negativePrompt).actions.some(x=>x.action==='BUY'),false,'Deutlich negatives Live-Setup bleibt ausgeschlossen');

const heldPrompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 800 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(candidates)} Gehalten=[{"symbol":"ALT.DE"}]`;
assert.equal(applyEvidenceDiversity(deployFast,heldPrompt).actions.some(x=>x.action==='BUY'),false,'Aktive Cash-Deployment-Fallbacks gelten nur für ein komplett leeres Depot');

console.log(JSON.stringify({ok:true,trendBuy:buys[0],qualifiedBuy:opBuy,activeBuy,cashDeployBuy:deployFinalBuy},null,2));
