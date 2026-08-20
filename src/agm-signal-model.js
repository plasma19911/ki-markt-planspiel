// Gemeinsames Tages-Bewertungsmodell fuer Hauptversammlungen.
// Der 0-100 Wert ist ein interner Chancen-Score, keine Gewinnwahrscheinlichkeit.
// Er setzt sich aus drei nachvollziehbaren Bausteinen zusammen:
//   ZAHLEN = Analystenschaetzungen (EPS/Umsatz) von finanzen.net
//   CHART  = 1-Jahres-Kursstruktur (Trend, Momentum, 52W-Position, Volatilitaet)
//   NEWS   = frische Schlagzeilen inkl. Guidance-Erkennung
// Der Score wird vom Tagesjob berechnet und bis zum naechsten Tagesjob nicht veraendert.

const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const round1=v=>Math.round(num(v)*10)/10;

export const AGM_SIGNAL_VERSION=27.7;

export const POSITIVE_GUIDANCE=/(?:raises? guidance|guidance raised|profit outlook raised|raises? (?:profit |earnings )?forecast|forecast raised|outlook raised|upgrades? (?:to )?buy|prognose angehoben|prognose erh(?:ö|oe)ht|ausblick angehoben|gewinnprognose angehoben|umsatzprognose angehoben|(?:ü|ue)bertrifft erwartungen|beats? (?:estimates|expectations)|record (?:backlog|order|profit)|rekordauftrag|auftragsrekord|dividende erh(?:ö|oe)ht|raises? dividend|aktienr(?:ü|ue)ckkauf|share buyback|starke nachfrage|strong demand)/i;
export const NEGATIVE_GUIDANCE=/(?:cuts? guidance|guidance (?:lowered|cut)|profit warning|earnings warning|(?:cuts?|lowers?) (?:profit |earnings )?forecast|outlook (?:cut|lowered)|downgrades? (?:to )?sell|prognose gesenkt|prognose gestrichen|ausblick gesenkt|gewinnwarnung|umsatzwarnung|verfehlt erwartungen|misses? (?:estimates|expectations)|weak demand|schwache nachfrage|dividende gek(?:ü|ue)rzt|cuts? dividend|stellenabbau|kapitalerh(?:ö|oe)hung|profit slumps?|gewinneinbruch)/i;

const POS_WORDS=/(?:record|rekord|wachstum|growth|gewinnsprung|auftrag|order win|expansion|(?:ü|ue)bernahme|acquisition|zulassung|approval|partnership|kooperation|upgrade|kursziel angehoben|price target raised|beats?)/i;
const NEG_WORDS=/(?:klage|lawsuit|ermittlung|investigation|r(?:ü|ue)ckruf|recall|streik|strike|verlust|loss|einbruch|slump|downgrade|kursziel gesenkt|price target cut|abschreibung|impairment|insolven|betrug|fraud|r(?:ü|ue)cktritt|steps down)/i;

export function chartProfileFromChart(json){
 const res=json?.chart?.result?.[0];if(!res)return null;
 const q=res?.indicators?.quote?.[0]||{};
 const closes=(q.close||[]).map(v=>Number.isFinite(v)?v:null);
 const volumes=(q.volume||[]).map(v=>Number.isFinite(v)?v:null);
 const valid=closes.filter(v=>v!==null&&v>0);
 if(valid.length<40)return null;
 const last=valid.at(-1);
 const sma=n=>{const s=valid.slice(-n);return s.length<Math.min(n,20)?null:s.reduce((a,b)=>a+b,0)/s.length};
 const back=n=>valid.length>n?valid.at(-1-n):valid[0];
 const pct=(a,b)=>b>0?(a/b-1)*100:null;
 const high=Math.max(...valid),low=Math.min(...valid);
 const rets=[];for(let i=Math.max(1,valid.length-21);i<valid.length;i++)rets.push(valid[i]/valid[i-1]-1);
 const mean=rets.length?rets.reduce((a,b)=>a+b,0)/rets.length:0;
 const vol=rets.length>3?Math.sqrt(rets.reduce((a,b)=>a+(b-mean)**2,0)/(rets.length-1))*Math.sqrt(252)*100:null;
 const vAll=volumes.filter(v=>Number.isFinite(v)&&v>0),vRecent=vAll.slice(-10),vBase=vAll.slice(-60,-10);
 const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
 const volumeTrend=vRecent.length>=5&&vBase.length>=15?pct(avg(vRecent),avg(vBase)):null;
 return{source:'Yahoo chart 1y/1d',currency:res?.meta?.currency||null,samples:valid.length,last:round1(last),changeM1:pct(last,back(21))===null?null:round1(pct(last,back(21))),changeM3:pct(last,back(63))===null?null:round1(pct(last,back(63))),changeM6:pct(last,back(126))===null?null:round1(pct(last,back(126))),sma50:sma(50)?round1(sma(50)):null,sma200:sma(200)?round1(sma(200)):null,position52w:high>low?+(((last-low)/(high-low))*100).toFixed(1):null,drawdownFromHigh:high>0?round1((last/high-1)*100):null,volatility20d:vol===null?null:round1(vol),volumeTrend:volumeTrend===null?null:round1(volumeTrend)};
}

export function scoreChartProfile(chart){
 if(!chart)return{delta:0,confidence:0,reasons:[]};
 let d=0;const reasons=[];
 const {last,sma50,sma200,changeM1,changeM3,position52w,volatility20d,drawdownFromHigh,volumeTrend}=chart;
 if(sma50&&sma200){if(last>sma50&&sma50>sma200){d+=7;reasons.push('Chart im Aufwaertstrend (Kurs > 50- > 200-Tage-Linie)')}else if(last>sma200){d+=3;reasons.push('Kurs ueber der 200-Tage-Linie')}else if(last<sma50&&sma50<sma200){d-=7;reasons.push('Chart im Abwaertstrend (Kurs < 50- < 200-Tage-Linie)')}else{d-=3;reasons.push('Kurs unter der 200-Tage-Linie')}}
 if(changeM3!==null){if(changeM3>=15){d+=4;reasons.push(`3-Monats-Trend +${changeM3.toFixed(0)}%`)}else if(changeM3>=5)d+=2;else if(changeM3<=-15){d-=5;reasons.push(`3-Monats-Trend ${changeM3.toFixed(0)}%`)}else if(changeM3<=-5)d-=3}
 if(changeM1!==null){if(changeM1>=8)d+=2;else if(changeM1<=-8){d-=3;reasons.push(`Kurs faellt kurz vor der HV (${changeM1.toFixed(0)}% in 1 Monat)`)}}
 if(position52w!==null){if(position52w>=97){d-=3;reasons.push('Kurs direkt am 52-Wochen-Hoch - wenig Vorab-Luft')}else if(position52w>=45&&position52w<=88){d+=3;reasons.push(`Gesunde Position im 52-Wochen-Band (${position52w.toFixed(0)}%)`)}else if(position52w<=12){d-=3;reasons.push('Kurs nahe 52-Wochen-Tief')}}
 if(volatility20d!==null&&volatility20d>70){d-=2;reasons.push(`Hohe Schwankung (${volatility20d.toFixed(0)}% p.a.)`)}
 if(drawdownFromHigh!==null&&drawdownFromHigh<=-35)d-=2;
 if(volumeTrend!==null&&volumeTrend>=45){d+=2;reasons.push(`Umsatz zieht vor der HV an (+${volumeTrend.toFixed(0)}%)`)}
 const confidence=clamp(.22+(chart.samples>=200?.16:.08)+(sma200?.06:0),0,.45);
 return{delta:clamp(d,-16,16),confidence:+confidence.toFixed(3),reasons:reasons.slice(0,4)};
}

export function scoreHeadlines(headlines=[],now=Date.now()){
 const rows=(Array.isArray(headlines)?headlines:[]).filter(Boolean).map(x=>typeof x==='string'?{title:x,published:null}:x);
 if(!rows.length)return{delta:0,confidence:0,guidance:0,reasons:[],headlines:[],count:0};
 const fresh=rows.filter(x=>{const t=Date.parse(x?.published||'');return !Number.isFinite(t)||now-t<=21*86400000}).slice(0,10);
 if(!fresh.length)return{delta:0,confidence:0,guidance:0,reasons:[],headlines:[],count:0};
 const text=fresh.map(x=>String(x.title||'')).join(' | ');
 const guidance=POSITIVE_GUIDANCE.test(text)&&!NEGATIVE_GUIDANCE.test(text)?1:NEGATIVE_GUIDANCE.test(text)&&!POSITIVE_GUIDANCE.test(text)?-1:0;
 let pos=0,neg=0;for(const x of fresh){const t=String(x.title||'');if(POS_WORDS.test(t))pos++;if(NEG_WORDS.test(t))neg++}
 let d=0;const reasons=[];
 if(guidance>0){d+=8;reasons.push('Meldungen deuten auf angehobenen Ausblick')}
 if(guidance<0){d-=14;reasons.push('Meldungen deuten auf gesenkten Ausblick / Gewinnwarnung')}
 const tone=clamp((pos-neg)/Math.max(3,fresh.length)*10,-6,6);d+=tone;
 if(tone>=2.5)reasons.push(`${pos} positive von ${fresh.length} frischen Meldungen`);
 if(tone<=-2.5)reasons.push(`${neg} kritische von ${fresh.length} frischen Meldungen`);
 return{delta:clamp(d,-18,12),confidence:+clamp(.12+Math.min(fresh.length,6)*.04+(guidance!==0?.10:0),0,.42).toFixed(3),guidance,reasons:reasons.slice(0,3),count:fresh.length,headlines:fresh.slice(0,4).map(x=>String(x.title||'').slice(0,140))};
}

export function composeAgmBaseScore({fundamental=null,chart=null,news=null}={}){
 const fundDelta=fundamental?clamp(num(fundamental.fundamentalScore,50)-50,-24,24):0;
 const chartPart=scoreChartProfile(chart);
 const newsPart=news&&typeof news.delta==='number'?news:scoreHeadlines(news?.headlines||[]);
 const score=Math.round(clamp(50+fundDelta+chartPart.delta+newsPart.delta,0,100));
 const parts=[];
 if(fundamental)parts.push({key:'ZAHLEN',delta:Math.round(fundDelta),label:'Analystenschaetzungen'});
 if(chart)parts.push({key:'CHART',delta:Math.round(chartPart.delta),label:'Kursstruktur 1 Jahr'});
 if(newsPart.count)parts.push({key:'NEWS',delta:Math.round(newsPart.delta),label:`${newsPart.count} frische Meldungen`});
 const confidence=clamp(.18+(fundamental?num(fundamental.fundamentalConfidence,0)*.45:0)+chartPart.confidence*.55+newsPart.confidence*.5,.15,.92);
 const positive=newsPart.guidance>0?true:newsPart.guidance<0?false:fundamental?.profitForecastPositive??null;
 return{baseScore:score,fundamentalScore:score,fundamentalConfidence:+confidence.toFixed(3),profitForecastPositive:positive,fundamentalReasons:[...new Set([...(fundamental?.fundamentalReasons||[]),...chartPart.reasons,...newsPart.reasons])].slice(0,6),scoreParts:parts,chartDelta:Math.round(chartPart.delta),newsDelta:Math.round(newsPart.delta),fundamentalDelta:Math.round(fundDelta),newsGuidance:newsPart.guidance,newsHeadlines:newsPart.headlines,dataQuality:{zahlen:Boolean(fundamental),chart:Boolean(chart),news:Boolean(newsPart.count)}};
}
