import base,{MarketPortfolio} from './index.js';
import {gettexSessionState} from './gettex-session.js';
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

// Thin production wrapper: normal API/scan behavior stays in index.js. HTML is
// deliberately never cached so phone/PWA browsers cannot keep an obsolete UI
// after a deployment. Static versioned CSS/JS assets may still cache normally.
export default{
 async fetch(request,env,ctx){
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
