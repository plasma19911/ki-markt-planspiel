const ENTRY_KEY='state/score-entry-exit-v294';
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const arr=v=>Array.isArray(v)?v:[];
const read=(storage,d)=>{try{return storage?.kv?.get(ENTRY_KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(ENTRY_KEY,v);return true}catch{return false}};

export const EXECUTED_ENTRY_BASELINE_V301={version:30.1,source:'EXECUTED_FINAL_BUY_V301',maxOpenAgeMs:180000};

export function persistExecutedEntryBaselinesV301(state={},selected=[],storage=null,now=Date.now()){
  const positions=new Map(arr(state?.positions).map(p=>[key(p),p]).filter(([s])=>s));
  const mem={...(read(storage,{entries:{},stats:{}})||{})};mem.entries={...(mem.entries||{})};mem.stats={...(mem.stats||{})};
  let stored=0,skipped=0;
  for(const row of arr(selected)){
    const s=key(row),p=positions.get(s),score=num(row?.daytradeDipScore,row?.decisionScore??row?.buyScore);
    if(!s||!p||!Number.isFinite(score)){skipped++;continue}
    const opened=Date.parse(String(p?.opened_at??p?.openedAt??''));
    if(!Number.isFinite(opened)||Math.abs(now-opened)>EXECUTED_ENTRY_BASELINE_V301.maxOpenAgeMs){skipped++;continue}
    const old=mem.entries[s];
    if(old?.source===EXECUTED_ENTRY_BASELINE_V301.source&&Math.abs(num(old?.at)-opened)<1000){skipped++;continue}
    const entryPrice=num(p?.entry_price??p?.entryPrice),lastPrice=num(p?.last_price??p?.price,entryPrice);
    mem.entries[s]={score:+score.toFixed(1),lastStable:+score.toFixed(1),entryPrice,lastPrice,at:opened,lastAt:now,source:'CONFIRMED_POSITION_BASELINE',seedSource:EXECUTED_ENTRY_BASELINE_V301.source,executedFinalDecisionScore:+score.toFixed(1),fullSeen:true};
    stored++;
  }
  if(stored){mem.stats.executedFinalBaselines=num(mem.stats.executedFinalBaselines)+stored;mem.updatedAt=new Date(now).toISOString();write(storage,mem)}
  return{stored,skipped,entries:mem.entries};
}
