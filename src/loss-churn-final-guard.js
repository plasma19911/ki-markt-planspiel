const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function hard(reason=''){return/(?:HARD[- ]?EXIT|EVENT[- ]?RISK|NOTAUSSTIEG|STOP[- ]?LOSS|REVERSAL\s+stark|STRONG\s+SELL|harter Risikoexit)/i.test(String(reason))}
function pnl(h={}){for(const v of [h?.pnlPct,h?.pnl_pct,h?.pnl])if(Number.isFinite(Number(v)))return Number(v);return 0}
function rotation(reason=''){return/(?:OPPORTUNITY-COST-ROTATION|CAPITAL-MOTION-ROTATION)/i.test(String(reason))}
function mixedFlow(reason=''){const r=String(reason);return /CANDLE-FLOW(?: PROACTIVE)? SELL/i.test(r)&&((/Bodenbildung/i.test(r)&&/Topbildung/i.test(r))||(/Verkäuferdruck lässt nach/i.test(r)&&!/bärisches Engulfing/i.test(r)))}

function postProcess(r,input){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const held=arr(parseBlock(prompt,' Gehalten=')||[]),hMap=new Map(held.map(h=>[key(h),h])),out=[],blocked=[];
 for(const a of arr(plan.actions)){
   if(String(a?.action||'').toUpperCase()!=='SELL'){out.push(a);continue}
   const s=key(a),reason=String(a?.reason||''),pl=pnl(hMap.get(s)||{}),isHard=hard(reason);
   if(!isHard&&pl<=0&&rotation(reason)){
     out.push({symbol:s,action:'HOLD',confidence:.76,allocation_pct:0,reason:`FINAL LOSS-CHURN BLOCK: ${s} liegt bei ${pl.toFixed(2)}%. Kein Verlustverkauf nur weil ein anderer Kandidat kurzfristig attraktiver aussieht. Verlustexit nur bei echter Invalidation/Risiko-/Reversal-Struktur der gehaltenen Aktie.`});blocked.push(`${s} Verlust-Rotation`);continue
   }
   if(!isHard&&pl<=0&&mixedFlow(reason)){
     out.push({symbol:s,action:'HOLD',confidence:.74,allocation_pct:0,reason:`FINAL MIXED-FLOW HOLD: ${s} liegt bei ${pl.toFixed(2)}% und die SELL-Kerzen sind widersprüchlich (Boden/Top bzw. nachlassender Verkäuferdruck). Ein einzelner 1m-Block reicht nicht zum Verlustverkauf.`});blocked.push(`${s} widersprüchlicher Verlust-SELL`);continue
   }
   out.push(a)
 }
 plan.actions=out;if(blocked.length)plan.summary=`${String(plan.summary||'').slice(0,145)} · FINAL LOSS-CHURN: ${blocked.slice(0,3).join(' · ')} gestoppt.`;
 return{...r,response:JSON.stringify(plan)}
}

export class LossChurnFinalAiGuard{constructor(base){this.base=base}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input)}}
