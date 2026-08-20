import {targetVenueIssue} from './target-venue-ai-guard.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}

function metrics(c={}){
 return{
  score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),day:num(c?.day,c?.day_change),
  m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),
  rsi:num(c?.intradayRsi,c?.rsi||50),draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,
  vol:Number.isFinite(Number(c?.volumeRatio??c?.volume_ratio))?Number(c?.volumeRatio??c?.volume_ratio):null,news:num(c?.news,c?.newsScore??c?.news_score),
  event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase()
 };
}
function hardUnsafe(c,m){return m.event==='HIGH'||m.state==='REVERSAL'||m.sell==='STRONG'||targetVenueIssue(c)}
function obviousPeakChase(m){const near=m.draw!==null&&m.draw>-0.08;return near&&(m.day>4.5||m.rsi>=78)||m.day>8||m.rsi>=84}
function protectedHold(reason=''){
 return /(?:NEWS-IMPACT BLOCK|NEWS-SHOCK WAIT|CATALYST WATCH|EVENT[- ]?RISK|REVERSAL|STRONG SELL|PEAK[- ]?CHASE|HIGH[- ]?CHASE|OVERHEAT|VENUE|GETTEX|FX[- ]?SAFETY|MULTI[- ]?TIMEFRAME.*BLOCK|MTF.*BLOCK|FALLING KNIFE|VERKÄUFERDOMINANZ)/i.test(String(reason));
}
function learningCandidate(c){
 const m=metrics(c);if(hardUnsafe(c,m)||obviousPeakChase(m))return{allow:false,m,quality:0};
 const tapeOk=m.m5>=-0.08||m.accel>=0.01;
 const broad=m.score>=3.4&&m.confidence>=.50&&m.m20>=-.25&&m.rsi<84&&m.day>=-12&&m.day<=8&&tapeOk&&(m.vol===null||m.vol>=.45);
 const scoreQ=clamp((m.score-3.4)/2.8,0,1),confQ=clamp((m.confidence-.50)/.30,0,1),tapeQ=clamp((m.m5+.08)/.35,0,1)*.45+clamp((m.m20+.25)/.55,0,1)*.35+clamp((m.accel+.02)/.18,0,1)*.20,newsQ=clamp((m.news+.30)/.90,0,1);
 const quality=clamp(scoreQ*.40+confQ*.25+tapeQ*.25+newsQ*.10,0,1);
 return{allow:broad,m,quality};
}
function targetDeployment(rows){
 if(!rows.length)return 0;
 const top=rows[0].quality,avg=rows.reduce((a,x)=>a+x.quality,0)/rows.length,n=rows.length;
 if(n>=4&&top>=.62&&avg>=.48)return 100;
 if(n>=3&&top>=.52)return 90;
 if(n>=2&&top>=.45)return 72;
 if(n>=2)return 55;
 if(top>=.70)return 55;
 if(top>=.52)return 40;
 return 28;
}
function allocate(rows,targetPct){
 const n=rows.length;if(!n||targetPct<=0)return[];
 const singleCap=n===1?targetPct:n===2?Math.min(48,targetPct):n===3?Math.min(38,targetPct):Math.min(32,targetPct);
 const out=rows.map(x=>({...x,allocation:0,weight:.55+x.quality}));let remaining=targetPct,active=out.slice();
 for(let pass=0;pass<10&&remaining>.01&&active.length;pass++){
  const ws=active.reduce((a,x)=>a+x.weight,0)||active.length;let used=0;
  for(const x of active){const room=Math.max(0,singleCap-x.allocation),share=remaining*(x.weight/ws),add=Math.min(room,share);x.allocation+=add;used+=add}
  remaining-=used;active=active.filter(x=>singleCap-x.allocation>.01);if(used<.001)break;
 }
 return out.filter(x=>x.allocation>=1);
}
function uniqueBestCandidates(candidates,sellKeys,blockedKeys){
 const best=new Map();
 for(const c of candidates){
  const s=key(c);if(!s||sellKeys.has(s)||blockedKeys.has(s))continue;
  const q=learningCandidate(c);if(!q.allow)continue;
  const row={c,...q},old=best.get(s);
  if(!old||row.quality>old.quality||row.quality===old.quality&&row.m.score>old.m.score)best.set(s,row);
 }
 return[...best.values()].sort((a,b)=>b.quality-a.quality||b.m.score-a.m.score||b.m.confidence-a.m.confidence||b.m.accel-a.m.accel).slice(0,4);
}

function postProcess(r,input,getState){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const state=typeof getState==='function'?(getState()||{}):{},cash=Math.max(0,num(state?.config?.cash)),start=Math.max(cash,num(state?.config?.start_capital,cash));
 const minMeaningfulCash=Math.max(5,start*.001);
 let actions=arr(plan.actions).slice();
 if(cash<minMeaningfulCash){
  actions=actions.filter(a=>String(a?.action||'').toUpperCase()!=='BUY');
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,135)} · INTELLIGENT-CASH: Restcash ${cash.toFixed(2)} € unter sinnvoller Ordergröße ${minMeaningfulCash.toFixed(2)} €; keine Cent-/Miniorders.`;
  return{...r,response:JSON.stringify(plan)};
 }
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]);if(!candidates.length)return r;
 const sellKeys=new Set(actions.filter(a=>String(a?.action||'').toUpperCase()==='SELL').map(key));
 const blockedKeys=new Set(actions.filter(a=>String(a?.action||'').toUpperCase()==='HOLD'&&protectedHold(a?.reason)).map(key));
 const ranked=uniqueBestCandidates(candidates,sellKeys,blockedKeys);if(!ranked.length){
  plan.actions=actions.filter(a=>String(a?.action||'').toUpperCase()!=='BUY');
  plan.summary=`${String(plan.summary||'').slice(0,135)} · INTELLIGENT-CASH: kein sicher freigegebener Kandidat; News/Event/Peak/MTF-HOLD wird nicht überstimmt.`;
  return{...r,response:JSON.stringify(plan)};
 }
 const target=targetDeployment(ranked),allocation=allocate(ranked,target),selected=new Set(allocation.map(x=>key(x.c)));
 actions=actions.filter(a=>{
  const type=String(a?.action||'').toUpperCase();
  if(type==='BUY')return false;
  if(type==='SELL')return true;
  return !selected.has(key(a));
 });
 const emitted=new Set();
 for(const x of allocation){
  const s=key(x.c);if(!s||emitted.has(s))continue;emitted.add(s);
  const pct=+x.allocation.toFixed(2);if(pct<1)continue;
  actions.push({symbol:s,action:'BUY',confidence:clamp(Math.max(.58,x.m.confidence),.58,.88),allocation_pct:pct,reason:`INTELLIGENT-CASH V23: ${pct.toFixed(1)}% des freien Cashs · Zielauslastung ${target.toFixed(0)}% · Qualität ${x.quality.toFixed(2)} · Score ${x.m.score.toFixed(2)} · 5m ${x.m.m5.toFixed(2)} · 20m ${x.m.m20.toFixed(2)} · Beschleunigung ${x.m.accel.toFixed(2)}. News-/Event-/Peak-/MTF-Sperren bleiben bindend.`});
 }
 plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,115)} · INTELLIGENT-CASH V23: ${emitted.size} BUY(s), ${target.toFixed(0)}% des freien Cashs gezielt verplant; Safety-HOLDs bleiben bindend.`;
 return{...r,response:JSON.stringify(plan)};
}

export class ActiveLearningCashAiGuard{
 constructor(base,{getState=null}={}){this.base=base;this.getState=getState}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,this.getState)}
}
