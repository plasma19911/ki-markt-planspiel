const KEY='state/research-signal-fusion-v281';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const text=r=>String(r?.response||r?.result?.response||'');
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};

function defaults(){return{version:1,snapshots:{},newsSeen:{},recent:[],stats:{researchBuys:0,hardBlocks:0,scoreWatches:0},updatedAt:null}}
function parsePlan(r){const raw=text(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}
function stockOnly(c={}){const t=String(c?.instrument_type??c?.instrumentType??c?.type??'EQUITY').toUpperCase();return !/(?:ETF|ETP|FUND|INDEX|CRYPTO)/.test(t)}
function metrics(c={}){return{
 score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),price:num(c?.price,c?.last_price),day:num(c?.day,c?.day_change??c?.dayChange),
 m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi:num(c?.intradayRsi,c?.rsi??50),
 draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,
 vol:Number.isFinite(Number(c?.volumeRatio??c?.volume_ratio))?Number(c?.volumeRatio??c?.volume_ratio):null,
 news:num(c?.news,c?.newsScore??c?.news_score),event:String(c?.eventRisk??c?.event_risk??'NONE').toUpperCase(),eventText:String(c?.eventText??c?.event_text??''),
 state:String(c?.momentumState??c?.momentum_state??'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal??c?.momentum_sell_signal??'NONE').toUpperCase(),
 high52:num(c?.fiftyTwoWeekHigh,c?.yearHigh??c?.week52High??c?.high52Week??c?.fifty_two_week_high),
 forward:c?.forwardForecast||c?.forward_forecast||null
}}
function hardSafetyReason(reason=''){return/(?:HARD[- ]?EVENT|NOTAUSSTIEG|STOP[- ]?LOSS|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|FRAUD|INSOLVEN|BANKRUPT|DELIST|TARGET-VENUE-BLOCK|VENUE|GETTEX|FX[- ]?SAFETY|QUOTE[- ]?SANITY|BAD QUOTE|STALE QUOTE|NEWS-IMPACT BLOCK|NEWS-SHOCK WAIT|ORDER[- ]?ECONOM|UNECONOMIC|NET[- ]?EDGE.*BLOCK)/i.test(String(reason))}
function hardBlocked(c,m,reason=''){
 if(!stockOnly(c)||!(m.price>0))return true;
 if(c?.targetVenueVerified===false||Boolean(c?.targetVenueIssue)||c?.quoteValid===false||c?.quote_valid===false)return true;
 if(m.event==='HIGH'&&m.eventText.trim())return true;
 if(m.news<=-.65)return true;
 if(m.sell==='STRONG'&&m.m20<=-.20)return true;
 if(m.state==='REVERSAL'&&m.m20<=-.28&&m.accel<=-.04)return true;
 return hardSafetyReason(reason);
}
function baseSymbol(s=''){return String(s).toUpperCase().split('.')[0]}
function newsRows(state={},symbol=''){
 const b=baseSymbol(symbol),rows=[];
 for(const n of arr(state?.newsRadar)){const ns=baseSymbol(n?.symbol||n?.ticker||'');if(ns&&ns===b)rows.push(n)}
 return rows;
}
function tsOf(n={}){return Date.parse(String(n?.publishedAt??n?.published_at??n?.ts??n?.time??n?.date??''))||0}
function headlineOf(n={}){return String(n?.headline??n?.title??n?.text??'').trim()}
function sig(s=''){return String(s).toLowerCase().replace(/[^a-z0-9äöüß]+/gi,' ').trim().slice(0,180)}
function quantitativeHeadline(h=''){return/(?:earnings|eps|revenue|sales|guidance|forecast|margin|profit|order|contract|buyback|dividend|approval|approved|raises|beats|surprise|gewinn|umsatz|prognose|marge|auftrag|vertrag|rückkauf|dividende|zulassung|genehmigung|übertrifft|anhebung)/i.test(h)&&/\d|(?:raises|beats|surprise|anhebung|übertrifft)/i.test(h)}
function softStory(h=''){return/(?:launch|partnership|strategy|ceo|comment|interview|vision|product|kooperation|strategie|vorstand|interview|produkt)/i.test(h)&&!quantitativeHeadline(h)}
function newsSignal(c,state,mem,now){
 const m=metrics(c),rows=newsRows(state,key(c)).sort((a,b)=>tsOf(b)-tsOf(a)),n=rows[0],headline=headlineOf(n),t=tsOf(n),age=t?Math.max(0,(now-t)/60000):null,signature=sig(headline),seen=signature&&mem.newsSeen[signature],fresh=age!==null?age<=180:Boolean(headline),novel=Boolean(signature&&!seen),quant=quantitativeHeadline(headline),soft=softStory(headline);
 let points=0;
 if(m.news>=.20)points+=4;if(m.news>=.40)points+=2;
 if(fresh)points+=3;if(fresh&&novel)points+=4;if(fresh&&novel&&quant)points+=5;if(soft)points-=2;
 if(signature)mem.newsSeen[signature]=now;
 return{points:clamp(points,-3,18),fresh,novel,quant,soft,headline:headline.slice(0,160),age};
}
function regimeSignal(state={}){const r=String(state?.marketBreadth?.regime??state?.marketRegime?.regime??'UNKNOWN').toUpperCase();if(r==='BROAD_UP')return{points:6,regime:r};if(r==='REVERSAL_UP')return{points:4,regime:r};if(r==='RANGE'||r==='MIXED'||r==='UNKNOWN')return{points:0,regime:r};if(r==='REVERSAL_DOWN')return{points:-5,regime:r};if(r==='RISK_OFF')return{points:-8,regime:r};return{points:0,regime:r}}
function fusion(c,state,prev,mem,now){
 const m=metrics(c),parts={};let score=0;
 parts.base=clamp((m.score-3.4)/2.8*20,0,20);score+=parts.base;
 parts.confidence=clamp((m.confidence-.50)/.28*12,0,12);score+=parts.confidence;
 const m20Pts=clamp((m.m20+.08)/.75*10,0,10),m5Pts=clamp((m.m5+.03)/.32*6,0,6),accelPts=clamp((m.accel+.005)/.16*6,0,6);parts.momentum=m20Pts+m5Pts+accelPts;score+=parts.momentum;
 const reclaim=m.draw!==null&&m.draw<=-.25&&m.draw>=-4.0&&m.m5>=.01&&m.accel>=.002&&m.m20>=-.18;parts.reclaim=reclaim?12:0;score+=parts.reclaim;
 let volume=0;if(m.vol!==null){if(m.vol>=1.15&&m.vol<=2.8)volume=8;else if(m.vol>=.80&&m.vol<1.15)volume=4;else if(m.vol<.45)volume=-4;else if(m.vol>4.0)volume=-3;}parts.volume=volume;score+=volume;
 const ns=newsSignal(c,state,mem,now);parts.news=ns.points;score+=ns.points;
 let high52=0;if(m.high52>0&&m.price>0){const near=m.price/m.high52;if(near>=.95&&near<=1.02)high52=8;else if(near>=.90)high52=5;else if(near>=.80)high52=2;}parts.high52=high52;score+=high52;
 let acceleration=0;if(prev){const age=(now-num(prev.at,now))/60000;if(age>=.4&&age<=8){const ds=m.score-num(prev.score),dc=m.confidence-num(prev.confidence),dm=m.m20-num(prev.m20),da=m.accel-num(prev.accel);if(ds>=.15)acceleration+=4;if(dc>=.02)acceleration+=2;if(dm>=.08)acceleration+=2;if(da>=.015)acceleration+=2;}}parts.multiScan=clamp(acceleration,0,10);score+=parts.multiScan;
 const reg=regimeSignal(state);parts.regime=reg.points;score+=reg.points;
 let forward=0;if(m.forward){const h15=num(m.forward?.horizons?.[15]?.expectedPct),h30=num(m.forward?.horizons?.[30]?.expectedPct),rel=num(m.forward?.reliability);if(m.forward.block)forward=-12;else if(rel>=.25&&h15>.08&&h30>.05)forward=5;else if(rel>=.25&&h15<-.08&&h30<-.05)forward=-6;}parts.forward=forward;score+=forward;
 let chasePenalty=0;if(m.day>=6||m.rsi>=80)chasePenalty=-18;else if((m.draw!==null&&m.draw>-.12&&m.day>=4)||(m.m5>=.85&&m.accel>=.25))chasePenalty=-10;parts.chase=chasePenalty;score+=chasePenalty;
 return{score:+clamp(score,0,100).toFixed(1),parts,news:ns,regime:reg.regime,reclaim,m};
}
function portfolio(state={}){const cash=Math.max(0,num(state?.config?.cash)),market=arr(state?.positions).reduce((a,p)=>a+Math.max(0,num(p?.invested)),0),equity=Math.max(1,cash+market);return{cash,market,equity,cashRatio:cash/equity}}
function allocationPct(pf,f){let pct=8+Math.max(0,f.score-64)*.28;if(f.news.quant&&f.news.fresh)pct+=1.5;if(f.reclaim)pct+=1;if(pf.cashRatio>=.55)pct+=1;if(pf.cash>=500)pct=Math.max(pct,500/pf.cash*100);return clamp(pct,6,14)}
function decisionMemory(mem,s,f,now){const p=mem.snapshots[s],age=p?Math.max(0,(now-num(p.at,now))/60000):Infinity,stable=p&&age<=8&&f.score>=Math.max(60,num(p.fusionScore)-6)&&f.m.m20>=num(p.m20)-.20&&f.m.accel>=num(p.accel)-.06;return{stable,age}}

export function enforceResearchSignalFusionV281(plan,state={},storage=null,now=Date.now()){
 if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
 const mem={...defaults(),...read(storage,defaults())};mem.snapshots={...(mem.snapshots||{})};mem.newsSeen={...(mem.newsSeen||{})};mem.recent=arr(mem.recent);mem.stats={...defaults().stats,...(mem.stats||{})};
 const candidates=new Map(arr(state?.candidates).map(c=>[key(c),c])),positions=new Set(arr(state?.positions).map(key).filter(Boolean)),prior={...mem.snapshots},pf=portfolio(state),ranked=[];
 for(const [s,c] of candidates){if(!s||positions.has(s))continue;const f=fusion(c,state,prior[s],mem,now);ranked.push({s,c,f});mem.snapshots[s]={at:now,fusionScore:f.score,score:f.m.score,confidence:f.m.confidence,m20:f.m.m20,accel:f.m.accel,price:f.m.price}}
 ranked.sort((a,b)=>b.f.score-a.f.score||b.f.m.score-a.f.m.score);const bySymbol=new Map(ranked.map(x=>[x.s,x]));
 const counters={researchBuys:0,hardBlocks:0,scoreWatches:0,existingBuys:0};const out=[];let newBuys=0;
 for(const raw of plan.actions){const s=key(raw),action=String(raw?.action||'').toUpperCase(),reason=String(raw?.reason||''),row=bySymbol.get(s);
  if(action==='BUY'){counters.existingBuys++;out.push(raw);continue}
  if(action!=='HOLD'||!row||positions.has(s)){out.push(raw);continue}
  const {c,f}=row;if(hardBlocked(c,f.m,reason)){counters.hardBlocks++;out.push(raw);continue}
  const dm=decisionMemory({snapshots:prior},s,f,now),supportive=Boolean(f.reclaim||f.news.quant&&f.news.fresh||f.parts.multiScan>=4||f.parts.volume>=8),instant=f.score>=72&&supportive,confirmed=f.score>=64&&dm.stable,canBuy=(instant||confirmed)&&newBuys<2;
  if(canBuy){const pct=+allocationPct(pf,f).toFixed(2);newBuys++;counters.researchBuys++;mem.stats.researchBuys=num(mem.stats.researchBuys)+1;mem.recent.push({at:now,symbol:s,type:'RESEARCH_FUSION_BUY',fusionScore:f.score,instant,confirmed,parts:f.parts,news:f.news.headline||null});out.push({symbol:s,action:'BUY',confidence:clamp(.58+f.score/250,.60,.88),allocation_pct:pct,reason:`RESEARCH-FUSION V28.1 BUY: gewichteter Evidenz-Score ${f.score.toFixed(1)}/100 statt Regelkaskade · Momentum ${f.parts.momentum.toFixed(1)} · Reclaim ${f.parts.reclaim.toFixed(1)} · Volumen ${f.parts.volume.toFixed(1)} · News ${f.parts.news.toFixed(1)} · 52W ${f.parts.high52.toFixed(1)} · Multi-Scan ${f.parts.multiScan.toFixed(1)} · Regime ${f.parts.regime.toFixed(1)} · Forward ${f.parts.forward.toFixed(1)} · Chase ${f.parts.chase.toFixed(1)} · Starter ${pct.toFixed(1)}% Cash.${f.news.quant&&f.news.fresh?' Frischer quantitativer Katalysator wird höher gewichtet.':''} Harte Daten-/Venue-/Event-Risiken bleiben bindend.`});continue}
  if(f.score>=58){counters.scoreWatches++;mem.stats.scoreWatches=num(mem.stats.scoreWatches)+1;out.push({...raw,reason:`RESEARCH-FUSION V28.1 WATCH ${f.score.toFixed(1)}/100: gute Chance bleibt aktiv im Ranking; keine Einzelregel verwirft sie. BUY ab 72 mit starker aktueller Bestätigung oder ab 64 nach stabiler Folgebestätigung. ${reason}`});continue}
  out.push(raw);
 }
 mem.stats.hardBlocks=num(mem.stats.hardBlocks)+counters.hardBlocks;
 for(const [s,v] of Object.entries(mem.snapshots))if(now-num(v?.at,0)>30*60000&&!candidates.has(s))delete mem.snapshots[s];for(const [h,t] of Object.entries(mem.newsSeen))if(now-num(t,0)>48*3600*1000)delete mem.newsSeen[h];if(mem.recent.length>160)mem.recent=mem.recent.slice(-160);mem.version=1;mem.updatedAt=new Date(now).toISOString();write(storage,mem);
 plan.actions=out;plan.summary=`${String(plan.summary||'').slice(0,180)} · RESEARCH-FUSION V28.1: ${counters.researchBuys} evidenzbasierte BUY(s) · ${counters.scoreWatches} aktive Watch(s) · ${counters.hardBlocks} echte Hard-Block(s).`;
 return{plan,counters,state:mem,ranking:ranked.slice(0,8).map(x=>({symbol:x.s,fusionScore:x.f.score,parts:x.f.parts}))};
}

export class ResearchSignalFusionGuardV281{
 constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
 async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const plan=parsePlan(r);if(!plan)return r;const result=enforceResearchSignalFusionV281(plan,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=result;return encode(r,result.plan)}
 status(){const s=this.latest?.state||{...defaults(),...read(this.storage,defaults())};return{enabled:true,version:28.1,paperTradingOnly:true,stocksOnly:true,weightedEvidenceScore:true,fewerHardRules:true,maxNewBuysPerDecision:2,instantFusionThreshold:72,confirmedFusionThreshold:64,activeWatchThreshold:58,hardBlocksOnly:['non-stock/invalid price','target venue/quote safety','HIGH event with detail','severe negative news','confirmed strong-sell/reversal','order-economics hard block'],signals:['candidate quality/confidence','5m/20m momentum + acceleration','pullback/reclaim','volume confirmation','fresh novel quantitative news','52-week-high proximity when available','multi-scan improvement','market regime','learned forward curve','soft chase penalty'],researchBasis:['Jegadeesh & Titman 1993 momentum','Lee & Swaminathan 2000 volume/momentum','George & Hwang 2004 52-week high','Bernard & Thomas 1989 post-earnings drift','Didisheim et al. NBER 2026 pure news','Daniel & Moskowitz 2016 momentum crash regime risk'],latest:this.latest?.counters||null,ranking:this.latest?.ranking||[],stats:s?.stats||{},recent:arr(s?.recent).slice(-12).reverse(),rule:'V28.1 ersetzt zusätzliche binäre Entry-Regeln durch einen gewichteten Evidenz-Score. Gute Aktien bleiben im Ranking statt an einer einzelnen weichen Bedingung zu scheitern; nur echte Daten-, Venue-, Event-, starke Negativ- und Kostenrisiken bleiben harte Sperren.'}}
}
