const KEY='state/zero-live-signal-learning-v1';
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const arr=v=>Array.isArray(v)?v:[];

function invalidTiming(r={}){
 return Math.abs(num(r?.pnlPct))>35||Math.abs(num(r?.maePct))>50||Math.abs(num(r?.mfePct))>50;
}
function decStat(s,r){
 if(!s||num(s.count)<=0)return;
 const pnl=num(r.pnlPct),mae=num(r.maePct),mfe=num(r.mfePct);
 s.count=Math.max(0,num(s.count)-1);
 s.wins=Math.max(0,num(s.wins)-(pnl>0?1:0));
 s.sumPnl=num(s.sumPnl)-pnl;
 s.sumAbsPnl=Math.max(0,num(s.sumAbsPnl)-Math.abs(pnl));
 s.sumMae=num(s.sumMae)-mae;
 s.sumMfe=num(s.sumMfe)-mfe;
}
export function sanitizeFxContaminatedLearning(storage){
 let state;try{state=storage?.kv?.get(KEY)}catch{return{changed:false,error:'storage-read'}}
 if(!state||typeof state!=='object')return{changed:false,removedTiming:0,resetSetupBuckets:0,resetOpenRows:0};
 let changed=false,removedTiming=0,resetSetupBuckets=0,resetOpenRows=0;
 const recent=arr(state.recentTiming),keep=[];
 for(const r of recent){
  if(!invalidTiming(r)){keep.push(r);continue}
  const bucket=String(r?.bucket||''),h=String(num(r?.horizonMin));
  decStat(state?.timingStats?.[bucket]?.[h],r);
  removedTiming++;changed=true;
 }
 if(removedTiming){state.recentTiming=keep;state.timedCompleted=Math.max(0,num(state.timedCompleted)-removedTiming)}
 for(const [k,s] of Object.entries(state.stats||{})){
  const count=Math.max(1,num(s?.count));
  if(num(s?.sumAbsPnl)>count*35||Math.abs(num(s?.sumPnl))>count*35){state.stats[k]={count:0,wins:0,sumPnl:0,sumAbsPnl:0};state.completed=Math.max(0,num(state.completed)-num(s?.count));resetSetupBuckets++;changed=true}
 }
 for(const o of Object.values(state.open||{})){
  if(Math.abs(num(o?.lastPnlPct))>35||Math.abs(num(o?.minPnlPct))>50||Math.abs(num(o?.maxPnlPct))>50||Math.abs(num(o?.peakPnlPct))>50){
   o.lastPnlPct=0;o.minPnlPct=0;o.maxPnlPct=0;o.peakPnlPct=0;o.checkpoints={};resetOpenRows++;changed=true;
  }
 }
 if(changed){state.learningSanity={version:2,updatedAt:new Date().toISOString(),reason:'FX/quote anomaly samples removed',removedTiming,resetSetupBuckets,resetOpenRows};try{storage?.kv?.put(KEY,state)}catch{return{changed:false,error:'storage-write',removedTiming,resetSetupBuckets,resetOpenRows}}}
 return{changed,removedTiming,resetSetupBuckets,resetOpenRows};
}
