// Einmaliger Bootstrap-Trigger am 20.08.2026; regulaer laeuft dieser Scorer nur im Tagesworkflow.
import fs from 'node:fs';
import {chartProfileFromChart,composeAgmBaseScore,scoreHeadlines,AGM_SIGNAL_VERSION} from '../src/agm-signal-model.js';

const FILE='public/agm-calendar.json';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
const events=Array.isArray(data?.events)?data.events:[];
const evaluatedAt=new Date().toISOString();

const label=s=>s>=82?'SEHR POSITIV':s>=72?'POSITIV':s>=58?'LEICHT POSITIV':s>=43?'NEUTRAL':s>=30?'VORSICHT':'NEGATIV';

async function chartProfile(symbol){
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
  try{
   const u=new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);
   u.searchParams.set('range','1y');u.searchParams.set('interval','1d');
   const r=await fetch(u,{headers:{'user-agent':UA,'accept':'application/json'}});
   if(!r.ok)continue;
   const p=chartProfileFromChart(await r.json());if(p)return p;
  }catch{}
 }
 return null;
}

async function newsProfile(event){
 const query=String(event?.name||event?.sourceCompanyName||event?.symbol||'').trim();
 if(!query)return scoreHeadlines([]);
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
  try{
   const u=new URL(`https://${host}/v1/finance/search`);
   u.searchParams.set('q',query);u.searchParams.set('newsCount','10');u.searchParams.set('quotesCount','0');
   const r=await fetch(u,{headers:{'user-agent':UA,'accept':'application/json'}});
   if(!r.ok)continue;
   const j=await r.json(),rows=Array.isArray(j?.news)?j.news:[];
   return scoreHeadlines(rows.map(x=>({title:x?.title,published:x?.providerPublishTime?new Date(x.providerPublishTime*1000).toISOString():null})));
  }catch{}
 }
 return scoreHeadlines([]);
}

function fundamentalFromEvent(e={}){
 const confidence=Number(e?.fundamentalConfidence)||0;
 const hasNumbers=Boolean(e?.fundamentals)||confidence>=.30||Array.isArray(e?.fundamentalReasons)&&e.fundamentalReasons.length>0;
 if(!hasNumbers)return null;
 return{
  fundamentalScore:Number.isFinite(Number(e?.fundamentalScore))?Number(e.fundamentalScore):Number(e?.baseScore)||50,
  fundamentalConfidence:confidence,
  profitForecastPositive:e?.profitForecastPositive??null,
  fundamentalReasons:Array.isArray(e?.fundamentalReasons)?e.fundamentalReasons:[],
  fundamentals:e?.fundamentals||null
 };
}

let chartProfileCount=0,newsProfileCount=0,neutralScoreCount=0,signalCoveredCount=0;
const output=[];
for(let i=0;i<events.length;i+=5){
 const part=events.slice(i,i+5);
 const [charts,newsRows]=await Promise.all([
  Promise.all(part.map(x=>chartProfile(x.symbol).catch(()=>null))),
  Promise.all(part.map(x=>newsProfile(x).catch(()=>scoreHeadlines([]))))
 ]);
 for(let j=0;j<part.length;j++){
  const e=part[j],chart=charts[j],news=newsRows[j],fundamental=fundamentalFromEvent(e);
  if(chart)chartProfileCount++;if(news?.count)newsProfileCount++;
  const composed=composeAgmBaseScore({fundamental,chart,news});
  if(composed.baseScore===50)neutralScoreCount++;
  if(composed.dataQuality.zahlen||composed.dataQuality.chart||composed.dataQuality.news)signalCoveredCount++;
  output.push({...e,...composed,chart,baseLabel:label(composed.baseScore),scoreEvaluatedAt:evaluatedAt,scoreValidUntil:new Date(Date.parse(evaluatedAt)+24*3600000).toISOString()});
 }
}

data.modelVersion=27.6;
data.scoreModelVersion=AGM_SIGNAL_VERSION;
data.scoreEvaluationCadence='daily';
data.scoreReevaluation='once daily only';
data.updatedAt=evaluatedAt;
data.nextRefreshAfter=new Date(Date.parse(evaluatedAt)+24*3600000).toISOString();
data.source='finanzen.net HV-Termine + finanzen.net Schätzungen + Yahoo Chart/News';
data.scoreMeaning='0-100 interner Vorab-Chancen-Score aus ZAHLEN + CHART + NEWS; keine Gewinnwahrscheinlichkeit';
data.chartProfileCount=chartProfileCount;
data.newsProfileCount=newsProfileCount;
data.neutralScoreCount=neutralScoreCount;
data.signalCoveredCount=signalCoveredCount;
data.events=output;
fs.writeFileSync(FILE,JSON.stringify(data,null,2)+'\n');
const scores=output.map(x=>Number(x.baseScore)).filter(Number.isFinite);
console.log(JSON.stringify({ok:true,evaluatedAt,events:output.length,chartProfileCount,newsProfileCount,signalCoveredCount,scoreSpread:scores.length?[Math.min(...scores),Math.max(...scores)]:[]},null,2));
