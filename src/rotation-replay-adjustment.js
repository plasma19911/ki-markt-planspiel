const REPORT_KEY='state/day-replay-report-v1';
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));

export function getReplayRotationAdjustment(storage){
 let report=null;try{report=storage?.kv?.get(REPORT_KEY)||null}catch{}
 const c=report?.status==='COMPLETE'?report?.summary?.churn:null,rapid=num(c?.rapidRoundTrips),pnl=num(c?.totalRapidTradePnl),fees=num(c?.fees);
 const out={samples:rapid,minAgeBonusMinutes:0,gapBonus:0,reason:''};
 if(rapid>=2&&(pnl<0||fees>=2)){
  out.minAgeBonusMinutes=clamp(Math.round(rapid*1.25),2,8);
  out.gapBonus=clamp(.12+rapid*.07+fees*.025,.18,.75);
  out.reason=`Tages-Replay bremst Kosten-Churn: ${rapid} schnelle Roundtrips, P/L ${pnl.toFixed(2)} EUR, Gebuehren ${fees.toFixed(2)} EUR`;
 }
 return out;
}
