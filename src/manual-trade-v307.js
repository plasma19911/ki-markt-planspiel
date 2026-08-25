const KEY='state/manual-trade-v307';
const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const NON_BROKER_HARD=/HARD[- ]?EVENT|NEWS-SHOCK|STALE QUOTE|BAD QUOTE|FX[- ]?SAFETY|REENTRY|SELL.?REBUY|ANTI-CHURN|SUSPEND|HALT|DELIST|MARKET CLOSED/i;
const BROKER_HARD=/TRADE-REPUBLIC-BLOCK|TARGET-VENUE/i;

function read(storage){try{return storage?.kv?.get(KEY)||{pending:null,recent:[]}}catch{return{pending:null,recent:[]}}}
function write(storage,v){try{storage?.kv?.put(KEY,v)}catch{}}
function brokerExact(c={}){return c?.brokerVerified===true&&String(c?.assetClass||c?.type||c?.instrument_type||'EQUITY').toUpperCase()==='EQUITY'&&String(c?.brokerMatchMode||'').toUpperCase()==='EXACT_NORMALIZED_NAME'&&/Trade Republic/i.test(String(c?.brokerVerificationSource||''))&&/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(String(c?.isin||''))}
function promptCandidates(input){for(const m of arr(input?.messages)){const t=String(m?.content||''),a=t.indexOf('Kandidaten='),b=t.indexOf(' Gehalten=',a+11);if(a<0||b<0)continue;try{const x=JSON.parse(t.slice(a+11,b).trim());if(Array.isArray(x))return x}catch{}}return[]}
function parse(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,p){const raw=JSON.stringify(p);if(r?.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};return{...r,response:raw}}
function isPlan(input){return arr(input?.messages).some(m=>String(m?.content||'').includes('Kandidaten=')&&String(m?.content||'').includes(' Gehalten='))}
function mergeCandidates(state,input,brokerRows){const map=new Map();for(const c of arr(state?.candidates)){const s=key(c);if(s)map.set(s,{...c})}for(const c of promptCandidates(input)){const s=key(c);if(s)map.set(s,{...(map.get(s)||{}),...c})}const master=new Map(arr(brokerRows).map(r=>[key(r),r]));for(const [s,c] of map){const r=master.get(s);if(r)map.set(s,{...c,isin:r?.isin||c?.isin||null,assetClass:String(r?.assetClass||c?.assetClass||'EQUITY').toUpperCase(),brokerVerified:r?.brokerVerified===true,brokerVerificationSource:r?.brokerVerificationSource||c?.brokerVerificationSource||null,brokerMatchMode:r?.brokerMatchMode||c?.brokerMatchMode||null,tradeRepublicName:r?.tradeRepublicName||c?.tradeRepublicName||null})}return map}
function scoreOf(x={}){return num(x?.daytradeLiveScore,x?.decisionScore??x?.score??x?.pcDeepScore,50)}
function weakestHeld(positions=[]){return [...positions].sort((a,b)=>{const ae=Math.min(num(a?.decisionScore,a?.score,50),num(a?.rawDecisionScore,a?.decisionScore??a?.score,50)+5),be=Math.min(num(b?.decisionScore,b?.score,50),num(b?.rawDecisionScore,b?.decisionScore??b?.score,50)+5);return ae-be})[0]||null}
function dynamicPct(c={}){const s=scoreOf(c),confidence=clamp(num(c?.confidence,c?.signal_confidence,.5),0,1),m5=num(c?.momentum5Pct,c?.momentum5),m20=num(c?.momentum20Pct,c?.momentum20);return +clamp(8+Math.max(0,s-58)*2.2+Math.max(0,confidence-.5)*35+Math.max(0,m5)*4+Math.max(0,m20)*2,5,100).toFixed(2)}

export class ManualTradeNudgeGuardV307{
  constructor(inner,{getState,getBrokerRows,storage,now}={}){this.inner=inner;this.getState=getState;this.getBrokerRows=getBrokerRows;this.storage=storage;this.now=now;this.latest=null}
  request(intent={}){
    const action=String(intent?.action||'').toUpperCase(),symbol=key(intent?.symbol);if(!['BUY','SELL'].includes(action)||!symbol)return{ok:false,status:400,error:'Aktion BUY/SELL und gueltiges Symbol erforderlich.'};
    const pct=intent?.allocationPct===null||intent?.allocationPct===undefined||intent?.allocationPct===''?null:clamp(intent.allocationPct,1,100),at=new Date(typeof this.now==='function'?this.now():Date.now()).toISOString(),id=crypto.randomUUID();
    const mem=read(this.storage),pending={id,action,symbol,allocationPct:pct,requestedAt:at,source:'DASHBOARD_MANUAL_NUDGE'};write(this.storage,{...mem,pending,recent:arr(mem.recent).slice(0,24)});return{ok:true,intent:pending}
  }
  _finish(intent,result){const mem=read(this.storage),row={...intent,processedAt:new Date(typeof this.now==='function'?this.now():Date.now()).toISOString(),...result};write(this.storage,{...mem,pending:mem?.pending?.id===intent?.id?null:mem?.pending,recent:[row,...arr(mem.recent)].slice(0,25)});this.latest=row}
  async run(model,input){
    const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isPlan(payload))return r;
    const mem=read(this.storage),intent=mem?.pending;if(!intent)return r;const plan=parse(r);if(!plan)return r;
    const state=typeof this.getState==='function'?(this.getState()||{}):{},positions=arr(state?.positions),held=new Map(positions.map(p=>[key(p),p])),actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
    const actionFor=s=>{const i=idx.get(s);return i===undefined?{}:actions[i]};
    if(intent.action==='SELL'){
      const p=held.get(intent.symbol);if(!p){this._finish(intent,{executed:false,outcome:'NOT_HELD'});return r}
      const i=idx.get(intent.symbol),sell={...(i===undefined?{}:actions[i]),symbol:intent.symbol,name:p?.name,action:'SELL',allocation_pct:0,confidence:1,manualNudgeV307:true,manualIntentId:intent.id,reason:'V30.7 MANUELLER VERKAUFSIMPULS: Im Dashboard wurde diese gehaltene Paper-Position ausdruecklich zum Verkauf angestossen. Die Ausfuehrung bleibt Teil des Planspiels und wird im Audit-Log markiert.'};if(i===undefined)actions.push(sell);else actions[i]=sell;plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,150)} · V30.7 Manual: SELL ${intent.symbol} angestossen.`;this._finish(intent,{executed:true,outcome:'SELL_INJECTED'});return encode(r,plan)
    }
    let brokerRows=[];try{brokerRows=typeof this.getBrokerRows==='function'?await this.getBrokerRows():[]}catch{}
    const cmap=mergeCandidates(state,payload,brokerRows),c=cmap.get(intent.symbol),old=actionFor(intent.symbol),reason=String(old?.reason||'');
    if(!c){this._finish(intent,{executed:false,outcome:'NOT_CURRENT_CANDIDATE'});return r}
    if(!brokerExact(c)){this._finish(intent,{executed:false,outcome:'NOT_EXACT_TR_VERIFIED'});return r}
    if(NON_BROKER_HARD.test(reason)||(BROKER_HARD.test(reason)&&!brokerExact(c))){this._finish(intent,{executed:false,outcome:'HARD_SAFETY_BLOCK',blockedBy:reason.slice(0,220)});return r}
    const pct=intent.allocationPct==null?dynamicPct(c):clamp(intent.allocationPct,1,100),buy={...old,symbol:intent.symbol,name:c?.name,action:'BUY',allocation_pct:+pct.toFixed(2),confidence:Math.max(.8,num(old?.confidence)),manualNudgeV307:true,manualIntentId:intent.id,manualAllocationPct:intent.allocationPct,reason:`V30.7 MANUELLER KAUFIMPULS: Dashboard priorisiert ${intent.symbol}; exakt Trade-Republic-verifiziert. Zielgroesse ${pct.toFixed(2)}%${intent.allocationPct==null?' dynamisch durch Score/Momentum bestimmt':' manuell vorgegeben'}. Harte News-, Quote-, FX- und Anti-Churn-Sperren werden nicht uebergangen.`};
    const bi=idx.get(intent.symbol);if(bi===undefined){idx.set(intent.symbol,actions.length);actions.push(buy)}else actions[bi]=buy;
    if(!held.has(intent.symbol)&&positions.length>=4&&!actions.some(a=>String(a?.action||'').toUpperCase()==='SELL')){const weak=weakestHeld(positions);if(weak){const s=key(weak),wi=idx.get(s),sell={...(wi===undefined?{}:actions[wi]),symbol:s,name:weak?.name,action:'SELL',allocation_pct:0,confidence:.9,manualNudgeV307:true,manualIntentId:intent.id,pairedManualBuy:intent.symbol,reason:`V30.7 MANUAL SLOT-ROTATION: Dashboard priorisiert ${intent.symbol}; alle vier Slots sind belegt, daher macht das aktuell schwaechste Depotglied ${s} Platz. Keine zusaetzliche starre Positionsgewicht-Grenze.`};if(wi===undefined)actions.push(sell);else actions[wi]=sell}}
    plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,140)} · V30.7 Manual: BUY ${intent.symbol} ${pct.toFixed(1)}% angestossen.`;this._finish(intent,{executed:true,outcome:'BUY_INJECTED',allocationPct:pct});return encode(r,plan)
  }
  status(){const mem=read(this.storage);return{enabled:true,version:30.7,mode:'manual-dashboard-nudge',maxAllocationPct:100,noFixedSinglePositionCap:true,pending:mem.pending||null,recent:arr(mem.recent).slice(0,10),latest:this.latest}}
}
