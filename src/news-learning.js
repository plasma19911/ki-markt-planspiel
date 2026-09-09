import {clamp,num,nowIso,chunks} from './constants.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0'};
const BENCHMARK='REGIONAL';
const LEARNING_VERSION=3;
const MAX_EVENTS=240;
export const MAX_EVENTS_PER_UPDATE=12;
const HORIZONS=[['15m',15],['1h',60],['4h',240],['6h',360]];
const REACTION_THRESHOLD_PCT=.30;

const arr=v=>Array.isArray(v)?v:[];
const sources=v=>{if(Array.isArray(v))return v.map(String).filter(Boolean);try{return JSON.parse(v||'[]').map(String).filter(Boolean)}catch{return String(v||'').split(/[,+]/).map(x=>x.trim()).filter(Boolean)}};
const signOf=n=>n>0?1:n<0?-1:0;
const hash=s=>{let h=2166136261;for(const ch of String(s||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
const clean=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();

export function regionalBenchmarkForSymbol(symbol=''){
 const s=String(symbol||'').toUpperCase();
 if(/\.NS$/.test(s))return'^NSEI';
 if(/\.BO$/.test(s))return'^BSESN';
 if(/\.HK$/.test(s))return'2800.HK';
 if(/\.KS$|\.KQ$/.test(s))return'^KS11';
 if(/\.T$/.test(s))return'^N225';
 if(/\.AX$/.test(s))return'^AXJO';
 if(/\.L$/.test(s))return'ISF.L';
 if(/\.IS$/.test(s))return'XU100.IS';
 if(/\.(DE|F|SG|MU|HM|AS|PA|BR|MI|MC|LS|SW|VI|ST|OL|CO|HE)$/.test(s))return'EXSA.DE';
 return'ACWI';
}

function eventType(headline=''){
 const h=clean(headline);
 const has=(...x)=>x.some(k=>h.includes(k));
 if(has('earnings','quarter','quartal','results','ergebnis','eps','revenue','umsatz','profit','gewinn'))return'EARNINGS';
 if(has('guidance','forecast','outlook','prognose','ausblick','raises','cuts outlook','senkt prognose','hebt prognose'))return'GUIDANCE';
 if(has('order','contract','auftrag','deal','partnership','partnerschaft','customer','kunde'))return'ORDER_CONTRACT';
 if(has('acquire','acquisition','merger','takeover','übernahme','fusion','bid for'))return'M&A';
 if(has('approval','approved','fda','ema','zulassung','regulator','regulatory','genehmigung'))return'APPROVAL_REGULATION';
 if(has('lawsuit','court','klage','gericht','antitrust','kartell','fine','strafe','investigation','ermittlung'))return'LEGAL';
 if(has('launch','product','produkt','release','chip','platform','modell','model','service'))return'PRODUCT';
 if(has('buyback','share repurchase','aktienrückkauf','dividend','dividende'))return'CAPITAL_RETURN';
 if(has('upgrade','downgrade','price target','kursziel','analyst','rating'))return'ANALYST';
 if(has('inflation','rates','zins','fed','ecb','ezb','jobs report','arbeitsmarkt','gdp','bip','tariff','zoll'))return'MACRO';
 return'OTHER';
}

function direction(row){
 const score=num(row.news_score??row.score,0);if(Math.abs(score)>=.05)return signOf(score);
 const t=String(row.tendency||'').toUpperCase();return t==='BULLISH'?1:t==='BEARISH'?-1:0;
}

export function captureNewsLearningQuoteCache(state={},rows=[]){
 const cache=state.newsLearningQuoteCache&&typeof state.newsLearningQuoteCache==='object'?state.newsLearningQuoteCache:{};
 const slot=Math.floor(Date.now()/300000)*300;
 for(const row of arr(rows)){const symbol=String(row?.symbol||'').toUpperCase(),price=num(row?.price),rawTs=num(row?.marketTimestamp,row?.market_timestamp),ts=rawTs>1e12?Math.floor(rawTs/1000):rawTs;if(!symbol||!(price>0)||!(ts>0))continue;const bars=arr(cache[symbol]).filter(x=>num(x?.ts)>0&&Date.now()/1000-num(x.ts)<=8*3600);if(bars.at(-1)?.slot===slot)bars[bars.length-1]={slot,ts,price};else bars.push({slot,ts,price});cache[symbol]=bars.slice(-100)}
 const keys=Object.keys(cache).sort((a,b)=>num(cache[b]?.at(-1)?.ts)-num(cache[a]?.at(-1)?.ts));for(const key of keys.slice(120))delete cache[key];state.newsLearningQuoteCache=cache;return cache;
}

async function quoteMap(symbols,cached={}){
 const equities=symbols.filter(Boolean).map(x=>String(x).toUpperCase()),wanted=[...new Set([...equities,...equities.map(regionalBenchmarkForSymbol)])],out=new Map(),diagnostic={requestedSymbols:wanted.length,cacheHits:0,networkRequestedSymbols:0,attempts:0,httpStatuses:[],errors:[],provider:null};
 for(const sym of wanted){const bars=arr(cached?.[sym]).filter(x=>num(x?.ts)>0&&num(x?.price)>0);if(!bars.length)continue;const latest=bars.at(-1);out.set(sym,{price:num(latest.price),ts:num(latest.ts),fresh:Date.now()/1000-num(latest.ts)<40*60,bars});diagnostic.cacheHits++}
 // V31.7.34: Yahoo /v7/finance/spark akzeptiert maximal 20 Symbole je Anfrage.
 // 40 lieferte durchgehend HTTP 400, deshalb blieb die News-Reaktionsauswertung leer.
 const missing=wanted.filter(sym=>!out.has(sym));diagnostic.networkRequestedSymbols=missing.length;
 for(const batch of chunks(missing,20)){
  // Yahoo betreibt zwei gleichwertige Spark-Hosts. Cloudflare kann einen davon
  // zeitweise mit 401/429 oder einer leeren Antwort sehen; nur bei null Treffern
  // wird deshalb genau einmal auf den zweiten Host gewechselt.
  for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
   const before=out.size;diagnostic.attempts++;
   try{
    const u=new URL(`https://${host}/v7/finance/spark`);
    u.searchParams.set('symbols',batch.join(','));u.searchParams.set('range','5d');u.searchParams.set('interval','5m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
    const r=await fetch(u,{headers:HEADERS});diagnostic.httpStatuses.push(`${host}:${r.status}`);if(!r.ok){diagnostic.errors.push(`${host} HTTP ${r.status}`);continue}const j=await r.json();
    for(const item of j?.spark?.result||[]){
     const res=item?.response?.[0];if(!res)continue;const meta=res.meta||{},sym=String(item.symbol||meta.symbol||'').toUpperCase();
     const timestamps=arr(res?.timestamp),closes=arr(res?.indicators?.quote?.[0]?.close),bars=[];for(let i=0;i<Math.min(timestamps.length,closes.length);i++){const ts=num(timestamps[i]),price=num(closes[i]);if(ts>0&&price>0)bars.push({ts,price})}
     const latest=bars.at(-1),price=num(latest?.price,meta.regularMarketPrice),ts=num(latest?.ts,meta.regularMarketTime);
     if(sym&&price>0)out.set(sym,{price,ts,fresh:ts>0&&(Date.now()/1000-ts)<40*60,bars});
    }
    if(out.size>before){diagnostic.provider=host;break}
    diagnostic.errors.push(`${host} lieferte keine verwendbaren 5-Minuten-Kurse`);
   }catch(e){diagnostic.errors.push(`${host}: ${String(e?.message||e).slice(0,180)}`)}
  }
 }
 diagnostic.errors=diagnostic.errors.slice(-6);return{quotes:out,diagnostic};
}

function emptyLearning(){return{version:LEARNING_VERSION,benchmark:BENCHMARK,events:[],evaluationCursor:0,lastEvaluationBatchSize:0,lastEvaluationQuoteCount:0,lastEvaluationAttemptCount:0,lastEvaluationError:null,lastEvaluationProvider:null,lastEvaluationHttpStatuses:[],sourceStats:{},typeStats:{},sourceTypeStats:{},updatedAt:null,summary:{topSources:[],topTypes:[],evaluatedEvents:0,completedEvents:0,pendingEvents:0,totalEvents:0,maxEventsPerUpdate:MAX_EVENTS_PER_UPDATE,notice:'Noch keine ausreichende News-Wirkungshistorie.'}}}

function newEvent(row){
 const headline=String(row.headline||'').trim(),src=sources(row.sources),newsAt=row.news_at||row.updated_at||nowIso();
 return{
  id:`${String(row.symbol||'').toUpperCase()}:${hash(`${headline}|${newsAt}`)}`,symbol:String(row.symbol||'').toUpperCase(),name:row.name||row.symbol||'',type:row.instrument_type||row.type||'',headline,newsAt,
  sources:src,eventType:eventType(headline),direction:direction(row),newsScore:num(row.news_score??row.score,0),confidence:clamp(num(row.confidence,0),0,1),sourceCount:num(row.source_count,src.length),waitingForOpen:Boolean(row.waiting_for_open),benchmark:regionalBenchmarkForSymbol(row.symbol),
  baselinePrice:null,baselineBenchmark:null,baselineAt:null,baselineMethod:null,tradingMinutes:0,lastQuoteTs:0,lastSampleAt:null,reactionDelayMinutes:null,adverseDelayMinutes:null,results:{},createdAt:nowIso()
 };
}

function addEventRows(state,l){
 const known=new Set(l.events.map(e=>e.id));
 for(const row of arr(state.newsRadar)){
  if(!row?.symbol||!row?.headline)continue;const e=newEvent(row);if(known.has(e.id))continue;l.events.push(e);known.add(e.id);
 }
 l.events=l.events.sort((a,b)=>(Date.parse(a.newsAt)||0)-(Date.parse(b.newsAt)||0)).slice(-MAX_EVENTS);
}

function aggregate(events,keyFn){
 const map={};
 for(const e of events){const keys=keyFn(e);for(const key of arr(keys)){if(!key)continue;const bucket=map[key]||(map[key]={key,horizons:{}});for(const [label] of HORIZONS){const r=e.results?.[label];if(!r||!Number.isFinite(Number(r.alignedAbnormalPct)))continue;const h=bucket.horizons[label]||(bucket.horizons[label]={samples:0,wins:0,sumAligned:0,sumAbnormal:0,sumAbs:0});h.samples++;h.wins+=num(r.alignedAbnormalPct)>0?1:0;h.sumAligned+=num(r.alignedAbnormalPct);h.sumAbnormal+=num(r.abnormalPct);h.sumAbs+=Math.abs(num(r.abnormalPct));}}}
 for(const bucket of Object.values(map))for(const h of Object.values(bucket.horizons)){h.observedHitRate=h.samples?h.wins/h.samples:null;h.adjustedHitRate=(h.wins+3)/(h.samples+6);h.hitRate=h.adjustedHitRate;h.avgAlignedPct=h.samples?h.sumAligned/h.samples:0;h.avgAbnormalPct=h.samples?h.sumAbnormal/h.samples:0;h.avgAbsMovePct=h.samples?h.sumAbs/h.samples:0;h.reliabilityScore=clamp(Math.round(50+(h.adjustedHitRate-.5)*70+clamp(h.avgAlignedPct,-3,3)*6),0,100);delete h.sumAligned;delete h.sumAbnormal;delete h.sumAbs}
 return map;
}

function ranking(stats,horizon='6h'){
 return Object.values(stats).map(x=>({key:x.key,...(x.horizons?.[horizon]||{})})).filter(x=>num(x.samples)>=3).sort((a,b)=>(num(b.reliabilityScore)-num(a.reliabilityScore))||(num(b.samples)-num(a.samples))).slice(0,10);
}

function rebuild(l){
 const done=l.events.filter(e=>Object.keys(e.results||{}).length);
 l.sourceStats=aggregate(done,e=>e.sources);
 l.typeStats=aggregate(done,e=>[e.eventType]);
 l.sourceTypeStats=aggregate(done,e=>arr(e.sources).map(s=>`${s} · ${e.eventType}`));
 const complete=l.events.filter(e=>Object.keys(e.results||{}).length>=HORIZONS.length),reactionRows=l.events.filter(e=>e.reactionDelayMinutes!=null&&Number.isFinite(Number(e.reactionDelayMinutes))),adverseRows=l.events.filter(e=>e.adverseDelayMinutes!=null&&Number.isFinite(Number(e.adverseDelayMinutes))),avg=(rows,key)=>rows.length?rows.reduce((sum,e)=>sum+num(e[key]),0)/rows.length:null;
 l.summary={topSources:ranking(l.sourceStats),topTypes:ranking(l.typeStats),evaluatedEvents:done.length,completedEvents:complete.length,pendingEvents:l.events.length-complete.length,totalEvents:l.events.length,baselineEvents:l.events.filter(e=>num(e.baselinePrice)>0).length,regionalBenchmarks:[...new Set(l.events.map(e=>e.benchmark).filter(Boolean))],maxEventsPerUpdate:MAX_EVENTS_PER_UPDATE,lastEvaluationBatchSize:num(l.lastEvaluationBatchSize),lastEvaluationQuoteCount:num(l.lastEvaluationQuoteCount),lastEvaluationCacheHits:num(l.lastEvaluationCacheHits),lastEvaluationNetworkSymbols:num(l.lastEvaluationNetworkSymbols),lastEvaluationAttemptCount:num(l.lastEvaluationAttemptCount),lastEvaluationError:l.lastEvaluationError||null,lastEvaluationProvider:l.lastEvaluationProvider||null,lastEvaluationHttpStatuses:arr(l.lastEvaluationHttpStatuses).slice(-6),reactionLag:{thresholdPct:REACTION_THRESHOLD_PCT,directionalSamples:reactionRows.length,avgDirectionalMinutes:avg(reactionRows,'reactionDelayMinutes'),adverseSamples:adverseRows.length,avgAdverseMinutes:avg(adverseRows,'adverseDelayMinutes')},notice:l.lastEvaluationError&&num(l.lastEvaluationQuoteCount)===0?`News-Kursauswertung wartet: ${l.lastEvaluationError}`:done.length<12?'Lernphase: noch zu wenig ausgewertete Meldungen für belastbare Quellengewichte.':'Quellengewichte basieren auf nachfolgenden regional bereinigten 15m-/1h-/4h-/6h-Reaktionen; statistische Wirkung, keine bewiesene Kausalität.'};
 l.updatedAt=nowIso();
}

function atOrBefore(bars=[],ts=0){let found=null;for(const bar of arr(bars)){if(num(bar?.ts)>ts)break;if(num(bar?.price)>0)found=bar}return found}
function after(bars=[],ts=0){return arr(bars).filter(bar=>num(bar?.ts)>ts&&num(bar?.price)>0)}

export function evaluateNewsEventFromBars(event={},stockBars=[],benchmarkBars=[]){
 const newsTs=Math.floor((Date.parse(String(event.newsAt||''))||0)/1000);if(!(newsTs>0))return event;
 const stockBase=atOrBefore(stockBars,newsTs),benchmarkBase=atOrBefore(benchmarkBars,newsTs);if(!stockBase||!benchmarkBase)return event;
 const next={...event,benchmark:event.benchmark||regionalBenchmarkForSymbol(event.symbol),baselinePrice:num(stockBase.price),baselineBenchmark:num(benchmarkBase.price),baselineAt:new Date(Math.max(stockBase.ts,benchmarkBase.ts)*1000).toISOString(),baselineMethod:'PRE_NEWS_5M_CLOSE',results:{...(event.results||{})}},post=after(stockBars,newsTs);if(!post.length)return next;
 next.tradingMinutes=post.length*5;next.lastQuoteTs=num(post.at(-1)?.ts);next.lastSampleAt=nowIso();const dir=num(next.direction);
 const measure=bar=>{const bench=atOrBefore(benchmarkBars,num(bar.ts)),stockPct=(num(bar.price)/next.baselinePrice-1)*100,benchmarkPct=bench?(num(bench.price)/next.baselineBenchmark-1)*100:0,abnormalPct=stockPct-benchmarkPct;return{stockPct,benchmarkPct,abnormalPct,alignedAbnormalPct:dir?abnormalPct*dir:0,barTs:num(bar.ts)}};
 for(let i=0;i<post.length;i++){
  const m=measure(post[i]),minutes=(i+1)*5;
  if(next.reactionDelayMinutes==null&&dir&&m.alignedAbnormalPct>=REACTION_THRESHOLD_PCT)next.reactionDelayMinutes=minutes;
  if(next.adverseDelayMinutes==null&&dir&&m.alignedAbnormalPct<=-REACTION_THRESHOLD_PCT)next.adverseDelayMinutes=minutes;
 }
 for(const [label,minutes] of HORIZONS){const bar=post[Math.ceil(minutes/5)-1];if(!bar||next.results[label])continue;const m=measure(bar);next.results[label]={at:new Date(m.barTs*1000).toISOString(),stockPct:m.stockPct,benchmarkPct:m.benchmarkPct,abnormalPct:m.abnormalPct,alignedAbnormalPct:m.alignedAbnormalPct,marketMinutes:minutes,benchmark:next.benchmark}}
 return next;
}

export async function updateNewsLearning(state){
 const l=state.newsLearning&&typeof state.newsLearning==='object'?state.newsLearning:emptyLearning();
 const upgrading=num(l.version,1)<2;l.version=LEARNING_VERSION;l.benchmark=BENCHMARK;l.events=arr(l.events).map(e=>upgrading?{...e,benchmark:regionalBenchmarkForSymbol(e.symbol),baselinePrice:null,baselineBenchmark:null,baselineAt:null,baselineMethod:null,tradingMinutes:0,lastQuoteTs:0,lastSampleAt:null,reactionDelayMinutes:null,adverseDelayMinutes:null,results:{}}:{...e,benchmark:e.benchmark||regionalBenchmarkForSymbol(e.symbol)});addEventRows(state,l);
 const currentNews=new Map(arr(state.newsRadar).map(x=>[String(x.symbol||'').toUpperCase(),x]));
 const allPending=l.events.filter(e=>Object.keys(e.results||{}).length<HORIZONS.length&&Date.now()-(Date.parse(e.newsAt)||Date.now())<7*86400000).sort((a,b)=>(Date.parse(b.newsAt)||0)-(Date.parse(a.newsAt)||0)),start=allPending.length?num(l.evaluationCursor)%allPending.length:0,pending=allPending.length?[...allPending.slice(start),...allPending.slice(0,start)].slice(0,MAX_EVENTS_PER_UPDATE):[];l.lastEvaluationBatchSize=pending.length;
 if(pending.length){
  const lookup=await quoteMap(pending.map(e=>e.symbol),state.newsLearningQuoteCache),quotes=lookup.quotes,diagnostic=lookup.diagnostic;l.lastEvaluationQuoteCount=quotes.size;l.lastEvaluationCacheHits=num(diagnostic.cacheHits);l.lastEvaluationNetworkSymbols=num(diagnostic.networkRequestedSymbols);l.lastEvaluationAttemptCount=num(diagnostic.attempts);l.lastEvaluationProvider=diagnostic.cacheHits?(diagnostic.provider?'SCANNER_CACHE+YAHOO':'SCANNER_CACHE'):diagnostic.provider||null;l.lastEvaluationHttpStatuses=arr(diagnostic.httpStatuses);l.lastEvaluationError=quotes.size?null:diagnostic.errors?.at(-1)||'Keine verwendbaren News-Lernkurse empfangen';
  // Bei einem kompletten Provider-Ausfall bleiben die wichtigsten neuesten
  // Meldungen vorne. Erst nach mindestens einem echten Kurs wird rotiert.
  if(quotes.size)l.evaluationCursor=allPending.length?(start+pending.length)%allPending.length:0;
  for(let i=0;i<pending.length;i++){
   let e=pending[i],q=quotes.get(e.symbol),bench=quotes.get(e.benchmark||regionalBenchmarkForSymbol(e.symbol)),row=currentNews.get(e.symbol);if(row)e.waitingForOpen=Boolean(row.waiting_for_open);
   if(q?.bars?.length&&bench?.bars?.length){const evaluated=evaluateNewsEventFromBars(e,q.bars,bench.bars),at=l.events.indexOf(e);if(at>=0)l.events[at]=evaluated;e=evaluated;if(Object.keys(e.results||{}).length>=HORIZONS.length)continue}
   if(!e.baselinePrice){
    // A provider may return a fresh-looking envelope without a usable quote.
    // Never let one missing stock/benchmark price abort the complete scan.
    if(e.waitingForOpen||!q?.fresh||!bench?.fresh||!(num(q?.price)>0)||!(num(bench?.price)>0))continue;
    e.baselinePrice=q.price;e.baselineBenchmark=bench.price;e.baselineAt=nowIso();e.baselineMethod='LIVE_FIRST_FRESH_QUOTE';e.lastQuoteTs=q.ts;e.lastSampleAt=nowIso();continue;
   }
   if(!q?.fresh||!bench?.fresh||!(num(q?.price)>0)||!(num(bench?.price)>0)||num(q?.ts)<=num(e.lastQuoteTs))continue;
   const delta=Math.min(15,Math.max(1,(q.ts-num(e.lastQuoteTs))/60));e.tradingMinutes=num(e.tradingMinutes)+delta;e.lastQuoteTs=q.ts;e.lastSampleAt=nowIso();
   const stockPct=(q.price/num(e.baselinePrice)-1)*100,benchPct=(bench.price/num(e.baselineBenchmark)-1)*100,abnormalPct=stockPct-benchPct,dir=num(e.direction);
   const alignedAbnormalPct=dir?abnormalPct*dir:0;if(e.reactionDelayMinutes==null&&dir&&alignedAbnormalPct>=REACTION_THRESHOLD_PCT)e.reactionDelayMinutes=num(e.tradingMinutes);if(e.adverseDelayMinutes==null&&dir&&alignedAbnormalPct<=-REACTION_THRESHOLD_PCT)e.adverseDelayMinutes=num(e.tradingMinutes);
   for(const [label,mins] of HORIZONS)if(num(e.tradingMinutes)>=mins&&!e.results[label])e.results[label]={at:nowIso(),stockPct,benchmarkPct:benchPct,abnormalPct,alignedAbnormalPct,marketMinutes:mins,benchmark:e.benchmark};
  }
 }else{
  l.lastEvaluationQuoteCount=0;l.lastEvaluationAttemptCount=0;l.lastEvaluationProvider=null;l.lastEvaluationHttpStatuses=[];l.lastEvaluationError=null;
 }
 rebuild(l);state.newsLearning=l;return l;
}

export function newsLearningContext(state){
 const l=state?.newsLearning;if(!l)return null;
 return{benchmark:l.benchmark||BENCHMARK,updatedAt:l.updatedAt,summary:l.summary||{},topSources:(l.summary?.topSources||[]).slice(0,6),topTypes:(l.summary?.topTypes||[]).slice(0,6)};
}
