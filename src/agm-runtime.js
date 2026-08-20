import {scoreAgmCalendar,AGM_PREVIEW_RULES} from './agm-opportunity-scoring.js';

const CACHE_MS=15*60*1000;
let cached=null,cachedAt=0,lastError=null;
const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

function emptyCalendar(){return{version:27.6,source:'finanzen.net Hauptversammlung',sourceUpdatedAt:null,generatedAt:new Date().toISOString(),refreshCadence:'daily',scoreReevaluation:'every market/news scan',scoreMeaning:'0-100 interner Chancen-Score; keine Gewinnwahrscheinlichkeit',events:[],error:lastError};}

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
 const candidates=arr(candidateOverride?.length?candidateOverride:state?.candidates),newsRadar=arr(state?.newsRadar);
 const scored=scoreAgmCalendar(calendar||emptyCalendar(),{candidates,newsRadar,now});
 const held=new Set(arr(state?.positions).map(key));
 scored.events=scored.events.map(x=>({...x,alreadyHeld:held.has(key(x)),tradeEligible:Boolean(x.tradeEligible&&!held.has(key(x)))}));
 return{...scored,error:lastError,rules:AGM_PREVIEW_RULES};
}

export async function evaluateAgmCalendar(env,state={},candidateOverride=null,now=Date.now()){
 const calendar=await loadAgmCalendar(env,false);
 return evaluateAgmCalendarData(calendar,state,candidateOverride,now);
}

export function agmRuntimeHealth(){return{cached:Boolean(cached),cachedAt:cachedAt?new Date(cachedAt).toISOString():null,lastError,rules:AGM_PREVIEW_RULES};}
