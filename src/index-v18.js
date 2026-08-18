import base,{MarketPortfolio} from './index.js';
import {gettexSessionState} from './gettex-session.js';
export {MarketPortfolio};

const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');

// Thin production wrapper: normal API/scan behavior stays in index.js. After the
// 23:00 gettex close, cron time is reused to process the day replay in small
// batches so Cloudflare Free is not hit with dozens of chart requests at once.
export default{
 async fetch(request,env,ctx){return base.fetch(request,env,ctx)},
 async scheduled(controller,env,ctx){
  await base.scheduled?.(controller,env,ctx);
  const when=new Date(Number(controller?.scheduledTime)||Date.now()),session=gettexSessionState(when);
  if(session.isTradingDay&&session.localMinute>=23*60+5&&session.localMinute<=23*60+55){
   ctx.waitUntil(portfolio(env).dailyReplay(8).catch(e=>console.error('Day replay batch failed',e)));
  }
 }
};
