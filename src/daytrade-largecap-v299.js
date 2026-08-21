import {stableDecisionScoresV296} from './decision-score-v296.js';
import {entryAllocationPctV290} from './entry-profit-behavior-v290-core.js';

const REENTRY_KEY='state/score-reentry-v296';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};

export const DAYTRADE_LARGECAP_V299={
  version:29.9,
  immediateBuyMin:56,
  visibleCandidateTarget:10,
  preferredVisibleMinMarketCapUSD:500_000_000,
  exceptionalSmallCapScore:68,
  marketCapScoreBands:[
    {min:100_000_000_000,points:5,label:'MEGA'},
    {min:20_000_000_000,points:6,label:'LARGE'},
    {min:5_000_000_000,points:5,label:'LARGE'},
    {min:1_000_000_000,points:3,label:'MID_LARGE'},
    {min:500_000_000,points:0,label:'MID'},
    {min:250_000_000,points:-4,label:'SMALL'},
    {min:0,points:-9,label:'MICRO'}
  ]
};

export function marketCapUsdV299(x={}){
  const direct=Number(x?.marketCapUSD??x?.market_cap_usd);
  if(Number.isFinite(direct)&&direct>0)return direct;
  const fallback=Number(x?.marketCap??x?.market_cap);
  return Number.isFinite(fallback)&&fallback>0?fallback:0;
}

export function marketCapBiasV299(x={}){
  const cap=marketCapUsdV299(x);
  if(!(cap>0))return{marketCapUSD:0,points:0,tier:'UNKNOWN',label:'Größe unbekannt'};
  const band=DAYTRADE_LARGECAP_V299.marketCapScoreBands.find(b=>cap>=b.min)||DAYTRADE_LARGECAP_V299.marketCapScoreBands.at(-1);
  const label=band.label==='MEGA'?'Mega-Cap':band.label==='LARGE'?'Large-Cap':band.label==='MID_LARGE'?'größere Mid-Cap':band.label==='MID'?'Mid-Cap':band.label==='SMALL'?'Small-Cap':'Micro-Cap';
  return{marketCapUSD:cap,points:band.points,tier:band.label,label};
}

export function daytradeCandidateScoresV299(state={},storage=null,now=Date.now()){
  const base=stableDecisionScoresV296(state,storage,now,false),cmap=new Map(arr(state?.candidates).map(c=>[key(c),c])),ranking=[];
  for(const row of arr(base.ranking)){
    const c=cmap.get(key(row))||{},size=marketCapBiasV299(c),before=clamp(row.decisionScore,0,100),score=clamp(before+size.points,0,100);
    ranking.push({...row,preDaytradeDecisionScore:+before.toFixed(1),decisionScore:+score.toFixed(1),buyScore:+score.toFixed(1),fusionScore:+score.toFixed(1),holdScore:+score.toFixed(1),sellScore:+(100-score).toFixed(1),daytradeDecisionScore:+score.toFixed(1),marketCapUSD:size.marketCapUSD,daytradeMarketCapPoints:size.points,daytradeSizeTier:size.tier,daytradeSizeLabel:size.label,decisionScoreVersion:29.9});
  }
  ranking.sort((a,b)=>b.daytradeDecisionScore-a.daytradeDecisionScore||b.preDaytradeDecisionScore-a.preDaytradeDecisionScore);
  return{version:29.9,ranking,base};
}

function tierFor(score){if(score>=76)return'EXCEPTIONAL';if(score>=68)return'STRONG';if(score>=62)return'REGULAR';if(score>=58)return'EARLY';return'MICRO'}
function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}

export function enforceDaytradeLargeCapV299(plan,state={},storage=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const scored=daytradeCandidateScoresV299(state,storage,now),by=new Map(scored.ranking.map(r=>[r.symbol,r])),cmap=new Map(arr(state?.candidates).map(c=>[key(c),c])),held=new Set(arr(state?.positions).map(key).filter(Boolean)),re=read(storage,REENTRY_KEY,{locks:{}})||{locks:{}};
  const actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
  const counters={largeCapBuys:0,smallCapBuysSuppressed:0,largeCapPromotions:0,hardBlocksRespected:0,reentryLocksRespected:0};
  for(const row of scored.ranking){
    const s=row.symbol;if(!s||held.has(s))continue;const oldIndex=idx.get(s),old=oldIndex===undefined?null:actions[oldIndex],oldAction=String(old?.action||'').toUpperCase(),locked=Boolean(re?.locks?.[s]);
    if(locked){if(oldAction==='BUY'){actions[oldIndex]={...old,action:'HOLD',allocation_pct:0,reason:`V29.9 DAYTRADE HOLD: ${s} wäre mit Größenfaktor bei ${row.daytradeDecisionScore.toFixed(1)}, ist aber durch die bestehende Reentry-Sperre blockiert.`}}counters.reentryLocksRespected++;continue}
    if(row.hardBlocked){if(oldAction==='BUY'){actions[oldIndex]={...old,action:'HOLD',allocation_pct:0,reason:`V29.9 DAYTRADE HOLD: ${s} bleibt wegen eines technischen/Markt-Hardblocks gesperrt.`}}counters.hardBlocksRespected++;continue}
    if(row.daytradeDecisionScore>=DAYTRADE_LARGECAP_V299.immediateBuyMin){
      const c=cmap.get(s)||{},cash=Math.max(0,num(state?.config?.cash,state?.cash)),pct=entryAllocationPctV290(cash,{score:row.daytradeDecisionScore,tier:tierFor(row.daytradeDecisionScore)}),next={...(old||{}),symbol:s,name:c?.name||old?.name,action:'BUY',allocation_pct:pct,confidence:clamp(.60+(row.daytradeDecisionScore-56)*.006,.60,.90),daytradeLargeCapV299:true,preDaytradeDecisionScore:row.preDaytradeDecisionScore,daytradeDecisionScore:row.daytradeDecisionScore,daytradeMarketCapPoints:row.daytradeMarketCapPoints,daytradeSizeTier:row.daytradeSizeTier,reason:`V29.9 DAYTRADE-BUY: Score ${row.preDaytradeDecisionScore.toFixed(1)} + Größenfaktor ${row.daytradeMarketCapPoints>=0?'+':''}${row.daytradeMarketCapPoints} = ${row.daytradeDecisionScore.toFixed(1)}/100. ${row.daytradeSizeLabel}; ab 56 wird weiterhin sofort gekauft.`};
      if(oldIndex===undefined){idx.set(s,actions.length);actions.push(next)}else actions[oldIndex]=next;
      if(row.daytradeMarketCapPoints>0){counters.largeCapBuys++;if(row.preDaytradeDecisionScore<56)counters.largeCapPromotions++}
      continue;
    }
    if(oldAction==='BUY'){
      actions[oldIndex]={...old,action:'HOLD',allocation_pct:0,daytradeLargeCapV299:true,preDaytradeDecisionScore:row.preDaytradeDecisionScore,daytradeDecisionScore:row.daytradeDecisionScore,daytradeMarketCapPoints:row.daytradeMarketCapPoints,daytradeSizeTier:row.daytradeSizeTier,reason:`V29.9 DAYTRADE-HOLD: ${s} Basis ${row.preDaytradeDecisionScore.toFixed(1)}, Größenfaktor ${row.daytradeMarketCapPoints>=0?'+':''}${row.daytradeMarketCapPoints} => ${row.daytradeDecisionScore.toFixed(1)}/100. Kleine Werte brauchen damit deutlich stärkere Intraday-Signale; Schwelle bleibt 56.`};
      if(row.daytradeMarketCapPoints<0)counters.smallCapBuysSuppressed++;
    }
  }
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,130)} · V29.9 Large-Cap-Daytrade: ${counters.largeCapBuys} große BUY · ${counters.smallCapBuysSuppressed} kleine BUY unter 56 gedrückt.`;
  return{plan,counters,ranking:scored.ranking};
}

export class DaytradeLargeCapGuardV299{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){
    const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);
    if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceDaytradeLargeCapV299(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)
  }
  status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},out=daytradeCandidateScoresV299(state,this.storage,typeof this.now==='function'?this.now():Date.now());return{enabled:true,version:29.9,authoritativeCandidateScore:true,immediateBuyMin:56,marketCapIsScoreInput:true,largeCapsPreferred:true,smallCapsNotHardBanned:true,ranking:out.ranking,latest:this.latest?.counters||null,config:DAYTRADE_LARGECAP_V299,rule:'DecisionScore bleibt die einzige strategische BUY-Schwelle bei 56. V29.9 nimmt Unternehmensgröße direkt in diesen Score auf: große liquide Unternehmen erhalten einen moderaten Bonus, Small-/Micro-Caps einen Malus und brauchen daher stärkere echte Intraday-Signale.'}}
}
