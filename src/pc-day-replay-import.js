// Importiert einen lokal auf dem Windows-Agent berechneten Tages-Replay in dieselbe
// Lernstatistik wie der Cloudflare-Replay. Dadurch kann der PC abends rechnen und
// erst am naechsten Morgen synchronisieren, falls Cloudflare nachts nicht erreichbar ist.

const LEARN_KEY='state/day-replay-learning-v1';
const REPORT_KEY='state/day-replay-report-v1';
const IMPORT_KEY='state/pc-day-replay-import-v1';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const read=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const write=(storage,k,v)=>{try{storage?.kv?.put(k,v)}catch{}};
const safeBucket=v=>{const x=String(v||'').toUpperCase();if(x==='NORMAL_ENTRY')return'NORMAL';return['PULLBACK_RETEST','EARLY_BREAKOUT','NORMAL'].includes(x)?x:null};

function learnDefaults(){return{version:1,samples:{},seen:{},completedDays:0,lastDate:null}}
function aggregateResult(learn,date,r){
 const sample=r?.firstSafeAfterSeen||r?.bestSafeEntry;if(!sample)return false;const bucket=safeBucket(sample?.mode);if(!bucket)return false;
 const id=`PC:${date}:${String(r?.symbol||'').toUpperCase()}:${num(sample?.ts)}`;learn.seen=learn.seen||{};if(learn.seen[id])return false;learn.seen[id]=1;
 const f=sample?.forward||{},s=learn.samples?.[bucket]||{count:0,wins30:0,wins60:0,sum30:0,sum60:0,sumMfe:0,sumMae:0};
 s.count++;if(num(f.f30)>0)s.wins30++;if(num(f.f60)>0)s.wins60++;s.sum30+=num(f.f30);s.sum60+=num(f.f60);s.sumMfe+=num(f.mfe120);s.sumMae+=num(f.mae120);learn.samples=learn.samples||{};learn.samples[bucket]=s;return true;
}

export function importPcDayReplay(storage,payload={}){
 const date=String(payload?.date||'').slice(0,10),results=arr(payload?.results);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!results.length)return{ok:false,status:400,error:'PC-Replay enthaelt kein gueltiges Datum oder keine Ergebnisse.'};
 const imports=read(storage,IMPORT_KEY,{dates:{}}),signature=String(payload?.signature||`${date}:${results.length}:${payload?.completedAt||''}`).slice(0,180);imports.dates=imports.dates||{};
 if(imports.dates[date]===signature)return{ok:true,duplicate:true,date,importedSamples:0};
 const existing=read(storage,REPORT_KEY,null);
 if(existing?.date===date&&existing?.status==='COMPLETE'&&existing?.source!=='PC_LOCAL_REPLAY'){
  imports.dates[date]=signature;imports.updatedAt=new Date().toISOString();write(storage,IMPORT_KEY,imports);
  return{ok:true,duplicate:true,date,importedSamples:0,reason:'Cloudflare-Fallback-Replay fuer diesen Tag war bereits komplett; PC-Ergebnis wird nicht doppelt gelernt.'};
 }
 const learn={...learnDefaults(),...read(storage,LEARN_KEY,learnDefaults())};let added=0;for(const r of results)if(aggregateResult(learn,date,r))added++;
 if(Object.keys(learn.seen||{}).length>900){const ks=Object.keys(learn.seen).slice(-650);learn.seen=Object.fromEntries(ks.map(k=>[k,1]))}
 if(learn.lastDate!==date){learn.completedDays=num(learn.completedDays)+1;learn.lastDate=date}learn.updatedAt=new Date().toISOString();write(storage,LEARN_KEY,learn);
 const summary=payload?.summary||null,report={version:1,date,status:'COMPLETE',source:'PC_LOCAL_REPLAY',createdAt:payload?.createdAt||new Date().toISOString(),completedAt:payload?.completedAt||new Date().toISOString(),processed:results.length,total:results.length,results:results.slice(0,72),errors:arr(payload?.errors).slice(0,20),summary};write(storage,REPORT_KEY,report);
 imports.dates[date]=signature;imports.updatedAt=new Date().toISOString();write(storage,IMPORT_KEY,imports);
 return{ok:true,date,source:'PC_LOCAL_REPLAY',importedSamples:added,totalResults:results.length,learningBuckets:Object.entries(learn.samples||{}).map(([bucket,s])=>({bucket,count:num(s?.count),avg30:s?.count?+(num(s.sum30)/s.count).toFixed(3):0,avg60:s?.count?+(num(s.sum60)/s.count).toFixed(3):0})).slice(0,8)};
}

export function getPcReplayImportStatus(storage){const x=read(storage,IMPORT_KEY,{dates:{}});return{enabled:true,importedDates:Object.keys(x?.dates||{}).slice(-8),lastImportAt:x?.updatedAt||null,offlineNightSync:true,nextMorningSync:true,duplicateDayLearningBlocked:true}}
