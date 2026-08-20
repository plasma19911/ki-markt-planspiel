const LIVE_KEY='state/zero-live-signal-learning-v1';
const DECISION_KEY='state/trade-decision-learning-v1';
const CLEAN_EPOCH='V27_CLEAN_2026-08-20';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v||'').toUpperCase().trim();
const read=(storage,k)=>{try{return storage?.kv?.get(k)||null}catch{return null}};
const write=(storage,k,v)=>{try{storage?.kv?.put(k,v);return true}catch{return false}};
const exitHoldConflict=reason=>/FINAL-CONTROLLER HARD EXIT/i.test(String(reason||''))&&/(?:ADAPTIVE\s+EXIT[- ]?HOLD|EXIT[- ]?HOLD|VERKÄUFERSTRUKTUR[^.]{0,90}(?:NICHT|NOCH NICHT)[^.]{0,90}(?:STARK|AUSREICHEND)|WEITER BEOBACHTEN)/i.test(String(reason||''));

export function isKnownBugHistoryRow(row={}){
 const reason=String(row?.reason||'');
 if(/ACTIVE-LEARNING-CASH/i.test(reason))return true;
 if(/AUFSTOCKUNG:|STARTER-AUSBAU/i.test(reason))return true;
 if(/FINAL-CONTROLLER INVALIDATION EXIT:[\s\S]*Alter\s+\d+(?:[.,]\d+)?\s*Min/i.test(reason))return true;
 if(/ZERO_MINIMUM_NOT_AFFORDABLE/i.test(reason))return true;
 if(exitHoldConflict(reason))return true;
 return false;
}

function contaminatedWindows(history=[]){
 const rows=arr(history).filter(x=>key(x?.symbol)&&['KAUF','BUY','VERKAUF','SELL'].includes(String(x?.action||'').toUpperCase())).sort((a,b)=>Date.parse(a.ts)-Date.parse(b.ts));
 const open=new Map(),lastBugSell=new Map(),out=[];
 for(const r0 of rows){
  const s=key(r0.symbol),a=String(r0.action||'').toUpperCase(),r={...r0};
  if(['KAUF','BUY'].includes(a)){
   const bugSell=lastBugSell.get(s),bt=Date.parse(String(bugSell?.ts||'')),rt=Date.parse(String(r?.ts||''));
   if(Number.isFinite(bt)&&Number.isFinite(rt)&&rt-bt>=0&&rt-bt<=30*60000)r.__bugReentry=true;
   open.set(s,r);continue;
  }
  if(['VERKAUF','SELL'].includes(a)&&open.has(s)){
   const buy=open.get(s),sellBad=isKnownBugHistoryRow(r),buyBad=isKnownBugHistoryRow(buy)||Boolean(buy.__bugReentry),bad=buyBad||sellBad;
   if(bad)out.push({symbol:s,buyAt:buy.ts,sellAt:r.ts,buyBad,sellBad,bugReentry:Boolean(buy.__bugReentry)});
   if(sellBad)lastBugSell.set(s,r);
   open.delete(s);continue;
  }
  if(['VERKAUF','SELL'].includes(a)&&isKnownBugHistoryRow(r))lastBugSell.set(s,r);
 }
 for(const [s,buy] of open)if(isKnownBugHistoryRow(buy)||buy.__bugReentry)out.push({symbol:s,buyAt:buy.ts,sellAt:null,buyBad:true,sellBad:false,bugReentry:Boolean(buy.__bugReentry)});
 return out;
}

function sampleMatchesWindow(sample,w){
 if(key(sample?.symbol)!==w.symbol)return false;
 const sb=Date.parse(String(sample?.buyAt||'')),ss=Date.parse(String(sample?.sellAt||'')),wb=Date.parse(String(w.buyAt||'')),ws=Date.parse(String(w.sellAt||''));
 if(Number.isFinite(sb)&&Number.isFinite(wb)&&Math.abs(sb-wb)<=120000)return true;
 if(Number.isFinite(ss)&&Number.isFinite(ws)&&Math.abs(ss-ws)<=120000)return true;
 return false;
}

function timingMatchesWindow(r,w){
 if(key(r?.symbol)!==w.symbol)return false;
 const t=num(r?.at),b=Date.parse(String(w.buyAt||'')),s=Date.parse(String(w.sellAt||''));if(!(t>0&&Number.isFinite(b)))return false;
 const from=b-2*60000,to=Number.isFinite(s)?s+70*60000:b+4*3600000;
 return t>=from&&t<=to;
}

function decrementTimingStat(state,r){
 const bucket=String(r?.bucket||''),h=String(num(r?.horizonMin)),st=state?.timingStats?.[bucket]?.[h];if(!st||num(st.count)<=0)return;
 const pnl=num(r.pnlPct),mae=num(r.maePct),mfe=num(r.mfePct);st.count=Math.max(0,num(st.count)-1);st.wins=Math.max(0,num(st.wins)-(pnl>0?1:0));st.sumPnl=num(st.sumPnl)-pnl;st.sumAbsPnl=Math.max(0,num(st.sumAbsPnl)-Math.abs(pnl));st.sumMae=num(st.sumMae)-mae;st.sumMfe=num(st.sumMfe)-mfe;
}

function archiveLegacyAggregate(live){
 if(live?.learningEpoch===CLEAN_EPOCH)return false;
 live.legacyBeforeV27={
  archivedAt:new Date().toISOString(),completed:num(live?.completed),timedCompleted:num(live?.timedCompleted),
  stats:live?.stats||{},timingStats:live?.timingStats||{},recentTiming:arr(live?.recentTiming),
  reason:'Vor V27 enthielten Aggregate sowohl Marktbeobachtungen als auch Phasen mit nachgewiesenen Entscheidungsbugs; ohne Einzelprovenienz nicht sauber trennbar.'
 };
 live.stats={};live.timingStats={};live.recentTiming=[];live.completed=0;live.timedCompleted=0;live.open={};live.pending={};live.learningEpoch=CLEAN_EPOCH;return true;
}

export function sanitizeBugContaminatedLearning(storage,history=[]){
 const windows=contaminatedWindows(history);let changed=false,decisionSamplesRemoved=0,timingSamplesRemoved=0,openRowsRemoved=0,pendingRowsRemoved=0,legacyAggregateArchived=false;
 const decision=read(storage,DECISION_KEY);
 if(decision&&typeof decision==='object'){
  const before=arr(decision.samples),removed=before.filter(s=>windows.some(w=>sampleMatchesWindow(s,w))),keep=before.filter(s=>!windows.some(w=>sampleMatchesWindow(s,w)));
  if(removed.length){decision.samples=keep;decisionSamplesRemoved=removed.length;changed=true;decision.seen=decision.seen||{};for(const s of removed)if(s?.id)decision.seen[s.id]='QUARANTINED_CODE_BUG'}
  decision.learningQuarantine={version:3,updatedAt:new Date().toISOString(),knownBugTradeWindows:windows.length,removedSamples:decisionSamplesRemoved,blockedFromReentry:true,antiFlipFlop:true,rule:'Nachgewiesene Codefehler und unmittelbare Reentries nach solchen Fehler-Sells werden ausgeschlossen; normale schlechte Trades bleiben Lernmaterial.'};
  write(storage,DECISION_KEY,decision);
 }
 const live=read(storage,LIVE_KEY);
 if(live&&typeof live==='object'){
  const recent=arr(live.recentTiming),keep=[];
  for(const r of recent){if(windows.some(w=>timingMatchesWindow(r,w))){decrementTimingStat(live,r);timingSamplesRemoved++;changed=true}else keep.push(r)}
  if(timingSamplesRemoved){live.recentTiming=keep;live.timedCompleted=Math.max(0,num(live.timedCompleted)-timingSamplesRemoved)}
  for(const bucket of Object.values(live.timingStats||{}))for(const [h,st] of Object.entries(bucket||{}))if(num(st?.count)<=0)delete bucket[h];
  for(const s of Object.keys(live.open||{}))if(windows.some(w=>w.symbol===key(s))){delete live.open[s];openRowsRemoved++;changed=true}
  for(const s of Object.keys(live.pending||{}))if(windows.some(w=>w.symbol===key(s))){delete live.pending[s];pendingRowsRemoved++;changed=true}
  legacyAggregateArchived=archiveLegacyAggregate(live);if(legacyAggregateArchived)changed=true;
  live.learningQuarantine={version:3,updatedAt:new Date().toISOString(),cleanEpoch:CLEAN_EPOCH,knownBugTradeWindows:windows.length,timingSamplesRemoved,openRowsRemoved,pendingRowsRemoved,legacyAggregateArchived,legacyAggregateActive:false,antiFlipFlop:true,rule:'Alte nicht sauber zuordenbare Live-Aggregate sind archiviert. Widersprüchliche HARD-EXIT/EXIT-HOLD-Fälle und direkte Reentries danach werden nicht als Marktlektion gewertet.'};
  write(storage,LIVE_KEY,live);
 }
 return{changed,cleanEpoch:CLEAN_EPOCH,knownBugTradeWindows:windows.length,decisionSamplesRemoved,timingSamplesRemoved,openRowsRemoved,pendingRowsRemoved,legacyAggregateArchived,legacyAggregateActive:false,antiFlipFlop:true,windows:windows.slice(-8)};
}
