import {clamp,num,nowIso,chunks} from './constants.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0'};
const BENCHMARK='ACWI';
const MAX_EVENTS=180;
const HORIZONS=[['1h',60],['6h',360],['18h',1080]];

const arr=v=>Array.isArray(v)?v:[];
const sources=v=>{if(Array.isArray(v))return v.map(String).filter(Boolean);try{return JSON.parse(v||'[]').map(String).filter(Boolean)}catch{return String(v||'').split(/[,+]/).map(x=>x.trim()).filter(Boolean)}};
const signOf=n=>n>0?1:n<0?-1:0;
const hash=s=>{let h=2166136261;for(const ch of String(s||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
const clean=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();

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

async function quoteMap(symbols){
 const wanted=[...new Set([...symbols.filter(Boolean).map(x=>String(x).toUpperCase()),BENCHMARK])],out=new Map();
 for(const batch of chunks(wanted,40)){
  try{
   const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');
   u.searchParams.set('symbols',batch.join(','));u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
   const r=await fetch(u,{headers:HEADERS});if(!r.ok)continue;const j=await r.json();
   for(const item of j?.spark?.result||[]){
    const res=item?.response?.[0];if(!res)continue;const meta=res.meta||{},sym=String(item.symbol||meta.symbol||'').toUpperCase();
    const closes=(res?.indicators?.quote?.[0]?.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number);const price=num(meta.regularMarketPrice,closes.at(-1));const ts=num(meta.regularMarketTime,0);
    if(sym&&price>0)out.set(sym,{price,ts,fresh:ts>0&&(Date.now()/1000-ts)<40*60});
   }
  }catch{}
 }
 return out;
}

function emptyLearning(){return{version:1,benchmark:BENCHMARK,events:[],sourceStats:{},typeStats:{},sourceTypeStats:{},updatedAt:null,summary:{topSources:[],topTypes:[],evaluatedEvents:0,pendingEvents:0,notice:'Noch keine ausreichende News-Wirkungshistorie.'}}}

function newEvent(row){
 const headline=String(row.headline||'').trim(),src=sources(row.sources),newsAt=row.news_at||row.updated_at||nowIso();
 return{
  id:`${String(row.symbol||'').toUpperCase()}:${hash(`${headline}|${newsAt}`)}`,symbol:String(row.symbol||'').toUpperCase(),name:row.name||row.symbol||'',type:row.instrument_type||row.type||'',headline,newsAt,
  sources:src,eventType:eventType(headline),direction:direction(row),newsScore:num(row.news_score??row.score,0),confidence:clamp(num(row.confidence,0),0,1),sourceCount:num(row.source_count,src.length),waitingForOpen:Boolean(row.waiting_for_open),
  baselinePrice:null,baselineBenchmark:null,baselineAt:null,tradingMinutes:0,lastQuoteTs:0,lastSampleAt:null,results:{},createdAt:nowIso()
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
 for(const bucket of Object.values(map))for(const h of Object.values(bucket.horizons)){h.hitRate=(h.wins+3)/(h.samples+6);h.avgAlignedPct=h.samples?h.sumAligned/h.samples:0;h.avgAbnormalPct=h.samples?h.sumAbnormal/h.samples:0;h.avgAbsMovePct=h.samples?h.sumAbs/h.samples:0;h.reliabilityScore=clamp(Math.round(50+(h.hitRate-.5)*70+clamp(h.avgAlignedPct,-3,3)*6),0,100);delete h.sumAligned;delete h.sumAbnormal;delete h.sumAbs}
 return map;
}

function ranking(stats,horizon='6h'){
 return Object.values(stats).map(x=>({key:x.key,...(x.horizons?.[horizon]||{})})).filter(x=>num(x.samples)>=3).sort((a,b)=>(num(b.reliabilityScore)-num(a.reliabilityScore))||(num(b.samples)-num(a.samples))).slice(0,10);
}

function rebuild(l){
 const done=l.events.filter(e=>Object.keys(e.results||{}).length);
 l.sourceStats=aggregate(done,e=>e.sources);
 l.typeStats=aggregate(done,e=>[e.eventType]);
 l.sourceTypeStats=aggregate(done,e=>e.sources.map(s=>`${s} · ${e.eventType}`));
 l.summary={topSources:ranking(l.sourceStats),topTypes:ranking(l.typeStats),evaluatedEvents:done.length,pendingEvents:l.events.filter(e=>Object.keys(e.results||{}).length<3).length,notice:done.length<12?'Lernphase: noch zu wenig ausgewertete Meldungen für belastbare Quellengewichte.':'Quellengewichte basieren auf nachfolgender abnormaler Kursreaktion relativ zu ACWI; statistische Wirkung, keine bewiesene Kausalität.'};
 l.updatedAt=nowIso();
}

export async function updateNewsLearning(state){
 const l=state.newsLearning&&typeof state.newsLearning==='object'?state.newsLearning:emptyLearning();
 l.events=arr(l.events);addEventRows(state,l);
 const currentNews=new Map(arr(state.newsRadar).map(x=>[String(x.symbol||'').toUpperCase(),x]));
 const pending=l.events.filter(e=>Object.keys(e.results||{}).length<3&&Date.now()-(Date.parse(e.newsAt)||Date.now())<21*86400000);
 if(pending.length){
  const quotes=await quoteMap(pending.map(e=>e.symbol));const bench=quotes.get(BENCHMARK);
  for(const e of pending){
   const q=quotes.get(e.symbol),row=currentNews.get(e.symbol);if(row)e.waitingForOpen=Boolean(row.waiting_for_open);
   if(!e.baselinePrice){
    if(e.waitingForOpen||!q?.fresh||!bench?.fresh)continue;
    e.baselinePrice=q.price;e.baselineBenchmark=bench.price;e.baselineAt=nowIso();e.lastQuoteTs=q.ts;e.lastSampleAt=nowIso();continue;
   }
   if(!q?.fresh||!bench?.fresh||q.ts<=num(e.lastQuoteTs))continue;
   const delta=Math.min(15,Math.max(1,(q.ts-num(e.lastQuoteTs))/60));e.tradingMinutes=num(e.tradingMinutes)+delta;e.lastQuoteTs=q.ts;e.lastSampleAt=nowIso();
   const stockPct=(q.price/num(e.baselinePrice)-1)*100,benchPct=(bench.price/num(e.baselineBenchmark)-1)*100,abnormalPct=stockPct-benchPct,dir=num(e.direction);
   for(const [label,mins] of HORIZONS)if(num(e.tradingMinutes)>=mins&&!e.results[label])e.results[label]={at:nowIso(),stockPct,benchmarkPct:benchPct,abnormalPct,alignedAbnormalPct:dir?abnormalPct*dir:0};
  }
 }
 rebuild(l);state.newsLearning=l;return l;
}

export function newsLearningContext(state){
 const l=state?.newsLearning;if(!l)return null;
 return{benchmark:l.benchmark||BENCHMARK,updatedAt:l.updatedAt,summary:l.summary||{},topSources:(l.summary?.topSources||[]).slice(0,6),topTypes:(l.summary?.topTypes||[]).slice(0,6)};
}
