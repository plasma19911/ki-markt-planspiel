const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=null)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');
const v273=s=>String(s??'').replace(/FINAL-CONTROLLER V27\.(?:1|2)/g,'FINAL-CONTROLLER V27.3');

function parsePlan(r){
 const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');
 if(a<0||b<=a)return null;
 try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}
}
function explicitExitHold(reason=''){
 return/(?:ADAPTIVE\s+EXIT[- ]?HOLD|EXIT[- ]?HOLD|VERKÄUFERSTRUKTUR[^.]{0,100}(?:NICHT|NOCH NICHT)[^.]{0,100}(?:STARK|AUSREICHEND)|SELLER STRUCTURE[^.]{0,100}(?:NOT|INSUFFICIENT)|WEITER BEOBACHTEN(?: STATT ZU FRÜH SCHLIEßEN)?|HOLD STATT SELL)/i.test(String(reason));
}
function hardExternal(c={},reason=''){
 const event=String(c?.eventRisk??c?.event_risk??'NONE').toUpperCase();
 const eventText=String(c?.eventText??c?.event_text??'').trim();
 const news=num(c?.news??c?.newsScore??c?.news_score,0);
 return (event==='HIGH'&&Boolean(eventText))||news<=-.65||/(?:HARD[- ]?EVENT[- ]?EXIT|NOTAUSSTIEG|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|FRAUD|INSOLVEN|BANKRUPT|DELIST)/i.test(String(reason));
}
function sellerShare(c={}){
 const s=num(c?.sellerShare??c?.seller_share??c?.sellerPct??c?.seller_pct,null);
 if(s!==null)return s;
 const b=num(c?.buyerShare??c?.buyer_share??c?.buyerPct??c?.buyer_pct,null);
 return b===null?null:100-b;
}
function metrics(c={}){
 return{
  m5:num(c?.intraday5m??c?.momentum5,0),
  m20:num(c?.intraday20m??c?.momentum20,0),
  accel:num(c?.momentumAcceleration5??c?.momentum_acceleration5,0),
  draw:num(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct,null),
  sellers:sellerShare(c)
 };
}
function pnlPct(position={},candidate={}){
 for(const v of [position?.pnlPct,position?.pnl_pct,position?.pnl]){const n=num(v,null);if(n!==null)return n;}
 const entry=num(position?.entry_price??position?.entryPrice,null),last=num(candidate?.price??candidate?.last_price??position?.last_price??position?.lastPrice,null);
 if(!(entry>0&&last>0))return null;
 const efx=num(position?.entry_fx,1)||1,lfx=num(position?.last_fx,efx)||efx;
 return ((last*lfx)/(entry*efx)-1)*100;
}
function strongIndependentBreak(m){
 const sellerControl=m.sellers!==null&&m.sellers>=62;
 const trendBreak=m.m20<=-.22&&m.accel<=-.035;
 const fastBreak=m.m5<=-.30&&m.m20<=-.15&&m.accel<=-.03;
 const severeBreak=m.m20<=-.45&&m.accel<=-.08&&(m.draw===null||m.draw<=-1.0);
 return (sellerControl&&(trendBreak||fastBreak))||severeBreak;
}
export function enforceLossSellInvariant(plan,state={}){
 if(!plan||!Array.isArray(plan.actions))return{plan,blocked:0};
 const positions=new Map(arr(state?.positions).map(p=>[key(p),p]));
 const candidates=new Map(arr(state?.candidates).map(c=>[key(c),c]));
 let blocked=0;
 const actions=plan.actions.map(a=>{
  const normalized={...a,reason:v273(a?.reason)};
  if(String(a?.action||'').toUpperCase()!=='SELL')return normalized;
  const s=key(a),p=positions.get(s);if(!p)return normalized;
  const c={...p,...(candidates.get(s)||{})},pl=pnlPct(p,c);if(pl===null||pl>0)return normalized;
  const reason=String(a?.reason||''),m=metrics(c),external=hardExternal(c,reason),contradiction=explicitExitHold(reason),independent=strongIndependentBreak(m);
  const buyerSideStronger=m.sellers!==null&&m.sellers<50;
  const shallowLoss=pl>-1.25;
  const mustHold=!external&&(contradiction||buyerSideStronger||(shallowLoss&&!independent));
  if(!mustHold)return normalized;
  blocked++;
  const sellerText=m.sellers===null?'Verkäuferanteil nicht bestätigt':`Verkäufer ${m.sellers.toFixed(0)}%`;
  return{symbol:s,action:'HOLD',confidence:Math.max(.70,num(a?.confidence,.70)),allocation_pct:0,reason:`LOSS-SELL-INVARIANT V27.3: Verlustverkauf blockiert · P/L ${pl.toFixed(2)}% · ${sellerText} · ${contradiction?'tiefere Prüfung fordert ausdrücklich HOLD':'keine ausreichend unabhängige bestätigte Verkäufer-/Strukturinvaliderung'} · kein externer Hard-Risk. Position weiter beobachten statt normalen Rücksetzer im Minus zu realisieren.`};
 });
 const suffix=blocked?` · LOSS-SELL-INVARIANT: ${blocked} unnötige(n) Verlust-SELL(s) blockiert.`:'';
 return{plan:{...plan,actions,summary:v273(plan.summary)+suffix},blocked};
}
export class LossSellInvariant{
 constructor(base,{getState=null}={}){this.base=base;this.getState=getState;}
 async run(model,input){
  const r=await this.base.run(model,input),plan=parsePlan(r);if(!plan)return r;
  const state=typeof this.getState==='function'?(this.getState()||{}):{};
  const out=enforceLossSellInvariant(plan,state).plan;
  return{...r,response:JSON.stringify(out)};
 }
}
