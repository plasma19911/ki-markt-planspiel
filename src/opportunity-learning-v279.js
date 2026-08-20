const KEY='state/opportunity-learning-v279';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}
function defaults(){return{version:1,watches:{},patterns:{},recent:[],updatedAt:null}}
function metrics(c={}){return{
 score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),price:num(c?.price,c?.last_price),day:num(c?.day,c?.day_change),
 m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi:num(c?.intradayRsi,c?.rsi??50),
 draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,
 news:num(c?.news,c?.newsScore??c?.news_score),event:String(c?.eventRisk??c?.event_risk??'NONE').toUpperCase(),eventText:String(c?.eventText??c?.event_text??''),
 state:String(c?.momentumState??c?.momentum_state??'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal??c?.momentum_sell_signal??'NONE').toUpperCase()
}}
function hardBlocked(c,m){return c?.targetVenueVerified===false||Boolean(c?.targetVenueIssue)||m.event==='HIGH'||m.news<=-.55||m.state==='REVERSAL'||m.sell==='STRONG'}
function lateImpulse(m){return m.m5>=1.0||m.accel>=.80||(m.m5>=.65&&m.rsi>=72)||(m.day>=5&&m.m5>=.55)}
function peakRisk(m){if(m.day>=8||m.rsi>=82)return true;if(m.draw!==null&&m.draw>-.12&&(m.day>=4||m.rsi>=75))return true;return false}
function healthy(m){return m.score>=4.8&&m.confidence>=.58&&m.m5>=.01&&m.m20>=-.15&&m.accel>=.005&&m.rsi<76&&m.day<6&&!peakRisk(m)}
function catalystImmediate(m){return m.score>=5.8&&m.confidence>=.60&&m.news>=.25&&m.m5>=.02&&m.m5<=.65&&m.m20>=-.05&&m.accel>=.01&&m.accel<=.35&&m.rsi<72&&m.day<=4.5&&!peakRisk(m)}
function patternKey(m){const catalyst=m.news>=.25?'CAT':'NO-CAT',score=m.score>=6?'S6':m.score>=5.2?'S5':'S4',trend=m.m20>=.2?'UP':m.m20>=-.1?'FLAT':'DOWN';return`${catalyst}|${score}|${trend}`}
function portfolio(state={}){const cash=Math.max(0,num(state?.config?.cash)),market=arr(state?.positions).reduce((a,p)=>a+Math.max(0,num(p?.invested)),0),equity=Math.max(1,cash+market);return{cash,market,equity,cashRatio:cash/equity}}
function newsContext(state={}){
 const rows=arr(state?.newsRadar);if(!rows.length)return'[]';
 const ts=x=>Date.parse(String(x?.publishedAt??x?.published_at??x?.ts??x?.time??x?.date??''))||0;
 const picked=[...rows].sort((a,b)=>ts(b)-ts(a)).slice(0,10);
 const raw=JSON.stringify(picked);return raw.length>7000?`${raw.slice(0,7000)}…`:raw;
}
function prepareTradingInput(input,state={}){
 if(!isTradingPlanInput(input))return input;
 const radar=newsContext(state),note=`PAPER-TRADING TRAINING V27.9 · NUR AKTIEN, KEINE ETFs. Lies die vorhandenen Kurs-, News-, eventText- und newsScore-Daten aktiv zusammen. Neueste Same-Session-Nachrichten und frische Katalysatoren wiegen deutlich stärker als ältere Meldungen, die wahrscheinlich bereits eingepreist sind. Cash ist Trainingskapital: bei mehreren guten, nicht gehaltenen Aktien darfst du es einsetzen statt aus Gewohnheit HOLD zu wählen. Ein schneller Impuls wird NICHT vergessen: kein FOMO-Kauf in die Spitze, aber die Aktie bleibt auf der Recheck-/Pullback-Liste und soll bei Stabilisierung oder Reclaim zügig gekauft werden. Starker frischer Katalysator + Score >= 5.8 + Confidence >= 0.60 darf als wirtschaftlich sinnvoller Starter gehandelt werden, sofern keine harte News-/Event-/Venue-/Reversal-Sperre greift. Aktueller News-Radar (neueste zuerst)=${radar}`;
 return{...input,messages:[...arr(input.messages),{role:'user',content:note}]};
}
function relevantPatienceHold(reason=''){return/(?:ENTRY-PATIENCE V27\.8|ENTRY-CONFIRM V27\.8)/i.test(String(reason))}
function explicitLateHold(reason=''){return/(?:zu schnell gelaufen|FOMO-Kauf|Nicht hinterherkaufen)/i.test(String(reason))}
function safetyHold(reason=''){return/(?:HARD|EVENT|NEWS-IMPACT|NEWS-SHOCK|REVERSAL|STRONG SELL|VENUE|GETTEX|FX|QUOTE|FALLING KNIFE|OVERHEAT|PEAK-CHASE|HIGH-CHASE)/i.test(String(reason))&&!relevantPatienceHold(reason)}
function watchRecord(old,s,m,now,late){const price=m.price>0?m.price:num(old?.lastPrice);return{symbol:s,at:num(old?.at,now),lastSeenAt:now,firstPrice:num(old?.firstPrice,price),peakPrice:Math.max(num(old?.peakPrice,price),price),lastPrice:price,score:m.score,confidence:m.confidence,news:m.news,pattern:patternKey(m),wasLate:Boolean(old?.wasLate||late),credited:Boolean(old?.credited)}}
function minWaitMinutes(stat={}){const misses=num(stat?.misses),avoided=num(stat?.avoidedLosses),rate=misses/Math.max(1,misses+avoided);return misses>=2&&rate>=.60?.5:1}
function starterPct(pf,m,stat={}){
 let pct=m.news>=.25&&m.score>=5.8?13:m.score>=5.3?11:9;
 if(pf.cashRatio>=.60)pct+=2;if(num(stat?.misses)>=2)pct+=1;
 if(pf.cash>=500)pct=Math.max(pct,500/pf.cash*100);
 return clamp(pct,5,18);
}
function learnWatch(mem,w,c,now){
 const m=metrics(c);if(!(m.price>0&&w?.firstPrice>0))return;
 const age=(now-num(w.at,now))/60000,move=(m.price/w.firstPrice-1)*100,pk=w.pattern||patternKey(m);mem.patterns[pk]=mem.patterns[pk]||{misses:0,avoidedLosses:0,sumMissMove:0};const stat=mem.patterns[pk];
 if(!w.credited&&age>=5&&age<=20&&move>=.8){stat.misses=num(stat.misses)+1;stat.sumMissMove=num(stat.sumMissMove)+move;w.credited=true;mem.recent.push({at:now,symbol:w.symbol,type:'MISSED_OPPORTUNITY',movePct:+move.toFixed(3),ageMin:+age.toFixed(1),pattern:pk});}
 else if(!w.credited&&age>=5&&age<=20&&move<=-.8){stat.avoidedLosses=num(stat.avoidedLosses)+1;w.credited=true;mem.recent.push({at:now,symbol:w.symbol,type:'GOOD_WAIT',movePct:+move.toFixed(3),ageMin:+age.toFixed(1),pattern:pk});}
}

export function enforceOpportunityLearningV279(plan,state={},storage=null,now=Date.now()){
 if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
 const mem={...defaults(),...read(storage,defaults())};mem.watches={...(mem.watches||{})};mem.patterns={...(mem.patterns||{})};mem.recent=arr(mem.recent);
 const candidates=new Map(arr(state?.candidates).map(c=>[key(c),c])),positions=new Set(arr(state?.positions).map(key).filter(Boolean)),pf=portfolio(state);
 const counters={recheckQueued:0,reclaimEntries:0,catalystEntries:0,trainingEntries:0,missedOpportunityLearned:0,hardBlocksPreserved:0};
 const recentBefore=mem.recent.length;
 for(const [s,w] of Object.entries(mem.watches)){const c=candidates.get(s);if(c)learnWatch(mem,w,c,now);if(positions.has(s)||now-num(w?.lastSeenAt??w?.at,0)>45*60000)delete mem.watches[s];}
 const out=[];
 for(const raw of plan.actions){
  const s=key(raw),action=String(raw?.action||'').toUpperCase(),reason=String(raw?.reason||''),c=candidates.get(s),m=metrics(c||{});
  if(action!=='HOLD'||!s||!c||positions.has(s)||!relevantPatienceHold(reason)){out.push(raw);continue}
  if(safetyHold(reason)||hardBlocked(c,m)){counters.hardBlocksPreserved++;out.push(raw);continue}
  const late=explicitLateHold(reason)||lateImpulse(m),old=mem.watches[s],w=watchRecord(old,s,m,now,late);mem.watches[s]=w;const age=Math.max(0,(now-w.at)/60000),pullbackFromPeak=w.peakPrice>0&&m.price>0?(m.price/w.peakPrice-1)*100:0,stat=mem.patterns[w.pattern]||{},wait=minWaitMinutes(stat);
  if(late){counters.recheckQueued++;out.push({...raw,reason:`OPPORTUNITY-RECHECK V27.9: schneller Impuls wird gemerkt statt verworfen. Kein Kauf in die Spitze; ${s} bleibt aktiv beobachtet für Stabilisierung/Pullback-Reclaim. ${reason}`});continue}
  const reclaim=w.wasLate&&pullbackFromPeak<=-.18&&m.m5>=.02&&m.accel>=.005&&m.m20>=-.12&&healthy(m);
  const normalizedAfterLate=w.wasLate&&age>=wait&&m.m5>=.02&&m.m5<=.55&&m.accel>=.005&&m.accel<=.30&&m.m20>=-.08&&healthy(m);
  const catalyst=catalystImmediate(m);
  const trainingReady=pf.cashRatio>=.35&&age>=wait&&m.score>=5.0&&m.confidence>=.60&&m.m5>=.02&&m.m20>=-.05&&m.accel>=.01&&m.rsi<73&&!peakRisk(m);
  if(catalyst||reclaim||normalizedAfterLate||trainingReady){
   const pct=+starterPct(pf,m,stat).toFixed(2),kind=reclaim||normalizedAfterLate?'RECLAIM':catalyst?'CATALYST':'TRAINING';
   if(kind==='CATALYST')counters.catalystEntries++;else if(kind==='RECLAIM')counters.reclaimEntries++;else counters.trainingEntries++;
   delete mem.watches[s];out.push({symbol:s,action:'BUY',confidence:clamp(Math.max(.62,m.confidence),.60,.86),allocation_pct:pct,reason:`OPPORTUNITY-LEARNING V27.9 ${kind} BUY: starke zuvor freigegebene Aktie wird nicht durch erneutes Warten verloren · Score ${m.score.toFixed(2)} · Confidence ${m.confidence.toFixed(2)} · News ${m.news.toFixed(2)} · 5m ${m.m5.toFixed(2)} · 20m ${m.m20.toFixed(2)} · Beschleunigung ${m.accel.toFixed(2)} · Cashquote ${(pf.cashRatio*100).toFixed(0)}% · Starter ${pct.toFixed(1)}% des Cashs. Harte Risiko-/Venue-Sperren bleiben bindend.`});continue
  }
  counters.recheckQueued++;out.push({...raw,reason:`OPPORTUNITY-WATCH V27.9: Chance bleibt gespeichert (${age.toFixed(1)} Min.). Kein endloses Neustarten der Bestätigung; BUY sobald Struktur/Katalysator die Schwelle erfüllt. ${reason}`});
 }
 counters.missedOpportunityLearned=Math.max(0,mem.recent.length-recentBefore);if(mem.recent.length>120)mem.recent=mem.recent.slice(-120);mem.version=1;mem.updatedAt=new Date(now).toISOString();write(storage,mem);
 plan.actions=out;plan.summary=`${String(plan.summary||'').slice(0,210)} · OPPORTUNITY V27.9: ${counters.catalystEntries} Katalysator-BUY · ${counters.reclaimEntries} Reclaim-BUY · ${counters.trainingEntries} Trainings-BUY · ${counters.recheckQueued} Recheck(s) aktiv · ${counters.missedOpportunityLearned} neue verpasste Chance(n) gelernt.`;
 return{plan,counters,state:mem};
}

export class OpportunityLearningGuardV279{
 constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null;}
 async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},prepared=prepareTradingInput(payload,state),r=legacy?await this.inner.run(prepared):await this.inner.run(model,prepared),plan=parsePlan(r);if(!plan)return r;const result=enforceOpportunityLearningV279(plan,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=result;return encode(r,result.plan)}
 status(){const s=this.latest?.state||{...defaults(),...read(this.storage,defaults())};return{enabled:true,version:27.9,paperTradingOnly:true,stocksOnly:true,readsNewsRadarIntoTradingPrompt:true,freshNewsPriority:true,lateImpulseMemory:true,reclaimQueue:true,missedOpportunityLearning:true,idleCashTraining:true,economicStarterFloorEuro:500,latest:this.latest?.counters||null,patterns:s?.patterns||{},recent:arr(s?.recent).slice(-12).reverse(),rule:'V27.9 lässt starke Chancen nicht durch wiederholtes Zurücksetzen verschwinden. Frische News werden im Handels-Prompt mitgelesen; schnelle Impulse landen in einer Recheck-Warteschlange, werden bei Reclaim/Stabilisierung gekauft und verpasste Chancen reduzieren nach bestätigter Evidenz die Wartezeit. Nur Aktien.'}}
}
