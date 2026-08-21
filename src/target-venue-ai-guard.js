// Zielbroker-Sanity fuer Trade Republic.
// Analyse darf breit bleiben; Paper-BUYs bleiben aber auf Aktien beschraenkt,
// die aus dem Trade-Republic-gefilterten Master stammen. Explizit unbestaetigte
// oder OTC/Venture-artige Kandidaten werden fail-closed auf HOLD gesetzt.

const arr=v=>Array.isArray(v)?v:[];
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');
const BLOCKED_SUFFIX=/\.(?:V|CN|NE|PK|OB)$/i;
const BLOCKED_VENUE=/(?:TSX\s*VENTURE|TSXV|CANADIAN\s+SECURITIES|CSE|OTC|PINK|GREY)/i;
const hasOwn=(o,k)=>Boolean(o&&Object.prototype.hasOwnProperty.call(o,k));

function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(let i=0;i<arr(input?.messages).length;i++){const t=String(input.messages[i]?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return{i,text:t}}return null}

export function targetVenueIssue(c={}){
  const symbol=key(c),venue=[c?.exchange,c?.exchangeName,c?.venue,c?.market,c?.fullExchangeName].filter(Boolean).join(' ');
  if(hasOwn(c,'brokerVerified')&&c.brokerVerified!==true)return`Aktie ${symbol||'?'} ist nicht als Trade-Republic-handelbar bestaetigt`;
  if(hasOwn(c,'assetClass')&&String(c.assetClass).toUpperCase()!=='EQUITY')return`Instrument ${symbol||'?'} ist keine normale Aktie`;
  if(BLOCKED_SUFFIX.test(symbol))return`Primärsymbol ${symbol} ist Venture/OTC-artig und nicht als Trade-Republic-Aktie bestaetigt`;
  if(BLOCKED_VENUE.test(venue))return`Börsenplatz ${venue} ist fuer das Trade-Republic-Zieldepot nicht verifiziert`;
  return null;
}

function enrichInput(input){
  const hit=findPlanMessage(input);if(!hit)return input;
  const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return input;
  const enriched=candidates.map(c=>{const issue=targetVenueIssue(c);return issue?{...c,targetVenueVerified:false,targetVenueIssue:issue}:{...c,targetVenueVerified:true,targetBroker:'Trade Republic'}});
  const a=hit.text.indexOf('Kandidaten='),b=hit.text.indexOf(' Gehalten=',a),prefix=hit.text.slice(0,a),suffix=hit.text.slice(b),messages=input.messages.slice();
  const policy='TARGET-BROKER-SANITY: Zieldepot ist Trade Republic und es werden ausschließlich normale Aktien gehandelt. Der Aktien-Master wird gegen das offizielle Trade-Republic Trading Universe geschnitten. Explizit unbestätigte, ETF-/Derivate-/Krypto- oder OTC/Venture-artige Instrumente dürfen nicht automatisch gekauft werden. ';
  messages[hit.i]={...messages[hit.i],content:`${prefix}${policy}Kandidaten=${JSON.stringify(enriched)}${suffix}`};return{...input,messages};
}

function postProcess(r,input){
  const plan=parsePlan(r),hit=findPlanMessage(input);if(!plan||!hit)return r;
  const candidates=parseBlock(hit.text,'Kandidaten=',' Gehalten=');if(!Array.isArray(candidates))return r;const map=new Map(candidates.map(c=>[key(c),c]));let blocked=0;
  plan.actions=arr(plan.actions).map(a=>{if(String(a?.action||'').toUpperCase()!=='BUY')return a;const c=map.get(key(a)),issue=targetVenueIssue(c||a);if(!issue)return a;blocked++;return{symbol:key(a),action:'HOLD',confidence:Math.min(.8,Number(a?.confidence)||.55),allocation_pct:0,reason:`TRADE-REPUBLIC-BLOCK: ${issue}. Kein Paper-BUY ohne Brokerbestaetigung.`}});
  plan.summary=`${String(plan.summary||'').slice(0,220)} · TRADE-REPUBLIC: ${blocked} nicht brokerbestaetigte BUY(s) blockiert.`;
  return{...r,response:JSON.stringify(plan)};
}

export class TargetVenueAiGuard{
  constructor(base){this.base=base}
  async run(model,input){const joined=String(arr(input?.messages).map(x=>x?.content||'').join('\n')),isPlan=joined.includes('Kandidaten=')&&joined.includes('JSON-only');if(!isPlan)return this.base.run(model,input);const next=enrichInput(input),r=await this.base.run(model,next);return postProcess(r,next)}
}
