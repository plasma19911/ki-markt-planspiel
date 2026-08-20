import base,{MarketPortfolio} from './index-v18.js';
export {MarketPortfolio};

// V28.5 UI bootstrap: quota-guard.js is already worker-first + no-store.
// Keep the production overlay event-driven; do not re-enable the old whole-page
// MutationObserver from V28.3.
const UI_BOOTSTRAP="\nimport('/v285-live-ui.js?v=20260820-1900').catch(e=>console.warn('V28.5 UI bootstrap failed',e));\n";

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