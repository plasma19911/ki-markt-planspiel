import assert from 'node:assert/strict';
import {buildFastDecisionLayer} from '../src/fast-signals.js';
import {buildGapOverlay,applyGapOverlay} from '../src/gap-signals.js';
import {applyVolumeConfirmation} from '../src/volume-overlay.js';
import {applyRegionalBenchmarkConfirmation} from '../src/regional-benchmark-overlay.js';
import {applyEvidenceDiversity} from '../src/evidence-overlay.js';
import {applyExecutionCostDiscipline} from '../src/execution-cost-overlay.js';
import {enforceFastExecutionGuards} from '../src/decision-guard.js';

const now=Math.floor(Date.now()/1000);
const originalFetch=globalThis.fetch;

function closes(symbol,n,interval){
  const down=symbol==='BEAR';
  const step=symbol==='SPY'?(interval==='1d'?.08:.035):(interval==='1d'?.65:.24);
  const start=down?130:100;
  return Array.from({length:n},(_,i)=>+(start+(down?-1:1)*step*i).toFixed(4));
}

function chartResult(symbol){
  if(symbol==='GAP'){
    const cs=[105.0,105.1,104.9,104.2,103.6,103.0,102.5,102.0,101.8,101.7,101.6,101.5,101.4,101.3,101.2,101.1,101.0,100.9,100.8,100.7];
    const os=cs.map((x,i)=>i?cs[i-1]:105.0),hs=cs.map((x,i)=>+(Math.max(x,os[i])+.25).toFixed(3)),ls=cs.map((x,i)=>+(Math.min(x,os[i])-.25).toFixed(3));
    return{meta:{symbol,previousClose:100,regularMarketTime:now},timestamp:cs.map((_,i)=>now-(cs.length-1-i)*300),indicators:{quote:[{open:os,high:hs,low:ls,close:cs,volume:cs.map((_,i)=>i===0?9000:1200)}]}};
  }
  const down=symbol==='BEAR',cs=closes(symbol,30,'5m');
  if(symbol==='BULL')cs[cs.length-1]=+(cs[cs.length-2]+1.2).toFixed(4);
  if(symbol==='BEAR')cs[cs.length-1]=+(cs[cs.length-2]-1.2).toFixed(4);
  const os=cs.map((x,i)=>i?cs[i-1]:x),hs=cs.map((x,i)=>+(Math.max(x,os[i])+.08).toFixed(4)),ls=cs.map((x,i)=>+(Math.min(x,os[i])-.08).toFixed(4));
  const volume=cs.map((_,i)=>1000+i*25);if(symbol==='BULL')volume[volume.length-1]=2100;
  return{meta:{symbol,previousClose:down?131:99.5,regularMarketTime:now},timestamp:cs.map((_,i)=>now-(cs.length-1-i)*300),indicators:{quote:[{open:os,high:hs,low:ls,close:cs,volume}]}};
}

function sparkPayload(symbols,interval){
  return{spark:{result:symbols.map(symbol=>{
    const n=interval==='1d'?45:32,cs=closes(symbol,n,interval);
    return{symbol,response:[{meta:{symbol,regularMarketTime:now,regularMarketPrice:cs.at(-1),previousClose:cs[0]},indicators:{quote:[{close:cs}]}}]};
  })}};
}

function quotePayload(symbols){
  return{quoteResponse:{result:symbols.map(symbol=>({symbol,bid:99.95,ask:100.05,regularMarketVolume:650000,averageDailyVolume3Month:900000,marketCap:50_000_000_000}))}};
}

globalThis.fetch=async input=>{
  const u=new URL(typeof input==='string'?input:input.url||String(input));
  if(u.pathname.includes('/v8/finance/chart/')){
    const symbol=decodeURIComponent(u.pathname.split('/').at(-1)).toUpperCase();
    return Response.json({chart:{result:[chartResult(symbol)],error:null}});
  }
  if(u.pathname.includes('/v7/finance/spark')){
    const symbols=String(u.searchParams.get('symbols')||'').split(',').filter(Boolean).map(x=>x.toUpperCase());
    return Response.json(sparkPayload(symbols,String(u.searchParams.get('interval')||'5m')));
  }
  if(u.pathname.includes('/v7/finance/quote')){
    const symbols=String(u.searchParams.get('symbols')||'').split(',').filter(Boolean).map(x=>x.toUpperCase());
    return Response.json(quotePayload(symbols));
  }
  throw new Error(`Unexpected URL ${u}`);
};

const assets={fetch:async()=>Response.json({equities:[
  {symbol:'BULL',sector:'Technology',marketCapUSD:50_000_000_000},
  {symbol:'BEAR',sector:'Industrials',marketCapUSD:40_000_000_000},
  {symbol:'GAP',sector:'Consumer',marketCapUSD:30_000_000_000}
]})};

try{
  const candidates=[
    {symbol:'BULL',day:2.8,intraday20m:2.1,momentumState:'BREAKOUT',momentumSellSignal:'NONE',volumeRatio:1.8,intradayRsi:61,drawdownFrom20mHighPct:-.05,news:.45},
    {symbol:'BEAR',day:-3.1,intraday20m:-2.2,momentumState:'REVERSAL',momentumSellSignal:'STRONG',volumeRatio:1.7,intradayRsi:43,drawdownFrom20mHighPct:-1.4,news:-.5}
  ];
  const held=[{symbol:'BEAR',pnlPct:3.2,peakPnlPct:7.4}];
  const prompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 10000 EUR; Kosten 1.00 je Kauf/Verkauf + 0.000%, Slippage 0.10%. JSON-only {"summary":"","actions":[]} Kandidaten=${JSON.stringify(candidates)} Gehalten=${JSON.stringify(held)}`;
  const fastRaw=await buildFastDecisionLayer(prompt,assets);
  assert.equal(fastRaw.actions.find(x=>x.symbol==='BEAR')?.action,'SELL','held confirmed reversal must FAST-SELL');
  assert.equal(fastRaw.actions.find(x=>x.symbol==='BULL')?.action,'BUY','confirmed liquid multi-timeframe breakout must FAST-BUY');
  const volume=await applyVolumeConfirmation(fastRaw);
  assert.equal(volume.actions.find(x=>x.symbol==='BULL')?.action,'BUY','confirmed breakout with strong live volume must remain BUY');
  assert.ok((volume.volumeConfirmation?.ratios?.BULL||0)>=volume.volumeConfirmation.minRatio,'BULL must have confirmed live 5m volume');
  const regional=await applyRegionalBenchmarkConfirmation(volume,prompt);
  assert.equal(regional.regionalBenchmark?.results?.BULL?.blockBuy,false,'regionally outperforming BULL must not be blocked');
  const evidence=applyEvidenceDiversity(regional,prompt);
  assert.ok((evidence.evidenceDiversity?.results?.BULL?.count||0)>=3,'BUY must have at least three independent evidence pillars');
  const fast=applyExecutionCostDiscipline(evidence,prompt);
  assert.equal(fast.actions.find(x=>x.symbol==='BULL')?.action,'BUY','economically sensible BUY must survive cost discipline');

  const validAi=enforceFastExecutionGuards({response:JSON.stringify({summary:'ai',actions:[{symbol:'BULL',action:'BUY',confidence:.82,allocation_pct:25,reason:'AI buy'}]})},fast);
  const validAiJson=JSON.parse(validAi.response);
  assert.equal(validAiJson.actions[0].action,'BUY','AI BUY with complete fresh fast confirmation must remain BUY');

  const gapPrompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 10000 EUR; Kosten 1.00 je Kauf/Verkauf + 0.000%, Slippage 0.10%. JSON-only {"summary":"","actions":[]} Kandidaten=${JSON.stringify([{symbol:'GAP'}])} Gehalten=[]`;
  const gap=await buildGapOverlay(gapPrompt);
  const gapCtx=gap.context.find(x=>x.symbol==='GAP');
  assert.equal(gapCtx?.state,'GAP_FADE','large failed opening gap must be classified as GAP_FADE');
  assert.equal(gapCtx?.blockBuy,true,'failed large opening gap must block BUY');

  const combined=applyGapOverlay({summary:'x',actions:[{symbol:'GAP',action:'BUY',confidence:.8,allocation_pct:20,reason:'test'}],context:[]},gap);
  assert.equal(combined.actions.some(x=>x.symbol==='GAP'&&x.action==='BUY'),false,'gap overlay must remove fast BUY');

  const guarded=enforceFastExecutionGuards({response:JSON.stringify({summary:'ai',actions:[{symbol:'GAP',action:'BUY',confidence:.8,allocation_pct:25,reason:'AI buy'}]})},{...combined,gapContext:gap.context});
  const guardedJson=JSON.parse(guarded.response);
  assert.equal(guardedJson.actions[0].action,'HOLD','AI BUY must be hard-blocked when gap overlay blocks entry');
  assert.equal(guardedJson.actions[0].allocation_pct,0,'hard-blocked BUY must allocate zero cash');

  const volumeGuard=enforceFastExecutionGuards(
    {response:JSON.stringify({summary:'ai',actions:[{symbol:'BULL',action:'BUY',confidence:.82,allocation_pct:20,reason:'AI buy'}]})},
    {context:[{symbol:'BULL',technical:{fresh:true,vwapDistancePct:.3,adx:30},multiTimeframe:{longVotes:3},evidenceDiversity:{enoughForFastBuy:true,count:3,minimum:3}}],gapContext:[],volumeConfirmation:{minRatio:1.10,ratios:{BULL:.72}}}
  );
  const volumeGuardJson=JSON.parse(volumeGuard.response);
  assert.equal(volumeGuardJson.actions[0].action,'HOLD','AI BUY must be hard-blocked by confirmed weak live volume');
  assert.equal(volumeGuardJson.actions[0].allocation_pct,0,'volume-blocked BUY must allocate zero cash');

  const unchecked=enforceFastExecutionGuards({response:JSON.stringify({summary:'ai',actions:[{symbol:'UNKNOWN',action:'BUY',confidence:.9,allocation_pct:40,reason:'AI buy'}]})},{context:[],gapContext:[]});
  assert.equal(JSON.parse(unchecked.response).actions[0].action,'HOLD','AI BUY without a current deep check must be blocked');

  const costly=applyExecutionCostDiscipline({actions:[{symbol:'BULL',action:'BUY',confidence:.8,allocation_pct:20,reason:'test'}],context:[]},'Cash 100 EUR; Kosten 1.00 je Kauf/Verkauf + 0.000%, Slippage 0.10%. Kandidaten=[] Gehalten=[]');
  assert.equal(costly.actions.length,0,'tiny position with excessive fixed-cost drag must be blocked');

  console.log(JSON.stringify({ok:true,fastActions:fast.actions,gap:gapCtx?.state,hardGuard:guardedJson.actions[0].action,volumeGuard:volumeGuardJson.actions[0].action,uncheckedGuard:JSON.parse(unchecked.response).actions[0].action,volumeRatio:volume.volumeConfirmation?.ratios?.BULL,evidencePillars:evidence.evidenceDiversity?.results?.BULL?.count},null,2));
}finally{
  globalThis.fetch=originalFetch;
}
