import assert from 'node:assert/strict';
import {enforceFastExecutionGuards} from '../src/decision-guard.js';

const baseFast={
  actions:[
    {symbol:'AAA',action:'BUY',confidence:.81,allocation_pct:22,reason:'FAST-BUY AAA',fastScore:5.1},
    {symbol:'BBB',action:'BUY',confidence:.76,allocation_pct:20,reason:'FAST-BUY BBB',fastScore:5.4}
  ],
  context:[
    {symbol:'AAA',fastAction:'BUY',technical:{fresh:true,vwapDistancePct:.3,adx:28},multiTimeframe:{longVotes:3},liquidity:{spreadPct:.1,avgVolume:500000},evidenceDiversity:{enoughForFastBuy:true,count:4,minimum:3},fxSafety:{valid:true},regionalBenchmark:{blockBuy:false}},
    {symbol:'BBB',fastAction:'BUY',technical:{fresh:true,vwapDistancePct:.2,adx:26},multiTimeframe:{longVotes:3},liquidity:{spreadPct:.1,avgVolume:500000},evidenceDiversity:{enoughForFastBuy:true,count:4,minimum:3},fxSafety:{valid:true},regionalBenchmark:{blockBuy:false}}
  ],
  gapContext:[],
  volumeConfirmation:{minRatio:1.1,ratios:{AAA:1.4,BBB:1.3}},
  executionCost:{cash:1000,slippagePercent:.1,maxRoundTripCostPct:2,warnRoundTripCostPct:1,types:{AAA:'EQUITY',BBB:'EQUITY'},prices:{},bySymbol:{AAA:{allocationPct:22,notional:220,estimatedRoundTripCost:2.44,estimatedRoundTripCostPct:1.11},BBB:{allocationPct:20,notional:200,estimatedRoundTripCost:2.4,estimatedRoundTripCostPct:1.2}}}
};

const holdOnly={response:JSON.stringify({summary:'KI bleibt vorsichtig',actions:[{symbol:'AAA',action:'HOLD',confidence:.6,allocation_pct:0,reason:'abwarten'}]})};
const merged=JSON.parse(enforceFastExecutionGuards(holdOnly,baseFast).response);
const buys=merged.actions.filter(x=>x.action==='BUY');
assert.equal(buys.length,1,'Genau ein bester validierter Fast-BUY soll übernommen werden');
assert.equal(buys[0].symbol,'AAA','Höchste Konfidenz gewinnt');
assert.match(buys[0].reason,/BEST-VALIDATED-BUY/);

const withSell={response:JSON.stringify({summary:'KI sieht Risiko',actions:[{symbol:'AAA',action:'SELL',confidence:.8,allocation_pct:0,reason:'Risiko'}]})};
const mergedSell=JSON.parse(enforceFastExecutionGuards(withSell,baseFast).response);
assert.equal(mergedSell.actions.some(x=>x.action==='BUY'&&x.symbol==='AAA'),false,'SELL für denselben Wert darf nicht durch Auto-BUY überschrieben werden');
assert.equal(mergedSell.actions.some(x=>x.action==='BUY'&&x.symbol==='BBB'),true,'Nächstbester validierter BUY darf gewählt werden');

const noFast={...baseFast,actions:[]};
const untouched=JSON.parse(enforceFastExecutionGuards(holdOnly,noFast).response);
assert.equal(untouched.actions.some(x=>x.action==='BUY'),false,'Ohne validierten Fast-BUY darf nichts erfunden werden');

console.log(JSON.stringify({ok:true,best:buys[0].symbol,summary:merged.summary},null,2));
