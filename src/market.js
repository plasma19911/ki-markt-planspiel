import {CORE_ETFS,LEVERAGED_ETFS,SPARK_BATCH,DEEP_LIMIT,NEWS_LIMIT,NEWS_RADAR_BATCH,POS_WORDS,NEG_WORDS,clamp,num,chunks} from './constants.js';
import {PRIORITY_EQUITIES} from './priority-equities.js';

const headers={'accept':'application/json','user-agent':'Mozilla/5.0'};
const secHeaders={'accept':'application/atom+xml,text/xml,application/xml','user-agent':'ki-markt-planspiel/2.0 (contact via https://github.com/plasma19911/ki-markt-planspiel)'};
const POS_PHRASES=['contract award','awarded contract','wins contract','selected for','raises guidance','raised guidance','beats estimates','beat estimates','record orders','record backlog','backlog growth','approval granted','strategic partnership','new customer','buyback','dividend increase','upgraded to buy','price target raised','funding secured','production increase'];
const NEG_PHRASES=['contract cancelled','contract canceled','loses contract','cuts guidance','cut guidance','misses estimates','missed estimates','investigation','regulatory probe','data breach','cyberattack','production delay','delivery delay','recall','downgraded to sell','price target cut','bankruptcy','default','fraud allegation','export ban'];

function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p;for(const v of a.slice(p))e=v*k+e*(1-k);return e}
function rsi(a,p=14){if(a.length<p+1)return null;let g=0,l=0,s=a.slice(-(p+1));for(let i=1;i<s.length;i++){let d=s[i]-s[i-1];d>0?g+=d:l-=d}if(!l)return 100;let rs=(g/p)/(l/p);return 100-100/(1+rs)}
function decodeText(x){return String(x||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function normalizeHeadline(x){return decodeText(x).toLowerCase().replace(/[^a-z0-9äöüß ]+/gi,' ').replace(/\s+/g,' ').trim().slice(0,180)}
function headlineSentiment(h){
 const text=String(h||'').toLowerCase();let s=0;
 for(const p of POS_PHRASES)if(text.includes(p))s+=.85;
 for(const p of NEG_PHRASES)if(text.includes(p))s-=.9;
 for(const w of text.replace(/[^a-z0-9]+/g,' ').split(/\s+/)){if(POS_WORDS.includes(w))s+=.18;if(NEG_WORDS.includes(w))s-=.18}
 return clamp(s,-2,2);
}
function recencyWeight(ts){if(!ts)return .55;const age=Math.max(0,Date.now()-Date.parse(ts));if(!Number.isFinite(age))return .55;const h=age/3600000;if(h<=3)return 1;if(h<=12)return .88;if(h<=24)return .72;if(h<=48)return .48;return .22}
function newsItems(xml){const out=[];for(const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)){const b=m[1],title=decodeText(b.match(/<title>([\s\S]*?)<\/title>/i)?.[1]),pub=decodeText(b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]);if(title)out.push({title,publishedAt:pub&&Number.isFinite(Date.parse(pub))?new Date(pub).toISOString():null})}return out.slice(0,8)}
function atomItems(xml){const out=[];for(const m of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/gi)){const b=m[1],title=decodeText(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),updated=decodeText(b.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1]);if(title)out.push({title:`SEC: ${title}`,publishedAt:updated&&Number.isFinite(Date.parse(updated))?new Date(updated).toISOString():null})}return out.slice(0,5)}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let i=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const x=i++;if(x>=items.length)return;try{out[x]=await fn(items[x])}catch{out[x]=null}}}));return out}

const SESSION_RULES=[
 [/\.DE$/,'Europe/Berlin',9*60,17*60+30,'Deutschland'],[/\.(PA|AS|BR|MI|MC)$/,'Europe/Paris',9*60,17*60+30,'Europa'],
 [/\.SW$/,'Europe/Zurich',9*60,17*60+30,'Schweiz'],[/\.L$/,'Europe/London',8*60,16*60+30,'London'],
 [/\.ST$/,'Europe/Stockholm',9*60,17*60+30,'Stockholm'],[/\.OL$/,'Europe/Oslo',9*60,16*60+30,'Oslo'],
 [/\.IS$/,'Europe/Istanbul',10*60,18*60,'Istanbul'],[/\.T$/,'Asia/Tokyo',9*60,15*60+30,'Tokio'],
 [/\.(KS|KQ)$/,'Asia/Seoul',9*60,15*60+30,'Seoul'],[/\.(TW|TWO)$/,'Asia/Taipei',9*60,13*60+30,'Taiwan'],
 [/\.HK$/,'Asia/Hong_Kong',9*60+30,16*60,'Hongkong'],[/\.(SS|SZ)$/,'Asia/Shanghai',9*60+30,15*60,'China'],
 [/\.(NS|BO)$/,'Asia/Kolkata',9*60+15,15*60+30,'Indien'],[/\.AX$/,'Australia/Sydney',10*60,16*60,'Australien'],
 [/\.(TO|V)$/,'America/Toronto',9*60+30,16*60,'Kanada'],[/\.SA$/,'America/Sao_Paulo',10*60,17*60,'Brasilien'],
 [/\.JO$/,'Africa/Johannesburg',9*60,17*60,'Suedafrika']
];
function sessionRule(info){for(const r of SESSION_RULES)if(r[0].test(info.symbol))return r;return [null,'America/New_York',9*60+30,16*60,'USA']}
function localParts(date,tz){const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),o={};for(const x of p)o[x.type]=x.value;return o}
function marketOpen(info,date=new Date()){
 const [,tz,open,close,label]=sessionRule(info),p=localParts(date,tz),days=['Mon','Tue','Wed','Thu','Fri'];
 if(!days.includes(p.weekday))return{open:false,label};const mins=num(p.hour)*60+num(p.minute);return{open:mins>=open&&mins<close,label};
}

export async function loadUniverse(env,cfg){
 let data={equities:[],generated_at:null};try{const r=await env.ASSETS.fetch(new Request('https://assets.local/universe.json'));if(r.ok)data=await r.json()}catch{}
 const all=(data.equities||[]).filter(x=>x?.symbol).map(x=>({symbol:String(x.symbol).toUpperCase(),name:x.name||x.symbol,type:'EQUITY',leverage:1,marketCap:num(x.marketCap),region:x.region||null,exchange:x.exchange||null}));
 all.push(...PRIORITY_EQUITIES);
 if(cfg.include_etfs)all.push(...CORE_ETFS);if(cfg.include_leverage)all.push(...LEVERAGED_ETFS);
 const seen=new Set(),out=[];for(const x of all){if(!seen.has(x.symbol)){seen.add(x.symbol);out.push(x)}}return{items:out,generatedAt:data.generated_at};
}

async function sparkBatch(symbols,lookup){
 const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');u.searchParams.set('symbols',symbols.join(','));u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
 const r=await fetch(u,{headers});if(!r.ok)throw new Error(`Yahoo Spark ${r.status}`);const j=await r.json(),out=[];
 for(const item of j?.spark?.result||[]){const res=item?.response?.[0];if(!res)continue;const m=res.meta||{},sym=String(item.symbol||m.symbol||'').toUpperCase(),info=lookup.get(sym);if(!info)continue;const c=(res?.indicators?.quote?.[0]?.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number);if(c.length<3)continue;const price=num(m.regularMarketPrice,c.at(-1)),prev=num(m.previousClose,c[0]),day=prev?(price/prev-1)*100:0,back=c[Math.max(0,c.length-4)],mom=back?(price/back-1)*100:0,age=m.regularMarketTime?Date.now()/1000-num(m.regularMarketTime):999999;out.push({...info,price,dayChange:day,preScore:day*.65+mom*1.35,fresh:age<35*60})}return out;
}
async function deepChart(info){
 const u=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(info.symbol)}`);u.searchParams.set('range','1d');u.searchParams.set('interval','1m');u.searchParams.set('includePrePost','false');
 const r=await fetch(u,{headers});if(!r.ok)return null;const j=await r.json(),res=j?.chart?.result?.[0];if(!res)return null;const q=res?.indicators?.quote?.[0]||{},cl=(q.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number),vol=(q.volume||[]).map(v=>num(v));if(cl.length<22)return null;
 const price=cl.at(-1),e9=ema(cl,9),e21=ema(cl,21),rr=rsi(cl),m5=(price/cl.at(-6)-1)*100,m20=(price/cl.at(-21)-1)*100,pclose=num(res.meta?.previousClose,cl[0]),day=pclose?(price/pclose-1)*100:0,vbase=vol.slice(-21,-1).filter(x=>x>0),vavg=vbase.length?vbase.reduce((a,b)=>a+b,0)/vbase.length:0,vr=vavg?num(vol.at(-1))/vavg:1,last=(res.timestamp||[]).at(-1)||res.meta?.regularMarketTime||0,fresh=Date.now()/1000-last<35*60;
 let score=0,reason=[];if(e9&&e21&&e9>e21){score+=1.7;reason.push('EMA9 > EMA21')}else{score-=1;reason.push('EMA-Trend schwach')}if(e21&&price>e21)score+=.8;else score-=.6;if(rr!==null){if(rr>=48&&rr<=68){score+=1;reason.push(`RSI ${rr.toFixed(0)}`)}else if(rr>=78){score-=1.5;reason.push(`RSI ${rr.toFixed(0)} ueberhitzt`)}else if(rr<=32)score-=.8}if(m5>.18){score+=.8;reason.push(`5m +${m5.toFixed(2)}%`)}else if(m5<-.25)score-=.9;if(m20>.5){score+=1.2;reason.push(`20m +${m20.toFixed(2)}%`)}else if(m20<-.5)score-=1.2;if(vr>1.5){score+=.7;reason.push(`Volumen x${vr.toFixed(1)}`)}if(day>1)score+=.4;if(day<-1)score-=.5;return{...info,price,score,dayChange:day,momentum5:m5,momentum20:m20,rsi:rr,volumeRatio:vr,newsScore:0,newsConfidence:0,newsSources:[],fresh,reasons:reason,headlines:[]};
}

async function yahooNews(c){try{const u=new URL('https://feeds.finance.yahoo.com/rss/2.0/headline');u.searchParams.set('s',c.symbol);u.searchParams.set('region','US');u.searchParams.set('lang','en-US');const r=await fetch(u,{headers:{'user-agent':'Mozilla/5.0'}});if(!r.ok)return[];return newsItems(await r.text()).map(x=>({...x,source:'Yahoo',weight:1}))}catch{return[]}}
async function gdeltNews(c){try{const u=new URL('https://api.gdeltproject.org/api/v2/doc/doc');u.searchParams.set('query',`"${String(c.name||c.symbol).replace(/"/g,'')}"`);u.searchParams.set('mode','ArtList');u.searchParams.set('maxrecords','8');u.searchParams.set('format','json');u.searchParams.set('timespan','2d');u.searchParams.set('sort','HybridRel');const r=await fetch(u,{headers});if(!r.ok)return[];const j=await r.json();return(j?.articles||[]).slice(0,8).map(a=>({title:decodeText(a.title),publishedAt:a.seendate&&Number.isFinite(Date.parse(a.seendate))?new Date(a.seendate).toISOString():null,source:`GDELT/${a.domain||'Web'}`,weight:1.05})).filter(x=>x.title)}catch{return[]}}
function isSecCandidate(c){return c.type==='EQUITY'&&!c.symbol.includes('.')&&/^[A-Z][A-Z0-9-]{0,7}$/.test(c.symbol)}
async function secNews(c){if(!isSecCandidate(c))return[];try{const u=new URL('https://www.sec.gov/cgi-bin/browse-edgar');u.searchParams.set('action','getcompany');u.searchParams.set('CIK',c.symbol);u.searchParams.set('owner','exclude');u.searchParams.set('count','5');u.searchParams.set('output','atom');const r=await fetch(u,{headers:secHeaders});if(!r.ok)return[];return atomItems(await r.text()).map(x=>({...x,source:'SEC/EDGAR',weight:1.2}))}catch{return[]}}
function aggregateNews(...sets){
 const seen=new Set(),items=[];for(const set of sets.flat()){if(!set?.title)continue;const k=normalizeHeadline(set.title);if(!k||seen.has(k))continue;seen.add(k);items.push(set)}
 items.sort((a,b)=>(Date.parse(b.publishedAt||0)||0)-(Date.parse(a.publishedAt||0)||0));
 let weighted=0,den=0;const sourceSet=new Set();for(const x of items){const w=(x.weight||1)*recencyWeight(x.publishedAt),s=headlineSentiment(x.title);weighted+=s*w;den+=w;sourceSet.add(String(x.source||'News').split('/')[0])}
 let score=den?weighted/den:0;if(sourceSet.size>=2&&Math.abs(score)>.15)score*=Math.min(1.35,1+.08*(sourceSet.size-1));score=clamp(score,-2,2);
 const confidence=clamp((items.length?0.28:0)+Math.min(.32,items.length*.035)+Math.min(.3,sourceSet.size*.1),0,1);
 return{score,confidence,headlines:items.slice(0,8).map(x=>x.title),latestAt:items[0]?.publishedAt||null,sources:[...sourceSet],items};
}
function rotate(pool,count,seed){if(!pool.length||!count)return[];const start=(seed*count)%pool.length,out=[];for(let i=0;i<Math.min(count,pool.length);i++)out.push(pool[(start+i)%pool.length]);return out}
function rotatingRadar(items){const minute=Math.floor(Date.now()/60000),priority=items.filter(x=>x.priority),regular=items.filter(x=>!x.priority),a=Math.min(Math.ceil(NEWS_RADAR_BATCH/2),priority.length),b=NEWS_RADAR_BATCH-a;return[...rotate(priority,a,minute),...rotate(regular,b,minute+17)]}

export async function scanMarket(env,cfg,heldSymbols=[]){
 const uni=await loadUniverse(env,cfg),now=new Date(),states=uni.items.map(x=>({item:x,state:marketOpen(x,now)})),openItems=states.filter(x=>x.state.open).map(x=>x.item),activeMarkets=[...new Set(states.filter(x=>x.state.open).map(x=>x.state.label))],newsOnly=openItems.length===0,lookup=new Map(uni.items.map(x=>[x.symbol,x])),coarse=[];

 // KURSE NUR fuer aktuell regulaer geoeffnete Handelsplaetze.
 for(const batch of chunks(openItems.map(x=>x.symbol),SPARK_BATCH)){try{coarse.push(...await sparkBatch(batch,lookup))}catch{}}
 const selected=coarse.filter(x=>x.fresh).sort((a,b)=>b.preScore-a.preScore).slice(0,DEEP_LIMIT);
 for(const sym of heldSymbols){const inf=lookup.get(sym);if(inf&&marketOpen(inf,now).open&&!selected.some(x=>x.symbol===sym)){const x=coarse.find(v=>v.symbol===sym)||inf;if(x)selected.push(x)}}
 const deep=(await mapLimit(selected,6,deepChart)).filter(Boolean).sort((a,b)=>b.score-a.score);

 const deepNewsTargets=deep.slice(0,NEWS_LIMIT);for(const c of deep.filter(x=>heldSymbols.includes(x.symbol))){if(!deepNewsTargets.some(x=>x.symbol===c.symbol)&&deepNewsTargets.length<NEWS_LIMIT+3)deepNewsTargets.push(c)}
 const radarTargets=rotatingRadar(uni.items),allNewsTargets=[];for(const c of [...deepNewsTargets,...radarTargets])if(!allNewsTargets.some(x=>x.symbol===c.symbol))allNewsTargets.push(c);

 // Yahoo fuer alle ausgewaehlten News-Ziele; GDELT/SEC breiter im NEWS-ONLY-Modus,
 // waehrend offener Maerkte nur fuer die wichtigsten Kandidaten, um Cloudflare-Limits einzuhalten.
 const yres=await mapLimit(allNewsTargets,6,yahooNews),ymap=new Map(allNewsTargets.map((x,i)=>[x.symbol,yres[i]||[]]));
 const enhancedTargets=newsOnly?radarTargets:[...deep.slice(0,2),...radarTargets.filter(x=>x.priority).slice(0,1)];
 const enhanced=[];for(const c of enhancedTargets)if(c&&!enhanced.some(x=>x.symbol===c.symbol))enhanced.push(c);
 const gres=await mapLimit(enhanced,4,gdeltNews),gmap=new Map(enhanced.map((x,i)=>[x.symbol,gres[i]||[]]));
 const secTargets=enhanced.filter(isSecCandidate).slice(0,newsOnly?4:2),sres=await mapLimit(secTargets,3,secNews),smap=new Map(secTargets.map((x,i)=>[x.symbol,sres[i]||[]]));
 const nmap=new Map();for(const c of allNewsTargets)nmap.set(c.symbol,aggregateNews(ymap.get(c.symbol)||[],gmap.get(c.symbol)||[],smap.get(c.symbol)||[]));

 for(const c of deep){const n=nmap.get(c.symbol)||aggregateNews();c.newsScore=num(n.score);c.newsConfidence=num(n.confidence);c.newsSources=n.sources||[];c.headlines=n.headlines||[];c.score+=c.newsScore*(.65+.35*c.newsConfidence);if(c.newsScore>.25)c.reasons.push(`News +${c.newsScore.toFixed(1)} (${c.newsSources.join('+')||'Quelle'})`);if(c.newsScore<-.25)c.reasons.push(`News ${c.newsScore.toFixed(1)} (${c.newsSources.join('+')||'Quelle'})`);if(c.type==='LEVERAGED_ETF')c.score-=.25}
 deep.sort((a,b)=>b.score-a.score);

 const newsRadar=radarTargets.map(c=>{const n=nmap.get(c.symbol)||aggregateNews();const score=num(n.score),tendency=score>.28?'BULLISH':score<-.28?'BEARISH':'NEUTRAL';return{symbol:c.symbol,name:c.name||c.symbol,type:c.type,theme:c.theme||null,score,confidence:n.confidence,tendency,sourceCount:(n.sources||[]).length,sources:n.sources||[],headline:n.headlines?.[0]||'',headlines:n.headlines||[],newsAt:n.latestAt||null}}).filter(x=>x.headline);
 return{universe:uni.items,generatedAt:uni.generatedAt,candidates:deep,newsRadar,marketState:{mode:newsOnly?'NEWS_ONLY':'MARKET_AND_NEWS',activeMarkets,openSymbols:openItems.length,closedSymbols:uni.items.length-openItems.length}};
}
