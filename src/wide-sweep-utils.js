export const WIDE_SWEEP_TARGET=64;
export const WIDE_SWEEP_DIP_RESERVE=44;
// Discovery darf nicht so lange leben, dass ein alter Tail-Fund mehrfach teure
// Deep-Slots verbraucht. Acht Minuten reichen fuer den rotierenden Vollscan; ein
// echter Einstieg wird danach ohnehin nochmals mit frischen 1m-Daten bestaetigt.
export const WIDE_SWEEP_TTL_MS=8*60*1000;

const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v||'').toUpperCase().trim();
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));

export const isBlockedWideSweepSymbol=s=>/\.(?:V|NE|PK|OB)$/i.test(key(s));
export const isFreshWideSweep=(ts,now=Date.now(),ttl=WIDE_SWEEP_TTL_MS)=>{const t=Date.parse(String(ts||''));return Number.isFinite(t)&&now-t>=0&&now-t<ttl};

function dipDiscovery(row){
 const day=num(row?.sessionPct),m5=num(row?.m5Pct),m20=num(row?.m20Pct),accel=num(row?.accelerationPct);
 const declining=day<=-.35&&day>=-10;
 const controlled20=m20<=.28&&m20>=-3.5;
 const notCrashing5=m5<=.18&&m5>=-.95;
 const braking=accel>=.008;
 const eligible=declining&&controlled20&&notCrashing5&&braking;
 if(!eligible)return{eligible:false,score:-Infinity};
 const declineSweet=Math.max(0,3.8-Math.abs(Math.abs(day)-2.4)*.48);
 const brake=Math.min(3.4,Math.max(0,accel)*14);
 const shortTape=Math.max(0,1.8-Math.abs(m5)*1.55);
 const mediumTape=Math.max(0,1.45-Math.abs(m20)*.40);
 const score=declineSweet+brake+shortTape+mediumTape+Math.max(0,num(row?.wideScore))*.06;
 return{eligible:true,score:+score.toFixed(4)};
}

export function normalizeWideSweepEntries(input,now=Date.now()){
 const bySymbol=new Map();
 for(const x of arr(input).slice(0,800)){
  const symbol=key(x?.symbol);if(!symbol||symbol.length>28||isBlockedWideSweepSymbol(symbol))continue;
  const observed=Date.parse(String(x?.observedAt||x?.ts||''));if(!Number.isFinite(observed)||observed>now+60_000||now-observed>WIDE_SWEEP_TTL_MS)continue;
  const score=num(x?.wideScore,NaN),last=num(x?.last,NaN);if(!Number.isFinite(score)||!Number.isFinite(last)||last<=0)continue;
  const row={symbol,wideScore:+score.toFixed(4),m5Pct:+num(x?.m5Pct).toFixed(4),m20Pct:+num(x?.m20Pct).toFixed(4),accelerationPct:+num(x?.accelerationPct).toFixed(4),sessionPct:+num(x?.sessionPct).toFixed(4),last:+last.toFixed(8),observedAt:new Date(observed).toISOString(),ageSeconds:+Math.max(0,(now-observed)/1000).toFixed(1),source:String(x?.source||'WINDOWS_PC_WIDE_SWEEP').slice(0,80)};
  const dip=dipDiscovery(row);row.dipDiscovery=dip.eligible;row.dipDiscoveryScore=dip.eligible?dip.score:0;
  const old=bySymbol.get(symbol),oldAt=old?Date.parse(old.observedAt):0;
  const clearlyNewer=!old||observed>oldAt+5000;
  const nearlySame=!old||Math.abs(observed-oldAt)<=5000;
  const betterSameTime=nearlySame&&(row.dipDiscovery&&!old?.dipDiscovery||row.wideScore>num(old?.wideScore,-Infinity));
  if(clearlyNewer||betterSameTime)bySymbol.set(symbol,row);
 }
 const all=[...bySymbol.values()];
 // Alter bleibt zusaetzlich ein Ranking-Penalty innerhalb des erlaubten 8-Minuten-
 // Fensters, damit frische Funde bei gleicher Qualitaet zuerst geprueft werden.
 const dipRank=x=>x.dipDiscoveryScore-Math.min(3,x.ageSeconds/240);
 const momRank=x=>x.wideScore-Math.min(4,x.ageSeconds/300);
 const dips=all.filter(x=>x.dipDiscovery).sort((a,b)=>dipRank(b)-dipRank(a)||b.accelerationPct-a.accelerationPct||b.wideScore-a.wideScore);
 const momentum=all.slice().sort((a,b)=>momRank(b)-momRank(a)||b.accelerationPct-a.accelerationPct||b.m5Pct-a.m5Pct);
 const selected=[],used=new Set();
 const take=(rows,n)=>{for(const x of rows){if(n<=0)break;if(used.has(x.symbol))continue;used.add(x.symbol);selected.push(x);n--}};
 take(dips,WIDE_SWEEP_DIP_RESERVE);
 take(momentum,WIDE_SWEEP_TARGET-selected.length);
 return selected.slice(0,WIDE_SWEEP_TARGET);
}

function liveWavePriority(x={}){
 const day=num(x?.pcWideSessionPct,x?.sessionPct),m5=num(x?.pcWideM5Pct,x?.m5Pct),m20=num(x?.pcWideM20Pct,x?.m20Pct),accel=num(x?.pcWideAccelerationPct,x?.accelerationPct),wide=num(x?.pcWideScore,x?.wideScore),rebound=Boolean(x?.reboundWatch||x?.reboundDiscovery);
 let score=0;
 if(day<=-.35&&day>=-7)score+=3.2-Math.abs(Math.abs(day)-2.2)*.35;else if(day<=.6&&day>=-.35)score+=.8;else if(day>2)score-=Math.min(4,day*.35);
 if(m5>=-.55&&m5<=.18)score+=1.1;else if(m5<-.9)score-=1.3;
 if(m20>=-1.8&&m20<=.28)score+=1.0;else if(m20<-2.5)score-=1.1;
 score+=clamp(accel*18,-1.2,2.6)+clamp(wide,0,10)*.05+(rebound?.65:0);
 return score;
}

// Zwei teure Cloudflare-1m-Slots sollen nicht rein zufaellig nach Listenposition
// vergeben werden. Slot 1 geht immer an den aktuell besten gebremsten Pullback,
// die restlichen Slots rotieren weiter durch den Pool. So bleibt Vollabdeckung
// erhalten, aber gute Dips warten nicht mehrere Minuten auf ihre Detailpruefung.
export function selectWideSweepLiveWave(input,minute=Math.floor(Date.now()/60000),slots=2){
 const pool=arr(input).filter(x=>x?.symbol&&(x?.pcWideSweep||x?.reboundWatch));
 const limit=Math.max(0,Math.floor(num(slots,2)));if(!limit||!pool.length)return[];if(pool.length<=limit)return pool;
 const ranked=[...pool].sort((a,b)=>liveWavePriority(b)-liveWavePriority(a)||key(a.symbol).localeCompare(key(b.symbol))),chosen=[ranked[0]],rest=ranked.slice(1),rotating=Math.max(0,limit-1);
 if(rotating&&rest.length){const start=Math.abs(Math.floor(num(minute)))%rest.length;for(let i=0;i<Math.min(rotating,rest.length);i++)chosen.push(rest[(start+i)%rest.length])}
 return chosen;
}
