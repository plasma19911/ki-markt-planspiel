const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseCandidates(prompt){const a=prompt.indexOf('Kandidaten='),b=prompt.indexOf(' Gehalten=',a);if(a<0||b<0)return[];try{const x=JSON.parse(prompt.slice(a+'Kandidaten='.length,b).trim());return arr(x)}catch{return[]}}
function isRotation(a){return /(?:CAPITAL-MOTION-ROTATION|OPPORTUNITY-COST-ROTATION)/i.test(String(a?.reason||''))}

export function assessResearchEntryQuality(action={},candidate={}){
  const reason=String(action?.reason||''),early=/EARLY_BREAKOUT/i.test(reason);
  if(!early)return{earlyBreakout:false,allow:true,softAllow:false,allocationCap:100,reason:'not-early-breakout'};
  const m5=num(candidate?.intraday5m,candidate?.momentum5),m20=num(candidate?.intraday20m,candidate?.momentum20),accel=num(candidate?.momentumAcceleration5,candidate?.momentum_acceleration5),day=num(candidate?.day,candidate?.day_change),rsi=num(candidate?.intradayRsi,candidate?.rsi||50),score=num(candidate?.liveScore,candidate?.score),confidence=num(candidate?.liveConfidence,candidate?.confidence),news=num(candidate?.newsScore,candidate?.news_score),rawVol=candidate?.volumeRatio??candidate?.volume_ratio,volumeKnown=Number.isFinite(Number(rawVol)),vol=volumeKnown?Number(rawVol):1;
  // Normale Research-Bestaetigung bleibt klar. Eine einzelne weiche Schwelle soll aber
  // keinen aussergewoehnlich starken Kandidaten komplett vernichten: fuer solche Near-
  // Misses ist eine deutlich kleinere Starterposition erlaubt. Harte Spaet-/Ueberhitzungs-
  // und schwache Tape-Situationen bleiben gesperrt.
  const momentumOk=m5>=.10&&m20>=.12&&accel>=.02,notLate=day<=3.2&&rsi<72,volumeOk=!volumeKnown||vol>=1.05,allow=momentumOk&&notLate&&volumeOk;
  const strongOverall=(score>=5&&confidence>=.68)||(score>=4.55&&confidence>=.75)||(score>=4.35&&confidence>=.71&&news>=.30);
  const softTape=m5>=.06&&m20>=.08&&accel>=0,softNotLate=day<=3.6&&rsi<74,softVolume=!volumeKnown||vol>=.90;
  const softAllow=!allow&&strongOverall&&softTape&&softNotLate&&softVolume;
  const softCap=score>=5.8&&confidence>=.75?26:22,allocationCap=allow?35:softAllow?softCap:0;
  const blockers=[];if(!momentumOk)blockers.push(`Impuls unter voller Bestaetigung (5m ${m5.toFixed(2)}%, 20m ${m20.toFixed(2)}%, Beschl. ${accel.toFixed(2)})`);if(!notLate)blockers.push(`zu weit gelaufen (Tag ${day.toFixed(2)}%, RSI ${rsi.toFixed(0)})`);if(!volumeOk)blockers.push(`Volumen x${vol.toFixed(2)} unter voller Bestaetigung`);
  return{earlyBreakout:true,allow,softAllow,allocationCap,m5:+m5.toFixed(3),m20:+m20.toFixed(3),acceleration:+accel.toFixed(3),day:+day.toFixed(3),rsi:+rsi.toFixed(1),score:+score.toFixed(3),confidence:+confidence.toFixed(3),news:+news.toFixed(3),volumeKnown,volumeRatio:+vol.toFixed(2),blockers};
}

function postProcess(r,input){
  const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
  const cMap=new Map(parseCandidates(prompt).map(c=>[key(c),c])),out=[],blocked=[];
  for(const a of arr(plan.actions)){
    if(String(a?.action||'').toUpperCase()!=='BUY'){out.push(a);continue}
    const c=cMap.get(key(a))||{},q=assessResearchEntryQuality(a,c);
    if(!q.earlyBreakout){out.push(a);continue}
    if(!q.allow&&!q.softAllow){blocked.push({symbol:key(a),q});continue}
    const cap=q.allocationCap,kind=q.softAllow?'RESEARCH-SOFT-START':'RESEARCH-CONFIRM';
    out.push({...a,allocation_pct:Math.min(num(a?.allocation_pct),cap),confidence:q.softAllow?Math.min(num(a?.confidence,.65),.78):a.confidence,reason:`${String(a.reason||'').slice(0,300)} · ${kind}: 5m ${q.m5.toFixed(2)}%, 20m ${q.m20.toFixed(2)}%${q.volumeKnown?`, Vol x${q.volumeRatio.toFixed(2)}`:''} · ${q.softAllow?'starke Gesamtqualitaet kompensiert eine knapp verfehlte weiche Schwelle; kleine Starterposition':'volle Breakout-Bestaetigung'} max. ${cap}%`});
  }
  if(blocked.length){
    const hasBuy=out.some(a=>String(a?.action||'').toUpperCase()==='BUY');
    const filtered=hasBuy?out:out.filter(a=>String(a?.action||'').toUpperCase()!=='SELL'||!isRotation(a));
    for(const b of blocked)filtered.push({symbol:b.symbol,action:'HOLD',confidence:.62,allocation_pct:0,reason:`RESEARCH-ENTRY-WAIT: Early-Breakout noch nicht ausreichend bestaetigt · ${b.q.blockers.join(' · ')}`});
    plan.actions=filtered;plan.summary=`${String(plan.summary||'').slice(0,180)} · RESEARCH-ENTRY: ${blocked.length} wirklich schwacher/zu spaeter Early-Breakout nicht gekauft; starke Near-Misses duerfen dagegen mit kleiner Starterposition weiterlaufen.`;
  }else plan.actions=out;
  return{...r,response:JSON.stringify(plan)};
}

export class ResearchEntryQualityGuard{
  constructor(base){this.base=base}
  async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}
}
