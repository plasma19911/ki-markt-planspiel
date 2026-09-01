const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

export const PC_AGENT_LEADER_BLEND_V3172={
  version:31.72,
  leaderTarget:25,
  minUsableLeaders:10,
  previousLeaderTtlMs:45*60*1000
};

export function blendLeaderCacheV3172(current,previous=null,now=Date.now(),cfg=PC_AGENT_LEADER_BLEND_V3172){
  const cur=arr(current?.leaders),meta=current?.meta||{},resolved=Math.max(0,Math.min(cur.length,Math.round(num(meta.externalResolved)))),externalHealthy=Boolean(meta.externalHealthy),previousAt=num(previous?.at,NaN),previousFresh=previous&&Number.isFinite(previousAt)&&now-previousAt>=0&&now-previousAt<cfg.previousLeaderTtlMs;
  const dynamic=cur.slice(0,resolved),old=previousFresh?arr(previous?.leaders):[],fallback=cur.slice(resolved),out=[],seen=new Set();
  for(const row of [...dynamic,...old,...fallback]){const s=key(row);if(!s||seen.has(s))continue;seen.add(s);out.push({...row});if(out.length>=cfg.leaderTarget)break}
  const usable=resolved>0&&out.length>=cfg.minUsableLeaders,previousUsed=Boolean(previousFresh&&old.some(x=>out.some(y=>key(y)===key(x))&&!dynamic.some(d=>key(d)===key(x))));
  return{at:now,leaders:out,meta:{...meta,selected:out.length,externalHealthy,usable,previousUsed,mode:externalHealthy?'PC_AGENT_TOP_25':usable?(previousUsed?'PC_AGENT_PARTIAL_BLEND':'PC_AGENT_PARTIAL_MASTER_FALLBACK'):'PC_AGENT_INSUFFICIENT'}};
}
