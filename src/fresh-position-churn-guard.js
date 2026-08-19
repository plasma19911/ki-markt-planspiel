const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function ageMinutes(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at||p?.openedAt||''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):999}
function pnlPct(p={}){for(const v of [p?.pnlPct,p?.pnl_pct,p?.pnl])if(Number.isFinite(Number(v)))return Number(v);const invested=num(p?.invested),entry=num(p?.entry_price),last=num(p?.last_price),efx=num(p?.entry_fx,1),lfx=num(p?.last_fx,1);return invested>0&&entry>0&&last>0?(last/entry*lfx/efx-1)*100:0}
function explicitHardReason(a={}){return /(?:HARD[- ]?EXIT|EVENT[- ]?RISK|NOTAUSSTIEG|STOP[- ]?LOSS|REVERSAL\s+stark|STRONG\s+SELL)/i.test(String(a?.reason||''))}
function themeFamily(v){const t=String(v||'').toUpperCase();if(!t)return'';if(t.includes('DEFENSE')||t.includes('RUSSIA')||t.includes('MILIT'))return'DEFENSE';if(t.includes('SEMI')||t.includes('CHIP'))return'SEMICONDUCTOR';if(t.includes('AI_POWER')||t.includes('GRID')||t.includes('DATA_CENTER'))return'AI_POWER_GRID';if(t.includes('CYBER'))return'CYBER_SECURITY';if(t.includes('NUCLEAR')||t.includes('URANIUM'))return'NUCLEAR';if(t.includes('ENERGY')||t.includes('OIL')||t.includes('GAS'))return'ENERGY';if(t.includes('GOLD')||t.includes('MINER'))return'MATERIALS';if(t.includes('RATE')||t.includes('MACRO'))return'MACRO_SENSITIVE';return t}
function currentMetrics(c={}){return{event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence)}}
function hardExit(c={},a={}){const x=currentMetrics(c);return x.event==='HIGH'||x.state==='REVERSAL'||x.sell==='STRONG'||explicitHardReason(a)}
function normalizedCurrency(v){const c=String(v||'').trim();return c==='GBp'||c.toUpperCase()==='GBX'?'GBP':c.toUpperCase()}
function foreignFxMissing(candidate={},state={}){const cur=normalizedCurrency(candidate?.currency),base=normalizedCurrency(state?.config?.currency||'EUR'),fx=num(candidate?.fx_rate,candidate?.fxRate);if(!cur||!base||cur===base)return false;return !(fx>0)||Math.abs(fx-1)<.025}

// Keine feste Gewinn-%-Schwelle mehr. Normale SELLs werden an den nachgelagerten
// Candle-Flow delegiert. Nur harte Risiko-Signale werden hier eindeutig markiert.
export function freshPositionSellDecision({position={},candidate={},action={},now=Date.now()}={}){
 const age=ageMinutes(position,now),pl=pnlPct(position),hard=hardExit(candidate,action),x=currentMetrics(candidate);
 return{allow:true,hard,delegatedToCandleFlow:!hard,age:+age.toFixed(1),pl:+pl.toFixed(2),reason:hard?'harter Risikoexit – sofort ausfuehrbar':'keine feste Gewinn-/Verlustgrenze; finaler SELL wird durch aktuelle Käufer-/Verkäuferkerzen entschieden',tape:{m5:x.m5,m20:x.m20,accel:x.accel,state:x.state}};
}

function concentration(candidate={},positions=[]){
 const theme=themeFamily(candidate?.theme||candidate?.sector);if(!theme)return{factor:1,theme:null,share:0};
 const rows=arr(positions).map(p=>({theme:themeFamily(p?.theme||p?.sector),value:Math.max(0,num(p?.invested,p?.value))})),total=rows.reduce((a,x)=>a+x.value,0);if(!(total>0))return{factor:1,theme,share:0};
 const same=rows.filter(x=>x.theme===theme).reduce((a,x)=>a+x.value,0),share=same/total;if(share<.55)return{factor:1,theme,share};
 const x=currentMetrics(candidate),exceptional=x.score>=6.2&&x.confidence>=.76;return{factor:exceptional?.90:.75,theme,share,exceptional};
}

function postProcess(r,input,{getState}={}){
 const plan=parsePlan(r);if(!plan)return r;
 const state=typeof getState==='function'?(getState()||{}):{},positions=arr(state?.positions),stateCandidates=arr(state?.candidates),stateCMap=new Map(stateCandidates.map(c=>[key(c),c]));
 const prompt=findPrompt(input),promptCandidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),promptCMap=new Map(promptCandidates.map(c=>[key(c),c]));
 const candidateFor=s=>({...stateCMap.get(key(s)),...promptCMap.get(key(s))});
 const fxBlocked=[],actions=[];
 for(const a of arr(plan.actions)){
  const act=String(a?.action||'').toUpperCase();
  if(act==='BUY'){
   const c=candidateFor(a);
   if(foreignFxMissing(c,state)){fxBlocked.push(key(a));actions.push({symbol:key(a),action:'HOLD',confidence:.65,allocation_pct:0,reason:'FX-SAFETY: Fremdwaehrungs-Kauf wartet, bis ein echter Umrechnungskurs statt Platzhalter 1.0 vorliegt.'});continue}
  }
  actions.push(a);
 }
 const cash=num(state?.config?.cash,state?.cash);let finalActions=actions;
 if(cash<=1.05)finalActions=finalActions.filter(a=>String(a?.action||'').toUpperCase()!=='BUY');
 finalActions=finalActions.map(a=>{
  if(String(a?.action||'').toUpperCase()!=='BUY')return a;
  const c=candidateFor(a),cc=concentration(c,positions);if(cc.factor>=.999)return a;
  const old=Math.max(0,num(a?.allocation_pct)),next=Math.max(8,old*cc.factor);
  return{...a,allocation_pct:+next.toFixed(2),reason:`${String(a?.reason||'').slice(0,320)} · STATE-DIVERSIFIKATION: ${cc.theme} bereits ${Math.round(cc.share*100)}% des investierten Depots; neue Position kleiner statt hart blockiert.`};
 });
 plan.actions=finalActions;
 const notes=[];if(fxBlocked.length)notes.push(`${fxBlocked.length} Fremdwaehrungs-Kauf ohne echten FX blockiert`);if(cash<=1.05)notes.push('BUY bei praktisch leerem Cash unterdrueckt');if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,170)} · SAFETY-GUARD: ${notes.join(' · ')}. SELL-Timing wird dynamisch durch Candle-Flow entschieden.`;
 return{...r,response:JSON.stringify(plan)};
}

export class FreshPositionChurnAiGuard{
 constructor(base,{getState=null,storage=null}={}){this.base=base;this.getState=getState;this.storage=storage}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,{getState:this.getState})}
}
