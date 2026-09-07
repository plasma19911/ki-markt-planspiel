import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateNewsEventFromBars,regionalBenchmarkForSymbol,updateNewsLearning} from '../src/news-learning.js';

const portfolioIntegration=readFileSync(new URL('../src/compact-portfolio-v2.js',import.meta.url),'utf8');
const workerCore=readFileSync(new URL('../src/index-core.js',import.meta.url),'utf8');
const workerCron=readFileSync(new URL('../src/index-v20.js',import.meta.url),'utf8');
const pcAgent=readFileSync(new URL('../public/pc-agent-latest.ps1',import.meta.url),'utf8');
assert.match(portfolioIntegration,/learningVersion>=3/,'an older learning state must bypass the cooldown once for immediate migration');
assert.match(portfolioIntegration,/refreshNewsLearning\(options=/,'news learning must expose a dedicated Durable Object operation');
assert.doesNotMatch(portfolioIntegration,/await this\._refreshNewsLearning\(false\)/,'the normal market scan must not spend the news-learning quote budget');
assert.match(workerCore,/api\/agent\/news-learning/,'the PC agent must have a dedicated authenticated news-learning endpoint');
assert.match(workerCron,/refreshNewsLearning\(\{source:'ONLINE_PC_CRON'\}\)/,'the online cron must start news learning as a separate request');
assert.match(pcAgent,/api\/agent\/news-learning/,'the PC agent must trigger learning separately after its scan');

assert.equal(regionalBenchmarkForSymbol('SAP.DE'),'EXSA.DE');
assert.equal(regionalBenchmarkForSymbol('COCHINSHIP.NS'),'^NSEI');
assert.equal(regionalBenchmarkForSymbol('0700.HK'),'2800.HK');
assert.equal(regionalBenchmarkForSymbol('ORCL'),'ACWI');

const start=Date.UTC(2026,8,7,8,0,0)/1000;
const bars=prices=>prices.map((price,index)=>({ts:start+index*300,price}));

{
  const event={symbol:'SAP.DE',newsAt:new Date((start+120)*1000).toISOString(),direction:1,benchmark:'EXSA.DE',results:{}};
  const result=evaluateNewsEventFromBars(event,bars([100,100.10,100.42,100.55,100.62]),bars([100,100.02,100.05,100.08,100.10]));
  assert.equal(result.baselineMethod,'PRE_NEWS_5M_CLOSE');
  assert.equal(result.reactionDelayMinutes,10,'directional abnormal move must record its first 5-minute bucket');
  assert.ok(result.results['15m'].alignedAbnormalPct>.4);
  assert.equal(result.results['15m'].benchmark,'EXSA.DE');
}

{
  const oldFetch=globalThis.fetch,hosts=[];
  globalThis.fetch=async url=>{
    const parsed=new URL(url),host=parsed.host,symbols=String(parsed.searchParams.get('symbols')||'').split(',').filter(Boolean);hosts.push(host);
    if(host==='query1.finance.yahoo.com')return{ok:false,status:429,json:async()=>({})};
    return{ok:true,status:200,json:async()=>({spark:{result:symbols.map(symbol=>({symbol,response:[{meta:{symbol},timestamp:[start,start+300,start+600,start+900,start+1200],indicators:{quote:[{close:symbol==='SAP.DE'?[100,100.1,100.5,100.7,100.8]:[100,100.01,100.02,100.03,100.04]}]}}]}))}})};
  };
  try{
    const state={newsLearning:{version:3,events:[{id:'SAP-FALLBACK',symbol:'SAP.DE',newsAt:new Date((start+120)*1000).toISOString(),direction:1,benchmark:'EXSA.DE',results:{}}]},newsRadar:[]};
    await updateNewsLearning(state);
    assert.deepEqual(hosts.slice(0,2),['query1.finance.yahoo.com','query2.finance.yahoo.com'],'the secondary quote host must be used only after the primary host fails');
    assert.equal(state.newsLearning.summary.lastEvaluationProvider,'query2.finance.yahoo.com');
    assert.ok(state.newsLearning.summary.lastEvaluationQuoteCount>=2,'the fallback must recover stock and regional benchmark bars');
    assert.equal(state.newsLearning.summary.lastEvaluationError,null,'a successful fallback must clear the visible provider error');
    assert.equal(state.newsLearning.summary.evaluatedEvents,1,'recovered bars must produce an evaluated news sample');
  }finally{globalThis.fetch=oldFetch}
}

{
  const event={symbol:'COCHINSHIP.NS',newsAt:new Date((start+120)*1000).toISOString(),direction:-1,benchmark:'^NSEI',results:{}};
  const result=evaluateNewsEventFromBars(event,bars([200,199.8,199.1,198.8,198.6]),bars([100,100.01,100.02,100.03,100.04]));
  assert.equal(result.reactionDelayMinutes,10,'negative news followed by a drop is a directionally aligned reaction');
  assert.ok(result.results['15m'].alignedAbnormalPct>0);
}

{
  const oldFetch=globalThis.fetch,requested=[];
  globalThis.fetch=async url=>{const parsed=new URL(url),symbols=String(parsed.searchParams.get('symbols')||'').split(',').filter(Boolean);requested.push(...symbols);return{ok:true,json:async()=>({spark:{result:symbols.map(symbol=>({symbol,response:[{meta:{symbol},timestamp:[start,start+300,start+600,start+900,start+1200],indicators:{quote:[{close:[100,100.1,100.2,100.3,100.4]}]}}]}))}})}};
  try{
    const events=Array.from({length:30},(_,index)=>({id:`OLD${index}`,symbol:`OLD${index}`,newsAt:new Date((start+120)*1000).toISOString(),direction:1,baselinePrice:88,baselineBenchmark:77,results:{'1h':{alignedAbnormalPct:1}}}));
    const state={newsLearning:{version:1,events},newsRadar:[]};
    await updateNewsLearning(state);
    assert.equal(state.newsLearning.version,3);
    assert.equal(state.newsLearning.lastEvaluationBatchSize,24,'one learning pass must stay within its fixed Worker budget');
    assert.ok(requested.filter(symbol=>/^OLD\d+$/.test(symbol)).length<=24,'the Worker must not refetch the whole learning memory at once');
    assert.equal(state.newsLearning.events[0].baselinePrice,100,'legacy ACWI baselines must be rebuilt from regional 5-minute bars');
    assert.equal(state.newsLearning.summary.reactionLag.directionalSamples,0,'missing reaction delays must not be counted as zero-minute reactions');
  }finally{globalThis.fetch=oldFetch}
}

console.log('regional intraday news learning tests passed');
