import assert from 'node:assert/strict';
import {buildFastDecisionLayer} from '../src/fast-signals.js';

const originalFetch=globalThis.fetch,now=Math.floor(Date.now()/1000),day=86400;
function chartPayload(symbol){
  const prevStart=now-day-25*300,currentStart=now-2*300,ts=[];
  for(let i=0;i<25;i++)ts.push(prevStart+i*300);
  for(let i=0;i<3;i++)ts.push(currentStart+i*300);
  const close=ts.map((_,i)=>100+i*.08),open=close.map((x,i)=>i?close[i-1]:x),high=close.map((x,i)=>Math.max(x,open[i])+.06),low=close.map((x,i)=>Math.min(x,open[i])-.06),volume=close.map((_,i)=>1200+i*20);
  return{chart:{result:[{meta:{symbol,previousClose:101,regularMarketTime:now,exchangeTimezoneName:'Europe/Berlin',currentTradingPeriod:{regular:{start:currentStart,end:currentStart+8*3600}}},timestamp:ts,indicators:{quote:[{open,high,low,close,volume}]}}],error:null}};
}
function sparkPayload(symbols){return{spark:{result:symbols.map(symbol=>{const close=Array.from({length:30},(_,i)=>100+i*.1);return{symbol,response:[{meta:{symbol,regularMarketTime:now},indicators:{quote:[{close}]}}]}})}}}
function quotePayload(symbols){return{quoteResponse:{result:symbols.map(symbol=>({symbol,bid:102.20,ask:102.24,regularMarketVolume:500000,averageDailyVolume3Month:800000,marketCap:10_000_000_000}))}}}

globalThis.fetch=async input=>{const u=new URL(typeof input==='string'?input:input.url||String(input));if(u.pathname.includes('/v8/finance/chart/'))return Response.json(chartPayload(decodeURIComponent(u.pathname.split('/').at(-1))));if(u.pathname.includes('/v7/finance/spark'))return Response.json(sparkPayload(String(u.searchParams.get('symbols')||'').split(',').filter(Boolean)));if(u.pathname.includes('/v7/finance/quote'))return Response.json(quotePayload(String(u.searchParams.get('symbols')||'').split(',').filter(Boolean)));throw new Error(`Unexpected URL ${u}`)};

const assets={fetch:async()=>Response.json({equities:[{symbol:'EARLY.DE',sector:'Technology'}]})};
try{
  const candidates=[{symbol:'EARLY.DE',day:1.4,intraday20m:.8,momentumState:'BREAKOUT',momentumSellSignal:'NONE',volumeRatio:1.7,intradayRsi:62,drawdownFrom20mHighPct:-.05,news:.25,confidence:.8}],prompt=`PAPER-TRADING ONLY. Handelsstil=offensiv. Cash 1000 EUR; Slippage 0.10%. Kandidaten=${JSON.stringify(candidates)} Gehalten=[]`;
  const fast=await buildFastDecisionLayer(prompt,assets),ctx=fast.context.find(x=>x.symbol==='EARLY.DE');
  assert.ok(ctx?.technical,'Technischer Deep-Check muss mit Historie + 3 aktuellen Bars verfuegbar sein');
  assert.equal(ctx.technical.sessionBars,3,'VWAP darf nur die drei aktuellen Sitzungsbars verwenden');
  assert.ok(ctx.technical.historyBars>=28,'ADX/ATR muessen Vortageshistorie mitbenutzen');
  assert.equal(ctx.technical.fresh,true,'Aktuelle Bars muessen als frisch erkannt werden');
  console.log(JSON.stringify({ok:true,technical:ctx.technical,action:ctx.fastAction,summary:fast.summary},null,2));
}finally{globalThis.fetch=originalFetch}
