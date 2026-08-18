import {scanMarket as baseScanMarket} from './market-v3-base.js';
import {getSecondChanceRuntime} from './second-chance-runtime.js';

export {BENCHMARKS,marketOpen,newsTradingAgeHours,newsRecencyWeight,loadUniverse} from './market-v3-base.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0'};
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v||'').toUpperCase().trim();
const SECOND_CHANCE_RECHECK_MAX=2;

function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p;for(const v of a.slice(p))e=v*k+e*(1-k);return e}
function rsi(a,p=14){if(a.length<p+1)return null;let g=0,l=0,s=a.slice(-(p+1));for(let i=1;i<s.length;i++){const d=s[i]-s[i-1];d>0?g+=d:l-=d}if(!l)return 100;const rs=(g/p)/(l/p);return 100-100/(1+rs)}

async function fetchChart(symbol){
  let lastError='';
  for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
    try{
      const u=new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);u.searchParams.set('range','1d');u.searchParams.set('interval','1m');u.searchParams.set('includePrePost','false');
      const r=await fetch(u,{headers:HEADERS});if(!r.ok){lastError=`HTTP ${r.status}`;continue}
      const j=await r.json(),res=j?.chart?.result?.[0];if(res)return{res,error:null};lastError='Keine Chartdaten';
    }catch(e){lastError=String(e?.message||e)}
  }
  return{res:null,error:lastError||'Chart nicht verfügbar'};
}

async function secondChanceDeep(info,prior,fxFallback=1){
  const got=await fetchChart(info.symbol);if(!got.res)return{candidate:null,error:got.error};
  const res=got.res,q=res?.indicators?.quote?.[0]||{},rawClose=q.close||[],rawVol=q.volume||[],times=res.timestamp||[],cl=[],vol=[],validTimes=[];
  for(let i=0;i<rawClose.length;i++){
    const c=Number(rawClose[i]);if(!Number.isFinite(c)||c<=0)continue;cl.push(c);vol.push(Math.max(0,num(rawVol[i])));validTimes.push(num(times[i]));
  }
  if(cl.length<22)return{candidate:null,error:'Zu wenig frische Minuten'};
  const price=cl.at(-1),e9=ema(cl,9),e21=ema(cl,21),rr=rsi(cl),m5=(price/cl.at(-6)-1)*100,m20=(price/cl.at(-21)-1)*100,prev5=cl.length>=11?(cl.at(-6)/cl.at(-11)-1)*100:0,accel=m5-prev5,high20=Math.max(...cl.slice(-21,-1)),draw=high20?(price/high20-1)*100:0,pclose=num(res.meta?.previousClose,cl[0]),day=pclose?(price/pclose-1)*100:0,vbase=vol.slice(-21,-1).filter(x=>x>0),vavg=vbase.length?vbase.reduce((a,b)=>a+b,0)/vbase.length:0,vr=vavg?num(vol.at(-1))/vavg:1,last=validTimes.at(-1)||num(res.meta?.regularMarketTime),fresh=last>0&&(Date.now()/1000-last)<5*60;
  if(!fresh)return{candidate:null,error:'1m-Kurs nicht frisch'};

  let score=0,pro=[],contra=[];
  if(e9&&e21&&e9>e21){score+=1.7;pro.push('EMA9 über EMA21')}else{score-=1;contra.push('EMA-Trend schwach')}
  if(e21&&price>e21){score+=.8;pro.push('Kurs über EMA21')}else{score-=.6;contra.push('Kurs unter EMA21')}
  if(rr!==null){if(rr>=48&&rr<=68){score+=1;pro.push(`RSI ${rr.toFixed(0)} konstruktiv`)}else if(rr>=78){score-=1.5;contra.push(`RSI ${rr.toFixed(0)} überhitzt`)}else if(rr<=32){score-=.8;contra.push(`RSI ${rr.toFixed(0)} sehr schwach`)}}
  if(m5>.18){score+=.8;pro.push(`5m +${m5.toFixed(2)}%`)}else if(m5<-.25){score-=.9;contra.push(`5m ${m5.toFixed(2)}%`)}
  if(m20>.5){score+=1.2;pro.push(`20m +${m20.toFixed(2)}%`)}else if(m20<-.5){score-=1.2;contra.push(`20m ${m20.toFixed(2)}%`)}
  if(vr>1.5){score+=.7;pro.push(`Volumen x${vr.toFixed(1)}`)}if(day>1)score+=.4;if(day<-1)score-=.5;

  const trendUp=Boolean(e9&&e21&&e9>e21&&price>e21),breakoutScore=clamp(Math.max(0,m5)*1.6+Math.max(0,m20)*.8+Math.max(0,accel)*1.5+Math.max(0,vr-1)*.55+Math.max(0,draw+.25),0,10),confirmedBreakout=trendUp&&m5>.22&&m20>.55&&accel>.03&&vr>=1.2&&draw>=-.25&&(rr==null||rr<78);let momentumState='NORMAL',momentumSellSignal='NONE',exhaustion=0;
  if(confirmedBreakout){momentumState='BREAKOUT';score+=1.6;pro.push(`MOMENTUM-BREAKOUT ${breakoutScore.toFixed(1)}`)}else if(trendUp&&m5>.12&&m20>.35&&accel>0){momentumState='BUILDING';score+=.55;pro.push(`Momentum baut sich auf · Beschleunigung +${accel.toFixed(2)}%`)}
  const hadStrongRun=m20>.8||day>1.5||num(prior?.momentum_breakout_score)>1.7;if(hadStrongRun){if(rr!=null&&rr>=74)exhaustion+=.5;if(accel<-.2)exhaustion+=1;if(m5<0)exhaustion+=1;if(e9&&price<e9)exhaustion+=1;if(draw<-.6)exhaustion+=1;if(vr>1.5&&cl.length>=4&&(price/cl.at(-4)-1)<0)exhaustion+=.5}
  if(exhaustion>=3){momentumState='REVERSAL';momentumSellSignal='STRONG';score-=3;contra.push(`MOMENTUM-REVERSAL stark (${exhaustion.toFixed(1)})`)}else if(exhaustion>=1.75){momentumState='EXHAUSTION';momentumSellSignal='WATCH';score-=1.25;contra.push(`Momentum erschöpft (${exhaustion.toFixed(1)})`)}

  const technicalConfidence=clamp(.28+clamp(Math.abs(score)/10,0,.35)+clamp((vr-1)/4,0,.12),0,1),priorConf=clamp(num(prior?.confidence),0,1),confidence=clamp(technicalConfidence*.58+priorConf*.42+(trendUp?.06:0),0,1),eventRisk=String(prior?.event_risk||'NONE').toUpperCase();
  const stillUseful=score>=3.15&&confidence>=.55&&m20>-.20&&momentumState!=='REVERSAL'&&eventRisk!=='HIGH';if(!stillUseful)return{candidate:null,error:`Zweitcheck verworfen: Score ${score.toFixed(2)}, Konfidenz ${Math.round(confidence*100)}%`};

  return{candidate:{...info,type:'EQUITY',price,fxRate:num(prior?.fx_rate,fxFallback),score,confidence,dayChange:day,momentum5:m5,momentum20:m20,momentumAcceleration5:accel,momentumState,momentumBreakoutScore:breakoutScore,momentumExhaustionScore:exhaustion,momentumSellSignal,drawdownFrom20mHighPct:draw,rsi:rr,volumeRatio:vr,newsScore:num(prior?.news_score),newsConfidence:.35,newsSources:[],fresh:true,eventRisk,eventText:String(prior?.event_text||''),pro,contra,reasons:[...pro,...contra],headlines:[],secondChanceRecheck:true,secondChancePreviousScore:num(prior?.score),secondChancePreviousConfidence:priorConf},error:null};
}

export async function scanMarket(env,cfg,heldSymbols=[]){
  const result=await baseScanMarket(env,cfg,heldSymbols);if(result?.marketState?.mode==='NEWS_ONLY')return result;
  const watch=getSecondChanceRuntime(),existing=new Set((result?.candidates||[]).map(x=>key(x?.symbol))),universe=new Map((result?.universe||[]).map(x=>[key(x?.symbol),x])),missing=watch.filter(x=>!existing.has(key(x?.symbol))&&universe.has(key(x?.symbol))).slice(0,SECOND_CHANCE_RECHECK_MAX);
  if(!missing.length)return{...result,secondChanceRechecked:0,secondChanceRecovered:0};
  let recovered=0,failed=0,lastError='',candidates=[...(result.candidates||[])];
  const checked=await Promise.all(missing.map(async w=>{const info=universe.get(key(w.symbol)),sameCurrency=candidates.find(c=>String(c?.currency||'')===String(info?.currency||'')&&num(c?.fxRate)>0),fx=num(w?.fx_rate,num(sameCurrency?.fxRate,1));return secondChanceDeep(info,w,fx)}));
  for(const x of checked){if(x?.candidate){candidates.push(x.candidate);recovered++}else{failed++;lastError=x?.error||lastError}}
  candidates.sort((a,b)=>num(b?.score)-num(a?.score));
  const health={...(result.health||{}),'Second-Chance 1m':{status:recovered>0?'OK':failed>0?'DEGRADED':'OK',okCount:recovered,failCount:failed,lastError:lastError||'',latencyMs:null}};
  return{...result,candidates,health,secondChanceRechecked:missing.length,secondChanceRecovered:recovered,secondChanceRecheckMax:SECOND_CHANCE_RECHECK_MAX};
}
