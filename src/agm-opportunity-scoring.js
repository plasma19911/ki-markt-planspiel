// PAPER-TRADING ONLY. AGM/Hauptversammlungen are a context signal, never a buy trigger by themselves.
// The 0-100 value is an internal opportunity score, not a probability of profit.
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v||'').trim().toUpperCase();

export const AGM_PREVIEW_RULES={
 version:27.6,
 horizonDays:14,
 minimumScore:72,
 minimumConfidence:.58,
 maximumAllocationPct:18,
 minimumTechnicalScore:3.10,
 minimumTechnicalConfidence:.50,
 paperTradingOnly:true
};

export function agmDaysUntil(date,now=Date.now()){
 const t=Date.parse(String(date||''));if(!Number.isFinite(t))return null;
 const a=new Date(now),b=new Date(t);
 const au=Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),a.getUTCDate()),bu=Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate());
 return Math.round((bu-au)/86400000);
}

function guidanceSignal(headlines=[]){
 const text=(Array.isArray(headlines)?headlines:[headlines]).join(' | ').toLowerCase();
 const pos=/(?:raises? guidance|guidance raised|profit outlook raised|raises? profit forecast|earnings outlook raised|forecast raised|prognose angehoben|prognose erhöht|prognose erhoeht|gewinnprognose angehoben|gewinn steigt|gewinnwachstum|umsatzprognose angehoben|übertrifft erwartungen|uebertrifft erwartungen|beats? estimates|strong demand|record backlog)/i.test(text);
 const neg=/(?:cuts? guidance|guidance lowered|profit warning|earnings warning|forecast cut|prognose gesenkt|gewinnwarnung|umsatzwarnung|verfehlt erwartungen|misses? estimates|weak demand)/i.test(text);
 return pos&&!neg?1:neg&&!pos?-1:0;
}

export function preliminaryAgmScore(event={},coarse={}){
 let score=num(event?.baseScore,event?.fundamentalScore??50);
 const day=num(coarse?.dayChange),mom=num(coarse?.coarseMomentum),accel=num(coarse?.momentumAcceleration),pre=num(coarse?.preScore);
 score+=clamp(pre*1.15,-7,7)+clamp(mom*4,-5,5)+clamp(accel*8,-4,4);
 if(day>5.5)score-=6;else if(day>2.5)score-=2;else if(day>=-.8&&day<=2.2)score+=2;
 return Math.round(clamp(score,0,100));
}

export function scoreAgmOpportunity(event={},context={}){
 const c=context?.candidate||{},n=context?.news||{},now=context?.now??Date.now(),days=agmDaysUntil(event?.date,now);
 const fundamentalScore=clamp(num(event?.baseScore,event?.fundamentalScore??50),0,100),fundamentalConfidence=clamp(num(event?.fundamentalConfidence,0),0,1);
 const newsScore=num(n?.score,c?.newsScore??c?.news_score),newsConfidence=clamp(num(n?.confidence,c?.newsConfidence??c?.news_confidence),0,1),headlines=n?.headlines||c?.headlines||[],guidance=guidanceSignal(headlines);
 const technicalScore=num(c?.score,c?.liveScore),technicalConfidence=clamp(num(c?.confidence,c?.liveConfidence),0,1),day=num(c?.dayChange,c?.day_change),m5=num(c?.momentum5,c?.intraday5m),m20=num(c?.momentum20,c?.intraday20m),accel=num(c?.momentumAcceleration5,c?.momentum_acceleration5),rsi=num(c?.rsi,c?.intradayRsi??50),state=String(c?.momentumState||c?.momentum_state||'NORMAL').toUpperCase(),sell=String(c?.momentumSellSignal||c?.momentum_sell_signal||'NONE').toUpperCase(),eventRisk=String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase();
 let score=fundamentalScore,reasons=[...(Array.isArray(event?.fundamentalReasons)?event.fundamentalReasons:[])];
 if(newsConfidence>0){const impact=clamp(newsScore*Math.max(.35,newsConfidence)*12,-18,18);score+=impact;if(impact>=3)reasons.push(`News-Lage unterstützt die HV (+${impact.toFixed(0)} Punkte)`);else if(impact<=-3)reasons.push(`News-Lage belastet die HV (${impact.toFixed(0)} Punkte)`)}
 if(guidance>0){score+=9;reasons.push('Neue Meldungen deuten auf angehobenen/positiven Ausblick')}
 if(guidance<0){score-=14;reasons.push('Neue Meldungen deuten auf gesenkten Ausblick/Gewinnwarnung')}
 if(technicalScore||technicalConfidence){score+=clamp((technicalScore-3.0)*2.4,-9,10)+clamp((technicalConfidence-.5)*12,-5,5)+clamp(m20*3,-5,6)+clamp(accel*5,-3,4);if(technicalScore>=4&&m20>=0)reasons.push('Technisches Bild bestätigt den Vorlauf');if(m20<-.35||state==='REVERSAL'||sell==='STRONG')reasons.push('Technik warnt vor schwachem Vorlauf')}
 if(day>=5.5||rsi>=78){score-=8;reasons.push('Kurs bereits weit gelaufen – kein HV-Hinterherkauf')}
 const positiveOutlook=event?.profitForecastPositive===true||guidance>0||(fundamentalScore>=64&&fundamentalConfidence>=.50);
 const negativeOutlook=event?.profitForecastPositive===false||guidance<0;
 if(positiveOutlook)score+=3;if(negativeOutlook)score-=5;
 score=Math.round(clamp(score,0,100));
 let confidence=.30+fundamentalConfidence*.32+newsConfidence*.24+(technicalScore||technicalConfidence?technicalConfidence*.18:0)+(guidance!==0?.08:0);if(days!==null&&days>=0&&days<=14)confidence+=.04;confidence=clamp(confidence,.20,.92);
 const hasFreshTechnical=Boolean(c&&Object.keys(c).length)&&c?.fresh!==false,technicalSafe=technicalScore>=AGM_PREVIEW_RULES.minimumTechnicalScore&&technicalConfidence>=AGM_PREVIEW_RULES.minimumTechnicalConfidence&&m20>=-.25&&m5>=-.12&&accel>=-.01&&state!=='REVERSAL'&&state!=='EXHAUSTION'&&sell!=='STRONG'&&day<5.5&&rsi<78;
 const withinWindow=days!==null&&days>=1&&days<=AGM_PREVIEW_RULES.horizonDays,newsSafe=newsScore>-.30&&guidance>=0,tradeEligible=Boolean(withinWindow&&score>=AGM_PREVIEW_RULES.minimumScore&&confidence>=AGM_PREVIEW_RULES.minimumConfidence&&positiveOutlook&&!negativeOutlook&&hasFreshTechnical&&technicalSafe&&newsSafe&&eventRisk!=='HIGH');
 const label=score>=82?'SEHR POSITIV':score>=72?'POSITIV':score>=58?'LEICHT POSITIV':score>=43?'NEUTRAL':score>=30?'VORSICHT':'NEGATIV';
 return{...event,symbol:key(event?.symbol),daysUntil:days,score,confidence:+confidence.toFixed(3),label,profitOutlookPositive:positiveOutlook,tradeEligible,preBuyWindow:withinWindow,maximumAllocationPct:AGM_PREVIEW_RULES.maximumAllocationPct,reasons:[...new Set(reasons.filter(Boolean))].slice(0,6),updatedAt:new Date(now).toISOString()};
}

export function scoreAgmCalendar(calendar={},context={}){
 const candidates=Array.isArray(context?.candidates)?context.candidates:[],candidateMap=new Map(candidates.map(x=>[key(x?.symbol),x])),newsRows=Array.isArray(context?.newsRadar)?context.newsRadar:[],provided=context?.newsBySymbol instanceof Map?context.newsBySymbol:null,newsMap=provided||new Map(newsRows.map(x=>[key(x?.symbol),x]));
 const rows=(Array.isArray(calendar?.events)?calendar.events:[]).map(ev=>scoreAgmOpportunity(ev,{candidate:candidateMap.get(key(ev?.symbol))||null,news:newsMap.get(key(ev?.symbol))||null,now:context?.now??Date.now()})).filter(x=>x.daysUntil===null||x.daysUntil>=0).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||b.score-a.score);
 return{version:27.6,source:calendar?.source||'finanzen.net Hauptversammlung',sourceUpdatedAt:calendar?.updatedAt||calendar?.sourceUpdatedAt||null,generatedAt:new Date(context?.now??Date.now()).toISOString(),refreshCadence:'daily',scoreReevaluation:'every market/news scan',scoreMeaning:'0-100 interner Chancen-Score; keine Gewinnwahrscheinlichkeit',events:rows};
}
