const arr=v=>Array.isArray(v)?v:[];
const text=r=>String(r?.response||r?.result?.response||'');
const isPlanInput=input=>arr(input?.messages).some(m=>{const s=String(m?.content||'');return s.includes('Kandidaten=')&&s.includes('JSON-only')});

function fullPlan(raw){
 const a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;
 try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}
}
function summaryFrom(raw){
 const m=String(raw).match(/"summary"\s*:\s*"((?:\\.|[^"\\])*)/);
 if(!m)return null;
 try{return JSON.parse(`"${m[1].replace(/"$/,'')}"`).slice(0,180)}catch{return String(m[1]||'').replace(/\\n/g,' ').replace(/\\"/g,'"').slice(0,180)||null}
}
function completeObjectsFromActions(raw){
 const s=String(raw),m=/"actions"\s*:\s*\[/i.exec(s);if(!m)return[];const start=m.index+m[0].length,out=[];let depth=0,objStart=-1,inString=false,esc=false;
 for(let i=start;i<s.length;i++){
  const ch=s[i];
  if(inString){if(esc){esc=false;continue}if(ch==='\\'){esc=true;continue}if(ch==='"')inString=false;continue}
  if(ch==='"'){inString=true;continue}
  if(ch==='{'){if(depth===0)objStart=i;depth++;continue}
  if(ch==='}'&&depth>0){depth--;if(depth===0&&objStart>=0){const rawObj=s.slice(objStart,i+1);try{const x=JSON.parse(rawObj),action=String(x?.action||'').toUpperCase(),symbol=String(x?.symbol||'').toUpperCase().trim();if(symbol&&['BUY','SELL','HOLD'].includes(action))out.push({...x,symbol,action,reason:String(x?.reason||'').slice(0,220)})}catch{}objStart=-1}continue}
  if(ch===']'&&depth===0)break;
 }
 return out.slice(0,8)
}
function encodeLike(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw},response:raw};if(r&&typeof r==='object')return{...r,response:raw};return{response:raw}}

export function repairAiPlanResponse(r,input){
 if(!isPlanInput(input))return r;
 const raw=text(r),valid=fullPlan(raw);if(valid)return r;
 const actions=completeObjectsFromActions(raw),oldSummary=summaryFrom(raw),summary=actions.length?`AI-JSON V27.7 repariert: ${actions.length} vollständig lesbare Aktion(en) gerettet${oldSummary?` · ${oldSummary}`:''}`:'AI-JSON V27.7 repariert: Modellantwort war unvollständig; keine unvollständige Aktion übernommen. Finale deterministische Prüfung entscheidet sicher weiter.';
 return encodeLike(r,{summary,actions});
}

export const AI_PLAN_JSON_REPAIR_POLICY={enabled:true,version:27.7,maxSalvagedActions:8,partialObjectsNeverUsed:true,finalControllerStillRequired:true,rule:'Nur vollständig parsebare Action-Objekte werden aus einer abgeschnittenen Modellantwort gerettet. Unvollständige Objekte werden verworfen; anschließend läuft der normale FinalDecisionController mit allen Safety-Gates.'};
