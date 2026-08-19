import fs from 'node:fs';

const r2=fs.readFileSync('src/r2-portfolio.js','utf8');
const market=fs.readFileSync('src/market-v3-base.js','utf8');
const fail=[];

if(r2.includes("why=`Momentum-Risk-Exit:")) fail.push('direct momentum SELL bypass returned');
if(r2.includes('Signal-Fallback wegen nicht verfügbarer KI')) fail.push('AI-failure score SELL bypass returned');
if(r2.includes('stärkstes verfügbares Fallback-Signal')) fail.push('AI-failure forced BUY returned');
if(!r2.includes("const hardEvent=String(q.eventRisk||q.event_risk||'NONE').toUpperCase()==='HIGH'")) fail.push('hard-event immediate exit missing');
if(!r2.includes('kein unvalidierter Ersatzkauf; Cash bleibt frei')) fail.push('AI-failure cash hold missing');
if(r2.includes('globalThis.fetch=async')) fail.push('request-global fetch mutation returned');
if(!r2.includes('disable_google_news:1')) fail.push('request-local Google News disable flag missing');
if(!market.includes('newsPriorityTargets(deep,NEWS_LIMIT)')) fail.push('shock-priority Yahoo news targeting missing');
if(!market.includes('newsPriorityTargets(deep,2)')) fail.push('shock-priority enhanced news targeting missing');
if(!market.includes('newsSearchName(c)')) fail.push('legal-name-safe news query missing');
if(!market.includes('cfg?.disable_google_news?[]')) fail.push('Google News disable flag is not honored by market scan');

if(fail.length){
  console.error(fail.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  ok:true,
  directMomentumSellBypass:false,
  aiFailureScoreSellBypass:false,
  aiFailureForcedBuy:false,
  hardEventExit:true,
  requestGlobalFetchMutation:false,
  requestLocalGoogleNewsDisable:true,
  shockNewsPriority:true,
  legalNameNewsQuery:true
},null,2));
