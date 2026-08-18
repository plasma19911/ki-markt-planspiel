export const WIDE_SWEEP_TARGET=16;
export const WIDE_SWEEP_TTL_MS=3*60*1000;

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

export const isBlockedWideSweepSymbol=s=>/\.(?:V|NE|PK|OB)$/i.test(key(s));
export const isFreshWideSweep=(ts,now=Date.now(),ttl=WIDE_SWEEP_TTL_MS)=>{const t=Date.parse(String(ts||''));return Number.isFinite(t)&&now-t>=0&&now-t<ttl};

export function normalizeWideSweepEntries(input,now=Date.now()){
 const bySymbol=new Map();
 for(const x of arr(input).slice(0,240)){
  const symbol=key(x?.symbol);if(!symbol||symbol.length>28||isBlockedWideSweepSymbol(symbol))continue;
  const observed=Date.parse(String(x?.observedAt||x?.ts||''));if(!Number.isFinite(observed)||observed>now+60_000||now-observed>WIDE_SWEEP_TTL_MS)continue;
  const score=num(x?.wideScore,NaN),last=num(x?.last,NaN);if(!Number.isFinite(score)||!Number.isFinite(last)||last<=0)continue;
  const row={symbol,wideScore:+score.toFixed(4),m5Pct:+num(x?.m5Pct).toFixed(4),m20Pct:+num(x?.m20Pct).toFixed(4),accelerationPct:+num(x?.accelerationPct).toFixed(4),sessionPct:+num(x?.sessionPct).toFixed(4),last:+last.toFixed(8),observedAt:new Date(observed).toISOString(),source:'WINDOWS_PC_WIDE_SWEEP'};
  const old=bySymbol.get(symbol);if(!old||row.wideScore>old.wideScore)bySymbol.set(symbol,row);
 }
 return[...bySymbol.values()].sort((a,b)=>b.wideScore-a.wideScore||b.accelerationPct-a.accelerationPct||b.m5Pct-a.m5Pct).slice(0,WIDE_SWEEP_TARGET);
}
