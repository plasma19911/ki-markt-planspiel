import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateNewsEventFromBars,regionalBenchmarkForSymbol,updateNewsLearning} from '../src/news-learning.js';

const portfolioIntegration=readFileSync(new URL('../src/compact-portfolio-v2.js',import.meta.url),'utf8');
assert.match(portfolioIntegration,/learningVersion>=3/,'an older learning state must bypass the cooldown once for immediate migration');

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
