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
// ---------------------------------------------------------------------------
// V31.7.34 Nachrichtenbewertung: vier unabhaengige Achsen statt einer Zahl.
//
// Vorher wurden Ereignisschwere, Klassifikationssicherheit, Kurssignal, Alter
// und Quellenqualitaet additiv in EINEN Wert geworfen und am Ende auf 100
// geklammert. Folge: jede Meldung ab impact>=4 landete auf 100/100, fuenf
// voellig verschiedene Ereignisse waren ununterscheidbar, und die Richtung kam
// im Wert ueberhaupt nicht vor.
//
//   Relevanz      - geht es wirklich um diese Aktie?
//   Materialitaet - wie stark bewegt diese Ereignisklasse ueblicherweise?
//   Richtung      - stetig, mit eigener Konfidenz ("unbekannt" ist ausdrueckbar)
//   Aktualitaet   - getrennter Torwaechter, nie in die Wichtigkeit gemischt
//
// Materialitaet und Richtung greifen auf die GEMESSENEN Statistiken aus
// news-learning.js zurueck. Diese Rueckkopplung existierte, wurde aber nie
// angeschlossen: die Lernschleife hat ins Leere gemessen.
// ---------------------------------------------------------------------------

// Referenzbewegung, gegen die eine gemessene Durchschnittsbewegung normiert
// wird. 4 % abnormale Bewegung gilt als voll materiell.
const MATERIALITY_REFERENCE_MOVE_PCT=4;
// Empirisches Bayes-Gewicht: bei n Stichproben zaehlt die Messung n/(n+K).
// Bei 4 Beobachtungen dominiert noch die Annahme, ab ~30 die Messung.
const LEARNING_PRIOR_STRENGTH=10;

export function learnedTypeStats(state={},horizon='6h'){
 const out=new Map();
 const raw=state?.newsLearning?.typeStats;if(!raw||typeof raw!=='object')return out;
 for(const bucket of Object.values(raw)){
  const h=bucket?.horizons?.[horizon];if(!h)continue;
  const samples=num(h.samples);if(!(samples>0))continue;
  out.set(String(bucket.key||'').toUpperCase(),{
   samples,
   hitRate:num(h.hitRate,.5),
   avgAlignedPct:num(h.avgAlignedPct),
   avgAbsMovePct:num(h.avgAbsMovePct)
  });
 }
 return out;
}

function materialityOf(impact,learned){
 // Annahme aus der Ereignisklasse: impact 0..5 -> 0..1
 const prior=clamp(num(impact?.impact)/5,0,1);
 if(!learned||!(learned.samples>0))return{value:prior,basis:'ANNAHME',samples:0};
 const measured=clamp(num(learned.avgAbsMovePct)/MATERIALITY_REFERENCE_MOVE_PCT,0,1);
 const w=learned.samples/(learned.samples+LEARNING_PRIOR_STRENGTH);
 return{value:clamp(prior*(1-w)+measured*w,0,1),basis:w>=.5?'GEMESSEN':'GEMISCHT',samples:learned.samples};
}

function directionOf(impact,learned){
 const keyword=clamp(num(impact?.direction),-1,1);
 // Ohne Messung ist die Konfidenz bewusst niedrig: das Schluesselwort ist eine
 // Vermutung, kein Befund. Richtung 0 heisst "unbekannt", nicht "neutral".
 if(!learned||!(learned.samples>0))return{value:keyword,confidence:keyword===0?0:.45,basis:'SCHLUESSELWORT',samples:0};
 const w=learned.samples/(learned.samples+LEARNING_PRIOR_STRENGTH);
 // avgAlignedPct ist bereits richtungsbereinigt: positiv = Schluesselwort lag
 // richtig, negativ = die Meldung lief dem erwarteten Vorzeichen zuwider.
 const agreement=clamp(num(learned.avgAlignedPct)/2,-1,1);
 const value=clamp(keyword*(1-w)+keyword*agreement*w,-1,1);
 // hitRate 0.5 bedeutet Muenzwurf -> Konfidenz 0.
 const confidence=clamp(Math.abs(num(learned.hitRate,.5)-.5)*2*w+.45*(1-w),0,1);
 return{value,confidence:keyword===0?confidence*.5:confidence,basis:w>=.5?'GEMESSEN':'GEMISCHT',samples:learned.samples};
}

function freshnessOf(published){
 const age=published?Math.max(0,(Date.now()-Date.parse(published))/3600000):24;
 if(!Number.isFinite(age))return 0;
 return age<=.25?1:age<=1?.85:age<=2?.6:age<=6?.25:age<=12?.1:0;
}

function relevanceOf(row,sourceCount){
 const confidence=clamp(num(row?.confidence,row?.newsConfidence??row?.news_confidence),0,1);
 // Mehrfach bestaetigte Meldungen sind seltener Verwechslungen.
 const confirmation=sourceCount>=3?1:sourceCount===2?.85:.65;
 const external=row?._freshExternal?1:.92;
 return clamp((.45+.55*confidence)*confirmation*external,0,1);
}

function importanceFor(headline,row={},published=null,learnedStats=null){
 const impact=classifyNewsImpact(headline);
 const learned=learnedStats instanceof Map?learnedStats.get(String(impact.type||'').toUpperCase()):null;
 const materiality=materialityOf(impact,learned);
 const direction=directionOf(impact,learned);
 const relevance=relevanceOf(row,arr(row?.sources).length||1);
 const freshness=freshnessOf(published);
 // Wichtigkeit = Relevanz x Materialitaet. Alter fliesst bewusst NICHT ein:
 // eine wichtige Meldung wird nicht unwichtig, nur weil sie aeltert.
 const score=clamp(Math.round(relevance*materiality.value*100),0,100);
 // Fuer die Handelslogik zaehlt die vorzeichenbehaftete Erwartung.
 const expected=+(direction.value*direction.confidence*materiality.value*relevance*100).toFixed(1);
 const magnitude=score>=70?'SEHR HOCH':score>=52?'HOCH':score>=32?'WICHTIG':'RELEVANT';
 const directionLabel=direction.value>.08?'POSITIV':direction.value<-.08?'NEGATIV':'RICHTUNG OFFEN';
 return{
  score,
  label:`${magnitude} · ${directionLabel}`,
  magnitudeLabel:magnitude,
  directionLabel,
  relevance:+relevance.toFixed(3),
  materiality:+materiality.value.toFixed(3),
  materialityBasis:materiality.basis,
  direction:+direction.value.toFixed(3),
  directionConfidence:+direction.confidence.toFixed(3),
  directionBasis:direction.basis,
  learnedSamples:materiality.samples,
  freshness:+freshness.toFixed(3),
  expectedValue:expected,
  type:impact.type,
  structural:impact.structural===true
 };
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
 const [s,universe,externalResults]=await Promise.all([p.status(),universeData(env),Promise.all(EXTRA_FRESH_SOURCES.map(fetchFreshSource))]),master=universe.map,matchers=buildMatchers(universe.rows),groups=new Map(),learnedStats=learnedTypeStats(s);let totalCollected=0,filteredTooOld=0,filteredUnknownTime=0;
 const add=(headline,when,row={},symbol='',name='',sources=[],url=null)=>{
  totalCollected++;if(!when){filteredUnknownTime++;return}if(!freshWallClock(when,now)){filteredTooOld++;return}const text=clean(headline);if(text.length<12)return;const imp=importanceFor(text,{...row,sources},when,learnedStats),gk=norm(text).slice(0,260);if(!gk)return;let item=groups.get(gk);if(!item){item={id:gk.slice(0,80),headline:text,publishedAt:when,importance:imp.score,importanceLabel:imp.label,magnitudeLabel:imp.magnitudeLabel,directionLabel:imp.directionLabel,relevance:imp.relevance,materiality:imp.materiality,materialityBasis:imp.materialityBasis,directionConfidence:imp.directionConfidence,directionBasis:imp.directionBasis,learnedSamples:imp.learnedSamples,freshness:imp.freshness,expectedValue:imp.expectedValue,eventType:imp.type,direction:imp.direction,structural:imp.structural,affected:[],sources:[],url};groups.set(gk,item)}addAffected(item,symbol,name);for(const src of sources.map(sourceInfo).filter(x=>x?.name))if(!item.sources.some(x=>x.name===src.name&&x.url===src.url))item.sources.push(src);if(imp.score>item.importance){item.importance=imp.score;item.importanceLabel=imp.label;item.magnitudeLabel=imp.magnitudeLabel;item.directionLabel=imp.directionLabel;item.relevance=imp.relevance;item.materiality=imp.materiality;item.materialityBasis=imp.materialityBasis;item.directionConfidence=imp.directionConfidence;item.directionBasis=imp.directionBasis;item.learnedSamples=imp.learnedSamples;item.freshness=imp.freshness;item.expectedValue=imp.expectedValue;item.eventType=imp.type;item.direction=imp.direction;item.structural=imp.structural}if(when&&Date.parse(when)>Date.parse(item.publishedAt||0))item.publishedAt=when;if(!item.url&&url)item.url=url;
 };
 for(const row of collectRows(s)){
  const symbol=key(row),meta=master.get(symbol),name=displayName(symbol,row,meta),baseSources=arr(row.sources||row.newsSources).map(sourceInfo).filter(x=>x.name);
  for(const rawHeadline of rowHeadlines(row).slice(0,8)){
   const obj=rawHeadline&&typeof rawHeadline==='object'?rawHeadline:{},headline=clean(typeof rawHeadline==='string'?rawHeadline:obj.headline||obj.title||obj.text),when=publishedAt({...row,...obj}),direct=sourceInfo(obj.source||obj.publisher||obj.url||obj.link||null),url=/^https?:\/\//i.test(clean(obj.url||obj.link))?clean(obj.url||obj.link):null;
   add(headline,when,row,symbol,name,[...baseSources,...(direct?.name?[direct]:[])],url);
  }
 }
 for(const result of externalResults){for(const x of result.items){const when=publishedAt(x);if(!when){totalCollected++;filteredUnknownTime++;continue}if(!freshWallClock(when,now)){totalCollected++;filteredTooOld++;continue}if(!marketRelevantExternal(x.headline,result.name))continue;const affected=affectedForHeadline(x.headline,matchers);if(!affected.length&&result.name!=='Nasdaq Nordic')continue;const row={_freshExternal:true};if(affected.length){for(const a of affected)add(x.headline,when,row,a.symbol,a.name,[{name:result.name,url:x.url||result.url}],x.url)}else add(x.headline,when,row,'','',[{name:result.name,url:x.url||result.url}],x.url)}}
 let items=[...groups.values()].filter(x=>freshWallClock(x.publishedAt,now));items.sort((a,b)=>(num(b.importance)*num(b.freshness,1))-(num(a.importance)*num(a.freshness,1))||(Date.parse(b.publishedAt||0)-Date.parse(a.publishedAt||0)));const important=items.filter(x=>x.importance>=32),chosen=(important.length>=5?important:items).slice(0,clamp(limit,5,20)).map(x=>({...x,sources:x.sources.slice(0,5),affected:x.affected.slice(0,8)}));
 const sourceNames=[...new Set(chosen.flatMap(x=>x.sources.map(s=>s.name)).filter(Boolean))],times=chosen.map(x=>Date.parse(x.publishedAt)).filter(Number.isFinite),lastSourceScanAt=s?.config?.last_scan||s?.lastScan||s?.updatedAt||null;
 const payload={ok:true,generatedAt:new Date(now).toISOString(),lastSourceScanAt,externalFetchedAt:new Date(now).toISOString(),refreshSeconds:60,maxAgeMinutes:120,source:'KI-News-Radar + frische öffentliche RSS-Quellen',items:chosen,totalDetected:items.length,totalCollectedBeforeAgeFilter:totalCollected,filteredTooOld,filteredUnknownTime,newestNewsAt:times.length?new Date(Math.max(...times)).toISOString():null,oldestNewsAt:times.length?new Date(Math.min(...times)).toISOString():null,sourceCount:sourceNames.length,sourceNames,externalSources:externalResults.map(x=>({name:x.name,ok:x.ok,latencyMs:x.latencyMs,error:x.error})),notice:'Der sichtbare Live-Feed enthält ausschließlich Meldungen mit echtem Veröffentlichungszeitpunkt aus den letzten 120 Minuten. Der letzte Portfolio-News-Scan und der Feed-Abruf werden getrennt ausgewiesen.'};
 cache={at:now,payload};return payload;
}
