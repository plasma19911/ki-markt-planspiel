import {targetVenueIssue} from './target-venue-ai-guard.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

export const DEFAULT_RUNTIME_TRADE_CONFIG=Object.freeze({
 version:1,
 enabled:true,
 earlyEntryEnabled:true,
 earlyExitEnabled:true,
 minScore:4.55,
 minConfidence:.69,
 min5mPct:.02,
 min20mPct:0,
 minAccelerationPct:.01,
 minVolumeRatio:.75,
 maxDayPct:5,
 maxRsi:78,
 nearHighDrawdownPct:.18,
 nearHighMaxDayPct:3.8,
 nearHighMin5mPct:.06,
 nearHighMin20mPct:.08,
 nearHighMaxRsi:75,
 starterPct:12,
 starterMinPct:8,
 starterMaxPct:18,
 earlyExit5mPct:-.18,
 earlyExit20mPct:-.12,
 earlyExitSingle5mPct:-.24,
 earlyExitLossPct:-.45,
 updatedAt:null,
 source:'defaults'
});

const numericKeys=new Set(['minScore','minConfidence','min5mPct','min20mPct','minAccelerationPct','minVolumeRatio','maxDayPct','maxRsi','nearHighDrawdownPct','nearHighMaxDayPct','nearHighMin5mPct','nearHighMin20mPct','nearHighMaxRsi','starterPct','starterMinPct','starterMaxPct','earlyExit5mPct','earlyExit20mPct','earlyExitSingle5mPct','earlyExitLossPct']);
const booleanKeys=new Set(['enabled','earlyEntryEnabled','earlyExitEnabled']);

export function sanitizeRuntimeTradeConfig(input={},base=DEFAULT_RUNTIME_TRADE_CONFIG){
 const out={...DEFAULT_RUNTIME_TRADE_CONFIG,...(base||{})};
 for(const k of booleanKeys)if(k in input)out[k]=Boolean(input[k]);
 for(const k of numericKeys)if(k in input&&Number.isFinite(Number(input[k])))out[k]=Number(input[k]);
 out.minScore=clamp(out.minScore,3.5,8);
 out.minConfidence=clamp(out.minConfidence,.5,.95);
 out.minVolumeRatio=clamp(out.minVolumeRatio,.3,3);
 out.maxDayPct=clamp(out.maxDayPct,1,12);
 out.maxRsi=clamp(out.maxRsi,55,90);
 out.nearHighDrawdownPct=clamp(out.nearHighDrawdownPct,.05,1.2);
 out.nearHighMaxDayPct=clamp(out.nearHighMaxDayPct,1,8);
 out.nearHighMaxRsi=clamp(out.nearHighMaxRsi,55,88);
 out.starterMinPct=clamp(out.starterMinPct,3,20);
 out.starterMaxPct=clamp(out.starterMaxPct,out.starterMinPct,30);
 out.starterPct=clamp(out.starterPct,out.starterMinPct,out.starterMaxPct);
 out.updatedAt=String(input?.updatedAt||out.updatedAt||'')||null;
 out.source=String(input?.source||out.source||'runtime');
 return out;
}

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function metrics(c={}){return{score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),day:num(c?.day,c?.day_change),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi:num(c?.intradayRsi,c?.rsi||50),draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,vol:Number.isFinite(Number(c?.volumeRatio??c?.volume_ratio))?Number(c?.volumeRatio??c?.volume_ratio):null,event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase()}}
function hardUnsafe(c,m){return m.event==='HIGH'||m.state==='REVERSAL'||m.sell==='STRONG'||targetVenueIssue(c)}
function entryQuality(c,cfg){
 const m=metrics(c);if(hardUnsafe(c,m))return{allow:false,m,reason:'hard-safety'};
 const nearHigh=m.draw!==null&&m.draw>-Math.abs(cfg.nearHighDrawdownPct);
 const broad=m.score>=cfg.minScore&&m.confidence>=cfg.minConfidence&&m.m5>=cfg.min5mPct&&m.m20>=cfg.min20mPct&&m.accel>=cfg.minAccelerationPct&&(m.vol===null||m.vol>=cfg.minVolumeRatio)&&m.day<=cfg.maxDayPct&&m.rsi<cfg.maxRsi;
 const nearOk=!nearHigh||(m.day<=cfg.nearHighMaxDayPct&&m.m5>=cfg.nearHighMin5mPct&&m.m20>=cfg.nearHighMin20mPct&&m.rsi<cfg.nearHighMaxRsi);
 return{allow:broad&&nearOk,m,nearHigh,reason:broad?(nearOk?'ok':'near-high'):'quality'};
}
function earlyExit(h,cfg){const m=metrics(h);if(m.state==='REVERSAL'||m.sell==='STRONG')return{allow:true,m,hard:true};const pnl=num(h?.pnlPct,h?.pnl_pct??h?.pnl);const combined=m.m5<=cfg.earlyExit5mPct&&m.m20<=cfg.earlyExit20mPct;const singlePlusLoss=m.m5<=cfg.earlyExitSingle5mPct&&pnl<=cfg.earlyExitLossPct;return{allow:combined||singlePlusLoss,m,pnl,hard:false}}

async function postProcess(r,input,cfg){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt||!cfg.enabled)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cMap=new Map(candidates.map(c=>[key(c),c])),hMap=new Map(held.map(h=>[key(h),h]));let actions=arr(plan.actions).slice(),notes=[];
 if(cfg.earlyEntryEnabled&&!actions.some(a=>String(a?.action||'').toUpperCase()==='BUY')){
  const ranked=candidates.map(c=>({c,q:entryQuality(c,cfg)})).filter(x=>x.q.allow).sort((a,b)=>b.q.m.score-a.q.m.score||b.q.m.confidence-a.q.m.confidence||b.q.m.accel-a.q.m.accel);
  const best=ranked[0];if(best){const s=key(best.c),starter=clamp(cfg.starterPct,cfg.starterMinPct,cfg.starterMaxPct);actions=actions.filter(a=>!(key(a)===s&&String(a?.action||'').toUpperCase()==='HOLD'));actions.push({symbol:s,action:'BUY',confidence:clamp(best.q.m.confidence,.62,.86),allocation_pct:+starter.toFixed(2),reason:`RUNTIME-EARLY-ENTRY: starke frühe Struktur ohne harte Safety-Sperre; nicht auf Vollbestätigung warten · Starter ${starter.toFixed(1)}% · Score ${best.q.m.score.toFixed(2)} · 5m ${best.q.m.m5.toFixed(2)} · 20m ${best.q.m.m20.toFixed(2)} · Beschleunigung ${best.q.m.accel.toFixed(2)}${best.q.nearHigh?' · Near-High-Regel zusätzlich bestanden':''}`});notes.push(`${s} früher Runtime-Starter`)}
 }
 if(cfg.earlyExitEnabled){
  const actionKeys=new Set(actions.map(key));
  for(const h of held){const s=key(h);if(actionKeys.has(s))continue;const q=earlyExit(h,cfg);if(!q.allow)continue;actions.push({symbol:s,action:'SELL',confidence:q.hard?.88:.72,allocation_pct:0,reason:q.hard?'RUNTIME-HARD-EXIT: harter Reversal/STRONG-SELL bleibt sofort.':`RUNTIME-EARLY-EXIT: kombinierte frühe Schwäche; nicht auf vollständige Verkäuferbestätigung warten · 5m ${q.m.m5.toFixed(2)} · 20m ${q.m.m20.toFixed(2)} · P/L ${q.pnl.toFixed(2)}%.`});notes.push(`${s} früher Runtime-Exit`)}
 }
 plan.actions=actions;if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,150)} · LIVE-RUNTIME-CONFIG: ${notes.slice(0,3).join(' · ')}.`;return{...r,response:JSON.stringify(plan)};
}

export class RuntimeTradeConfigAiGuard{
 constructor(base,configProvider){this.base=base;this.configProvider=configProvider}
 async run(model,input){const r=await this.base.run(model,input);let cfg=DEFAULT_RUNTIME_TRADE_CONFIG;try{cfg=sanitizeRuntimeTradeConfig(await this.configProvider?.())}catch{}return postProcess(r,input,cfg)}
}
