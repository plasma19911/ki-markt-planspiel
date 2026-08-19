const CACHE_MS=90*60*1000;
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const cache=new Map();
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v||'').trim().toUpperCase();
const dayKey=d=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}catch{return d.toISOString().slice(0,10)}};
const addDays=(d,n)=>new Date(d.getTime()+n*86400000);
function eventTs(date,time){const t=String(time||'').toLowerCase(),hour=t.includes('pre')||t.includes('before')?12:t.includes('after')?20:16;return Math.floor(Date.parse(`${date}T${String(hour).padStart(2,'0')}:00:00Z`)/1000)}
async function loadDate(date){
 const old=cache.get(date);if(old&&Date.now()-old.at<CACHE_MS)return{rows:old.rows,cached:true,error:null};
 try{const u=new URL('https://api.nasdaq.com/api/calendar/earnings');u.searchParams.set('date',date);const r=await fetch(u,{headers:{'user-agent':UA,'accept':'application/json, text/plain, */*','referer':'https://www.nasdaq.com/market-activity/earnings'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json(),rows=Array.isArray(j?.data?.rows)?j.data.rows:[];cache.set(date,{at:Date.now(),rows});return{rows,cached:false,error:null}}catch(e){return{rows:[],cached:false,error:String(e?.message||e).slice(0,160)}}
}
export async function loadEventCalendarFallback(symbols=[],now=new Date()){
 const wanted=new Set(symbols.map(key).filter(Boolean)),dates=[0,1,2,3].map(n=>dayKey(addDays(now,n))),sets=await Promise.all(dates.map(loadDate)),events=new Map();let requests=0,cacheHits=0,lastError='';
 sets.forEach((set,i)=>{if(set.cached)cacheHits++;else requests++;if(set.error)lastError=set.error;for(const row of set.rows){const s=key(row?.symbol);if(!wanted.has(s)||events.has(s))continue;const ts=eventTs(dates[i],row?.time);events.set(s,{earningsAt:new Date(ts*1000).toISOString(),provider:'Nasdaq Earnings Calendar',timeLabel:String(row?.time||''),epsForecast:row?.epsForecast??null,marketCap:row?.marketCap??null})}});
 return{ok:sets.some(x=>!x.error),events,matched:events.size,requestedSymbols:wanted.size,calendarRequests:requests,cacheHits,lastError};
}
export function eventFallbackRisk(ev,now=Date.now()){
 const items=[];if(ev?.earningsAt){const h=(Date.parse(ev.earningsAt)-num(now))/3600000;if(h>=0&&h<=24)items.push({level:'HIGH',text:`Quartalszahlen in ca. ${h.toFixed(1)}h`});else if(h>24&&h<=72)items.push({level:'MEDIUM',text:`Quartalszahlen in ca. ${(h/24).toFixed(1)} Tagen`})}
 const level=items.some(x=>x.level==='HIGH')?'HIGH':items.some(x=>x.level==='MEDIUM')?'MEDIUM':'NONE';return{level,text:items.map(x=>x.text).join(' · '),provider:ev?.provider||'Nasdaq Earnings Calendar'};
}
