const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function tape(c={}){
 const rawDraw=c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct;
 return{
  event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),
  state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),
  sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),
  m5:num(c?.intraday5m,c?.momentum5),
  m20:num(c?.intraday20m,c?.momentum20),
  day:num(c?.day,c?.day_change),
  draw:Number.isFinite(Number(rawDraw))?Number(rawDraw):0,
  drawKnown:Number.isFinite(Number(rawDraw))
 };
}

function explicitEmergency(action={}){
 // Only genuinely unconditional reasons belong here. Generic STRONG/REVERSAL text
 // is deliberately excluded: those signals still need fresh candle confirmation.
 return /(?:HARD[- ]?EVENT[- ]?EXIT|EVENT[- ]?RISK|NOTAUSSTIEG|EMERGENCY[- ]?EXIT|STOP[- ]?LOSS)/i.test(String(action?.reason||''));
}

export function classifyHardExit(candidate={},action={}){
 const x=tape(candidate),momentumAlarm=x.state==='REVERSAL'||x.sell==='STRONG';
 const flashBreak=momentumAlarm&&(
  (x.m5<=-.85&&((x.m20<=-1.35)||(x.drawKnown&&x.draw<=-1.50)))||
  (x.m20<=-2.20&&x.drawKnown&&x.draw<=-1.00)||
  (x.day<=-8&&x.m5<=-.55)
 );
 const event=x.event==='HIGH',explicit=explicitEmergency(action),hard=event||explicit||flashBreak;
 return{hard,event,explicit,flashBreak,momentumAlarm,tape:x,reason:event?'HIGH event risk':explicit?'explicit emergency/stop':flashBreak?'severe confirmed momentum break':'momentum alarm needs candle confirmation'};
}
