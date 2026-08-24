import {daytradeLiveScoresV302} from './daytrade-live-feedback-v302.js';

const KEY='state/relative-rotation-v304';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const read=(storage,k,d)=>{try{return storage?.kv?.get(k)||d}catch{return d}};
const write=(storage,k,v)=>{try{storage?.kv?.put(k,v)}catch{}};

export const RELATIVE_ROTATION_V304={
  version:30.4,
  maxOpenPositions:4,
  rotateMinCandidateScore:64,
  rotateMinScoreGap:8,
  fastRotateScoreGap:12,
  minHoldMinutes:15,
  rotationCooldownMinutes:20,
  legacyMigrationMinCandidateScore:60,
  legacyMigrationMinScoreGap:4,
  legacyMigrationMinHoldMinutes:5,
  legacyMigrationCooldownMinutes:5,
  targetDeploymentPctWhenFourBuys:98,
  maxSinglePositionPct:25
};

function promptCandidates(input){
  for(const m of arr(input?.messages)){
    const t=String(m?.content||''),a=t.indexOf('Kandidaten='),b=t.indexOf(' Gehalten=',a+11);if(a<0||b<0)continue;
    try{const rows=JSON.parse(t.slice(a+11,b).trim());if(Array.isArray(rows))return rows}catch{}
  }
  return[];
}
function brokerExact(c={}){
  const src=String(c?.brokerVerificationSource||''),mode=String(c?.brokerMatchMode||'').toUpperCase(),isin=String(c?.isin||'').trim();
  return c?.brokerVerified===true&&String(c?.assetClass||c?.type||c?.instrument_type||'EQUITY').toUpperCase()==='EQUITY'&&/Trade Republic/i.test(src)&&mode==='EXACT_NORMALIZED_NAME'&&/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin);
}
function hardBlockedAction(a={}){return /TRADE-REPUBLIC-BLOCK|TARGET-VENUE|HARD[- ]?EVENT|NEWS-SHOCK|STALE QUOTE|BAD QUOTE|FX[- ]?SAFETY|REENTRY|HIGH_CHASE/i.test(String(a?.reason||''))}
function openedMinutes(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at??p?.openedAt??''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):9999}
function pnlPct(p={}){const ep=num(p?.entry_price,p?.entryPrice),lp=num(p?.last_price,p?.lastPrice,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);return ep>0&&lp>0&&ef>0&&lf>0?(lp*lf/(ep*ef)-1)*100:0}
function momentum(c={}){return{m5:num(c?.momentum5Pct,c?.momentum5??c?.intraday5m),m20:num(c?.momentum20Pct,c?.momentum20??c?.intraday20m),acc:num(c?.acceleration5Pct,c?.momentumAcceleration5??c?.momentum_acceleration5)}}
function weakEnough(p,c,score,bestScore){const m=momentum(c),pl=pnlPct(p),delta=num(p?.scoreDeltaFromEntry,p?.score_delta_from_entry,0);if(pl>1.5&&m.m20>.15&&m.m5>=0)return false;return bestScore-score>=RELATIVE_ROTATION_V304.rotateMinScoreGap&&(m.m20<=.15||m.m5<0||m.acc<0||pl<=.4||delta<=-6)}
function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isPlan(input){return arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')})}

export function enforceRelativeRotationV304(plan,state={},storage=null,input=null,now=Date.now()){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
  const scored=daytradeLiveScoresV302(state,storage,now),rankMap=new Map(arr(scored.ranking).map(r=>[key(r),r])),stateCand=new Map(arr(state?.candidates).map(c=>[key(c),c])),promptMap=new Map(promptCandidates(input).map(c=>[key(c),c])),positions=arr(state?.positions),held=new Set(positions.map(key)),actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{if(key(a)&&!idx.has(key(a)))idx.set(key(a),i)});
  const mem={version:30.4,lastRotationAt:0,lastFrom:null,lastTo:null,lastRotationWasLegacy:false,...(read(storage,KEY,{})||{})};
  const actionFor=s=>{const i=idx.get(s);return i===undefined?null:actions[i]};
  const rankedHeld=positions.map(p=>{const s=key(p),r=rankMap.get(s),c=stateCand.get(s)||{},score=num(r?.daytradeLiveScore,p?.decisionScore??p?.score,50),exact=brokerExact({...p,...c});return{p,s,c,score,age:openedMinutes(p,now),legacy:!exact}}).sort((a,b)=>Number(b.legacy)-Number(a.legacy)||a.score-b.score);
  const hasLegacy=rankedHeld.some(h=>h.legacy),candidateMin=hasLegacy?RELATIVE_ROTATION_V304.legacyMigrationMinCandidateScore:RELATIVE_ROTATION_V304.rotateMinCandidateScore;
  const eligible=arr(scored.ranking).filter(r=>!held.has(r.symbol)&&r.daytradeLiveScore>=candidateMin&&!r.hardBlocked).filter(r=>{const p=promptMap.get(r.symbol),a=actionFor(r.symbol);return brokerExact(p)&&!hardBlockedAction(a||{})}).sort((a,b)=>b.daytradeLiveScore-a.daytradeLiveScore);
  const best=eligible[0]||null,counters={rotations:0,legacyMigrations:0,deploymentRescales:0,rotationBlockedCooldown:0,rotationBlockedHoldTime:0};
  if(best&&positions.length>=RELATIVE_ROTATION_V304.maxOpenPositions){
    const legacyWeak=rankedHeld.find(h=>h.legacy&&best.daytradeLiveScore-h.score>=RELATIVE_ROTATION_V304.legacyMigrationMinScoreGap);
    const weak=legacyWeak||rankedHeld.find(h=>!h.legacy&&weakEnough(h.p,h.c,h.score,best.daytradeLiveScore));
    if(weak){
      const gap=best.daytradeLiveScore-weak.score,isLegacy=weak.legacy,cooldownMinutes=isLegacy?RELATIVE_ROTATION_V304.legacyMigrationCooldownMinutes:RELATIVE_ROTATION_V304.rotationCooldownMinutes,minHold=isLegacy?RELATIVE_ROTATION_V304.legacyMigrationMinHoldMinutes:RELATIVE_ROTATION_V304.minHoldMinutes,cool=now-num(mem.lastRotationAt,0)<cooldownMinutes*60000,young=weak.age<minHold&&gap<(isLegacy?RELATIVE_ROTATION_V304.rotateMinScoreGap:RELATIVE_ROTATION_V304.fastRotateScoreGap);
      if(cool)counters.rotationBlockedCooldown++;
      else if(young)counters.rotationBlockedHoldTime++;
      else{
        const wi=idx.get(weak.s),bi=idx.get(best.symbol),prefix=isLegacy?'V30.4 LEGACY-MIGRATION':'V30.4 RELATIVE-ROTATION',sell={...(wi===undefined?{}:actions[wi]),symbol:weak.s,action:'SELL',allocation_pct:0,confidence:isLegacy?.88:.82,relativeRotationV304:true,legacyMigrationV304:isLegacy,reason:`${prefix}: ${weak.s} ${isLegacy?'ist nicht exakt als aktueller Trade-Republic-Titel verifiziert und wird bevorzugt aus dem Altbestand migriert':'ist aktuell das schwaechste Depotglied'} (${weak.score.toFixed(1)}/100). ${best.symbol} ist exakt Trade-Republic-verifiziert und mit ${best.daytradeLiveScore.toFixed(1)}/100 um ${gap.toFixed(1)} Punkte staerker. Kapital rotiert in die bessere aktuelle Chance.`},buy={...(bi===undefined?{}:actions[bi]),symbol:best.symbol,name:promptMap.get(best.symbol)?.name||stateCand.get(best.symbol)?.name,action:'BUY',allocation_pct:25,confidence:clamp(.70+(best.daytradeLiveScore-60)*.008,.70,.92),relativeRotationV304:true,legacyMigrationV304:isLegacy,entryDecisionScore:best.daytradeLiveScore,reason:`V30.4 ${isLegacy?'LEGACY-MIGRATION-BUY':'ROTATION-BUY'}: ${best.symbol} ersetzt ${weak.s}; exakt Trade-Republic-verifiziert, DecisionScore ${best.daytradeLiveScore.toFixed(1)}/100, relativer Vorsprung ${gap.toFixed(1)} Punkte. Zielgewicht bis 25% des Depots.`};
        if(wi===undefined){idx.set(weak.s,actions.length);actions.push(sell)}else actions[wi]=sell;if(bi===undefined){idx.set(best.symbol,actions.length);actions.push(buy)}else actions[bi]=buy;mem.lastRotationAt=now;mem.lastFrom=weak.s;mem.lastTo=best.symbol;mem.lastRotationWasLegacy=isLegacy;counters.rotations++;if(isLegacy)counters.legacyMigrations++;
      }
    }
  }
  const buys=actions.map((a,i)=>({a,i})).filter(x=>String(x.a?.action||'').toUpperCase()==='BUY'&&!hardBlockedAction(x.a));
  if(buys.length===4){
    const target=RELATIVE_ROTATION_V304.targetDeploymentPctWhenFourBuys,current=buys.reduce((s,x)=>s+Math.max(0,num(x.a?.allocation_pct)),0);
    if(current>0&&current<target-.1){let remaining=target;for(let n=0;n<buys.length;n++){const x=buys[n],left=buys.length-n,pct=n===buys.length-1?remaining:Math.min(RELATIVE_ROTATION_V304.maxSinglePositionPct,Math.max(0,remaining/left));actions[x.i]={...x.a,allocation_pct:+pct.toFixed(2),reason:`${String(x.a?.reason||'').slice(0,420)} · V30.4 DEPLOYMENT: vier qualifizierte BUYs nutzen zusammen ${target}% statt unnoetig Cash liegen zu lassen.`};remaining-=pct}counters.deploymentRescales++}
  }
  mem.updatedAt=new Date(now).toISOString();write(storage,KEY,mem);plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,145)} · V30.4 Rotation: ${counters.rotations} Wechsel · ${counters.legacyMigrations} Legacy-Migration · ${counters.deploymentRescales} Vierer-Deployment auf 98%.`;return{plan,counters,best,mem,legacyHeld:rankedHeld.filter(h=>h.legacy).map(h=>h.s)};
}

export class RelativeRotationGuardV304{
  constructor(inner,{getState,storage,now}={}){this.inner=inner;this.getState=getState;this.storage=storage;this.now=now;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isPlan(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceRelativeRotationV304(p,state,this.storage,payload,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}
  status(){return{enabled:true,version:30.4,...RELATIVE_ROTATION_V304,latest:this.latest?.counters||null,legacyHeld:this.latest?.legacyHeld||[],rule:'Maximal vier Positionen. Normale Rotation ab 8 Scorepunkten Vorsprung. Nicht exakt Trade-Republic-verifizierte Altpositionen werden bevorzugt migriert, sobald ein exakt verifizierter Kandidat ab 60/100 mindestens 4 Scorepunkte besser ist. Legacy-Migration darf alle 5 Minuten erfolgen; neue Zielposition maximal 25%.'}}
}
