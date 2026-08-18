// Production entry: stocks-only paper trading plus prepared human approval workflow.
// Real broker dispatch remains disabled until an official connector is explicitly added.
import {MarketPortfolio} from './compact-portfolio-v7.js';
import {verifyCloudflareAccess} from './access-auth.js';
export {MarketPortfolio};

const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'cache-control':'no-store'}});
const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');
const approvalMode=env=>String(env?.ORDER_APPROVAL_MODE||'disabled').toLowerCase()==='enabled';

export default{
 async fetch(request,env){
  const u=new URL(request.url);
  if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   const p=portfolio(env);let sessionAuth=null;
   // Sobald der spaetere Echtgeld-/Freigabemodus aktiviert wird, sind alle Depot-/Steuer-APIs
   // ausser der harmlosen Konfigurationsanzeige nur noch mit gueltigem Cloudflare-Access-JWT erreichbar.
   if(approvalMode(env)&&u.pathname!=='/api/order-approval-status'){
    sessionAuth=await verifyCloudflareAccess(request,env);if(!sessionAuth.ok)return reply({error:sessionAuth.error,approvalAuth:false},sessionAuth.status||403);
   }
   if(u.pathname==='/api/status'&&request.method==='GET')return reply(await p.status());
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
    return reply({...started,firstScan,storage:'Durable Object Free · 1 compact row',assetClass:'Aktien בלבד',targetBroker:'finanzen.net ZERO · gettex'});
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
  ctx.waitUntil(portfolio(env).scan().catch(e=>console.error('Compact DO scan failed',e)));
 }
};
