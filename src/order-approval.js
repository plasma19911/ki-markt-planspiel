const KEY='state/order-approvals-v1';
const TTL_MS=120_000;
const APPROVED_HANDOFF_TTL_MS=45_000;
const RETAIN_MS=7*24*3600_000;
const MAX_ROWS=80;
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;

function read(storage){
  try{const x=storage?.kv?.get(KEY);return x&&typeof x==='object'?x:{rows:[],updatedAt:0}}
  catch{return{rows:[],updatedAt:0}}
}
function write(storage,state){try{storage?.kv?.put(KEY,state)}catch{}}
function parseJsonBetween(text,startMarker,endMarker=null){const start=text.indexOf(startMarker);if(start<0)return[];const from=start+startMarker.length,end=endMarker?text.indexOf(endMarker,from):-1;try{return JSON.parse(text.slice(from,end>=0?end:text.length).trim())}catch{return[]}}
function promptState(prompt){
  const candidates=parseJsonBetween(prompt,'Kandidaten=',' Gehalten='),held=parseJsonBetween(prompt,' Gehalten=');
  const cashMatch=String(prompt).match(/Cash\s+([0-9]+(?:\.[0-9]+)?)\s+([A-Z]{3})/i);
  return{candidates:Array.isArray(candidates)?candidates:[],held:Array.isArray(held)?held:[],cash:num(cashMatch?.[1]),currency:String(cashMatch?.[2]||'EUR').toUpperCase()}
}
function cleanup(state,now=Date.now()){
  state.rows=Array.isArray(state.rows)?state.rows:[];
  for(const r of state.rows){
    if(r.status==='PENDING'&&now>num(r.expiresAt))r.status='EXPIRED';
    if(r.status==='APPROVED_LOCAL'&&now>num(r.dispatchExpiresAt)){r.status='APPROVED_EXPIRED';r.dispatchState='HANDOFF_EXPIRED'}
  }
  state.rows=state.rows.filter(r=>now-num(r.createdAt)<RETAIN_MS).slice(-MAX_ROWS);
  return state;
}
function fastContext(fast,symbol){return (fast?.context||[]).find(x=>String(x?.symbol||'').toUpperCase()===symbol)||null}
function priceFromContext(c){return num(c?.technical?.price,num(c?.price,0))||null}
function candidateFromPrompt(s,symbol){return s.candidates.find(x=>String(x?.symbol||'').toUpperCase()===symbol)||null}
function heldFromPrompt(s,symbol){return s.held.find(x=>String(x?.symbol||'').toUpperCase()===symbol)||null}

export function queueOrderApprovals(storage,actions,prompt,fast=null,source='AI_PLAN'){
  const now=Date.now(),state=cleanup(read(storage),now),p=promptState(prompt),list=Array.isArray(actions)?actions:[];
  for(const a of list){
    const action=String(a?.action||'').toUpperCase();if(!['BUY','SELL'].includes(action))continue;
    const symbol=String(a?.symbol||'').toUpperCase();if(!symbol)continue;
    const c=candidateFromPrompt(p,symbol),h=heldFromPrompt(p,symbol),ctx=fastContext(fast,symbol),allocation=Math.max(0,Math.min(100,num(a?.allocation_pct))),estimatedNotional=action==='BUY'?p.cash*allocation/100:null;
    const existing=[...state.rows].reverse().find(r=>r.status==='PENDING'&&r.symbol===symbol&&r.action===action&&now-num(r.createdAt)<90_000);
    const data={
      symbol,action,confidence:Math.max(0,Math.min(1,num(a?.confidence))),allocationPct:allocation,estimatedNotional:estimatedNotional==null?null:+estimatedNotional.toFixed(2),currency:p.currency,
      referencePrice:priceFromContext(ctx),reason:String(a?.reason||'').slice(0,420),source,createdAt:now,expiresAt:now+TTL_MS,status:'PENDING',
      brokerTarget:'finanzen.net ZERO',venue:'gettex',connector:'NONE',humanApprovalRequired:true,brokerFinalConfirmationRequired:true,
      instrumentType:c?.type||h?.type||null,momentumState:c?.momentumState||null,regime:ctx?.regime||null,evidence:ctx?.evidenceDiversity||null,
      gapState:(fast?.gapContext||[]).find(x=>String(x?.symbol||'').toUpperCase()===symbol)?.state||null,
      regionalBenchmark:ctx?.regionalBenchmark||null,fxSafety:ctx?.fxSafety||null,executionCost:ctx?.executionCost||null
    };
    if(existing)Object.assign(existing,data,{id:existing.id,createdAt:existing.createdAt,expiresAt:now+TTL_MS});
    else state.rows.push({id:crypto.randomUUID(),...data});
  }
  cleanup(state,now);state.updatedAt=now;write(storage,state);return state.rows;
}

export function listOrderApprovals(storage,{includeClosed=false}={}){
  const state=cleanup(read(storage));write(storage,state);const rows=[...state.rows].sort((a,b)=>num(b.createdAt)-num(a.createdAt));return includeClosed?rows:rows.filter(r=>['PENDING','APPROVED_LOCAL'].includes(r.status));
}

export function approveOrderApproval(storage,id,approvedBy='authenticated-user'){
  const now=Date.now(),state=cleanup(read(storage),now),row=state.rows.find(x=>x.id===id);if(!row)return{ok:false,status:404,error:'Ordervorschlag nicht gefunden.'};
  if(row.status!=='PENDING')return{ok:false,status:409,error:`Ordervorschlag ist ${row.status}.`,order:row};
  if(now>num(row.expiresAt)){row.status='EXPIRED';write(storage,state);return{ok:false,status:409,error:'Ordervorschlag ist abgelaufen und muss neu berechnet werden.',order:row}}
  row.status='APPROVED_LOCAL';row.approvedAt=now;row.approvedBy=String(approvedBy||'authenticated-user').slice(0,180);row.dispatchState='AWAITING_OFFICIAL_CONNECTOR';row.dispatchExpiresAt=now+APPROVED_HANDOFF_TTL_MS;row.connector='NONE';row.notice='Lokal bestätigt, aber NICHT an einen Broker gesendet. Vor echter Ausführung muss ein offiziell erlaubter Broker-/Partner-Connector Kurs, Spread, Handelbarkeit und Orderdaten erneut prüfen.';
  state.updatedAt=now;write(storage,state);return{ok:true,order:row,brokerSent:false}
}

export function rejectOrderApproval(storage,id,rejectedBy='authenticated-user'){
  const state=cleanup(read(storage)),row=state.rows.find(x=>x.id===id);if(!row)return{ok:false,status:404,error:'Ordervorschlag nicht gefunden.'};if(row.status!=='PENDING')return{ok:false,status:409,error:`Ordervorschlag ist ${row.status}.`,order:row};row.status='REJECTED';row.rejectedAt=Date.now();row.rejectedBy=String(rejectedBy||'authenticated-user').slice(0,180);state.updatedAt=Date.now();write(storage,state);return{ok:true,order:row}
}

export function clearOrderApprovals(storage){const state={rows:[],updatedAt:Date.now()};write(storage,state);return{ok:true}}

export function orderApprovalCapabilities(env){
  const accessConfigured=Boolean(env?.CF_ACCESS_TEAM_DOMAIN&&env?.CF_ACCESS_AUD),enabled=String(env?.ORDER_APPROVAL_MODE||'disabled').toLowerCase()==='enabled';
  return{enabled,accessConfigured,readyForLocalApproval:enabled&&accessConfigured,brokerConnector:'NONE',brokerConnected:false,brokerDispatchEnabled:false,proposalTtlSeconds:TTL_MS/1000,handoffTtlSeconds:APPROVED_HANDOFF_TTL_MS/1000,humanApprovalRequired:true,brokerFinalConfirmationRequired:true,mode:'PREPARED_NOT_CONNECTED'}
}
