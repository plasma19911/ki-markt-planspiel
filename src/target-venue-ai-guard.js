// Zielbroker-Sanity fuer finanzen.net ZERO / gettex.
// Analyse darf breit bleiben; automatische Paper-BUYs werden aber fuer eindeutige
// Venture-/OTC-Primärsymbole blockiert, solange keine explizite gettex-Zuordnung vorliegt.

const arr=v=>Array.isArray(v)?v:[];
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');
const BLOCKED_SUFFIX=/\.(?:V|CN|NE|PK|OB)$/i;
const BLOCKED_VENUE=/(?:TSX\s*VENTURE|TSXV|CANADIAN\s+SECURITIES|CSE|OTC|PINK|GREY)/i;

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(let i=0;i<arr(input?.messages).length;i++){const t=String(input.messages[i]?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return{i,text:t}}return null}

export function targetVenueIssue(c={}){
  const symbol=key(c),venue=[c?.exchange,c?.exchangeName,c?.venue,c?.market,c?.fullExchangeName].filter(Boolean).join(' ');
  if(BLOCKED_SUFFIX.test(symbol))return`Primärsymbol ${symbol} ist Venture/OTC-artig und nicht explizit auf gettex aufgelöst`;
  if(BLOCKED_VENUE.test(venue))return`Börsenplatz ${venue} ist nicht als gettex-Ausführung verifiziert`;
  return null;
}

function enrichInput(input){
  const hit=findPlanMessage(input);if(!hit)return input;
  const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return input;
  const enriched=candidates.map(c=>{const issue=targetVenueIssue(c);return issue?{...c,targetVenueVerified:false,targetVenueIssue:issue}:{...c,targetVenueVerified:true}});
  const a=hit.text.indexOf('Kandidaten='),b=hit.text.indexOf(' Gehalten=',a),prefix=hit.text.slice(0,a),suffix=hit.text.slice(b),messages=input.messages.slice();
  const policy='TARGET-VENUE-SANITY: Ziel ist finanzen.net ZERO/gettex. Eindeutige Venture-/OTC-Primärsymbole oder nicht verifizierte exotische Börsenplätze dürfen analysiert, aber nicht automatisch gekauft werden, solange keine explizite gettex-Zuordnung existiert. ';
  messages[hit.i]={...messages[hit.i],content:`${prefix}${policy}Kandidaten=${JSON.stringify(enriched)}${suffix}`};return{...input,messages};
}

function postProcess(r,input){
  const plan=parsePlan(r),hit=findPlanMessage(input);if(!plan||!hit)return r;
  const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return r;const map=new Map(candidates.map(c=>[key(c),c]));let blocked=0;
  plan.actions=arr(plan.actions).map(a=>{if(String(a?.action||'').toUpperCase()!=='BUY')return a;const c=map.get(key(a)),issue=targetVenueIssue(c||a);if(!issue)return a;blocked++;return{symbol:key(a),action:'HOLD',confidence:Math.min(.8,Number(a?.confidence)||.55),allocation_pct:0,reason:`TARGET-VENUE-BLOCK: ${issue}. Erst nach expliziter gettex-Zuordnung handelbar.`}});
  plan.summary=`${String(plan.summary||'').slice(0,220)} · TARGET-VENUE: ${blocked} nicht sauber auf gettex aufgeloeste BUY(s) blockiert.`;
  return{...r,response:JSON.stringify(plan)};
}

export class TargetVenueAiGuard{
  constructor(base){this.base=base}
  async run(model,input){const joined=String(arr(input?.messages).map(x=>x?.content||'').join('\n')),isPlan=joined.includes('Kandidaten=')&&joined.includes('JSON-only');if(!isPlan)return this.base.run(model,input);const next=enrichInput(input),r=await this.base.run(model,next);return postProcess(r,next)}
}
