import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v306-anti-churn.js';
import {ManualTradeNudgeGuardV307} from './manual-trade-v307.js';
import {loadTradeRepublicMaster} from './trade-republic-master.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const brokerExact=r=>r?.brokerVerified===true&&String(r?.assetClass||r?.type||'EQUITY').toUpperCase()==='EQUITY'&&String(r?.brokerMatchMode||'').toUpperCase()==='EXACT_NORMALIZED_NAME'&&/Trade Republic/i.test(String(r?.brokerVerificationSource||''))&&/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(r?.isin||''));
const positionValue=(p,price=p?.last_price,fx=p?.last_fx)=>{const ep=num(p?.entry_price),px=num(price,ep),ef=num(p?.entry_fx,1),lf=num(fx,ef);return ep>0&&ef>0?num(p?.invested)*(px/ep)*(lf/ef):num(p?.invested)};
const equity=s=>num(s?.config?.cash)+arr(s?.positions).reduce((a,p)=>a+positionValue(p),0);
const fee=(amount,c)=>Math.max(0,num(c?.fee_fixed))+Math.max(0,num(c?.fee_percent))*Math.max(0,num(amount))/100;
const slip=c=>Math.max(0,num(c?.slippage_percent,.1));
const nextId=rows=>Math.max(0,...arr(rows).map(x=>num(x?.id)))+1;
const nowIso=()=>new Date().toISOString();
function audit(s,action,{symbol='',name='',type='EQUITY',amount=0,feeValue=0,tradePnl=null,cashBefore=0,cashAfter=0,score=null,reason=''}){const eq=equity(s),id=nextId(s.history);s.history=arr(s.history);s.history.push({id,ts:nowIso(),end_ts:null,event_count:1,start_scan:num(s?.config?.scan_count),end_scan:num(s?.config?.scan_count),action,symbol,name,instrument_type:type,amount,fee:feeValue,trade_pnl:tradePnl,cash_before:cashBefore,cash_after:cashAfter,equity:eq,total_pnl:eq-num(s?.config?.start_capital),score,reason});if(s.history.length>800)s.history=s.history.slice(-800);s.aiLog=arr(s.aiLog);s.aiLog.push({id:nextId(s.aiLog),ts:nowIso(),kind:'TRADE',symbol,title:action==='VERKAUF'?'Manueller Paper-Verkauf ausgeführt':'Manueller Paper-Kauf ausgeführt',message:String(reason).slice(0,900),confidence:1,meta:{manualDashboardV3071:true}});if(s.aiLog.length>300)s.aiLog=s.aiLog.slice(-300);return eq}
function closeManual(s,symbol,reason){const i=arr(s.positions).findIndex(p=>key(p)===key(symbol));if(i<0)return{ok:false,error:'Position nicht im Depot.'};const p=s.positions[i],market=num(p?.last_price,p?.entry_price),fx=num(p?.last_fx,p?.entry_fx,1);if(!(market>0&&fx>0))return{ok:false,error:'Kein verwendbarer letzter Paper-Kurs/FX-Wert.'};const exec=market*(1-slip(s.config)/100),gross=positionValue(p,exec,fx),f=fee(gross,s.config),net=Math.max(0,gross-f),before=num(s.config.cash),pl=net-num(p.invested)-num(p.entry_fee);s.positions.splice(i,1);s.config.cash=before+net;s.config.total_fees=num(s.config.total_fees)+f;audit(s,'VERKAUF',{symbol:p.symbol,name:p.name,type:p.instrument_type||'EQUITY',amount:net,feeValue:f,tradePnl:pl,cashBefore:before,cashAfter:s.config.cash,score:p.score,reason:`${reason} · letzter gespeicherter Paper-Kurs ${market} · Slippage ${slip(s.config).toFixed(2)}% · P/L netto ${pl>=0?'+':''}${pl.toFixed(2)} ${s.config.currency||'EUR'}`});return{ok:true,symbol:p.symbol,net:+net.toFixed(4),tradePnl:+pl.toFixed(4)}}
function dynamicPct(c={}){const score=num(c?.daytradeLiveScore,c?.decisionScore??c?.score,50),m5=num(c?.momentum5,c?.momentum5Pct),m20=num(c?.momentum20,c?.momentum20Pct),conf=clamp(num(c?.confidence,.5),0,1);return +clamp(10+Math.max(0,score-58)*2.5+Math.max(0,m5)*5+Math.max(0,m20)*3+Math.max(0,conf-.5)*30,5,100).toFixed(2)}
function severeNews(c={}){return String(c?.event_risk||c?.eventRisk||'NONE').toUpperCase()==='HIGH'||num(c?.news_score,c?.newsScore,0)<-.45}
function recentSellBlocked(s,symbol,now=Date.now()){const row=[...arr(s?.history)].reverse().find(x=>String(x?.action||'').toUpperCase()==='VERKAUF'&&key(x)===key(symbol));if(!row)return false;const t=Date.parse(String(row.ts||''));return Number.isFinite(t)&&now-t>=0&&now-t<30*60*1000}
function weakestIndex(positions=[]){let best=-1,bestScore=Infinity;arr(positions).forEach((p,i)=>{const stable=num(p?.decisionScore,p?.score,50),raw=num(p?.rawDecisionScore,stable),effective=Math.min(stable,raw+5),pl=p?.entry_price?((num(p.last_price,p.entry_price)*num(p.last_fx,p.entry_fx||1))/(num(p.entry_price)*num(p.entry_fx,1))-1)*100:0,score=effective+clamp(pl,-5,5);if(score<bestScore){best=i;bestScore=score}});return best}

export class MarketPortfolio extends BasePortfolio{
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;
    const getState=()=>{try{return this._actualState?.()||this.bucketAdapter?.peekState?.()||{}}catch{return{}}};
    this.__brokerRowsCache=[];this.__brokerRowsAt=0;this.__brokerRowsMeta={source:'none',generatedAt:null,error:null,rowCount:0};
    this.__getBrokerRows=async()=>{
      const now=Date.now();if(this.__brokerRowsCache.length&&now-this.__brokerRowsAt<15*60*1000)return this.__brokerRowsCache;
      const result=await loadTradeRepublicMaster(this.env,{legacyLoader:async()=>this.zeroAssets?._load?.()});
      if(result.rows.length){this.__brokerRowsCache=result.rows;this.__brokerRowsAt=now}
      this.__brokerRowsMeta={source:result.source,generatedAt:result.generatedAt,error:result.error||null,rowCount:result.rows.length||this.__brokerRowsCache.length};
      return this.__brokerRowsCache;
    };
    const ai=this.engine?.env?.AI;if(ai?.run&&!ai.__manualTradeV307){const wrapped=new ManualTradeNudgeGuardV307(ai,{getState,getBrokerRows:this.__getBrokerRows,storage:this.ctx?.storage});wrapped.__manualTradeV307=true;this.manualTradeV307=wrapped;this.engine.env.AI=wrapped}
  }
  async manualTradeIntent(body={}){
    if(!this.manualTradeV307||!this.engine?.store?.update)return{ok:false,status:503,error:'V30.7.1 Manual-Paper-Execution ist nicht initialisiert.'};
    const request=this.manualTradeV307.request(body);if(!request?.ok)return request;const intent=request.intent;
    try{
      if(intent.action==='SELL'){
        const tx=await this.engine.store.update(s=>{const r=closeManual(s,intent.symbol,'V30.7.1 MANUAL DASHBOARD SELL: ausdrücklicher Benutzerimpuls im Paper-Depot');if(!r.ok)throw new Error(r.error);s.config.ai_last_summary=`V30.7.1 Manual: ${intent.symbol} direkt im Paper-Depot verkauft.`;return r});
        const result=tx?.result||{};this.manualTradeV307._finish?.(intent,{executed:true,paperExecuted:true,outcome:'SELL_EXECUTED',execution:result});return{ok:true,intent,executed:true,paperExecuted:true,execution:result,patch:'30.7.1'};
      }
      const rows=await this.__getBrokerRows(),master=new Map(arr(rows).map(r=>[key(r),r])),verified=master.get(intent.symbol);
      if(!brokerExact(verified)){this.manualTradeV307._finish?.(intent,{executed:false,paperExecuted:false,outcome:'NOT_EXACT_TR_VERIFIED'});return{ok:false,status:409,error:'Kauf blockiert: Aktie ist nicht exakt im Trade-Republic-Master verifiziert.',intent}}
      const tx=await this.engine.store.update(s=>{
        const c=arr(s.candidates).find(x=>key(x)===intent.symbol);if(!c)throw new Error('Kauf blockiert: Titel ist kein aktueller Scanner-Kandidat.');if(severeNews(c))throw new Error('Kauf blockiert: harter negativer News/Event-Risikofilter.');
        const updated=Date.parse(String(c.updated_at||''));if(Number.isFinite(updated)&&Date.now()-updated>5*60*1000)throw new Error('Kauf blockiert: Kandidatenkurs ist älter als 5 Minuten.');if(recentSellBlocked(s,intent.symbol))throw new Error('Kauf blockiert: 30-Minuten SELL→REBUY Anti-Churn-Sperre ist aktiv.');if(arr(s.positions).some(p=>key(p)===intent.symbol))throw new Error('Titel ist bereits im Depot; Kandidaten-Kauf ist nur für neue Positionen vorgesehen.');
        const market=num(c.price),base=String(s.config.currency||'EUR').toUpperCase(),cur=String(c.currency||base).toUpperCase(),fx=cur===base?1:num(c.fx_rate,c.fxRate),fxOk=cur===base||c.fx_verified===true||c.fxVerified===true;if(!(market>0&&fx>0&&fxOk))throw new Error('Kauf blockiert: Kurs/FX ist nicht sicher verifiziert.');
        let pairedSell=null;if(arr(s.positions).length>=4){const wi=weakestIndex(s.positions);if(wi<0)throw new Error('Kein freier Depot-Slot.');pairedSell=closeManual(s,s.positions[wi].symbol,`V30.7.1 MANUAL SLOT-ROTATION für Kauf ${intent.symbol}`);if(!pairedSell.ok)throw new Error(pairedSell.error)}
        const pct=intent.allocationPct==null?dynamicPct(c):clamp(intent.allocationPct,1,100),before=num(s.config.cash),budget=before*pct/100,fixed=Math.max(0,num(s.config.fee_fixed)),rate=Math.max(0,num(s.config.fee_percent))/100,notional=Math.max(0,(budget-fixed)/(1+rate)),f=fee(notional,s.config);if(!(notional>0)||notional+f>before+1e-8)throw new Error('Zu wenig verfügbares Cash für den manuellen Paper-Kauf.');
        const exec=market*(1+slip(s.config)/100),addedAt=nowIso();s.config.cash=Math.max(0,before-notional-f);s.config.total_fees=num(s.config.total_fees)+f;s.positions.push({symbol:c.symbol,name:c.name||c.symbol,instrument_type:c.instrument_type||'EQUITY',theme:c.theme||null,company_key:c.company_key||null,invested:notional,entry_fee:f,entry_price:exec,last_price:market,entry_fx:fx,last_fx:fx,fx_verified:fxOk,currency:c.currency||base,quote_currency_raw:c.quote_currency_raw||c.currency||base,quote_price_scale:num(c.quote_price_scale,1),quote_unit_normalized:Boolean(c.quote_unit_normalized),opened_at:addedAt,last_added_at:null,add_count:0,score:num(c.score),decisionScore:num(c.decisionScore,c.score),signal_confidence:num(c.confidence)});audit(s,'KAUF',{symbol:c.symbol,name:c.name,type:c.instrument_type||'EQUITY',amount:-(notional+f),feeValue:f,cashBefore:before,cashAfter:s.config.cash,score:c.score,reason:`V30.7.1 MANUAL DASHBOARD BUY: ${pct.toFixed(2)}% des nach einer eventuellen Slot-Rotation verfügbaren Cashs · exakt Trade-Republic-verifiziert · Slippage ${slip(s.config).toFixed(2)}%`});s.config.ai_last_summary=`V30.7.1 Manual: ${intent.symbol} direkt mit ${pct.toFixed(1)}% Cash-Anteil im Paper-Depot gekauft.`;return{ok:true,symbol:intent.symbol,allocationPct:pct,notional:+notional.toFixed(4),pairedSell}});
        const result=tx?.result||{};this.manualTradeV307._finish?.(intent,{executed:true,paperExecuted:true,outcome:'BUY_EXECUTED',allocationPct:result.allocationPct,execution:result});return{ok:true,intent,executed:true,paperExecuted:true,execution:result,patch:'30.7.1'};
    }catch(e){const error=String(e?.message||e);this.manualTradeV307._finish?.(intent,{executed:false,paperExecuted:false,outcome:'EXECUTION_BLOCKED',error:error.slice(0,240)});return{ok:false,status:409,error,intent,patch:'30.7.1'}}
  }
  async status(){
    const s=await super.status(),manual=this.manualTradeV307?.status?.()||{enabled:true,version:30.7,mode:'manual-dashboard-nudge',maxAllocationPct:100,noFixedSinglePositionCap:true};
    try{await this.__getBrokerRows()}catch{}
    s.runtimeVersion='V30.7';s.liveDecisionVersion='V30.7';s.manualTradePolicy={...manual,patch:'30.7.2-assets-master-resolver',directPaperExecution:true,manualSellUsesLastStoredPaperQuote:true,buyHardSafetyPreserved:true,brokerMaster:{...this.__brokerRowsMeta}};
    s.canonicalScorePolicy={...(s.canonicalScorePolicy||{}),version:30.7,manualDashboardNudge:true,noFixedSinglePositionCap:true,maxAllocationPct:100};
    if(s?.finalDecisionPolicy)s.finalDecisionPolicy={...s.finalDecisionPolicy,version:30.7,manualDashboardNudge:true,noFixedSinglePositionCap:true,maxAllocationPct:100,rule:`${String(s.finalDecisionPolicy.rule||'').slice(0,260)} V30.7.2: Dashboard-SELL wird direkt im Paper-Ledger ausgeführt; Dashboard-BUY direkt nach TR-, News-, Quote/FX- und Anti-Churn-Prüfung. Der Trade-Republic-Master wird direkt aus dem Cloudflare-ASSETS-universe.json geladen. Kein fixer 25%-Deckel; bis 100% des verfügbaren Cashs ohne Hebel.`};
    if(s?.executionModel)s.executionModel={...s.executionModel,manualDashboardNudgeV307:true,manualDirectPaperExecutionV3071:true,tradeRepublicAssetsMaster:true,noFixedSinglePositionCap:true,maxSinglePositionPctOfEquity:100,maxManualAllocationPct:100,noLeverage:true};
    if(s?.relativeRotationPolicy)s.relativeRotationPolicy={...s.relativeRotationPolicy,maxSinglePositionPct:100};if(s?.heldCashDeploymentPolicy)s.heldCashDeploymentPolicy={...s.heldCashDeploymentPolicy,maxSinglePositionPct:100};if(s?.profitOpportunityPolicy)s.profitOpportunityPolicy={...s.profitOpportunityPolicy,maxSinglePositionPct:100};if(s?.weakestPositionReplacementPolicy)s.weakestPositionReplacementPolicy={...s.weakestPositionReplacementPolicy,maxSinglePositionPct:100};return s;
  }
}