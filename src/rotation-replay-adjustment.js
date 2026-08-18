const REPORT_KEY='state/day-replay-report-v1';
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));

// Der Replay soll Churn bremsen, aber nach einem einzelnen schlechten Tag nicht
// jede gute Rotation fuer fast zwanzig Minuten blockieren. Deshalb nur moderate,
// gedeckelte Zuschlaege; starke Alternativen duerfen im Cost-Guard weiterhin frueher durch.
export function getReplayRotationAdjustment(storage){
 let report=null;try{report=storage?.kv?.get(REPORT_KEY)||null}catch{}
 const c=report?.status==='COMPLETE'?report?.summary?.churn:null,rapid=num(c?.rapidRoundTrips),pnl=num(c?.totalRapidTradePnl),fees=num(c?.fees);
 const out={samples:rapid,minAgeBonusMinutes:0,gapBonus:0,reason:''};
 if(rapid>=2&&(pnl<0||fees>=2)){
  out.minAgeBonusMinutes=clamp(Math.round(1+rapid*.32),2,5);
  out.gapBonus=clamp(.08+rapid*.03+fees*.009,.12,.50);
  out.reason=`Tages-Replay bremst Kosten-Churn moderat: ${rapid} schnelle Roundtrips, P/L ${pnl.toFixed(2)} EUR, Gebuehren ${fees.toFixed(2)} EUR`;
 }
 return out;
}
