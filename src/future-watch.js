import {clamp,num,nowIso} from './constants.js';
import {FORWARD_EQUITIES} from './forward-equities.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/ForwardRadar)'};
const GDELT='https://api.gdeltproject.org/api/v2/doc/doc';
const MAX_RESULTS=15;
let gdeltRetryAfter=0;

// Der Forward-Radar sucht bewusst nicht nur nach heutigen Gewinnern. Er verbindet
// Nachrichten-/Politikthemen, bekannte Makrotermine und Aktien, die noch ruhig sind.
// Ein BUY bleibt trotzdem an die normale Live-/Safety-Kette gebunden.
const THEMES=[
 {id:'MIDDLE_EAST_ENERGY',label:'Nahost / Öl- und Gasversorgung',defaultHorizon:'heute–3 Tage',keywords:['iran','middle east','strait of hormuz','hormuz','oil supply','oil price','crude oil','energy supply','gas supply','lng','ceasefire','missile','nahost','ölpreis','oelpreis'],symbols:['XOM','CVX','COP','EOG','OXY','SLB','BKR','LNG','TTE.PA','ENI.MI','EQNR.OL','REP.MC','RHM.DE','RTX','LMT','FRO','STNG','DHT','TNK']},
 {id:'RUSSIA_SANCTIONS_DEFENSE',label:'Russland / Sanktionen / europäische Aufrüstung',defaultHorizon:'2 Tage–2 Wochen',keywords:['russia sanctions','russian sanctions','sanctions package','military industrial','ukraine','rearmament','defense spending','defence spending','air defense','munition','hybrid attack','russland','sanktionen','aufrüstung','aufruestung','verteidigungsausgaben'],symbols:['RHM.DE','HAG.DE','R3NK.DE','LDO.MI','HO.PA','AIR.PA','SAAB-B.ST','KOG.OL','LMT','RTX','NOC','GD','LHX','PLTR','AVAV','KTOS','CRWD','PANW']},
 {id:'SEMI_EXPORT_CONTROLS',label:'Halbleiter / AI / Exportkontrollen',defaultHorizon:'1–7 Tage',keywords:['semiconductor export','chip export','export control','ai chip','advanced semiconductor','china chip','technology restriction','chip tariff','semiconductor tariff','halbleiter','exportkontrolle','chip-zoll'],symbols:['NVDA','AMD','AVGO','MU','AMAT','LRCX','KLAC','ASML','ASML.AS','IFX.DE','TSM']},
 {id:'AI_POWER_GRID',label:'AI-Strom / Netzengpass / Rechenzentren',defaultHorizon:'Tage–Wochen',keywords:['data center','data centre','power grid','electricity demand','transformer','grid bottleneck','power shortage','grid investment','rechenzentrum','stromnetz','transformator','netzausbau'],symbols:['GEV','ETN','VRT','PWR','HUBB','NVT','ABB','ENR.DE','SIE.DE','SU.PA','LR.PA','CEG','VST']},
 {id:'NUCLEAR_URANIUM',label:'Kernenergie / Uran-Versorgung',defaultHorizon:'Tage–Wochen',keywords:['uranium','nuclear fuel','nuclear power','reactor','small modular reactor','smr','uran','kernenergie','reaktor'],symbols:['CCJ','NXE','DNN','UEC','LEU','CEG','OKLO','SMR','BWXT']},
 {id:'CYBER_SECURITY',label:'Cyberangriff / kritische Infrastruktur',defaultHorizon:'heute–7 Tage',keywords:['cyberattack','cyber attack','ransomware','data breach','critical infrastructure','zero-day','hacking','cybersecurity','hybrid attack','cyberangriff','datenleck'],symbols:['PANW','CRWD','FTNT','ZS','CYBR','S','NET']},
 {id:'CRITICAL_MINERALS',label:'Kritische Rohstoffe / seltene Erden / Kupfer',defaultHorizon:'2 Tage–2 Wochen',keywords:['critical minerals','rare earth','rare-earth','copper shortage','lithium supply','mineral export','export ban minerals','kritische rohstoffe','seltene erden','kupfer','lithium'],symbols:['FCX','SCCO','MP','ALB','SQM','LAC','VALE','BHP']},
 {id:'SHIPPING_DISRUPTION',label:'Schifffahrt / Handelsrouten / Tanker',defaultHorizon:'heute–7 Tage',keywords:['shipping disruption','red sea','strait of hormuz','tanker','container rates','freight rates','shipping route','port disruption','seefahrt','frachtraten','schifffahrt'],symbols:['FRO','STNG','DHT','TNK','ZIM','MATX']},
 {id:'GOLD_GEOPOLITICAL',label:'Goldminen / geopolitische Absicherung',defaultHorizon:'heute–7 Tage',keywords:['safe haven','gold price','geopolitical risk','war risk','market stress','gold rally','gold demand','sicherer hafen','goldpreis'],symbols:['NEM','AEM','GOLD','WPM','KGC']},
 {id:'RATES_MACRO',label:'Zinsen / Fed / ECB / Inflation',defaultHorizon:'Termin in ≤14 Tagen',keywords:['federal reserve','fomc','fed minutes','interest rate','rate cut','rate hike','inflation','cpi','ppi','ecb','central bank','zins','leitzins','inflation'],symbols:['NVDA','MSFT','AMZN','PLTR','JPM','BAC','GS','MS','DBK.DE','CBK.DE','GEV','ETN'],directionUnknown:true}
];

// Offizielle 2026-Termine, die fuer das aktuelle Planspiel relevant sind. Die Richtung
// wird bei solchen Events NICHT vorweggenommen; die Live-Reaktion muss den BUY bestaetigen.
const SCHEDULED_EVENTS=[
 {at:'2026-08-19T18:00:00Z',label:'FOMC Minutes (Sitzung 28.–29. Juli)',themeIds:['RATES_MACRO'],importance:96},
 {at:'2026-08-26T12:30:00Z',label:'US GDP Q2 zweite Schätzung + Personal Income/Outlays',themeIds:['RATES_MACRO'],importance:88},
 {at:'2026-09-10T12:15:00Z',label:'EZB geldpolitischer Beschluss',themeIds:['RATES_MACRO'],importance:96},
 {at:'2026-09-10T12:30:00Z',label:'US PPI August',themeIds:['RATES_MACRO'],importance:88},
 {at:'2026-09-11T12:30:00Z',label:'US CPI August',themeIds:['RATES_MACRO'],importance:98},
 {at:'2026-09-16T18:00:00Z',label:'FOMC Zinsentscheid September',themeIds:['RATES_MACRO'],importance:100}
];

const text=v=>String(v||'').toLowerCase();
const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase();

async function universeSymbols(env){
 const m=new Map();
 try{const r=await env.ASSETS.fetch(new Request('https://assets.local/universe.json'));if(r.ok){const j=await r.json();for(const x of arr(j?.equities))if(x?.symbol)m.set(key(x.symbol),x)}}catch{}
 for(const x of FORWARD_EQUITIES)if(x?.symbol&&!m.has(key(x.symbol)))m.set(key(x.symbol),x);
 return m;
}

function scheduledHeadlines(){
 const now=Date.now(),max=14*24*3600000,out=[];
 for(const e of SCHEDULED_EVENTS){const at=Date.parse(e.at),delta=at-now;if(!Number.isFinite(at)||delta<0||delta>max)continue;const hours=delta/3600000,urgency=hours<=24?100:hours<=72?88:hours<=7*24?72:56;out.push({title:e.label,source:'Terminradar',seenAt:e.at,themeIds:e.themeIds,scheduledAt:e.at,urgency,importance:e.importance})}
 return out;
}

async function worldHeadlines(){
 if(Date.now()<gdeltRetryAfter)return[];
 try{
  const u=new URL(GDELT);u.searchParams.set('query','(Iran OR "Middle East" OR sanctions OR Ukraine OR "defense spending" OR rearmament OR "export controls" OR semiconductor OR cyberattack OR "critical minerals" OR "power grid" OR uranium OR tanker OR "shipping disruption" OR tariff)');u.searchParams.set('mode','artlist');u.searchParams.set('maxrecords','35');u.searchParams.set('format','json');u.searchParams.set('sort','hybridrel');u.searchParams.set('timespan','18h');
  const r=await fetch(u,{headers:HEADERS});if(!r.ok){gdeltRetryAfter=Date.now()+(r.status===429?60:20)*60000;return[]}const j=await r.json();return arr(j?.articles).map(x=>({title:String(x?.title||''),source:String(x?.domain||'GDELT'),seenAt:x?.seendate||null})).filter(x=>x.title).slice(0,35)
 }catch{gdeltRetryAfter=Date.now()+20*60000;return[]}
}

function macroHeadlines(state){return arr(state?.macroRadar?.events).map(e=>({title:`${e?.label||''} ${e?.headline||''}`,source:'Makro-Radar',severity:num(e?.severity),confirmed:Boolean(e?.marketConfirmation?.confirmed||num(e?.marketConfirmation?.score)>=62)}))}
function portfolioNews(state){return arr(state?.newsRadar).filter(x=>x?.headline).slice(0,25).map(x=>({title:`${x.symbol||''} ${x.headline||''}`,source:`News-Radar${x.sources?.length?` · ${x.sources.slice(0,2).join(', ')}`:''}`,severity:Math.min(100,Math.abs(num(x.news_score))*70),symbol:key(x.symbol)}))}
function previousThemeSignals(state){const age=Date.now()-Date.parse(state?.futureWatch?.updatedAt||'');if(!Number.isFinite(age)||age>2*3600000)return[];return arr(state?.futureWatch?.activeThemes).filter(x=>num(x?.issueStrength)>=55).map(x=>({title:x.label||x.id,source:'vorheriger Forward-Radar',themeIds:[x.id],severity:num(x.issueStrength)*.45}))}

function activateThemes(headlines){
 return THEMES.map(theme=>{
  const hits=[];let strength=0,urgency=0,eventAt=null,catalyst=null;
  for(const h of headlines){const t=text(h.title),direct=arr(h.themeIds).includes(theme.id),matched=direct?['direct']:theme.keywords.filter(k=>t.includes(k));if(!matched.length)continue;hits.push(h);
   if(h.source==='Terminradar'){strength+=18+num(h.importance)*.18;urgency=Math.max(urgency,num(h.urgency));eventAt=h.scheduledAt||eventAt;catalyst=h.title||catalyst}
   else if(h.source==='Makro-Radar')strength+=h.confirmed?26:13;
   else if(h.source==='vorheriger Forward-Radar')strength+=5;
   else if(String(h.source).startsWith('News-Radar'))strength+=10;
   else strength+=8;
   strength+=Math.min(8,matched.length*2);if(h.severity)strength+=Math.min(12,num(h.severity)*.12)
  }
  return{...theme,hits:hits.slice(0,6),issueStrength:clamp(25+strength,0,100),urgency:clamp(urgency,0,100),eventAt,catalyst};
 }).filter(x=>x.hits.length||x.issueStrength>=50)
}

async function quoteBatch(symbols){
 const out=new Map();if(!symbols.length)return out;
 try{const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');u.searchParams.set('symbols',symbols.join(','));u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');const r=await fetch(u,{headers:HEADERS});if(!r.ok)return out;const j=await r.json();for(const item of arr(j?.spark?.result)){const res=item?.response?.[0],m=res?.meta||{},sym=key(item?.symbol||m?.symbol),cl=arr(res?.indicators?.quote?.[0]?.close).filter(v=>Number.isFinite(Number(v))).map(Number);if(!sym||!cl.length)continue;const price=num(m.regularMarketPrice,cl.at(-1)),prev=num(m.previousClose,cl[0]),back=cl[Math.max(0,cl.length-5)],day=prev?(price/prev-1)*100:0,m20=back?(price/back-1)*100:0;out.set(sym,{price,dayPct:day,m20Pct:m20,ts:num(m.regularMarketTime)})}}catch{}return out
}

function horizon(theme){
 if(theme.eventAt){const h=(Date.parse(theme.eventAt)-Date.now())/3600000;if(h<=24)return'morgen / <24h';if(h<=72)return'2–3 Tage';if(h<=7*24)return'diese Woche';return'nächste 1–2 Wochen'}
 return theme.defaultHorizon||'Tage–Wochen';
}

export async function buildFutureWatch(env,state){
 const universe=await universeSymbols(env),world=await worldHeadlines(),scheduled=scheduledHeadlines(),headlines=[...scheduled,...world,...macroHeadlines(state),...portfolioNews(state),...previousThemeSignals(state)],active=activateThemes(headlines),wanted=[];
 for(const t of active)for(const s of t.symbols)if(universe.has(key(s))&&!wanted.includes(key(s)))wanted.push(key(s));
 const quotes=await quoteBatch(wanted.slice(0,40)),directNews=new Set(arr(state?.newsRadar).filter(n=>n?.headline).map(n=>key(n.symbol))),rows=[];
 for(const theme of active){for(const symbol of theme.symbols){const meta=universe.get(key(symbol)),q=quotes.get(key(symbol));if(!meta||!q||!(q.price>0))continue;const quietDay=Math.abs(q.dayPct),quiet20=Math.abs(q.m20Pct),quietScore=clamp(100-quietDay*27-quiet20*42,0,100),alreadyMoving=quietDay>2.6||quiet20>1.25,preNews=!directNews.has(key(symbol)),urgency=theme.urgency||48;let score=theme.issueStrength*.44+quietScore*.26+urgency*.18+(preNews?8:2);if(alreadyMoving)score-=15;if(theme.directionUnknown)score-=3;score=clamp(Math.round(score),0,100);if(score<50)continue;const hz=horizon(theme),confirmation=theme.directionUnknown?'Termin kann beide Richtungen auslösen; nur bei positiver Live-Bestätigung handeln.':'Politisches/strukturelles Thema ist aktiv; auf erste bestätigte Kurs-/Volumenreaktion warten.';rows.push({symbol:key(symbol),name:meta.name||symbol,theme:theme.label,themeId:theme.id,horizon:hz,eventAt:theme.eventAt||null,catalyst:theme.catalyst||theme.hits[0]?.title||theme.label,watchScore:score,issueStrength:Math.round(theme.issueStrength),urgency:Math.round(urgency),quietScore:Math.round(quietScore),dayPct:+q.dayPct.toFixed(2),momentum20Pct:+q.m20Pct.toFixed(2),price:q.price,preNews,alreadyMoving,directionUnknown:Boolean(theme.directionUnknown),reason:`${alreadyMoving?'Thema relevant, Kurs reagiert bereits':'Thema relevant, Kurs bisher vergleichsweise ruhig'} · Horizont ${hz}. ${confirmation}`,headlines:theme.hits.slice(0,3),updatedAt:nowIso()})}}
 rows.sort((a,b)=>Number(a.alreadyMoving)-Number(b.alreadyMoving)||b.watchScore-a.watchScore||b.urgency-a.urgency||b.issueStrength-a.issueStrength);
 const selected=rows.slice(0,MAX_RESULTS);
 return{version:3,updatedAt:nowIso(),candidateCount:selected.length,monitoredUniverseCount:wanted.slice(0,40).length,scheduledEvents:scheduled.map(x=>({label:x.title,at:x.scheduledAt,urgency:x.urgency})),activeThemes:active.map(t=>({id:t.id,label:t.label,issueStrength:Math.round(t.issueStrength),urgency:Math.round(t.urgency||0),horizon:horizon(t),headlineCount:t.hits.length,eventAt:t.eventAt||null})),candidates:selected,source:'Welt-/Politikmeldungen + eigener News-/Makro-Radar + bekannte Makrotermine + Live-Kurse',notice:'Forward-Watch, keine Kaufempfehlung. Das System sucht absichtlich auch noch ruhige Aktien mit plausibler Relevanz fuer morgen/naechste Tage. Ein automatischer BUY erfolgt erst, wenn Live-Kurs, Trend, Liquiditaet, Kosten und Safety die Idee bestaetigen.'}
}
