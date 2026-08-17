// Production entry: R2-backed paper trading with stocks + normal ETFs only.
// The legacy Durable Object export remains available only for one-time migration.
import {R2Portfolio} from './r2-portfolio.js';
export {MarketPortfolio} from './portfolio-learning.js';

const reply=(x,s=200)=>Response.json(x,{status:s,headers:{'cache-control':'no-store'}});
const r2=env=>new R2Portfolio(env);
const legacy=env=>env.PORTFOLIO.getByName('default-paper-portfolio');

export default{
 async fetch(request,env){
  const u=new URL(request.url);
  if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{
   const p=r2(env);
   if(u.pathname==='/api/status'&&request.method==='GET')return reply(await p.status());
   if(u.pathname==='/api/start'&&request.method==='POST'){
    const b=await request.json().catch(()=>({}));
    const started=await p.start({...b,includeEtfs:true,includeLeverage:false});
    const firstScan=await p.scan();
    return reply({...started,firstScan,storage:'R2'});
   }
   if(u.pathname==='/api/stop'&&request.method==='POST')return reply(await p.stop());
   if(u.pathname==='/api/reset'&&request.method==='POST')return reply(await p.reset());
   if(u.pathname==='/api/scan'&&request.method==='POST')return reply(await p.scan());
   if(u.pathname==='/api/migrate-from-do'&&request.method==='POST'){
    const old=await legacy(env).status();
    return reply(await p.importLegacy(old));
   }
   if(u.pathname==='/api/last-week'&&request.method==='POST')return reply({error:'Der alte Replay-Endpunkt ist entfernt. Nutze den 2026-Tab.'},410);
   return reply({error:'Not found'},404);
  }catch(e){return reply({error:String(e?.message||e)},500)}
 },
 async scheduled(controller,env,ctx){
  ctx.waitUntil(r2(env).scan().catch(e=>console.error('R2 scan failed',e)));
 }
};
