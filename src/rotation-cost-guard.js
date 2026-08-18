import {getReplayRotationAdjustment} from './rotation-replay-adjustment.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=x=>String(x?.symbol||x||'').toUpperCase();
const responseText=r=>String(r?.response||r?.result?.response||'');
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPlanMessage(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function promptCash(text){const m=String(text||'').match(/\bCash\s+([0-9]+(?:[.,][0-9]+)?)/i);return m?num(String(m[1]).replace(',','.')):0}
function ageMin(h={}){if(Number.isFinite(Number(h?.ageMinutes)))return Math.max(0,Number(h.ageMinutes));const t=Date.parse(String(h?.opened_at||h?.openedAt||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/60000):999}
function reasonGap(reason){const m=String(reason||'').match(/Differenz\s+(-?[0-9]+(?:[.,][0-9]+)?)/i);return m?num(String(m[1]).replace(',','.')):null}
function hardExit(h={}){const state=String(h?.momentumState||h?.momentum_state||'').toUpperCase(),sell=String(h?.momentumSellSignal||h?.momentum_sell_signal||'').toUpperCase();return state==='REVERSAL'||sell==='STRONG'}
function rotationSell(a={}){return /(?:CAPITAL-MOTION-ROTATION|OPPORTUNITY-COST-ROTATION)/i.test(String(a?.reason||''))}
function heldPnlPct(h={}){for(const v of [h?.pnlPct,h?.pnl_pct,h?.pnl])if(Number.isFinite(Number(v)))return Number(v);return 0}

export function rotationCostDecision({held={},action={},storage=null}={}){
 const replay=getReplayRotationAdjustment(storage),age=ageMin(held),notional=Math.max(0,num(held?.invested,held?.amount)),gap=reasonGap(action?.reason),smallPenalty=notional>0&&notional<250?.55:notional>0&&notional<500?.35:.10,minAge=10+num(replay.minAgeBonusMinutes),pnl=heldPnlPct(held),hard=hardExit(held);
 // Grobe Roundtrip-Kosten fuer die Entscheidung: zwei 1-EUR-Orders plus ca. 0,2%
 // Ausfuehrung/Slippage. Sie werden nur als Hysterese benutzt, nicht als Renditeversprechen.
 const estimatedRoundTripCostPct=notional>0?2/notional*100+.20:.45,costGapPenalty=Math.min(.35,estimatedRoundTripCostPct*.16),minGap=.80+smallPenalty+num(replay.gapBonus)+costGapPenalty;
 const exceptionalEdge=gap!=null&&gap>=Math.max(2.20,minGap+.45),loserUpgrade=pnl<=-.70&&gap!=null&&gap>=Math.max(1.45,minGap+.15);
 const normal=age>=minAge&&(gap==null||gap>=minGap),earlyStrong=age>=6&&(exceptionalEdge||loserUpgrade);
 const allow=hard||normal||earlyStrong;
 return{allow,age:+age.toFixed(1),gap,minAge,minGap:+minGap.toFixed(2),notional:+notional.toFixed(2),estimatedRoundTripCostPct:+estimatedRoundTripCostPct.toFixed(2),hardExit:hard,exceptionalEdge,loserUpgrade,replay,reason:allow?(hard?'harter Exit':earlyStrong?'aussergewoehnlich klarer Netto-Vorteil – fruehere Rotation erlaubt':'Rotation nach Kosten-Hysterese erlaubt'):`Rotation gebremst: ${age.toFixed(1)} Min. < ${minAge} Min. oder Score-Abstand ${gap==null?'–':gap.toFixed(2)} < ${minGap.toFixed(2)}; Kosten und Churn beruecksichtigt`}
}

function postProcess(r,input,storage){const plan=parsePlan(r),prompt=findPlanMessage(input);if(!plan||!prompt)return r;const held=arr(parseBlock(prompt,' Gehalten=')||[]),hMap=new Map(held.map(h=>[key(h),h])),cash=promptCash(prompt),cancelled=[];let actions=[];for(const a of arr(plan.actions)){if(String(a?.action||'').toUpperCase()==='SELL'&&rotationSell(a)){const d=rotationCostDecision({held:hMap.get(key(a))||{},action:a,storage});if(!d.allow){cancelled.push({symbol:key(a),decision:d});continue}}actions.push(a)}if(cancelled.length&&cash<=2){actions=actions.filter(a=>String(a?.action||'').toUpperCase()!=='BUY'||!/CAPITAL-IN-MOTION/i.test(String(a?.reason||'')))}if(cancelled.length){plan.summary=`${String(plan.summary||'').slice(0,175)} · ROTATION-COST-GUARD: ${cancelled.length} zu schnelle/gebuehrenunattraktive Rotation(en) gestoppt; ${cancelled[0].decision.reason}.`}plan.actions=actions;return{...r,response:JSON.stringify(plan)}}

export class RotationCostAiGuard{constructor(base,storage){this.base=base;this.storage=storage}async run(model,input){const r=await this.base.run(model,input);return postProcess(r,input,this.storage)}}
