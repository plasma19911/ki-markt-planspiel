const arr=v=>Array.isArray(v)?v:[];
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const responseText=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function pickNum(o,names){for(const n of names){const v=Number(o?.[n]);if(Number.isFinite(v))return v}return null}
function tape(c={}){return{
 day:pickNum(c,['day','day_change','dayChange','changePct']),
 m5:pickNum(c,['intraday5m','momentum5','m5','change5m']),
 m20:pickNum(c,['intraday20m','momentum20','m20','change20m']),
 accel:pickNum(c,['momentumAcceleration5','momentum_acceleration5','accel']),
 draw:pickNum(c,['drawdownFrom20mHighPct','drawdown_from_20m_high_pct','drawdown20m','draw']),
 score:pickNum(c,['liveScore','score','expectedScore','expected_value']),
 state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),
 sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),
 event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase()
}}
function flowFromReason(reason=''){
 const r=String(reason),m=r.match(/Käufer\s*(\d{1,3})%\s*\/\s*Verkäufer\s*(\d{1,3})%/i);
 return{buyer:m?Number(m[1])/100:null,seller:m?Number(m[2])/100:null,base:/Bodenbildung/i.test(r),top:/Topbildung/i.test(r),sellerWeakening:/Verkäuferdruck lässt nach/i.test(r),redVolume:/rotes Volumen führt/i.test(r),bearEngulf:/bärisches Engulfing/i.test(r)}
}
function missingMtf(reason=''){return/(?:MULTI-TIMEFRAME SOFT-DATA|Tageschart\s*\?,\s*keine Daten|Wochenchart\s*\?,\s*keine Daten|Tages-\/Wochenchart unvollständig|6mo\/1d HTTP 429|2y\/1wk HTTP 429)/i.test(String(reason))}
function hasFullMtf(reason=''){return/MULTI-TIMEFRAME V1\.3:/i.test(String(reason))}
function hardEvent(reason='',x={}){return x.event==='HIGH'||/(?:EVENT[- ]?RISK|NOTAUSSTIEG|STOP[- ]?LOSS|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING)/i.test(String(reason))}
function latestTrade(state,symbol){const rows=arr(state?.history||state?.recentHistory).filter(x=>key(x)===symbol&&['BUY','KAUF','SELL','VERKAUF'].includes(String(x?.action||'').toUpperCase()));if(!rows.length)return null;return rows.sort((a,b)=>Date.parse(b?.ts||0)-Date.parse(a?.ts||0))[0]||null}
function hold(symbol,confidence,reason){return{symbol,action:'HOLD',confidence:clamp(confidence,.58,.88),allocation_pct:0,reason}}

function buyDecision(a,c,state){
 const s=key(a),r=String(a?.reason||''),x=tape(c),f=flowFromReason(r),allocation=Math.max(1,Number(a?.allocation_pct)||1),isContinuation=/CONTINUATION|BREAKOUT/i.test(r),reasons=[];
 const d=x.draw,day=x.day,m5=x.m5,m20=x.m20,score=x.score;
 const quoteOutlier=day!==null&&Math.abs(day)>=35;
 const microDip=d!==null&&d>-.45&&(m20===null||m20>=0)&&(day===null||day>-1);
 const highChase=(day!==null&&day>=8&&(d===null||d>-2))||(day!==null&&day>=5&&m20!==null&&m20>.8&&(d===null||d>-1.25))||(day!==null&&day>=3&&m20!==null&&m20>1.2&&(d===null||d>-.8));
 const mtfMissing=missingMtf(r),mtfConfirmed=hasFullMtf(r);
 const weakScore=score!==null&&score<3.5;
 const last=latestTrade(state,s),reentry=last&&['SELL','VERKAUF'].includes(String(last.action||'').toUpperCase());
 const newStructure=d!==null&&d<=-1.25&&m5!==null&&m5>=0&&f.buyer!==null&&f.buyer>=.60&&score!==null&&score>=4.8&&mtfConfirmed;
 if(quoteOutlier)reasons.push(`Tagesbewegung ${day.toFixed(1)}% ist extrem und muss zuerst als echter Kurs-/News-Move bestätigt werden`);
 if(microDip)reasons.push(`nur ${Math.abs(d).toFixed(2)}% Rücksetzer vom 20m-Hoch – das ist Marktrauschen statt echter Dip`);
 if(highChase)reasons.push('Tages-/20m-Lauf bereits weit fortgeschritten; kleiner Rücksetzer wird nicht mehr als günstiger Dip gewertet');
 if(weakScore)reasons.push(`Qualitätsscore ${score.toFixed(2)} ist für einen automatischen Neueinstieg zu schwach`);
 if(mtfMissing&&((day!==null&&day>=3)||(m20!==null&&m20>1.5)||isContinuation))reasons.push('Tages-/Wochenkontext fehlt gerade; bei hochgelaufenen/Continuation-Setups reicht 1m-Flow nicht');
 if(isContinuation&&!mtfConfirmed)reasons.push('Continuation/Breakout darf die Mehr-Zeitebenen-Prüfung nicht mehr umgehen');
 if(reentry&&!newStructure)reasons.push('nach dem letzten Verkauf fehlt eine neue, klar bestätigte Dip-/Bodenstruktur für einen Wiedereinstieg');
 if(reasons.length)return hold(s,Number(a?.confidence)||.72,`TAGES-REVIEW BUY-WAIT: ${reasons.join(' · ')}. Cash bleibt für den besseren Einstieg frei.`);
 let cap=20;
 if(d!==null&&d>-.8)cap=Math.min(cap,5);
 else if(d!==null&&d>-1.5)cap=Math.min(cap,8);
 else if(d!==null&&d>-2.5)cap=Math.min(cap,12);
 else cap=Math.min(cap,16);
 if(day!==null&&day>=5)cap=Math.min(cap,4);
 if(mtfMissing)cap=Math.min(cap,3);
 if(score!==null&&score<4.5)cap=Math.min(cap,5);
 if(isContinuation)cap=Math.min(cap,4);
 const scaled=Math.min(allocation,cap);
 if(scaled<allocation)return{...a,allocation_pct:+scaled.toFixed(2),reason:`${r.slice(0,260)} · TAGES-REVIEW SIZING: Start auf max. ${scaled.toFixed(1)}% begrenzt; tiefere echte Dips erhalten mehr Kapital als Mikro-Rücksetzer/High-Chases.`};
 return a
}

function sellDecision(a,c){
 const s=key(a),r=String(a?.reason||''),x=tape(c),f=flowFromReason(r),eventHard=hardEvent(r,x),isMomentum=/Momentum-Risk-Exit|MOMENTUM-REVERSAL/i.test(r);
 if(eventHard)return a;
 if(f.buyer!==null&&f.seller!==null&&f.buyer>=f.seller)return hold(s,Number(a?.confidence)||.72,`TAGES-REVIEW HOLD: Käufer sind mit ${(f.buyer*100).toFixed(0)}% nicht schwächer als Verkäufer ${(f.seller*100).toFixed(0)}%. Kein normaler SELL gegen die gemessene Käufermehrheit.`);
 const ambiguous=(f.base&&f.top)||f.sellerWeakening;
 if(ambiguous&&!(f.seller!==null&&f.seller>=.68&&(f.bearEngulf||f.redVolume)))return hold(s,Number(a?.confidence)||.72,'TAGES-REVIEW HOLD: 1m-Struktur ist widersprüchlich (Boden/Top bzw. nachlassender Verkäuferdruck). Erst klare Verkäuferübernahme abwarten.');
 if(f.seller!==null&&f.seller<.58&&!f.bearEngulf)return hold(s,Number(a?.confidence)||.70,`TAGES-REVIEW HOLD: Verkäuferanteil ${(f.seller*100).toFixed(0)}% ist für einen normalen Exit noch zu knapp.`);
 const m5=x.m5,draw=x.draw,m20=x.m20;
 if(isMomentum&&((m5===null||m5>-.55)&&(draw===null||draw>-.90)))return hold(s,Number(a?.confidence)||.72,`TAGES-REVIEW NOISE-HOLD: 5m ${m5===null?'?':m5.toFixed(2)+'%'} und Rücklauf ${draw===null?'?':draw.toFixed(2)+'%'} sind noch normales Intraday-Rauschen. Kein SELL nur wegen eines kleinen Zuckers.`);
 const weakSignals=[m5!==null&&m5<=-.60,draw!==null&&draw<=-1.0,m20!==null&&m20<=-.50,x.state==='REVERSAL',x.sell==='STRONG',f.seller!==null&&f.seller>=.62,f.redVolume,f.bearEngulf].filter(Boolean).length;
 if(isMomentum&&weakSignals<2)return hold(s,Number(a?.confidence)||.70,'TAGES-REVIEW HOLD: Momentum-Exit hat noch keine zweite unabhängige Schwächebestätigung. Verkauf erst bei echter Strukturverschlechterung.');
 return a
}

function postProcess(r,input,state){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),cMap=new Map(candidates.map(c=>[key(c),c])),hMap=new Map(held.map(h=>[key(h),h])),out=[],notes=[];
 for(const a of arr(plan.actions)){
  const act=String(a?.action||'').toUpperCase(),s=key(a);let next=a;
  if(act==='BUY')next=buyDecision(a,{...(cMap.get(s)||{}),...(hMap.get(s)||{})},state);
  else if(act==='SELL')next=sellDecision(a,{...(cMap.get(s)||{}),...(hMap.get(s)||{})});
  if(next?.action==='HOLD'&&act!==next.action)notes.push(`${s} ${act} gestoppt`);
  out.push(next)
 }
 plan.actions=out;
 if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,135)} · TAGES-REVIEW V1: ${notes.slice(0,4).join(' · ')}.`;
 return{...r,response:JSON.stringify(plan)}
}

export class TradeDayLessonsAiGuard{
 constructor(base,{getState}={}){this.base=base;this.getState=typeof getState==='function'?getState:()=>({})}
 async run(model,input){const r=await this.base.run(model,input);let state={};try{state=this.getState()||{}}catch{}return postProcess(r,input,state)}
}
