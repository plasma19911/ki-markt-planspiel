const arr=v=>Array.isArray(v)?v:[];
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

export const SCORE_EXIT_AUTHORITY_V295={
  version:29.5,
  positiveExitDelta:10,
  negativeExitDelta:-15,
  onlyNormalSellRule:true,
  allowedReasonPrefix:'V29.4 SCORE-EXIT:'
};

function parsePlan(r){
  const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a<0||b<=a)return null;
  try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}
}
function encode(r,plan){
  const raw=JSON.stringify(plan);
  if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};
  if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};
  return{response:raw};
}
function isTradingPlanInput(input){
  return Boolean(input&&typeof input==='object'&&arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')}));
}

export function enforceScoreExitAuthorityV295(plan,state={}){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{legacySellsSuppressed:0,scoreSellsAllowed:0}};
  const held=new Set(arr(state?.positions).map(key).filter(Boolean));
  const actions=plan.actions.map(a=>({...a}));
  const counters={legacySellsSuppressed:0,scoreSellsAllowed:0};

  for(let i=0;i<actions.length;i++){
    const a=actions[i],s=key(a);if(!s||!held.has(s)||String(a?.action||'').toUpperCase()!=='SELL')continue;
    const reason=String(a?.reason||'');
    if(reason.startsWith(SCORE_EXIT_AUTHORITY_V295.allowedReasonPrefix)){
      counters.scoreSellsAllowed++;continue;
    }
    actions[i]={...a,action:'HOLD',allocation_pct:0,reason:`V29.5 HOLD: ${s} alter SELL unterdrückt. Für normale Depotpositionen gilt ausschließlich: +10 DecisionScore-Punkte seit Kauf = SELL oder -15 Punkte seit Kauf = SELL. Vorherige SELL-Begründung: ${reason.slice(0,180)}`};
    counters.legacySellsSuppressed++;
  }

  plan.actions=actions;
  plan.summary=`${String(plan.summary||'').slice(0,150)} · V29.5 Exit-Autorität: ${counters.scoreSellsAllowed} +10/-15 SELL erlaubt · ${counters.legacySellsSuppressed} alter SELL blockiert.`;
  return{plan,counters};
}

export class ScoreExitAuthorityGuardV295{
  constructor(inner,{getState}={}){this.inner=inner;this.getState=getState;this.latest=null}
  async run(model,input){
    const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,state=typeof this.getState==='function'?(this.getState()||{}):{};
    const r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);
    if(!isTradingPlanInput(payload))return r;
    const p=parsePlan(r);if(!p)return r;
    const out=enforceScoreExitAuthorityV295(p,state);this.latest=out;return encode(r,out.plan);
  }
  status(){return{enabled:true,version:29.5,authoritative:true,onlyNormalSellRule:true,positiveExitDelta:10,negativeExitDelta:-15,latest:this.latest?.counters||null,rule:'Normale Depotpositionen dürfen nur verkauft werden, wenn der chart-verankerte DecisionScore seit Kauf mindestens +10 oder -15 Punkte erreicht. Alle älteren Profit-/Trend-/Positions-SELLs werden außen überschrieben.'}}
}
