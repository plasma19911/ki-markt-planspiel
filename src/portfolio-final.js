import {MarketPortfolio as ProdPortfolio} from './portfolio-prod.js';
import {runLastWeekHindsight} from './last-week.js';
import {AI_MODEL,clamp,num,nowIso} from './constants.js';

const REMOVED_SOURCES=new Set(['GDELT','SEC/EDGAR','Google News']);
const EMPTY_RSS='<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>disabled</title></channel></rss>';
const positionValue=(p,price=p.last_price,fx=p.last_fx)=>!p?.entry_price?num(p?.invested):num(p.invested)*(num(price)/num(p.entry_price))*(num(fx,1)/num(p.entry_fx,1));

export class MarketPortfolio extends ProdPortfolio{
  upsertHealth(h){
    this.ctx.storage.sql.exec("DELETE FROM source_health WHERE source IN ('GDELT','SEC/EDGAR','Google News')");
    const clean={};for(const [source,x] of Object.entries(h||{}))if(!REMOVED_SOURCES.has(source))clean[source]=x;
    return super.upsertHealth(clean);
  }

  async start(o={}){
    return super.start({...o,includeEtfs:true,includeLeverage:true});
  }

  async scan(){
    this.ctx.storage.sql.exec('UPDATE config SET include_etfs=1,include_leverage=1 WHERE id=1');
    const nativeFetch=globalThis.fetch;
    globalThis.fetch=async(input,init)=>{
      try{const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;if(raw&&new URL(raw).hostname==='news.google.com')return new Response(EMPTY_RSS,{status:200,headers:{'content-type':'application/rss+xml;charset=utf-8','cache-control':'public,max-age=900'}})}catch{}
      return nativeFetch(input,init);
    };
    try{return await super.scan()}finally{globalThis.fetch=nativeFetch}
  }

  async aiPlan(cands,ps,cfg){
    if(!cfg.ai_enabled)return{summary:'KI deaktiviert',actions:[]};
    if(!cands.length)return{summary:'NEWS-ONLY bzw. keine frischen handelbaren Kurse – keine Orderentscheidung.',actions:[]};
    const model=this.executionModel(cfg),data=cands.slice(0,12).map(x=>({symbol:x.symbol,type:x.type,theme:x.theme,score:+num(x.score).toFixed(2),confidence:+num(x.confidence).toFixed(2),day:+num(x.dayChange).toFixed(2),m5:+num(x.momentum5).toFixed(2),m20:+num(x.momentum20).toFixed(2),rsi:x.rsi==null?null:+num(x.rsi).toFixed(1),news:+num(x.newsScore).toFixed(2),newsConfidence:+num(x.newsConfidence).toFixed(2),eventRisk:x.eventRisk,pro:(x.pro||[]).slice(0,4),contra:(x.contra||[]).slice(0,4),headlines:(x.headlines||[]).slice(0,2)}));
    const held=ps.map(p=>({symbol:p.symbol,type:p.instrument_type,theme:p.theme,invested:num(p.invested),pnlPct:num(p.invested)?+((positionValue(p)/num(p.invested)-1)*100).toFixed(2):0,score:p.score}));
    const prompt=`PAPER-TRADING ONLY. Keine echten Orders. Aktuell verfügbares Spielgeld ${num(cfg.cash).toFixed(2)} ${cfg.currency}. Aktien, normale ETFs und Hebel-/Inverse-ETFs sind immer erlaubt. Es gibt KEINE harte Grenze für Anzahl gleichzeitiger Positionen, Haltedauer, Branche, Hebelquote, Reserve, Mindestorder oder Verlustserie. Die einzige harte Grenze ist das aktuell vorhandene Cash inklusive Gebühren und Slippage. allocation_pct ist der Prozentanteil des AKTUELL VERFÜGBAREN CASH, nicht des ursprünglichen Startkapitals. Die Summe neuer BUY-Allokationen soll 100% des verfügbaren Cash nicht überschreiten, aber du darfst frei konzentrieren oder auf beliebig viele Kandidaten verteilen. Kosten ${model.feeFixed.toFixed(2)} ${cfg.currency} je Kauf/Verkauf, Slippage ${model.slippagePercent.toFixed(2)}% normal/${model.leveragedSlippagePercent.toFixed(2)}% Hebel. Berücksichtige frische Kurse, News, Events, FX und Kosten. Gib keine versteckten Gedankengänge aus, nur kurze Begründungen. JSON {"summary":"kurz","actions":[{"symbol":"TICKER","action":"BUY|SELL|HOLD","confidence":0.0,"allocation_pct":0,"reason":"1 Satz"}]}. BUY nur Kandidaten, SELL nur gehaltene Werte. Kandidaten=${JSON.stringify(data)} Gehalten=${JSON.stringify(held)}`;
    try{const r=await this.env.AI.run(AI_MODEL,{messages:[{role:'user',content:prompt}],max_completion_tokens:900}),t=String(r?.response||r?.result?.response||''),a=t.indexOf('{'),b=t.lastIndexOf('}');if(a<0||b<=a)throw new Error('kein JSON');const j=JSON.parse(t.slice(a,b+1));return{summary:String(j.summary||'KI-Plan').slice(0,500),actions:(Array.isArray(j.actions)?j.actions:[]).map(x=>({symbol:String(x.symbol||'').toUpperCase(),action:String(x.action||'HOLD').toUpperCase(),confidence:clamp(num(x.confidence),0,1),allocation_pct:clamp(num(x.allocation_pct),0,100),reason:String(x.reason||'').slice(0,350)})).filter(x=>['BUY','SELL','HOLD'].includes(x.action))}}catch(e){return{summary:`KI-Fallback: ${String(e.message||e).slice(0,160)}`,actions:[]}}
  }

  open(cand,pct,reason){
    const cfg=this.cfg(),ps=this.positions();if(ps.some(p=>p.symbol===cand.symbol))return false;
    const before=num(cfg.cash);if(before<=0)return false;
    const requestedPct=num(pct)>0?clamp(num(pct),0,100):100;
    let amount=before*requestedPct/100,fee=this.fee(amount,cfg);
    if(amount+fee>before){const fixed=Math.max(0,num(cfg.fee_fixed)),rate=Math.max(0,num(cfg.fee_percent))/100;amount=Math.max(0,(before-fixed)/(1+rate));fee=this.fee(amount,cfg)}
    if(amount<=0||amount+fee>before+1e-8)return false;
    const risk=this.riskCheck(cand,amount,cfg);if(!risk.ok)return false;
    const slip=this.slippage(cand.type,cfg),execPrice=num(cand.price)*(1+slip/100),after=Math.max(0,before-amount-fee),fx=num(cand.fxRate,1);
    this.ctx.storage.sql.exec('INSERT INTO positions(symbol,name,instrument_type,theme,leverage,invested,entry_fee,entry_price,last_price,entry_fx,last_fx,currency,opened_at,score,signal_confidence) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',cand.symbol,cand.name||cand.symbol,cand.type,cand.theme||null,num(cand.leverage,1),amount,fee,execPrice,cand.price,fx,fx,cand.currency||null,nowIso(),cand.score,num(cand.confidence));
    this.ctx.storage.sql.exec('UPDATE config SET cash=?,total_fees=COALESCE(total_fees,0)+? WHERE id=1',after,fee);
    const eq=this.equity(after),roundtrip=(2*fee/Math.max(.01,amount)*100)+(2*Math.max(0,num(cfg.fee_percent)))+(2*slip);
    this.record('KAUF',{symbol:cand.symbol,name:cand.name,type:cand.type,amount:-(amount+fee),fee,cashBefore:before,cashAfter:after,equity:eq,score:cand.score,scanNo:num(cfg.scan_count)+1,reason:`${reason} · Order ${amount.toFixed(2)} ${cfg.currency} (${requestedPct.toFixed(1)}% des verfügbaren Cash) · keine Positions-/Haltezeitgrenze · FX ${fx.toFixed(5)} · geschätzte Roundtrip-Kosten ~${roundtrip.toFixed(2)}%`});
    this.logAI('TRADE','Kauf ausgeführt',`${cand.symbol}: ${reason}. ${requestedPct.toFixed(1)}% des aktuell verfügbaren Cash eingesetzt; keine harte Positions- oder Haltedauergrenze.`,{symbol:cand.symbol,confidence:num(cand.confidence),meta:{score:cand.score,amount}});return true;
  }

  async status(){const s=await super.status();s.sourceHealth=(s.sourceHealth||[]).filter(x=>!REMOVED_SOURCES.has(x.source));return s}

  async lastWeek(){const c=this.cfg(),m=this.executionModel(c);return runLastWeekHindsight(this.env,{feeFixed:m.feeFixed,feePercent:m.feePercent,slippagePercent:m.slippagePercent,leveragedSlippagePercent:m.leveragedSlippagePercent})}
}
