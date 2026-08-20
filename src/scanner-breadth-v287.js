export const BROAD_POOL_TARGET=60;
export const ANCHOR_COUNT=12;
export const ROTATING_COUNT=13;
export const ROTATION_BUCKETS=4;
export const BROAD_POOL_TTL_MS=8*60*1000;
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const base=v=>key(v).split('.')[0];
const pence=x=>{const c=String(x?.currency||'').trim().toUpperCase();return c==='GBX'||c==='GBPENCE'};
const liquid=x=>num(x?.marketCapUSD||x?.marketCap,0)<=0||num(x?.marketCapUSD||x?.marketCap,0)>=150_000_000;
function masterIndex(rows){const exact=new Map(),byBase=new Map();for(const r of rows){const s=key(r);if(!s)continue;exact.set(s,r);const b=base(s),a=byBase.get(b)||[];a.push(r);byBase.set(b,a)}const pref=r=>{const s=key(r);if(s.endsWith('.DE'))return 0;if(s.endsWith('.F'))return 1;if(s.endsWith('.SG'))return 2;if(!s.includes('.'))return 3;return 4};for(const a of byBase.values())a.sort((x,y)=>pref(x)-pref(y)||num(y?.marketCapUSD||y?.marketCap)-num(x?.marketCapUSD||x?.marketCap));return{exact,byBase}}
function resolve(entry,index){const s=key(entry?.symbol);if(!s)return null;const candidates=index.byBase.get(base(s))||[];if(String(entry?.market||'').toUpperCase()==='DE')return candidates.find(x=>/\.(DE|F|SG|MU|HM)$/.test(key(x)))||index.exact.get(s)||candidates[0]||null;return index.exact.get(s)||candidates[0]||null}
export function buildBroadLeaderPool(entries=[],masterRows=[],target=BROAD_POOL_TARGET){
 const index=masterIndex(arr(masterRows).filter(x=>x?.symbol)),scores=new Map();
 for(const e of arr(entries).slice(0,220)){const row=resolve(e,index);if(!row||pence(row)||!liquid(row))continue;const s=key(row),source=String(e?.source||'PC-Agent'),rank=Math.max(1,Math.round(num(e?.rank,99))),old=scores.get(s)||{row,score:0,sources:new Set(),bestRank:999};old.score+=Math.max(.15,6-(rank-1)*.11);old.sources.add(source);old.bestRank=Math.min(old.bestRank,rank);scores.set(s,old)}
 const ranked=[...scores.values()].map(x=>({...x,sourceCount:x.sources.size,sources:[...x.sources]})).sort((a,b)=>b.sourceCount-a.sourceCount||b.score-a.score||a.bestRank-b.bestRank).slice(0,target);
 return{version:28.7,updatedAt:new Date().toISOString(),target,pool:ranked.map((x,i)=>({...x.row,broadLeaderRank:i+1,broadLeaderScore:+x.score.toFixed(3),broadLeaderSources:x.sources})),resolved:ranked.length,sourceBreadth:new Set(arr(entries).map(x=>String(x?.source||'')).filter(Boolean)).size}
}
function rotateTake(rows,start,count){if(!rows.length||count<=0)return[];const out=[];for(let i=0;i<Math.min(count,rows.length);i++)out.push(rows[(start+i)%rows.length]);return out}
export function applyRotatingBreadth(data={},broad=null,state={}){
 const pool=arr(broad?.pool);if(pool.length<25)return{...data,breadthRotationApplied:false,broadPoolSize:pool.length};
 const scan=Math.max(0,Math.round(num(state?.config?.scan_count,0))),anchors=pool.slice(0,Math.min(ANCHOR_COUNT,pool.length)),tail=pool.slice(ANCHOR_COUNT),bucket=scan%ROTATION_BUCKETS,start=(bucket*ROTATING_COUNT)%Math.max(1,tail.length),rotation=rotateTake(tail,start,ROTATING_COUNT),heldSet=new Set(arr(state?.positions).map(p=>key(p)).filter(Boolean)),baseRows=arr(data?.equities),held=baseRows.filter(x=>heldSet.has(key(x))),forward=baseRows.filter(x=>x?.forwardWatch).slice(0,15),seen=new Set(),equities=[];
 for(const x of [...anchors,...rotation,...held,...forward]){const s=key(x);if(!s||seen.has(s))continue;seen.add(s);equities.push(x)}
 return{...data,equities,breadthRotationApplied:true,broadPoolSize:pool.length,broadAnchorCount:anchors.length,broadRotatingCount:rotation.length,broadRotationBucket:bucket,broadCoverageMinutes:ROTATION_BUCKETS,scanner_slice_equity_count:equities.length,scanner_mode:'V287_BREADTH_ROTATION_60+FORWARD'}
}
