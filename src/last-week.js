import {CORE_ETFS,LEVERAGED_ETFS,chunks,num} from './constants.js';
import {PRIORITY_EQUITIES} from './priority-equities.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0'};
const BATCH=40;
const START_2026=Date.UTC(2026,0,1);

function inferCurrency(x){
  if(x?.currency)return String(x.currency).toUpperCase();
  const s=String(x?.symbol||'').toUpperCase();
  if(/\.(DE|PA|BR|MI|MC|AS)$/.test(s))return'EUR';
  if(/\.L$/.test(s))return'GBP';if(/\.SW$/.test(s))return'CHF';if(/\.ST$/.test(s))return'SEK';if(/\.OL$/.test(s))return'NOK';
  if(/\.T$/.test(s))return'JPY';if(/\.(KS|KQ)$/.test(s))return'KRW';if(/\.(TW|TWO)$/.test(s))return'TWD';if(/\.HK$/.test(s))return'HKD';
  if(/\.(SS|SZ)$/.test(s))return'CNY';if(/\.(NS|BO)$/.test(s))return'INR';if(/\.AX$/.test(s))return'AUD';if(/\.(TO|V)$/.test(s))return'CAD';
  if(/\.SA$/.test(s))return'BRL';if(/\.JO$/.test(s))return'ZAR';return'USD';
}

function period(now=new Date()){
  const to=new Date(now.getTime()+86400000),from=new Date(START_2026);
  return{from,to,label:`01.01.2026 – ${now.toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'})}`};
}

async function loadUniverse(env){
  let data={equities:[]};
  try{const r=await env.ASSETS.fetch(new Request('https://assets.local/universe.json'));if(r.ok)data=await r.json()}catch{}
  const all=(data.equities||[]).filter(x=>x?.symbol).map(x=>({symbol:String(x.symbol).toUpperCase(),name:x.name||x.symbol,type:'EQUITY',leverage:1,currency:inferCurrency(x)}));
  for(const x of PRIORITY_EQUITIES||[])if(String(x?.type||'EQUITY').toUpperCase()==='EQUITY')all.push({...x,type:'EQUITY',leverage:1,currency:inferCurrency(x)});
  for(const x of CORE_ETFS||[])all.push({...x,type:'ETF',currency:inferCurrency(x)});
  for(const x of LEVERAGED_ETFS||[])all.push({...x,type:'LEVERAGED_ETF',currency:inferCurrency(x)});
  const seen=new Set(),out=[];
  for(const x of all){const symbol=String(x.symbol||'').toUpperCase();if(!symbol||seen.has(symbol))continue;seen.add(symbol);out.push({...x,symbol,currency:inferCurrency(x)})}
  return out;
}

async function spark(symbols,range='ytd',interval='1d'){
  if(!symbols.length)return[];
  const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');
  u.searchParams.set('symbols',symbols.join(','));u.searchParams.set('range',range);u.searchParams.set('interval',interval);u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
  const r=await fetch(u,{headers:HEADERS});if(!r.ok)throw new Error(`Yahoo Spark HTTP ${r.status}`);const j=await r.json();return j?.spark?.result||[];
}

function rowsFromSpark(item,fromMs,toMs){
  const res=item?.response?.[0];if(!res)return{rows:[],currency:null};
  const ts=res.timestamp||[],close=res?.indicators?.quote?.[0]?.close||[],rows=[];
  for(let i=0;i<Math.min(ts.length,close.length);i++){const t=num(ts[i])*1000,p=num(close[i],NaN);if(t>=fromMs&&t<toMs&&Number.isFinite(p)&&p>0)rows.push({ts:t,price:p})}
  return{rows,currency:String(res?.meta?.currency||'').toUpperCase()||null};
}

function fxRows(item){const res=item?.response?.[0];if(!res)return[];const ts=res.timestamp||[],close=res?.indicators?.quote?.[0]?.close||[],out=[];for(let i=0;i<Math.min(ts.length,close.length);i++){const t=num(ts[i])*1000,p=num(close[i],NaN);if(Number.isFinite(p)&&p>0)out.push({ts:t,rate:p})}return out}
function lastRate(rows,ts){if(!rows?.length)return 1;let lo=0,hi=rows.length-1,ans=rows[0].rate;while(lo<=hi){const m=(lo+hi)>>1;if(rows[m].ts<=ts){ans=rows[m].rate;lo=m+1}else hi=m-1}return ans}
async function buildFx(currencies){
  const out=new Map([['EUR',[]]]),needed=[...new Set(currencies.filter(c=>c&&c!=='EUR'))],pairs=[];for(const c of needed)pairs.push(`${c}EUR=X`,`EUR${c}=X`);
  const raw=[];for(const batch of chunks(pairs,40))raw.push(...await spark(batch,'ytd','1d'));
  const map=new Map();for(const it of raw){const symbol=String(it.symbol||it?.response?.[0]?.meta?.symbol||'').toUpperCase();map.set(symbol,fxRows(it))}
  for(const c of needed){const direct=map.get(`${c}EUR=X`)||[],inverse=map.get(`EUR${c}=X`)||[];if(direct.length)out.set(c,direct);else if(inverse.length)out.set(c,inverse.map(x=>({ts:x.ts,rate:1/x.rate})));else out.set(c,[])}return out;
}
function eurRate(currency,ts,fx){return currency==='EUR'?1:lastRate(fx.get(currency)||[],ts)}
function slipFor(info,cfg){return (info.type==='LEVERAGED_ETF'?cfg.leveragedSlippagePercent:cfg.slippagePercent)/100}

function opportunities(info,rows,fx,cfg){
  const out=[],slip=Math.max(0,slipFor(info,cfg)),currency=info.currency||'USD';
  for(let i=0;i<rows.length-1;i++){
    const buyFx=eurRate(currency,rows[i].ts,fx),buyNative=rows[i].price*(1+slip),buyEur=buyNative*buyFx;if(!(buyEur>0))continue;let best=null;
    for(let j=i+1;j<rows.length;j++){
      const sellFx=eurRate(currency,rows[j].ts,fx),sellNative=rows[j].price*(1-slip),sellEur=sellNative*sellFx,ratio=sellEur/buyEur;
      if(ratio>1&&(!best||ratio>best.ratio))best={symbol:info.symbol,name:info.name||info.symbol,type:info.type||'EQUITY',leverage:num(info.leverage,1),currency,buyTs:rows[i].ts,sellTs:rows[j].ts,buyPrice:rows[i].price,sellPrice:rows[j].price,buyExec:buyNative,sellExec:sellNative,buyFx,sellFx,buyEur,sellEur,ratio,durationDays:(rows[j].ts-rows[i].ts)/86400000};
    }
    if(best)out.push(best);
  }return out;
}

function executeBudget(budget,opp,cfg){const fixed=Math.max(0,cfg.feeFixed),pct=Math.max(0,cfg.feePercent)/100,order=(budget-fixed)/(1+pct);if(!(order>0))return null;const buyFee=fixed+order*pct,gross=order*opp.ratio,sellFee=fixed+gross*pct,end=gross-sellFee;if(!(end>0))return null;return{budget,order,buyFee,gross,sellFee,end,pnl:end-budget}}
function minProfitableBudget(opp,cfg){let lo=.01,hi=10000;const good=b=>{const x=executeBudget(b,opp,cfg);return x&&x.pnl>.005};if(!good(hi))return Infinity;for(let i=0;i<22;i++){const m=(lo+hi)/2;if(good(m))hi=m;else lo=m}return hi}

function optimize(opps,cfg){
  const byStart=new Map();for(const o of opps){const edge=(o.ratio-1)/Math.max(1,o.durationDays);if(edge<=0)continue;if(!byStart.has(o.buyTs))byStart.set(o.buyTs,[]);byStart.get(o.buyTs).push({...o,edge})}
  const pruned=[];for(const list of byStart.values())pruned.push(...list.sort((a,b)=>b.edge-a.edge||b.ratio-a.ratio).slice(0,50));
  const starts=new Map(),times=new Set();for(const o of pruned){if(!starts.has(o.buyTs))starts.set(o.buyTs,[]);starts.get(o.buyTs).push(o);times.add(o.buyTs);times.add(o.sellTs)}
  const timeline=[...times].sort((a,b)=>a-b),open=[],actions=[];let cash=100;
  for(const ts of timeline){
    for(let i=open.length-1;i>=0;i--){const p=open[i];if(p.opp.sellTs<=ts){cash+=p.exec.end;actions.push({...p.opp,...p.exec});open.splice(i,1)}}
    const pool=(starts.get(ts)||[]).map(o=>({o,min:minProfitableBudget(o,cfg),edge:o.edge})).filter(x=>Number.isFinite(x.min)&&x.min<=cash&&x.edge>0).sort((a,b)=>b.edge-a.edge||b.o.ratio-a.o.ratio);if(!pool.length||cash<=0)continue;
    const chosen=[];let minNeed=0;for(const x of pool){if(minNeed+x.min<=cash+.0001){chosen.push(x);minNeed+=x.min}}if(!chosen.length)continue;
    const extra=Math.max(0,cash-minNeed),edgeSum=chosen.reduce((s,x)=>s+Math.max(.000001,x.edge),0);let spent=0;
    for(let i=0;i<chosen.length;i++){const x=chosen[i],budget=i===chosen.length-1?Math.max(x.min,cash-spent):x.min+extra*(x.edge/edgeSum),ex=executeBudget(budget,x.o,cfg);if(!ex||ex.pnl<=0)continue;spent+=budget;open.push({opp:x.o,exec:ex})}cash=Math.max(0,cash-spent);
  }
  for(const p of open){cash+=p.exec.end;actions.push({...p.opp,...p.exec})}
  actions.sort((a,b)=>a.buyTs-b.buyTs||a.sellTs-b.sellTs);let running=100;for(const a of actions){a.startCapital=running;running+=a.pnl;a.endCapital=running}return{capital:cash,path:actions};
}

export async function runLastWeekHindsight(env,options={}){
  const cfg={feeFixed:Math.max(0,num(options.feeFixed,1)),feePercent:Math.max(0,num(options.feePercent,0)),slippagePercent:Math.max(0,num(options.slippagePercent,.10)),leveragedSlippagePercent:Math.max(0,num(options.leveragedSlippagePercent,.20))};
  const p=period(),universe=await loadUniverse(env),lookup=new Map(universe.map(x=>[x.symbol,x])),series=[];let usableSymbols=0,failedBatches=0;
  for(const batch of chunks(universe,BATCH)){
    try{const raw=await spark(batch.map(x=>x.symbol),'ytd','1d');for(const item of raw){const symbol=String(item.symbol||item?.response?.[0]?.meta?.symbol||'').toUpperCase(),base=lookup.get(symbol);if(!base)continue;const parsed=rowsFromSpark(item,p.from.getTime(),p.to.getTime());if(parsed.rows.length<2)continue;usableSymbols++;series.push({info:{...base,currency:parsed.currency||base.currency},rows:parsed.rows})}}catch{failedBatches++}
  }
  if(!usableSymbols)throw new Error(`Keine historischen Kursdaten geladen (${failedBatches} fehlgeschlagene Datenbatches).`);
  const fx=await buildFx(series.map(x=>x.info.currency)),opps=[];for(const x of series)opps.push(...opportunities(x.info,x.rows,fx,cfg));const best=optimize(opps,cfg);
  const trades=best.path.map((x,i)=>({no:i+1,symbol:x.symbol,name:x.name,type:x.type,leverage:x.leverage,currency:x.currency,buyAt:new Date(x.buyTs).toISOString(),sellAt:new Date(x.sellTs).toISOString(),buyPrice:x.buyPrice,sellPrice:x.sellPrice,buyExecutionPrice:x.buyExec,sellExecutionPrice:x.sellExec,buyFx:x.buyFx,sellFx:x.sellFx,startCapital:x.startCapital,orderValue:x.order,buyFee:x.buyFee,sellGross:x.gross,sellFee:x.sellFee,endCapital:x.endCapital,pnl:x.pnl,returnPct:x.budget?x.pnl/x.budget*100:0}));
  const counts={equities:universe.filter(x=>x.type==='EQUITY').length,etfs:universe.filter(x=>x.type==='ETF').length,leveragedEtfs:universe.filter(x=>x.type==='LEVERAGED_ETF').length};
  return{mode:'YTD_HINDSIGHT_EUR_ALL',label:p.label,from:p.from.toISOString(),toExclusive:p.to.toISOString(),startCapital:100,endCapital:best.capital,profit:best.capital-100,returnPct:best.capital-100,trades,scannedSymbols:universe.length,usableSymbols,failedBatches,universeCounts:counts,rules:{stocks:true,etfs:true,leveragedEtfs:true,baseCurrency:'EUR',tradeLimit:null,positionLimit:null,minHoldDays:null,parallelPositions:true,capitalLimit:100,feeFixed:cfg.feeFixed,feePercent:cfg.feePercent,slippagePercent:cfg.slippagePercent,leveragedSlippagePercent:cfg.leveragedSlippagePercent,dataInterval:'1d-close'},note:'Rückblick 01.01.2026 bis heute aus Sicht eines EUR-Anlegers. Aktien, normale ETFs sowie Hebel-/Inverse-ETFs werden gemeinsam untersucht. Historische Wechselkurse, Kauf-/Verkaufsgebühren und Ausführungspuffer werden berücksichtigt. Die Suche nutzt verfügbare Tages-Schlusskurse und vollständige Rückschau; sie ist keine Prognose und keine mathematische Garantie des absoluten Optimums.'};
}
