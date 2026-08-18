import assert from 'node:assert/strict';
import {applyEvidenceDiversity} from '../src/evidence-overlay.js';

const fast={
  actions:[],
  context:[{
    symbol:'TREND.DE',fastAction:'HOLD',fastScore:4.4,reason:'FAST-HOLD: BUY 4.8 / SELL 0.4 · RANGE',regime:'RANGE',
    technical:{fresh:true,vwapDistancePct:.42,adx:28,plusDI:31,minusDI:14},
    multiTimeframe:{longVotes:3,shortVotes:0},
    liquidity:{spreadPct:.12,avgVolume:500000},
    marketRelative20m:.30,sectorRelativeDay:.10,
    regionalBenchmark:{relative20m:.25,blockBuy:false},fxSafety:{valid:true}
  }],
  gapContext:[{symbol:'TREND.DE',state:'NORMAL',blockBuy:false}],
  volumeConfirmation:{minRatio:1.10,ratios:{'TREND.DE':1.45}}
};
const candidates=[{symbol:'TREND.DE',type:'EQUITY',momentumState:'NORMAL',momentumSellSignal:'NONE',news:0}];
const prompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 1000 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(candidates)} Gehalten=[]`;
const checked=applyEvidenceDiversity(fast,prompt),buys=checked.actions.filter(x=>x.action==='BUY');
assert.equal(buys.length,1,'Stark bestaetigter NORMAL-Aufwaertstrend soll nicht allein wegen fehlendem Breakout auf HOLD bleiben');
assert.equal(buys[0].symbol,'TREND.DE');
assert.match(buys[0].reason,/TREND-CONTINUATION/);
assert.ok(buys[0].allocation_pct>0&&buys[0].allocation_pct<=20);
assert.ok(checked.evidenceDiversity.results['TREND.DE'].count>=3,'Mindestens drei unabhaengige Signalsaeulen bleiben Pflicht');

const weak={...fast,context:[{...fast.context[0],technical:{...fast.context[0].technical,adx:17}}]};
const weakChecked=applyEvidenceDiversity(weak,prompt);
assert.equal(weakChecked.actions.some(x=>x.action==='BUY'),false,'Schwacher ADX darf keinen Trend-Continuation-BUY erzeugen');

console.log(JSON.stringify({ok:true,buy:buys[0],evidence:checked.evidenceDiversity.results['TREND.DE']},null,2));
