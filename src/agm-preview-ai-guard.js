import {evaluateAgmCalendar} from './agm-runtime.js';
import {AGM_PREVIEW_RULES} from './agm-opportunity-scoring.js';
import {applyPortfolioRiskCaps} from './portfolio-risk-calibration.js';
import {targetVenueIssue} from './target-venue-ai-guard.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const text=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){const raw=text(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function findPrompt(input){return arr(input?.messages).map(x=>String(x?.content||'')).find(x=>x.includes('Kandidaten=')&&x.includes(' Gehalten='))||''}
function parseCandidates(prompt){const a=prompt.indexOf('Kandidaten='),b=prompt.indexOf(' Gehalten=',a);if(a<0||b<0)return[];try{return JSON.parse(prompt.slice(a+11,b).trim())}catch{return[]}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function protectedHold(reason=''){return/(?:FX-SAFETY|QUOTE-UNIT|TARGET-VENUE|HARD EVENT|HARD-EVENT|EVENT-RISK|REVERSAL|STRONG SELL|PEAK|CHASE|OVERHEAT|STALE QUOTE|BAD QUOTE|FALLING KNIFE|REGULATORY|SEVERE_NEGATIVE|DILUTION)/i.test(String(reason||''))}
function candidateHardBlock(c={}){const ev=String(c?.eventRisk??c?.event_risk??'NONE').toUpperCase(),state=String(c?.momentumState??c?.momentum_state??'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal??c?.momentum_sell_signal??'NONE').toUpperCase(),news=num(c?.news??c?.newsScore??c?.news_score,0);return targetVenueIssue(c)||c?.targetVenueVerified===false||ev==='HIGH'||state==='REVERSAL'||state==='EXHAUSTION'||sell==='STRONG'||news<=-.55}
function candidateTechnicalSafe(c={}){
 const score=num(c?.liveScore,c?.score),confidence=num(c?.liveConfidence,c?.confidence),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),accel=num(c?.momentumAcceleration5,c?.momentum_acceleration5),day=num(c?.day,c?.dayChange??c?.day_change),rsi=num(c?.intradayRsi,c?.rsi??50),state=String(c?.momentumState??c?.momentum_state??'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal??c?.momentum_sell_signal??'NONE').toUpperCase();
 return score>=AGM_PREVIEW_RULES.minimumTechnicalScore&&confidence>=AGM_PREVIEW_RULES.minimumTechnicalConfidence&&m20>=-.25&&m5>=-.12&&accel>=-.01&&state!=='REVERSAL'&&state!=='EXHAUSTION'&&sell!=='STRONG'&&day<5.5&&rsi<78;
}
function sizeFor(score){return Math.min(AGM_PREVIEW_RULES.maximumAllocationPct,Math.max(8,8+(num(score)-AGM_PREVIEW_RULES.minimumScore)*.42))}
function callArgs(model,input){const legacy=input===undefined&&model&&typeof model==='object';return{payload:legacy?model:input,legacy}}

export class AgmPreviewAiGuard{
 constructor(inner,{env,getState}={}){this.inner=inner;this.env=env;this.getState=getState;this.latest=null;}
 async run(model,input){
  const {payload,legacy}=callArgs(model,input),r=legacy?await this.inner.run(model):await this.inner.run(model,input),plan=parsePlan(r),prompt=findPrompt(payload);if(!plan||!prompt)return r;
  const state=typeof this.getState==='function'?(this.getState()||{}):{},promptCandidates=parseCandidates(prompt),stateMap=new Map(arr(state?.candidates).map(x=>[key(x),x])),candidates=promptCandidates.map(x=>({...stateMap.get(key(x)),...x})),candidateMap=new Map(candidates.map(x=>[key(x),x]));
  const calendar=await evaluateAgmCalendar(this.env,state,null,Date.now());this.latest=calendar;
  const held=new Set(arr(state?.positions).map(key)),actions=arr(plan.actions).map(x=>({...x})),actionMap=new Map(actions.map(x=>[key(x),x]));
  let normalBuyPct=actions.filter(x=>String(x?.action||'').toUpperCase()==='BUY').reduce((a,x)=>a+Math.max(0,num(x?.allocation_pct)),0),residual=Math.max(0,100-normalBuyPct),added=0;
  const eligible=arr(calendar?.events).filter(x=>x?.tradeEligible).sort((a,b)=>num(b?.score)-num(a?.score)||num(b?.confidence)-num(a?.confidence));
  for(const ev of eligible){
   const symbol=key(ev),c=candidateMap.get(symbol),existing=actionMap.get(symbol);if(!c||held.has(symbol)||candidateHardBlock(c)||!candidateTechnicalSafe(c)||residual<2)continue;
   if(existing&&String(existing.action||'').toUpperCase()==='BUY')continue;
   if(existing&&String(existing.action||'').toUpperCase()==='HOLD'&&protectedHold(existing.reason))continue;
   const allocation=Math.min(residual,sizeFor(ev.score));if(allocation<2)continue;
   const evaluated=ev?.scoreEvaluatedAt||calendar?.updatedAt||calendar?.generatedAt||'Tageslauf';
   const reason=`FINAL-CONTROLLER V27.6 BUY AGM_PREVIEW: Hauptversammlung ${ev.daysUntil===1?'morgen':`in ${ev.daysUntil} Tagen`} · Tages-Score ${Math.round(num(ev.score))}/100 (${ev.label}) · einmal taeglich bewertet (${evaluated}) · positiver Gewinn-/Ausblick im Tages-Snapshot · aktuelle Technik dient nur als Sicherheitsfreigabe und veraendert den HV-Score nicht · max. ${AGM_PREVIEW_RULES.maximumAllocationPct}% Cash vor normalen Risiko-/Kosten-Gates.`;
   const a={symbol,action:'BUY',confidence:Math.min(.86,Math.max(.60,num(ev.confidence,.60))),allocation_pct:+allocation.toFixed(2),reason};
   if(existing){const i=actions.indexOf(existing);actions[i]=a}else actions.push(a);actionMap.set(symbol,a);residual-=allocation;added++;
  }
  const buys=actions.filter(x=>String(x?.action||'').toUpperCase()==='BUY').map(a=>({c:candidateMap.get(key(a))||{symbol:key(a)},allocation:num(a?.allocation_pct),action:a}));
  const capped=applyPortfolioRiskCaps(buys,state,state?.config?.cash),capMap=new Map(capped.map(x=>[key(x?.c),x]));
  const finalActions=actions.map(a=>{
   if(String(a?.action||'').toUpperCase()!=='BUY')return a;const cap=capMap.get(key(a));
   if(!cap)return{symbol:key(a),action:'HOLD',confidence:Math.max(.68,num(a?.confidence,.68)),allocation_pct:0,reason:`PORTFOLIO-RISK V27.6: BUY nach finaler Depotrisikopruefung verworfen. ${a.reason}`};
   const reduced=num(cap.allocation)<num(a?.allocation_pct)-.01;return{...a,allocation_pct:+num(cap.allocation).toFixed(2),reason:reduced?`${a.reason} · PORTFOLIO-RISK V27.6: auf ${num(cap.allocation).toFixed(2)}% Cash gekappt${arr(cap?.riskCap?.reasons).length?` (${cap.riskCap.reasons.join(', ')})`:''}.`:a.reason};
  });
  plan.actions=finalActions;plan.summary=`${String(plan.summary||'FINAL-CONTROLLER').replace(/V27\.5/g,'V27.6')} · AGM-PREVIEW: Tages-Score bleibt bis zum naechsten taeglichen Kalenderlauf fix · ${eligible.length} positiv bewertete HV-Kandidat(en), ${added} Vorab-BUY zur normalen Sicherheitspruefung weitergereicht.`;
  return encode(r,plan);
 }
}
