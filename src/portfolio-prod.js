import {MarketPortfolio as V3Portfolio} from './portfolio-v3.js';
import {AI_MODEL,clamp,num,nowIso} from './constants.js';
import {runLastWeekHindsight} from './last-week.js';

const positionValue=(p,price=p.last_price,fx=p.last_fx)=>!p?.entry_price?num(p?.invested):num(p.invested)*(num(price)/num(p.entry_price))*(num(fx,1)/num(p.entry_fx,1));

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
 // Keine wirtschaftliche Mindestorder mehr. Gebuehren/Spread werden weiter real abgezogen,
 // koennen kleine Orders also unattraktiv machen, blockieren sie aber nicht kuenstlich.
 minimumOrder(){return .01}
 executionModel(c=this.cfg()){
  return{feeFixed:num(c.fee_fixed),feePercent:num(c.fee_percent),slippagePercent:num(c.slippage_percent),leveragedSlippagePercent:num(c.leveraged_slippage_percent),maxRoundtripCostPercent:null,minOrderNormal:.01,minOrderLeveraged:.01,budgetOnly:true}
 }

 riskState(c=this.cfg()){
  const eq=this.equity(c.cash),midnight=new Date();midnight.setUTCHours(0,0,0,0);
  const first=this.ctx.storage.sql.exec('SELECT equity FROM snapshots WHERE ts>=? ORDER BY id ASC LIMIT 1',midnight.toISOString()).toArray()[0];
  const dayStart=num(first?.equity,num(c.start_capital)),dailyPct=dayStart?(eq/dayStart-1)*100:0,ps=this.positions();
  const leverValue=ps.filter(p=>p.instrument_type==='LEVERAGED_ETF').reduce((s,p)=>s+positionValue(p),0);
  return{equity:eq,dailyPct,limits:{dailyLoss:null,leverPct:null,themePct:null,cooldownLosses:null,cooldownMin:null},leverPct:eq?leverValue/eq*100:0,themePct:{},consecutiveLosses:0,cooldownUntil:0,cooldownActive:false,hardLimits:false,budgetOnly:true,availableCash:num(c.cash),positionLimit:null,holdingLimit:null};
 }
 riskCheck(cand,amount,cfg=this.cfg()){
  const fee=this.fee(amount,cfg);
  if(amount<=0)return{ok:false,reason:'Kein positiver Orderwert'};
  if(amount+fee>num(cfg.cash)+1e-8)return{ok:false,reason:'Nicht genug Spielgeld inklusive Gebuehr'};
  return{ok:true,reason:'Nur Budgetgrenze aktiv'};
 }

 async aiPlan(cands,ps,cfg){
  if(!cfg.ai_enabled)return{summary:'KI deaktiviert',actions:[]};
  if(!cands.length)return{summary:'NEWS-ONLY bzw. keine frischen handelbaren Kurse – keine Orderentscheidung.',actions:[]};
  const model=this.executionModel(cfg),data=cands.slice(0,12).map(x=>({symbol:x.symbol,type:x.type,theme:x.theme,score:+num(x.score).toFixed(2),confidence:+num(x.confidence).toFixed(2),day:+num(x.dayChange).toFixed(2),m5:+num(x.momentum5).toFixed(2),m20:+num(x.momentum20).toFixed(2),rsi:x.rsi==null?null:+num(x.rsi).toFixed(1),news:+num(x.newsScore).toFixed(2),newsConfidence:+num(x.newsConfidence).toFixed(2),eventRisk:x.eventRisk,pro:(x.pro||[]).slice(0,4),contra:(x.contra||[]).slice(0,4),headlines:(x.headlines||[]).slice(0,2)}));
  const held=ps.map(p=>({symbol:p.symbol,type:p.instrument_type,theme:p.theme,invested:num(p.invested),pnlPct:num(p.invested)?+((positionValue(p)/num(p.invested)-1)*100).toFixed(2):0,score:p.score}));
  const prompt=`PAPER-TRADING ONLY. Keine echten Orders. Verfuegbares Spielgeld ${num(cfg.cash).toFixed(2)} ${cfg.currency}, Startkapital ${num(cfg.start_capital).toFixed(2)} ${cfg.currency}. Es gibt KEINE harte Grenze fuer Anzahl gleichzeitiger Positionen, Haltedauer, Branche, Hebelquote, Reserve oder Verlustserie. Die einzige harte Portfoliogrenze ist das vorhandene Spielgeld; Gebuehren und Slippage muessen bezahlt werden. Du darfst das Kapital auf beliebig viele der Kandidaten verteilen oder konzentrieren. allocation_pct ist der Anteil am URSPRUENGLICHEN Startkapital; die Summe neuer BUY-Allokationen darf das aktuell verfuegbare Cash nicht ueberschreiten. Kosten ${model.feeFixed.toFixed(2)} ${cfg.currency} je Kauf/Verkauf, Slippage ${model.slippagePercent.toFixed(2)}% normal/${model.leveragedSlippagePercent.toFixed(2)}% Hebel. Beruecksichtige frische Kurse, News, Events, FX und Kosten. Gib keine versteckten Gedankengaenge aus, nur kurze Begruendungen. JSON {"summary":"kurz","actions":[{"symbol":"TICKER","action":"BUY|SELL|HOLD","confidence":0.0,"allocation_pct":0,"reason":"1 Satz"}]}. BUY nur Kandidaten, SELL nur gehaltene Werte. Kandidaten=${JSON.stringify(data)} Gehalten=${JSON.stringify(held)}`;
  try{
   const r=await this.env.AI.run(AI_MODEL,{messages:[{role:'user',content:prompt}],max_completion_tokens:900}),t=String(r?.response||r?.result?.response||''),a=t.indexOf('{'),b=t.lastIndexOf('}');
   if(a<0||b<=a)throw new Error('kein JSON');
   const j=JSON.parse(t.slice(a,b+1));
   return{summary:String(j.summary||'KI-Plan').slice(0,500),actions:(Array.isArray(j.actions)?j.actions:[]).map(x=>({symbol:String(x.symbol||'').toUpperCase(),action:String(x.action||'HOLD').toUpperCase(),confidence:clamp(num(x.confidence),0,1),allocation_pct:clamp(num(x.allocation_pct),0,100),reason:String(x.reason||'').slice(0,350)})).filter(x=>['BUY','SELL','HOLD'].includes(x.action))};
  }catch(e){return{summary:`KI-Fallback: ${String(e.message||e).slice(0,160)}`,actions:[]}}
 }

 open(cand,pct,reason){
  const cfg=this.cfg(),ps=this.positions();
  if(ps.some(p=>p.symbol===cand.symbol))return false;
  const before=num(cfg.cash);if(before<=0)return false;
  const requestedPct=num(pct)>0?clamp(num(pct),0,100):100;
  let amount=Math.min(before,num(cfg.start_capital)*requestedPct/100);
  let fee=this.fee(amount,cfg);
  if(amount+fee>before){
   const fixed=Math.max(0,num(cfg.fee_fixed)),rate=Math.max(0,num(cfg.fee_percent))/100;
   amount=Math.max(0,(before-fixed)/(1+rate));fee=this.fee(amount,cfg);
  }
  if(amount<=0||amount+fee>before+1e-8)return false;
  const risk=this.riskCheck(cand,amount,cfg);if(!risk.ok)return false;
  const slip=this.slippage(cand.type,cfg),execPrice=num(cand.price)*(1+slip/100),after=Math.max(0,before-amount-fee),fx=num(cand.fxRate,1);
  this.ctx.storage.sql.exec('INSERT INTO positions(symbol,name,instrument_type,theme,leverage,invested,entry_fee,entry_price,last_price,entry_fx,last_fx,currency,opened_at,score,signal_confidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',cand.symbol,cand.name||cand.symbol,cand.type,cand.theme||null,num(cand.leverage,1),amount,fee,execPrice,cand.price,fx,fx,cand.currency||null,nowIso(),cand.score,num(cand.confidence));
  this.ctx.storage.sql.exec('UPDATE config SET cash=?,total_fees=COALESCE(total_fees,0)+? WHERE id=1',after,fee);
  const eq=this.equity(after),roundtrip=(2*fee/Math.max(.01,amount)*100)+(2*Math.max(0,num(cfg.fee_percent)))+(2*slip);
  this.record('KAUF',{symbol:cand.symbol,name:cand.name,type:cand.type,amount:-(amount+fee),fee,cashBefore:before,cashAfter:after,equity:eq,score:cand.score,scanNo:num(cfg.scan_count)+1,reason:`${reason} · Order ${amount.toFixed(2)} ${cfg.currency} · keine Positions-/Haltezeitgrenze · FX ${fx.toFixed(5)} · geschätzte Roundtrip-Kosten ~${roundtrip.toFixed(2)}%`});
  this.logAI('TRADE','Kauf ausgeführt',`${cand.symbol}: ${reason}. Keine harte Positions- oder Haltedauergrenze; einziges Limit ist das verfügbare Spielgeld.`,{symbol:cand.symbol,confidence:num(cand.confidence),meta:{score:cand.score,amount}});
  return true;
 }

 newsTrend(){
  const now=Date.now();
  const rows=this.ctx.storage.sql.exec('SELECT * FROM news_radar ORDER BY COALESCE(news_at,updated_at) DESC LIMIT 140').toArray();
  const recent=rows.map(x=>{
   const stored=Math.max(0,num(x.trading_age_hours,999));
   const extra=x.waiting_for_open?0:Math.max(0,(now-Date.parse(x.updated_at||new Date(now).toISOString()))/3600000);
   const tradingAge=stored+Math.min(extra,2);
   return{...x,tradingAge,freshness:freshnessFromTradingAge(tradingAge)};
  }).filter(x=>x.freshness>0);
  const active=recent.filter(x=>Math.abs(num(x.news_score))>=.08),weight=x=>Math.max(.15,num(x.confidence))*x.freshness;
  const den=active.reduce((s,x)=>s+weight(x),0),score=den?active.reduce((s,x)=>s+num(x.news_score)*weight(x),0)/den:0,label=score>.18?'BULLISH':score<-.18?'BEARISH':'NEUTRAL';
  recent.sort((a,b)=>(Math.abs(num(b.news_score))*weight(b))-(Math.abs(num(a.news_score))*weight(a)));
  return{score,label,rows:recent.slice(0,60)};
 }
 async status(){
  const s=await super.status();
  delete s.benchmarks;
  delete s.replay;
  return s;
 }
 async lastWeek(){
  const c=this.cfg(),m=this.executionModel(c);
  return runLastWeekHindsight(this.env,{includeEtfs:Boolean(c.include_etfs),includeLeverage:Boolean(c.include_leverage),feeFixed:m.feeFixed,feePercent:m.feePercent,slippagePercent:m.slippagePercent,leveragedSlippagePercent:m.leveragedSlippagePercent});
 }
}
