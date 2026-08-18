import assert from 'node:assert/strict';
import {enforceFastExecutionGuards} from '../src/decision-guard.js';

const baseFast={
  actions:[
    {symbol:'HIGH.DE',action:'BUY',confidence:.70,allocation_pct:22,reason:'FAST-BUY HIGH',fastScore:5.2,buyScore:5.2,sellScore:.2,liveScore:5.5},
    {symbol:'LOW.DE',action:'BUY',confidence:.82,allocation_pct:20,reason:'FAST-BUY LOW',fastScore:4.8,buyScore:4.8,sellScore:.2,liveScore:2.5}
  ],
  context:[
    {symbol:'HIGH.DE',fastAction:'BUY',fastScore:5.2,buyScore:5.2,sellScore:.2,liveScore:5.5,technical:{fresh:true,vwapDistancePct:.3,adx:28},multiTimeframe:{longVotes:3},liquidity:{spreadPct:.1,avgVolume:500000},evidenceDiversity:{enoughForFastBuy:true,count:4,minimum:3},fxSafety:{valid:true},regionalBenchmark:{blockBuy:false}},
    {symbol:'LOW.DE',fastAction:'BUY',fastScore:4.8,buyScore:4.8,sellScore:.2,liveScore:2.5,technical:{fresh:true,vwapDistancePct:.2,adx:26},multiTimeframe:{longVotes:3},liquidity:{spreadPct:.1,avgVolume:500000},evidenceDiversity:{enoughForFastBuy:true,count:4,minimum:3},fxSafety:{valid:true},regionalBenchmark:{blockBuy:false}}
  ],
  gapContext:[],
  volumeConfirmation:{minRatio:1.1,ratios:{'HIGH.DE':1.4,'LOW.DE':1.3}},
  executionCost:{cash:1000,slippagePercent:.1,maxRoundTripCostPct:2,warnRoundTripCostPct:1,types:{'HIGH.DE':'EQUITY','LOW.DE':'EQUITY'},prices:{},bySymbol:{'HIGH.DE':{allocationPct:22,notional:220,estimatedRoundTripCost:2.44,estimatedRoundTripCostPct:1.11},'LOW.DE':{allocationPct:20,notional:200,estimatedRoundTripCost:2.4,estimatedRoundTripCostPct:1.2}}}
};

const holdOnly={response:JSON.stringify({summary:'KI bleibt vorsichtig',actions:[{symbol:'HIGH.DE',action:'HOLD',confidence:.6,allocation_pct:0,reason:'abwarten'}]})};
const merged=JSON.parse(enforceFastExecutionGuards(holdOnly,baseFast).response);
const buys=merged.actions.filter(x=>x.action==='BUY');
assert.equal(buys.length,1,'Genau ein bester validierter Fast-BUY soll übernommen werden');
assert.equal(buys[0].symbol,'HIGH.DE','Scanner-Score 5,5 + stärkerer BUY-Score müssen eine etwas niedrigere nackte Konfidenz überwiegen');
assert.match(buys[0].reason,/BEST-VALIDATED-BUY/);
assert.match(merged.summary,/Qualitätsrang/);

const withSell={response:JSON.stringify({summary:'KI sieht Risiko',actions:[{symbol:'HIGH.DE',action:'SELL',confidence:.8,allocation_pct:0,reason:'Risiko'}]})};
const mergedSell=JSON.parse(enforceFastExecutionGuards(withSell,baseFast).response);
assert.equal(mergedSell.actions.some(x=>x.action==='BUY'&&x.symbol==='HIGH.DE'),false,'SELL für denselben Wert darf nicht durch Auto-BUY überschrieben werden');
assert.equal(mergedSell.actions.some(x=>x.action==='BUY'&&x.symbol==='LOW.DE'),true,'Nächstbester validierter Aktien-BUY darf gewählt werden');

const noFast={...baseFast,actions:[]};
const untouched=JSON.parse(enforceFastExecutionGuards(holdOnly,noFast).response);
assert.equal(untouched.actions.some(x=>x.action==='BUY'),false,'Ohne validierten Fast-BUY darf nichts erfunden werden');

const missingVolume={...baseFast,volumeConfirmation:{minRatio:1.1,ratios:{}},actions:[baseFast.actions[0]],context:[baseFast.context[0]]};
const aiBuy={response:JSON.stringify({summary:'KI BUY',actions:[{symbol:'HIGH.DE',action:'BUY',confidence:.8,allocation_pct:22,reason:'mehrfach bestätigt'}]})};
const noVolumeResult=JSON.parse(enforceFastExecutionGuards(aiBuy,missingVolume).response),noVolumeBuy=noVolumeResult.actions.find(x=>x.symbol==='HIGH.DE'&&x.action==='BUY');
assert.ok(noVolumeBuy,'Fehlende Volumenmessung darf einen sonst validen Aktien-BUY nicht blockieren');
assert.equal(noVolumeBuy.allocation_pct,22,'Fehlende Volumenmessung darf die Order nicht verkleinern und fixe Kosten verschlechtern');
assert.ok(noVolumeBuy.confidence<=.64,'Fehlende Volumenmessung reduziert stattdessen die Konfidenz');

console.log(JSON.stringify({ok:true,stocksOnly:true,best:buys[0].symbol,summary:merged.summary,missingVolumeBuy:noVolumeBuy},null,2));
