import {CORE_ETFS,LEVERAGED_ETFS,chunks,num} from './constants.js';
import {PRIORITY_EQUITIES} from './priority-equities.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0'};
const BATCH=32;

function previousWeek(now=new Date()){
  const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  const sinceMonday=(today.getUTCDay()+6)%7;
  const thisMonday=new Date(today.getTime()-sinceMonday*86400000);
  const from=new Date(thisMonday.getTime()-7*86400000);
  const to=new Date(from.getTime()+5*86400000);
  return{from,to,label:`${from.toLocaleDateString('de-DE',{timeZone:'UTC'})} – ${new Date(to.getTime()-86400000).toLocaleDateString('de-DE',{timeZone:'UTC'})}`};
}

async function loadUniverse(env,cfg){
  let data={equities:[]};
  try{const r=await env.ASSETS.fetch(new Request('https://assets.local/universe.json'));if(r.ok)data=await r.json()}catch{}
  const all=(data.equities||[]).filter(x=>x?.symbol).map(x=>({symbol:String(x.symbol).toUpperCase(),name:x.name||x.symbol,type:'EQUITY',leverage:1}));
  all.push(...PRIORITY_EQUITIES);
  if(cfg.includeEtfs)all.push(...CORE_ETFS);
  if(cfg.includeLeverage)all.push(...LEVERAGED_ETFS);
  const seen=new Set(),out=[];
  for(const x of all){const symbol=String(x.symbol||'').toUpperCase();if(!symbol||seen.has(symbol))continue;seen.add(symbol);out.push({...x,symbol})}
  return out;
}

async function spark(symbols){
  const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');
  u.searchParams.set('symbols',symbols.join(','));u.searchParams.set('range','1mo');u.searchParams.set('interval','30m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
  const r=await fetch(u,{headers:HEADERS});if(!r.ok)throw new Error(`Yahoo Spark HTTP ${r.status}`);const j=await r.json();return j?.spark?.result||[];
}

function rowsFromSpark(item,fromMs,toMs){
  const res=item?.response?.[0];if(!res)return[];const ts=res.timestamp||[],close=res?.indicators?.quote?.[0]?.close||[],rows=[];
  for(let i=0;i<Math.min(ts.length,close.length);i++){const t=num(ts[i])*1000,p=num(close[i],NaN);if(t>=fromMs&&t<toMs&&Number.isFinite(p)&&p>0)rows.push({ts:t,price:p})}
  return rows;
}
function slipFor(type,cfg){return type==='LEVERAGED_ETF'?cfg.leveragedSlippagePercent:cfg.slippagePercent}

// Hindsight-Kandidaten: fuer jeden moeglichen Einstieg wird der beste spaetere Ausstieg der Woche gesucht.
// Es gibt weder eine maximale Tradezahl noch eine Ein-Position-Regel.
function opportunities(info,rows,cfg){
  const out=[],slip=slipFor(info.type,cfg)/100;
  for(let i=0;i<rows.length-1;i++){
    let bestJ=-1,bestRatio=1;
    for(let j=i+1;j<rows.length;j++){
      const ratio=(rows[j].price*(1-slip))/(rows[i].price*(1+slip));
      if(ratio>bestRatio){bestRatio=ratio;bestJ=j}
    }
    if(bestJ>i)out.push({symbol:info.symbol,name:info.name||info.symbol,type:info.type||'EQUITY',leverage:num(info.leverage,1),buyTs:rows[i].ts,sellTs:rows[bestJ].ts,buyPrice:rows[i].price,sellPrice:rows[bestJ].price,buyExec:rows[i].price*(1+slip),sellExec:rows[bestJ].price*(1-slip),ratio:bestRatio,durationHours:(rows[bestJ].ts-rows[i].ts)/3600000});
  }
  return out;
}

function executeBudget(budget,opp,cfg){
  const fixed=Math.max(0,cfg.feeFixed),pct=Math.max(0,cfg.feePercent)/100;
  const order=(budget-fixed)/(1+pct);if(!(order>0))return null;
  const buyFee=fixed+order*pct,gross=order*opp.ratio,sellFee=fixed+gross*pct,end=gross-sellFee;
  if(!(end>0))return null;
  return{budget,order,buyFee,gross,sellFee,end,pnl:end-budget,turnover:order+gross};
}
function minProfitableBudget(opp,cfg){
  let lo=.01,hi=100000;
  const good=b=>{const x=executeBudget(b,opp,cfg);return x&&x.pnl>0.005};
  if(!good(hi))return Infinity;
  for(let i=0;i<35;i++){const m=(lo+hi)/2;if(good(m))hi=m;else lo=m}
  return hi;
}

// Adaptive Hindsight-Basket: zu jedem historischen Zeitpunkt koennen beliebig viele vorhandene
// profitable Chancen parallel laufen. Die Zahl der Positionen ergibt sich nur aus vorhandenem
// Kapital und den realen Kosten; es existiert kein festes Positions- oder Trade-Limit.
function optimize(opps,cfg){
  const starts=new Map(),times=new Set();
  for(const o of opps){if(!starts.has(o.buyTs))starts.set(o.buyTs,[]);starts.get(o.buyTs).push(o);times.add(o.buyTs);times.add(o.sellTs)}
  const timeline=[...times].sort((a,b)=>a-b),open=[],actions=[];let cash=100,turnover=0;
  for(const ts of timeline){
    for(let i=open.length-1;i>=0;i--){const p=open[i];if(p.opp.sellTs<=ts){cash+=p.exec.end;turnover+=p.exec.gross;actions.push({...p.opp,...p.exec,kind:'CLOSED',endCapital:null});open.splice(i,1)}}
    const pool=(starts.get(ts)||[]).map(o=>({o,min:minProfitableBudget(o,cfg),edge:(o.ratio-1)/Math.max(.5,o.durationHours)})).filter(x=>Number.isFinite(x.min)&&x.min<=cash&&x.edge>0).sort((a,b)=>b.edge-a.edge||b.o.ratio-a.o.ratio);
    if(!pool.length||cash<=0)continue;
    // Kandidaten werden nicht auf eine feste Anzahl begrenzt. Nur Kandidaten, deren Mindestbudget
    // gemeinsam finanzierbar ist, kommen in den Basket; bei knapper Kasse setzt sich die hoehere Edge durch.
    const chosen=[];let minNeed=0;
    for(const x of pool){if(minNeed+x.min<=cash+.0001){chosen.push(x);minNeed+=x.min}}
    if(!chosen.length)continue;
    const extra=Math.max(0,cash-minNeed),edgeSum=chosen.reduce((s,x)=>s+Math.max(.000001,x.edge),0);let spent=0;
    for(let i=0;i<chosen.length;i++){
      const x=chosen[i],budget=i===chosen.length-1?Math.max(x.min,cash-spent):x.min+extra*(x.edge/edgeSum),ex=executeBudget(budget,x.o,cfg);
      if(!ex||ex.pnl<=0)continue;spent+=budget;turnover+=ex.order;open.push({opp:x.o,exec:ex});
    }
    cash=Math.max(0,cash-spent);
  }
  // Alles, was bis zum letzten Timeline-Punkt faellig ist, wurde oben geschlossen. Sicherheitshalber Rest schliessen.
  for(const p of open){cash+=p.exec.end;turnover+=p.exec.gross;actions.push({...p.opp,...p.exec,kind:'CLOSED',endCapital:null})}
  actions.sort((a,b)=>a.buyTs-b.buyTs||a.sellTs-b.sellTs);
  let running=100;
  for(const a of actions){a.startCapital=running;running+=a.pnl;a.endCapital=running}
  return{capital:cash,turnover,path:actions};
}

export async function runLastWeekHindsight(env,options={}){
  const cfg={includeEtfs:options.includeEtfs!==false,includeLeverage:options.includeLeverage!==false,feeFixed:Math.max(0,num(options.feeFixed,1)),feePercent:Math.max(0,num(options.feePercent,0)),slippagePercent:Math.max(0,num(options.slippagePercent,.10)),leveragedSlippagePercent:Math.max(0,num(options.leveragedSlippagePercent,.20))};
  const week=previousWeek(),universe=await loadUniverse(env,cfg),lookup=new Map(universe.map(x=>[x.symbol,x])),opps=[];let usableSymbols=0,failedBatches=0;
  for(const batch of chunks(universe,BATCH)){
    try{const raw=await spark(batch.map(x=>x.symbol));for(const item of raw){const symbol=String(item.symbol||item?.response?.[0]?.meta?.symbol||'').toUpperCase(),info=lookup.get(symbol);if(!info)continue;const rows=rowsFromSpark(item,week.from.getTime(),week.to.getTime());if(rows.length<2)continue;usableSymbols++;opps.push(...opportunities(info,rows,cfg))}}catch{failedBatches++}
  }
  const best=optimize(opps,cfg),trades=best.path.map((x,i)=>({no:i+1,symbol:x.symbol,name:x.name,type:x.type,buyAt:new Date(x.buyTs).toISOString(),sellAt:new Date(x.sellTs).toISOString(),buyPrice:x.buyPrice,sellPrice:x.sellPrice,buyExecutionPrice:x.buyExec,sellExecutionPrice:x.sellExec,startCapital:x.startCapital,orderValue:x.order,buyFee:x.buyFee,sellGross:x.gross,sellFee:x.sellFee,endCapital:x.endCapital,pnl:x.pnl,returnPct:x.budget?x.pnl/x.budget*100:0}));
  return{mode:'HINDSIGHT',label:week.label,from:week.from.toISOString(),toExclusive:week.to.toISOString(),startCapital:100,endCapital:best.capital,profit:best.capital-100,returnPct:best.capital-100,turnover:best.turnover,trades,scannedSymbols:universe.length,usableSymbols,failedBatches,rules:{tradeLimit:null,positionLimit:null,minHoldMinutes:null,parallelPositions:true,capitalLimit:100,feeFixed:cfg.feeFixed,feePercent:cfg.feePercent,slippagePercent:cfg.slippagePercent,leveragedSlippagePercent:cfg.leveragedSlippagePercent,dataIntervalMinutes:30},note:'Rückblick mit vollständiger Kenntnis der vergangenen Woche. Keine feste Tradezahl, keine Ein-Position-Regel und keine künstliche Mindesthaltezeit. Kapital, Gebühren, Spreads und verfügbare 30-Minuten-Historie begrenzen die Suche. Die Ausgabe ist die beste durch den Suchalgorithmus gefundene Rückschau, keine mathematische Garantie des absoluten Optimums und keine Prognose.'};
}
