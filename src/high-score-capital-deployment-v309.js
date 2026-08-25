const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const brokerExact=c=>c?.brokerVerified===true&&String(c?.assetClass||c?.type||'EQUITY').toUpperCase()==='EQUITY'&&String(c?.brokerMatchMode||'').toUpperCase()==='EXACT_NORMALIZED_NAME'&&/Trade Republic/i.test(String(c?.brokerVerificationSource||''))&&/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(c?.isin||''));
const HARD=/HARD[- ]?EVENT|NEWS-SHOCK|STALE QUOTE|BAD QUOTE|FX[- ]?SAFETY|REENTRY|SUSPEND|HALT|DELIST|MARKET CLOSED|TRADE-REPUBLIC-BLOCK|TARGET-VENUE/i;

export const HIGH_SCORE_CAPITAL_DEPLOYMENT_V309={
  version:30.9,
  patch:'30.9.1-quality-default-fix',
  minScore:68,
  convictionScore:70,
  strongScore:75,
  veryStrongScore:80,
  exceptionalScore:85,
  mildPullback5mFloor:-0.40,
  mildPullback20mFloor:-0.60,
  maxAutoAllocationPct:75,
  maxOpenPositions:4
};

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,p){const raw=JSON.stringify(p);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingInput(input){return arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')})}
function promptCandidates(input){for(const m of arr(input?.messages)){const t=String(m?.content||''),a=t.indexOf('Kandidaten='),b=t.indexOf(' Gehalten=',a+11);if(a<0||b<0)continue;try{const x=JSON.parse(t.slice(a+11,b).trim());if(Array.isArray(x))return x}catch{}}return[]}
function mergeCandidates(stateRows,promptRows){const m=new Map();for(const c of arr(stateRows)){const s=key(c);if(s)m.set(s,{...c})}for(const c of arr(promptRows)){const s=key(c);if(s)m.set(s,{...(m.get(s)||{}),...c})}return[...m.values()]}
function enrich(rows,brokerRows){const master=new Map(arr(brokerRows).map(r=>[key(r),r]));return arr(rows).map(c=>{const r=master.get(key(c));return r?{...c,isin:r.isin||null,assetClass:String(r.assetClass||'EQUITY').toUpperCase(),brokerVerified:r.brokerVerified===true,brokerVerificationSource:r.brokerVerificationSource||null,brokerMatchMode:r.brokerMatchMode||null,tradeRepublicName:r.tradeRepublicName||null}:c})}
function m5(c){return num(c?.momentum5Pct,num(c?.momentum5,num(c?.intraday5m,0)))}
function m20(c){return num(c?.momentum20Pct,num(c?.momentum20,num(c?.intraday20m,0)))}
function score(c){return num(c?.daytradeLiveScore,num(c?.decisionScore,num(c?.score,0)))}
function hard(action,c){const reason=String(action?.reason||'');if(!HARD.test(reason))return false;if(/TRADE-REPUBLIC-BLOCK|TARGET-VENUE/i.test(reason)&&brokerExact(c))return false;return true}
function allocationFor(c,positionCount){const s=score(c),a=m5(c),b=m20(c);let pct=s>=85?58:s>=80?44:s>=75?32:s>=70?22:12;if(positionCount===0)pct+=6;else if(positionCount===1)pct+=3;if(a>=.35)pct+=5;if(b>=.65)pct+=5;if(a<0||b<0)pct-=3;return +clamp(pct,8,HIGH_SCORE_CAPITAL_DEPLOYMENT_V309.maxAutoAllocationPct).toFixed(1)}
function quality(c){const s=score(c),a=m5(c),b=m20(c),q=num(c?.entryQualityScore,num(c?.timingQualityScore,50)),acc=num(c?.acceleration5Pct,num(c?.momentumAcceleration5,0));return s+clamp(a*2,-2,3)+clamp(b*1.2,-2,3)+clamp(acc*1.2,-1.5,2)+clamp((q-50)/15,-2,2)}

export function enforceHighScoreCapitalDeploymentV309(plan,state={},input=null,brokerRows=[]){
 if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
 const cst=HIGH_SCORE_CAPITAL_DEPLOYMENT_V309,positions=arr(state?.positions),held=new Set(positions.map(key));
 const merged=enrich(mergeCandidates(state?.candidates,promptCandidates(input)),brokerRows),actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
 const rows=merged.filter(c=>!held.has(key(c))&&brokerExact(c)).map(c=>{const i=idx.get(key(c)),a=i===undefined?{}:actions[i];return{c,s:key(c),a,i,score:score(c),m5:m5(c),m20:m20(c),q:quality(c),hard:hard(a,c)}}).filter(x=>Number.isFinite(x.q)).sort((a,b)=>b.q-a.q);
 const strong=rows.filter(x=>x.score>=70),blockedHard=strong.filter(x=>x.hard).length,blockedMomentum=strong.filter(x=>!x.hard&&(x.m5<cst.mildPullback5mFloor||x.m20<cst.mildPullback20mFloor)).length;
 let injected=0,upgraded=0;let chosen=null;
 if(positions.length<cst.maxOpenPositions){
   chosen=rows.find(x=>x.score>=cst.minScore&&!x.hard&&x.m5>=cst.mildPullback5mFloor&&x.m20>=cst.mildPullback20mFloor)||null;
   if(chosen){
     const act=String(chosen.a?.action||'HOLD').toUpperCase();
     if(act!=='BUY'){
       const pct=allocationFor(chosen.c,positions.length),buy={...chosen.a,symbol:chosen.s,name:chosen.c?.name,action:'BUY',allocation_pct:pct,confidence:clamp(.72+(chosen.score-68)*.012,.72,.93),highScoreCapitalDeploymentV309:true,reason:`V30.9 CAPITAL-DEPLOYMENT: ${chosen.s} ${chosen.score.toFixed(1)}/100 ist exakt Trade-Republic-verifiziert. Ein milder Pullback ist kein pauschaler Kaufblock mehr (5m ${chosen.m5>=0?'+':''}${chosen.m5.toFixed(2)}%, 20m ${chosen.m20>=0?'+':''}${chosen.m20.toFixed(2)}%). ${pct.toFixed(1)}% dynamische Startgroesse, weil freies Kapital bei einer hochwertigen Chance produktiv eingesetzt werden soll. Harte News-, Quote-, FX-, Markt- und Re-Entry-Sperren bleiben unangetastet.`};
       if(chosen.i===undefined){idx.set(chosen.s,actions.length);actions.push(buy)}else actions[chosen.i]=buy;injected++;
     }else if(num(chosen.a?.allocation_pct)<12&&chosen.score>=70){const pct=allocationFor(chosen.c,positions.length);actions[chosen.i]={...chosen.a,allocation_pct:Math.max(num(chosen.a?.allocation_pct),pct),highScoreCapitalDeploymentV309:true,reason:`${String(chosen.a?.reason||'BUY').slice(0,500)} · V30.9: starke ${chosen.score.toFixed(1)}/100-Chance wird nicht nur mit Mini-Starter gefahren; dynamisch auf ${pct.toFixed(1)}% angehoben.`};upgraded++}
   }
 }
 plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,118)} · V30.9 Capital: ${injected} High-Score BUY · ${upgraded} Starter vergroessert · ${blockedMomentum} 70+ wegen echtem Momentumbruch blockiert · ${blockedHard} 70+ hart blockiert.`;
 return{plan,counters:{exactCandidates:rows.length,strong70Plus:strong.length,injected,upgraded,blockedMomentum,blockedHard,chosen:chosen?{symbol:chosen.s,score:+chosen.score.toFixed(1),m5:+chosen.m5.toFixed(2),m20:+chosen.m20.toFixed(2)}:null}};
}

export class HighScoreCapitalDeploymentV309{
 constructor(inner,{getState,getBrokerRows}={}){this.inner=inner;this.getState=getState;this.getBrokerRows=getBrokerRows;this.latest=null;this.brokerResolveCount=0}
 async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingInput(payload))return r;const p=parsePlan(r);if(!p)return r;const state=typeof this.getState==='function'?(this.getState()||{}):{};let rows=[];if(typeof this.getBrokerRows==='function'){try{rows=await this.getBrokerRows();if(arr(rows).length)this.brokerResolveCount++}catch{}}const out=enforceHighScoreCapitalDeploymentV309(p,state,payload,rows);this.latest=out;return encode(r,out.plan)}
 status(){return{enabled:true,...HIGH_SCORE_CAPITAL_DEPLOYMENT_V309,mode:'high-score-capital-deployment',mildPullbackCanBuy:true,hardSafetyNeverOverridden:true,noMiniStarterFor70Plus:true,brokerResolveCount:this.brokerResolveCount,latest:this.latest?.counters||null,rule:'Leeres/unterinvestiertes Depot darf hochwertige exakt Trade-Republic-verifizierte Chancen nicht wegen eines kleinen Pullbacks oder eines 6-10%-Mini-Starters wirkungslos lassen. 70+ wird dynamisch groesser eingesetzt; echte Abwaertsdynamik und harte Safety bleiben blockierend.'}}
}
