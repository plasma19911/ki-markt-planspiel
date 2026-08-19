// Final outer pacing layer for Yahoo chart traffic. The inner Yahoo repair already
// caches/deduplicates/retries; this wrapper prevents independent scanner components
// from hitting that inner layer in a burst at the same instant.
const INSTALL_KEY='__kiYahooChartSerialV1';
if(!globalThis[INSTALL_KEY]){
 globalThis[INSTALL_KEY]=true;
 const nativeFetch=globalThis.fetch.bind(globalThis),queue=[];let active=false,lastStart=0;
 const textUrl=input=>{try{return typeof input==='string'||input instanceof URL?String(input):String(input?.url||'')}catch{return''}};
 const isChart=input=>{try{const u=new URL(textUrl(input));return u.hostname.endsWith('finance.yahoo.com')&&u.pathname.startsWith('/v8/finance/chart/')}catch{return false}};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function pump(){if(active||!queue.length)return;active=true;while(queue.length){const x=queue.shift();try{const wait=Math.max(0,180-(Date.now()-lastStart));if(wait)await sleep(wait);lastStart=Date.now();x.resolve(await nativeFetch(x.input,x.init))}catch(e){x.reject(e)}}active=false}
 globalThis.fetch=function yahooChartSerialFetch(input,init){if(!isChart(input))return nativeFetch(input,init);return new Promise((resolve,reject)=>{queue.push({input,init,resolve,reject});pump()})};
}
