const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));

export const EXPECTANCY_CORE_V310={
  version:31.3,
  patch:'31.3.0-capital-velocity',
  hardStopPct:-1.2,
  trailArmPct:2.4,
  trailGivebackPct:0.9,
  runnerArmPct:4.5,
  runnerGivebackPct:1.6,
  minHoldMinutes:8,
  reentryMinutes:45,
  reentryScoreImprovement:6,
  minPositionEur:2200,
  stagnationReviewMinutes:75,
  maxStagnationMinutes:180,
  stagnationBandPct:0.6,
  stagnationScoreCeiling:58,
  profitFadeReviewMinutes:90,
  profitFadeMinPct:0.8,
  profitFadeGivebackPct:0.25,
  overnightFlattenProfitFloorPct:0.5,
  scoreScale:'0-100-canonical'
};

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,p){const raw=JSON.stringify(p);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingInput(input){return arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')})}
function mv(p){const inv=Math.max(0,num(p?.invested)),ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);return inv>0&&ep>0&&lp>0&&ef>0&&lf>0?inv*(lp*lf)/(ep*ef):inv}
function pnlPct(p){const ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);return ep>0&&lp>0&&ef>0&&lf>0?(lp*lf/(ep*ef)-1)*100:0}
function ageMin(p,now=Date.now()){const t=Date.parse(p?.opened_at||p?.openedAt||'');return Number.isFinite(t)?Math.max(0,(now-t)/60000):999}
function canonicalScore(v){let x=num(v,0);if(x>0&&x<=10)x*=10;return clamp(x,0,100)}
function actionMap(actions){const m=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!m.has(s))m.set(s,i)});return m}
function lastSellFor(history,symbol){return arr(history).filter(x=>key(x)===symbol&&String(x?.action||x?.side||'').toUpperCase()==='SELL').sort((a,b)=>Date.parse(b?.at||b?.timestamp||b?.time||0)-Date.parse(a?.at||a?.timestamp||a?.time||0))[0]||null}

export function enforceExpectancyCoreV310(plan,state={},now=Date.now()){
 if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
 const cfg=EXPECTANCY_CORE_V310,actions=plan.actions.map(a=>({...a})),idx=actionMap(actions),positions=arr(state?.positions),history=arr(state?.history);
 const candidates=new Map(arr(state?.candidates).map(c=>[key(c),c]));
 let hardStops=0,trailingSells=0,pairedRotationSells=0,stagnationSells=0,profitFadeSells=0,minHoldBlocks=0,reentryBlocks=0,sizingUpgrades=0,scoreScaleFixes=0;

 // Position exits: price expectancy is authoritative. Existing hard SELLs stay SELL.
 for(const p of positions){
   const s=key(p); if(!s)continue;
   const i=idx.get(s),old=i===undefined?{symbol:s,name:p?.name,action:'HOLD'}:actions[i];
   const act=String(old?.action||'HOLD').toUpperCase(),pl=pnlPct(p),age=ageMin(p,now),peak=Math.max(pl,num(p?.maxPnlPctSinceEntry,p?.peakPnlPct??pl));
   const hardRisk=/HARD[- ]?EVENT|NEWS-SHOCK|STALE QUOTE|BAD QUOTE|FX[- ]?SAFETY|SUSPEND|HALT|DELIST/i.test(String(old?.reason||''));
   const c={...p,...(candidates.get(s)||{})};
   const scoreValues=[c?.daytradeLiveScore,c?.decisionScore,c?.score,c?.rawDecisionScore,c?.raw_score,c?.rawScore];
   const hasScore=scoreValues.some(v=>Number.isFinite(Number(v)));
   const score=canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.score);
   const rawScore=canonicalScore(c?.rawDecisionScore??c?.raw_score??c?.rawScore??score);
   const momentumValues=[c?.momentum5Pct,c?.momentum5,c?.momentum20Pct,c?.momentum20];
   const hasMomentum=momentumValues.some(v=>Number.isFinite(Number(v)));
   const m5=num(c?.momentum5Pct??c?.momentum5,0),m20=num(c?.momentum20Pct??c?.momentum20,0);
   const flat=Math.abs(pl)<=cfg.stagnationBandPct;
   const weakScore=hasScore&&Math.min(score,rawScore)<=cfg.stagnationScoreCeiling;
   const stagnantEvidence=flat&&weakScore&&hasMomentum&&m5<=0&&m20<=0;
   const pairedRotation=act==='SELL'&&(old?.relativeRotationV304===true||old?.relativeOpportunityExit===true||old?.weakestReplacementV3061===true||Boolean(old?.pairedReplacementSymbol));
   let next=old;
   if(pl<=cfg.hardStopPct){
     next={...old,symbol:s,action:'SELL',expectancyCoreV310:true,hardStopV310:true,reason:`V31.3 HARD-STOP: Netto-Kursentwicklung ${pl.toFixed(2)}% <= ${cfg.hardStopPct.toFixed(2)}%. Verlust wird begrenzt; Score-Hysterese darf den Preis-Stop nicht auf HOLD drehen.`};hardStops++;
   }else if(act==='SELL'&&!hardRisk&&age<cfg.minHoldMinutes&&pl>cfg.hardStopPct){
     next={...old,symbol:s,action:'HOLD',expectancyCoreV310:true,minHoldBlockedV310:true,reason:`V31.3 MIN-HOLD: Position erst ${age.toFixed(1)} Min. alt. Kein normaler Score-/Rausch-Exit vor ${cfg.minHoldMinutes} Min.; Hard-Risk und Preis-Stop bleiben erlaubt.`};minHoldBlocks++;
   }else{
     const runner=peak>=cfg.runnerArmPct,giveback=runner?cfg.runnerGivebackPct:cfg.trailGivebackPct,armed=peak>=cfg.trailArmPct;
     if(armed&&peak-pl>=giveback&&pl>0){
       next={...old,symbol:s,action:'SELL',expectancyCoreV310:true,trailingProfitV310:true,reason:`V31.3 TRAIL: Peak ${peak.toFixed(2)}%, aktuell ${pl.toFixed(2)}%, Ruecklauf ${(peak-pl).toFixed(2)}% >= ${giveback.toFixed(2)}%. Aufgebauter Gewinn wird nach echtem Ruecklauf gesichert.`};trailingSells++;
     }else if(pairedRotation){
       next={...old,symbol:s,action:'SELL',expectancyCoreV310:true,capitalVelocityV313:true,pairedRotationApprovedV313:true,reason:`${String(old?.reason||'ROTATION').slice(0,500)} · V31.3 CAPITAL-VELOCITY: Die bereits score- und momentumgepruefte Paarrotation bleibt SELL; die aeussere Expectancy-Schicht dreht sie nicht mehr auf HOLD.`};pairedRotationSells++;
     }else if(age>=cfg.maxStagnationMinutes&&stagnantEvidence){
       next={...old,symbol:s,action:'SELL',allocation_pct:0,expectancyCoreV310:true,capitalVelocityV313:true,stagnationExitV313:true,reason:`V31.3 STAGNATION-EXIT: ${s} ist seit ${age.toFixed(0)} Min. gebunden, P/L ${pl.toFixed(2)}%, Score ${score.toFixed(1)}/Raw ${rawScore.toFixed(1)}, Momentum 5m ${m5.toFixed(2)}% und 20m ${m20.toFixed(2)}%. Nach ${cfg.maxStagnationMinutes} Min. ohne Fortschritt wird Kapital freigegeben.`};stagnationSells++;
     }else if(act==='SELL'&&age>=cfg.stagnationReviewMinutes&&stagnantEvidence){
       next={...old,symbol:s,action:'SELL',expectancyCoreV310:true,capitalVelocityV313:true,stagnationExitV313:true,reason:`${String(old?.reason||'SELL').slice(0,420)} · V31.3 STAGNATION-REVIEW: ${age.toFixed(0)} Min., P/L ${pl.toFixed(2)}%, Score ${score.toFixed(1)}/Raw ${rawScore.toFixed(1)}, Momentum nicht positiv. Der begruendete Exit wird nicht laenger blockiert.`};stagnationSells++;
     }else if(act==='SELL'&&age>=cfg.profitFadeReviewMinutes&&pl>=cfg.profitFadeMinPct&&pl<cfg.trailArmPct&&hasMomentum&&m5<=0&&m20<=0&&peak-pl>=cfg.profitFadeGivebackPct){
       next={...old,symbol:s,action:'SELL',expectancyCoreV310:true,capitalVelocityV313:true,profitFadeExitV313:true,reason:`${String(old?.reason||'SELL').slice(0,420)} · V31.3 PROFIT-FADE: Nach ${age.toFixed(0)} Min. bleiben ${pl.toFixed(2)}% Gewinn, Peak ${peak.toFixed(2)}%, Momentum 5m/20m nicht positiv. Nutzbarer Gewinn darf vor dem grossen Trail gesichert werden.`};profitFadeSells++;
     }else if(act==='SELL'&&!hardRisk&&pl>cfg.hardStopPct&&(!armed||peak-pl<giveback)){
       next={...old,symbol:s,action:'HOLD',expectancyCoreV310:true,earlyProfitExitBlockedV310:true,reason:`V31.3 EXPECTANCY: Kein unbegruendetes Frueh-Sell. Aktuell ${pl.toFixed(2)}%, Peak ${peak.toFixed(2)}%; Rotation, Stagnation und Profit-Fade werden separat zugelassen, der Haupt-Trail startet ab ${cfg.trailArmPct.toFixed(1)}%.`};
     }
   }
   if(i===undefined){idx.set(s,actions.length);actions.push(next)}else actions[i]=next;
 }

 // Re-entry discipline and minimum economically useful ticket size.
 const cash=Math.max(0,num(state?.cash,state?.config?.cash)),equity=Math.max(cash+positions.reduce((z,p)=>z+mv(p),0),cash);
 for(let i=0;i<actions.length;i++){
   const a=actions[i]; if(String(a?.action||'').toUpperCase()!=='BUY')continue;
   const s=key(a),c=candidates.get(s)||{},score=canonicalScore(c?.daytradeLiveScore??c?.decisionScore??c?.score??a?.score);
   if(num(c?.score,0)>0&&num(c?.score,0)<=10)scoreScaleFixes++;
   const sell=lastSellFor(history,s); if(sell){const t=Date.parse(sell?.at||sell?.timestamp||sell?.time||'');if(Number.isFinite(t)){const mins=(now-t)/60000,lastScore=canonicalScore(sell?.score??sell?.decisionScore??sell?.entryDecisionScore),improve=score-lastScore;if(mins<cfg.reentryMinutes&&improve<cfg.reentryScoreImprovement){actions[i]={...a,action:'HOLD',allocation_pct:0,expectancyCoreV310:true,reentryBlockedV310:true,reason:`V31.3 RE-ENTRY: letzter SELL vor ${mins.toFixed(1)} Min.; neuer Scorevorsprung ${improve.toFixed(1)} < ${cfg.reentryScoreImprovement}. Kein kostenintensives SELL->BUY-Churn.`};reentryBlocks++;continue}}}
   const pct=clamp(num(a?.allocation_pct),0,100),eur=cash*pct/100;
   if(cash>cfg.minPositionEur&&eur>0&&eur<cfg.minPositionEur){const minPct=clamp(100*cfg.minPositionEur/cash,0,100);actions[i]={...a,allocation_pct:+Math.max(pct,minPct).toFixed(2),expectancyCoreV310:true,minEconomicTicketV310:true,reason:`${String(a?.reason||'BUY').slice(0,450)} · V31.3 SIZE: Position auf mindestens ca. ${cfg.minPositionEur.toFixed(0)} EUR angehoben, damit Fixkosten/Slippage nicht einen zu grossen Anteil der Zielbewegung fressen.`};sizingUpgrades++}
 }

 plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,150)} · V31.3 Capital-Velocity: ${hardStops} Hard-Stop · ${trailingSells} Trail · ${pairedRotationSells} Rotation · ${stagnationSells} Stagnation · ${profitFadeSells} Profit-Fade · ${minHoldBlocks} Frueh-Sells blockiert · ${reentryBlocks} Re-Entries blockiert.`;
 return{plan,counters:{hardStops,trailingSells,pairedRotationSells,stagnationSells,profitFadeSells,minHoldBlocks,reentryBlocks,sizingUpgrades,scoreScaleFixes,equity:+equity.toFixed(2)}};
}

export class ExpectancyCoreV310{
 constructor(inner,{getState}={}){this.inner=inner;this.getState=getState;this.latest=null}
 async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingInput(payload))return r;const p=parsePlan(r);if(!p)return r;const state=typeof this.getState==='function'?(this.getState()||{}):{};const out=enforceExpectancyCoreV310(p,state);this.latest=out;return encode(r,out.plan)}
 status(){return{enabled:true,...EXPECTANCY_CORE_V310,mode:'expectancy-capital-velocity-authority',latest:this.latest?.counters||null,rule:'V31.3 verbindet Preisrisiko mit Kapitalgeschwindigkeit: -1.2%-Hard-Stop, 8-Minuten-Mindesthaltezeit, freigegebene qualifizierte Paarrotationen, Stagnationspruefung ab 75 Minuten, spaetestens nach 180 Minuten Exit bei flachem Kurs plus schwachem Score und nicht positivem Momentum, Profit-Fade ab +0.8%/90 Minuten sowie 45-Minuten-Reentry-Hysterese. Gewinner duerfen ueber den Haupt-Trail weiterlaufen.'}}
}
