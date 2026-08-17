import {clamp,num,nowIso} from './constants.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0'};
const FEATURES=['emaGapPct','priceVsEma21Pct','rsi','mom5Pct','mom20Pct','dayPct','volatility20Pct'];
const REGIME_SYMBOLS=['SPY','QQQ','ACWI','^VIX'];

const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const std=a=>a.length<2?0:Math.sqrt(avg(a.map(x=>(x-avg(a))**2)));
const pct=(a,b)=>b?((a/b)-1)*100:0;
const arr=v=>Array.isArray(v)?v:[];

function ema(a,p){
 if(a.length<p)return null;
 const k=2/(p+1);let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p;
 for(const v of a.slice(p))e=v*k+e*(1-k);
 return e;
}
function rsi(a,p=14){
 if(a.length<p+1)return null;
 const s=a.slice(-(p+1));let gain=0,loss=0;
 for(let i=1;i<s.length;i++){const d=s[i]-s[i-1];if(d>0)gain+=d;else loss-=d}
 if(!loss)return 100;
 const rs=(gain/p)/(loss/p);return 100-100/(1+rs);
}
function parseSources(v){
 if(Array.isArray(v))return v;
 try{return JSON.parse(v||'[]')}catch{return[]}
}
async function assetJson(env,path){
 try{const r=await env.ASSETS.fetch(new Request(`https://assets.local/${path}`));return r.ok?await r.json():null}catch{return null}
}

async function dailySeries(symbols){
 const out=new Map(),wanted=[...new Set(symbols.filter(Boolean).map(x=>String(x).toUpperCase()))];
 if(!wanted.length)return out;
 for(let i=0;i<wanted.length;i+=20){
  const batch=wanted.slice(i,i+20);
  try{
   const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');
   u.searchParams.set('symbols',batch.join(','));u.searchParams.set('range','6mo');u.searchParams.set('interval','1d');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
   const r=await fetch(u,{headers:HEADERS});if(!r.ok)continue;const j=await r.json();
   for(const item of j?.spark?.result||[]){
    const res=item?.response?.[0];if(!res)continue;
    const sym=String(item.symbol||res?.meta?.symbol||'').toUpperCase();
    const closes=(res?.indicators?.quote?.[0]?.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number);
    if(!sym||closes.length<22)continue;
    out.set(sym,closes);
   }
  }catch{}
 }
 return out;
}

function stats(closes){
 const price=closes.at(-1),e9=ema(closes,9),e20=ema(closes,20),e21=ema(closes,21),e50=ema(closes,50),rr=rsi(closes,14);
 const rets=[];for(let i=Math.max(1,closes.length-20);i<closes.length;i++)rets.push((closes[i]/closes[i-1]-1)*100);
 const h20=Math.max(...closes.slice(-20)),h60=Math.max(...closes.slice(-60));
 return{
  price,ema9:e9,ema20:e20,ema21:e21,ema50:e50,rsi:rr,
  dayPct:closes.length>1?pct(price,closes.at(-2)):0,
  mom5Pct:closes.length>5?pct(price,closes.at(-6)):0,
  mom20Pct:closes.length>20?pct(price,closes.at(-21)):0,
  mom60Pct:closes.length>60?pct(price,closes.at(-61)):null,
  volatility20Pct:std(rets),volatilityAnnualizedPct:std(rets)*Math.sqrt(252),
  priceVsEma20Pct:e20?pct(price,e20):null,priceVsEma21Pct:e21?pct(price,e21):null,
  emaGapPct:e9&&e21?pct(e9,e21):null,distanceHigh20Pct:pct(price,h20),drawdownHigh60Pct:pct(price,h60)
 };
}

function applyLearning(d,m){
 if(!d||!m?.available)return{usable:false,expected3dPct:null,similarity:null};
 let pred=num(m.interceptPct),dist=0,n=0;
 for(const k of FEATURES){
  const sd=Math.max(1e-9,Math.abs(num(m.std?.[k],1))),z=(num(d[k])-num(m.mean?.[k]))/sd;
  pred+=z*num(m.coefficients?.[k]);
  const pm=m.perfectHindsightPreBuyProfile?.mean?.[k];
  if(Number.isFinite(Number(pm))){dist+=Math.abs((num(d[k])-num(pm))/sd);n++}
 }
 const v=m.validation||{},usable=num(v.correlation)>0.02&&num(v.topPredictedQuintileForward3Pct)>num(v.overallForward3Pct);
 return{usable,expected3dPct:clamp(pred,-20,20),similarity:n?clamp(1-(dist/n)/3,0,1):null};
}

function marketRegime(series){
 const parts=[];let score=0,count=0;
 for(const sym of ['SPY','QQQ','ACWI']){
  const c=series.get(sym);if(!c)continue;const d=stats(c);count++;
  const strong=d.ema20&&d.ema50&&d.price>d.ema20&&d.ema20>d.ema50&&d.mom20Pct>0;
  const weak=d.ema20&&d.ema50&&d.price<d.ema20&&d.ema20<d.ema50&&d.mom20Pct<0;
  if(strong){score++;parts.push(`${sym} Aufwärtstrend`)}else if(weak){score--;parts.push(`${sym} Abwärtstrend`)}else parts.push(`${sym} gemischt`);
 }
 const vixSeries=series.get('^VIX');const vix=vixSeries?.at(-1);
 if(Number.isFinite(vix)){if(vix>=30){score-=2;parts.push(`VIX ${vix.toFixed(1)} sehr hoch`)}else if(vix>=22){score--;parts.push(`VIX ${vix.toFixed(1)} erhöht`)}else if(vix<18){score++;parts.push(`VIX ${vix.toFixed(1)} ruhig`)}}
 const label=score>=2?'RISK_ON':score<=-2?'RISK_OFF':'NEUTRAL';
 return{label,score,components:parts,benchmarks:count,vix:Number.isFinite(vix)?vix:null,updatedAt:nowIso()};
}

function sizeLabel(cap){
 if(!(cap>0))return'–';if(cap>=1e12)return'Mega Cap';if(cap>=2e11)return'Sehr groß';if(cap>=1e10)return'Large Cap';return'Mid/Small Cap';
}

function dossierFor(c,d,learning,meta,news,regime){
 const positives=[],negatives=[],pillars=[];
 let quality=12;
 const conf=clamp(num(c.confidence),0,1),liveScore=num(c.score),newsScore=num(c.news_score),newsConf=clamp(num(news?.confidence,c.news_confidence||0),0,1);

 if(d){
  const trendStrong=d.ema20&&d.ema50&&d.price>d.ema20&&d.ema20>d.ema50;
  const trendWeak=d.ema20&&d.ema50&&d.price<d.ema20&&d.ema20<d.ema50;
  if(trendStrong){quality+=18;pillars.push('Mehrtagetrend');positives.push('Kurs über EMA20 und EMA20 über EMA50')}else if(trendWeak){quality-=14;negatives.push('Mehrtagetrend klar abwärts')}else positives.push('Mehrtagetrend gemischt');
  if(d.mom5Pct>0&&d.mom20Pct>0){quality+=14;pillars.push('Momentum');positives.push(`Momentum 5T ${d.mom5Pct.toFixed(1)}% / 20T ${d.mom20Pct.toFixed(1)}%`)}else if(d.mom20Pct<0){quality-=8;negatives.push(`20-Tage-Momentum ${d.mom20Pct.toFixed(1)}%`)}
 }else negatives.push('Keine ausreichende 6-Monats-Tageshistorie');

 if(liveScore>.5&&conf>=.55){quality+=18;pillars.push('Intraday');positives.push(`Live-Score ${liveScore.toFixed(2)} bei ${Math.round(conf*100)}% Signalkonfidenz`)}else if(liveScore<0){quality-=10;negatives.push(`Live-Signal negativ (${liveScore.toFixed(2)})`)}

 if(newsScore>=.12&&newsConf>=.45){quality+=16;pillars.push('News');positives.push(`News positiv (${newsScore.toFixed(2)}, ${Math.round(newsConf*100)}% Konfidenz)`)}else if(newsScore<=-.12){quality-=16;negatives.push(`News-Tendenz negativ (${newsScore.toFixed(2)})`)}

 if(learning.usable&&learning.expected3dPct!=null){
  if(learning.expected3dPct>.35){quality+=12;pillars.push('Historisches Kausalmodell');positives.push(`Historisches 3T-Modell +${learning.expected3dPct.toFixed(2)}%`)}
  else if(learning.expected3dPct<-.35){quality-=12;negatives.push(`Historisches 3T-Modell ${learning.expected3dPct.toFixed(2)}%`)}
 }

 const overheated=Boolean(d&&(num(d.rsi)>=72||num(d.priceVsEma20Pct)>=8||num(c.day_change)>=5));
 if(overheated){quality-=15;negatives.push('Kurzfristig überhitzt – Rücksetzer-Risiko erhöht')}
 if(d&&d.volatilityAnnualizedPct>65){quality-=9;negatives.push(`Hohe 20T-Volatilität ~${d.volatilityAnnualizedPct.toFixed(0)}% p.a.`)}
 if(String(c.event_risk||'').toUpperCase()==='HIGH'){quality-=8;negatives.push('Hohes Ereignisrisiko')}
 if(regime.label==='RISK_OFF'){quality-=6;negatives.push('Gesamtmarkt aktuell Risk-off')}else if(regime.label==='RISK_ON')quality+=4;
 quality=clamp(Math.round(quality),0,100);

 const vol=d?.volatilityAnnualizedPct??null;
 let riskLevel='MITTEL';
 if(overheated||num(vol)>60||String(c.event_risk||'').toUpperCase()==='HIGH')riskLevel='HOCH';
 else if(vol!=null&&vol<28&&newsScore>=-.1)riskLevel='NIEDRIGER';
 const rating=quality>=78?'STARKES MEHRFACHSIGNAL':quality>=62?'INTERESSANTES SETUP':quality>=45?'BEOBACHTEN':'ZURÜCKHALTEND';

 const invalidation=[];
 if(d?.ema20)invalidation.push(`Tagesschluss klar unter EMA20 (~${d.ema20.toFixed(2)})`);
 if(d?.mom20Pct>0)invalidation.push('20-Tage-Momentum dreht unter 0%');
 if(newsScore>0)invalidation.push('News-Tendenz dreht deutlich negativ');
 if(learning.usable&&num(learning.expected3dPct)>0)invalidation.push('historische Modellerwartung dreht negativ');
 if(!invalidation.length)invalidation.push('Live-Score und Mehrtagetrend verschlechtern sich gleichzeitig');

 const catalyst=String(c.event_text||'').trim()||String(news?.headline||'').trim()||'Kein klarer Einzel-Katalysator erkannt';
 const proText=String(c.pro||'').trim();if(proText)positives.push(...proText.split(' · ').slice(0,2));
 const contraText=String(c.contra||'').trim();if(contraText)negatives.push(...contraText.split(' · ').slice(0,2));
 const sources=parseSources(news?.sources);

 return{
  symbol:c.symbol,name:c.name||c.symbol,type:c.instrument_type,qualityScore:quality,rating,riskLevel,overheated,pillarCount:new Set(pillars).size,pillars:[...new Set(pillars)],
  live:{score:liveScore,confidence:conf,dayPct:num(c.day_change),newsScore,newsConfidence:newsConf,eventRisk:c.event_risk||'NONE'},
  technical:d?{rsi:d.rsi,mom5Pct:d.mom5Pct,mom20Pct:d.mom20Pct,mom60Pct:d.mom60Pct,ema20:d.ema20,ema50:d.ema50,priceVsEma20Pct:d.priceVsEma20Pct,volatilityAnnualizedPct:d.volatilityAnnualizedPct,distanceHigh20Pct:d.distanceHigh20Pct,drawdownHigh60Pct:d.drawdownHigh60Pct}:null,
  learning:{usable:learning.usable,expected3dPct:learning.expected3dPct,perfectSimilarity:learning.similarity},
  company:{marketCapUSD:num(meta?.marketCapUSD||meta?.marketCap),size:sizeLabel(num(meta?.marketCapUSD||meta?.marketCap)),avgVolume:num(meta?.avgVolume),region:meta?.region||'',exchange:meta?.exchange||'',currency:meta?.currency||c.currency||''},
  catalyst,positives:[...new Set(positives)].slice(0,6),negatives:[...new Set(negatives)].slice(0,6),invalidation:invalidation.slice(0,4),newsSources:sources.slice(0,5),latestHeadline:news?.headline||'',
  marketRegime:regime.label,updatedAt:nowIso()
 };
}

export async function buildInvestmentIntelligence(env,state,{limit=8}={}){
 const candidates=arr(state?.candidates).filter(x=>x?.symbol&&x.instrument_type!=='LEVERAGED_ETF'&&num(x.fresh,1)!==0).sort((a,b)=>(num(b.score)+num(b.confidence)*.8+num(b.news_score)*.15)-(num(a.score)+num(a.confidence)*.8+num(a.news_score)*.15)).slice(0,limit);
 const symbols=[...candidates.map(x=>x.symbol),...REGIME_SYMBOLS];
 const [series,analysis,universe]=await Promise.all([dailySeries(symbols),assetJson(env,'analysis-2026.json'),assetJson(env,'universe.json')]);
 const learningModel=analysis?.strategyLearning?.available?analysis.strategyLearning:null;
 const regime=marketRegime(series);
 const metaMap=new Map(arr(universe?.equities).map(x=>[String(x.symbol).toUpperCase(),x]));
 const newsMap=new Map(arr(state?.newsRadar).map(x=>[String(x.symbol).toUpperCase(),x]));
 const dossiers=candidates.map(c=>{
  const closes=series.get(String(c.symbol).toUpperCase()),d=closes?stats(closes):null,l=applyLearning(d,learningModel);
  return dossierFor(c,d,l,metaMap.get(String(c.symbol).toUpperCase()),newsMap.get(String(c.symbol).toUpperCase()),regime);
 }).sort((a,b)=>b.qualityScore-a.qualityScore);
 return{
  updatedAt:nowIso(),marketRegime:regime,dossiers,
  model:{available:Boolean(learningModel),version:learningModel?.modelVersion||null,sampleCount:num(learningModel?.sampleCount),validation:learningModel?.validation||null},
  notice:'Analysehilfe für eigene Entscheidungen: keine Gewinnwahrscheinlichkeit und keine Garantie. Historische Modellerwartung ist ein statistischer Rückblick und kann live falsch liegen.'
 };
}
