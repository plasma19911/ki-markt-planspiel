import base,{MarketPortfolio} from './index-v18.js';
export {MarketPortfolio};

// V28.6 UI bootstrap: quota-guard.js is worker-first + no-store.
// One event-driven score renderer replaces the old V28.3/V28.5 parallel renderers.
const UI_BOOTSTRAP="\nimport('/v286-live-ui.js?v=20260820-1925').catch(e=>console.warn('V28.6 UI bootstrap failed',e));\n";

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