const STATE_KEY='state/fresh-position-churn-v1';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');
const read=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const write=(storage,k,v)=>{try{storage?.kv?.put(k,v)}catch{}};

function parsePlan(r){
 const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');
 if(a<0||b<=a)return null;
 try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}
}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function ageMinutes(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at||p?.openedAt||''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):999}
function pnlPct(p={}){for(const v of [p?.pnlPct,p?.pnl_pct,p?.pnl])if(Number.isFinite(Number(v)))return Number(v);const invested=num(p?.invested),entry=num(p?.entry_price),last=num(p?.last_price),efx=num(p?.entry_fx,1),lfx=num(p?.last_fx,1);return invested>0&&entry>0&&last>0?(last/entry*lfx/efx-1)*100:0}
function reasonGap(reason=''){const m=String(reason).match(/Differenz\s+(-?[0-9]+(?:[.,][0-9]+)?)/i);return m?num(String(m[1]).replace(',','.')):null}
function rotationSell(a={}){return /(?:CAPITAL-MOTION-ROTATION|OPPORTUNITY-COST-ROTATION)/i.test(String(a?.reason||''))}
function momentumSell(a={}){return /Momentum-Risk-Exit/i.test(String(a?.reason||''))}
function explicitHardReason(a={}){return /(?:HARD[- ]?EXIT|EVENT[- ]?RISK|NOTAUSSTIEG|STOP[- ]?LOSS|REVERSAL\s+stark|STRONG\s+SELL)/i.test(String(a?.reason||''))}
function themeFamily(v){const t=String(v||'').toUpperCase();if(!t)return'';if(t.includes('DEFENSE')||t.includes('RUSSIA')||t.includes('MILIT'))return'DEFENSE';if(t.includes('SEMI')||t.includes('CHIP'))return'SEMICONDUCTOR';if(t.includes('AI_POWER')||t.includes('GRID')||t.includes('DATA_CENTER'))return'AI_POWER_GRID';if(t.includes('CYBER'))return'CYBER_SECURITY';if(t.includes('NUCLEAR')||t.includes('URANIUM'))return'NUCLEAR';if(t.includes('ENERGY')||t.includes('OIL')||t.includes('GAS'))return'ENERGY';if(t.includes('GOLD')||t.includes('MINER'))return'MATERIALS';if(t.includes('RATE')||t.includes('MACRO'))return'MACRO_SENSITIVE';return t}
function currentMetrics(c={}){return{event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),draw:num(c?.drawdownFrom20mHighPct,c?.drawdown_from_20m_high_pct),score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence)}}
function hardExit(c={},a={}){const x=currentMetrics(c);return x.event==='HIGH'||x.state==='REVERSAL'||x.sell==='STRONG'||explicitHardReason(a)}
function severeFailure(c={},p={}){const x=currentMetrics(c),pl=pnlPct(p);return pl<=-1.50||(x.m5<=-.55&&x.m20<=-.60)||(x.draw<=-1.35&&x.m5<=-.35)}

function confirmSoftSell(storage,symbol,now=Date.now()){
 const state=read(storage,STATE_KEY,{rows:{}})||{rows:{}},rows=state.rows||{},s=key(symbol),old=rows[s],fresh=old&&now-num(old.lastAt)<10*60*1000;
 const row=fresh?{firstAt:num(old.firstAt,now),lastAt:now,count:num(old.count)+1}:{firstAt:now,lastAt:now,count:1};
 rows[s]=row;
 for(const [k,v] of Object.entries(rows))if(now-num(v?.lastAt)>45*60*1000)delete rows[k];
 write(storage,STATE_KEY,{updatedAt:new Date(now).toISOString(),rows});
 return{count:row.count,spanMinutes:Math.max(0,(row.lastAt-row.firstAt)/60000)};
}
function clearConfirmation(storage,symbol){const state=read(storage,STATE_KEY,null);if(!state?.rows)return;delete state.rows[key(symbol)];write(storage,STATE_KEY,state)}

export function freshPositionSellDecision({position={},candidate={},action={},storage=null,now=Date.now()}={}){
 const age=ageMinutes(position,now),hard=hardExit(candidate,action),severe=severeFailure(candidate,position),rotation=rotationSell(action),momentum=momentumSell(action),gap=reasonGap(action?.reason),pl=pnlPct(position);
 if(hard){clearConfirmation(storage,position?.symbol||action?.symbol);return{allow:true,hard:true,age:+age.toFixed(1),reason:'harter Reversal/Event-Exit – Anti-Churn wird bewusst umgangen'}}
 if(severe&&age>=6){clearConfirmation(storage,position?.symbol||action?.symbol);return{allow:true,severe:true,age:+age.toFixed(1),reason:'deutlich bestaetigtes Scheitern – frueher Schutzexit erlaubt'}}
 // Absolute Soft-Sell-Sperre fuer frisch gekaufte Positionen. Das ist keine feste Haltedauer:
 // harte Reversals, Event HIGH und deutlich bestaetigtes Scheitern duerfen weiterhin sofort/frueh raus.
 if(age<15)return{allow:false,age:+age.toFixed(1),hard:false,severe:false,reason:`ANTI-CHURN: erst ${age.toFixed(1)} Min. gehalten; weicher Verkauf vor 15 Min. blockiert`};
 if(rotation){
  const exceptional=gap!=null&&gap>=2.80,loserUpgrade=pl<=-1.0&&gap!=null&&gap>=2.00;
  if(age<30&&!(age>=15&&(exceptional||loserUpgrade)))return{allow:false,age:+age.toFixed(1),gap,hard:false,reason:`ANTI-CHURN-ROTATION: normale Rotation erst ab 30 Min.; frueher nur bei sehr klarem Netto-Vorteil (Gap >=2.80) oder klar schlechtem Altwert`};
  clearConfirmation(storage,position?.symbol||action?.symbol);return{allow:true,age:+age.toFixed(1),gap,exceptional,loserUpgrade,reason:age<30?'aussergewoehnlich klare fruehe Rotation':'Rotation nach 30-Min.-Hysterese erlaubt'};
 }
 if(momentum){
  const q=confirmSoftSell(storage,position?.symbol||action?.symbol,now);
  if(age<25)return{allow:false,age:+age.toFixed(1),confirmations:q.count,spanMinutes:+q.spanMinutes.toFixed(1),reason:`ANTI-CHURN-MOMENTUM: kleiner Ruecksetzer in den ersten 25 Min. reicht nicht fuer Verkauf`};
  if(q.count<2||q.spanMinutes<3)return{allow:false,age:+age.toFixed(1),confirmations:q.count,spanMinutes:+q.spanMinutes.toFixed(1),reason:`ANTI-CHURN-MOMENTUM: weicher Exit braucht mindestens 2 bestaetigte Signale ueber >=3 Min.`};
  clearConfirmation(storage,position?.symbol||action?.symbol);return{allow:true,age:+age.toFixed(1),confirmations:q.count,reason:'weicher Momentum-Exit mehrfach bestaetigt'};
 }
 // Sonstige nicht-harte KI-Verkaeufe duerfen nach der frischen 15-Min.-Zone passieren.
 clearConfirmation(storage,position?.symbol||action?.symbol);return{allow:true,age:+age.toFixed(1),reason:'kein schneller Rotation-/Momentum-Churn'};
}

function concentration(candidate={},positions=[]){
 const theme=themeFamily(candidate?.theme||candidate?.sector);if(!theme)return{factor:1,theme:null,share:0};
 const rows=arr(positions).map(p=>({theme:themeFamily(p?.theme||p?.sector),value:Math.max(0,num(p?.invested,p?.value))})),total=rows.reduce((a,x)=>a+x.value,0);if(!(total>0))return{factor:1,theme,share:0};
 const same=rows.filter(x=>x.theme===theme).reduce((a,x)=>a+x.value,0),share=same/total;if(share<.55)return{factor:1,theme,share};
 const x=currentMetrics(candidate),exceptional=x.score>=6.2&&x.confidence>=.76;return{factor:exceptional?.90:.75,theme,share,exceptional};
}

function postProcess(r,input,{getState,storage}={}){
 const plan=parsePlan(r);if(!plan)return r;
 const state=typeof getState==='function'?(getState()||{}):{},positions=arr(state?.positions),positionMap=new Map(positions.map(p=>[key(p),p])),stateCandidates=arr(state?.candidates),stateCMap=new Map(stateCandidates.map(c=>[key(c),c]));
 const prompt=findPrompt(input),promptCandidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),promptCMap=new Map(promptCandidates.map(c=>[key(c),c]));
 const candidateFor=s=>({...stateCMap.get(key(s)),...promptCMap.get(key(s))});
 const blocked=[],actions=[];
 for(const a of arr(plan.actions)){
  const act=String(a?.action||'').toUpperCase();
  if(act==='SELL'){
   const p=positionMap.get(key(a));
   if(p){const d=freshPositionSellDecision({position:p,candidate:candidateFor(a),action:a,storage});if(!d.allow){blocked.push({symbol:key(a),decision:d});actions.push({symbol:key(a),action:'HOLD',confidence:clamp(num(a?.confidence,.62),.55,.82),allocation_pct:0,reason:d.reason});continue}}
  }
  actions.push(a);
 }
 const cash=num(state?.config?.cash,state?.cash);
 let finalActions=actions;
 if(cash<=1.05){
  finalActions=finalActions.filter(a=>String(a?.action||'').toUpperCase()!=='BUY');
 }
 finalActions=finalActions.map(a=>{
  if(String(a?.action||'').toUpperCase()!=='BUY')return a;
  const c=candidateFor(a),cc=concentration(c,positions);if(cc.factor>=.999)return a;
  const old=Math.max(0,num(a?.allocation_pct)),next=Math.max(8,old*cc.factor);
  return{...a,allocation_pct:+next.toFixed(2),reason:`${String(a?.reason||'').slice(0,320)} · STATE-DIVERSIFIKATION: ${cc.theme} bereits ${Math.round(cc.share*100)}% des investierten Depots; neue Position nur ${Math.round((1-cc.factor)*100)}% kleiner statt hart blockiert.`};
 });
 plan.actions=finalActions;
 const notes=[];if(blocked.length)notes.push(`${blocked.length} schneller Soft-Exit gestoppt`);if(cash<=1.05)notes.push('BUY bei praktisch leerem Cash unterdrueckt');if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,180)} · FRESH-POSITION-GUARD: ${notes.join(' · ')}. Harte Reversals/Event-Risiken bleiben sofort ausfuehrbar.`;
 return{...r,response:JSON.stringify(plan)};
}

export class FreshPositionChurnAiGuard{
 constructor(base,{getState=null,storage=null}={}){this.base=base;this.getState=getState;this.storage=storage}
 async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,{getState:this.getState,storage:this.storage})}
}
