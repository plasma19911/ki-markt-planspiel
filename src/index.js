// Production entry: stocks-only paper trading plus prepared human approval workflow.
// Real broker dispatch remains disabled until an official connector is explicitly added.
import './yahoo-spark-repair.js';
import {MarketPortfolio} from './compact-portfolio-v10.js';
import {gettexSessionState} from './gettex-session.js';
import {verifyCloudflareAccess} from './access-auth.js';
export {MarketPortfolio};

const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'cache-control':'no-store'}});
const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');
const approvalMode=env=>String(env?.ORDER_APPROVAL_MODE||'disabled').toLowerCase()==='enabled';
const enc=new TextEncoder();
async function tokenEqual(a,b){
 const [da,db]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(String(a||''))),crypto.subtle.digest('SHA-256',enc.encode(String(b||'')))]),aa=new Uint8Array(da),bb=new Uint8Array(db);let diff=aa.length^bb.length;for(let i=0;i<Math.min(aa.length,bb.length);i++)diff|=aa[i]^bb[i];return diff===0;
}
async function verifyPcAgent(request,env){
 const expected=String(env?.PC_AGENT_TOKEN||'');if(!expected)return{ok:false,status:503,error:'PC_AGENT_TOKEN ist in Cloudflare noch nicht eingerichtet.'};
 const auth=String(request.headers.get('authorization')||''),token=auth.replace(/^Bearer\s+/i,'').trim();if(!token||!(await tokenEqual(token,expected)))return{ok:false,status:401,error:'Windows-PC-Agent nicht autorisiert.'};
 return{ok:true};
}

async function freeTierAppJs(request,env){
 const r=await env.ASSETS.fetch(request);if(!r.ok)return r;
 let text=await r.text();
 text=text
  .replace(/LÄUFT · 60 SEKUNDEN/g,'LÄUFT · 1-MIN-SCAN')
  .replace(/Aktien und normale ETFs/g,'nur Aktien')
  .replace(/Aktien \+ normale ETFs/g,'nur Aktien')
  .replace(/includeEtfs:true/g,'includeEtfs:false')
  .replace(/setInterval\(load,5000\)/g,'setInterval(load,60000)');
 const h=new Headers(r.headers);h.set('content-type','text/javascript; charset=utf-8');h.set('cache-control','public, max-age=300');
 return new Response(text,{status:r.status,headers:h});
}

export default{
 async fetch(request,env){
  const u=new URL(request.url);
  if(u.pathname==='/app.js'&&request.method==='GET')return freeTierAppJs(request,env);
  if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   const p=portfolio(env);let sessionAuth=null;const agentPath=u.pathname.startsWith('/api/agent/');
   if(approvalMode(env)&&u.pathname!=='/api/order-approval-status'&&!agentPath){
    sessionAuth=await verifyCloudflareAccess(request,env);if(!sessionAuth.ok)return reply({error:sessionAuth.error,approvalAuth:false},sessionAuth.status||403);
   }
   if(u.pathname==='/api/status'&&request.method==='GET')return reply(await p.status());
   if(u.pathname==='/api/agent/status'&&request.method==='GET')return reply(await p.agentStatus());
   if(agentPath&&request.method==='POST'){
    const auth=await verifyPcAgent(request,env);if(!auth.ok)return reply({error:auth.error,pcAgentAuth:false},auth.status);
    const b=await request.json().catch(()=>({}));
    if(u.pathname==='/api/agent/heartbeat')return reply(await p.agentHeartbeat(b));
    if(u.pathname==='/api/agent/prefetch')return reply(await p.agentPrefetch(b));
    if(u.pathname==='/api/agent/scan')return reply(await p.scanFromAgent(b));
   }
   if(u.pathname==='/api/order-approval-status'&&request.method==='GET')return reply(await p.orderApprovalStatus());
   if(u.pathname==='/api/order-approvals'&&request.method==='GET'){
    const auth=sessionAuth||await verifyCloudflareAccess(request,env);if(!auth.ok)return reply({error:auth.error,approvalAuth:false},auth.status||403);
    return reply(await p.orderApprovals());
   }
   const orderAction=u.pathname.match(/^\/api\/order-approvals\/([^/]+)\/(approve|reject)$/);
   if(orderAction&&request.method==='POST'){
    const auth=sessionAuth||await verifyCloudflareAccess(request,env);if(!auth.ok)return reply({error:auth.error,approvalAuth:false},auth.status||403);
    const id=decodeURIComponent(orderAction[1]),result=orderAction[2]==='approve'?await p.approveOrder(id,auth.user?.email):await p.rejectOrder(id,auth.user?.email);
    return reply(result,result?.ok?200:(result?.status||400));
   }
   if(u.pathname==='/api/start'&&request.method==='POST'){
    const b=await request.json().catch(()=>({}));
    const started=await p.start({...b,includeEtfs:false,includeLeverage:false});
    const firstScan=await p.scan();
    return reply({...started,firstScan,storage:'Durable Object Free · kompakter Hauptzustand',assetClass:'nur Aktien',targetBroker:'finanzen.net ZERO · gettex',freeTier:'Windows-PC-Agent bevorzugt · 07:25 Vorbereitung · 07:30-23:00 Minutenbetrieb · Cloudflare 5-Minuten-Fallback'});
   }
   if(u.pathname==='/api/stop'&&request.method==='POST')return reply(await p.stop());
   if(u.pathname==='/api/reset'&&request.method==='POST')return reply(await p.reset());
   if(u.pathname==='/api/scan'&&request.method==='POST')return reply(await p.scan());
   if(u.pathname==='/api/migrate-from-old-sql'&&request.method==='POST')return reply(await p.migrateLegacySql());
   if(u.pathname==='/api/last-week'&&request.method==='POST')return reply({error:'Der alte Replay-Endpunkt ist entfernt. Nutze den 2026-Tab.'},410);
   return reply({error:'Not found'},404);
  }catch(e){return reply({error:String(e?.message||e)},500)}
 },
 async scheduled(controller,env,ctx){
  const when=new Date(Number(controller?.scheduledTime)||Date.now()),session=gettexSessionState(when);
  // Der Windows-PC-Agent liefert den normalen Minutenbetrieb. Cloudflare wird nur alle
  // 5 Minuten geweckt und scannt ausschließlich, wenn der Agent seit >150 s offline ist.
  if(session.open){ctx.waitUntil((async()=>{const p=portfolio(env),agent=await p.agentStatus();if(agent?.online)return;await p.scan()})().catch(e=>console.error('Compact DO fallback scan failed',e)));return}
  // 07:25 bleibt als idempotente Sicherheits-Vorbereitung aktiv. Wenn der PC bereits
  // Voranalyse geliefert hat, nutzt V10 diese Daten; andernfalls greift Cloudflare ein.
  if(session.prepareNow){ctx.waitUntil(portfolio(env).preOpenPrepare().catch(e=>console.error('gettex preopen prepare failed',e)))}
 }
};
