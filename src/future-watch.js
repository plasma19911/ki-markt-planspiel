import {clamp,num,nowIso} from './constants.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/FutureWatch)'};
const GDELT='https://api.gdeltproject.org/api/v2/doc/doc';
const MAX_RESULTS=10;

const THEMES=[
 {id:'AI_POWER_GRID',label:'AI-Strom / Netzengpass',keywords:['data center','data centre','power grid','electricity demand','transformer','grid bottleneck','power shortage','stromnetz','rechenzentrum','transformator'],symbols:['GEV','ETN','VRT','PWR','HUBB','CMI','CAT']},
 {id:'NUCLEAR_URANIUM',label:'Kernenergie / Uran-Versorgung',keywords:['uranium','nuclear fuel','nuclear power','reactor','small modular reactor','smr','uran','kernenergie','reaktor'],symbols:['CCJ','NXE','DNN','UEC','LEU']},
 {id:'DEFENSE_SECURITY',label:'Verteidigung / Sicherheitsausgaben',keywords:['defense spending','defence spending','military spending','rearmament','missile','air defense','air defence','munition','verteidigung','aufrüstung','aufruestung'],symbols:['RHM.DE','HAG.DE','LMT','RTX','NOC','GD','LHX','SAAB-B.ST']},
 {id:'CYBER_SECURITY',label:'Cybersecurity / kritische Infrastruktur',keywords:['cyberattack','cyber attack','ransomware','data breach','critical infrastructure','zero-day','hacking','cybersecurity','cyberangriff','datenleck'],symbols:['PANW','CRWD','FTNT','CHKP','CYBR']},
 {id:'ENERGY_SECURITY',label:'Energieversorgung / geopolitischer Engpass',keywords:['energy supply','oil supply','gas supply','pipeline','sanctions oil','sanctions gas','lng shortage','opec','energieversorgung','gasversorgung','ölversorgung'],symbols:['XOM','CVX','SHEL','BP','TTE','EQNR','SLB']}
];

const text=v=>String(v||'').toLowerCase();
const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase();

async function universeSymbols(env){
 try{const r=await env.ASSETS.fetch(new Request('https://assets.local/universe.json'));if(!r.ok)return new Map();const j=await r.json(),m=new Map();for(const x of arr(j?.equities))if(x?.symbol)m.set(key(x.symbol),x);return m}catch{return new Map()}
}

async function worldHeadlines(){
 try{
  const u=new URL(GDELT);u.searchParams.set('query','("data center" OR "power grid" OR transformer OR uranium OR nuclear OR "defense spending" OR rearmament OR cyberattack OR ransomware OR "energy supply")');u.searchParams.set('mode','artlist');u.searchParams.set('maxrecords','40');u.searchParams.set('format','json');u.searchParams.set('sort','hybridrel');u.searchParams.set('timespan','24h');
  const r=await fetch(u,{headers:HEADERS});if(!r.ok)return[];const j=await r.json();return arr(j?.articles).map(x=>({title:String(x?.title||''),source:String(x?.domain||'GDELT'),seenAt:x?.seendate||null})).filter(x=>x.title).slice(0,40)
 }catch{return[]}
}

function macroHeadlines(state){return arr(state?.macroRadar?.events).map(e=>({title:`${e?.label||''} ${e?.headline||''}`,source:'Makro-Radar',severity:num(e?.severity),confirmed:Boolean(e?.marketConfirmation?.confirmed||num(e?.marketConfirmation?.score)>=62)}))}

function activateThemes(headlines){
 return THEMES.map(theme=>{
  const hits=[];let strength=0;
  for(const h of headlines){const t=text(h.title),matched=theme.keywords.filter(k=>t.includes(k));if(!matched.length)continue;hits.push(h);strength+=h.source==='Makro-Radar'?(h.confirmed?24:12):8;strength+=Math.min(8,matched.length*2);if(h.severity)strength+=Math.min(12,h.severity*.12)}
  return{...theme,hits:hits.slice(0,5),issueStrength:clamp(25+strength,0,100)};
 }).filter(x=>x.hits.length||x.issueStrength>=50)
}

async function quoteBatch(symbols){
 const out=new Map();if(!symbols.length)return out;
 try{const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');u.searchParams.set('symbols',symbols.join(','));u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');const r=await fetch(u,{headers:HEADERS});if(!r.ok)return out;const j=await r.json();for(const item of arr(j?.spark?.result)){const res=item?.response?.[0],m=res?.meta||{},sym=key(item?.symbol||m?.symbol),cl=arr(res?.indicators?.quote?.[0]?.close).filter(v=>Number.isFinite(Number(v))).map(Number);if(!sym||!cl.length)continue;const price=num(m.regularMarketPrice,cl.at(-1)),prev=num(m.previousClose,cl[0]),back=cl[Math.max(0,cl.length-5)],day=prev?(price/prev-1)*100:0,m20=back?(price/back-1)*100:0;out.set(sym,{price,dayPct:day,m20Pct:m20,ts:num(m.regularMarketTime)})}}catch{}return out
}

export async function buildFutureWatch(env,state){
 const universe=await universeSymbols(env),world=await worldHeadlines(),headlines=[...world,...macroHeadlines(state)],active=activateThemes(headlines),wanted=[];
 for(const t of active)for(const s of t.symbols)if(universe.has(key(s))&&!wanted.includes(key(s)))wanted.push(key(s));
 const quotes=await quoteBatch(wanted.slice(0,35)),directNews=new Set(arr(state?.newsRadar).filter(n=>n?.headline).map(n=>key(n.symbol))),rows=[];
 for(const theme of active){for(const symbol of theme.symbols){const meta=universe.get(key(symbol)),q=quotes.get(key(symbol));if(!meta||!q||!(q.price>0))continue;const quietDay=Math.abs(q.dayPct),quiet20=Math.abs(q.m20Pct),quietScore=clamp(100-quietDay*30-quiet20*45,0,100),alreadyMoving=quietDay>2.2||quiet20>1.0,preNews=!directNews.has(key(symbol));let score=theme.issueStrength*.52+quietScore*.32+(preNews?10:2);if(alreadyMoving)score-=18;score=clamp(Math.round(score),0,100);if(score<52)continue;rows.push({symbol:key(symbol),name:meta.name||symbol,theme:theme.label,themeId:theme.id,watchScore:score,issueStrength:Math.round(theme.issueStrength),quietScore:Math.round(quietScore),dayPct:+q.dayPct.toFixed(2),momentum20Pct:+q.m20Pct.toFixed(2),price:q.price,preNews,alreadyMoving,reason:alreadyMoving?'Thema relevant, Kurs reagiert aber bereits deutlich':'Welt-/Strukturthema ist aktiv, während der Kurs bisher nur wenig reagiert',headlines:theme.hits.slice(0,3),updatedAt:nowIso()})}}
 rows.sort((a,b)=>Number(a.alreadyMoving)-Number(b.alreadyMoving)||b.watchScore-a.watchScore||b.issueStrength-a.issueStrength);
 const selected=rows.slice(0,MAX_RESULTS);
 return{version:1,updatedAt:nowIso(),candidateCount:selected.length,activeThemes:active.map(t=>({id:t.id,label:t.label,issueStrength:Math.round(t.issueStrength),headlineCount:t.hits.length})),candidates:selected,source:'öffentliche Welt-/Makromeldungen + gebündelte Live-Kurse',notice:'Frühindikator/Wachliste, keine Kaufempfehlung. Hoher Watch-Score bedeutet: plausibles öffentliches Welt-/Strukturthema plus bisher geringe Kursreaktion. Ein automatischer BUY bleibt an die normalen Live-, Risiko- und Ausführungsprüfungen gebunden.'}
}
