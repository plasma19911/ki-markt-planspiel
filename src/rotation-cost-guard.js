import {getReplayRotationAdjustment} from './rotation-replay-adjustment.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function promptCash(text){const m=String(text||'').match(/\bCash\s+([0-9]+(?:[.,][0-9]+)?)/i);return m?num(String(m[1]).replace(',','.')):0}
function reasonGap(reason){const m=String(reason||'').match(/(?:Differenz|Score)\s+(-?[0-9]+(?:[.,][0-9]+)?)(?:\s+vs\.\s+[^\s]+\s+(-?[0-9]+(?:[.,][0-9]+)?))?/i);if(!m)return null;const a=num(String(m[1]).replace(',','.'));if(m[2]!=null)return a-num(String(m[2]).replace(',','.'));return a}
function hardExit(h={},a={}){const state=String(h?.momentumState||h?.momentum_state||'').toUpperCase(),sell=String(h?.momentumSellSignal||h?.momentum_sell_signal||'').toUpperCase(),event=String(h?.eventRisk||h?.event_risk||'').toUpperCase(),reason=String(a?.reason||'');return state==='REVERSAL'||sell==='STRONG'||event==='HIGH'||/(?:HARD[- ]?EXIT|EVENT[- ]?RISK|NOTAUSSTIEG|STOP[- ]?LOSS|REVERSAL\s+stark|STRONG\s+SELL)/i.test(reason)}
function rotationSell(a={}){return /(?:CAPITAL-MOTION-ROTATION|OPPORTUNITY-COST-ROTATION)/i.test(String(a?.reason||''))}
function heldPnlPct(h={}){for(const v of [h?.pnlPct,h?.pnl_pct,h?.pnl])if(Number.isFinite(Number(v)))return Number(v);return 0}

export function rotationCostDecision({held={},action={},storage=null}={}){
 const replay=getReplayRotationAdjustment(storage),notional=Math.max(0,num(held?.invested,held?.amount)),gap=reasonGap(action?.reason),smallPenalty=notional>0&&notional<250?.55:notional>0&&notional<500?.35:.10,pnl=heldPnlPct(held),hard=hardExit(held,action);
 const estimatedRoundTripCostPct=notional>0?2/notional*100+.20:.45,costGapPenalty=Math.min(.35,estimatedRoundTripCostPct*.16),minGap=.80+smallPenalty+num(replay.gapBonus)+costGapPenalty;
 const exceptionalEdge=gap!=null&&gap>=Math.max(2.20,minGap+.45);
 // Kernregel: Ein Minus-Trade wird NICHT geschlossen, nur weil irgendwo anders
 // gerade ein hoeherer Score auftaucht. Damit verschwindet das Buy->2-Minuten->Loss-
 // Rotation-Churning. Ein echter Verlustexit muss aus dem Risiko/Verkaeufer-Signal
 // DER GEHALTENEN AKTIE selbst kommen (Hard Risk, Reversal, STRONG SELL etc.).
 const lossRotationBlocked=pnl<=0&&!hard;
 // Auch bei Gewinn soll Rotation wirtschaftlich Sinn ergeben: erst wenn der
 // Qualitaetsvorteil die Kosten/Hysterese rechtfertigt. Das ist keine Take-Profit-%.
 const economicEdge=gap==null||gap>=minGap||exceptionalEdge;
 const allow=hard||(!lossRotationBlocked&&economicEdge);
 return{allow,ageRule:false,gap,minGap:+minGap.toFixed(2),notional:+notional.toFixed(2),estimatedRoundTripCostPct:+estimatedRoundTripCostPct.toFixed(2),pnlPct:+pnl.toFixed(2),hardExit:hard,exceptionalEdge,lossRotationBlocked,replay,reason:hard?'harter Risikoexit der gehaltenen Aktie – sofort erlaubt':lossRotationBlocked?'LOSS-ROTATION BLOCK: Position ist im Minus; kein Verkauf nur zum Hinterherwechseln in einen anderen Kandidaten. Erst echte Thesis-/Verkaeufer-/Risiko-Invaliderung der gehaltenen Aktie darf einen Verlust realisieren.':allow?'Gewinn-/neutrale Rotation wirtschaftlich interessant; finale SELL-Freigabe nur durch aktuelle Verkaeuferstruktur':`Rotation wegen Kosten/zu kleinem Qualitaetsvorteil gebremst: Score-Abstand ${gap==null?'–':gap.toFixed(2)} < ${minGap.toFixed(2)}. Keine Minutenregel.`}
}

function postProcess(r,input,storage){
 const plan=parsePlan(r),prompt=findPlanMessage(input);if(!plan||!prompt)return r;
 const held=arr(parseBlock(prompt,' Gehalten=')||[]),hMap=new Map(held.map(h=>[key(h),h])),cash=promptCash(prompt),cancelled=[];let actions=[];
 for(const a of arr(plan.actions)){
  if(String(a?.action||'').toUpperCase()==='SELL'&&rotationSell(a)){
   const d=rotationCostDecision({held:hMap.get(key(a))||{},action:a,storage});
   if(!d.allow){cancelled.push({symbol:key(a),decision:d});actions.push({symbol:key(a),action:'HOLD',confidence:.72,allocation_pct:0,reason:d.reason});continue}
  }
  actions.push(a)
 }
 if(cancelled.length&&cash<=2)actions=actions.filter(a=>String(a?.action||'').toUpperCase()!=='BUY'||!/CAPITAL-IN-MOTION/i.test(String(a?.reason||'')));
 if(cancelled.length)plan.summary=`${String(plan.summary||'').slice(0,155)} · ROTATION V2: ${cancelled.length} Rotation(en) gestoppt; ${cancelled[0].decision.reason}`;
 plan.actions=actions;return{...r,response:JSON.stringify(plan)}
}

export class RotationCostAiGuard{constructor(base,storage){this.base=base;this.storage=storage}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,this.storage)}}
