import {targetVenueIssue} from './target-venue-ai-guard.js';
import {calibratedEntryExpectation,applyPortfolioRiskCaps} from './portfolio-risk-calibration.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}

function metrics(c={}){const rawVol=c?.volumeRatio??c?.volume_ratio,vol=Number.isFinite(Number(rawVol))&&Number(rawVol)>0?Number(rawVol):null;return{
 score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),day:num(c?.day,c?.day_change),
 m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),
 rsi:num(c?.intradayRsi,c?.rsi??50),draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,
 vol,news:num(c?.news,c?.newsScore??c?.news_score),event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),eventText:String(c?.eventText||c?.event_text||''),
 state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),
 buyers:num(c?.buyerShare??c?.buyer_share??c?.buyerPct??c?.buyer_pct,-1),sellers:num(c?.sellerShare??c?.seller_share??c?.sellerPct??c?.seller_pct,-1)
}}
function explicitExitHold(reason=''){return/(?:ADAPTIVE\s+EXIT[- ]?HOLD|EXIT[- ]?HOLD|VERKÄUFERSTRUKTUR[^.]{0,90}(?:NICHT|NOCH NICHT)[^.]{0,90}(?:STARK|AUSREICHEND)|SELLER STRUCTURE[^.]{0,90}(?:NOT|INSUFFICIENT)|WEITER BEOBACHTEN(?: STATT ZU FRÜH SCHLIEßEN)?|HOLD STATT SELL)/i.test(String(reason))}
function negated(reason=''){return explicitExitHold(reason)||/(?:KEIN(?:E|EN|ER)?|NICHT|UNBESTÄTIGT|UNBESTAETIGT|NO\s+|NOT\s+|OHNE)\s{0,20}(?:REVERSAL|STRONG[- ]?SELL|INVALIDATION|VERKÄUFER|SELLER|BEARISH|BÄRISCH)/i.test(String(reason))}
function protectedHold(reason=''){if(negated(reason)&&!explicitExitHold(reason))return false;return explicitExitHold(reason)||/(?:TARGET-VENUE-BLOCK|NEWS-IMPACT BLOCK|NEWS-SHOCK WAIT|CATALYST WATCH|EVENT[- ]?RISK|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|REVERSAL|STRONG SELL|PEAK[- ]?CHASE|HIGH[- ]?CHASE|OVERHEAT|GETTEX|FX[- ]?SAFETY|QUOTE[- ]?SANITY|BAD QUOTE|STALE QUOTE|FALLING KNIFE|MULTI[- ]?TIMEFRAME.*BLOCK|MTF.*BLOCK)/i.test(String(reason))}
function hardSellReason(reason=''){if(negated(reason))return false;return/(?:HARD[- ]?EVENT[- ]?EXIT|NOTAUSSTIEG|STOP[- ]?LOSS|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|HARD EXIT)/i.test(String(reason))}
function confirmedSellReason(reason=''){if(negated(reason))return false;return/(?:INVALIDATION|VERKÄUFER(?:DOMINANZ|ÜBERNAHME|ANTEIL)|SELLER(?: DOMINANCE)?|BÄRISCH|BEARISH|RED[- ]?VOLUME|TOPBILDUNG|MOMENTUM[- ]?REVERSAL)/i.test(String(reason))}
function hardBuyBlock(c,m){return targetVenueIssue(c)||c?.targetVenueVerified===false||Boolean(c?.targetVenueIssue)||m.event==='HIGH'||m.state==='REVERSAL'||m.sell==='STRONG'||m.news<=-.55}
function peakRisk(m){
 if(m.day>=10||m.rsi>=84)return true;
 if(m.draw===null)return m.day>=5.5&&m.rsi>=72;
 if(m.draw>-0.35&&(m.day>=4.5||m.rsi>=76))return true;
 if(m.draw>-0.15&&(m.day>=3||m.rsi>=72))return true;
 return false;
}
function entryType(m){
 const pullback=m.draw!==null&&m.draw<=-0.55&&m.draw>=-4&&m.m5>=-.05&&m.accel>=.015;
 const early=m.day<=3.5&&m.rsi<72&&m.m5>=.04&&m.m20>=0&&m.accel>=.02;
 const base=m.day<=5&&m.rsi<75&&m.m5>=0&&m.m20>=-.05&&m.accel>=.03&&m.draw!==null&&m.draw<=-.25;
 if(pullback)return'PULLBACK_RECLAIM';
 if(early)return'EARLY_BREAKOUT';
 if(base)return'BASE_RECLAIM';
 return null;
}
function candidateQuality(c,learningStatus=null){
 const m=metrics(c);if(hardBuyBlock(c,m)||peakRisk(m))return null;
 const type=entryType(m);if(!type)return null;
 if(m.score<3.55||m.confidence<.50||m.m20<-.35||m.m5<-.12)return null;
 if(m.vol!==null&&m.vol<.40)return null;
 const expectation=calibratedEntryExpectation(c,learningStatus);if(expectation.block)return null;
 const baseQ=clamp((m.score-3.3)/2.7,0,1)*.34+clamp((m.confidence-.48)/.32,0,1)*.20+clamp((m.m5+.08)/.35,0,1)*.16+clamp((m.m20+.20)/.65,0,1)*.12+clamp((m.accel+.01)/.20,0,1)*.12+clamp((m.news+.35)/1.0,0,1)*.06;
 const quality=clamp(baseQ*expectation.sizeMultiplier,0,1);
 return{c,m,type,quality,baseQuality:clamp(baseQ,0,1),expectation};
}
function targetDeployment(rows){
 if(!rows.length)return 0;const top=rows[0].quality,avg=rows.reduce((a,x)=>a+x.quality,0)/rows.length,n=rows.length;
 if(n>=4&&top>=.68&&avg>=.52)return 100;if(n>=3&&top>=.60)return 85;if(n>=2&&top>=.55)return 65;if(top>=.72)return 50;if(top>=.58)return 35;return 22;
}
function allocate(rows,target){if(!rows.length||target<=0)return[];const weights=rows.map(x=>.5+x.quality),sum=weights.reduce((a,b)=>a+b,0)||1;return rows.map((x,i)=>({...x,allocation:target*weights[i]/sum})).filter(x=>x.allocation>=2)}
function heldPnl(h={}){for(const v of [h?.pnlPct,h?.pnl_pct,h?.pnl])if(Number.isFinite(Number(v)))return Number(v);return 0}
function heldAgeMinutes(h={}){if(Number.isFinite(Number(h?.ageMinutes)))return Math.max(0,Number(h.ageMinutes));const t=Date.parse(String(h?.opened_at||h?.openedAt||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/60000):999}
function sellDecision(h,inner=null){
 const m=metrics(h),pl=heldPnl(h),age=heldAgeMinutes(h),reason=String(inner?.reason||''),holdConflict=explicitExitHold(reason);
 const sellers=m.sellers>=0?m.sellers:(m.buyers>=0?100-m.buyers:-1),sellerControl=sellers>=62;
 const innerConfirmed=inner?.action==='SELL'&&num(inner?.confidence)>=.70&&confirmedSellReason(reason);
 const explicitHardEvent=m.event==='HIGH'&&Boolean(m.eventText.trim()),externalHard=m.news<=-.65||explicitHardEvent||hardSellReason(reason);
 const strongMarketHard=!holdConflict&&m.sell==='STRONG'&&(sellerControl||(m.m20<=-.35&&m.accel<=-.05));
 const reversalHard=!holdConflict&&m.state==='REVERSAL'&&sellerControl&&m.m20<=-.18&&m.accel<=-.03;
 const hard=externalHard||strongMarketHard||reversalHard;
 const trendBreak=m.m20<=-.22&&m.accel<=-.035;
 const fastBreak=m.m5<=-.30&&m.m20<=-.15&&m.accel<=-.03;
 const materialDamage=pl<=-2.2&&m.draw!==null&&m.draw<=-1.0&&m.m20<=-.20&&m.accel<=-.03;
 const independentInvalidation=(trendBreak&&(sellerControl||innerConfirmed))||(fastBreak&&sellerControl)||materialDamage;
 const winnerBroken=pl>0&&((m.m20<=-.18&&m.accel<=-.04&&(sellerControl||m.m5<=-.30))||(sellerControl&&m.m5<0&&m.accel<0)||(innerConfirmed&&m.m20<0));
 if(hard)return{sell:true,confidence:Math.max(.84,num(inner?.confidence)),reason:`FINAL-CONTROLLER HARD EXIT: strukturierter harter Risikoauslöser bestätigt · ${reason||'News/Event/Reversal/STRONG-SELL.'}`};
 if(holdConflict)return{sell:false,holdConflict:true,reason:`FINAL-CONTROLLER EXIT-HOLD V27.1: tiefere Exit-Prüfung widerspricht einem harten Verkauf (${reason}). Ohne externen harten Event-/News-Auslöser bleibt die Position HOLD.`};
 if(pl<=0&&independentInvalidation)return{sell:true,confidence:Math.max(.74,num(inner?.confidence)),reason:`FINAL-CONTROLLER THESIS-INVALIDATION EXIT: Verlustposition hat unabhängige Bestätigung für echten Strukturbruch · Alter ${age.toFixed(1)} Min. · P/L ${pl.toFixed(2)}% · Verkäufer ${sellers>=0?sellers.toFixed(0)+'%':'nicht gemessen'}.`};
 if(pl>0&&winnerBroken)return{sell:true,confidence:Math.max(.72,num(inner?.confidence)),reason:'FINAL-CONTROLLER PROFIT EXIT: Gewinnerstruktur ist unabhängig bestätigt gebrochen.'};
 if(innerConfirmed&&(sellerControl||trendBreak||materialDamage))return{sell:true,confidence:num(inner.confidence),reason:`FINAL-CONTROLLER CONFIRMED THESIS EXIT: ${reason}`};
 return{sell:false};
}
function innerActionMap(actions){const out=new Map();for(const a of arr(actions)){const s=key(a);if(!s)continue;const old=out.get(s),rank=x=>String(x?.action||'').toUpperCase()==='SELL'?3:String(x?.action||'').toUpperCase()==='HOLD'&&protectedHold(x?.reason)?2:String(x?.action||'').toUpperCase()==='BUY'?1:0;if(!old||rank(a)>rank(old)||rank(a)===rank(old)&&num(a?.confidence)>num(old?.confidence))out.set(s,a)}return out}

function tradeRows(history,symbol){return arr(history).filter(x=>key(x?.symbol)===symbol&&['KAUF','BUY','VERKAUF','SELL'].includes(String(x?.action||'').toUpperCase())).sort((a,b)=>(Date.parse(a?.ts)||0)-(Date.parse(b?.ts)||0))}
function reentryDecision(history,symbol,q,now=Date.now()){
 const rows=tradeRows(history,symbol),sells=rows.filter(x=>['VERKAUF','SELL'].includes(String(x?.action||'').toUpperCase()));if(!sells.length)return{allow:true};
 const lastSell=sells.at(-1),sellAt=Date.parse(String(lastSell?.ts||''));if(!Number.isFinite(sellAt))return{allow:true};
 const age=Math.max(0,(now-sellAt)/60000);if(age>90)return{allow:true};
 const reason=String(lastSell?.reason||''),loss=num(lastSell?.trade_pnl)>=0?false:true,bugConflict=/FINAL-CONTROLLER HARD EXIT/i.test(reason)&&explicitExitHold(reason),recentSells=sells.filter(x=>{const t=Date.parse(String(x?.ts||''));return Number.isFinite(t)&&now-t<=90*60000}).length;
 const newThesis=['PULLBACK_RECLAIM','BASE_RECLAIM'].includes(q.type)&&q.m.score>=4.5&&q.m.confidence>=.58&&q.m.m5>=.05&&q.m.accel>=.02&&q.m.draw!==null&&q.m.draw<=-.45&&q.m.rsi<74;
 const strongFreshBreakout=q.type==='EARLY_BREAKOUT'&&q.quality>=.68&&q.m.score>=4.9&&q.m.m5>=.12&&q.m.accel>=.05&&q.m.day<=3&&q.m.rsi<70;
 if(age<15)return{allow:false,age,reason:`ANTI-FLIP-FLOP: letzter Verkauf von ${symbol} liegt erst ${age.toFixed(1)} Min. zurück. Kein unmittelbares BUY→SELL→BUY.`};
 if(loss&&age<25)return{allow:false,age,reason:`ANTI-FLIP-FLOP: letzter Verkauf war ein Verlusttrade und liegt erst ${age.toFixed(1)} Min. zurück. Erst neue Preisstruktur abwarten.`};
 if(bugConflict&&age<30)return{allow:false,age,reason:`ANTI-FLIP-FLOP: vorheriger Verkauf war ein widersprüchlicher HARD-EXIT/EXIT-HOLD-Fall. Mindestens neue unabhängige Struktur abwarten.`};
 if(recentSells>=2&&age<60)return{allow:false,age,reason:`ANTI-CHURN: ${recentSells} Verkäufe desselben Symbols in 90 Min.; Reentry vorerst gesperrt.`};
 if(age<45&&q.type==='EARLY_BREAKOUT')return{allow:false,age,reason:`ANTI-FLIP-FLOP: ein neuer EARLY_BREAKOUT nur ${age.toFixed(1)} Min. nach SELL ist keine neue These. Pullback/Base-Reclaim oder mehr Abstand erforderlich.`};
 if(age<45&&!newThesis)return{allow:false,age,reason:`ANTI-FLIP-FLOP: nach SELL innerhalb 45 Min. braucht ${symbol} eine neue bestätigte Pullback-/Base-Reclaim-These.`};
 if(age>=45&&q.type==='EARLY_BREAKOUT'&&!strongFreshBreakout&&age<60)return{allow:false,age,reason:`ANTI-FLIP-FLOP: Reentry-Breakout nach SELL ist noch nicht stark genug für eine neue These.`};
 return{allow:true,age,newThesis,strongFreshBreakout};
}

function postProcess(r,input,getState,getLearning){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const state=typeof getState==='function'?(getState()||{}):{},learningStatus=typeof getLearning==='function'?(getLearning()||null):null,cash=Math.max(0,num(state?.config?.cash)),start=Math.max(cash,num(state?.config?.start_capital,cash));
 const promptCandidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),promptHeld=arr(parseBlock(prompt,' Gehalten=')||[]),stateHeld=arr(state?.positions),stateCandidateMap=new Map(arr(state?.candidates).map(c=>[key(c),c]));
 const candidates=promptCandidates.map(c=>({...stateCandidateMap.get(key(c)),...c})),cMap=new Map(candidates.map(c=>[key(c),c])),heldMap=new Map();
 for(const h of [...stateHeld,...promptHeld]){const s=key(h);if(s)heldMap.set(s,{...(heldMap.get(s)||{}),...h})}
 const heldSet=new Set(heldMap.keys()),inner=innerActionMap(plan.actions),finalMap=new Map();let safetyBlocks=0,repeatBuyBlocks=0,calibrationBlocks=0,riskCaps=0,reentryBlocks=0,exitHoldConflicts=0;
 for(const [s,h0] of heldMap){const fresh=cMap.get(s)||stateCandidateMap.get(s)||{},h={...h0,...fresh,pnlPct:h0?.pnlPct??h0?.pnl_pct??h0?.pnl},d=sellDecision(h,inner.get(s));if(d.holdConflict)exitHoldConflicts++;finalMap.set(s,d.sell?{symbol:s,action:'SELL',confidence:d.confidence,allocation_pct:0,reason:d.reason}:{symbol:s,action:'HOLD',confidence:.70,allocation_pct:0,reason:d.reason||'FINAL-CONTROLLER HOLD: keine unabhängig bestätigte These-Invaliderung; Zeitablauf oder korrelierte Kurzfrist-Schwäche allein lösen keinen Verlustverkauf aus.'})}
 const sold=new Set([...finalMap.values()].filter(a=>a.action==='SELL').map(key)),best=new Map();
 for(const c of candidates){const s=key(c);if(!s||sold.has(s))continue;if(heldSet.has(s)){repeatBuyBlocks++;continue}const ia=inner.get(s);if(ia?.action==='SELL')continue;if(ia?.action==='HOLD'&&protectedHold(ia?.reason)){safetyBlocks++;continue}const q=candidateQuality(c,learningStatus);if(!q){const exp=calibratedEntryExpectation(c,learningStatus);if(exp.block)calibrationBlocks++;continue}const reentry=reentryDecision(state?.history,s,q);if(!reentry.allow){reentryBlocks++;continue}q.reentry=reentry;const old=best.get(s);if(!old||q.quality>old.quality)best.set(s,q)}
 const ranked=[...best.values()].sort((a,b)=>b.quality-a.quality||b.expectation.posteriorExpectedMovePct-a.expectation.posteriorExpectedMovePct||b.m.score-a.m.score).slice(0,4),minCash=Math.max(5,start*.001);
 if(cash>=minCash&&ranked.length){
  const target=targetDeployment(ranked),raw=allocate(ranked,target),riskAdjusted=applyPortfolioRiskCaps(raw,state,cash);
  for(const x of riskAdjusted){
   const pct=+x.allocation.toFixed(2);if(cash*pct/100<minCash)continue;if(x.riskCap?.requestedPct>pct+.01)riskCaps++;
   const e=x.expectation,capText=x.riskCap?.reasons?.length?` · Risiko-Cap: ${x.riskCap.reasons.join(', ')}`:'',reentryText=x.reentry?.age!=null?` · Reentry nach ${x.reentry.age.toFixed(1)} Min. mit neuer bestätigter These`:'';
   finalMap.set(key(x.c),{symbol:key(x.c),action:'BUY',confidence:clamp(Math.max(.58,x.m.confidence)+num(e?.confidenceDelta),.55,.88),allocation_pct:pct,reason:`FINAL-CONTROLLER V27.1 BUY ${x.type}: Qualität ${x.quality.toFixed(2)} · Score ${x.m.score.toFixed(2)} · 5m ${x.m.m5.toFixed(2)} · 20m ${x.m.m20.toFixed(2)} · Beschleunigung ${x.m.accel.toFixed(2)}${x.m.vol===null?'':` · Volumen ${x.m.vol.toFixed(2)}x`} · Setup-Kalibrierung ${e.bucket}: E[Move] ${e.posteriorExpectedMovePct>=0?'+':''}${e.posteriorExpectedMovePct.toFixed(3)}% · Trefferbasis ${(e.posteriorWinRate*100).toFixed(1)}% · n=${e.samples15} · Zielkapital ${target}% vor Depotrisiko${capText}${reentryText}. Keine automatische Aufstockung.`});
  }
 }
 const actions=[...finalMap.values()];plan.actions=actions;plan.summary=`FINAL-CONTROLLER V27.1: ${actions.filter(a=>a.action==='BUY').length} BUY · ${actions.filter(a=>a.action==='SELL').length} SELL · ${actions.filter(a=>a.action==='HOLD').length} HOLD · ${exitHoldConflicts} widersprüchliche EXIT-HOLD/HARD-EXIT(s) abgefangen · ${reentryBlocks} Flip-Flop-Reentry(s) blockiert · ${safetyBlocks} Safety-HOLD(s) · ${calibrationBlocks} empirisch schlechte Setup(s) blockiert · ${riskCaps} Allokation(en) durch Depotrisiko gekappt · ${repeatBuyBlocks} Bestands-BUY(s) verhindert.`;return{...r,response:JSON.stringify(plan)}
}

export class FinalDecisionController{constructor(base,{getState=null,getLearning=null}={}){this.base=base;this.getState=getState;this.getLearning=getLearning}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,this.getState,this.getLearning)}}
