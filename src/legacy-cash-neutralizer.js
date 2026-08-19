// Produktions-Failsafe gegen historische FULL-CASH-Schichten.
// Aeltere Portfolio-Versionen bleiben als Migrations-/Kompatibilitaetscode im Repo,
// duerfen in V11+ aber keinen unbestaetigten 100%-Zwangskauf erzeugen.
// Wenn ein frischer Lauf noch keine Position hat, darf ein solider Kandidat jedoch
// als kleine Starterposition ueberleben. So entsteht kein Alles-oder-nichts-Loch.

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const arr=v=>Array.isArray(v)?v:[];
const responseText=r=>String(r?.response||r?.result?.response||'');
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

function parsePlan(r){
  const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a<0||b<=a)return null;
  try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}
}

function parsePromptContext(input){
  for(const m of arr(input?.messages)){
    const text=String(m?.content||''),marker='Kandidaten=',heldMarker=' Gehalten=',a=text.indexOf(marker),b=text.indexOf(heldMarker,a+marker.length);
    if(a<0||b<0)continue;
    try{
      const candidates=JSON.parse(text.slice(a+marker.length,b).trim());
      const held=JSON.parse(text.slice(b+heldMarker.length).trim());
      return{candidates:arr(candidates),held:arr(held)};
    }catch{}
  }
  return null;
}

function starterQuality(c={}){
  const score=num(c?.liveScore,c?.score),confidence=num(c?.liveConfidence,c?.confidence),day=num(c?.day,c?.day_change),m5=num(c?.intraday5m,c?.momentum5,0),m20=num(c?.intraday20m,c?.momentum20,0),news=num(c?.newsScore,c?.news_score,0);
  const event=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase();
  const hardSafe=event!=='HIGH'&&state!=='REVERSAL'&&sell!=='STRONG';
  const quality=(score>=3.75&&confidence>=.61)||(score>=3.45&&confidence>=.66)||(score>=3.25&&confidence>=.63&&news>=.18);
  const notChasing=day<=4.2&&day>=-1.8;
  const tapeOk=m5>-0.18&&m20>-0.35;
  const allow=hardSafe&&quality&&notChasing&&tapeOk;
  let cap=16;if(score>=4.15)cap+=2;if(score>=4.75)cap+=2;if(confidence>=.69)cap+=1.5;if(news>=.20)cap+=1.5;if(day>0&&day<2.8)cap+=1;
  cap=Math.max(14,Math.min(22,cap));
  return{allow,cap:+cap.toFixed(1),score,confidence,day,m5,m20,news,hardSafe,quality,notChasing,tapeOk};
}

function neutralize(r,input=null){
  const j=parsePlan(r);if(!j)return r;
  const ctx=parsePromptContext(input),candidateMap=new Map(arr(ctx?.candidates).map(c=>[key(c),c])),freshEmpty=Boolean(ctx&&arr(ctx.held).length===0);
  let blocked=0,capped=0,starters=0;
  j.actions=arr(j.actions).map(a=>{
    if(String(a?.action||'').toUpperCase()!=='BUY')return a;
    const reason=String(a?.reason||'');
    if(/(?:OUTER-)?FULL-CASH-BEST(?:-AVAILABLE)?/i.test(reason)){
      const candidate=candidateMap.get(key(a)),q=candidate?starterQuality(candidate):null;
      if(freshEmpty&&q?.allow){
        starters++;
        return{...a,action:'BUY',allocation_pct:q.cap,confidence:Math.max(.60,Math.min(num(a.confidence,q.confidence),.72)),reason:`GUARDED-STARTER: solider Kandidat im frischen Depot statt 100%-Zwangskauf · ${q.cap.toFixed(1)}% Starter · Score ${q.score.toFixed(2)} · Sicherheit ${Math.round(q.confidence*100)}% · harte Safety bleibt nachgelagert aktiv`};
      }
      blocked++;
      return{...a,action:'HOLD',allocation_pct:0,confidence:Math.min(num(a.confidence,.5),.55),reason:`LEGACY-CASH-BLOCK: historischer Zwangskauf entfernt · ${reason.slice(0,230)}`};
    }
    if(/(?:OUTER-)?FULL-CASH/i.test(reason)&&num(a.allocation_pct)>35){
      capped++;
      return{...a,allocation_pct:35,reason:`${reason.slice(0,280)} · LEGACY-CASH-CAP: Altlogik auf 35% begrenzt; Profit-Optimizer entscheidet final`};
    }
    return a;
  });
  if(blocked||capped||starters){
    const parts=[];if(starters)parts.push(`${starters} Zwangskauf/-käufe in kleine Starterposition umgewandelt`);if(blocked)parts.push(`${blocked} Zwangskauf/-käufe blockiert`);if(capped)parts.push(`${capped} Alt-Allokation(en) gekappt`);
    j.summary=`${String(j.summary||'KI-Plan').slice(0,240)} · Legacy-Cash-Failsafe: ${parts.join(', ')}.`;
  }
  return{...r,response:JSON.stringify(j)};
}

export class LegacyCashNeutralizerAiGuard{
  constructor(base){this.base=base;this.__legacyCashNeutralizer=true}
  async run(model,input){return neutralize(await this.base.run(model,input),input)}
}

export function neutralizeLegacyCashResponse(r,input=null){return neutralize(r,input)}
