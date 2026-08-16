import {MarketPortfolio} from './portfolio-final.js';
export {MarketPortfolio};
const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'cache-control':'no-store'}});
const stub=env=>env.PORTFOLIO.getByName('default-paper-portfolio');
export default{
 async fetch(request,env){
  const u=new URL(request.url);
  if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   const p=stub(env);
   if(u.pathname==='/api/status'&&request.method==='GET')return reply(await p.status());
   if(u.pathname==='/api/start'&&request.method==='POST'){const b=await request.json().catch(()=>({}));const r=await p.start(b);await p.scan();return reply(r)}
   if(u.pathname==='/api/stop'&&request.method==='POST')return reply(await p.stop());
   if(u.pathname==='/api/reset'&&request.method==='POST')return reply(await p.reset());
   if(u.pathname==='/api/scan'&&request.method==='POST')return reply(await p.scan());
   if(u.pathname==='/api/last-week'&&request.method==='POST')return reply(await p.lastWeek());
   return reply({error:'Not found'},404);
  }catch(e){return reply({error:String(e?.message||e)},500)}
 },
 async scheduled(controller,env,ctx){ctx.waitUntil(stub(env).scan())}
};
