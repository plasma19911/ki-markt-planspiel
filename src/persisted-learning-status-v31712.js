const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

export const PERSISTED_LEARNING_STATUS_V31712={
  version:31.712,
  mode:'persisted-memory+current-candidates',
  storageKey:'outcome-learning-v312'
};

function recentRows(memory={},now=Date.now()){
  return arr(memory?.recent20).filter(x=>x&&Number.isFinite(Number(x.ts))&&now-num(x.ts)<7*24*60*60*1000);
}

export function persistedOutcomeStatusV31712(memory={},currentCandidates=[],currentStatus={},now=Date.now()){
  const recent=recentRows(memory,now),buys=recent.filter(x=>String(x?.action||'').toUpperCase()==='BUY');
  const net=x=>num(x?.netReturnPct,num(x?.returnPct)-num(x?.estimatedRoundTripCostPct,.45));
  const buyWins=buys.filter(x=>net(x)>=.10).length;
  const avgBuy=buys.length?buys.reduce((s,x)=>s+net(x),0)/buys.length:null;
  const persistedTracked=Object.keys(memory?.symbols&&typeof memory.symbols==='object'?memory.symbols:{}).length;
  const currentCount=arr(currentCandidates).filter(x=>String(x?.symbol||'').trim()&&Number(x?.price)>0).length;
  const currentTracked=num(currentStatus?.trackedSymbols),currentMatured=num(currentStatus?.matured),currentBuySamples=num(currentStatus?.buySamples);
  return{
    ...currentStatus,
    enabled:true,
    version:31.2,
    trackedSymbols:Math.max(currentTracked,persistedTracked),
    currentCandidates:currentCount,
    matured:Math.max(currentMatured,recent.length),
    buySamples:Math.max(currentBuySamples,buys.length),
    buyHitRate:currentBuySamples>0&&currentStatus?.buyHitRate!=null?currentStatus.buyHitRate:(buys.length?+(buyWins/buys.length*100).toFixed(1):null),
    avgBuy20mReturnPct:currentBuySamples>0&&currentStatus?.avgBuy20mReturnPct!=null?currentStatus.avgBuy20mReturnPct:(avgBuy==null?null:+avgBuy.toFixed(3)),
    avgBuy20mNetReturnPct:currentBuySamples>0&&currentStatus?.avgBuy20mNetReturnPct!=null?currentStatus.avgBuy20mNetReturnPct:(avgBuy==null?null:+avgBuy.toFixed(3)),
    weights:currentStatus?.weights||memory?.weights||null,
    persistedMemoryRecovered:persistedTracked>currentTracked||recent.length>currentMatured,
    statusSource:'PERSISTED_MEMORY+CURRENT_STATE'
  };
}
