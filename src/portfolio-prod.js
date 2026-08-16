import {MarketPortfolio as V3Portfolio} from './portfolio-v3.js';
import {num} from './constants.js';

function freshnessFromTradingAge(hours){
 const h=Math.max(0,num(hours,999));
 if(h<=.25)return 1.75;
 if(h<=1)return 1.55;
 if(h<=3)return 1.30;
 if(h<=6)return 1;
 if(h<=12)return .62;
 if(h<=18)return .35;
 if(h<=24)return .16;
 if(h<=36)return .05;
 return 0;
}

export class MarketPortfolio extends V3Portfolio{
 newsTrend(){
  const now=Date.now();
  const rows=this.ctx.storage.sql.exec('SELECT * FROM news_radar ORDER BY COALESCE(news_at,updated_at) DESC LIMIT 140').toArray();
  const recent=rows.map(x=>{
   const stored=Math.max(0,num(x.trading_age_hours,999));
   // Wenn die Meldung auf die naechste Marktoeffnung wartet, bleibt ihr Handelsalter komplett eingefroren.
   // Andernfalls darf seit der letzten Radar-Aktualisierung nur die kurze laufende Handelszeit weiterzaehlen.
   const extra=x.waiting_for_open?0:Math.max(0,(now-Date.parse(x.updated_at||new Date(now).toISOString()))/3600000);
   const tradingAge=stored+Math.min(extra,2);
   return{...x,tradingAge,freshness:freshnessFromTradingAge(tradingAge)};
  }).filter(x=>x.freshness>0);
  const active=recent.filter(x=>Math.abs(num(x.news_score))>=.08),weight=x=>Math.max(.15,num(x.confidence))*x.freshness;
  const den=active.reduce((s,x)=>s+weight(x),0),score=den?active.reduce((s,x)=>s+num(x.news_score)*weight(x),0)/den:0,label=score>.18?'BULLISH':score<-.18?'BEARISH':'NEUTRAL';
  recent.sort((a,b)=>(Math.abs(num(b.news_score))*weight(b))-(Math.abs(num(a.news_score))*weight(a)));
  return{score,label,rows:recent.slice(0,60)};
 }
}
