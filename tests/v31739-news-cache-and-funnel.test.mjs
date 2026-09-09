import assert from 'node:assert/strict';
import fs from 'node:fs';
import {captureNewsLearningQuoteCache,updateNewsLearning} from '../src/news-learning.js';

const now=Date.now(),base=Math.floor((now-7*3600000)/1000),bars=Array.from({length:85},(_,i)=>({slot:base+i*300,ts:base+i*300,price:100+i*.05}));
const state={newsRadar:[{symbol:'CACHE.DE',headline:'CACHE receives major contract',news_at:new Date((base+300)*1000).toISOString(),news_score:1,sources:['Test']}],newsLearningQuoteCache:{'CACHE.DE':bars,'EXSA.DE':bars.map(x=>({...x,price:200+(x.ts-base)/300*.02}))}};
const oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('network must not be used when scanner cache is complete')};
try{const learned=await updateNewsLearning(state);assert.equal(calls,0);assert.equal(learned.summary.lastEvaluationProvider,'SCANNER_CACHE');assert.ok(learned.summary.lastEvaluationCacheHits>=2);assert.equal(learned.summary.lastEvaluationNetworkSymbols,0);assert.ok(learned.summary.evaluatedEvents>=1)}finally{globalThis.fetch=oldFetch}
const aliasState={};captureNewsLearningQuoteCache(aliasState,[{symbol:'PC.DE',last:42.5,observedAt:new Date().toISOString()},{symbol:'HELD.DE',last_price:17,last_quote_at:new Date().toISOString()}]);assert.equal(aliasState.newsLearningQuoteCache['PC.DE'].at(-1).price,42.5);assert.equal(aliasState.newsLearningQuoteCache['HELD.DE'].at(-1).price,17);
const marketSource=fs.readFileSync(new URL('../src/market-v3-base.js',import.meta.url),'utf8'),portfolioSource=fs.readFileSync(new URL('../src/compact-portfolio-v2.js',import.meta.url),'utf8');assert.match(marketSource,/deepRejected/);assert.match(marketSource,/newsLearningQuotes/);assert.match(portfolioSource,/newsQuoteCacheFreshSymbols/);assert.match(portfolioSource,/s\.scanFunnel=scanFunnel/);
console.log('V31.7.39 news scanner-cache regression passed');
