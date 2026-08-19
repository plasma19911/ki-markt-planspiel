const REPORT_KEY='state/day-replay-report-v1';
const CAPTURE_KEY='state/day-replay-capture-v1';
const FINAL_MARKER_KEY='state/day-replay-final-marker-v1';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const read=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const write=(storage,k,v)=>{try{storage?.kv?.put(k,v)}catch{}};

function berlinParts(ts=Date.now()){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ts)),o={};
 for(const x of p)o[x.type]=x.value;
 return{date:`${o.year}-${o.month}-${o.day}`,minute:num(o.hour)*60+num(o.minute)};
}

function partialSummary(report){
 const results=arr(report?.results),mistakes={};
 for(const r of results)for(const m of arr(r?.mistakes))mistakes[m]=num(mistakes[m])+1;
 return{
  provisional:true,
  symbolsAnalysed:results.filter(x=>!x?.error).length,
  errors:arr(report?.errors).length,
  mistakes,
  churn:report?.summary?.churn||{rapidRoundTrips:0,totalRapidTradePnl:0,fees:0,rows:[]},
  bestMissed:results.filter(x=>arr(x?.mistakes).includes('MISSED_SAFE_MOVE')).slice(0,8),
  worstEntries:results.filter(x=>arr(x?.actualBuys).length).sort((a,b)=>num(b?.entryRegretPct)-num(a?.entryRegretPct)).slice(0,8)
 };
}

// At 23:05 Berlin the gettex trading window is over. Rebuild the report once from
// the final capture so trades/candidates that appeared after the 22:05 preliminary
// replay cannot be omitted from the final daily evaluation.
export function prepareFinalDayReplay(storage,ts=Date.now()){
 const now=berlinParts(ts),marker=read(storage,FINAL_MARKER_KEY,null);
 if(marker?.date===now.date)return{reset:false,date:now.date,reason:'already-prepared'};
 const report=read(storage,REPORT_KEY,null);
 if(report?.date===now.date)write(storage,REPORT_KEY,{version:1,date:'',status:'RESET_FOR_FINAL',resetAt:new Date(ts).toISOString()});
 write(storage,FINAL_MARKER_KEY,{date:now.date,preparedAt:new Date(ts).toISOString()});
 return{reset:Boolean(report?.date===now.date),date:now.date,reason:'final-capture-rebuild'};
}

export function augmentDayReplayStatus(storage,baseStatus={},ts=Date.now()){
 const now=berlinParts(ts),capture=read(storage,CAPTURE_KEY,null),report=read(storage,REPORT_KEY,null),out={...(baseStatus||{})};
 const captureToday=capture?.date===now.date?capture:null,reportToday=report?.date===now.date?report:null,beforeFinal=now.minute<23*60+5;
 out.capture=captureToday?{date:captureToday.date,symbolCount:num(captureToday.symbolCount,Object.keys(captureToday.symbols||{}).length),updatedAt:captureToday.updatedAt||null}:null;
 out.schedule={preliminaryFromBerlin:'22:05',finalFromBerlin:'23:05',cloudflareFallbackAlways:true,pcReplayOptional:true};
 if(reportToday){
  const summary=reportToday.summary||partialSummary(reportToday),displayStatus=beforeFinal&&reportToday.status==='COMPLETE'?'PRELIMINARY_COMPLETE':reportToday.status,provisional=displayStatus!=='COMPLETE';
  if(provisional)summary.provisional=true;
  out.report={...(out.report||{}),date:reportToday.date,status:displayStatus,processed:num(reportToday.processed),total:num(reportToday.total),completedAt:provisional?null:(reportToday.completedAt||null),updatedAt:reportToday.updatedAt||null,summary,provisional};
 }else if(captureToday){
  out.report={date:now.date,status:'CAPTURING',processed:0,total:num(captureToday.symbolCount,Object.keys(captureToday.symbols||{}).length),completedAt:null,updatedAt:captureToday.updatedAt||null,summary:{provisional:true,symbolsAnalysed:0,errors:0,mistakes:{},churn:{rapidRoundTrips:0,totalRapidTradePnl:0,fees:0,rows:[]}},provisional:true};
 }
 return out;
}
