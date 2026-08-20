import fs from 'node:fs';
import {scoreAgmOpportunity} from '../src/agm-opportunity-scoring.js';

const OUT='public/agm-calendar.json';
const UNIVERSE='public/universe.json';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const SOURCES=[
 'https://www.finanzen.net/termine/unternehmen/hauptversammlung',
 'https://www.finanzen.net/index/cdax/hv-termine',
 'https://www.finanzen.net/index/dax/hv-termine',
 'https://www.finanzen.net/index/mdax/hv-termine',
 'https://www.finanzen.net/index/sdax/hv-termine',
 'https://www.finanzen.net/index/tecdax/hv-termine'
];
const now=new Date();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
const decode=s=>String(s||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&auml;/gi,'ä').replace(/&ouml;/gi,'ö').replace(/&uuml;/gi,'ü').replace(/&Auml;/g,'Ä').replace(/&Ouml;/g,'Ö').replace(/&Uuml;/g,'Ü').replace(/&szlig;/gi,'ß').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const dayIso=(d,m,y)=>`${String(y<100?2000+y:y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const dayDiff=iso=>Math.round((Date.parse(`${iso}T12:00:00Z`)-Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),12))/86400000);

function normalizeName(s){
 return decode(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\([^)]*(?:EX |SPONS|ADR|GDR|REGISTERED|CLASS|SHS|SHARE)[^)]*\)/g,' ').replace(/&/g,' AND ').replace(/[^A-Z0-9]+/g,' ').split(/\s+/).filter(Boolean).filter(x=>!new Set(['AG','SE','NV','SA','SPA','PLC','LTD','LIMITED','INC','INCORPORATED','CORP','CORPORATION','CO','COMPANY','KGAA','GMBH','HOLDING','HOLDINGS','GROUP','REGISTERED','SHS','SHARE','SHARES','SPONS','SPONSORED','ADR','ADRS','GDR','ADSS','ORD','ORDINARY','CLASS','THE']).has(x)).join(' ').trim();
}
function tokenSet(s){return new Set(normalizeName(s).split(' ').filter(x=>x.length>1))}
function matchScore(a,b){
 const A=normalizeName(a),B=normalizeName(b);if(!A||!B)return 0;if(A===B)return 1;
 const ta=tokenSet(A),tb=tokenSet(B);if(!ta.size||!tb.size)return 0;let inter=0;for(const x of ta)if(tb.has(x))inter++;
 const jac=inter/(ta.size+tb.size-inter),contain=inter/Math.min(ta.size,tb.size),prefix=A.startsWith(B)||B.startsWith(A)?1:0;
 return jac*.48+contain*.42+prefix*.10;
}
function parseRows(html,source){
 const out=[];for(const m of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>decode(x[1]));if(cells.length<2||!/Hauptversammlung/i.test(cells.join(' | ')))continue;
  const dateCell=cells.find(x=>/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/.test(x)),dm=dateCell?.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);if(!dm)continue;
  const eventIdx=cells.findIndex(x=>/Hauptversammlung/i.test(x));let company=cells.slice(0,eventIdx<0?cells.length:eventIdx).find((x,i)=>i>0&&!/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/.test(x)&&x.length>2&&!/^[-–—]$/.test(x));if(!company)company=cells[1];
  const date=dayIso(Number(dm[1]),Number(dm[2]),Number(dm[3]));out.push({date,sourceCompanyName:company,source});
 }
 return out;
}
async function getText(url){
 const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml','accept-language':'de-DE,de;q=0.9,en;q=0.7'}});if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);return r.text();
}
async function quoteBatch(symbols){
 if(!symbols.length)return[];
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
  try{const u=new URL(`https://${host}/v7/finance/quote`);u.searchParams.set('symbols',symbols.join(','));const r=await fetch(u,{headers:{'user-agent':UA,'accept':'application/json'}});if(!r.ok)continue;const j=await r.json();if(Array.isArray(j?.quoteResponse?.result))return j.quoteResponse.result}catch{}
 }
 return[];
}
function fundamentalFromQuote(q={},old=null){
 const ttm=finite(q.epsTrailingTwelveMonths),forward=finite(q.epsForward),current=finite(q.epsCurrentYear),rating=String(q.averageAnalystRating||''),week=finite(q.fiftyTwoWeekChange),forwardPE=finite(q.forwardPE),trailingPE=finite(q.trailingPE);let score=50,conf=.18,positive=null,reasons=[];
 if(ttm!==null&&forward!==null){conf+=.34;if(ttm<=0&&forward>0){score+=18;positive=true;reasons.push('Forward-EPS dreht gegenüber negativem TTM in den Gewinn')}else if(ttm>0){const g=(forward/ttm-1)*100;if(g>=25){score+=14;positive=true;reasons.push(`Forward-EPS ca. ${g.toFixed(0)}% über TTM`)}else if(g>=8){score+=9;positive=true;reasons.push(`Forward-EPS ca. ${g.toFixed(0)}% über TTM`)}else if(g>0){score+=4;positive=true;reasons.push('Forward-EPS leicht über TTM')}else if(g<=-15){score-=12;positive=false;reasons.push(`Forward-EPS ca. ${Math.abs(g).toFixed(0)}% unter TTM`)}else if(g<0){score-=5;positive=false;reasons.push('Forward-EPS unter TTM')}}}
 else if(current!==null&&forward!==null){conf+=.24;if(current<=0&&forward>0){score+=13;positive=true;reasons.push('Forward-EPS positiv nach schwachem laufenden Jahr')}else if(current>0&&forward>current*1.08){score+=8;positive=true;reasons.push('Forward-EPS über aktueller Jahresschätzung')}else if(current>0&&forward<current*.90){score-=7;positive=false;reasons.push('Forward-EPS unter aktueller Jahresschätzung')}}
 if(/strong buy|buy|outperform/i.test(rating)){score+=6;conf+=.12;reasons.push(`Analystenkonsens ${rating}`)}else if(/sell|underperform/i.test(rating)){score-=8;conf+=.12;reasons.push(`Analystenkonsens ${rating}`)}
 if(week!==null){conf+=.06;if(week>-.05&&week<.35)score+=3;if(week>.65)score-=3;if(week<-.35)score-=4}
 if(forwardPE!==null&&trailingPE!==null&&forwardPE>0&&trailingPE>0){conf+=.05;if(forwardPE<trailingPE*.82)score+=3;else if(forwardPE>trailingPE*1.22)score-=2}
 if(ttm===null&&forward===null&&old){return{baseScore:old.baseScore??old.fundamentalScore??50,fundamentalScore:old.fundamentalScore??old.baseScore??50,fundamentalConfidence:old.fundamentalConfidence??.2,profitForecastPositive:old.profitForecastPositive??null,fundamentalReasons:old.fundamentalReasons||['Fundamentaldaten zuletzt verfügbar'],fundamentals:old.fundamentals||null}}
 return{baseScore:Math.round(clamp(score,0,100)),fundamentalScore:Math.round(clamp(score,0,100)),fundamentalConfidence:+clamp(conf,.15,.85).toFixed(3),profitForecastPositive:positive,fundamentalReasons:reasons.slice(0,4),fundamentals:{epsTrailingTwelveMonths:ttm,epsForward:forward,epsCurrentYear:current,averageAnalystRating:rating||null,fiftyTwoWeekChange:week,forwardPE,trailingPE,marketCap:finite(q.marketCap)}};
}

const old=fs.existsSync(OUT)?JSON.parse(fs.readFileSync(OUT,'utf8')):{events:[]},sourceResults=await Promise.allSettled(SOURCES.map(async url=>({url,rows:parseRows(await getText(url),url)}))),raw=[];const errors=[];
for(const x of sourceResults){if(x.status==='fulfilled')raw.push(...x.value.rows);else errors.push(String(x.reason?.message||x.reason))}
const dedup=new Map();for(const x of raw){const d=dayDiff(x.date);if(d<-1||d>60)continue;const k=`${x.date}|${normalizeName(x.sourceCompanyName)}`;if(!dedup.has(k))dedup.set(k,x)}
if(!dedup.size&&!old?.events?.length)throw new Error(`Keine HV-Termine geladen. ${errors.join(' | ')}`);
const universe=JSON.parse(fs.readFileSync(UNIVERSE,'utf8')),equities=(universe?.equities||[]).filter(x=>x?.symbol&&x?.name),matched=[];
for(const ev of dedup.values()){
 let best=null,second=0;for(const q of equities){const s=matchScore(ev.sourceCompanyName,q.name);if(!best||s>best.score){second=best?.score||0;best={q,score:s}}else if(s>second)second=s}
 if(!best||best.score<.72||(best.score<.90&&best.score-second<.07))continue;
 matched.push({...ev,symbol:String(best.q.symbol).toUpperCase(),name:best.q.name,companyKey:best.q.companyKey||null,currency:best.q.currency||null,matchConfidence:+best.score.toFixed(3)});
}
const byKey=new Map();for(const x of matched){const k=`${x.date}|${x.companyKey||x.symbol}`;const oldx=byKey.get(k);if(!oldx||x.matchConfidence>oldx.matchConfidence)byKey.set(k,x)}
const rows=[...byKey.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)).slice(0,80),quotes=new Map();
for(let i=0;i<rows.length;i+=35)for(const q of await quoteBatch(rows.slice(i,i+35).map(x=>x.symbol)))quotes.set(String(q.symbol||'').toUpperCase(),q);
const oldMap=new Map((old?.events||[]).map(x=>[`${x.date}|${x.symbol}`,x])),events=rows.map(x=>{const f=fundamentalFromQuote(quotes.get(x.symbol)||{},oldMap.get(`${x.date}|${x.symbol}`));const seeded=scoreAgmOpportunity({...x,...f},{now:Date.now()});return{...x,...f,daysUntil:dayDiff(x.date),baseLabel:seeded.label,source:'finanzen.net Hauptversammlung'}});
const out={version:1,modelVersion:27.6,updatedAt:new Date().toISOString(),nextRefreshAfter:new Date(Date.now()+23*3600000).toISOString(),refreshCadence:'daily',source:'finanzen.net Hauptversammlung',sourceUrls:SOURCES,sourceErrors:errors,rawUpcomingCount:dedup.size,matchedUpcomingCount:events.length,universeGeneratedAt:universe?.generated_at||null,scoreMeaning:'0-100 interner Vorab-Chancen-Score; keine Gewinnwahrscheinlichkeit',events};
fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({ok:true,updatedAt:out.updatedAt,rawUpcomingCount:out.rawUpcomingCount,matchedUpcomingCount:out.matchedUpcomingCount,sourceErrors:errors.length},null,2));
