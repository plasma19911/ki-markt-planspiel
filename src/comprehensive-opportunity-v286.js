const KEY='state/comprehensive-opportunity-v286';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=NaN)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};
const has=(o,names)=>names.some(n=>o!=null&&Object.prototype.hasOwnProperty.call(o,n)&&Number.isFinite(Number(o[n])));
const pick=(o,names,d=NaN)=>{for(const n of names)if(o!=null&&Number.isFinite(Number(o[n])))return Number(o[n]);return d};

function defaults(){return{version:1,snapshots:{},recent:[],lastRotationAt:0,stats:{allCandidateScores:0,scoreBuys:0,betterOpportunityRotations:0,hardBlocks:0},updatedAt:null}}
function stockOnly(c={}){const t=String(c?.instrument_type??c?.instrumentType??c?.type??'EQUITY').toUpperCase();return !/(?:ETF|ETP|FUND|INDEX|CRYPTO)/.test(t)}
function hardBlocked(c={}){const event=String(c?.eventRisk??c?.event_risk??'NONE').toUpperCase(),eventText=String(c?.eventText??c?.event_text??''),news=pick(c,['news','newsScore','news_score'],0),sell=String(c?.momentumSellSignal??c?.momentum_sell_signal??'NONE').toUpperCase(),state=String(c?.momentumState??c?.momentum_state??'NORMAL').toUpperCase(),m20=pick(c,['intraday20m','momentum20'],0),acc=pick(c,['momentumAcceleration5','momentum_acceleration5'],0),price=pick(c,['price','last_price'],0);return !stockOnly(c)||!(price>0)||c?.targetVenueVerified===false||c?.quoteValid===false||c?.quote_valid===false||Boolean(c?.targetVenueIssue)||(event==='HIGH'&&eventText.trim())||news<=-.65||(sell==='STRONG'&&m20<=-.20)||(state==='REVERSAL'&&m20<=-.28&&acc<=-.04)}
function regimePoints(state={}){const r=String(state?.marketBreadth?.regime??state?.marketRegime?.regime??'UNKNOWN').toUpperCase();return r==='BROAD_UP'?4:r==='REVERSAL_UP'?3:r==='REVERSAL_DOWN'?-3:r==='RISK_OFF'?-5:0}
function candidateScore(c={},state={},prev=null,now=Date.now()){
 let score=50,parts={},coverage=0;
 const raw=pick(c,['liveScore','score']);if(Number.isFinite(raw)){parts.scanner=clamp((raw-3.4)*6,-12,18);score+=parts.scanner;coverage++}else parts.scanner=0;
 const conf=pick(c,['liveConfidence','confidence','signal_confidence']);if(Number.isFinite(conf)){parts.confidence=clamp((conf-.50)*30,-8,10);score+=parts.confidence;coverage++}else parts.confidence=0;
 const day=pick(c,['day','day_change','dayChange']);if(Number.isFinite(day)){let p=0;if(day>=0&&day<=6)p=day*1.25;else if(day>6)p=Math.max(2,7.5-(day-6)*.35);else p=-Math.min(10,Math.abs(day)*1.5);parts.day=p;score+=p;coverage++}else parts.day=0;
 let momentum=0,momSeen=0;
 if(has(c,['intraday20m','momentum20'])){momentum+=clamp(pick(c,['intraday20m','momentum20'])*7,-6,8);momSeen++}
 if(has(c,['intraday5m','momentum5'])){momentum+=clamp(pick(c,['intraday5m','momentum5'])*9,-4,6);momSeen++}
 if(has(c,['momentumAcceleration5','momentum_acceleration5'])){momentum+=clamp(pick(c,['momentumAcceleration5','momentum_acceleration5'])*18,-3,4);momSeen++}
 parts.momentum=momentum;if(momSeen){score+=momentum;coverage++}
 const vol=pick(c,['volumeRatio','volume_ratio']);if(Number.isFinite(vol)){parts.volume=vol>=1.15&&vol<=3?5:vol>=.8?2:vol<.45?-3:vol>4?-2:0;score+=parts.volume;coverage++}else parts.volume=0;
 const news=pick(c,['news','newsScore','news_score']);if(Number.isFinite(news)){parts.news=clamp(news*14,-10,10);score+=parts.news;coverage++}else parts.news=0;
 const draw=pick(c,['drawdownFrom20mHighPct','drawdown_from_20m_high_pct']),m5=pick(c,['intraday5m','momentum5'],0),m20=pick(c,['intraday20m','momentum20'],0),acc=pick(c,['momentumAcceleration5','momentum_acceleration5'],0);
 const reclaim=Number.isFinite(draw)&&draw<=-.25&&draw>=-4&&m5>=0&&m20>=-.18&&acc>=0;parts.reclaim=reclaim?6:0;score+=parts.reclaim;
 parts.regime=regimePoints(state);score+=parts.regime;
 const rsi=pick(c,['intradayRsi','rsi'],50);let chase=0;if(Number.isFinite(day)&&day>=12)chase-=7;else if(Number.isFinite(day)&&day>=8)chase-=4;if(rsi>=82)chase-=4;if(m5>=.9&&acc>=.25)chase-=3;parts.chase=chase;score+=chase;
 if(prev&&Number.isFinite(prev.score)){const age=(now-num(prev.at,now))/60000;if(age>=.4&&age<=8){const delta=score-prev.score;parts.multiScan=delta>=4?4:delta>=1.5?2:delta<=-5?-3:0;score+=parts.multiScan}else parts.multiScan=0}else parts.multiScan=0;
 return{symbol:key(c),fusionScore:+clamp(score,0,100).toFixed(1),parts,coverage:+(coverage/6).toFixed(2),hardBlocked:hardBlocked(c),day:Number.isFinite(day)?day:null,price:pick(c,['price','last_price'],0)};
}
function positionScore(p={},candidate=null,state={},prev=null,now=Date.now()){
 if(candidate){const x=candidateScore(candidate,state,prev,now);return{...x,source:'LIVE_CANDIDATE',position:true}}
 let score=50,parts={};const raw=pick(p,['score'],0),conf=pick(p,['signal_confidence','confidence'],.5),entry=pick(p,['entry_price'],0),last=pick(p,['last_price'],entry),ef=pick(p,['entry_fx'],1),lf=pick(p,['last_fx'],ef),pl=entry>0&&last>0&&ef>0&&lf>0?(last*lf/(entry*ef)-1)*100:0;
 parts.positionSignal=clamp(raw*8,-18,12);score+=parts.positionSignal;parts.confidence=clamp((conf-.5)*30,-8,10);score+=parts.confidence;parts.pnl=clamp(pl*1.6,-10,8);score+=parts.pnl;
 return{symbol:key(p),fusionScore:+clamp(score,0,100).toFixed(1),parts,coverage:.5,hardBlocked:false,source:'POSITION_FALLBACK',partial:true,position:true,pnlPct:+pl.toFixed(2),price:last};
}
export function scoreAllOpportunitiesV286(state={},storage=null,now=Date.now(),updateMemory=false){
 const mem={...defaults(),...read(storage,defaults())};mem.snapshots={...(mem.snapshots||{})};mem.recent=arr(mem.recent);mem.stats={...defaults().stats,...(mem.stats||{})};
 const candidates=arr(state?.candidates),candMap=new Map(candidates.map(c=>[key(c),c]).filter(([s])=>s)),ranking=[];
 for(const c of candidates){const s=key(c);if(!s)continue;const row=candidateScore(c,state,mem.snapshots[s],now);ranking.push(row);if(updateMemory)mem.snapshots[s]={at:now,score:row.fusionScore,hardBlocked:row.hardBlocked}}
 ranking.sort((a,b)=>Number(a.hardBlocked)-Number(b.hardBlocked)||b.fusionScore-a.fusionScore);
 const positionScores=arr(state?.positions).map(p=>{const s=key(p);return positionScore(p,candMap.get(s),state,mem.snapshots[s],now)}).filter(x=>x.symbol);
 if(updateMemory){mem.stats.allCandidateScores+=ranking.length;mem.updatedAt=new Date(now).toISOString();for(const [s,v] of Object.entries(mem.snapshots))if(now-num(v?.at,0)>45*60000)delete mem.snapshots[s];write(storage,mem)}
 return{version:28.6,ranking,positionScores,candidateCount:ranking.length,positionCount:positionScores.length,allDecisionCandidatesScored:ranking.length===candidates.filter(c=>key(c)).length,mem};
}
function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}
function allocationPct(cash,score){let pct=8+Math.max(0,score-72)*.25;if(cash>=500)pct=Math.max(pct,500/cash*100);return +clamp(pct,7,13).toFixed(2)}
function stable(mem,row,now){const p=mem?.snapshots?.[row.symbol];if(!p||!Number.isFinite(p.score))return false;const age=(now-num(p.at,now))/60000;return age>=.4&&age<=8&&row.fusionScore>=Math.max(68,p.score-5)}
function positionAgeMin(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at||''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):999}
function meaningfulPosition(p={}){return num(p?.invested,0)>=250}
export function enforceComprehensiveOpportunityV286(plan,state={},storage=null,now=Date.now()){
 if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
 const before={...defaults(),...read(storage,defaults())};before.snapshots={...(before.snapshots||{})};before.recent=arr(before.recent);
 const scored=scoreAllOpportunitiesV286(state,storage,now,false),byCand=new Map(scored.ranking.map(x=>[x.symbol,x])),byPos=new Map(scored.positionScores.map(x=>[x.symbol,x])),candMap=new Map(arr(state?.candidates).map(c=>[key(c),c]));
 const actions=plan.actions.map(x=>({...x})),findAction=s=>actions.find(a=>key(a)===s),counters={scoreBuys:0,betterOpportunityRotations:0,hardBlocks:0};
 const eligible=scored.ranking.filter(r=>!r.hardBlocked&&candMap.has(r.symbol)),top=eligible[0],cash=Math.max(0,pick(state?.config||{},['cash'],pick(state,['cash'],0)));
 if(top&&stable(before,top,now)&&top.fusionScore>=72&&!(top.day>=12&&top.fusionScore<78)){
   let a=findAction(top.symbol);if(a&&String(a.action||'').toUpperCase()==='HOLD'){a.action='BUY';a.allocation_pct=allocationPct(cash,top.fusionScore);a.confidence=clamp(Math.max(num(a.confidence,.62),.62+(top.fusionScore-72)/100),.62,.88);a.reason=`COMPREHENSIVE V28.6 BUY: ${top.symbol} ist nach einheitlicher Bewertung aller aktuellen Entscheidungskandidaten die staerkste bestaetigte Chance (${top.fusionScore.toFixed(1)}/100). Fehlende optionale Daten werden neutral statt als Nullsignal behandelt; Hard-Blocks bleiben bindend.`;counters.scoreBuys++}
 }
 const selected=actions.find(a=>String(a?.action||'').toUpperCase()==='BUY'&&byCand.has(key(a)))||null,selectedScore=selected?byCand.get(key(selected)):null;
 const meaningful=arr(state?.positions).filter(meaningfulPosition).map(p=>({p,row:byPos.get(key(p))})).filter(x=>x.row).sort((a,b)=>a.row.fusionScore-b.row.fusionScore),weak=meaningful[0];
 if(selectedScore&&weak&&!selectedScore.hardBlocked&&stable(before,selectedScore,now)&&positionAgeMin(weak.p,now)>=30){
   const gap=selectedScore.fusionScore-weak.row.fusionScore,lowCash=cash<500,rotate=(selectedScore.fusionScore>=72&&((lowCash&&weak.row.fusionScore<=50&&gap>=20)||(weak.row.fusionScore<=42&&gap>=30)))&&now-num(before.lastRotationAt,0)>=20*60000;
   if(rotate&&weak.row.symbol!==selectedScore.symbol){
     let wa=findAction(weak.row.symbol);if(!wa){wa={symbol:weak.row.symbol,action:'HOLD',confidence:.7,allocation_pct:0,reason:'position'};actions.push(wa)}
     if(String(wa.action||'').toUpperCase()==='HOLD'){wa.action='SELL';wa.allocation_pct=0;wa.confidence=.82;wa.reason=`BETTER-OPPORTUNITY ROTATION V28.6: ${weak.row.symbol} ist mit Research ${weak.row.fusionScore.toFixed(1)}/100 deutlich schwaecher als ${selectedScore.symbol} mit ${selectedScore.fusionScore.toFixed(1)}/100 (Abstand ${gap.toFixed(1)}). Maximal eine Rotation, Mindesthaltezeit und 20-Minuten-Cooldown verhindern Churn.`;counters.betterOpportunityRotations++;before.lastRotationAt=now;before.recent.push({at:now,type:'BETTER_OPPORTUNITY_ROTATION',sell:weak.row.symbol,sellScore:weak.row.fusionScore,buy:selectedScore.symbol,buyScore:selectedScore.fusionScore,gap:+gap.toFixed(1)})}
   }
 }
 const fresh=scoreAllOpportunitiesV286(state,storage,now,true);fresh.mem.lastRotationAt=before.lastRotationAt;fresh.mem.stats.scoreBuys=num(fresh.mem.stats.scoreBuys,0)+counters.scoreBuys;fresh.mem.stats.betterOpportunityRotations=num(fresh.mem.stats.betterOpportunityRotations,0)+counters.betterOpportunityRotations;fresh.mem.recent=[...arr(fresh.mem.recent),...arr(before.recent).slice(-4)].slice(-120);write(storage,fresh.mem);
 plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,170)} · COMPREHENSIVE V28.6: ${fresh.candidateCount} Kandidaten + ${fresh.positionCount} Positionen bewertet · ${counters.scoreBuys} Score-BUY(s) · ${counters.betterOpportunityRotations} Rotation(en) zu deutlich besserer Chance.`;
 return{plan,counters,scored:fresh};
}
export class ComprehensiveOpportunityGuardV286{
 constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
 async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceComprehensiveOpportunityV286(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
 status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},s=scoreAllOpportunitiesV286(state,this.storage,typeof this.now==='function'?this.now():Date.now(),false);return{enabled:true,version:28.6,allDecisionCandidatesScored:s.allDecisionCandidatesScored,candidateCount:s.candidateCount,positionCount:s.positionCount,ranking:s.ranking,positionScores:s.positionScores,scoreScale:'0-100 neutral-normalized; missing optional inputs are neutral, not zero',buyThreshold:72,overextendedBuyThreshold:78,rotationRules:{maxPerDecision:1,minPositionAgeMinutes:30,cooldownMinutes:20,minGapLowCash:20,minGapNormalCash:30},latest:this.latest?.counters||null,rule:'V28.6 bewertet jeden aktuellen Entscheidungskandidaten und jede offene Position auf derselben Skala. Deutlich schwache Positionen duerfen kontrolliert fuer mehrfach bestaetigte, wesentlich bessere Chancen rotieren; kleine Score-Unterschiede loesen keinen Verkauf aus.'}}
}
