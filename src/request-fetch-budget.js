import {AsyncLocalStorage} from 'node:async_hooks';

// One stable transport wrapper for the isolate; per-request counters/caches live in
// AsyncLocalStorage. This avoids swapping globalThis.fetch while concurrent Worker
// requests are active, but preserves the existing Free-tier soft caps.
const INSTALL_KEY='__kiRequestFetchBudgetV2';
const ALS_KEY='__kiRequestFetchBudgetAlsV1';
const als=globalThis[ALS_KEY]||(globalThis[ALS_KEY]=new AsyncLocalStorage());

const snap=async r=>({status:r.status,statusText:r.statusText,headers:[...r.headers.entries()],body:await r.clone().arrayBuffer()});
const restore=x=>new Response(x.body.slice(0),{status:x.status,statusText:x.statusText,headers:x.headers});
const textUrl=input=>{try{return typeof input==='string'||input instanceof URL?String(input):String(input?.url||'')}catch{return''}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

if(!globalThis[INSTALL_KEY]){
 const nativeFetch=globalThis.fetch.bind(globalThis);
 globalThis[INSTALL_KEY]={installedAt:new Date().toISOString(),requestLocal:true,crossRequestPromiseSharing:false,requestLocalTaskDedupe:true};
 globalThis.fetch=async function requestBudgetFetch(input,init){
  const ctx=als.getStore();
  if(!ctx)return nativeFetch(input,init);
  const method=String(init?.method||(input instanceof Request?input.method:'GET')||'GET').toUpperCase(),url=textUrl(input),cacheable=method==='GET'&&Boolean(url);
  if(cacheable&&ctx.cache.has(url)){ctx.stats.cacheHits++;return restore(await ctx.cache.get(url))}
  if(ctx.stats.actual>=ctx.cap){ctx.stats.blocked++;return new Response(JSON.stringify({error:ctx.blockedError}),{status:429,headers:{'content-type':'application/json','x-ki-fetch-budget':'blocked'}})}
  ctx.stats.actual++;
  if(!cacheable)return nativeFetch(input,init);
  const work=Promise.resolve(nativeFetch(input,init)).then(snap);
  ctx.cache.set(url,work);
  try{return restore(await work)}catch(e){ctx.cache.delete(url);throw e}
 };
}

function pumpGate(gate){
 while(gate.active<gate.maxParallel&&gate.queue.length){
  const task=gate.queue.shift();gate.active++;
  Promise.resolve().then(async()=>{const wait=Math.max(0,gate.minStartGapMs-(Date.now()-gate.lastStart));if(wait)await sleep(wait);gate.lastStart=Date.now();return task.fn()}).then(task.resolve,task.reject).finally(()=>{gate.active--;pumpGate(gate)});
 }
}

// Deduplicate or pace work only inside the current AsyncLocalStorage context. The
// Promise returned here is never stored in module-global state and therefore can
// never be awaited by another Worker request.
export function withRequestLocalTask(key,fn,{group='default',maxParallel=3,minStartGapMs=0,dedupe=true}={}){
 const ctx=als.getStore();if(!ctx)return Promise.resolve().then(fn);
 const k=`${group}:${String(key)}`;
 if(dedupe&&ctx.tasks.has(k)){ctx.stats.taskDedupeHits++;return ctx.tasks.get(k)}
 let gate=ctx.gates.get(group);
 if(!gate){gate={active:0,queue:[],maxParallel:Math.max(1,Math.floor(Number(maxParallel)||1)),minStartGapMs:Math.max(0,Number(minStartGapMs)||0),lastStart:0};ctx.gates.set(group,gate)}
 const p=new Promise((resolve,reject)=>{gate.queue.push({fn,resolve,reject});pumpGate(gate)});
 if(dedupe){ctx.tasks.set(k,p);p.finally(()=>ctx.tasks.delete(k)).catch(()=>{})}
 return p;
}

export async function withRequestFetchBudget(fn,{cap=36,blockedError='free-tier-subrequest-soft-cap',label='scan'}={}){
 const limit=Math.max(1,Math.floor(Number(cap)||1)),stats={actual:0,cacheHits:0,blocked:0,taskDedupeHits:0,cap:limit,label,requestLocal:true};
 const ctx={cap:limit,blockedError:String(blockedError||'free-tier-subrequest-soft-cap'),stats,cache:new Map(),tasks:new Map(),gates:new Map()};
 const value=await als.run(ctx,fn);
 return{value,stats:{...stats}};
}

export function requestFetchBudgetRuntimeStatus(){return structuredClone(globalThis[INSTALL_KEY]||{requestLocal:true,crossRequestPromiseSharing:false,requestLocalTaskDedupe:true})}
