import {MarketPortfolio as FinalPortfolio} from './portfolio-final.js';
import {scanMarket} from './market-v3.js';
import {num,nowIso,riskParams,clamp} from './constants.js';

const EMPTY_RSS='<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>disabled</title></channel></rss>';

function entityKey(x){
  if((x?.type||x?.instrument_type)==='ETF')return `ETF:${x?.symbol||''}`;
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
    const p=num(pct);
    if(!Number.isFinite(p)||p<=0)return false;
    return super.open(candidate,clamp(p,0,100),reason);
  }

  async aiPlan(candidates,positions,cfg) {
    return super.aiPlan(
      dedupeRows(candidates,positions),
      (positions||[]).filter(x=>x.instrument_type!=='LEVERAGED_ETF'),
      {...cfg,include_etfs:1,include_leverage:0}
    );
  }

  async scan() {
    this.ctx.storage.sql.exec('UPDATE config SET include_etfs=1,include_leverage=0 WHERE id=1');
    for(const p of this.positions().filter(x=>x.instrument_type==='LEVERAGED_ETF'))this.close(p.symbol,p.last_price,p.last_fx,p.score,'Hebel-/Inverse-Produkte wurden aus dem Planspiel entfernt');

    let cfg=this.cfg();
    if(!cfg.running)return{ok:true,skipped:'not-running'};
    const now=Date.now();
    if(num(cfg.scan_lock_until)>now)return{ok:true,skipped:'busy'};
    this.ctx.storage.sql.exec('UPDATE config SET scan_lock_until=? WHERE id=1',now+55000);

    const nativeFetch=globalThis.fetch;
    globalThis.fetch=async(input,init)=>{
      try{const raw=typeof input==='string'||input instanceof URL?String(input):input?.url;if(raw&&new URL(raw).hostname==='news.google.com')return new Response(EMPTY_RSS,{status:200,headers:{'content-type':'application/rss+xml;charset=utf-8','cache-control':'public,max-age=900'}})}catch{}
      return nativeFetch(input,init);
    };

    try{
      cfg=this.cfg();
      if(cfg.ends_at&&now>=Date.parse(cfg.ends_at)){
        for(const p of this.positions())this.close(p.symbol,p.last_price,p.last_fx,p.score,'Planspiel-Zeitraum beendet (letzter bekannter Kurs)');
        this.ctx.storage.sql.exec('UPDATE config SET running=0,scan_lock_until=0 WHERE id=1');
        this.logAI('SYSTEM','Planspiel beendet','Laufzeit erreicht; offene Positionen wurden mit dem letzten verfügbaren Planspielkurs geschlossen.');
        return{ok:true,finished:true};
      }

      const held=this.positions();
      const m=await scanMarket(this.env,{...cfg,include_etfs:1,include_leverage:0},held.map(p=>p.symbol));
      const candidates=dedupeRows(m.candidates,held),newsRadar=dedupeRows(m.newsRadar,held);
      const uniqueUniverse=dedupeRows(m.universe,held);
      const ms=m.marketState||{mode:'NEWS_ONLY',activeMarkets:[],openSymbols:0,closedSymbols:uniqueUniverse.length};
      this.ctx.storage.sql.exec('UPDATE config SET universe_count=?,universe_generated_at=?,calendar_generated_at=?,market_mode=?,active_markets=?,open_symbols=?,closed_symbols=? WHERE id=1',uniqueUniverse.length,m.generatedAt||null,m.calendarGeneratedAt||null,ms.mode,JSON.stringify(ms.activeMarkets||[]),num(ms.openSymbols),num(ms.closedSymbols));
      this.candidateRows(candidates);this.upsertNews(newsRadar);this.upsertHealth(m.health);
      for(const p of held){const c=candidates.find(x=>x.symbol===p.symbol);if(c)this.ctx.storage.sql.exec('UPDATE positions SET last_price=?,last_fx=?,score=?,signal_confidence=? WHERE symbol=?',c.price,num(c.fxRate,1),c.score,num(c.confidence),p.symbol)}

      const oldTrend=cfg.news_tendency_label,trend=this.newsTrend(),nextScan=num(cfg.scan_count)+1,newsSummary=await this.aiNewsSummary(trend,cfg,nextScan);
      this.ctx.storage.sql.exec('UPDATE config SET news_tendency_score=?,news_tendency_label=?,news_tendency_summary=?,news_radar_updated_at=? WHERE id=1',trend.score,trend.label,newsSummary,nowIso());
      if(oldTrend&&oldTrend!==trend.label)this.logAI('NEWS','News-Tendenz geändert',`${oldTrend} → ${trend.label} (${trend.score.toFixed(2)}).`,{confidence:Math.min(1,Math.abs(trend.score))});

      if(ms.mode==='NEWS_ONLY'){
        cfg=this.cfg();const eq=this.equity(cfg.cash),t=nowIso(),summary=`NEWS-ONLY: Märkte geschlossen. News bleiben bis zur jeweiligen nächsten Börsenöffnung handelszeitlich frisch. Tendenz ${trend.label} (${trend.score.toFixed(2)}).`;
        this.ctx.storage.sql.exec('UPDATE config SET ai_last_summary=? WHERE id=1',summary);
        this.record('HALTEN',{cashBefore:num(cfg.cash),cashAfter:num(cfg.cash),equity:eq,scanNo:nextScan,reason:summary});
        this.ctx.storage.sql.exec('INSERT INTO snapshots(ts,equity,cash) VALUES(?,?,?)',t,eq,num(cfg.cash));
        this.ctx.storage.sql.exec('UPDATE config SET last_scan=?,scan_count=?,last_error=NULL,scan_lock_until=0 WHERE id=1',t,nextScan);
        return{ok:true,equity:eq,actions:0,marketMode:ms.mode,newsTrend:trend.label};
      }

      const current=this.positions(),ai=await this.aiPlan(candidates,current,cfg),am=new Map(ai.actions.map(x=>[x.symbol,x]));
      this.ctx.storage.sql.exec('UPDATE config SET ai_last_summary=? WHERE id=1',ai.summary);
      const fallbackMode=!cfg.ai_enabled||String(ai.summary||'').startsWith('KI-Fallback:');
      const rp=riskParams(cfg.risk_mode);let actions=0;

      // Keine erzwungenen Stop-/Take-Prozentregeln: bei aktiver KI entscheidet die KI selbst.
      // Nur bei deaktivierter/ausgefallener KI greift ein klar gekennzeichneter starker Signal-Fallback.
      for(const p of this.positions()){
        const c=candidates.find(x=>x.symbol===p.symbol);if(!c||!c.fresh)continue;
        const a=am.get(p.symbol);let why=null;
        if(a?.action==='SELL'&&a.confidence>=.55)why=`KI SELL ${Math.round(a.confidence*100)}%: ${a.reason}`;
        else if(fallbackMode&&c.score<=-1.5&&c.confidence>=.50)why=`Signal-Fallback wegen nicht verfügbarer KI: Score ${c.score.toFixed(2)}`;
        if(why&&this.close(p.symbol,c.price,c.fxRate,c.score,why))actions++;
      }

      cfg=this.cfg();const existing=this.positions(),buy=[];
      for(const c of candidates){
        if(!c.fresh||existing.some(p=>p.symbol===c.symbol)||existing.some(p=>entityKey(p)===entityKey(c)))continue;
        const a=am.get(c.symbol);
        if(a?.action==='BUY'&&a.confidence>=.55&&num(a.allocation_pct)>0)buy.push({c,a,k:c.score+a.confidence+c.confidence});
      }
      if(!buy.length&&fallbackMode){
        const top=candidates.filter(x=>x.fresh&&x.confidence>=.55&&x.score>=rp.entry&&!existing.some(p=>entityKey(p)===entityKey(x))).sort((a,b)=>(b.score+b.confidence)-(a.score+a.confidence))[0];
        if(top)buy.push({c:top,a:{allocation_pct:100,confidence:top.confidence,reason:`stärkstes verfügbares Signal ${top.score.toFixed(2)}`},k:top.score+top.confidence,fallback:true});
      }
      buy.sort((a,b)=>b.k-a.k);

      // KI-Prozente beziehen sich auf das Cash zu Beginn dieses Kaufblocks, nicht rekursiv auf
      // das nach jedem Kauf verbleibende Cash. Gebühren werden aus dem jeweiligen Budget bezahlt.
      const scanCash=num(this.cfg().cash),sumPct=buy.reduce((s,x)=>s+clamp(num(x.a?.allocation_pct),0,100),0),scale=sumPct>100?100/sumPct:1;
      for(const x of buy){
        const budgetPct=clamp(num(x.a?.allocation_pct)*scale,0,100);if(budgetPct<=0)continue;
        const totalBudget=scanCash*budgetPct/100,currentCash=num(this.cfg().cash);if(totalBudget<=0||currentCash<=0)break;
        const fixed=Math.max(0,num(this.cfg().fee_fixed)),rate=Math.max(0,num(this.cfg().fee_percent))/100;
        const targetOrder=Math.max(0,(Math.min(totalBudget,currentCash)-fixed)/(1+rate));if(targetOrder<=0)continue;
        const pctOfCurrent=clamp(targetOrder/currentCash*100,0,100);
        const why=x.fallback?`Regel-Fallback: ${x.a.reason}`:`KI BUY ${Math.round(x.a.confidence*100)}%: ${x.a.reason}`;
        if(this.open(x.c,pctOfCurrent,why))actions++;
      }

      cfg=this.cfg();const eq=this.equity(cfg.cash),count=num(cfg.scan_count)+1,t=nowIso();
      if(!actions){const top=candidates[0],reason=top?`Kein Trade. Bestes Signal ${top.symbol}: Score ${top.score.toFixed(2)}, Konfidenz ${Math.round(top.confidence*100)}%.`:'Keine frischen handelbaren Signale.';this.record('HALTEN',{cashBefore:num(cfg.cash),cashAfter:num(cfg.cash),equity:eq,reason,scanNo:count});if(top&&count%10===0&&top.confidence>=.55)this.logAI('IDEA','Beobachtungskandidat',`${top.symbol}: ${reason} Pro: ${(top.pro||[]).slice(0,2).join(', ')||'–'}; Contra: ${(top.contra||[]).slice(0,2).join(', ')||'–'}.`,{symbol:top.symbol,confidence:top.confidence})}
      this.ctx.storage.sql.exec('INSERT INTO snapshots(ts,equity,cash) VALUES(?,?,?)',t,eq,num(cfg.cash));
      this.ctx.storage.sql.exec('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 3000)');
      this.ctx.storage.sql.exec('UPDATE config SET last_scan=?,scan_count=?,last_error=NULL,scan_lock_until=0 WHERE id=1',t,count);
      return{ok:true,equity:eq,actions,marketMode:ms.mode,newsTrend:trend.label,ai:ai.summary};
    }catch(e){
      const msg=String(e?.message||e).slice(0,900),c=this.cfg(),eq=this.equity(c.cash);
      this.record('FEHLER',{cashBefore:num(c.cash),cashAfter:num(c.cash),equity:eq,reason:`Scan fehlgeschlagen: ${msg}`,scanNo:num(c.scan_count)+1});
      this.logAI('ERROR','Scan-Fehler',msg);this.ctx.storage.sql.exec('UPDATE config SET last_error=?,scan_lock_until=0 WHERE id=1',msg);
      return{ok:false,error:msg};
    }finally{globalThis.fetch=nativeFetch}
  }

  async status() {
    const s=await super.status();
    if(s?.config){s.config.include_etfs=1;s.config.include_leverage=0}
    s.positions=(s.positions||[]).filter(x=>x.instrument_type!=='LEVERAGED_ETF');
    s.candidates=dedupeRows(s.candidates||[],s.positions);
    s.newsRadar=dedupeRows(s.newsRadar||[],s.positions);
    if(s?.risk){s.risk.leverPct=0;s.risk.hardLimits=false;s.risk.budgetOnly=true}
    return s;
  }

  async lastWeek() {
    const r=await this.env.ASSETS.fetch(new Request('https://assets.local/analysis-2026.json'));
    if(!r.ok)throw new Error('2026-Auswertung wird gerade vorbereitet. Bitte spaeter erneut versuchen.');
    const a=await r.json();
    return {label:`01.01.2026 – ${a.period?.to||'heute'}`,...a.perfect,walkForward:a.walkForward,universeCounts:a.universe,scannedSymbols:a.scannedSymbols,usableSymbols:a.usableSymbols};
  }
}
