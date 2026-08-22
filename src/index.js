// Production compatibility core remains unchanged in index-core.js:
// compact-portfolio-v11.js · /api/agent/universe · PC_AGENT_TOKEN · /api/agent/prefetch · /api/agent/scan
import core,{MarketPortfolio} from './index-core.js';
import {agentStatusLite,shouldServeAgentLite} from './status-lite.js';
export {MarketPortfolio};

const enc=new TextEncoder();
async function etag(payload){
  const digest=await crypto.subtle.digest('SHA-1',enc.encode(JSON.stringify(payload)));
  return `"${[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}"`;
}
async function liteStatusResponse(request,env){
  const p=env.PORTFOLIO.getByName('default-paper-portfolio');
  const payload=agentStatusLite(await p.status());
  const tag=await etag(payload);
  const headers={'cache-control':'private, no-cache','etag':tag,'vary':'accept-encoding,user-agent'};
  if(request.headers.get('if-none-match')===tag)return new Response(null,{status:304,headers});
  if(request.method==='HEAD')return new Response(null,{status:200,headers:{...headers,'content-type':'application/json'}});
  return Response.json(payload,{headers});
}

export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    const statusMethod=request.method==='GET'||request.method==='HEAD';
    if(statusMethod&&(u.pathname==='/api/status/lite'||(u.pathname==='/api/status'&&shouldServeAgentLite(request)))){
      try{return await liteStatusResponse(request,env)}catch(e){return Response.json({error:String(e?.message||e)},{status:500})}
    }
    return core.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){return core.scheduled(controller,env,ctx)}
};
