const KEY='state/calibrated-action-score-v287';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const base=v=>key(v).split('.')[0];
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};
const pick=(o,names,d=NaN)=>{for(const n of names)if(o!=null&&finite(o[n]))return Number(o[n]);return d};

function defaults(){return{version:1,snapshots:{},recent:[],lastRotationAt:0,stats:{scored:0,scoreBuys:0,scoreSells:0,rotations:0,suppressedChases:0},updatedAt:null}}
function stockOnly(c={}){const t=String(c?.instrument_type??c?.instrumentType??c?.type??'EQUITY').toUpperCase();return !/(?:ETF|ETP|FUND|INDEX|CRYPTO)/.test(t)}
function hardBlocked(c={}){
 const price=pick(c,['price','last_price'],0),event=String(c?.eventRisk??c?.event_risk??'NONE').toUpperCase(),eventText=String(c?.eventText??c?.event_text??''),news=pick(c,['news','newsScore','news_score'],0),sell=String(c?.momentumSellSignal??c?.momentum_sell_signal??'NONE').toUpperCase(),state=String(c?.momentumState??c?.momentum_state??'NORMAL').toUpperCase(),m20=pick(c,['intraday20m','momentum20'],0),acc=pick(c,['momentumAcceleration5','momentum_acceleration5'],0);
 return !stockOnly(c)||!(price>0)||c?.targetVenueVerified===false||c?.quoteValid===false||c?.quote_valid===false||Boolean(c?.targetVenueIssue)||(event==='HIGH'&&eventText.trim())||news<=-.65||(sell==='STRONG'&&m20<=-.20)||(state==='REVERSAL'&&m20<=-.28&&acc<=-.04)
}
function regimePoints(state={}){const r=String(state?.marketBreadth?.regime??state?.marketRegime?.regime??'UNKNOWN').toUpperCase();return r==='BROAD_UP'?4:r==='REVERSAL_UP'?3:r==='REVERSAL_DOWN'?-3:r==='RISK_OFF'?-5:0}
function headlineInfo(state={},symbol=''){
 const b=base(symbol),now=Date.now();let best=null;
 for(const n of arr(state?.newsRadar)){if(base(n?.symbol||n?.ticker)!==b)continue;const t=Date.parse(String(n?.publishedAt??n?.published_at??n?.ts??n?.time??''));if(!best||t>best.t)best={n,t}}
 if(!best)return{fresh:false,quant:false};
 const h=String(best.n?.headline??best.n?.title??best.n?.text??''),age=Number.isFinite(best.t)?Math.max(0,(now-best.t)/60000):Infinity,fresh=age<=180,quant=/(?:earnings|eps|revenue|sales|guidance|forecast|margin|profit|order|contract|buyback|dividend|approval|gewinn|umsatz|prognose|marge|auftrag|vertrag|rückkauf|dividende|zulassung|genehmigung|übertrifft|anhebung|beats|raises)/i.test(h)&&(/\d/.test(h)||/(?:beats|raises|übertrifft|anhebung)/i.test(h));
 return{fresh,quant,headline:h.slice(0,160),age}
}
function dayPoints(day){if(!finite(day))return 0;day=Number(day);if(day<0)return-clamp(Math.abs(day)*1.6,0,10);if(day<=1.5)return day*2;if(day<=4)return 3+(day-1.5)*2;if(day<=7)return 8-(day-4);if(day<=10)return 5-(day-7)*2;return -1-clamp((day-10)*1.8,0,13)}
function momentumPoints(c={}){
 let p=0,seen=0;const m20=pick(c,['intraday20m','momentum20']),m5=pick(c,['intraday5m','momentum5']),acc=pick(c,['momentumAcceleration5','momentum_acceleration5']);
 if(finite(m20)){p+=m20<0?clamp(m20*8,-7,0):clamp(m20*6,0,6);seen++}
 if(finite(m5)){p+=m5<0?clamp(m5*10,-4,0):clamp(m5*8,0,4);seen++}
 if(finite(acc)){p+=acc<0?clamp(acc*20,-3,0):clamp(acc*14,0,3);seen++}
 return{points:p,seen,m20:num(m20,0),m5:num(m5,0),acc:num(acc,0)}
}
function candidateScore(c={},state={},prev=null,now=Date.now()){
 let score=50,parts={},groups=0;
 const raw=pick(c,['liveScore','score']);if(finite(raw)){parts.scanner=clamp((raw-3.5)*5.2,-12,15);score+=parts.scanner;groups++}else parts.scanner=0;
 const conf=pick(c,['liveConfidence','confidence','signal_confidence']);if(finite(conf)){parts.confidence=clamp((conf-.50)*28,-8,9);score+=parts.confidence;groups++}else parts.confidence=0;
 const day=pick(c,['day','day_change','dayChange']);if(finite(day)){parts.day=dayPoints(day);score+=parts.day;groups++}else parts.day=0;
 const mom=momentumPoints(c);parts.momentum=mom.points;if(mom.seen){score+=mom.points;groups++}
 const vol=pick(c,['volumeRatio','volume_ratio']);if(finite(vol)){parts.volume=vol>=1.15&&vol<=2.8?5:vol>=.8&&vol<1.15?2:vol<.45?-3:vol>4?-4:0;score+=parts.volume;groups++}else parts.volume=0;
 const news=pick(c,['news','newsScore','news_score']);let np=0;if(finite(news)){np+=clamp(news*10,-7,7);groups++}const hi=headlineInfo(state,key(c));if(hi.fresh)np+=2;if(hi.fresh&&hi.quant)np+=3;parts.news=clamp(np,-8,10);score+=parts.news;
 const draw=pick(c,['drawdownFrom20mHighPct','drawdown_from_20m_high_pct']),reclaim=finite(draw)&&draw<=-.25&&draw>=-4&&mom.m5>=0&&mom.m20>=-.18&&mom.acc>=0;parts.reclaim=reclaim?8:0;score+=parts.reclaim;
 parts.regime=regimePoints(state);score+=parts.regime;
 const rsi=pick(c,['intradayRsi','rsi'],50);let over=0;if(finite(day)&&day>=12)over-=12;else if(finite(day)&&day>=8)over-=6;if(rsi>=82)over-=7;else if(rsi>=78)over-=3;if(mom.m5>=.9&&mom.acc>=.25)over-=6;if(reclaim&&over<0)over*=.45;parts.overextension=+over.toFixed(1);score+=over;
 let multi=0;if(prev&&finite(prev.score)){const age=(now-num(prev.at,now))/60000;if(age>=.4&&age<=8){const delta=score-prev.score;multi=delta>=4?4:delta>=1.5?2:delta<=-6?-4:0}}parts.multiScan=multi;score+=multi;
 const coverage=clamp(groups/6,0,1),rawScore=clamp(score,0,100),reliability=.68+.32*coverage,final=50+(rawScore-50)*reliability;
 return{symbol:key(c),fusionScore:+clamp(final,0,100).toFixed(1),buyScore:+clamp(final,0,100).toFixed(1),holdScore:+clamp(final,0,100).toFixed(1),sellScore:+clamp(100-final,0,100).toFixed(1),parts,coverage:+coverage.toFixed(2),hardBlocked:hardBlocked(c),overextended:over<=-6,reclaim,day:finite(day)?Number(day):null,price:pick(c,['price','last_price'],0),newsHeadline:hi.headline||null}
}
function positionScore(p={},candidate=null,state={},prev=null,now=Date.now()){
 if(candidate){const x=candidateScore(candidate,state,prev,now);return{...x,source:'LIVE_CANDIDATE',position:true,partial:false}}
 const raw=pick(p,['score'],0),conf=pick(p,['signal_confidence','confidence'],.5),entry=pick(p,['entry_price'],0),last=pick(p,['last_price'],entry),ef=pick(p,['entry_fx'],1),lf=pick(p,['last_fx'],ef),pl=entry>0&&last>0&&ef>0&&lf>0?(last*lf/(entry*ef)-1)*100:0;
 let hold=50+clamp(raw*5,-15,10)+clamp((conf-.5)*20,-6,7)+clamp(pl*1.2,-8,6);hold=clamp(hold,25,70);
 return{symbol:key(p),fusionScore:+hold.toFixed(1),buyScore:+hold.toFixed(1),holdScore:+hold.toFixed(1),sellScore:+(100-hold).toFixed(1),parts:{positionSignal:+clamp(raw*5,-15,10).toFixed(1),confidence:+clamp((conf-.5)*20,-6,7).toFixed(1),pnl:+clamp(pl*1.2,-8,6).toFixed(1)},coverage:.34,hardBlocked:false,source:'POSITION_PARTIAL',partial:true,position:true,pnlPct:+pl.toFixed(2),price:last}
}
export function scoreAllV287(state={},storage=null,now=Date.now(),update=false){
 const mem={...defaults(),...read(storage,defaults())};mem.snapshots={...(mem.snapshots||{})};mem.recent=arr(mem.recent);mem.stats={...defaults().stats,...(mem.stats||{})};
 const candidates=arr(state?.candidates),cmap=new Map(candidates.map(c=>[key(c),c]).filter(([s])=>s)),ranking=[];
 for(const c of candidates){const s=key(c);if(!s)continue;const row=candidateScore(c,state,mem.snapshots[s],now);ranking.push(row);if(update)mem.snapshots[s]={at:now,score:row.buyScore,overextended:row.overextended}}
 ranking.sort((a,b)=>Number(a.hardBlocked)-Number(b.hardBlocked)||b.buyScore-a.buyScore);
 const positionScores=arr(state?.positions).map(p=>positionScore(p,cmap.get(key(p)),state,mem.snapshots[key(p)],now)).filter(x=>x.symbol);
 if(update){mem.stats.scored+=ranking.length;mem.updatedAt=new Date(now).toISOString();for(const [s,v] of Object.entries(mem.snapshots))if(now-num(v?.at,0)>45*60000)delete mem.snapshots[s];write(storage,mem)}
 return{version:28.7,ranking,positionScores,candidateCount:ranking.length,positionCount:positionScores.length,allDecisionCandidatesScored:ranking.length===candidates.filter(c=>key(c)).length,mem}
}
function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}
function stable(mem,row,now){const p=mem?.snapshots?.[row.symbol];if(!p||!finite(p.score))return false;const age=(now-num(p.at,now))/60000;return age>=.4&&age<=8&&row.buyScore>=Math.max(68,p.score-5)}
function allocationPct(cash,score){let pct=8+Math.max(0,score-75)*.2;if(cash>=500)pct=Math.max(pct,500/cash*100);return +clamp(pct,7,12).toFixed(2)}
function ageMin(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at||''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):999}
export function enforceV287(plan,state={},storage=null,now=Date.now()){
 if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
 const before={...defaults(),...read(storage,defaults())};before.snapshots={...(before.snapshots||{})};before.recent=arr(before.recent);before.stats={...defaults().stats,...(before.stats||{})};
 const scored=scoreAllV287(state,storage,now,false),byC=new Map(scored.ranking.map(x=>[x.symbol,x])),byP=new Map(scored.positionScores.map(x=>[x.symbol,x])),actions=plan.actions.map(x=>({...x})),find=s=>actions.find(a=>key(a)===s),counters={scoreBuys:0,scoreSells:0,rotations:0,suppressedChases:0};
 for(const a of actions){if(String(a?.action||'').toUpperCase()!=='BUY')continue;const row=byC.get(key(a));if(!row)continue;if(row.hardBlocked||row.buyScore<64||(row.overextended&&row.buyScore<78)){a.action='HOLD';a.allocation_pct=0;a.reason=`CALIBRATED V28.7 HOLD: ${row.symbol} Kaufscore ${row.buyScore.toFixed(1)}/100${row.overextended?' · Einstieg aktuell überdehnt':''}. Ältere BUY-Logik wird nicht über die kalibrierte Chancen-/Timingbewertung gestellt.`;if(row.overextended)counters.suppressedChases++}}
 const eligible=scored.ranking.filter(r=>!r.hardBlocked),top=eligible[0],cash=Math.max(0,pick(state?.config||{},['cash'],pick(state,['cash'],0)));
 if(top&&top.buyScore>=75&&stable(before,top,now)){
  let a=find(top.symbol);if(a&&String(a.action||'').toUpperCase()==='HOLD'){a.action='BUY';a.allocation_pct=allocationPct(cash,top.buyScore);a.confidence=clamp(.62+(top.buyScore-70)/100,.62,.88);a.reason=`CALIBRATED V28.7 BUY: bester bestätigter Kaufscore ${top.buyScore.toFixed(1)}/100 · Datenabdeckung ${Math.round(top.coverage*100)}%${top.reclaim?' · Reclaim bestätigt':''}${top.overextended?' · trotz Rest-Überdehnung nur nach Mehrfachbestätigung':''}. Fehlende optionale Daten ziehen nicht künstlich auf 0, sondern reduzieren nur die Sicherheit des Extremwerts.`;counters.scoreBuys++}
 }
 const selected=actions.map(a=>({a,row:byC.get(key(a))})).filter(x=>String(x.a?.action||'').toUpperCase()==='BUY'&&x.row&&!x.row.hardBlocked).sort((a,b)=>b.row.buyScore-a.row.buyScore)[0];
 const positions=arr(state?.positions).map(p=>({p,row:byP.get(key(p))})).filter(x=>x.row),freshPositions=positions.filter(x=>!x.row.partial&&x.row.coverage>=.5&&ageMin(x.p,now)>=45);
 for(const x of freshPositions){const a=find(x.row.symbol);if(!a||String(a.action||'').toUpperCase()!=='HOLD')continue;if(x.row.sellScore>=72&&x.row.holdScore<=28){a.action='SELL';a.allocation_pct=0;a.confidence=.82;a.reason=`CALIBRATED V28.7 SELL: Haltescore ${x.row.holdScore.toFixed(1)}/100 · Verkaufsscore ${x.row.sellScore.toFixed(1)}/100 bei frischen, ausreichend vollständigen Daten. Teil-/Altwerte allein lösen keinen Verkauf aus.`;counters.scoreSells++;break}}
 if(selected&&cash<500&&Date.now()-num(before.lastRotationAt,0)>=20*60000){const weak=freshPositions.filter(x=>x.row.symbol!==selected.row.symbol).sort((a,b)=>a.row.holdScore-b.row.holdScore)[0];if(weak){const gap=selected.row.buyScore-weak.row.holdScore;if(selected.row.buyScore>=76&&weak.row.holdScore<=46&&gap>=24){let a=find(weak.row.symbol);if(a&&String(a.action||'').toUpperCase()==='HOLD'){a.action='SELL';a.allocation_pct=0;a.confidence=.82;a.reason=`V28.7 ROTATION: ${weak.row.symbol} Haltescore ${weak.row.holdScore.toFixed(1)} wird nur deshalb ersetzt, weil ${selected.row.symbol} im selben Scan bereits als BUY ${selected.row.buyScore.toFixed(1)} freigegeben ist. Abstand ${gap.toFixed(1)} · Rotation nur bei knappem Cash.`;counters.rotations++;before.lastRotationAt=now}}}}
 const fresh=scoreAllV287(state,storage,now,true);fresh.mem.lastRotationAt=before.lastRotationAt;fresh.mem.stats.scoreBuys=num(fresh.mem.stats.scoreBuys)+counters.scoreBuys;fresh.mem.stats.scoreSells=num(fresh.mem.stats.scoreSells)+counters.scoreSells;fresh.mem.stats.rotations=num(fresh.mem.stats.rotations)+counters.rotations;fresh.mem.stats.suppressedChases=num(fresh.mem.stats.suppressedChases)+counters.suppressedChases;write(storage,fresh.mem);
 plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,165)} · CALIBRATED V28.7: ${fresh.candidateCount} Kandidaten bewertet · ${counters.scoreBuys} BUY · ${counters.scoreSells} Score-SELL · ${counters.rotations} Rotation · ${counters.suppressedChases} Chase-BUY gebremst.`;
 return{plan,counters,scored:fresh}
}
export class CalibratedActionScoreGuardV287{
 constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
 async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceV287(p,state,this.storage,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
 status(){const state=typeof this.getState==='function'?(this.getState()||{}):{},s=scoreAllV287(state,this.storage,typeof this.now==='function'?this.now():Date.now(),false);return{enabled:true,version:28.7,ranking:s.ranking,positionScores:s.positionScores,candidateCount:s.candidateCount,positionCount:s.positionCount,allDecisionCandidatesScored:s.allDecisionCandidatesScored,buyThreshold:75,confirmThreshold:68,watchThreshold:58,scoreModel:'V28.7 calibrated action score: neutral baseline, coverage shrinkage, nonlinear overextension penalty, fresh-news quality and separate hold/sell score',rules:{missingData:'neutral + confidence shrink, never automatic zero',overextension:'strongly reduces entry score; reclaim can recover part of penalty',rotation:'only when better candidate is already BUY and cash is scarce',partialPosition:'informational only; never sufficient for automatic SELL'},latest:this.latest?.counters||null}}
}
