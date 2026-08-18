// Produktions-Failsafe gegen historische FULL-CASH-Schichten.
// Aeltere Portfolio-Versionen bleiben als Migrations-/Kompatibilitaetscode im Repo,
// duerfen in V11+ aber keinen unbestaetigten Kauf und keine 100%-Zwangsposition mehr erzeugen.

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const arr=v=>Array.isArray(v)?v:[];
const responseText=r=>String(r?.response||r?.result?.response||'');

function parsePlan(r){
  const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a<0||b<=a)return null;
  try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}
}

function neutralize(r){
  const j=parsePlan(r);if(!j)return r;
  let blocked=0,capped=0;
  j.actions=arr(j.actions).map(a=>{
    if(String(a?.action||'').toUpperCase()!=='BUY')return a;
    const reason=String(a?.reason||'');
    if(/(?:OUTER-)?FULL-CASH-BEST(?:-AVAILABLE)?/i.test(reason)){
      blocked++;
      return{...a,action:'HOLD',allocation_pct:0,confidence:Math.min(num(a.confidence,.5),.55),reason:`LEGACY-CASH-BLOCK: historischer Zwangskauf entfernt · ${reason.slice(0,230)}`};
    }
    if(/(?:OUTER-)?FULL-CASH/i.test(reason)&&num(a.allocation_pct)>35){
      capped++;
      return{...a,allocation_pct:35,reason:`${reason.slice(0,280)} · LEGACY-CASH-CAP: Altlogik auf 35% begrenzt; Profit-Optimizer entscheidet final`};
    }
    return a;
  });
  if(blocked||capped)j.summary=`${String(j.summary||'KI-Plan').slice(0,260)} · Legacy-Cash-Failsafe: ${blocked} Zwangskauf/-käufe blockiert, ${capped} Alt-Allokation(en) gekappt.`;
  return{...r,response:JSON.stringify(j)};
}

export class LegacyCashNeutralizerAiGuard{
  constructor(base){this.base=base;this.__legacyCashNeutralizer=true}
  async run(model,input){return neutralize(await this.base.run(model,input))}
}

export function neutralizeLegacyCashResponse(r){return neutralize(r)}
