import assert from 'node:assert/strict';

const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({chart:{result:[{meta:{regularMarketPrice:101,previousClose:null},timestamp:[1,2,3,4],indicators:{quote:[{open:[100,null,101,102],high:[101,null,102,103],low:[99,null,100,101],close:[100,null,101,102],volume:[10,0,12,11]}]}}],error:null}}),{status:200,headers:{'content-type':'application/json'}});

const mod=await import(`../src/yahoo-spark-repair.js?smoke=${Date.now()}`);
const r=await globalThis.fetch('https://query1.finance.yahoo.com/v8/finance/chart/TEST.DE');
assert.equal(r.status,200);
const j=await r.json(),res=j.chart.result[0],close=res.indicators.quote[0].close;
assert.equal(close[0],100);
assert.equal(Number.isFinite(Number(close[1])),false,'Yahoo null darf nach Sanity niemals als Number(null)=0 durchgehen');
assert.equal(Number.isFinite(Number(res.meta.previousClose)),false,'Fehlender previousClose darf nicht zu 0 werden');
assert.ok(Number(r.headers.get('x-ki-yahoo-price-sanitized'))>=5,'Null-Preisfelder müssen sichtbar sanitisiert werden');
const stats=mod.yahooSparkRepairStats();
assert.ok(stats.sanitizedPriceFields>=5);

globalThis.fetch=originalFetch;
console.log(JSON.stringify({ok:true,nullPricesCannotBecomeZero:true,sanitized:stats.sanitizedPriceFields},null,2));
