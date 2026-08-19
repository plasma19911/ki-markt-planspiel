import {scanMarket as baseScanMarket} from './market-v3-base.js';
import {getSecondChanceRuntime} from './second-chance-runtime.js';

export {BENCHMARKS,marketOpen,newsTradingAgeHours,newsRecencyWeight,loadUniverse} from './market-v3-base.js';

const HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0'};
const RECHECK_MAX=6;
const FORESIGHT_RECHECK_MAX=8;
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v||'').toUpperCase().trim();
const blockedVenueSymbol=s=>/\.(?:V|CN|NE|PK|OB)$/i.test(key(s));
function ema(a,p){if(a.length<p)return null;const k=2/(p+1);let e=a.slice(0,p).reduce((x,y)=>x+y,0)/p;for(const v of a.slice(p))e=v*k+e*(1-k);return e}
function rsi(a,p=14){if(a.length<p+1)return null;let g=0,l=0,s=a.slice(-(p+1));for(let i=1;i<s.length;i++){const d=s[i]-s[i-1];d>0?g+=d:l-=d}if(!l)return 100;const rs=(g/p)/(l/p);return 100-100/(1+rs)}

function venueSafeEnv(env){
 const assets=env?.ASSETS;if(!assets?.fetch)return env;
 const safeAssets={fetch:async(request,init)=>{const r=await assets.fetch(request,init);let u;try{u=new URL(typeof request==='string'?request:request.url)}catch{return r}if(!u.pathname.endsWith('/universe.json')||!r.ok)return r;let data;try{data=await r.json()}catch{return r}const before=Array.isArray(data?.equities)?data.equities:[],equities=before.filter(x=>!blockedVenueSymbol(x?.symbol));return Response.json({...data,equities,target_venue_prefilter_removed:before.length-equities.length,scanner_slice_equity_count:equities.length},{headers:{'cache-control':'no-store'}})}};
 return{...env,ASSETS:safeAssets};
}

async function chart(symbol){
 let error='';
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
  try{const u=new URL(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}`);u.searchParams.set('range','1d');u.searchParams.set('interval','1m');u.searchParams.set('includePrePost','false');const r=await fetch(u,{headers:HEADERS});if(!r.ok){error=`HTTP ${r.status}`;continue}const j=await r.json(),x=j?.chart?.result?.[0];if(x)return{x,error:null};error='Keine Chartdaten'}catch(e){error=String(e?.message||e)}
 }
 return{x:null,error:error||'Chart nicht verfügbar'};
}
function barsFrom(res){
 const q=res?.indicators?.quote?.[0]||{},times=res?.timestamp||[],cl=[],vol=[],ts=[];
 for(let i=0;i<(q.close||[]).length;i++){const c=Number(q.close[i]);if(!Number.isFinite(c)||c<=0)continue;cl.push(c);vol.push(Math.max(0,num(q.volume?.[i])));ts.push(num(times[i]))}
 return{cl,vol,ts};
}

async function recheck(info,prior,fxFallback){
 const got=await chart(info.symbol);if(!got.x)return{candidate:null,error:got.error};
 const res=got.x,{cl,vol,ts}=barsFrom(res);if(cl.length<22)return{candidate:null,error:'Zu wenig Minuten'};
 const price=cl.at(-1),last=ts.at(-1)||num(res.meta?.regularMarketTime);if(!(last>0&&(Date.now()/1000-last)<5*60))return{candidate:null,error:'1m-Kurs nicht frisch'};
 const e9=ema(cl,9),e21=ema(cl,21),rr=rsi(cl),m5=(price/cl.at(-6)-1)*100,m20=(price/cl.at(-21)-1)*100,prev5=(cl.at(-6)/cl.at(-11)-1)*100,accel=m5-prev5,high20=Math.max(...cl.slice(-21,-1)),draw=high20?(price/high20-1)*100:0,pclose=num(res.meta?.previousClose,cl[0]),day=pclose?(price/pclose-1)*100:0,vb=vol.slice(-21,-1).filter(x=>x>0),va=vb.length?vb.reduce((a,b)=>a+b,0)/vb.length:0,vr=va?num(vol.at(-1))/va:1;
 let score=0,pro=[],contra=[];const trendUp=Boolean(e9&&e21&&e9>e21&&price>e21);if(e9&&e21&&e9>e21){score+=1.7;pro.push('EMA9 über EMA21')}else{score-=1;contra.push('EMA-Trend schwach')}if(e21&&price>e21){score+=.8;pro.push('Kurs über EMA21')}else{score-=.6;contra.push('Kurs unter EMA21')}if(rr!==null){if(rr>=48&&rr<=68){score+=1;pro.push(`RSI ${rr.toFixed(0)} konstruktiv`)}else if(rr>=78){score-=1.5;contra.push(`RSI ${rr.toFixed(0)} überhitzt`)}}if(m5>.18){score+=.8;pro.push(`5m +${m5.toFixed(2)}%`)}else if(m5<-.25){score-=.9;contra.push(`5m ${m5.toFixed(2)}%`)}if(m20>.5){score+=1.2;pro.push(`20m +${m20.toFixed(2)}%`)}else if(m20<-.5){score-=1.2;contra.push(`20m ${m20.toFixed(2)}%`)}if(vr>1.5){score+=.7;pro.push(`Volumen x${vr.toFixed(1)}`)}if(day>1)score+=.4;if(day<-1)score-=.5;
 const breakoutScore=clamp(Math.max(0,m5)*1.6+Math.max(0,m20)*.8+Math.max(0,accel)*1.5+Math.max(0,vr-1)*.55+Math.max(0,draw+.25),0,10),breakout=trendUp&&m5>.22&&m20>.55&&accel>.03&&vr>=1.2&&draw>=-.25&&(rr==null||rr<78);let state='NORMAL',sell='NONE',exhaust=0;if(breakout){state='BREAKOUT';score+=1.6;pro.push(`MOMENTUM-BREAKOUT ${breakoutScore.toFixed(1)}`)}else if(trendUp&&m5>.12&&m20>.35&&accel>0){state='BUILDING';score+=.55;pro.push(`Momentum baut sich auf +${accel.toFixed(2)}%`)}if(m20>.8||day>1.5||num(prior?.momentum_breakout_score)>1.7){if(rr!=null&&rr>=74)exhaust+=.5;if(accel<-.2)exhaust+=1;if(m5<0)exhaust+=1;if(e9&&price<e9)exhaust+=1;if(draw<-.6)exhaust+=1}if(exhaust>=3){state='REVERSAL';sell='STRONG';score-=3}else if(exhaust>=1.75){state='EXHAUSTION';sell='WATCH';score-=1.25}
 const technical=clamp(.28+clamp(Math.abs(score)/10,0,.35)+clamp((vr-1)/4,0,.12),0,1),priorConf=clamp(num(prior?.confidence),0,1),trendBonus=trendUp?0.06:0,confidence=clamp(technical*.58+priorConf*.42+trendBonus,0,1),eventRisk=String(prior?.event_risk||'NONE').toUpperCase();if(score<3.15||confidence<.55||m20<=-.20||state==='REVERSAL'||eventRisk==='HIGH')return{candidate:null,error:`Zweitcheck verworfen: Score ${score.toFixed(2)}, Konfidenz ${Math.round(confidence*100)}%`};
 return{candidate:{...info,type:'EQUITY',price,fxRate:num(prior?.fx_rate,fxFallback),score,confidence,dayChange:day,momentum5:m5,momentum20:m20,momentumAcceleration5:accel,momentumState:state,momentumBreakoutScore:breakoutScore,momentumExhaustionScore:exhaust,momentumSellSignal:sell,drawdownFrom20mHighPct:draw,rsi:rr,volumeRatio:vr,newsScore:num(prior?.news_score),newsConfidence:.35,newsSources:[],fresh:true,eventRisk,eventText:String(prior?.event_text||''),pro,contra,reasons:[...pro,...contra],headlines:[],secondChanceRecheck:true},error:null};
}

function foresightRank(x={}){
 const day=num(x.pcWideSessionPct),m5=num(x.pcWideM5Pct),m20=num(x.pcWideM20Pct),accel=num(x.pcWideAccelerationPct),wide=num(x.pcWideScore),rebound=Boolean(x.reboundWatch);
 const dipBand=day<=-.35&&day>=-9?2.4:(day<=.4?.7:0),brake=clamp(accel*18,0,2.5),short=m5>=-.8&&m5<=.18?1.1:0,medium=m20>=-3&&m20<=.25?.8:0;
 return dipBand+brake+short+medium+(rebound?1.2:0)+clamp(wide,0,8)*.04;
}
async function overlayForesightPool(env,existing){
 try{
  const r=await env?.ASSETS?.fetch?.(new Request('https://assets.local/universe.json'));if(!r?.ok)return[];const j=await r.json(),rows=Array.isArray(j?.equities)?j.equities:[];
  return rows.filter(x=>x?.symbol&&!existing.has(key(x.symbol))&&!blockedVenueSymbol(x.symbol)&&(x.pcWideSweep||x.reboundWatch)).map(x=>({...x,_foresightRank:foresightRank(x)})).sort((a,b)=>b._foresightRank-a._foresightRank).slice(0,FORESIGHT_RECHECK_MAX);
 }catch{return[]}
}
async function recheckForesight(info,fxFallback=1){
 const got=await chart(info.symbol);if(!got.x)return{candidate:null,error:got.error};const res=got.x,{cl,vol,ts}=barsFrom(res);if(cl.length<22)return{candidate:null,error:'Zu wenig Minuten'};
 const price=cl.at(-1),last=ts.at(-1)||num(res.meta?.regularMarketTime);if(!(last>0&&(Date.now()/1000-last)<5*60))return{candidate:null,error:'1m-Kurs nicht frisch'};
 const e9=ema(cl,9),e21=ema(cl,21),rr=rsi(cl),m5=(price/cl.at(-6)-1)*100,m20=(price/cl.at(-21)-1)*100,prev5=(cl.at(-6)/cl.at(-11)-1)*100,accel=m5-prev5,high20=Math.max(...cl.slice(-21,-1)),draw=high20?(price/high20-1)*100:0,pclose=num(res.meta?.previousClose,cl[0]),day=pclose?(price/pclose-1)*100:0,vb=vol.slice(-21,-1).filter(x=>x>0),va=vb.length?vb.reduce((a,b)=>a+b,0)/vb.length:0,vr=va?num(vol.at(-1))/va:1;
 const inValue=draw<=-.18&&draw>=-5.75,falling=m5<0||m20<0,braking=falling&&m5>=-.45&&m20>=-1.70&&accel>=.012,turning=m5>=-.06&&m5<=.24&&m20>=-1.25&&accel>=.008,dayOk=day>=-8&&day<=1.1,rsiOk=rr==null||(rr>=28&&rr<=68),notCrash=m5>=-.58&&m20>=-2.1;
 let score=0,pro=[],contra=[];if(inValue){score+=1.55;pro.push(`Ruecksetzer ${draw.toFixed(2)}% unter 20m-Hoch`)}if(accel>=.025){score+=1.45;pro.push(`Verkaufsdruck bremst deutlich +${accel.toFixed(2)}%`)}else if(accel>=.008){score+=.8;pro.push(`Verkaufsdruck bremst +${accel.toFixed(2)}%`)}if(m5>=-.15){score+=.9;pro.push(`5m stabilisiert ${m5>=0?'+':''}${m5.toFixed(2)}%`)}else contra.push(`5m noch ${m5.toFixed(2)}%`);if(m20>=-1){score+=.7}else if(m20<-1.7){score-=.8;contra.push(`20m noch schwach ${m20.toFixed(2)}%`)}if(rr!=null&&rr>=34&&rr<=60){score+=.8;pro.push(`RSI ${rr.toFixed(0)} nicht ueberhitzt`)}else if(rr!=null&&rr>=28&&rr<=68)score+=.35;if(e9&&e21&&e9>=e21)score+=.45;if(e21&&price>=e21)score+=.35;if(vr>=1.15){score+=.45;pro.push(`Volumen x${vr.toFixed(1)}`)}if(info.reboundWatch)score+=.35;if(info.pcWideSweep)score+=.45;if(day<-5)score-=.65;
 const confidence=clamp(.50+score*.042+((braking||turning)?0.055:0)+(info.pcWideSweep?0.025:0),.50,.78),eligible=inValue&&dayOk&&rsiOk&&notCrash&&(braking||turning)&&score>=3.05&&confidence>=.58;
 if(!eligible)return{candidate:null,error:`Early-Dip verworfen: ${score.toFixed(2)} / ${Math.round(confidence*100)}% · 5m ${m5.toFixed(2)} · 20m ${m20.toFixed(2)}`};
 return{candidate:{symbol:key(info.symbol),name:info.name||info.symbol,type:'EQUITY',currency:info.currency||res.meta?.currency||null,exchange:info.exchange||null,companyKey:info.companyKey||null,price,fxRate:num(info.fxRate,fxFallback),score,confidence,dayChange:day,momentum5:m5,momentum20:m20,momentumAcceleration5:accel,momentumState:'EARLY_DIP',momentumBreakoutScore:0,momentumExhaustionScore:0,momentumSellSignal:'NONE',drawdownFrom20mHighPct:draw,rsi:rr,volumeRatio:vr,newsScore:0,newsConfidence:0,newsSources:[],fresh:true,eventRisk:'MEDIUM',eventText:'Early-Dip-Vorauswahl: Event-Risiko wird beim regulaeren Deep-Scan weiter bestaetigt.',pro,contra,reasons:[...pro,...contra],headlines:[],foresightDip:true,pcWideSweep:Boolean(info.pcWideSweep),reboundWatch:Boolean(info.reboundWatch),pcWideScore:num(info.pcWideScore),pcWideM5Pct:num(info.pcWideM5Pct,m5),pcWideM20Pct:num(info.pcWideM20Pct,m20),pcWideAccelerationPct:num(info.pcWideAccelerationPct,accel),pcWideSessionPct:num(info.pcWideSessionPct,day),foresightPriority:+num(info._foresightRank).toFixed(3)},error:null};
}

export async function scanMarket(env,cfg,heldSymbols=[]){
 const safeEnv=venueSafeEnv(env),result=await baseScanMarket(safeEnv,cfg,heldSymbols);if(result?.marketState?.mode==='NEWS_ONLY')return result;
 let candidates=[...(result.candidates||[])],existing=new Set(candidates.map(x=>key(x?.symbol))),foresightChecked=0,foresightRecovered=0,foresightFailed=0,foresightError='';
 const foresight=await overlayForesightPool(safeEnv,existing);if(foresight.length){
  const checked=await Promise.all(foresight.map(x=>recheckForesight(x,1)));foresightChecked=foresight.length;
  for(const x of checked){if(x?.candidate&&!existing.has(key(x.candidate.symbol))){candidates.push(x.candidate);existing.add(key(x.candidate.symbol));foresightRecovered++}else if(!x?.candidate){foresightFailed++;foresightError=x?.error||foresightError}}
 }
 const rankScore=x=>num(x?.score)+(x?.foresightDip?0.7:0);candidates.sort((a,b)=>rankScore(b)-rankScore(a));
 const watch=getSecondChanceRuntime(),universe=new Map((result?.universe||[]).map(x=>[key(x?.symbol),x]));for(const x of foresight)if(x?.symbol&&!universe.has(key(x.symbol)))universe.set(key(x.symbol),x);
 const missing=watch.filter(x=>!blockedVenueSymbol(x?.symbol)&&!existing.has(key(x?.symbol))&&universe.has(key(x?.symbol))).slice(0,RECHECK_MAX);let recovered=0,failed=0,lastError='';
 if(missing.length){const checked=await Promise.all(missing.map(async w=>{const info=universe.get(key(w.symbol)),same=candidates.find(c=>String(c?.currency||'')===String(info?.currency||'')&&num(c?.fxRate)>0);return recheck(info,w,num(w?.fx_rate,num(same?.fxRate,1)))}));for(const x of checked){if(x?.candidate){candidates.push(x.candidate);recovered++}else{failed++;lastError=x?.error||lastError}}}
 candidates.sort((a,b)=>rankScore(b)-rankScore(a));
 return{...result,candidates,health:{...(result.health||{}),'Early-Dip 1m':{status:foresightRecovered>0?'OK':foresightFailed>0?'DEGRADED':'OK',okCount:foresightRecovered,failCount:foresightFailed,lastError:foresightError||'',latencyMs:null},'Second-Chance 1m':{status:recovered>0?'OK':failed>0?'DEGRADED':'OK',okCount:recovered,failCount:failed,lastError:lastError||'',latencyMs:null}},foresightDipChecked:foresightChecked,foresightDipRecovered:foresightRecovered,foresightDipMax:FORESIGHT_RECHECK_MAX,secondChanceRechecked:missing.length,secondChanceRecovered:recovered,secondChanceRecheckMax:RECHECK_MAX};
}
