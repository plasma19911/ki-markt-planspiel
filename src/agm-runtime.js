import {AGM_PREVIEW_RULES,agmDaysUntil} from './agm-opportunity-scoring.js';

const CACHE_MS=15*60*1000;
let cached=null,cachedAt=0,lastError=null;
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

function emptyCalendar(){return{version:27.6,source:'finanzen.net Hauptversammlung',sourceUpdatedAt:null,generatedAt:new Date().toISOString(),refreshCadence:'daily',scoreEvaluationCadence:'daily',scoreReevaluation:'once daily only',scoreMeaning:'0-100 interner Chancen-Score; keine Gewinnwahrscheinlichkeit',events:[],error:lastError};}

export async function loadAgmCalendar(env,force=false){
 if(!force&&cached&&Date.now()-cachedAt<CACHE_MS)return cached;
 try{
  const assets=env?.ASSETS;if(!assets?.fetch)throw new Error('ASSETS-Binding fehlt');
  const r=await assets.fetch(new Request(`https://assets.local/agm-calendar.json?runtime=${Date.now()}`));
  if(!r.ok)throw new Error(`agm-calendar.json HTTP ${r.status}`);
  const j=await r.json();if(!Array.isArray(j?.events))throw new Error('agm-calendar.json ohne events[]');
  cached=j;cachedAt=Date.now();lastError=null;return cached;
 }catch(e){lastError=String(e?.message||e).slice(0,220);return cached||emptyCalendar();}
}

export function evaluateAgmCalendarData(calendar,state={},candidateOverride=null,now=Date.now()){
 const held=new Set(arr(state?.positions).map(key));
 const source=calendar||emptyCalendar();
 const events=arr(source?.events).map(ev=>{
  const days=Number.isFinite(Number(ev?.daysUntil))?Number(ev.daysUntil):agmDaysUntil(ev?.date,now);
  const score=Math.round(num(ev?.baseScore,ev?.fundamentalScore??50));
  const confidence=Math.max(0,Math.min(1,num(ev?.fundamentalConfidence,0)));
  const positive=ev?.profitForecastPositive===true;
  const withinWindow=days!==null&&days>=1&&days<=AGM_PREVIEW_RULES.horizonDays;
  const dailyEligible=Boolean(withinWindow&&score>=AGM_PREVIEW_RULES.minimumScore&&confidence>=AGM_PREVIEW_RULES.minimumConfidence&&positive);
  return{...ev,daysUntil:days,score,confidence,label:ev?.baseLabel||ev?.label||'',profitOutlookPositive:positive,tradeEligible:Boolean(dailyEligible&&!held.has(key(ev))),alreadyHeld:held.has(key(ev)),scoreLocked:true};
 }).filter(x=>x.daysUntil===null||x.daysUntil>=0).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||num(b.score)-num(a.score));
 return{
  ...source,
  version:27.6,
  generatedAt:source?.updatedAt||source?.generatedAt||new Date(now).toISOString(),
  refreshCadence:'daily',
  scoreEvaluationCadence:'daily',
  scoreReevaluation:'once daily only',
  scoreLockedUntilNextDailyRefresh:true,
  events,
  error:lastError,
  rules:AGM_PREVIEW_RULES
 };
}

export async function evaluateAgmCalendar(env,state={},candidateOverride=null,now=Date.now()){
 const calendar=await loadAgmCalendar(env,false);
 return evaluateAgmCalendarData(calendar,state,candidateOverride,now);
}

export function agmRuntimeHealth(){return{cached:Boolean(cached),cachedAt:cachedAt?new Date(cachedAt).toISOString():null,lastError,scoreEvaluationCadence:'daily',scoreReevaluation:'once daily only',rules:AGM_PREVIEW_RULES};}
