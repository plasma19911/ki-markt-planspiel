import {getEntryTimingAdjustment} from './live-signal-learning.js';

// Separate Rebound-/Decliner-Entscheidungsschicht.
// Beobachtet Tagesverlierer, verhindert fallende Messer und darf nur bei klarer
// kurzfristiger Umkehr einen kleinen, weiter lernenden Paper-Einstieg zulassen.

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=x=>String(x?.symbol||x||'').toUpperCase();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const responseText=r=>String(r?.response||r?.result?.response||'');

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(let i=0;i<arr(input?.messages).length;i++){const t=String(input.messages[i]?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return{i,text:t}}return null}
function reboundMap(state){return new Map(arr(state?.reboundWatch?.candidates).map(x=>[key(x),x]))}

function metrics(c){
  const day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5),m20=num(c?.intraday20m,c?.momentum20),rsi=num(c?.intradayRsi,c?.rsi||50),vol=num(c?.volumeRatio,c?.volume_ratio||1);
  const state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),news=num(c?.news,c?.news_score);
  const live=num(c?.liveScore,c?.score),confidence=num(c?.liveConfidence,c?.confidence);
  return{day,m5,m20,rsi,vol,state,sell,event,news,live,confidence};
}
function evaluate(c){
  const m=metrics(c),inDecline=m.day<=-1.2&&m.day>=-12,hardBad=m.event==='HIGH'||m.sell==='STRONG'||m.state==='REVERSAL'||m.news<=-.55||m.day<-12;
  let q=0;const why=[];
  if(inDecline){q+=1.2;why.push(`Tag ${m.day.toFixed(1)}%`)}
  if(m.m5>.08){q+=1.8;why.push('5m dreht positiv')}else if(m.m5<-.08)q-=2;
  if(m.m20>-.05){q+=1.2;why.push('20m stabilisiert')}else if(m.m20<-.8)q-=1.8;
  if(['BUILDING','BREAKOUT'].includes(m.state)){q+=1.3;why.push(`Momentum ${m.state}`)}
  if(m.rsi>=34&&m.rsi<=68){q+=.7;why.push(`RSI ${m.rsi.toFixed(0)}`)}else if(m.rsi<24||m.rsi>76)q-=.8;
  if(m.vol>=1.05){q+=.6;why.push(`Volumen x${m.vol.toFixed(1)}`)}
  if(m.news>=-.15)q+=.45;
  if(m.live>=4.2)q+=.9;
  if(m.confidence>=.6)q+=.55;
  if(hardBad)q-=8;
  const confirmed=inDecline&&!hardBad&&q>=5.2&&m.m5>.08&&m.m20>-.35&&m.sell==='NONE';
  return{...m,quality:q,confirmed,hardBad,why};
}
function enrichInput(input,state){
  const hit=findPlanMessage(input);if(!hit)return input;
  const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return input;
  const rm=reboundMap(state),enriched=candidates.map(c=>{const r=rm.get(key(c));if(!r)return c;const e=evaluate(c);return{...c,reboundWatch:true,reboundRank:num(r.rank),reboundSource:r.source||null,reboundConfirmed:e.confirmed,reboundQuality:+e.quality.toFixed(2)}});
  const a=hit.text.indexOf('Kandidaten='),b=hit.text.indexOf(' Gehalten=',a),prefix=hit.text.slice(0,a),suffix=hit.text.slice(b);
  const policy='REBOUND-RADAR: Tagesverlierer sind ein eigener Beobachtungspool. Niemals allein wegen eines Kursverlusts kaufen. reboundWatch=true braucht bestaetigte Umkehr: kurzfristiges Momentum positiv, Abverkauf stabilisiert, kein STRONG-Sell/REVERSAL, kein HIGH-Event-Risiko und keine stark negativen News. Fallende Messer bleiben HOLD. Bestaetigte Rebounds anfangs kleiner gewichten; 15/30/60-Minuten-Lernen entscheidet separat fuer REBOUND_REVERSAL, welche Muster groesser werden duerfen oder geblockt werden. ';
  const messages=input.messages.slice();messages[hit.i]={...messages[hit.i],content:`${prefix}${policy}Kandidaten=${JSON.stringify(enriched)}${suffix}`};return{...input,messages}
}
function learnedRebound(storage,c,e){
  const candidate={...c,reboundWatch:true};const learn=getEntryTimingAdjustment(storage,candidate);
  return{...learn,quality:e.quality+num(learn.scoreDelta),allowed:e.confirmed&&!learn.block};
}
function postProcess(r,input,state,storage){
  const plan=parsePlan(r),hit=findPlanMessage(input);if(!plan||!hit)return r;
  const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return r;
  const held=parseBlock(hit.text,' Gehalten=')||[],heldSet=new Set(arr(held).map(key)),cMap=new Map(candidates.map(c=>[key(c),c])),rm=reboundMap(state);
  const out=[];let reboundBuy=false;
  for(const a of arr(plan.actions)){
    const sym=key(a),rw=rm.get(sym),c=cMap.get(sym);
    if(String(a?.action||'').toUpperCase()==='BUY'&&rw&&c){
      const e=evaluate(c),learn=learnedRebound(storage,c,e);
      if(!learn.allowed){out.push({symbol:sym,action:'HOLD',confidence:clamp(num(a.confidence,.55),.5,.8),allocation_pct:0,reason:`REBOUND-BLOCK: ${learn.block?learn.reason:'noch keine bestaetigte Umkehr'} · Qualität ${e.quality.toFixed(2)} · ${e.why.slice(0,4).join(' · ')}`});continue}
      const learnedCap=Math.max(10,35*num(learn.sizeMultiplier,1)),pct=Math.min(learnedCap,Math.max(10,num(a.allocation_pct,20)));
      reboundBuy=true;out.push({...a,allocation_pct:+pct.toFixed(2),confidence:clamp(num(a.confidence,.6)+num(learn.confidenceDelta),.55,.9),reason:`${String(a.reason||'').slice(0,165)} · REBOUND ${e.quality.toFixed(2)} · Lern-Score ${num(learn.scoreDelta).toFixed(2)} · Einstieg max. ${learnedCap.toFixed(0)}%`});continue
    }
    out.push(a);
  }
  if(!reboundBuy){
    const ranked=arr(candidates).filter(c=>rm.has(key(c))&&!heldSet.has(key(c))).map(c=>{const e=evaluate(c),learn=learnedRebound(storage,c,e);return{c,e,learn}}).filter(x=>x.learn.allowed).sort((a,b)=>b.learn.quality-a.learn.quality);
    const best=ranked[0];
    if(best&&best.learn.quality>=6.2&&!out.some(a=>String(a?.action||'').toUpperCase()==='BUY')){
      const base=best.learn.quality>=7.5?30:20,pct=Math.max(10,Math.min(35,base*num(best.learn.sizeMultiplier,1)));
      out.push({symbol:key(best.c),action:'BUY',confidence:clamp(.56+best.learn.quality*.035+num(best.learn.confidenceDelta),.6,.84),allocation_pct:+pct.toFixed(2),reason:`REBOUND-RADAR: bestaetigte Umkehr nach Tagesverlust · Qualität ${best.e.quality.toFixed(2)} · Lern-Score ${num(best.learn.scoreDelta).toFixed(2)} · ${best.e.why.slice(0,5).join(' · ')} · kleine lernende Startposition`});
    }
  }
  plan.actions=out;
  plan.summary=`${String(plan.summary||'').slice(0,195)} · REBOUND-RADAR: ${rm.size} Verlierer beobachtet; fallende Messer blockiert; REBOUND_REVERSAL lernt nach 15/30/60m.`;
  return{...r,response:JSON.stringify(plan)}
}

export class ReboundAiGuard{
  constructor(base,adapter,storage){this.base=base;this.adapter=adapter;this.storage=storage}
  async run(model,input){
    const joined=String(arr(input?.messages).map(x=>x?.content||'').join('\n')),isPlan=joined.includes('Kandidaten=')&&joined.includes('JSON-only');
    if(!isPlan)return this.base.run(model,input);
    const state=this.adapter?.peekState?.()||null,next=enrichInput(input,state),r=await this.base.run(model,next);
    return postProcess(r,next,state,this.storage);
  }
}
