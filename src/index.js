// Production entry: zero-additional-cost paper trading on Workers Free.
// State is stored as ONE compact KV value inside the existing SQLite-backed Durable Object.
import {MarketPortfolio} from './compact-portfolio-v4.js';
export {MarketPortfolio};

const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'cache-control':'no-store'}});
const portfolio=env=>env.PORTFOLIO.getByName('default-paper-portfolio');

export default{
 async fetch(request,env){
  const u=new URL(request.url);
  if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   const p=portfolio(env);
   if(u.pathname==='/api/status'&&request.method==='GET')return reply(await p.status());
   if(u.pathname==='/api/start'&&request.method==='POST'){
    const b=await request.json().catch(()=>({}));
    const started=await p.start({...b,includeEtfs:true,includeLeverage:false});
    const firstScan=await p.scan();
    return reply({...started,firstScan,storage:'Durable Object Free · 1 compact row'});
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
