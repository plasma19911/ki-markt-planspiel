import {MarketPortfolio as FinalPortfolio} from './portfolio-final.js';
import {scanMarket} from './market-v3.js';
import {num,nowIso,riskParams,clamp,chunks} from './constants.js';

const EMPTY_RSS='<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>disabled</title></channel></rss>';
const QUOTE_HEADERS={'accept':'application/json','user-agent':'Mozilla/5.0'};

function entityKey(x){
  if((x?.type||x?.instrument_type)==='ETF')return `ETF:${x?.symbol||''}`;
  if(x?.companyKey)return `EQ:${String(x.companyKey).toUpperCase()}`;
  const junk=new Set(['INC','INCORPORATED','CORP','CORPORATION','CO','COMPANY','LTD','LIMITED','PLC','AG','SE','NV','SA','SPA','HOLDING','HOLDINGS','GROUP','ORD','ORDINARY','SHARE','SHARES','SHS','REGISTERED','REG','ADR','GDR','CDR','DRN','BDR','ADS','CLASS','CL','SERIES','THE','AND','R','ED','HEDGED']);
  const toks=String(x?.name||x?.symbol||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').split(/\s+/).filter(Boolean).filter(t=>t.length>1&&!junk.has(t)).map(t=>t.length>9?t.slice(0,9):t);
  const uniq=[];for(const t of toks)if(uniq.at(-1)!==t)uniq.push(t);
  return `EQ:${uniq.slice(0,7).join(' ')||String(x?.symbol||'').split('.')[0]}`;
}

function dedupeRows(rows,held=[]){
  const heldKeys=new Set((held||[]).map(entityKey)),best=new Map();
  for(const x of rows||[]){
    if(x?.type==='LEVERAGED_ETF'||x?.instrument_type==='LEVERAGED_ETF')continue;
    const key=entityKey(x),old=best.get(key),rank=num(x.score)+num(x.confidence)*.7+Math.abs(num(x.newsScore??x.news_score))*.1;
    if(!old||rank>old.rank)best.set(key,{x,rank,held:heldKeys.has(key)});
  }
  return [...best.values()].sort((a,b)=>b.rank-a.rank).map(v=>v.x);
}

function normalizedCurrency(v){const c=String(v||'').trim();if(c==='GBp'||c.toUpperCase()==='GBX')return'GBP';return c.toUpperCase()}

async function fetchHeldQuotes(positions,baseCurrency){
  const ps=(positions||[]).filter(p=>p?.symbol&&p.instrument_type!=='LEVERAGED_ETF');
  if(!ps.length)return new Map();
  const base=normalizedCurrency(baseCurrency||'EUR')||'EUR';
  const currencies=[...new Set(ps.map(p=>normalizedCurrency(p.currency)).filter(c=>c&&c!==base))];
  const pairs=[];for(const c of currencies)pairs.push(`${c}${base}=X`,`${base}${c}=X`);
  const symbols=[...new Set([...ps.map(p=>String(p.symbol).toUpperCase()),...pairs])],raw=new Map();
  for(const batch of chunks(symbols,40)){
    try{
      const u=new URL('https://query1.finance.yahoo.com/v7/finance/spark');u.searchParams.set('symbols',batch.join(','));u.searchParams.set('range','1d');u.searchParams.set('interval','5m');u.searchParams.set('indicators','close');u.searchParams.set('includePrePost','false');
      const r=await fetch(u,{headers:QUOTE_HEADERS});if(!r.ok)continue;const j=await r.json();
      for(const item of j?.spark?.result||[]){
        const res=item?.response?.[0];if(!res)continue;const meta=res.meta||{},sym=String(item.symbol||meta.symbol||'').toUpperCase();
        const closes=(res?.indicators?.quote?.[0]?.close||[]).filter(v=>Number.isFinite(Number(v))).map(Number);if(!sym||!closes.length)continue;
        const price=num(meta.regularMarketPrice,closes.at(-1)),prev=num(meta.previousClose,closes[0]),back=closes[Math.max(0,closes.length-4)],day=prev?(price/prev-1)*100:0,mom=back?(price/back-1)*100:0;
        const ts=num(meta.regularMarketTime,0),fresh=ts>0&&(Date.now()/1000-ts)<35*60;
        raw.set(sym,{price,score:day*.65+mom*1.35,dayChange:day,momentum:mom,fresh,marketTimestamp:ts});
      }
    }catch{}
  }
  const fx={[base]:1};for(const c of currencies){const d=raw.get(`${c}${base}=X`)?.price,inv=raw.get(`${base}${c}=X`)?.price;fx[c]=num(d)>0?num(d):num(inv)>0?1/num(inv):null}
  const out=new Map();for(const p of ps){const q=raw.get(String(p.symbol).toUpperCase());if(!q)continue;const cur=normalizedCurrency(p.currency),rate=cur===base?1:(num(fx[cur],0)>0?num(fx[cur]):num(p.last_fx,1));out.set(p.symbol,{symbol:p.symbol,name:p.name,type:p.instrument_type,price:q.price,fxRate:rate,score:q.score,confidence:num(p.signal_confidence,.5),fresh:q.fresh,dayChange:q.dayChange,momentum5:q.momentum,momentum20:q.momentum,newsScore:0})}
  return out;
}

export class MarketPortfolio extends FinalPortfolio {
  async start(options={}) {
    const r=await super.start({...options,includeEtfs:true,includeLeverage:false});
    this.ctx.storage.sql.exec('UPDATE config SET include_etfs=1,include_leverage=0 WHERE id=1');
    return r;
  }

  async reset() {
    const r=await super.reset();
    this.ctx.storage.sql.exec('UPDATE config SET include_etfs=1,include_leverage=0 WHERE id=1');
    return r;
  }

  open(candidate,pct,reason) {
    if(candidate?.type==='LEVERAGED_ETF')return false;
    const p=num(pct);if(!Number.isFinite(p)||p<=0)return false;
    return super.open(candidate,clamp(p,0,100),reason);
  }

  async aiPlan(candidates,positions,cfg) {
    return super.aiPlan(dedupeRows(candidates,positions),(positions||[]).filter(x=>x.instrument_type!=='LEVERAGED_ETF'),{...cfg,include_etfs:1,include_leverage:0});
  }

  async scan() {
    this.ctx.storage.sql.exec('UPDATE config SET include_etfs=1,include_leverage=0 WHERE id=1');
    for(const p of this.positions().filter(x=>x.instrument_type==='LEVERAGED_ETF'))this.close(p.symbol,p.last_price,p.last_fx,p.score,'Hebel-/Inverse-Produkte wurden aus dem Planspiel entfernt');
    let cfg=this.cfg();if(!cfg.running)return{ok:true,skipped:'not-running'};
    const now=Date.now();if(num(cfg.scan_lock_until)>now)return{ok:true,skipped:'busy'};this.ctx.storage.sql.exec('UPDATE config SET scan_lock_until=? WHERE id=1',now+55000);

    const nativeFetch=globalThis.fetch;
    globalThis.fetch=async(input,init)=>{try{const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;if(raw&&new URL(raw).hostname==='news.google.com')return new Response(EMPTY_RSS,{status:200,headers:{'content-type':'application/rss+xml;charset=utf-8','cache-control':'public,max-age=900'}})}catch{}return nativeFetch(input,init)};

    try{
      cfg=this.cfg();
      if(cfg.ends_at&&now>=Date.parse(cfg.ends_at)){
        for(const p of this.positions())this.close(p.symbol,p.last_price,p.last_fx,p.score,'Planspiel-Zeitraum beendet (letzter bekannter Kurs)');
        this.ctx.storage.sql.exec('UPDATE config SET running=0,scan_lock_until=0 WHERE id=1');this.logAI('SYSTEM','Planspiel beendet','Laufzeit erreicht; offene Positionen wurden mit dem letzten verfügbaren Planspielkurs geschlossen.');return{ok:true,finished:true};
      }

      const held=this.positions();
      // Deep-Scan bleibt auf die besten Neukauf-Signale begrenzt. Gehaltene Positionen werden
      // separat in wenigen gebuendelten Spark-Requests aktualisiert, damit die Requestzahl nicht
      // mit der Positionszahl explodiert.
      const m=await scanMarket(this.env,{...cfg,include_etfs:1,include_leverage:0},[]);
      const candidates=dedupeRows(m.candidates,held),newsRadar=dedupeRows(m.newsRadar,held),uniqueUniverse=dedupeRows(m.universe,held);
      const ms=m.marketState||{mode:'NEWS_ONLY',activeMarkets:[],openSymbols:0,closedSymbols:uniqueUniverse.length};
      const heldMap=ms.mode==='NEWS_ONLY'?new Map():await fetchHeldQuotes(held,cfg.currency);
      this.ctx.storage.sql.exec('UPDATE config SET universe_count=?,universe_generated_at=?,calendar_generated_at=?,market_mode=?,active_markets=?,open_symbols=?,closed_symbols=? WHERE id=1',uniqueUniverse.length,m.generatedAt||null,m.calendarGeneratedAt||null,ms.mode,JSON.stringify(ms.activeMarkets||[]),num(ms.openSymbols),num(ms.closedSymbols));
      this.candidateRows(candidates);this.upsertNews(newsRadar);this.upsertHealth(m.health);
      for(const p of held){const deep=candidates.find(x=>x.symbol===p.symbol),q=deep||heldMap.get(p.symbol);if(q&&q.fresh)this.ctx.storage.sql.exec('UPDATE positions SET last_price=?,last_fx=?,score=?,signal_confidence=? WHERE symbol=?',q.price,num(q.fxRate,p.last_fx),num(q.score,p.score),num(q.confidence,p.signal_confidence),p.symbol)}

      const oldTrend=cfg.news_tendency_label,trend=this.newsTrend(),nextScan=num(cfg.scan_count)+1,newsSummary=await this.aiNewsSummary(trend,cfg,nextScan);
      this.ctx.storage.sql.exec('UPDATE config SET news_tendency_score=?,news_tendency_label=?,news_tendency_summary=?,news_radar_updated_at=? WHERE id=1',trend.score,trend.label,newsSummary,nowIso());if(oldTrend&&oldTrend!==trend.label)this.logAI('NEWS','News-Tendenz geändert',`${oldTrend} → ${trend.label} (${trend.score.toFixed(2)}).`,{confidence:Math.min(1,Math.abs(trend.score))});

      if(ms.mode==='NEWS_ONLY'){
        cfg=this.cfg();const eq=this.equity(cfg.cash),t=nowIso(),summary=`NEWS-ONLY: Märkte geschlossen. News bleiben bis zur jeweiligen nächsten Börsenöffnung handelszeitlich frisch. Tendenz ${trend.label} (${trend.score.toFixed(2)}).`;
        this.ctx.storage.sql.exec('UPDATE config SET ai_last_summary=? WHERE id=1',summary);this.record('HALTEN',{cashBefore:num(cfg.cash),cashAfter:num(cfg.cash),equity:eq,scanNo:nextScan,reason:summary});this.ctx.storage.sql.exec('INSERT INTO snapshots(ts,equity,cash) VALUES(?,?,?)',t,eq,num(cfg.cash));this.ctx.storage.sql.exec('UPDATE config SET last_scan=?,scan_count=?,last_error=NULL,scan_lock_until=0 WHERE id=1',t,nextScan);return{ok:true,equity:eq,actions:0,marketMode:ms.mode,newsTrend:trend.label};
      }

      const current=this.positions(),ai=await this.aiPlan(candidates,current,cfg),am=new Map(ai.actions.map(x=>[x.symbol,x]));this.ctx.storage.sql.exec('UPDATE config SET ai_last_summary=? WHERE id=1',ai.summary);
      const fallbackMode=!cfg.ai_enabled||String(ai.summary||'').startsWith('KI-Fallback:');const rp=riskParams(cfg.risk_mode);let actions=0;

      for(const p of this.positions()){
        const c=candidates.find(x=>x.symbol===p.symbol)||heldMap.get(p.symbol);if(!c||!c.fresh)continue;
        const a=am.get(p.symbol);let why=null;if(a?.action==='SELL'&&a.confidence>=.55)why=`KI SELL ${Math.round(a.confidence*100)}%: ${a.reason}`;else if(fallbackMode&&num(c.score)<=-1.5)why=`Signal-Fallback wegen nicht verfügbarer KI: Score ${num(c.score).toFixed(2)}`;
        if(why&&this.close(p.symbol,c.price,c.fxRate,c.score,why))actions++;
      }

      cfg=this.cfg();const existing=this.positions(),buy=[];
      for(const c of candidates){if(!c.fresh||existing.some(p=>p.symbol===c.symbol)||existing.some(p=>entityKey(p)===entityKey(c)))continue;const a=am.get(c.symbol);if(a?.action==='BUY'&&a.confidence>=.55&&num(a.allocation_pct)>0)buy.push({c,a,k:c.score+a.confidence+c.confidence})}
      if(!buy.length&&fallbackMode){const top=candidates.filter(x=>x.fresh&&x.confidence>=.55&&x.score>=rp.entry&&!existing.some(p=>entityKey(p)===entityKey(x))).sort((a,b)=>(b.score+b.confidence)-(a.score+a.confidence))[0];if(top)buy.push({c:top,a:{allocation_pct:100,confidence:top.confidence,reason:`stärkstes verfügbares Signal ${top.score.toFixed(2)}`},k:top.score+top.confidence,fallback:true})}
      buy.sort((a,b)=>b.k-a.k);
      const scanCash=num(this.cfg().cash),sumPct=buy.reduce((s,x)=>s+clamp(num(x.a?.allocation_pct),0,100),0),scale=sumPct>100?100/sumPct:1;
      for(const x of buy){const budgetPct=clamp(num(x.a?.allocation_pct)*scale,0,100);if(budgetPct<=0)continue;const totalBudget=scanCash*budgetPct/100,currentCash=num(this.cfg().cash);if(totalBudget<=0||currentCash<=0)break;const fixed=Math.max(0,num(this.cfg().fee_fixed)),rate=Math.max(0,num(this.cfg().fee_percent))/100,targetOrder=Math.max(0,(Math.min(totalBudget,currentCash)-fixed)/(1+rate));if(targetOrder<=0)continue;const pctOfCurrent=clamp(targetOrder/currentCash*100,0,100),why=x.fallback?`Regel-Fallback: ${x.a.reason}`:`KI BUY ${Math.round(x.a.confidence*100)}%: ${x.a.reason}`;if(this.open(x.c,pctOfCurrent,why))actions++}

      cfg=this.cfg();const eq=this.equity(cfg.cash),count=num(cfg.scan_count)+1,t=nowIso();if(!actions){const top=candidates[0],reason=top?`Kein Trade. Bestes Signal ${top.symbol}: Score ${top.score.toFixed(2)}, Konfidenz ${Math.round(top.confidence*100)}%.`:'Keine frischen handelbaren Signale.';this.record('HALTEN',{cashBefore:num(cfg.cash),cashAfter:num(cfg.cash),equity:eq,reason,scanNo:count});if(top&&count%10===0&&top.confidence>=.55)this.logAI('IDEA','Beobachtungskandidat',`${top.symbol}: ${reason} Pro: ${(top.pro||[]).slice(0,2).join(', ')||'–'}; Contra: ${(top.contra||[]).slice(0,2).join(', ')||'–'}.`,{symbol:top.symbol,confidence:top.confidence})}
      this.ctx.storage.sql.exec('INSERT INTO snapshots(ts,equity,cash) VALUES(?,?,?)',t,eq,num(cfg.cash));this.ctx.storage.sql.exec('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 3000)');this.ctx.storage.sql.exec('UPDATE config SET last_scan=?,scan_count=?,last_error=NULL,scan_lock_until=0 WHERE id=1',t,count);return{ok:true,equity:eq,actions,marketMode:ms.mode,newsTrend:trend.label,ai:ai.summary};
    }catch(e){const msg=String(e?.message||e).slice(0,900),c=this.cfg(),eq=this.equity(c.cash);this.record('FEHLER',{cashBefore:num(c.cash),cashAfter:num(c.cash),equity:eq,reason:`Scan fehlgeschlagen: ${msg}`,scanNo:num(c.scan_count)+1});this.logAI('ERROR','Scan-Fehler',msg);this.ctx.storage.sql.exec('UPDATE config SET last_error=?,scan_lock_until=0 WHERE id=1',msg);return{ok:false,error:msg}}
    finally{globalThis.fetch=nativeFetch}
  }

  async status() {
    const s=await super.status();if(s?.config){s.config.include_etfs=1;s.config.include_leverage=0}s.positions=(s.positions||[]).filter(x=>x.instrument_type!=='LEVERAGED_ETF');s.candidates=dedupeRows(s.candidates||[],s.positions);s.newsRadar=dedupeRows(s.newsRadar||[],s.positions);if(s?.risk){s.risk.leverPct=0;s.risk.hardLimits=false;s.risk.budgetOnly=true}return s;
  }

  async lastWeek() {
    const r=await this.env.ASSETS.fetch(new Request('https://assets.local/analysis-2026.json'));if(!r.ok)throw new Error('2026-Auswertung wird gerade vorbereitet. Bitte spaeter erneut versuchen.');const a=await r.json();return {label:`01.01.2026 – ${a.period?.to||'heute'}`,...a.perfect,walkForward:a.walkForward,universeCounts:a.universe,scannedSymbols:a.scannedSymbols,usableSymbols:a.usableSymbols};
  }
}
