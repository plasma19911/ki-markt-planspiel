import './public-feed-resilience.js';
import base,{MarketPortfolio} from './index.js';
import './yahoo-chart-serial.js';
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

// Production wrapper: API/scan behavior stays in index.js. The trade-chart endpoint
// is intercepted here so closed positions keep a full historical buy/sell window.
// HTML is never cached so phone/PWA browsers cannot keep an obsolete UI.
export default{
 async fetch(request,env,ctx){
  const url=new URL(request.url);
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
