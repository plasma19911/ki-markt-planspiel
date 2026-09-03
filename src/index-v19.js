import base,{MarketPortfolio} from './index-v18.js';
export {MarketPortfolio};

// UI bootstrap: quota-guard.js is worker-first + no-store.
// Keep the calibrated score UI and add V31.7.12 universal stock/news interactions.
const UI_BOOTSTRAP="\nimport('/v287-live-ui.js?v=20260820-1945').catch(e=>console.warn('V28.7 UI bootstrap failed',e));\nimport('/clickable-market-ui-v31712.js?v=20260903-1745').catch(e=>console.warn('V31.7.12 clickable market UI failed',e));\n";

function noStore(response){
 const h=new Headers(response.headers);h.set('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');h.set('Pragma','no-cache');h.set('Expires','0');
 return h;
}

export default{
 async fetch(request,env,ctx){
  const response=await base.fetch(request,env,ctx),url=new URL(request.url);
  if(url.pathname==='/quota-guard.js'){
   const text=await response.text();
   return new Response(text+UI_BOOTSTRAP,{status:response.status,statusText:response.statusText,headers:noStore(response)});
  }
  return response;
 },
 async scheduled(controller,env,ctx){return base.scheduled?.(controller,env,ctx)}
};
