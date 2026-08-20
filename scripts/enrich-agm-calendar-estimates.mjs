import fs from 'node:fs';

const FILE='public/agm-calendar.json';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const decode=s=>String(s||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&auml;/gi,'ä').replace(/&ouml;/gi,'ö').replace(/&uuml;/gi,'ü').replace(/&Auml;/g,'Ä').replace(/&Ouml;/g,'Ö').replace(/&Uuml;/g,'Ü').replace(/&szlig;/gi,'ß').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const localeNum=s=>{const x=String(s??'').replace(/[^0-9,.-]/g,'').trim();if(!x)return null;const normalized=x.includes(',')?x.replace(/\./g,'').replace(',','.') : x;const n=Number(normalized);return Number.isFinite(n)?n:null};

function estimateUrl(sourceHref){
 try{
  const p=new URL(sourceHref).pathname;
  const m=p.match(/\/(?:termine|aktien)\/([^/?#]+?)(?:-aktie)?$/i);
  if(!m)return null;
  return `https://www.finanzen.net/schaetzungen/${m[1].replace(/-aktie$/i,'')}`;
 }catch{return null}
}
async function getText(url){const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml','accept-language':'de-DE,de;q=0.9,en;q=0.7'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text()}
function parseEstimate(html){
 const text=decode(html),pairs=[...text.matchAll(/Gewinn\/Aktie(?!\s*\(reported\))\s+(-?\d[\d.,]*)\s+(-?\d[\d.,]*)/gi)];
 if(!pairs.length)return null;
 const epsCurrent=localeNum(pairs.at(-1)?.[1]),epsNext=localeNum(pairs.at(-1)?.[2]);if(epsCurrent===null||epsNext===null)return null;
 let score=50,positive=null,reasons=[];
 if(epsCurrent<=0&&epsNext>0){score+=18;positive=true;reasons.push(`Analysten-EPS dreht von ${epsCurrent.toFixed(2)} auf ${epsNext.toFixed(2)}`)}
 else if(epsCurrent>0){const g=(epsNext/epsCurrent-1)*100;if(g>=30){score+=16;positive=true;reasons.push(`Analysten erwarten EPS-Wachstum ca. ${g.toFixed(0)}%`)}else if(g>=12){score+=11;positive=true;reasons.push(`Analysten erwarten EPS-Wachstum ca. ${g.toFixed(0)}%`)}else if(g>=3){score+=6;positive=true;reasons.push(`Analysten erwarten leicht höheres EPS (+${g.toFixed(0)}%)`)}else if(g<=-15){score-=13;positive=false;reasons.push(`Analysten erwarten EPS-Rückgang ca. ${Math.abs(g).toFixed(0)}%`)}else if(g<0){score-=6;positive=false;reasons.push('Analysten erwarten leicht rückläufiges EPS')}}
 const rev=[...text.matchAll(/Umsatzerlöse in Mio\.\s+(-?\d[\d.,]*)\s+(-?\d[\d.,]*)/gi)].at(-1),revCurrent=localeNum(rev?.[1]),revNext=localeNum(rev?.[2]);
 if(revCurrent>0&&revNext>0){const g=(revNext/revCurrent-1)*100;if(g>=5){score+=5;reasons.push(`Umsatzschätzung nächstes Jahr +${g.toFixed(0)}%`)}else if(g>=2){score+=3;reasons.push(`Umsatzschätzung nächstes Jahr +${g.toFixed(0)}%`)}else if(g<=-5){score-=5;reasons.push(`Umsatzschätzung nächstes Jahr ${g.toFixed(0)}%`)}}
 return{baseScore:Math.round(clamp(score,0,100)),fundamentalScore:Math.round(clamp(score,0,100)),fundamentalConfidence:.62,profitForecastPositive:positive,fundamentalReasons:reasons.slice(0,4),fundamentals:{source:'finanzen.net Schätzungen',epsCurrentYearEstimate:epsCurrent,epsNextYearEstimate:epsNext,revenueCurrentYearEstimate:revCurrent,revenueNextYearEstimate:revNext}};
}

const data=JSON.parse(fs.readFileSync(FILE,'utf8')),events=Array.isArray(data.events)?data.events:[];
let enriched=0,attempted=0;
for(const e of events){
 const url=estimateUrl(e.sourceHref);if(!url)continue;attempted++;
 try{
  const f=parseEstimate(await getText(url));if(!f)continue;
  if(Number(f.fundamentalConfidence)>Number(e.fundamentalConfidence||0)){Object.assign(e,f,{estimateUrl:url});enriched++;}
 }catch{}
}
data.source='finanzen.net Hauptversammlung + finanzen.net Schätzungen + Yahoo Fallback';
data.fundamentalEstimateCount=enriched;
data.estimateAttemptCount=attempted;
data.updatedAt=new Date().toISOString();
fs.writeFileSync(FILE,JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({ok:true,attempted,enriched},null,2));
