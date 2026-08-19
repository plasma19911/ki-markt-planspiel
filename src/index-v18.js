import './public-feed-resilience.js';
import base,{MarketPortfolio} from './index.js';
import './intelligence-request-cache.js';
import {gettexSessionState} from './gettex-session.js';
import {positionChartHistoryData} from './position-chart-history.js';
export {MarketPortfolio};

const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');

function noStoreCritical(request,response){
 const url=new URL(request.url);
 const accept=String(request.headers.get('accept')||'');
 const htmlRoute=url.pathname==='/'||url.pathname.endsWith('.html')||accept.includes('text/html');
 const criticalUi=url.pathname==='/quota-guard.js';
 if(!htmlRoute&&!criticalUi)return response;
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
 headers.set('Pragma','no-cache');
 headers.set('Expires','0');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

const json=(x,status=200)=>Response.json(x,{status,headers:{'cache-control':'no-store'}});

const GUARDED_PATHS=new Set(['/api/start','/api/stop','/api/reset','/api/scan','/api/migrate-from-old-sql']);
const DESTRUCTIVE_PATHS=new Set(['/api/start','/api/reset']);
function needsGuard(url,method){return method==='POST'&&GUARDED_PATHS.has(url.pathname)}
function browserOriginAllowed(request,url){
 const site=String(request.headers.get('sec-fetch-site')||'').toLowerCase();
 if(site&&site!=='same-origin'&&site!=='none')return false;
 const origin=String(request.headers.get('origin')||'');
 if(origin&&origin!==url.origin)return false;
 const referer=String(request.headers.get('referer')||'');
 if(referer){try{if(new URL(referer).origin!==url.origin)return false}catch{return false}}
 return true;
}
function destructiveConfirmed(request,url){
 if(!DESTRUCTIVE_PATHS.has(url.pathname)||request.method!=='POST')return true;
 const site=String(request.headers.get('sec-fetch-site')||'').toLowerCase();
 if(site==='same-origin')return true;
 return String(request.headers.get('x-planspiel-confirm')||'').toLowerCase()==='replace';
}
function controlGuard(request,url){
 if(!needsGuard(url,request.method))return null;
 if(!browserOriginAllowed(request,url))return json({error:'Diese Steueraktion wurde als Cross-Site-Anfrage blockiert.',controlAuth:false},403);
 if(!destructiveConfirmed(request,url))return json({error:'Start/Reset braucht eine ausdrückliche lokale Bestätigung.',destructiveConfirmationRequired:true},409);
 return null;
}

export default{
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/api/recover-20260819-health-snapshot'&&request.method==='GET'){
   try{
    const result=await portfolio(env).recover20260819();
    return json(result,result?.ok?200:409);
   }catch(e){
    return json({ok:false,recoveryError:String(e?.message||e).slice(0,700),name:String(e?.name||'Error'),stack:String(e?.stack||'').slice(0,1200)},500);
   }
  }
  const blocked=controlGuard(request,url);
  if(blocked)return blocked;
  if(url.pathname==='/api/position-chart'&&request.method==='GET'){
   try{const data=await positionChartHistoryData(portfolio(env),url);return json(data,data.status||200)}catch(e){return json({error:String(e?.message||e)},500)}
  }
  const response=await base.fetch(request,env,ctx);
  return noStoreCritical(request,response);
 },
 async scheduled(controller,env,ctx){
  await base.scheduled?.(controller,env,ctx);
  const when=new Date(Number(controller?.scheduledTime)||Date.now()),session=gettexSessionState(when),p=portfolio(env);
  if(session.isTradingDay&&session.localMinute>=22*60+5&&session.localMinute<=22*60+55){
   ctx.waitUntil((async()=>{const agent=await p.agentStatus();if(agent?.online)await p.dailyReplay(8)})().catch(e=>console.error('Preliminary day replay batch failed',e)));
  }
  if(session.isTradingDay&&session.localMinute>=23*60+5&&session.localMinute<=23*60+55){
   ctx.waitUntil(p.finalDayReplay(8).catch(e=>console.error('Final day replay batch failed',e)));
  }
 }
};
