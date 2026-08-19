import './public-feed-resilience.js';
import base,{MarketPortfolio} from './index.js';
import './intelligence-request-cache.js';
import {gettexSessionState} from './gettex-session.js';
import {positionChartHistoryData} from './position-chart-history.js';
export {MarketPortfolio};

const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');

function noStoreHtml(request,response){
 const url=new URL(request.url);
 const accept=String(request.headers.get('accept')||'');
 const htmlRoute=url.pathname==='/'||url.pathname.endsWith('.html')||accept.includes('text/html');
 if(!htmlRoute)return response;
 const headers=new Headers(response.headers);
 headers.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
 headers.set('Pragma','no-cache');
 headers.set('Expires','0');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

const json=(x,status=200)=>Response.json(x,{status,headers:{'cache-control':'no-store'}});

// ---------------------------------------------------------------------------
// Schutz fuer zustandsaendernde Endpunkte.
//
// CONTROL_TOKEN ist fuer Steuer-POSTs absichtlich PFLICHT. Same-Origin allein
// waere nur ein CSRF-Schutz und keine Authentifizierung gegen direkte HTTP-Clients.
// Browser-Anfragen werden zusaetzlich auf Cross-Site-Nutzung geprueft. Requests
// ohne Browser-Fetch-Metadaten (z. B. ein bewusstes CLI) duerfen mit gueltigem
// Token weiter arbeiten.
// /api/agent/* bleibt aussen vor: diese Endpunkte haben PC_AGENT_TOKEN.
// Order-Freigaben bleiben bei ihrer bestehenden Cloudflare-Access-Pruefung.
// ---------------------------------------------------------------------------
const GUARDED_PATHS=new Set(['/api/start','/api/stop','/api/reset','/api/scan','/api/migrate-from-old-sql']);
const enc=new TextEncoder();

async function tokenEqual(a,b){
 const [da,db]=await Promise.all([
  crypto.subtle.digest('SHA-256',enc.encode(String(a||''))),
  crypto.subtle.digest('SHA-256',enc.encode(String(b||'')))
 ]);
 const aa=new Uint8Array(da),bb=new Uint8Array(db);
 let diff=aa.length^bb.length;
 for(let i=0;i<Math.min(aa.length,bb.length);i++)diff|=aa[i]^bb[i];
 return diff===0;
}

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

async function controlGuard(request,url,env){
 if(!needsGuard(url,request.method))return null;
 if(!browserOriginAllowed(request,url))
  return json({error:'Diese Steueraktion wurde als Cross-Site-Anfrage blockiert.',controlAuth:false},403);
 const expected=String(env?.CONTROL_TOKEN||'').trim();
 if(!expected)
  return json({error:'CONTROL_TOKEN fehlt in Cloudflare. Steuer-Endpunkte bleiben bis zur Einrichtung gesperrt.',controlAuth:false,controlSecretMissing:true},503);
 const given=String(request.headers.get('x-control-token')||'').trim();
 if(!given||!(await tokenEqual(given,expected)))
  return json({error:'Steuer-Token fehlt oder ist falsch.',controlAuth:false,controlTokenRequired:true},401);
 return null;
}

// Production wrapper: API/scan behavior stays in index.js. The trade-chart endpoint
// is intercepted here so closed positions keep a full historical buy/sell window.
// HTML is never cached so phone/PWA browsers cannot keep an obsolete UI.
export default{
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  const blocked=await controlGuard(request,url,env);
  if(blocked)return blocked;
  if(url.pathname==='/api/position-chart'&&request.method==='GET'){
   try{
    const data=await positionChartHistoryData(portfolio(env),url);
    return json(data,data.status||200);
   }catch(e){return json({error:String(e?.message||e)},500)}
  }
  const response=await base.fetch(request,env,ctx);
  return noStoreHtml(request,response);
 },
 async scheduled(controller,env,ctx){
  await base.scheduled?.(controller,env,ctx);
  const when=new Date(Number(controller?.scheduledTime)||Date.now()),session=gettexSessionState(when);
  if(session.isTradingDay&&session.localMinute>=23*60+5&&session.localMinute<=23*60+55){
   ctx.waitUntil(portfolio(env).dailyReplay(8).catch(e=>console.error('Day replay batch failed',e)));
  }
 }
};
