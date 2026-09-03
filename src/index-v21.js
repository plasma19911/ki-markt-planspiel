import base,{MarketPortfolio} from './index-v20.js';
import {positionChartHistoryData} from './position-chart-history.js';
import {buildLiveNewsFeed} from './live-news-feed.js';
export {MarketPortfolio};

const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');

async function chart(request,env){
 const p=portfolio(env),u=new URL(request.url),data=await positionChartHistoryData(p,u);
 return Response.json(data,{status:data?.status||200,headers:{'cache-control':'no-store','x-chart-endpoint':'v31.7.12-universal'}});
}
async function news(env){
 const payload=await buildLiveNewsFeed(portfolio(env),env,{limit:12});
 return Response.json(payload,{headers:{'cache-control':'private, no-store, max-age=0','x-news-endpoint':'v31.7.12-clickable'}});
}

export default{
 async fetch(request,env,ctx){
  const u=new URL(request.url);
  if(u.pathname==='/api/position-chart'&&request.method==='GET'){
   try{return await chart(request,env)}catch(e){return Response.json({ok:false,error:String(e?.message||e)},{status:500,headers:{'cache-control':'no-store'}})}
  }
  if(u.pathname==='/api/news-feed'&&request.method==='GET'){
   try{return await news(env)}catch(e){return Response.json({ok:false,error:String(e?.message||e),items:[]},{status:500,headers:{'cache-control':'no-store'}})}
  }
  return base.fetch(request,env,ctx)
 },
 async scheduled(controller,env,ctx){return base.scheduled?.(controller,env,ctx)}
};
