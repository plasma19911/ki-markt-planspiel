export const WIDE_SWEEP_TARGET=24;
export const WIDE_SWEEP_DIP_RESERVE=8;
export const WIDE_SWEEP_TTL_MS=90*1000;

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

export const isBlockedWideSweepSymbol=s=>/\.(?:V|NE|PK|OB)$/i.test(key(s));
export const isFreshWideSweep=(ts,now=Date.now(),ttl=WIDE_SWEEP_TTL_MS)=>{const t=Date.parse(String(ts||''));return Number.isFinite(t)&&now-t>=0&&now-t<ttl};

function dipDiscovery(row){
 const day=num(row?.sessionPct),m5=num(row?.m5Pct),m20=num(row?.m20Pct),accel=num(row?.accelerationPct);
 // Nicht einfach die groessten Verlierer nehmen. Gesucht wird ein echter Ruecksetzer,
 // bei dem der Abwaertsdruck bereits nachlaesst, obwohl der Kurs noch nicht steigen muss.
 const declining=day<=-.70&&day>=-10;
 const controlled20=m20<=.20&&m20>=-3.0;
 const notCrashing5=m5<=.15&&m5>=-.80;
 const braking=accel>=.015;
 const eligible=declining&&controlled20&&notCrashing5&&braking;
 if(!eligible)return{eligible:false,score:-Infinity};
 const declineSweet=Math.max(0,3.2-Math.abs(Math.abs(day)-2.4)*.55);
 const brake=Math.min(3.0,Math.max(0,accel)*12);
 const shortTape=Math.max(0,1.5-Math.abs(m5)*1.8);
 const mediumTape=Math.max(0,1.2-Math.abs(m20)*.45);
 const score=declineSweet+brake+shortTape+mediumTape+Math.max(0,num(row?.wideScore))*.10;
 return{eligible:true,score:+score.toFixed(4)};
}

export function normalizeWideSweepEntries(input,now=Date.now()){
 const bySymbol=new Map();
 for(const x of arr(input).slice(0,320)){
  const symbol=key(x?.symbol);if(!symbol||symbol.length>28||isBlockedWideSweepSymbol(symbol))continue;
  const observed=Date.parse(String(x?.observedAt||x?.ts||''));if(!Number.isFinite(observed)||observed>now+60_000||now-observed>WIDE_SWEEP_TTL_MS)continue;
  const score=num(x?.wideScore,NaN),last=num(x?.last,NaN);if(!Number.isFinite(score)||!Number.isFinite(last)||last<=0)continue;
  const row={symbol,wideScore:+score.toFixed(4),m5Pct:+num(x?.m5Pct).toFixed(4),m20Pct:+num(x?.m20Pct).toFixed(4),accelerationPct:+num(x?.accelerationPct).toFixed(4),sessionPct:+num(x?.sessionPct).toFixed(4),last:+last.toFixed(8),observedAt:new Date(observed).toISOString(),ageSeconds:+Math.max(0,(now-observed)/1000).toFixed(1),source:String(x?.source||'WINDOWS_PC_WIDE_SWEEP').slice(0,80)};
  const dip=dipDiscovery(row);row.dipDiscovery=dip.eligible;row.dipDiscoveryScore=dip.eligible?dip.score:0;
  const old=bySymbol.get(symbol);if(!old||row.wideScore>old.wideScore||(row.dipDiscovery&&!old.dipDiscovery))bySymbol.set(symbol,row);
 }
 const all=[...bySymbol.values()];
 const dips=all.filter(x=>x.dipDiscovery).sort((a,b)=>b.dipDiscoveryScore-a.dipDiscoveryScore||b.accelerationPct-a.accelerationPct||b.wideScore-a.wideScore);
 const momentum=all.slice().sort((a,b)=>b.wideScore-a.wideScore||b.accelerationPct-a.accelerationPct||b.m5Pct-a.m5Pct);
 const selected=[],used=new Set();
 const take=(rows,n)=>{for(const x of rows){if(n<=0)break;if(used.has(x.symbol))continue;used.add(x.symbol);selected.push(x);n--}};
 // Bis zu 8 von 24 Plaetzen sind fuer fallende, aber bereits abbremsende Aktien reserviert.
 // Gibt es weniger geeignete Dips, werden die freien Plaetze normal mit Momentum-Werten gefuellt.
 take(dips,WIDE_SWEEP_DIP_RESERVE);
 take(momentum,WIDE_SWEEP_TARGET-selected.length);
 return selected.slice(0,WIDE_SWEEP_TARGET);
}
