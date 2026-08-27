import {classifyNewsImpact} from './news-impact-intelligence.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9äöüß]+/gi,' ').trim();
let cache={at:0,payload:null};

function sourceInfo(v){
 if(v&&typeof v==='object'){
  const url=clean(v.url||v.link||v.href),name=clean(v.name||v.source||v.publisher||v.domain);
  return{name:name||host(url)||'News-Quelle',url:/^https?:\/\//i.test(url)?url:null};
 }
 const s=clean(v);if(/^https?:\/\//i.test(s))return{name:host(s)||'News-Quelle',url:s};
 return{name:s||'News-Quelle',url:null};
}
function host(url){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return''}}
function publishedAt(row={},fallback=null){
 const raw=row.publishedAt||row.published_at||row.pubDate||row.date||row.ts||row.timestamp||row.latestAt||row.lastNewsAt||row.updatedAt||row.fetchedAt;
 const t=Date.parse(String(raw||''));if(Number.isFinite(t))return new Date(t).toISOString();
 const age=num(row.newsTradingAgeHours,row.tradingAgeHours);if(age>0&&age<168)return new Date(Date.now()-age*3600000).toISOString();
 const f=Date.parse(String(fallback||''));return Number.isFinite(f)?new Date(f).toISOString():null;
}
function importanceFor(headline,row={},published=null){
 const impact=classifyNewsImpact(headline),confidence=clamp(num(row.confidence,row.newsConfidence??row.news_confidence),0,1),raw=num(row.freshImpact,row.score??row.newsScore??row.news_score),age=published?Math.max(0,(Date.now()-Date.parse(published))/3600000):24;
 const freshBoost=age<=1?12:age<=3?8:age<=8?4:0,signalBoost=Math.min(12,Math.abs(raw)*(Math.abs(raw)<=2?8:.12));
 const score=clamp(Math.round(impact.impact*16+confidence*12+signalBoost+freshBoost),0,100);
 return{score,label:score>=88?'SEHR HOCH':score>=72?'HOCH':score>=55?'WICHTIG':'RELEVANT',type:impact.type,direction:impact.direction,structural:impact.structural===true};
}
function rowHeadlines(row={}){return arr(row.headlines).length?arr(row.headlines):[row.headline||row.title||row.latestHeadline||row.text].filter(Boolean)}
function collectRows(s={}){
 const out=[];
 for(const r of arr(s.newsRadar))out.push({...r,_origin:'newsRadar'});
 for(const r of arr(s.candidates))if(rowHeadlines(r).length)out.push({...r,_origin:'candidate'});
 for(const r of arr(s.topPcCandidates))if(rowHeadlines(r).length)out.push({...r,_origin:'pcCandidate'});
 for(const r of arr(s?.investmentIntelligence?.dossiers))if(r.latestHeadline)out.push({...r,headline:r.latestHeadline,_origin:'dossier'});
 for(const r of arr(s.globalNews))if(key(r)&&rowHeadlines(r).length)out.push({...r,_origin:'globalNews'});
 return out;
}
async function universeMap(env){
 try{const r=await env.ASSETS.fetch(new Request('https://assets.local/universe.json'));if(!r.ok)return new Map();const j=await r.json(),rows=[...arr(j.equities),...arr(j.etfs)];return new Map(rows.map(x=>[key(x),x]))}catch{return new Map()}
}
function displayName(symbol,row,meta){return clean(row?.name||row?.companyName||row?.tradeRepublicName||meta?.name||meta?.tradeRepublicName||symbol).replace(/ Registered Shs.*$/i,'')}
function addAffected(item,symbol,name){if(!symbol)return;const found=item.affected.find(x=>x.symbol===symbol);if(!found)item.affected.push({symbol,name:name||symbol})}

export async function buildLiveNewsFeed(p,env,{limit=12}={}){
 const now=Date.now();if(cache.payload&&now-cache.at<45000)return cache.payload;
 const [s,master]=await Promise.all([p.status(),universeMap(env)]),fallback=s?.config?.last_scan||s?.lastScan||s?.updatedAt||new Date().toISOString(),groups=new Map();
 for(const row of collectRows(s)){
  const symbol=key(row);if(!symbol)continue;const meta=master.get(symbol),name=displayName(symbol,row,meta),sources=arr(row.sources||row.newsSources).map(sourceInfo).filter(x=>x.name);
  for(const rawHeadline of rowHeadlines(row).slice(0,4)){
   const headline=clean(typeof rawHeadline==='string'?rawHeadline:rawHeadline?.headline||rawHeadline?.title||rawHeadline?.text);if(headline.length<12)continue;
   const objectHeadline=rawHeadline&&typeof rawHeadline==='object'?rawHeadline:{};
   const when=publishedAt({...row,...objectHeadline},fallback),imp=importanceFor(headline,row,when),gk=norm(headline).slice(0,260);if(!gk)continue;
   const directSource=sourceInfo(objectHeadline.source||objectHeadline.publisher||objectHeadline.url||objectHeadline.link||null),url=/^https?:\/\//i.test(clean(objectHeadline.url||objectHeadline.link))?clean(objectHeadline.url||objectHeadline.link):null;
   let item=groups.get(gk);
   if(!item){item={id:gk.slice(0,80),headline,publishedAt:when,importance:imp.score,importanceLabel:imp.label,eventType:imp.type,direction:imp.direction,structural:imp.structural,affected:[],sources:[],url};groups.set(gk,item)}
   addAffected(item,symbol,name);
   for(const src of [...sources,directSource].filter(x=>x?.name))if(!item.sources.some(x=>x.name===src.name&&x.url===src.url))item.sources.push(src);
   if(imp.score>item.importance){item.importance=imp.score;item.importanceLabel=imp.label;item.eventType=imp.type;item.direction=imp.direction;item.structural=imp.structural}
   if(when&&(!item.publishedAt||Date.parse(when)>Date.parse(item.publishedAt)))item.publishedAt=when;
   if(!item.url&&url)item.url=url;
  }
 }
 let items=[...groups.values()];
 items.sort((a,b)=>b.importance-a.importance||(Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)));
 const important=items.filter(x=>x.importance>=50),chosen=(important.length>=5?important:items).slice(0,clamp(limit,5,20)).map(x=>({...x,sources:x.sources.slice(0,4),affected:x.affected.slice(0,8)}));
 const payload={ok:true,generatedAt:new Date().toISOString(),refreshSeconds:60,source:'KI-News-Radar',items:chosen,totalDetected:items.length,notice:'Priorisiert nach Ereignisart, News-Signal, Konfidenz und Aktualität. Betroffene Aktien öffnen direkt den Live-Kurschart.'};
 cache={at:now,payload};return payload;
}
