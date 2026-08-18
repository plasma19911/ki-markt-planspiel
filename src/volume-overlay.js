import {FAST_CALIBRATION} from './generated-fast-calibration.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/VolumeOverlay)'};
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const MAX_VOLUME_SYMBOLS=12;

function dayKey(ts,tz){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:tz||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(num(ts)*1000))}catch{return new Date(num(ts)*1000).toISOString().slice(0,10)}
}
function timeKey(ts,tz){
  try{const p=new Intl.DateTimeFormat('en-GB',{timeZone:tz||'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(num(ts)*1000)),m={};for(const x of p)m[x.type]=x.value;return`${m.hour}:${m.minute}`}catch{return new Date(num(ts)*1000).toISOString().slice(11,16)}
}

async function volumeRatio(symbol){
  try{
    const u=new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    // 5 Tage erlauben schon direkt nach der Oeffnung einen sinnvollen Vergleich mit
    // derselben 5m-Zeitposition vergangener Handelstage statt 5 heutige Bars abzuwarten.
    u.searchParams.set('range','5d');u.searchParams.set('interval','5m');u.searchParams.set('includePrePost','false');
    const r=await fetch(u,{headers:HEADERS});if(!r.ok)return null;
    const res=(await r.json())?.chart?.result?.[0];if(!res)return null;
    const q=res?.indicators?.quote?.[0]||{},ts=res.timestamp||[],tz=res.meta?.exchangeTimezoneName||'UTC',rows=[];
    for(let i=0;i<ts.length;i++){
      const volume=num(q.volume?.[i],0);if(volume>0)rows.push({t:num(ts[i]),volume,day:dayKey(ts[i],tz),clock:timeKey(ts[i],tz)});
    }
    if(!rows.length)return null;
    const now=Math.floor(Date.now()/1000),regular=res.meta?.currentTradingPeriod?.regular||{},start=num(regular.start,0),end=num(regular.end,0),completedCutoff=now-300;
    let current=start>0?rows.filter(x=>x.t>=start&&(!end||x.t<=end)&&x.t<=completedCutoff):[];
    if(!current.length){const latestDay=rows.at(-1)?.day;current=latestDay?rows.filter(x=>x.day===latestDay&&x.t<=completedCutoff):[]}
    if(!current.length)return null;
    const last=current.at(-1),historical=rows.filter(x=>x.day!==last.day&&x.clock===last.clock&&x.volume>0).slice(-4),histAvg=avg(historical.map(x=>x.volume));
    if(historical.length>=2&&histAvg>0)return last.volume/histAvg;
    // Fallback fuer duenne Historien: nach drei abgeschlossenen Bars gegen die bisherigen
    // heutigen Bars vergleichen. Das ist nur die Ersatzlogik, nicht der bevorzugte Massstab.
    if(current.length>=3){const base=current.slice(Math.max(0,current.length-13),-1),baseAvg=avg(base.map(x=>x.volume));if(baseAvg>0)return last.volume/baseAvg}
    return null;
  }catch{return null}
}

export async function applyVolumeConfirmation(fast){
  if(!fast)return fast;
  const symbols=[...new Set((fast.context||[]).map(x=>String(x.symbol||'').toUpperCase()).filter(Boolean))].slice(0,MAX_VOLUME_SYMBOLS);
  if(!symbols.length)return fast;
  const ratios=new Map(await Promise.all(symbols.map(async s=>[s,await volumeRatio(s)])));
  const min=num(FAST_CALIBRATION.minRelativeVolume,1.10),actions=[];
  for(const a of fast.actions||[]){
    if(a.action!=='BUY'){actions.push(a);continue}
    const ratio=ratios.get(String(a.symbol).toUpperCase());
    if(ratio==null){
      actions.push({...a,confidence:Math.min(num(a.confidence,.5),.68),allocation_pct:+(num(a.allocation_pct)*.72).toFixed(1),reason:`${a.reason} · Volumenbestätigung nicht verfügbar: Positionsgröße reduziert`});
      continue;
    }
    if(ratio<min)continue;
    actions.push({...a,reason:`${a.reason} · 5m-Volumen x${ratio.toFixed(2)} bestätigt`});
  }
  return{...fast,actions,volumeConfirmation:{requiredForFastBuy:true,minRatio:min,maxSymbols:MAX_VOLUME_SYMBOLS,method:'same-time 5d historical baseline; current-session fallback',ratios:Object.fromEntries([...ratios].map(([k,v])=>[k,v==null?null:+v.toFixed(2)]))}};
}
