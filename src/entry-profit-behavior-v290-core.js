const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));

export const ENTRY_PROFIT_V290={
  version:29.0,
  entry:{
    scoutMin:63,
    microMin:65,
    earlyMin:68,
    regularMin:72,
    strongMin:76,
    exceptionalMin:82,
    scoutCoverage:.82,
    microCoverage:.75,
    earlyCoverage:.70,
    regularCoverage:.67,
    trendWindowMinutes:6,
    risingDelta:3,
    strongRisingDelta:5,
    scoutDelta:7,
    maxNewBuysPerDecision:2,
    maxScoutBuysPerDecision:1
  },
  profit:{
    armPeakPct:.8,
    minPositiveExitPct:.12,
    minAgeSmallPeakMinutes:15,
    minAgeLargePeakMinutes:8,
    largePeakPct:3,
    tiers:[
      {peakMin:6,givebackFraction:.22,minGivebackPoints:.85,maxExitScore:78},
      {peakMin:3,givebackFraction:.28,minGivebackPoints:.65,maxExitScore:76},
      {peakMin:1.5,givebackFraction:.36,minGivebackPoints:.50,maxExitScore:72},
      {peakMin:.8,givebackFraction:.48,minGivebackPoints:.40,maxExitScore:68}
    ]
  }
};

export function trendV290(history=[],score=0,now=Date.now()){
  const cfg=ENTRY_PROFIT_V290.entry;
  const rows=(Array.isArray(history)?history:[])
    .filter(x=>now-num(x?.at,0)<=cfg.trendWindowMinutes*60_000&&num(x?.at,0)<now-15_000)
    .sort((a,b)=>num(a?.at)-num(b?.at));
  const prev=rows.at(-1)||null,oldest=rows[0]||null;
  const delta1=prev?score-num(prev.score,score):0;
  const deltaWindow=oldest?score-num(oldest.score,score):0;
  const rising=delta1>=2||deltaWindow>=cfg.risingDelta;
  const strongRising=delta1>=3.5||deltaWindow>=cfg.strongRisingDelta;
  const scoutRising=delta1>=4.5||deltaWindow>=cfg.scoutDelta;
  const falling=delta1<=-2||deltaWindow<=-3;
  const strongFalling=delta1<=-5||deltaWindow<=-7;
  const confirmed68=rows.some(x=>num(x?.score)<score&&num(x?.score)>=68);
  const confirmed72=rows.some(x=>num(x?.score)>=72);
  return{delta1:+delta1.toFixed(1),deltaWindow:+deltaWindow.toFixed(1),rising,strongRising,scoutRising,falling,strongFalling,confirmed68,confirmed72,samples:rows.length+1};
}

function starterPulse(row={}){
  const parts=row?.parts||{},mom=num(parts?.momentum),news=num(parts?.news),vol=num(parts?.volume),scanner=num(parts?.scanner),conf=num(parts?.confidence),day=num(row?.day,0),reclaim=Boolean(row?.reclaim);
  const safeDay=day<=6.5&&day>=-4.5;
  const positiveStructure=mom>=1.2||reclaim;
  const catalyst=(news>=4&&mom>=.5)||(vol>=2&&mom>=1.2)||(scanner>=5&&conf>=2&&mom>=1.2)||reclaim;
  const strong=(mom>=2.2&&((news>=4)||(vol>=2)||(scanner>=6&&conf>=2)))||reclaim;
  return{safeDay,positiveStructure,catalyst,strong,momentum:mom,news,volume:vol,scanner,confidence:conf};
}

export function entryDecisionV290(row={},history=[],now=Date.now()){
  const cfg=ENTRY_PROFIT_V290.entry,score=num(row?.buyScore,row?.fusionScore),coverage=num(row?.coverage),trend=trendV290(history,score,now),pulse=starterPulse(row),over=Boolean(row?.overextended),reclaim=Boolean(row?.reclaim),blocked=Boolean(row?.hardBlocked);
  if(blocked)return{action:'AVOID',tier:'BLOCK',score,coverage,trend,pulse,label:'Blockiert'};
  if(over&&!reclaim)return{action:'WAIT',tier:'OVEREXTENDED',score,coverage,trend,pulse,label:'Warten auf Rücksetzer/Reclaim'};
  if(score>=cfg.exceptionalMin&&coverage>=cfg.regularCoverage&&!trend.falling&&pulse.safeDay)return{action:'BUY',tier:'EXCEPTIONAL',score,coverage,trend,pulse,label:'Sehr stark · kaufen'};
  if(score>=cfg.strongMin&&coverage>=cfg.regularCoverage&&!trend.falling&&pulse.safeDay)return{action:'BUY',tier:'STRONG',score,coverage,trend,pulse,label:'Stark bestätigt · kaufen'};
  if(score>=cfg.regularMin&&coverage>=cfg.regularCoverage&&(trend.rising||trend.confirmed68||pulse.catalyst)&&!trend.falling&&pulse.safeDay&&pulse.positiveStructure)return{action:'BUY',tier:'REGULAR',score,coverage,trend,pulse,label:'Kaufen'};
  if(score>=cfg.earlyMin&&coverage>=cfg.earlyCoverage&&((trend.rising&&pulse.positiveStructure)||pulse.strong)&&!trend.falling&&pulse.safeDay)return{action:'BUY_EARLY',tier:'EARLY',score,coverage,trend,pulse,label:'Früher Einstieg'};
  if(score>=cfg.microMin&&coverage>=cfg.microCoverage&&((trend.strongRising&&pulse.positiveStructure)||(coverage>=.82&&pulse.strong))&&!trend.falling&&pulse.safeDay)return{action:'BUY_MICRO',tier:'MICRO',score,coverage,trend,pulse,label:'Mikro-Früheinstieg'};
  if(score>=cfg.scoutMin&&coverage>=cfg.scoutCoverage&&trend.scoutRising&&pulse.positiveStructure&&pulse.catalyst&&!trend.falling&&trend.samples>=2&&pulse.safeDay)return{action:'BUY_SCOUT',tier:'SCOUT',score,coverage,trend,pulse,label:'Scout-Einstieg'};
  if(score>=cfg.microMin)return{action:'WAIT',tier:'WAIT_65',score,coverage,trend,pulse,label:trend.rising?'65+ · Bestätigung läuft':'65+ · noch keine saubere Beschleunigung'};
  if(score>=cfg.scoutMin)return{action:'WATCH',tier:'WATCH_63',score,coverage,trend,pulse,label:trend.rising?'63+ · möglicher Starter':'63+ · beobachten'};
  if(score>=58)return{action:'WATCH',tier:'WATCH',score,coverage,trend,pulse,label:trend.rising?'Beobachten · verbessert sich':'Beobachten'};
  return{action:'AVOID',tier:'WEAK',score,coverage,trend,pulse,label:'Schwach'};
}

export function entryAllocationPctV290(cash=0,decision={}){
  const score=num(decision?.score),tier=String(decision?.tier||'');
  let lo=3,hi=4.5,pct=3;
  if(tier==='MICRO'){lo=4;hi=6;pct=4+Math.max(0,score-65)*.30}
  else if(tier==='EARLY'){lo=5;hi=8;pct=5+Math.max(0,score-68)*.35}
  else if(tier==='REGULAR'){lo=7;hi=11;pct=7+Math.max(0,score-72)*.30}
  else if(tier==='STRONG'||tier==='EXCEPTIONAL'){lo=8;hi=12;pct=8+Math.max(0,score-76)*.22}
  else pct=3+Math.max(0,score-63)*.30;
  if(cash>=500&&(tier==='REGULAR'||tier==='STRONG'||tier==='EXCEPTIONAL'))pct=Math.max(pct,500/cash*100);
  return +clamp(pct,lo,hi).toFixed(2);
}

function profitTier(peak=0){return ENTRY_PROFIT_V290.profit.tiers.find(t=>peak>=t.peakMin)||null}

export function profitDecisionV290({pnlPct=0,peakPnlPct=0,holdScore=50,peakHoldScore=50,lastHoldScore=50,coverage=0,partial=false,ageMinutes=999,m5=0,m20=0,acc=0,momentumState='',momentumSellSignal=''}={}){
  const cfg=ENTRY_PROFIT_V290.profit,pnl=num(pnlPct),peak=Math.max(num(peakPnlPct,pnl),pnl),score=num(holdScore),peakScore=Math.max(num(peakHoldScore,score),score),lastScore=num(lastHoldScore,score),tier=profitTier(peak);
  const givebackPoints=Math.max(0,peak-pnl),givebackFraction=peak>0?givebackPoints/peak:0,scoreDelta=score-lastScore,scoreFromPeak=score-peakScore;
  const momentumWeak=num(m5)<=-.10||num(m20)<=-.20||num(acc)<=-.025||String(momentumState).toUpperCase()==='REVERSAL'||String(momentumSellSignal).toUpperCase()==='STRONG';
  const momentumStrong=num(m5)>=.12&&num(acc)>=.025&&num(m20)>=-.05;
  const rebound=scoreDelta>=4||(momentumStrong&&score>=52);
  const fresh=num(coverage)>=.67&&!partial;
  const armed=Boolean(tier&&peak>=cfg.armPeakPct);
  const minAge=peak>=cfg.largePeakPct?cfg.minAgeLargePeakMinutes:cfg.minAgeSmallPeakMinutes;
  const base={pnl:+pnl.toFixed(3),peak:+peak.toFixed(3),givebackPoints:+givebackPoints.toFixed(3),givebackFraction:+givebackFraction.toFixed(3),score:+score.toFixed(1),scoreDelta:+scoreDelta.toFixed(1),scoreFromPeak:+scoreFromPeak.toFixed(1),momentumWeak,momentumStrong,rebound,armed,minAge};
  if(!armed)return{...base,action:'HOLD',reason:'not_armed',label:'Gewinntrail noch nicht aktiv'};
  if(!fresh)return{...base,action:'HOLD',reason:'insufficient_data',label:'Halten · Daten nicht vollständig'};
  if(ageMinutes<minAge)return{...base,action:'HOLD',reason:'too_young',label:'Gewinn laufen lassen · Position noch jung'};
  if(rebound)return{...base,action:'HOLD',reason:'rebound',label:'Gewinn laufen lassen · Trend zieht wieder an'};
  if(pnl<cfg.minPositiveExitPct)return{...base,action:'HOLD',reason:'too_small',label:'Kein Mini-Gewinnverkauf'};
  const trailHit=givebackPoints>=tier.minGivebackPoints&&givebackFraction>=tier.givebackFraction;
  const scoreWeakening=(scoreDelta<=-3||scoreFromPeak<=-7)&&score<=tier.maxExitScore;
  const nearPeakExhaustion=peak>=2.5&&givebackFraction>=.14&&scoreFromPeak<=-7&&momentumWeak&&score<=78;
  const fastExhaustion=peak>=4&&givebackFraction>=.10&&scoreDelta<=-5&&scoreFromPeak<=-8&&momentumWeak&&score<=78;
  if(fastExhaustion)return{...base,action:'SELL',reason:'fast_peak_exhaustion',label:'Gewinn sichern · Peak kippt schnell'};
  if(nearPeakExhaustion)return{...base,action:'SELL',reason:'near_peak_exhaustion',label:'Gewinn sichern · Anstieg läuft aus'};
  if(trailHit&&scoreWeakening&&momentumWeak)return{...base,action:'SELL',reason:'dynamic_profit_lock',label:'Gewinn sichern · dynamischer Rücklauf'};
  return{...base,action:'HOLD',reason:trailHit?'trail_unconfirmed':'trend_intact',label:trailHit?'Halten · Rücklauf noch nicht bestätigt':'Gewinn laufen lassen'};
}
