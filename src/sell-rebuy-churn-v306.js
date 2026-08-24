const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const responseText=r=>String(r?.response||r?.result?.response||'');
const BUY=new Set(['BUY','KAUF']), SELL=new Set(['SELL','VERKAUF']);
const COOLDOWN_MIN=30, HARD_EXIT_COOLDOWN_MIN=120, ABSOLUTE_MIN=10;
function parse(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,p){const raw=JSON.stringify(p);if(r?.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};return{...r,response:raw}}
function isPlan(input){return arr(input?.messages).some(m=>String(m?.content||'').includes('Kandidaten=')&&String(m?.content||'').includes(' Gehalten='))}
function promptCandidates(input){for(const m of arr(input?.messages)){const t=String(m?.content||''),a=t.indexOf('Kandidaten='),b=t.indexOf(' Gehalten=',a+11);if(a<0||b<0)continue;try{const x=JSON.parse(t.slice(a+11,b).trim());if(Array.isArray(x))return x}catch{}}return[]}
function candidateMap(state,input){const map=new Map();for(const c of arr(state?.candidates)){const s=key(c);if(s)map.set(s,{...c})}for(const c of promptCandidates(input)){const s=key(c);if(s)map.set(s,{...(map.get(s)||{}),...c})}return map}
function tsOf(x){const t=Date.parse(String(x?.ts||x?.timestamp||x?.executedAt||x?.executed_at||x?.closedAt||''));return Number.isFinite(t)?t:null}
function hardExitHistory(x={}){return /HARD|EMERGENCY|NOTAUSSTIEG|NEWS-SHOCK|DELIST|HALT|INSOLVEN|BANKRUPT|REGULATORY/i.test(String(x?.reason||''))}
function lastSell(history,s,now){let best=null;for(const h of arr(history)){if(key(h)!==s||!SELL.has(String(h?.action||'').toUpperCase()))continue;const t=tsOf(h);if(t===null||t>now)continue;if(!best||t>best.t)best={row:h,t}}return best}
function metrics(c={}){return{score:num(c?.daytradeLiveScore,c?.decisionScore??c?.score,0),m5:num(c?.momentum5Pct,c?.momentum5??c?.intraday5m,0),m20:num(c?.momentum20Pct,c?.momentum20??c?.intraday20m,0),acc:num(c?.acceleration5Pct,c?.momentumAcceleration5??c?.momentum_acceleration5,0),price:num(c?.price,c?.last_price??c?.lastPrice,0)}}
function explicitNewSignal(c={},a={}){const text=`${String(a?.reason||'')} ${String(c?.entryTimingBucket||'')} ${String(c?.setup||'')} ${String(c?.signal||'')}`;return /BREAKOUT|RECLAIM|NEW[- ]?CATALYST|FRESH[- ]?NEWS|REVERSAL[_ -]?UP|SECOND[- ]?CHANCE/i.test(text)}
function sellPrice(row={}){return num(row?.price,row?.execution_price??row?.executionPrice,0)}
export function evaluateSellRebuyV306({history=[],candidate={},action={},now=Date.now()}={}){
 const s=key(action),last=lastSell(history,s,now);if(!last)return{block:false,reason:'no recent sell'};
 const age=(now-last.t)/60000,m=metrics(candidate),hard=hardExitHistory(last.row),sameScan=age<.75,oldSellPrice=sellPrice(last.row),rebuyHigher=oldSellPrice>0&&m.price>0&&m.price>=oldSellPrice*.999;
 if(hard&&age<HARD_EXIT_COOLDOWN_MIN)return{block:true,ageMin:age,hardExit:true,reason:`Nach hartem Exit ${HARD_EXIT_COOLDOWN_MIN} Min. kein automatischer Re-Entry.`};
 if(age>=COOLDOWN_MIN)return{block:false,ageMin:age,reason:'cooldown elapsed'};
 if(sameScan)return{block:true,ageMin:age,reason:'SELL und erneuter BUY praktisch im selben Scan sind Churn.'};
 const exceptional=m.score>=72&&m.m5>=.20&&m.m20>=.35&&m.acc>=.02&&explicitNewSignal(candidate,action);
 const ultra=m.score>=76&&m.m5>=.35&&m.m20>=.55&&m.acc>=.04&&explicitNewSignal(candidate,action);
 if(age<ABSOLUTE_MIN&&!ultra)return{block:true,ageMin:age,rebuyHigher,reason:`Absolute ${ABSOLUTE_MIN}-Min.-Re-Entry-Sperre: kein Rueckkauf ohne aussergewoehnlich neues Signal.`};
 if(!exceptional)return{block:true,ageMin:age,rebuyHigher,reason:`${COOLDOWN_MIN}-Min.-Anti-Churn: nach Verkauf kein Rueckkauf desselben Titels ohne klar neues, deutlich staerkeres Signal.`};
 return{block:false,ageMin:age,exceptional:true,rebuyHigher,reason:'klar neues Breakout/Reclaim/Catalyst-Signal erlaubt fruehen Re-Entry'};
}
export function enforceSellRebuyChurnV306(plan,state={},input=null,now=Date.now()){
 if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};
 const cmap=candidateMap(state,input),samePlanSells=new Set(plan.actions.filter(a=>SELL.has(String(a?.action||'').toUpperCase())).map(key));let blocked=0,exceptions=0,higherPriceRebuysBlocked=0;
 plan.actions=plan.actions.map(a=>{if(!BUY.has(String(a?.action||'').toUpperCase()))return a;const s=key(a),c=cmap.get(s)||{};if(samePlanSells.has(s)){blocked++;return{...a,action:'HOLD',allocation_pct:0,confidence:Math.max(.82,num(a?.confidence,.82)),sellRebuyChurnBlockedV306:true,reason:'V30.6 ANTI-CHURN: Derselbe Titel soll in diesem Entscheidungszyklus verkauft und wieder gekauft werden. Re-Entry blockiert.'}}
 const ev=evaluateSellRebuyV306({history:state?.history,candidate:c,action:a,now});if(!ev.block){if(ev.exceptional)exceptions++;return a}blocked++;if(ev.rebuyHigher)higherPriceRebuysBlocked++;return{...a,action:'HOLD',allocation_pct:0,confidence:Math.max(.80,num(a?.confidence,.80)),sellRebuyChurnBlockedV306:true,reentryCooldownRemainingMin:Math.max(0,+(COOLDOWN_MIN-num(ev.ageMin,0)).toFixed(1)),reason:`V30.6 SELL→REBUY-CHURN BLOCK: ${ev.reason}${ev.rebuyHigher?' Der geplante Rueckkauf liegt zudem nicht guenstiger als der letzte Verkauf.':''}`}});
 plan.summary=`${String(plan.summary||'').slice(0,145)} · V30.6 Anti-Churn: ${blocked} schneller SELL→BUY-Rueckkauf blockiert · ${exceptions} echter Signal-Re-Entry erlaubt.`;
 return{plan,counters:{blockedRapidSellRebuys:blocked,exceptionalReentriesAllowed:exceptions,higherPriceRebuysBlocked}};
}
export class SellRebuyChurnGuardV306{constructor(inner,{getState,now}={}){this.inner=inner;this.getState=getState;this.now=now;this.latest=null}async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isPlan(payload))return r;const p=parse(r);if(!p)return r;const state=typeof this.getState==='function'?(this.getState()||{}):{},out=enforceSellRebuyChurnV306(p,state,payload,typeof this.now==='function'?this.now():Date.now());this.latest=out;return encode(r,out.plan)}status(){return{enabled:true,version:30.6,mode:'sell-rebuy-anti-churn',cooldownMinutes:COOLDOWN_MIN,absoluteCooldownMinutes:ABSOLUTE_MIN,hardExitCooldownMinutes:HARD_EXIT_COOLDOWN_MIN,exceptionRequiresNewSignal:true,higherPriceRebuyGuard:true,latest:this.latest?.counters||null}}}
