import {CORE_ETFS,LEVERAGED_ETFS,chunks,num} from './constants.js';
import {PRIORITY_EQUITIES} from './priority-equities.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0'};
const BATCH=32;
const MAX_TRADES=5;
const MIN_HOLD_MS=60*60*1000;

function previousWeek(now=new Date()){
  const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  const sinceMonday=(today.getUTCDay()+6)%7;
  const thisMonday=new Date(today.getTime()-sinceMonday*86400000);
  const from=new Date(thisMonday.getTime()-7*86400000);
  const to=new Date(from.getTime()+5*86400000); // Samstag 00:00 exklusiv
  return{from,to,label:`${from.toLocaleDateString('de-DE',{timeZone:'UTC'})} – ${new Date(to.getTime()-86400000).toLocaleDateString('de-DE',{timeZone:'UTC'})}`};
}

async function loadUniverse(env,cfg){
  let data={equities:[]};
  try{
    const r=await env.ASSETS.fetch(new Request('https://assets.local/universe.json'));
    if(r.ok)data=await r.json();
  }catch{}
  const all=(data.equities||[]).filter(x=>x?.symbol).map(x=>({symbol:String(x.symbol).toUpperCase(),name:x.name||x.symbol,type:'EQUITY',leverage:1}));
  all.push(...PRIORITY_EQUITIES);
  if(cfg.includeEtfs)all.push(...CORE_ETFS);
  if(cfg.includeLeverage)all.push(...LEVERAGED_ETFS);
  const seen=new Set(),out=[];
  for(const x of all){
    const symbol=String(x.symbol||'').toUpperCase();
    if(!symbol||seen.has(symbol))continue;
    seen.add(symbol);
    out.push({...x,symbol});
  }
  return out;
}

async function spark(symbols){
  const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');
  u.searchParams.set('symbols',symbols.join(','));
  u.searchParams.set('range','1mo');
  u.searchParams.set('interval','30m');
  u.searchParams.set('indicators','close');
  u.searchParams.set('includePrePost','false');
  const r=await fetch(u,{headers:HEADERS});
  if(!r.ok)throw new Error(`Yahoo Spark HTTP ${r.status}`);
  const j=await r.json();
  return j?.spark?.result||[];
}

function rowsFromSpark(item,fromMs,toMs){
  const res=item?.response?.[0];
  if(!res)return[];
  const ts=res.timestamp||[];
  const close=res?.indicators?.quote?.[0]?.close||[];
  const rows=[];
  for(let i=0;i<Math.min(ts.length,close.length);i++){
    const t=num(ts[i])*1000,p=num(close[i],NaN);
    if(t>=fromMs&&t<toMs&&Number.isFinite(p)&&p>0)rows.push({ts:t,price:p});
  }
  return rows;
}

function dayKey(ts){return new Date(ts).toISOString().slice(0,10)}
function slipFor(type,cfg){return type==='LEVERAGED_ETF'?cfg.leveragedSlippagePercent:cfg.slippagePercent}

function bestDailyOpportunity(info,rows,cfg){
  const byDay=new Map();
  for(const r of rows){const k=dayKey(r.ts);if(!byDay.has(k))byDay.set(k,[]);byDay.get(k).push(r)}
  const out=[];
  for(const list of byDay.values()){
    if(list.length<3)continue;
    let best=null;
    const slip=slipFor(info.type,cfg)/100;
    for(let i=0;i<list.length-1;i++){
      for(let j=i+1;j<list.length;j++){
        if(list[j].ts-list[i].ts<MIN_HOLD_MS)continue;
        const buyExec=list[i].price*(1+slip),sellExec=list[j].price*(1-slip),ratio=sellExec/buyExec;
        if(!best||ratio>best.ratio)best={symbol:info.symbol,name:info.name||info.symbol,type:info.type||'EQUITY',leverage:num(info.leverage,1),buyTs:list[i].ts,sellTs:list[j].ts,buyPrice:list[i].price,sellPrice:list[j].price,buyExec,sellExec,ratio};
      }
    }
    if(best&&best.ratio>1)out.push(best);
  }
  return out;
}

function execute(capital,opp,cfg){
  const fixed=Math.max(0,cfg.feeFixed),pct=Math.max(0,cfg.feePercent)/100;
  const order=(capital-fixed)/(1+pct);
  if(!(order>0))return null;
  const buyFee=fixed+order*pct;
  const gross=order*opp.ratio;
  const sellFee=fixed+gross*pct;
  const end=gross-sellFee;
  if(!(end>0))return null;
  return{end,order,buyFee,gross,sellFee,pnl:end-capital,turnover:order+gross};
}

function previousCompatible(opps,i){
  let lo=0,hi=i-1,ans=-1;
  while(lo<=hi){const mid=(lo+hi)>>1;if(opps[mid].sellTs<=opps[i].buyTs){ans=mid;lo=mid+1}else hi=mid-1}
  return ans;
}

function optimize(opps,cfg){
  opps.sort((a,b)=>a.sellTs-b.sellTs||a.buyTs-b.buyTs);
  const n=opps.length;
  const prev=opps.map((_,i)=>previousCompatible(opps,i));
  const dp=Array.from({length:n+1},()=>Array(MAX_TRADES+1).fill(null));
  for(let i=0;i<=n;i++)dp[i][0]={capital:100,path:[],turnover:0};
  for(let i=1;i<=n;i++){
    for(let k=1;k<=MAX_TRADES;k++){
      const skip=dp[i-1][k];
      const base=dp[prev[i-1]+1][k-1];
      let take=null;
      if(base){
        const ex=execute(base.capital,opps[i-1],cfg);
        if(ex&&ex.end>base.capital+0.005){
          take={capital:ex.end,turnover:base.turnover+ex.turnover,path:[...base.path,{...opps[i-1],...ex,startCapital:base.capital}]};
        }
      }
      if(!skip)dp[i][k]=take;
      else if(!take)dp[i][k]=skip;
      else dp[i][k]=take.capital>skip.capital+1e-9?take:skip;
    }
  }
  let best={capital:100,path:[],turnover:0};
  for(let k=0;k<=MAX_TRADES;k++)if(dp[n][k]&&dp[n][k].capital>best.capital)best=dp[n][k];
  return best;
}

export async function runLastWeekHindsight(env,options={}){
  const cfg={
    includeEtfs:options.includeEtfs!==false,
    includeLeverage:options.includeLeverage!==false,
    feeFixed:Math.max(0,num(options.feeFixed,1)),
    feePercent:Math.max(0,num(options.feePercent,0)),
    slippagePercent:Math.max(0,num(options.slippagePercent,.10)),
    leveragedSlippagePercent:Math.max(0,num(options.leveragedSlippagePercent,.20))
  };
  const week=previousWeek();
  const universe=await loadUniverse(env,cfg);
  const lookup=new Map(universe.map(x=>[x.symbol,x]));
  const opportunities=[];
  let usableSymbols=0,failedBatches=0;
  for(const batch of chunks(universe,BATCH)){
    try{
      const raw=await spark(batch.map(x=>x.symbol));
      for(const item of raw){
        const symbol=String(item.symbol||item?.response?.[0]?.meta?.symbol||'').toUpperCase();
        const info=lookup.get(symbol);if(!info)continue;
        const rows=rowsFromSpark(item,week.from.getTime(),week.to.getTime());
        if(rows.length<3)continue;
        usableSymbols++;
        opportunities.push(...bestDailyOpportunity(info,rows,cfg));
      }
    }catch{failedBatches++}
  }
  const best=optimize(opportunities,cfg);
  const trades=best.path.map((x,i)=>({
    no:i+1,symbol:x.symbol,name:x.name,type:x.type,buyAt:new Date(x.buyTs).toISOString(),sellAt:new Date(x.sellTs).toISOString(),buyPrice:x.buyPrice,sellPrice:x.sellPrice,buyExecutionPrice:x.buyExec,sellExecutionPrice:x.sellExec,startCapital:x.startCapital,orderValue:x.order,buyFee:x.buyFee,sellGross:x.gross,sellFee:x.sellFee,endCapital:x.end,pnl:x.pnl,returnPct:x.startCapital?x.pnl/x.startCapital*100:0
  }));
  return{
    mode:'HINDSIGHT',
    label:week.label,
    from:week.from.toISOString(),
    toExclusive:week.to.toISOString(),
    startCapital:100,
    endCapital:best.capital,
    profit:best.capital-100,
    returnPct:best.capital-100,
    turnover:best.turnover,
    trades,
    scannedSymbols:universe.length,
    usableSymbols,
    failedBatches,
    rules:{maxTrades:MAX_TRADES,minHoldMinutes:MIN_HOLD_MS/60000,onePositionAtATime:true,fullCapitalPerTrade:true,feeFixed:cfg.feeFixed,feePercent:cfg.feePercent,slippagePercent:cfg.slippagePercent,leveragedSlippagePercent:cfg.leveragedSlippagePercent},
    note:'Rückblick mit vollständiger Kenntnis der vergangenen Woche. Optimiert auf höchsten gefundenen Endwert unter den Regeln; keine Prognose und kein realistischer Beweis, dass diese Trades vorher erkennbar gewesen wären.'
  };
}
