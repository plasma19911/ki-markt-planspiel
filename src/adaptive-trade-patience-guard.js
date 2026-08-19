import {getTradeDecisionLearning} from './trade-decision-learning.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function metric(reason,label){const m=String(reason||'').match(new RegExp(`${label}\\s*(-?\\d+(?:[.,]\\d+)?)`,'i'));return m?Number(m[1].replace(',','.')):null}
function shares(reason){const m=String(reason||'').match(/Käufer\s*(\d+)%\s*\/\s*Verkäufer\s*(\d+)%/i);return m?{buyer:Number(m[1]),seller:Number(m[2])}:null}
function hard(a={}){return /(?:HARD|EVENT[- ]?RISK|NOTAUSSTIEG|STOP[- ]?LOSS|STRONG\s+SELL|PROACTIVE HARD-SELL)/i.test(String(a?.reason||''))}

function postProcess(r,storage){
 const plan=parsePlan(r);if(!plan)return r;
 const learn=getTradeDecisionLearning(storage),s=learn?.summary||{},entry=num(s.entryPatienceMultiplier,1),exit=num(s.exitPatienceMultiplier,1),out=[],notes=[];
 for(const a of arr(plan.actions)){
  const act=String(a?.action||'').toUpperCase(),reason=String(a?.reason||''),symbol=key(a);
  if(act==='BUY'&&entry>1.02&&/CANDLE-FLOW BUY/i.test(reason)){
   const q=metric(reason,'Dip-Qualität'),lows=metric(reason,'·') /* unused sentinel */;
   const hm=reason.match(/(\d+)\s+h(?:ö|oe)here Tiefs/i),higherLows=hm?Number(hm[1]):0,engulf=/bullisches Engulfing/i.test(reason),need=2.0+(entry-1)*5;
   if(q!=null&&q<need&&!engulf&&higherLows<3){out.push({symbol,action:'HOLD',confidence:.69,allocation_pct:0,reason:`ADAPTIVE ENTRY-WAIT: Rückblick zeigt zuletzt zu frühe Einstiege (Geduldsfaktor ${entry.toFixed(2)}). Aktuelle Dip-Qualität ${q.toFixed(1)} reicht noch nicht gegen die gelernte Anforderung ${need.toFixed(1)}; weitere Bodenbestätigung abwarten.`});notes.push(`${symbol} wartet wegen gelerntem BUY-Regret`);continue}
  }
  if(act==='SELL'&&!hard(a)&&exit>1.02&&/CANDLE-FLOW(?: PROACTIVE)? SELL/i.test(reason)){
   const q=metric(reason,'Exit-Qualität'),sh=shares(reason),need=3.0+(exit-1)*5,lead=sh?sh.seller-sh.buyer:99,needLead=6+(exit-1)*35;
   if((q!=null&&q<need)||(sh&&lead<needLead)){out.push({symbol,action:'HOLD',confidence:.70,allocation_pct:0,reason:`ADAPTIVE EXIT-HOLD: Rückblick zeigt zuletzt zu frühe Verkäufe (Geduldsfaktor ${exit.toFixed(2)}). Verkäuferstruktur ist noch nicht stark genug${q!=null?` · Exit-Qualität ${q.toFixed(1)}/${need.toFixed(1)}`:''}${sh?` · Verkäufer-Vorsprung ${lead.toFixed(0)}%/${needLead.toFixed(0)}%`:''}. Gewinner/Position weiter beobachten statt zu früh schließen.`});notes.push(`${symbol} wegen gelerntem SELL-Regret gehalten`);continue}
  }
  out.push(a);
 }
 plan.actions=out;
 if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,135)} · ADAPTIVE LEARNING: ${notes.slice(0,2).join(' · ')}.`;
 return{...r,response:JSON.stringify(plan)};
}

export class AdaptiveTradePatienceAiGuard{
 constructor(base,{storage=null}={}){this.base=base;this.storage=storage}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,this.storage)}
}
