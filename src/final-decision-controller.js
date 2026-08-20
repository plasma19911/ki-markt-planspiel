import {targetVenueIssue} from './target-venue-ai-guard.js';

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
 vol,news:num(c?.news,c?.newsScore??c?.news_score),event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),
 state:String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell:String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),
 buyers:num(c?.buyerShare??c?.buyer_share??c?.buyerPct??c?.buyer_pct,-1),sellers:num(c?.sellerShare??c?.seller_share??c?.sellerPct??c?.seller_pct,-1)
}}
function negated(reason=''){return/(?:KEIN(?:E|EN|ER)?|NICHT|UNBESTÄTIGT|UNBESTAETIGT|NO\s+|NOT\s+|OHNE)\s{0,20}(?:REVERSAL|STRONG[- ]?SELL|INVALIDATION|VERKÄUFER|SELLER|BEARISH|BÄRISCH)/i.test(String(reason))}
function protectedHold(reason=''){if(negated(reason))return false;return/(?:TARGET-VENUE-BLOCK|NEWS-IMPACT BLOCK|NEWS-SHOCK WAIT|CATALYST WATCH|EVENT[- ]?RISK|REGULATORY_REJECTION|SEVERE_NEGATIVE|DILUTION_FINANCING|REVERSAL|STRONG SELL|PEAK[- ]?CHASE|HIGH[- ]?CHASE|OVERHEAT|GETTEX|FX[- ]?SAFETY|QUOTE[- ]?SANITY|BAD QUOTE|STALE QUOTE|FALLING KNIFE|MULTI[- ]?TIMEFRAME.*BLOCK|MTF.*BLOCK)/i.test(String(reason))}
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
function candidateQuality(c){
 const m=metrics(c);if(hardBuyBlock(c,m)||peakRisk(m))return null;
 const type=entryType(m);if(!type)return null;
 if(m.score<3.55||m.confidence<.50||m.m20<-.35||m.m5<-.12)return null;
 if(m.vol!==null&&m.vol<.40)return null;
 const q=clamp((m.score-3.3)/2.7,0,1)*.34+clamp((m.confidence-.48)/.32,0,1)*.20+clamp((m.m5+.08)/.35,0,1)*.16+clamp((m.m20+.20)/.65,0,1)*.12+clamp((m.accel+.01)/.20,0,1)*.12+clamp((m.news+.35)/1.0,0,1)*.06;
 return{c,m,type,quality:clamp(q,0,1)};
}
function targetDeployment(rows){
 if(!rows.length)return 0;const top=rows[0].quality,avg=rows.reduce((a,x)=>a+x.quality,0)/rows.length,n=rows.length;
 if(n>=4&&top>=.68&&avg>=.52)return 100;if(n>=3&&top>=.60)return 85;if(n>=2&&top>=.55)return 65;if(top>=.72)return 50;if(top>=.58)return 35;return 22;
}
function allocate(rows,target){if(!rows.length||target<=0)return[];const weights=rows.map(x=>.5+x.quality),sum=weights.reduce((a,b)=>a+b,0)||1;return rows.map((x,i)=>({...x,allocation:target*weights[i]/sum})).filter(x=>x.allocation>=2)}
function heldPnl(h={}){for(const v of [h?.pnlPct,h?.pnl_pct,h?.pnl])if(Number.isFinite(Number(v)))return Number(v);return 0}
function heldAgeMinutes(h={}){if(Number.isFinite(Number(h?.ageMinutes)))return Math.max(0,Number(h.ageMinutes));const t=Date.parse(String(h?.opened_at||h?.openedAt||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/60000):999}
function sellDecision(h,inner=null){
 const m=metrics(h),pl=heldPnl(h),age=heldAgeMinutes(h),reason=String(inner?.reason||''),hard=m.event==='HIGH'||m.state==='REVERSAL'||m.sell==='STRONG'||m.news<=-.65||hardSellReason(reason);
 const sellers=m.sellers>=0?m.sellers:(m.buyers>=0?100-m.buyers:-1);
 const confirmedWeak=(m.m5<=-.12&&m.m20<=-.18&&m.accel<=-.02)||(sellers>=62&&m.m20<0)||(m.m5<=-.25&&m.accel<0);
 const severeWeak=(m.m5<=-.35&&m.m20<=-.30&&m.accel<=-.04)||(sellers>=70&&m.m20<=-.15);
 const winnerBroken=pl>0&&((m.m5<=-.18&&m.m20<=-.10)||(sellers>=65&&m.accel<0));
 const softExitMature=age>=12||severeWeak||pl<=-2.2;
 if(hard)return{sell:true,confidence:Math.max(.84,num(inner?.confidence)),reason:`FINAL-CONTROLLER HARD EXIT: strukturierter harter Risikoauslöser bestätigt · ${reason||'News/Event/Reversal/STRONG-SELL.'}`};
 if(pl<=0&&confirmedWeak&&softExitMature)return{sell:true,confidence:Math.max(.72,num(inner?.confidence)),reason:`FINAL-CONTROLLER INVALIDATION EXIT: Verlustposition zeigt bestätigte Mehrsignal-Schwäche · Alter ${age.toFixed(1)} Min. · P/L ${pl.toFixed(2)}%.`};
 if(pl>0&&winnerBroken)return{sell:true,confidence:Math.max(.70,num(inner?.confidence)),reason:'FINAL-CONTROLLER PROFIT EXIT: Gewinnerstruktur ist auf mehreren frischen Signalen gebrochen.'};
 if(inner?.action==='SELL'&&num(inner?.confidence)>=.68&&confirmedSellReason(reason)&&softExitMature)return{sell:true,confidence:num(inner.confidence),reason:`FINAL-CONTROLLER CONFIRMED EXIT: ${reason}`};
 return{sell:false};
}
function innerActionMap(actions){const out=new Map();for(const a of arr(actions)){const s=key(a);if(!s)continue;const old=out.get(s),rank=x=>String(x?.action||'').toUpperCase()==='SELL'?3:String(x?.action||'').toUpperCase()==='HOLD'&&protectedHold(x?.reason)?2:String(x?.action||'').toUpperCase()==='BUY'?1:0;if(!old||rank(a)>rank(old)||rank(a)===rank(old)&&num(a?.confidence)>num(old?.confidence))out.set(s,a)}return out}

function postProcess(r,input,getState){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const state=typeof getState==='function'?(getState()||{}):{},cash=Math.max(0,num(state?.config?.cash)),start=Math.max(cash,num(state?.config?.start_capital,cash));
 const promptCandidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),promptHeld=arr(parseBlock(prompt,' Gehalten=')||[]),stateHeld=arr(state?.positions),stateCandidateMap=new Map(arr(state?.candidates).map(c=>[key(c),c]));
 const candidates=promptCandidates.map(c=>({...stateCandidateMap.get(key(c)),...c})),cMap=new Map(candidates.map(c=>[key(c),c])),heldMap=new Map();
 for(const h of [...stateHeld,...promptHeld]){const s=key(h);if(s)heldMap.set(s,{...(heldMap.get(s)||{}),...h})}
 const heldSet=new Set(heldMap.keys()),inner=innerActionMap(plan.actions),finalMap=new Map();let safetyBlocks=0,repeatBuyBlocks=0;
 for(const [s,h0] of heldMap){const fresh=cMap.get(s)||stateCandidateMap.get(s)||{},h={...h0,...fresh,pnlPct:h0?.pnlPct??h0?.pnl_pct??h0?.pnl},d=sellDecision(h,inner.get(s));finalMap.set(s,d.sell?{symbol:s,action:'SELL',confidence:d.confidence,allocation_pct:0,reason:d.reason}:{symbol:s,action:'HOLD',confidence:.70,allocation_pct:0,reason:'FINAL-CONTROLLER HOLD: keine bestätigte Invalidation; frische Verlustpositionen werden nicht wegen normalem Rauschen sofort verkauft.'})}
 const sold=new Set([...finalMap.values()].filter(a=>a.action==='SELL').map(key)),best=new Map();
 for(const c of candidates){const s=key(c);if(!s||sold.has(s))continue;if(heldSet.has(s)){repeatBuyBlocks++;continue}const ia=inner.get(s);if(ia?.action==='SELL')continue;if(ia?.action==='HOLD'&&protectedHold(ia?.reason)){safetyBlocks++;continue}const q=candidateQuality(c);if(!q)continue;const old=best.get(s);if(!old||q.quality>old.quality)best.set(s,q)}
 const ranked=[...best.values()].sort((a,b)=>b.quality-a.quality||b.m.score-a.m.score).slice(0,4),minCash=Math.max(5,start*.001);
 if(cash>=minCash&&ranked.length){const target=targetDeployment(ranked);for(const x of allocate(ranked,target)){const pct=+x.allocation.toFixed(2);if(cash*pct/100<minCash)continue;finalMap.set(key(x.c),{symbol:key(x.c),action:'BUY',confidence:clamp(Math.max(.58,x.m.confidence),.58,.88),allocation_pct:pct,reason:`FINAL-CONTROLLER V26.1 BUY ${x.type}: Qualität ${x.quality.toFixed(2)} · Score ${x.m.score.toFixed(2)} · 5m ${x.m.m5.toFixed(2)} · 20m ${x.m.m20.toFixed(2)} · Beschleunigung ${x.m.accel.toFixed(2)}${x.m.vol===null?'':` · Volumen ${x.m.vol.toFixed(2)}x`} · Zielkapital ${target}% des freien Cashs. Harte Safety-HOLDs und automatische Wiederholungs-Aufstockungen wurden ausgeschlossen.`})}}
 const actions=[...finalMap.values()];plan.actions=actions;plan.summary=`FINAL-CONTROLLER V26.1: ${actions.filter(a=>a.action==='BUY').length} BUY · ${actions.filter(a=>a.action==='SELL').length} SELL · ${actions.filter(a=>a.action==='HOLD').length} HOLD · ${safetyBlocks} harte Safety-HOLD(s) respektiert · ${repeatBuyBlocks} Bestands-BUY(s) verhindert · Soft-Verlust-SELLs erst nach Reife/Mehrsignal-Invaliderung.`;return{...r,response:JSON.stringify(plan)}
}

export class FinalDecisionController{constructor(base,{getState=null}={}){this.base=base;this.getState=getState}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,this.getState)}}
