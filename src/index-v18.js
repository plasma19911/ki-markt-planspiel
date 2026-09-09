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

// Passwortlose Browser-Sicherheit: normale Steuerung aus der eigenen UI bleibt frei.
// Fremde Cross-Site-Browseraufrufe werden blockiert. Start/Reset sind zusaetzlich
// destruktiv und akzeptieren ohne Passwort nur echte Same-Origin-Browser-Metadaten;
// fuer bewusstes CLI gibt es den expliziten, nicht geheimen Bestaetigungsheader.
const GUARDED_PATHS=new Set(['/api/start','/api/stop','/api/reset','/api/scan','/api/manual-trade','/api/migrate-from-old-sql','/api/runtime-trade-config','/api/runtime-trade-config/reset']);
const GUARDED_PREFIXES=['/api/order-approvals/'];
const DESTRUCTIVE_PATHS=new Set(['/api/start','/api/reset','/api/migrate-from-old-sql']);
function needsGuard(url,method){return method==='POST'&&(GUARDED_PATHS.has(url.pathname)||GUARDED_PREFIXES.some(prefix=>url.pathname.startsWith(prefix)))}
function browserOriginAllowed(request,url){
 const site=String(request.headers.get('sec-fetch-site')||'').toLowerCase();
 if(site&&site!=='same-origin'&&site!=='none')return false;
 const origin=String(request.headers.get('origin')||'');
 if(origin&&origin!==url.origin)return false;
 const referer=String(request.headers.get('referer')||'');
 if(referer){try{if(new URL(referer).origin!==url.origin)return false}catch{return false}}
 return true;
}
function sameOriginBrowser(request){return String(request.headers.get('sec-fetch-site')||'').toLowerCase()==='same-origin'}
function confirmHeader(request){return String(request.headers.get('x-planspiel-confirm')||'').toLowerCase()}
function controlConfirmed(request,url){
 if(sameOriginBrowser(request))return true;
 const confirm=confirmHeader(request);
 if(DESTRUCTIVE_PATHS.has(url.pathname))return confirm==='replace';
 return confirm==='replace'||confirm==='control';
}
function controlGuard(request,url){
 if(!needsGuard(url,request.method))return null;
 if(!browserOriginAllowed(request,url))return json({error:'Diese Steueraktion wurde als Cross-Site-Anfrage blockiert.',controlAuth:false},403);
 if(!controlConfirmed(request,url)){
  const destructive=DESTRUCTIVE_PATHS.has(url.pathname);
  return json({error:destructive?'Diese Aktion ueberschreibt den Depotzustand und braucht eine ausdrueckliche Bestaetigung.':'Diese Steueraktion braucht ausserhalb der eigenen UI eine ausdrueckliche Bestaetigung.',destructiveConfirmationRequired:destructive,controlConfirmationRequired:!destructive,confirmHeader:'x-planspiel-confirm: '+(destructive?'replace':'control')},409);
 }
 return null;
}

export default{
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  const blocked=controlGuard(request,url);
  if(blocked)return blocked;
  if(url.pathname==='/api/runtime-trade-config'&&request.method==='GET'){
   try{return json({ok:true,config:await portfolio(env).runtimeTradeConfig(),deployRequired:false,applies:'next AI decision / next scan'})}catch(e){return json({error:String(e?.message||e)},500)}
  }
  if(url.pathname==='/api/runtime-trade-config'&&request.method==='POST'){
   try{const body=await request.json().catch(()=>({})),result=await portfolio(env).setRuntimeTradeConfig(body);return json(result,result?.ok===false?500:200)}catch(e){return json({error:String(e?.message||e)},500)}
  }
  if(url.pathname==='/api/runtime-trade-config/reset'&&request.method==='POST'){
   try{const result=await portfolio(env).resetRuntimeTradeConfig();return json(result,result?.ok===false?500:200)}catch(e){return json({error:String(e?.message||e)},500)}
  }
  if(url.pathname==='/api/position-chart'&&request.method==='GET'){
   try{const data=await positionChartHistoryData(portfolio(env),url);return json(data,data.status||200)}catch(e){return json({error:String(e?.message||e)},500)}
  }
  const response=await base.fetch(request,env,ctx);
  return noStoreCritical(request,response);
 },
 async scheduled(controller,env,ctx){
  await base.scheduled?.(controller,env,ctx);
  const when=new Date(Number(controller?.scheduledTime)||Date.now()),session=gettexSessionState(when),p=portfolio(env);
  // Der PC-Agent darf bewusst offline sein. Der finale Tages-Replay ist Cloudflare-
  // seitig unabhaengig und laeuft nach gettex-Schluss weiter.
  if(session.isTradingDay&&session.localMinute>=22*60+5&&session.localMinute<=22*60+55&&session.localMinute%5===0){
   ctx.waitUntil((async()=>{const agent=await p.agentStatus();if(!agent?.online)await p.dailyReplay(8)})().catch(e=>console.error('Offline preliminary replay fallback failed',e)));
  }
  if(session.isTradingDay&&session.localMinute>=23*60+5&&session.localMinute<=23*60+55&&session.localMinute%5===0){
   ctx.waitUntil((async()=>{const agent=await p.agentStatus(),localStatus=String(agent?.metrics?.eveningReplayStatus||'').toUpperCase();if(!agent?.online||!localStatus.includes('COMPLETE'))await p.finalDayReplay(8)})().catch(e=>console.error('Final replay fallback failed',e)));
  }
 }
};
