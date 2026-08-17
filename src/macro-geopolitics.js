import {clamp,num,nowIso,chunks} from './constants.js';

const HEADERS={'accept':'application/rss+xml,application/xml,text/xml,application/json,text/html;q=0.8,*/*;q=0.5','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/4.3)'};
const MAX_EVENTS=120;
const MAX_CURRENT=12;
const PROXIES=['ACWI','SPY','QQQ','^VIX','CL=F','GC=F','^TNX','XLE','XLI','ITA','JETS','XLRE','SMH'];
const HORIZONS=[['1h',60],['6h',360],['18h',1080]];

const FEEDS=[
 {source:'Federal Reserve',official:true,url:'https://www.federalreserve.gov/feeds/press_monetary.xml'},
 {source:'ECB',official:true,url:'https://www.ecb.europa.eu/rss/press.html'},
 {source:'Eurostat',official:true,url:'https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/en/statistics-update.rss'}
];

const EXPECTED={
 WAR_ESCALATION:{label:'Krieg / Eskalation',beneficiaries:['Verteidigung','Energie','Gold / sichere Häfen'],headwinds:['Airlines','zyklische Aktien'],proxies:[['^VIX',1,1.2],['GC=F',1,1],['CL=F',1,.9],['ITA',1,1],['ACWI',-1,.8]]},
 CEASEFIRE:{label:'Waffenruhe / Deeskalation',beneficiaries:['Weltaktien','Airlines','zyklische Aktien'],headwinds:['Krisenprämie Verteidigung','Gold / Öl-Krisenprämie'],proxies:[['^VIX',-1,1.1],['ACWI',1,1],['JETS',1,.8],['GC=F',-1,.6],['ITA',-1,.5]]},
 SANCTIONS:{label:'Sanktionen / Exportverbote',beneficiaries:['lokale Ersatzanbieter','ausgewählte Rohstoffe'],headwinds:['betroffene Exportbranchen','globale Lieferketten'],proxies:[['^VIX',1,1],['ACWI',-1,.7],['CL=F',1,.5]]},
 TRADE_TARIFF:{label:'Zölle / Handelskonflikt',beneficiaries:['lokale geschützte Anbieter'],headwinds:['Halbleiter','globale Industrie','Weltaktien'],proxies:[['^VIX',1,1],['SMH',-1,.9],['XLI',-1,.7],['ACWI',-1,.8]]},
 ENERGY_SUPPLY:{label:'Energie-Angebotsschock',beneficiaries:['Energieproduzenten'],headwinds:['Airlines','energieintensive Industrie'],proxies:[['CL=F',1,1.2],['XLE',1,1],['JETS',-1,.9],['XLI',-1,.5]]},
 MONETARY_HAWKISH:{label:'Straffere Geldpolitik',beneficiaries:['Cash / kurze Laufzeiten'],headwinds:['hoch bewertete Wachstumswerte','Immobilien'],proxies:[['^TNX',1,1],['QQQ',-1,.9],['XLRE',-1,.9],['^VIX',1,.5]]},
 MONETARY_DOVISH:{label:'Lockerere Geldpolitik',beneficiaries:['Wachstumswerte','Immobilien'],headwinds:['Renditen / Zinsvorteil Cash'],proxies:[['^TNX',-1,1],['QQQ',1,.9],['XLRE',1,.9],['ACWI',1,.6]]},
 INFLATION_HOT:{label:'Inflation höher als erwartet',beneficiaries:['teils Rohstoffe / Value'],headwinds:['lange Duration','hoch bewertete Growth-Aktien'],proxies:[['^TNX',1,1],['QQQ',-1,.8],['GC=F',1,.4],['^VIX',1,.5]]},
 INFLATION_COOL:{label:'Inflation niedriger als erwartet',beneficiaries:['Wachstumswerte','Immobilien'],headwinds:['Inflationsschutz-Prämie'],proxies:[['^TNX',-1,1],['QQQ',1,.8],['XLRE',1,.7],['ACWI',1,.5]]},
 GROWTH_STRONG:{label:'Wachstum / Arbeitsmarkt stark',beneficiaries:['Industrie','zyklische Aktien'],headwinds:['Zinssensitive Titel bei zu starker Nachfrage'],proxies:[['XLI',1,1],['ACWI',1,.8],['^TNX',1,.4]]},
 GROWTH_WEAK:{label:'Wachstum / Arbeitsmarkt schwach',beneficiaries:['defensive / sichere Anlagen'],headwinds:['Industrie','Weltaktien'],proxies:[['XLI',-1,1],['ACWI',-1,.8],['^VIX',1,.8]]},
 OTHER:{label:'Globales Ereignis',beneficiaries:[],headwinds:[],proxies:[['ACWI',0,.1],['^VIX',0,.1]]}
};

const clean=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const low=s=>clean(s).toLowerCase();
const hash=s=>{let h=2166136261;for(const ch of String(s||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
const tokens=s=>new Set(low(s).replace(/[^a-z0-9äöüß]+/gi,' ').split(/\s+/).filter(x=>x.length>3&&!['with','from','that','this','after','über','einer','einem','einen','gegen','durch','amid','says'].includes(x)));
function similarity(a,b){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n)}

function parseFeed(xml,source,official){
 const out=[];
 for(const m of String(xml||'').matchAll(/<(item|entry)>([\s\S]*?)<\/\1>/gi)){
  const b=m[2],title=clean(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const date=clean(b.match(/<(?:pubDate|updated|published|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|updated|published|dc:date)>/i)?.[1]);
  if(title)out.push({title,source,official,publishedAt:date&&Number.isFinite(Date.parse(date))?new Date(date).toISOString():nowIso()});
 }
 return out.slice(0,40);
}

async function fetchFeed(f){
 const started=Date.now();
 try{const r=await fetch(f.url,{headers:HEADERS,redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const rows=parseFeed(await r.text(),f.source,f.official);return{source:f.source,ok:rows.length>0,latencyMs:Date.now()-started,rows,error:rows.length?'':'keine lesbaren Meldungen'}}
 catch(e){return{source:f.source,ok:false,latencyMs:Date.now()-started,rows:[],error:String(e?.message||e).slice(0,160)}}
}

async function fetchGdelt(){
 const started=Date.now();
 try{
  const u=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  u.searchParams.set('query','(war OR conflict OR missile OR sanctions OR ceasefire OR invasion OR attack OR tariff OR embargo OR airstrike)');
  u.searchParams.set('mode','artlist');u.searchParams.set('maxrecords','50');u.searchParams.set('format','json');u.searchParams.set('sort','hybridrel');u.searchParams.set('timespan','24h');
  const r=await fetch(u,{headers:{...HEADERS,accept:'application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json();
  const rows=(j?.articles||[]).map(x=>({title:clean(x.title),source:`GDELT/${clean(x.domain||'News')}`,official:false,publishedAt:x.seendate&&Number.isFinite(Date.parse(x.seendate))?new Date(x.seendate).toISOString():nowIso()})).filter(x=>x.title).slice(0,50);
  return{source:'GDELT',ok:rows.length>0,latencyMs:Date.now()-started,rows,error:rows.length?'':'keine lesbaren Meldungen'};
 }catch(e){return{source:'GDELT',ok:false,latencyMs:Date.now()-started,rows:[],error:String(e?.message||e).slice(0,160)}}
}

function category(title,source=''){
 const h=low(title),src=low(source),has=(...a)=>a.some(x=>h.includes(x));
 if(has('ceasefire','truce','peace deal','peace agreement','waffenruhe','waffenstillstand','friedensabkommen','de-escalat'))return'CEASEFIRE';
 if(has('missile','airstrike','air strike','invasion','attack','attacks','war ','krieg','eskalation','escalation','military strike','bombing','drone strike'))return'WAR_ESCALATION';
 if(has('sanction','embargo','export ban','export restriction','sanktion','exportverbot'))return'SANCTIONS';
 if(has('tariff','trade war','zoll','zölle','handelskonflikt','import duty'))return'TRADE_TARIFF';
 if(has('oil supply','gas supply','pipeline','opec','oil output','energy supply','ölversorgung','gasversorgung','förderkürzung','production cut'))return'ENERGY_SUPPLY';
 if(src.includes('federal reserve')||src.includes('ecb')||has('interest rate','policy rate','monetary policy','fomc','deposit facility','leitzins','geldpolitik')){
  if(has('rate cut','cuts rates','lower rates','easing','dovish','zinssenk','locker'))return'MONETARY_DOVISH';
  if(has('rate hike','raises rates','higher for longer','tightening','hawkish','zinserhöh','straff'))return'MONETARY_HAWKISH';
  return'OTHER';
 }
 if(has('inflation','consumer price','cpi','hicp','verbraucherpreis')){
  if(has('lower','slows','slowing','falls','decline','below','niedriger','sinkt','rückgang'))return'INFLATION_COOL';
  if(has('higher','rises','accelerates','above','hot','höher','steigt','anstieg'))return'INFLATION_HOT';
 }
 if(has('gdp','growth','employment','jobs','unemployment','industrial production','bip','wachstum','arbeitsmarkt','beschäftigung')){
  if(has('weak','weaker','falls','decline','contraction','recession','unemployment rises','schwach','sinkt','rezession'))return'GROWTH_WEAK';
  if(has('strong','stronger','rises','expands','beats','stark','steigt','übertrifft'))return'GROWTH_STRONG';
 }
 return'OTHER';
}

function severity(title,cat,official,sources=1){
 const h=low(title);let s=cat==='OTHER'?20:45;if(official)s+=12;if(sources>=2)s+=10;if(sources>=4)s+=8;
 if(/emergency|unexpected|surprise|invasion|missile|airstrike|war |krieg|state of emergency|crisis|notfall|unerwart/.test(h))s+=14;
 return clamp(Math.round(s),0,100);
}

function cluster(rows){
 const sorted=rows.filter(x=>Date.now()-(Date.parse(x.publishedAt)||Date.now())<48*3600000).sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));
 const groups=[];
 for(const x of sorted){const cat=category(x.title,x.source);if(cat==='OTHER'&&!x.official)continue;let g=groups.find(y=>y.category===cat&&similarity(y.headline,x.title)>=.28);if(!g){g={id:`${cat}:${hash(x.title)}`,category:cat,headline:x.title,publishedAt:x.publishedAt,sources:[],officialSources:0,titles:[]};groups.push(g)}g.sources.push(x.source);g.titles.push(x.title);if(x.official)g.officialSources++;if((Date.parse(x.publishedAt)||0)>(Date.parse(g.publishedAt)||0)){g.headline=x.title;g.publishedAt=x.publishedAt}}
 for(const g of groups){g.sources=[...new Set(g.sources)].slice(0,8);g.severity=severity(g.headline,g.category,g.officialSources>0,g.sources.length);const e=EXPECTED[g.category]||EXPECTED.OTHER;g.label=e.label;g.beneficiaries=e.beneficiaries;g.headwinds=e.headwinds}
 return groups.sort((a,b)=>b.severity-a.severity||(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)).slice(0,MAX_CURRENT);
}

async function proxySnapshot(){
 const out={};
 for(const batch of chunks(PROXIES,30)){
  try{const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');u.searchParams.set('symbols',batch.join(','));u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');const r=await fetch(u,{headers:{accept:'application/json','user-agent':HEADERS['user-agent']}});if(!r.ok)continue;const j=await r.json();for(const item of j?.spark?.result||[]){const res=item?.response?.[0];if(!res)continue;const meta=res.meta||{},sym=String(item.symbol||meta.symbol||'').toUpperCase(),cl=(res?.indicators?.quote?.[0]?.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number);if(!sym||!cl.length)continue;const price=num(meta.regularMarketPrice,cl.at(-1)),prev=num(meta.previousClose,cl[0]),back=cl[Math.max(0,cl.length-7)],ts=num(meta.regularMarketTime,0);out[sym]={price,dayPct:prev?(price/prev-1)*100:0,mom30Pct:back?(price/back-1)*100:0,ts,fresh:ts>0&&(Date.now()/1000-ts)<45*60}}}catch{}
 }
 return out;
}

function confirmation(event,snap){
 const cfg=EXPECTED[event.category]||EXPECTED.OTHER;let weighted=0,den=0,matched=0,available=0;const readings=[];
 for(const [sym,dir,w] of cfg.proxies){const q=snap[sym];if(!q?.fresh||!Number.isFinite(q.mom30Pct))continue;available++;const move=clamp(num(q.mom30Pct),-4,4);const aligned=dir===0?0:move*dir;weighted+=aligned*w;den+=w;if(aligned>.08)matched++;readings.push({symbol:sym,movePct:move,expectedDirection:dir,alignedPct:aligned})}
 const raw=den?weighted/den:0,score=clamp(Math.round(50+raw*16+(available?matched/available*18:0)-9),0,100);
 return{score,alignedMovePct:raw,matched,available,confirmed:available>=2&&score>=62,readings:readings.slice(0,6)};
}

function emptyLearning(){return{version:1,events:[],categoryStats:{},updatedAt:null,summary:{evaluatedEvents:0,trustedCategories:[],notice:'Makro-Lernphase startet mit neuen Ereignissen.'}}}
function addLearningEvents(l,current,snap){const known=new Set(l.events.map(e=>e.id));for(const e of current){if(known.has(e.id))continue;const baseline={};for(const [sym] of (EXPECTED[e.category]||EXPECTED.OTHER).proxies){const q=snap[sym];if(q?.fresh&&q.price>0)baseline[sym]={price:q.price,ts:q.ts}};if(Object.keys(baseline).length<2)continue;l.events.push({id:e.id,category:e.category,headline:e.headline,sources:e.sources,publishedAt:e.publishedAt,severity:e.severity,baseline,startedAt:nowIso(),lastProxyTs:Math.max(...Object.values(baseline).map(x=>num(x.ts))),observedMinutes:0,results:{}});known.add(e.id)}l.events=l.events.slice(-MAX_EVENTS)}
function evaluateLearning(l,snap){for(const e of l.events){if(Object.keys(e.results||{}).length>=HORIZONS.length)continue;const cfg=EXPECTED[e.category]||EXPECTED.OTHER;const currentTs=Math.max(0,...cfg.proxies.map(([s])=>num(snap[s]?.ts)));if(!currentTs||currentTs<=num(e.lastProxyTs))continue;const freshCount=cfg.proxies.filter(([s])=>snap[s]?.fresh).length;if(freshCount<2)continue;e.observedMinutes+=Math.min(15,Math.max(1,(currentTs-num(e.lastProxyTs))/60));e.lastProxyTs=currentTs;let sum=0,den=0,n=0;for(const [sym,dir,w] of cfg.proxies){const b=e.baseline?.[sym],q=snap[sym];if(!b||!q?.fresh||!b.price||dir===0)continue;const ret=(q.price/b.price-1)*100;sum+=ret*dir*w;den+=w;n++}if(n<2||!den)continue;const aligned=sum/den;for(const [label,mins] of HORIZONS)if(e.observedMinutes>=mins&&!e.results[label])e.results[label]={at:nowIso(),alignedBasketPct:aligned,proxyCount:n}}
}
function rebuildLearning(l){const stats={};for(const e of l.events){const r=e.results?.['6h'];if(!r)continue;const x=stats[e.category]||(stats[e.category]={category:e.category,label:(EXPECTED[e.category]||EXPECTED.OTHER).label,samples:0,wins:0,sum:0});x.samples++;x.wins+=num(r.alignedBasketPct)>0?1:0;x.sum+=num(r.alignedBasketPct)}for(const x of Object.values(stats)){x.hitRate=(x.wins+4)/(x.samples+8);x.avgAlignedBasketPct=x.samples?x.sum/x.samples:0;x.reliabilityScore=clamp(Math.round(50+(x.hitRate-.5)*65+clamp(x.avgAlignedBasketPct,-3,3)*7),0,100);x.trusted=x.samples>=8;delete x.wins;delete x.sum}l.categoryStats=stats;l.updatedAt=nowIso();l.summary={evaluatedEvents:l.events.filter(e=>e.results?.['6h']).length,trustedCategories:Object.values(stats).filter(x=>x.trusted).sort((a,b)=>b.reliabilityScore-a.reliabilityScore).slice(0,8),notice:'Nur Kategorien mit mindestens 8 kausalen 6h-Auswertungen gelten als gelernter Zusatzhinweis; keine Kauf-/Verkaufsgarantie.'}}

export async function updateMacroGeopolitics(state){
 const results=await Promise.all([...FEEDS.map(fetchFeed),fetchGdelt()]);const rows=results.flatMap(x=>x.rows||[]),events=cluster(rows),snap=await proxySnapshot();
 for(const e of events)e.marketConfirmation=confirmation(e,snap);
 const learning=state.macroLearning&&typeof state.macroLearning==='object'?state.macroLearning:emptyLearning();learning.events=Array.isArray(learning.events)?learning.events:[];addLearningEvents(learning,events,snap);evaluateLearning(learning,snap);rebuildLearning(learning);
 const severityIndex=events.length?events.slice(0,6).reduce((a,e)=>a+e.severity*(e.marketConfirmation.confirmed?1:.55),0)/Math.min(6,events.length):0;
 state.macroRadar={updatedAt:nowIso(),severityIndex:Math.round(severityIndex),events,sourceHealth:results.map(x=>({source:x.source,status:x.ok?'OK':'DOWN',latencyMs:x.latencyMs,error:x.error||''})),marketProxies:Object.fromEntries(Object.entries(snap).map(([k,v])=>[k,{dayPct:v.dayPct,mom30Pct:v.mom30Pct,fresh:v.fresh}])),notice:'Makro-/Geopolitik-Radar: Ereignisse werden nicht direkt gehandelt. Gewicht entsteht erst aus Quellen, Marktbestätigung und – nach genügend Samples – kausal gelernter 6h-Wirkung.'};
 state.macroLearning=learning;return{radar:state.macroRadar,learning};
}

export function macroContext(state){
 const r=state?.macroRadar,l=state?.macroLearning;if(!r)return null;const trusted=new Map((l?.summary?.trustedCategories||[]).map(x=>[x.category,x]));
 return{updatedAt:r.updatedAt,severityIndex:r.severityIndex,events:(r.events||[]).slice(0,8).map(e=>({category:e.category,label:e.label,headline:e.headline,sources:e.sources,severity:e.severity,marketConfirmation:e.marketConfirmation,beneficiaries:e.beneficiaries,headwinds:e.headwinds,learned:trusted.get(e.category)||null})),learningNotice:l?.summary?.notice||'',rule:'Kein Makroereignis darf allein einen Trade auslösen. Nur als Zusatzsignal verwenden, wenn Kurs-/Trenddaten und Marktreaktion die These bestätigen.'};
}
