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

// Kostenfreier Browser-CSRF-Schutz fuer zustandsaendernde UI-Endpunkte.
// Die eigene Weboberflaeche darf ohne zusaetzliches Passwort/Steuer-Secret arbeiten.
// /api/agent/* bleibt separat ueber PC_AGENT_TOKEN geschuetzt; Order-Freigaben
// behalten ihre bestehende Cloudflare-Access-Pruefung.
const GUARDED_PATHS=new Set(['/api/start','/api/stop','/api/reset','/api/scan','/api/migrate-from-old-sql']);
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
function controlGuard(request,url){
 if(!needsGuard(url,request.method))return null;
 if(!browserOriginAllowed(request,url))
  return json({error:'Diese Steueraktion wurde als Cross-Site-Anfrage blockiert.',controlAuth:false},403);
 return null;
}

// Production wrapper: API/scan behavior stays in index.js. The trade-chart endpoint
// is intercepted here so closed positions keep a full historical buy/sell window.
// HTML and the small critical dashboard-guard asset are never cached so phone/PWA
// browsers cannot keep an obsolete depot/replay renderer.
export default{
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  const blocked=controlGuard(request,url);
  if(blocked)return blocked;
  if(url.pathname==='/api/position-chart'&&request.method==='GET'){
   try{
    const data=await positionChartHistoryData(portfolio(env),url);
    return json(data,data.status||200);
   }catch(e){return json({error:String(e?.message||e)},500)}
  }
  const response=await base.fetch(request,env,ctx);
  return noStoreCritical(request,response);
 },
 async scheduled(controller,env,ctx){
  await base.scheduled?.(controller,env,ctx);
  const when=new Date(Number(controller?.scheduledTime)||Date.now()),session=gettexSessionState(when),p=portfolio(env);
  // Ab 22:05 ist die regulaere US-Session beendet. Wenn der PC-Agent online ist,
  // laeuft ohnehin kein Cloudflare-Markt-Fallback; diese freien Cron-Slots bauen
  // bereits einen heutigen vorlaeufigen Replay auf. So ist die Tagesauswertung am
  // selben Abend sichtbar statt erst eine Stunde spaeter.
  if(session.isTradingDay&&session.localMinute>=22*60+5&&session.localMinute<=22*60+55){
   ctx.waitUntil((async()=>{const agent=await p.agentStatus();if(agent?.online)await p.dailyReplay(8)})().catch(e=>console.error('Preliminary day replay batch failed',e)));
  }
  // Nach Ende des gettex-Fensters wird der Report einmal aus dem finalen Capture
  // neu aufgebaut. Spaete Trades/Kandidaten zwischen 22:05 und 23:00 gehen dadurch
  // nicht verloren; weitere 5-Minuten-Crons arbeiten denselben finalen Report ab.
  if(session.isTradingDay&&session.localMinute>=23*60+5&&session.localMinute<=23*60+55){
   ctx.waitUntil(p.finalDayReplay(8).catch(e=>console.error('Final day replay batch failed',e)));
  }
 }
};
