import fs from 'node:fs';

const r2=fs.readFileSync('src/r2-portfolio.js','utf8');
const market=fs.readFileSync('src/market-v3-base.js','utf8');
const fail=[];

if(r2.includes("why=`Momentum-Risk-Exit:")) fail.push('direct momentum SELL bypass returned');
if(r2.includes('Signal-Fallback wegen nicht verfügbarer KI')) fail.push('AI-failure score SELL bypass returned');
if(r2.includes('stärkstes verfügbares Fallback-Signal')) fail.push('AI-failure forced BUY returned');
if(!r2.includes("const hardEvent=String(q.eventRisk||q.event_risk||'NONE').toUpperCase()==='HIGH'")) fail.push('hard-event immediate exit missing');
if(!r2.includes('kein unvalidierter Ersatzkauf; Cash bleibt frei')) fail.push('AI-failure cash hold missing');
if(!market.includes('newsPriorityTargets(deep,NEWS_LIMIT)')) fail.push('shock-priority Yahoo news targeting missing');
if(!market.includes('newsPriorityTargets(deep,2)')) fail.push('shock-priority enhanced news targeting missing');
if(!market.includes('newsSearchName(c)')) fail.push('legal-name-safe news query missing');

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
  shockNewsPriority:true,
  legalNameNewsQuery:true
},null,2));
