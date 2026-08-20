import {targetVenueIssue} from './target-venue-ai-guard.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

export const DEFAULT_RUNTIME_TRADE_CONFIG=Object.freeze({
 version:2,
 enabled:true,
 earlyEntryEnabled:true,
 earlyExitEnabled:true,
 dynamicCapitalEnabled:true,
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
 maxDynamicBuysPerScan:4,
 dynamicBaseDeploymentPct:18,
 dynamicTopQualityBoostPct:47,
 dynamicBreadthBoostPct:35,
 dynamicMaxCashDeploymentPct:100,
 dynamicPerPositionMaxPct:30,
 dynamicNearHighMaxPct:8,
 dynamicExceptionalQuality:0.84,
 dynamicFullInvestMinCandidates:3,
 earlyExit5mPct:-.18,
 earlyExit20mPct:-.12,
 earlyExitSingle5mPct:-.24,
 earlyExitLossPct:-.45,
 updatedAt:null,
 source:'defaults'
});

const numericKeys=new Set(['minScore','minConfidence','min5mPct','min20mPct','minAccelerationPct','minVolumeRatio','maxDayPct','maxRsi','nearHighDrawdownPct','nearHighMaxDayPct','nearHighMin5mPct','nearHighMin20mPct','nearHighMaxRsi','starterPct','starterMinPct','starterMaxPct','maxDynamicBuysPerScan','dynamicBaseDeploymentPct','dynamicTopQualityBoostPct','dynamicBreadthBoostPct','dynamicMaxCashDeploymentPct','dynamicPerPositionMaxPct','dynamicNearHighMaxPct','dynamicExceptionalQuality','dynamicFullInvestMinCandidates','earlyExit5mPct','earlyExit20mPct','earlyExitSingle5mPct','earlyExitLossPct']);
const booleanKeys=new Set(['enabled','earlyEntryEnabled','earlyExitEnabled','dynamicCapitalEnabled']);

export function sanitizeRuntimeTradeConfig(input={},base=DEFAULT_RUNTIME_TRADE_CONFIG){
 const out={...DEFAULT_RUNTIME_TRADE_CONFIG,...(base||{})};
 for(const k of booleanKeys)if(k in input)out[k]=Boolean(input[k]);
 for(const k of numericKeys)if(k in input&&Number.isFinite(Number(input[k])))out[k]=Number(input[k]);
 out.version=2;
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
 out.maxDynamicBuysPerScan=Math.round(clamp(out.maxDynamicBuysPerScan,1,6));
 out.dynamicBaseDeploymentPct=clamp(out.dynamicBaseDeploymentPct,0,50);
 out.dynamicTopQualityBoostPct=clamp(out.dynamicTopQualityBoostPct,0,70);
 out.dynamicBreadthBoostPct=clamp(out.dynamicBreadthBoostPct,0,60);
 out.dynamicMaxCashDeploymentPct=clamp(out.dynamicMaxCashDeploymentPct,10,100);
 out.dynamicPerPositionMaxPct=clamp(out.dynamicPerPositionMaxPct,8,40);
 out.dynamicNearHighMaxPct=clamp(out.dynamicNearHighMaxPct,3,15);
 out.dynamicExceptionalQuality=clamp(out.dynamicExceptionalQuality,.65,.98);
 out.dynamicFullInvestMinCandidates=Math.round(clamp(out.dynamicFullInvestMinCandidates,2,6));
 out.updatedAt=String(input?.updatedAt||out.updatedAt||'')||null;
 out.source=String(input?.source||out.source||'runtime');
 return out;
}

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function metrics(c={}){return{score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),day:num(c?.day,c?.day_change),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi:num(c?.intradayRsi,c?.rsi||50),draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,vol:Number.isFinite(Number(c?.volumeRatio??c?.volume_ratio))?Number(c?.volumeRatio??c?.volume_ratio):null,news:num(c?.news,c?.newsScore??c?.news_score),event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase()}}
function hardUnsafe(c,m){return m.event==='HIGH'||m.state==='REVERSAL'||m.sell==='STRONG'||targetVenueIssue(c)}
function entryQuality(c,cfg){
 const m=metrics(c);if(hardUnsafe(c,m))return{allow:false,m,reason:'hard-safety',quality:0,nearHigh:false};
 const nearHigh=m.draw!==null&&m.draw>-Math.abs(cfg.nearHighDrawdownPct);
 const broad=m.score>=cfg.minScore&&m.confidence>=cfg.minConfidence&&m.m5>=cfg.min5mPct&&m.m20>=cfg.min20mPct&&m.accel>=cfg.minAccelerationPct&&(m.vol===null||m.vol>=cfg.minVolumeRatio)&&m.day<=cfg.maxDayPct&&m.rsi<cfg.maxRsi;
 const nearOk=!nearHigh||(m.day<=cfg.nearHighMaxDayPct&&m.m5>=cfg.nearHighMin5mPct&&m.m20>=cfg.nearHighMin20mPct&&m.rsi<cfg.nearHighMaxRsi);
 const scoreQ=clamp((m.score-cfg.minScore)/2.0,0,1),confQ=clamp((m.confidence-cfg.minConfidence)/.18,0,1),momQ=clamp((m.m5-cfg.min5mPct)/.18,0,1)*.55+clamp((m.m20-cfg.min20mPct)/.28,0,1)*.45,accQ=clamp((m.accel-cfg.minAccelerationPct)/.10,0,1),newsQ=clamp((m.news+.15)/.65,0,1);
 const quality=clamp(scoreQ*.38+confQ*.24+momQ*.20+accQ*.12+newsQ*.06-(nearHigh?.08:0),0,1);
 return{allow:broad&&nearOk,m,nearHigh,quality,reason:broad?(nearOk?'ok':'near-high'):'quality'};
}
function earlyExit(h,cfg){const m=metrics(h);if(m.state==='REVERSAL'||m.sell==='STRONG')return{allow:true,m,hard:true};const pnl=num(h?.pnlPct,h?.pnl_pct??h?.pnl);const combined=m.m5<=cfg.earlyExit5mPct&&m.m20<=cfg.earlyExit20mPct;const singlePlusLoss=m.m5<=cfg.earlyExitSingle5mPct&&pnl<=cfg.earlyExitLossPct;return{allow:combined||singlePlusLoss,m,pnl,hard:false}}

function deploymentTarget(ranked,cfg){
 if(!ranked.length)return{target:0,tier:'CASH',topQuality:0,breadth:0};
 const topQuality=ranked[0].q.quality,breadth=clamp(ranked.length/Math.max(1,cfg.maxDynamicBuysPerScan),0,1);
 let target=cfg.dynamicBaseDeploymentPct+topQuality*cfg.dynamicTopQualityBoostPct+breadth*cfg.dynamicBreadthBoostPct;
 const exceptional=ranked.filter(x=>x.q.quality>=cfg.dynamicExceptionalQuality&&!x.q.nearHigh).length;
 if(ranked.length>=cfg.dynamicFullInvestMinCandidates&&exceptional>=2)target=cfg.dynamicMaxCashDeploymentPct;
 target=clamp(target,0,cfg.dynamicMaxCashDeploymentPct);
 const tier=target>=90?'SEHR_STARK':target>=60?'STARK':target>=35?'KONSTRUKTIV':'SELEKTIV';
 return{target,tier,topQuality,breadth,exceptional};
}
function allocateDynamic(ranked,target,cfg){
 const rows=ranked.slice(0,cfg.maxDynamicBuysPerScan).map(x=>({...x,allocation:0,cap:x.q.nearHigh?cfg.dynamicNearHighMaxPct:cfg.dynamicPerPositionMaxPct,weight:.55+x.q.quality}));
 let remaining=target,active=rows.slice();
 for(let pass=0;pass<6&&remaining>.05&&active.length;pass++){
  const weightSum=active.reduce((a,x)=>a+x.weight,0)||active.length;let used=0;
  for(const x of active){const room=Math.max(0,x.cap-x.allocation),share=remaining*(x.weight/weightSum),add=Math.min(room,share);x.allocation+=add;used+=add}
  remaining-=used;active=active.filter(x=>x.cap-x.allocation>.05);if(used<.01)break;
 }
 return rows.filter(x=>x.allocation>=3);
}

async function postProcess(r,input,cfg){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt||!cfg.enabled)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),heldKeys=new Set(held.map(key));let actions=arr(plan.actions).slice(),notes=[];
 const ranked=candidates.map(c=>({c,q:entryQuality(c,cfg)})).filter(x=>x.q.allow&&!heldKeys.has(key(x.c))).sort((a,b)=>b.q.quality-a.q.quality||b.q.m.score-a.q.m.score||b.q.m.confidence-a.q.m.confidence||b.q.m.accel-a.q.m.accel);
 if(cfg.earlyEntryEnabled&&ranked.length){
  if(cfg.dynamicCapitalEnabled){
   const dep=deploymentTarget(ranked,cfg),alloc=allocateDynamic(ranked,dep.target,cfg),selected=new Set(alloc.map(x=>key(x.c)));
   for(const x of alloc){const s=key(x.c),pct=+x.allocation.toFixed(2);actions=actions.filter(a=>!(key(a)===s&&['HOLD','BUY'].includes(String(a?.action||'').toUpperCase())));actions.push({symbol:s,action:'BUY',confidence:clamp(x.q.m.confidence,.62,.88),allocation_pct:pct,reason:`DYNAMIC-CAPITAL-${dep.tier}: ${pct.toFixed(1)}% des freien Cashs · Qualitätswert ${x.q.quality.toFixed(2)} · Score ${x.q.m.score.toFixed(2)} · 5m ${x.q.m.m5.toFixed(2)} · 20m ${x.q.m.m20.toFixed(2)} · Beschleunigung ${x.q.m.accel.toFixed(2)}${x.q.nearHigh?' · Near-High deshalb klein gedeckelt':''}`})}
   if(alloc.length)notes.push(`Kapitalziel ${dep.target.toFixed(0)}% (${dep.tier}), ${alloc.length} Kaufchance(n)`);
   for(const a of actions){if(String(a?.action||'').toUpperCase()!=='BUY'||selected.has(key(a)))continue;const c=candidates.find(x=>key(x)===key(a));if(!c)continue;const q=entryQuality(c,cfg);if(hardUnsafe(c,q.m)){a.action='HOLD';a.allocation_pct=0;a.reason='RUNTIME-HARD-SAFETY: BUY nach finaler Prüfung blockiert.'}else if(q.nearHigh)a.allocation_pct=Math.min(num(a.allocation_pct),cfg.dynamicNearHighMaxPct)}
  }else if(!actions.some(a=>String(a?.action||'').toUpperCase()==='BUY')){
   const best=ranked[0],s=key(best.c),starter=clamp(cfg.starterPct,cfg.starterMinPct,cfg.starterMaxPct);actions=actions.filter(a=>!(key(a)===s&&String(a?.action||'').toUpperCase()==='HOLD'));actions.push({symbol:s,action:'BUY',confidence:clamp(best.q.m.confidence,.62,.86),allocation_pct:+starter.toFixed(2),reason:`RUNTIME-EARLY-ENTRY: starke frühe Struktur ohne harte Safety-Sperre; Starter ${starter.toFixed(1)}%${best.q.nearHigh?' · Near-High-Regel bestanden':''}`});notes.push(`${s} früher Runtime-Starter`)
  }
 }
 if(cfg.earlyExitEnabled){
  const committedKeys=new Set(actions.filter(a=>['BUY','SELL'].includes(String(a?.action||'').toUpperCase())).map(key));
  for(const h of held){const s=key(h);if(committedKeys.has(s))continue;const q=earlyExit(h,cfg);if(!q.allow)continue;actions=actions.filter(a=>!(key(a)===s&&String(a?.action||'').toUpperCase()==='HOLD'));actions.push({symbol:s,action:'SELL',confidence:q.hard?.88:.72,allocation_pct:0,reason:q.hard?'RUNTIME-HARD-EXIT: harter Reversal/STRONG-SELL bleibt sofort.':`RUNTIME-EARLY-EXIT: kombinierte frühe Schwäche; nicht auf vollständige Verkäuferbestätigung warten · 5m ${q.m.m5.toFixed(2)} · 20m ${q.m.m20.toFixed(2)} · P/L ${q.pnl.toFixed(2)}%.`});committedKeys.add(s);notes.push(`${s} früher Runtime-Exit`)}
 }
 plan.actions=actions;if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,135)} · LIVE-RUNTIME: ${notes.slice(0,3).join(' · ')}.`;return{...r,response:JSON.stringify(plan)};
}

export class RuntimeTradeConfigAiGuard{
 constructor(base,configProvider){this.base=base;this.configProvider=configProvider}
 async run(model,input){const r=await this.base.run(model,input);let cfg=DEFAULT_RUNTIME_TRADE_CONFIG;try{cfg=sanitizeRuntimeTradeConfig(await this.configProvider?.())}catch{}return postProcess(r,input,cfg)}
}
