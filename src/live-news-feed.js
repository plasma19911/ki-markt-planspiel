import {classifyNewsImpact} from './news-impact-intelligence.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9äöüß]+/gi,' ').trim();
const LIVE_MAX_AGE_MS=2*60*60*1000;
const FUTURE_TOLERANCE_MS=5*60*1000;
const CACHE_MS=45*1000;
let cache={at:0,payload:null};

const EXTRA_FRESH_SOURCES=[
 {name:'tagesschau Unternehmen',url:'https://www.tagesschau.de/wirtschaft/unternehmen/index~rss2.xml'},
 {name:'tagesschau Technologie',url:'https://www.tagesschau.de/wirtschaft/technologie/index~rss2.xml'},
 {name:'Nasdaq Nordic',url:'https://api.news.eu.nasdaq.com/news/rss/nasdaqNordicNews'}
];
const MAJOR_NEWS_ALIASES=[
 ['NVDA','Nvidia',['nvidia']],['CRWD','CrowdStrike',['crowdstrike']],['ORCL','Oracle',['oracle']],['CRM','Salesforce',['salesforce']],
 ['MSFT','Microsoft',['microsoft']],['AAPL','Apple',['apple']],['AMZN','Amazon',['amazon']],['GOOGL','Alphabet / Google',['alphabet','google']],
 ['META','Meta Platforms',['meta platforms','facebook']],['TSLA','Tesla',['tesla']],['AVGO','Broadcom',['broadcom']],['AMD','AMD',['advanced micro devices',' amd ']],
 ['PLTR','Palantir',['palantir']],['PANW','Palo Alto Networks',['palo alto networks']],['NOW','ServiceNow',['servicenow']],['ADBE','Adobe',['adobe']]
];

function host(url){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return''}}
function sourceInfo(v){
 if(v&&typeof v==='object'){
  const url=clean(v.url||v.link||v.href),name=clean(v.name||v.source||v.publisher||v.domain);
  return{name:name||host(url)||'News-Quelle',url:/^https?:\/\//i.test(url)?url:null};
 }
 const s=clean(v);if(/^https?:\/\//i.test(s))return{name:host(s)||'News-Quelle',url:s};
 return{name:s||'News-Quelle',url:null};
}
function decodeXml(v){return clean(v).replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function xmlTag(block,names){for(const n of names){const m=String(block).match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`,'i'));if(m)return decodeXml(m[1])}return''}
function xmlLink(block){
 const text=xmlTag(block,['link']);if(/^https?:\/\//i.test(text))return text;
 const a=String(block).match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);if(a&&/^https?:\/\//i.test(a[1]))return decodeXml(a[1]);
 const g=xmlTag(block,['guid']);return /^https?:\/\//i.test(g)?g:null;
}
function parseFreshFeed(text,limit=100){
 const out=[],seen=new Set(),push=b=>{const headline=xmlTag(b,['title']),raw=xmlTag(b,['pubDate','dc:date','date','updated','published']),t=Date.parse(raw);if(headline.length<12||seen.has(norm(headline))||!Number.isFinite(t))return;seen.add(norm(headline));out.push({headline,publishedAt:new Date(t).toISOString(),url:xmlLink(b)})};
 for(const m of String(text||'').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){push(m[1]);if(out.length>=limit)break}
 if(out.length<limit)for(const m of String(text||'').matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)){push(m[1]);if(out.length>=limit)break}
 return out.slice(0,limit);
}
function publishedAt(row={}){
 const raw=row.publishedAt||row.published_at||row.pubDate||row.date||row.newsAt||row.news_at||row.ts||row.timestamp||row.latestAt||row.lastNewsAt||row.updatedAt||row.fetchedAt;
 const t=Date.parse(String(raw||''));return Number.isFinite(t)?new Date(t).toISOString():null;
}
function freshWallClock(iso,now=Date.now()){
 const t=Date.parse(String(iso||''));return Number.isFinite(t)&&t<=now+FUTURE_TOLERANCE_MS&&now-t>=-FUTURE_TOLERANCE_MS&&now-t<=LIVE_MAX_AGE_MS;
}
function importanceFor(headline,row={},published=null){
 const impact=classifyNewsImpact(headline),confidence=clamp(num(row.confidence,row.newsConfidence??row.news_confidence),0,1),raw=num(row.freshImpact,row.score??row.newsScore??row.news_score),age=published?Math.max(0,(Date.now()-Date.parse(published))/3600000):24;
 const freshBoost=age<=.25?16:age<=1?13:age<=2?9:0,signalBoost=Math.min(12,Math.abs(raw)*(Math.abs(raw)<=2?8:.12)),sourceBoost=row?._freshExternal?5:0;
 const score=clamp(Math.round(impact.impact*16+confidence*12+signalBoost+freshBoost+sourceBoost),0,100);
 return{score,label:score>=88?'SEHR HOCH':score>=72?'HOCH':score>=55?'WICHTIG':'RELEVANT',type:impact.type,direction:impact.direction,structural:impact.structural===true};
}
function rowHeadlines(row={}){return arr(row.headlineDetails).length?arr(row.headlineDetails):arr(row.headlines).length?arr(row.headlines):[row.headline||row.title||row.latestHeadline||row.text].filter(Boolean)}
function collectRows(s={}){
 const out=[];
 for(const r of arr(s.newsRadar))out.push({...r,_origin:'newsRadar'});
 for(const r of arr(s.candidates))if(rowHeadlines(r).length)out.push({...r,_origin:'candidate'});
 for(const r of arr(s.topPcCandidates))if(rowHeadlines(r).length)out.push({...r,_origin:'pcCandidate'});
 for(const r of arr(s?.investmentIntelligence?.dossiers))if(r.latestHeadline)out.push({...r,headline:r.latestHeadline,_origin:'dossier'});
 for(const r of arr(s.globalNews))if(rowHeadlines(r).length)out.push({...r,_origin:'globalNews'});
 return out;
}
async function universeData(env){
 try{const r=await env.ASSETS.fetch(new Request('https://assets.local/universe.json'));if(!r.ok)return{map:new Map(),rows:[]};const j=await r.json(),rows=[...arr(j.equities),...arr(j.etfs)];return{map:new Map(rows.map(x=>[key(x),x])),rows}}catch{return{map:new Map(),rows:[]}}
}
function displayName(symbol,row,meta){return clean(row?.name||row?.companyName||row?.tradeRepublicName||meta?.name||meta?.tradeRepublicName||symbol).replace(/ Registered Shs.*$/i,'')}
function addAffected(item,symbol,name){if(!symbol)return;const found=item.affected.find(x=>x.symbol===symbol);if(!found)item.affected.push({symbol,name:name||symbol})}
function companyTokens(name=''){
 const legal=new Set(['inc','incorporated','corp','corporation','company','co','plc','ag','se','sa','nv','ltd','limited','holding','holdings','group','registered','ordinary','shares','shs','class']);
 return norm(name).split(' ').filter(x=>x.length>=3&&!legal.has(x));
}
function buildMatchers(rows=[]){
 const out=[];
 for(const r of rows){const symbol=key(r),name=displayName(symbol,r,r),t=companyTokens(name);if(!symbol||!t.length)continue;const phrases=[];if(t.length>=2)phrases.push(`${t[0]} ${t[1]}`);if(t[0].length>=6)phrases.push(t[0]);out.push({symbol,name,phrases:[...new Set(phrases)]})}
 for(const [symbol,name,aliases] of MAJOR_NEWS_ALIASES)out.push({symbol,name,phrases:aliases.map(norm)});
 return out;
}
function affectedForHeadline(headline,matchers=[]){
 const t=` ${norm(headline)} `,hits=[];
 for(const m of matchers){let yes=false;for(const p of m.phrases){const q=norm(p);if(!q)continue;if(q.startsWith('amd ')||q==='amd'){if(/\bamd\b/i.test(t))yes=true}else if(t.includes(` ${q} `)||t.includes(` ${q}`)||t.includes(`${q} `))yes=true;if(yes)break}if(!yes&&m.symbol.length>=4&&new RegExp(`(^|[^A-Z0-9])${m.symbol.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}([^A-Z0-9]|$)`,'i').test(headline))yes=true;if(yes&&!hits.some(x=>x.symbol===m.symbol)){hits.push({symbol:m.symbol,name:m.name});if(hits.length>=8)break}}
 return hits;
}
async function fetchFreshSource(src){
 const started=Date.now();try{const signal=typeof AbortSignal?.timeout==='function'?AbortSignal.timeout(9000):undefined,r=await fetch(src.url,{headers:{accept:'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=.5','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/LiveNews)'},redirect:'follow',signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);const rows=parseFreshFeed(await r.text(),100);if(!rows.length)throw new Error('keine lesbaren Meldungen');return{name:src.name,url:src.url,ok:true,latencyMs:Date.now()-started,items:rows,error:null}}catch(e){return{name:src.name,url:src.url,ok:false,latencyMs:Date.now()-started,items:[],error:String(e?.message||e).slice(0,180)}}
}
function marketRelevantExternal(headline,source){if(source==='Nasdaq Nordic')return true;return /aktie|börse|boerse|unternehmen|konzern|quartal|umsatz|gewinn|prognose|übernahm|uebernahm|fusion|auftrag|investor|chip|ki\b|ai\b|software|bank|auto|energie|rüst|ruest|pharma|nvidia|oracle|salesforce|crowdstrike/i.test(headline)}

export async function buildLiveNewsFeed(p,env,{limit=12}={}){
 const now=Date.now();if(cache.payload&&now-cache.at<CACHE_MS)return cache.payload;
 const [s,universe,externalResults]=await Promise.all([p.status(),universeData(env),Promise.all(EXTRA_FRESH_SOURCES.map(fetchFreshSource))]),master=universe.map,matchers=buildMatchers(universe.rows),groups=new Map();let totalCollected=0,filteredTooOld=0,filteredUnknownTime=0;
 const add=(headline,when,row={},symbol='',name='',sources=[],url=null)=>{
  totalCollected++;if(!when){filteredUnknownTime++;return}if(!freshWallClock(when,now)){filteredTooOld++;return}const text=clean(headline);if(text.length<12)return;const imp=importanceFor(text,row,when),gk=norm(text).slice(0,260);if(!gk)return;let item=groups.get(gk);if(!item){item={id:gk.slice(0,80),headline:text,publishedAt:when,importance:imp.score,importanceLabel:imp.label,eventType:imp.type,direction:imp.direction,structural:imp.structural,affected:[],sources:[],url};groups.set(gk,item)}addAffected(item,symbol,name);for(const src of sources.map(sourceInfo).filter(x=>x?.name))if(!item.sources.some(x=>x.name===src.name&&x.url===src.url))item.sources.push(src);if(imp.score>item.importance){item.importance=imp.score;item.importanceLabel=imp.label;item.eventType=imp.type;item.direction=imp.direction;item.structural=imp.structural}if(when&&Date.parse(when)>Date.parse(item.publishedAt||0))item.publishedAt=when;if(!item.url&&url)item.url=url;
 };
 for(const row of collectRows(s)){
  const symbol=key(row),meta=master.get(symbol),name=displayName(symbol,row,meta),baseSources=arr(row.sources||row.newsSources).map(sourceInfo).filter(x=>x.name);
  for(const rawHeadline of rowHeadlines(row).slice(0,8)){
   const obj=rawHeadline&&typeof rawHeadline==='object'?rawHeadline:{},headline=clean(typeof rawHeadline==='string'?rawHeadline:obj.headline||obj.title||obj.text),when=publishedAt({...row,...obj}),direct=sourceInfo(obj.source||obj.publisher||obj.url||obj.link||null),url=/^https?:\/\//i.test(clean(obj.url||obj.link))?clean(obj.url||obj.link):null;
   add(headline,when,row,symbol,name,[...baseSources,...(direct?.name?[direct]:[])],url);
  }
 }
 for(const result of externalResults){for(const x of result.items){const when=publishedAt(x);if(!when){totalCollected++;filteredUnknownTime++;continue}if(!freshWallClock(when,now)){totalCollected++;filteredTooOld++;continue}if(!marketRelevantExternal(x.headline,result.name))continue;const affected=affectedForHeadline(x.headline,matchers);if(!affected.length&&result.name!=='Nasdaq Nordic')continue;const row={_freshExternal:true};if(affected.length){for(const a of affected)add(x.headline,when,row,a.symbol,a.name,[{name:result.name,url:x.url||result.url}],x.url)}else add(x.headline,when,row,'','',[{name:result.name,url:x.url||result.url}],x.url)}}
 let items=[...groups.values()].filter(x=>freshWallClock(x.publishedAt,now));items.sort((a,b)=>b.importance-a.importance||(Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)));const important=items.filter(x=>x.importance>=50),chosen=(important.length>=5?important:items).slice(0,clamp(limit,5,20)).map(x=>({...x,sources:x.sources.slice(0,5),affected:x.affected.slice(0,8)}));
 const sourceNames=[...new Set(chosen.flatMap(x=>x.sources.map(s=>s.name)).filter(Boolean))],times=chosen.map(x=>Date.parse(x.publishedAt)).filter(Number.isFinite),lastSourceScanAt=s?.config?.last_scan||s?.lastScan||s?.updatedAt||null;
 const payload={ok:true,generatedAt:new Date(now).toISOString(),lastSourceScanAt,externalFetchedAt:new Date(now).toISOString(),refreshSeconds:60,maxAgeMinutes:120,source:'KI-News-Radar + frische öffentliche RSS-Quellen',items:chosen,totalDetected:items.length,totalCollectedBeforeAgeFilter:totalCollected,filteredTooOld,filteredUnknownTime,newestNewsAt:times.length?new Date(Math.max(...times)).toISOString():null,oldestNewsAt:times.length?new Date(Math.min(...times)).toISOString():null,sourceCount:sourceNames.length,sourceNames,externalSources:externalResults.map(x=>({name:x.name,ok:x.ok,latencyMs:x.latencyMs,error:x.error})),notice:'Der sichtbare Live-Feed enthält ausschließlich Meldungen mit echtem Veröffentlichungszeitpunkt aus den letzten 120 Minuten. Der letzte Portfolio-News-Scan und der Feed-Abruf werden getrennt ausgewiesen.'};
 cache={at:now,payload};return payload;
}
