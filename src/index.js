// Production compatibility wrapper around index-core.js.
// V30.5.1 additionally restores exact Trade-Republic metadata on the PC-agent
// universe response so downstream BUY/rotation guards can verify candidates.
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

async function enrichAgentUniverse(response,env,requestUrl){
  if(!response?.ok)return response;
  try{
    const payload=await response.clone().json();
    if(!Array.isArray(payload?.equities))return response;
    const assetUrl=new URL('/universe.json',requestUrl),asset=await env.ASSETS.fetch(new Request(assetUrl.toString()));
    if(!asset.ok)return response;
    const master=await asset.json();
    const bySymbol=new Map((Array.isArray(master?.equities)?master.equities:[]).map(x=>[String(x?.symbol||'').toUpperCase(),x]));
    payload.equities=payload.equities.map(row=>{
      const x=bySymbol.get(String(row?.symbol||'').toUpperCase());
      if(!x)return row;
      return {...row,
        isin:x?.isin||null,
        assetClass:String(x?.assetClass||'EQUITY').toUpperCase(),
        brokerTarget:x?.brokerTarget||'Trade Republic',
        venueTarget:x?.venueTarget||null,
        brokerVerified:x?.brokerVerified===true,
        brokerVerificationSource:x?.brokerVerificationSource||null,
        brokerMatchMode:x?.brokerMatchMode||null,
        tradeRepublicName:x?.tradeRepublicName||null
      };
    });
    payload.brokerMetadataPreserved=true;
    payload.targetBroker='Trade Republic';
    return Response.json(payload,{status:response.status,headers:{'cache-control':'no-store'}});
  }catch{return response}
}

async function normalizeStartResponse(response){
  if(!response?.ok)return response;
  try{
    const payload=await response.clone().json();
    return Response.json({...payload,targetBroker:'Trade Republic',brokerCatalogPolicy:'Nur exakt im offiziellen Trade-Republic-Universum verifizierte Aktien duerfen neu gekauft werden.'},{status:response.status,headers:{'cache-control':'no-store'}});
  }catch{return response}
}

export default{
  async fetch(request,env,ctx){
    const u=new URL(request.url);
    const statusMethod=request.method==='GET'||request.method==='HEAD';
    if(statusMethod&&(u.pathname==='/api/status/lite'||(u.pathname==='/api/status'&&shouldServeAgentLite(request)))){
      try{return await liteStatusResponse(request,env)}catch(e){return Response.json({error:String(e?.message||e)},{status:500})}
    }
    const response=await core.fetch(request,env,ctx);
    if(u.pathname==='/api/agent/universe'&&request.method==='POST')return enrichAgentUniverse(response,env,request.url);
    if(u.pathname==='/api/start'&&request.method==='POST')return normalizeStartResponse(response);
    return response;
  },
  async scheduled(controller,env,ctx){return core.scheduled(controller,env,ctx)}
};
