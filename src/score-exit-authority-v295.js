const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

export const SCORE_EXIT_AUTHORITY_V295={
  version:29.5,
  positiveExitDelta:10,
  negativeExitDelta:-15,
  onlyNormalSellRule:true,
  structuredAuthorization:true
};

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingPlanInput(input){return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}))}
function validScoreExit(a={}){
  if(a?.scoreExitV294!==true)return false;const kind=String(a?.scoreExitKind||''),delta=num(a?.scoreExitDelta,NaN),chart=num(a?.scoreExitChartMovePct,0);
  if(kind==='PLUS_10')return finite(delta)&&delta>=SCORE_EXIT_AUTHORITY_V295.positiveExitDelta&&chart>0;
  if(kind==='MINUS_15')return finite(delta)&&delta<=SCORE_EXIT_AUTHORITY_V295.negativeExitDelta;
  return false;
}

export function enforceScoreExitAuthorityV295(plan,state={}){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{legacySellsSuppressed:0,scoreSellsAllowed:0,invalidScoreSellsSuppressed:0}};
  const held=new Set(arr(state?.positions).map(key).filter(Boolean)),actions=plan.actions.map(a=>({...a})),counters={legacySellsSuppressed:0,scoreSellsAllowed:0,invalidScoreSellsSuppressed:0};
  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a);if(!s||!held.has(s)||String(a?.action||'').toUpperCase()!=='SELL')continue;
    if(validScoreExit(a)){counters.scoreSellsAllowed++;continue}
    const lookedLikeScoreExit=a?.scoreExitV294===true||String(a?.reason||'').startsWith('V29.4 SCORE-EXIT:');
    actions[i]={...a,action:'HOLD',allocation_pct:0,scoreExitV294:false,reason:`V29.5 HOLD: ${s} SELL nicht durch strukturierte +10/-15 Score-Regel autorisiert. ${lookedLikeScoreExit?'Score-Exit-Daten waren unvollständig/ungültig.':'Ältere Profit-/Trend-/Rotation-/Positionsregel wurde überschrieben.'}`};
    if(lookedLikeScoreExit)counters.invalidScoreSellsSuppressed++;else counters.legacySellsSuppressed++;
  }
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,145)} · V29.5 Exit-Autorität: ${counters.scoreSellsAllowed} strukturierte Score-SELL · ${counters.legacySellsSuppressed+counters.invalidScoreSellsSuppressed} andere SELL blockiert.`;return{plan,counters};
}

export class ScoreExitAuthorityGuardV295{
  constructor(inner,{getState}={}){this.inner=inner;this.getState=getState;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{},r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingPlanInput(payload))return r;const p=parsePlan(r);if(!p)return r;const out=enforceScoreExitAuthorityV295(p,state);this.latest=out;return encode(r,out.plan)}
  status(){return{enabled:true,version:29.5,authoritative:true,onlyNormalSellRule:true,structuredAuthorization:true,positiveExitDelta:10,negativeExitDelta:-15,latest:this.latest?.counters||null,rule:'Normale Depotpositionen dürfen nur per strukturiertem V29.4 Score-Exit verkauft werden: +10 bei positivem Chart seit Kauf oder -15 Punkte. Textbegründungen allein autorisieren keinen SELL mehr.'}}
}
