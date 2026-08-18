export const SECOND_CHANCE_RETENTION_MS=12*60*1000;
export const SECOND_CHANCE_TARGET=8;
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v||'').toUpperCase().trim();
const blockedSymbol=s=>/\.(?:V|CN|NE|PK|OB)$/i.test(key(s));
const freshAt=(ts,now=Date.now(),ttl=SECOND_CHANCE_RETENTION_MS)=>{const t=Date.parse(String(ts||''));return Number.isFinite(t)&&now-t>=0&&now-t<ttl};
const stateName=c=>String(c?.momentum_state||c?.momentumState||'NORMAL').toUpperCase();
const sellSignal=c=>String(c?.momentum_sell_signal||c?.momentumSellSignal||'NONE').toUpperCase();
const eventRisk=c=>String(c?.event_risk||c?.eventRisk||'NONE').toUpperCase();

export function isSecondChanceCandidate(c={}){
 const score=num(c?.score),conf=num(c?.confidence),good=(score>=5.25&&conf>=.68)||(score>=4.8&&conf>=.76),bad=eventRisk(c)==='HIGH'||sellSignal(c)==='STRONG'||['REVERSAL','EXHAUSTION'].includes(stateName(c))||blockedSymbol(c?.symbol);
 return Boolean(key(c?.symbol)&&good&&!bad);
}

export function buildSecondChanceWatch(previous,current,now=Date.now()){
 const old=arr(previous?.candidates).filter(x=>freshAt(x?.lastSeenAt||x?.updatedAt,now)),cur=arr(current),badNow=new Set(cur.filter(c=>eventRisk(c)==='HIGH'||sellSignal(c)==='STRONG'||['REVERSAL','EXHAUSTION'].includes(stateName(c))).map(c=>key(c?.symbol))),m=new Map();
 for(const x of old){const s=key(x?.symbol);if(s&&!badNow.has(s)&&!blockedSymbol(s))m.set(s,{...x})}
 const stamp=new Date(now).toISOString();
 for(const c of cur){if(!isSecondChanceCandidate(c))continue;const s=key(c.symbol),oldRow=m.get(s);m.set(s,{...c,symbol:s,firstSeenAt:oldRow?.firstSeenAt||stamp,lastSeenAt:stamp,watchReason:`Starker Deep-Kandidat ${num(c.score).toFixed(2)} / ${Math.round(num(c.confidence)*100)}% bleibt fuer frischen 1m-Zweitcheck aktiv`})}
 const candidates=[...m.values()].filter(x=>freshAt(x?.lastSeenAt||x?.updatedAt,now)).sort((a,b)=>(num(b.score)+num(b.confidence)*1.5)-(num(a.score)+num(a.confidence)*1.5)).slice(0,SECOND_CHANCE_TARGET);
 return{version:1,updatedAt:stamp,candidateCount:candidates.length,target:SECOND_CHANCE_TARGET,retentionMinutes:12,recheckPerScan:2,forcedBuy:false,requiresFreshOneMinuteRecheck:true,candidates};
}

export function isSecondChanceWatchFresh(watch,now=Date.now()){
 return Boolean(watch&&freshAt(watch.updatedAt,now));
}

export function isBlockedSecondChanceSymbol(symbol){return blockedSymbol(symbol)}
