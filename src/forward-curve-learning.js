import {classifyEntryTiming} from './live-signal-learning.js';

const KEY='state/forward-curve-learning-v1';
const HORIZONS=[5,15,30];
const MAX_PENDING=220;
const MAX_RECENT=240;
const SNAPSHOT_GAP_MS=8*60000;
const MIN_ADJUST=8;
const MIN_ADJUST_SYMBOLS=3;
const MIN_BLOCK=18;
const MIN_BLOCK_SYMBOLS=5;
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v||'').toUpperCase().trim();
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};
const median=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2};

function m(c={}){return{price:num(c?.price,c?.last_price),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),day:num(c?.day,c?.day_change),draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,rsi:num(c?.intradayRsi,c?.rsi??50),vol:num(c?.volumeRatio,c?.volume_ratio??1),news:num(c?.news,c?.news_score??c?.newsScore)}}
function band(v,cuts,labels){for(let i=0;i<cuts.length;i++)if(v<cuts[i])return labels[i];return labels.at(-1)}
function featureBands(c={}){const x=m(c);return{
 m20:band(x.m20,[-.5,-.1,.15,.7,1.5],['DOWN2','DOWN','FLAT','UP','UP2','EXT']),
 accel:band(x.accel,[-.08,-.02,.02,.08],['DECEL2','DECEL','FLAT','ACCEL','ACCEL2']),
 draw:x.draw==null?'NA':band(x.draw,[-1.5,-.55,-.2],['DEEP','PULLBACK','RETEST','HIGH']),
 rsi:band(x.rsi,[35,50,65,74],['LOW','MIDLOW','MID','HIGH','HOT']),
 vol:band(x.vol,[.6,1,1.4],['THIN','NORMAL','CONFIRM','SURGE']),
 news:band(x.news,[-.25,.25],['NEG','NEUTRAL','POS'])
}}
export function marketRegime(candidates=[],broad=null){
 if(broad&&num(broad?.sampleCount)>=12&&String(broad?.source||'')==='COARSE_OPEN_UNIVERSE'){return{regime:String(broad.regime||'MIXED'),source:'COARSE_OPEN_UNIVERSE',sampleCount:num(broad.sampleCount),breadthUp20:num(broad.breadthUp20,.5),breadthUp5:num(broad.breadthUp20,.5),breadthUpDay:num(broad.breadthUpDay,.5),median5:num(broad.median20),median20:num(broad.median20),medianAccel:num(broad.medianAccel)}}
 const rows=arr(candidates).map(m).filter(x=>x.price>0||Number.isFinite(x.m20));if(!rows.length)return{regime:'UNKNOWN',source:'SELECTED_CANDIDATES_FALLBACK',breadthUp20:.5,breadthUp5:.5,median5:0,median20:0,medianAccel:0};
 const up20=rows.filter(x=>x.m20>.05).length/rows.length,up5=rows.filter(x=>x.m5>.03).length/rows.length,med5=median(rows.map(x=>x.m5)),med20=median(rows.map(x=>x.m20)),medA=median(rows.map(x=>x.accel));let regime='MIXED';
 if(up20>=.64&&med20>.08)regime='BROAD_UP';
 else if(up20<=.34&&med20<-.08)regime='RISK_OFF';
 else if(med20>0&&med5<-.06&&medA<-.02)regime='REVERSAL_DOWN';
 else if(med20<0&&med5>.06&&medA>.02)regime='REVERSAL_UP';
 else if(Math.abs(med20)<.10&&Math.abs(med5)<.05)regime='RANGE';
 return{regime,source:'SELECTED_CANDIDATES_FALLBACK',breadthUp20:+up20.toFixed(3),breadthUp5:+up5.toFixed(3),median5:+med5.toFixed(3),median20:+med20.toFixed(3),medianAccel:+medA.toFixed(3),sampleCount:rows.length};
}
function keysFor(c,regime){const timing=classifyEntryTiming(c),b=featureBands(c);return{timing,exact:`${timing}|${regime}|${b.m20}|${b.accel}|${b.draw}|${b.rsi}`,broad:`${timing}|${regime}`,timingKey:`${timing}|ANY`,bands:b}}
function defaults(){return{version:2,pending:[],stats:{},recent:[],resolved:0,createdAt:new Date().toISOString(),updatedAt:null}}
function stat(state,k,h){state.stats[k]=state.stats[k]||{};const s=state.stats[k][h]||(state.stats[k][h]={count:0,wins:0,sum:0,sumAbs:0,symbols:{}});s.symbols=s.symbols||{};return s}
function add(state,k,h,r,symbol){const s=stat(state,k,h);s.count++;if(r>0)s.wins++;s.sum+=r;s.sumAbs+=Math.abs(r);if(symbol)s.symbols[key(symbol)]=1}
function aggregate(state,k,h){const s=state?.stats?.[k]?.[h],rawN=num(s?.count),uniqueSymbols=Object.keys(s?.symbols||{}).length,effectiveN=Math.min(rawN,uniqueSymbols*4);return rawN?{rawN,effectiveN,uniqueSymbols,mean:num(s.sum)/rawN,win:num(s.wins)/rawN}:null}
function blend(state,ks,h){
 const exact=aggregate(state,ks.exact,h),broad=aggregate(state,ks.broad,h),timing=aggregate(state,ks.timingKey,h),parts=[];
 if(exact&&exact.effectiveN)parts.push({...exact,w:Math.min(1,exact.effectiveN/18)*.55});
 if(broad&&broad.effectiveN)parts.push({...broad,w:Math.min(1,broad.effectiveN/24)*.30});
 if(timing&&timing.effectiveN)parts.push({...timing,w:Math.min(1,timing.effectiveN/30)*.15});
 const den=parts.reduce((a,x)=>a+x.w,0),rawN=Math.max(exact?.rawN||0,broad?.rawN||0,timing?.rawN||0),effectiveN=Math.max(exact?.effectiveN||0,broad?.effectiveN||0,timing?.effectiveN||0),uniqueSymbols=Math.max(exact?.uniqueSymbols||0,broad?.uniqueSymbols||0,timing?.uniqueSymbols||0);
 if(!den)return{rawN,effectiveN:0,uniqueSymbols,mean:0,win:.5,reliability:0};
 let mean=parts.reduce((a,x)=>a+x.mean*x.w,0)/den,win=parts.reduce((a,x)=>a+x.win*x.w,0)/den;const prior=10;mean=mean*effectiveN/(effectiveN+prior);win=(win*effectiveN+.5*prior)/(effectiveN+prior);return{rawN,effectiveN,uniqueSymbols,mean,win,reliability:clamp((effectiveN/30)*(uniqueSymbols/5),0,1)}
}

export function updateForwardCurveLearning(storage,state={}){
 const x={...defaults(),...read(storage,defaults())},now=Date.now(),candidates=arr(state?.candidates),map=new Map(candidates.map(c=>[key(c?.symbol),c])),reg=marketRegime(candidates,state?.marketBreadth);x.pending=arr(x.pending);x.stats=x.stats||{};x.recent=arr(x.recent);
 for(const p of x.pending){const c=map.get(p.symbol),price=num(c?.price);if(!(price>0))continue;const age=(now-num(p.at,now))/60000;p.done=p.done||{};for(const h of HORIZONS){if(p.done[h]||age<h)continue;if(age>h+12){p.done[h]='MISSED';continue}const ret=(price/p.price-1)*100;p.done[h]=1;for(const k of [p.keys.exact,p.keys.broad,p.keys.timingKey])add(x,k,h,ret,p.symbol);x.resolved=num(x.resolved)+1;x.recent.push({at:now,symbol:p.symbol,horizonMin:h,returnPct:+ret.toFixed(3),timing:p.keys.timing,regime:p.regime,features:p.features});}}
 x.pending=x.pending.filter(p=>HORIZONS.some(h=>!p.done?.[h])&&now-num(p.at,now)<55*60000);
 const lastBySymbol=new Map(x.pending.map(p=>[p.symbol,num(p.at)])),ranked=[...candidates].filter(c=>key(c?.symbol)&&num(c?.price)>0).sort((a,b)=>num(b?.score,b?.liveScore)+num(b?.confidence,b?.liveConfidence)-num(a?.score,a?.liveScore)-num(a?.confidence,a?.liveConfidence)).slice(0,24);
 for(const c of ranked){const s=key(c.symbol);if(now-num(lastBySymbol.get(s))<SNAPSHOT_GAP_MS)continue;const ks=keysFor(c,reg.regime),mx=m(c);x.pending.push({symbol:s,at:now,price:mx.price,regime:reg.regime,keys:ks,features:{m5:+mx.m5.toFixed(3),m20:+mx.m20.toFixed(3),accel:+mx.accel.toFixed(3),day:+mx.day.toFixed(3),draw:mx.draw==null?null:+mx.draw.toFixed(3),rsi:+mx.rsi.toFixed(1),vol:+mx.vol.toFixed(2),news:+mx.news.toFixed(2),breadthUp20:reg.breadthUp20,breadthUp5:reg.breadthUp5},done:{}});}
 if(x.pending.length>MAX_PENDING)x.pending=x.pending.slice(-MAX_PENDING);if(x.recent.length>MAX_RECENT)x.recent=x.recent.slice(-MAX_RECENT);x.version=2;x.updatedAt=new Date(now).toISOString();x.marketRegime=reg;write(storage,x);return{resolved:x.resolved,pending:x.pending.length,marketRegime:reg,recent:x.recent.slice(-10).reverse()}
}

export function getForwardCurveForecast(storage,candidate={},marketCandidates=[],marketBreadth=null){
 const state={...defaults(),...read(storage,defaults())},reg=marketRegime(marketCandidates,marketBreadth),ks=keysFor(candidate,reg.regime),h5=blend(state,ks,5),h15=blend(state,ks,15),h30=blend(state,ks,30),effectiveSamples=Math.max(h15.effectiveN,h30.effectiveN),rawSamples=Math.max(h15.rawN,h30.rawN),uniqueSymbols=Math.max(h15.uniqueSymbols,h30.uniqueSymbols),adjustMature=effectiveSamples>=MIN_ADJUST&&uniqueSymbols>=MIN_ADJUST_SYMBOLS,negativeMature=effectiveSamples>=MIN_BLOCK&&uniqueSymbols>=MIN_BLOCK_SYMBOLS&&h15.mean<-.12&&h15.win<.40&&h30.mean<-.08&&h30.win<.43,positiveMature=adjustMature&&h15.mean>.10&&h15.win>.54;
 const sizeMultiplier=negativeMature?0:adjustMature?clamp(1+h15.mean*.28+h30.mean*.18+(h15.win-.5)*.35,.72,positiveMature?1.12:1.05):1,scoreDelta=negativeMature?-.9:adjustMature?clamp(h15.mean*.55+h30.mean*.35+(h15.win-.5)*.45,-.55,.38):0;
 return{version:2,timing:ks.timing,marketRegime:reg,features:ks.bands,samples:effectiveSamples,rawSamples,uniqueSymbols,horizons:{5:{expectedPct:+h5.mean.toFixed(3),upProbability:+h5.win.toFixed(3),samples:h5.effectiveN,rawSamples:h5.rawN,uniqueSymbols:h5.uniqueSymbols},15:{expectedPct:+h15.mean.toFixed(3),upProbability:+h15.win.toFixed(3),samples:h15.effectiveN,rawSamples:h15.rawN,uniqueSymbols:h15.uniqueSymbols},30:{expectedPct:+h30.mean.toFixed(3),upProbability:+h30.win.toFixed(3),samples:h30.effectiveN,rawSamples:h30.rawN,uniqueSymbols:h30.uniqueSymbols}},reliability:+Math.max(h15.reliability,h30.reliability).toFixed(3),sizeMultiplier:+sizeMultiplier.toFixed(3),scoreDelta:+scoreDelta.toFixed(3),block:negativeMature,reason:negativeMature?'Vorwärtslernen blockiert: das negative 15/30-Minuten-Muster ist über mehrere verschiedene Aktien bestätigt.':positiveMature?'Vorwärtslernen bestätigt die aktuelle Kurvenform über mehrere verschiedene Aktien.':adjustMature?'Vorwärtslernen liefert eine vorsichtige Größen-/Score-Anpassung auf diverser Stichprobe.':`Noch nicht genügend unabhängige Evidenz: ${effectiveSamples} effektive Fälle aus ${uniqueSymbols} Symbol(en); Prognose bleibt beobachtend.`};
}
export function getForwardCurveStatus(storage){const s={...defaults(),...read(storage,defaults())};return{enabled:true,version:2,mode:'probabilistic 5/15/30-minute curve forecasting with cross-symbol diversity',resolved:num(s.resolved),pending:arr(s.pending).length,marketRegime:s.marketRegime||null,snapshotGapMinutes:SNAPSHOT_GAP_MS/60000,minEffectiveSamplesBeforeAdjustment:MIN_ADJUST,minDistinctSymbolsBeforeAdjustment:MIN_ADJUST_SYMBOLS,minEffectiveSamplesBeforeBlock:MIN_BLOCK,minDistinctSymbolsBeforeBlock:MIN_BLOCK_SYMBOLS,recent:arr(s.recent).slice(-12).reverse(),marketRegimeSource:s.marketRegime?.source||null,rule:'Überlappende Beobachtungen derselben Aktie werden als abhängige Daten begrenzt. Erst über mehrere verschiedene Symbole bestätigte negative Muster dürfen BUY blockieren.'}}
