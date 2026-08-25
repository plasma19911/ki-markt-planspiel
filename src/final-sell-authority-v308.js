const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();

export const FINAL_SELL_AUTHORITY_V308={
  version:30.8,
  patch:'30.8.2-no-absolute-score-only-sells',
  severeRawScore:35,
  minStableRawDivergence:12,
  minEntryDeterioration:8,
  directSellRawScore:28,
  extremeRawScore:20,
  strongUptrendProtectionPct:1.5,
  freshProtectionMinutes:20,
  minChartBreakFromEntryPct:-0.8,
  minChartBreakLastScanPct:-0.25
};

function parsePlan(r){const raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j?.actions)?j:null}catch{return null}}
function encode(r,plan){const raw=JSON.stringify(plan);if(r&&typeof r==='object'&&r.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:raw}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:raw};return{response:raw}}
function isTradingInput(input){return arr(input?.messages).some(m=>{const t=String(m?.content||'');return t.includes('Kandidaten=')&&t.includes(' Gehalten=')})}
function ageMinutes(p={},now=Date.now()){const t=Date.parse(String(p?.opened_at||p?.openedAt||''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):9999}

export function severeWeaknessV308(p={}){
  const c=FINAL_SELL_AUTHORITY_V308,stable=num(p?.decisionScore,p?.score,50),raw=num(p?.rawDecisionScore,stable),entry=num(p?.entryDecisionScore,stable),stableRawGap=stable-raw,entryDeterioration=entry-stable,direction=String(p?.chartDirectionMode||'').toUpperCase(),chart=num(p?.chartMoveFromEntryPct,0),lastScan=num(p?.chartMoveLastScanPct,0);
  const strongUptrend=direction==='UP'&&chart>=c.strongUptrendProtectionPct&&raw>c.directSellRawScore;
  const rawSevere=raw<=c.directSellRawScore||(raw<=c.severeRawScore&&(stableRawGap>=c.minStableRawDivergence||entryDeterioration>=c.minEntryDeterioration));
  const chartBreak=direction==='DOWN'||chart<=c.minChartBreakFromEntryPct||lastScan<=c.minChartBreakLastScanPct;
  const extremeRaw=raw<=c.extremeRawScore;
  const confirmed=chartBreak;
  return{severe:rawSevere&&confirmed&&!strongUptrend,rawSevere,confirmed,chartBreak,extremeRaw,stable,raw,entry,stableRawGap,entryDeterioration,direction,chart,lastScan,strongUptrend};
}

export function enforceFinalSellAuthorityV308(plan,state={},now=Date.now()){
  const c=FINAL_SELL_AUTHORITY_V308;
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{sellLocks:0,forcedWeakSells:0,freshWeakSellsBlocked:0,unconfirmedWeakSellsBlocked:0}};
  const actions=plan.actions.map(a=>({...a})),idx=new Map();actions.forEach((a,i)=>{const s=key(a);if(s&&!idx.has(s))idx.set(s,i)});
  const counters={sellLocks:0,forcedWeakSells:0,freshWeakSellsBlocked:0,unconfirmedWeakSellsBlocked:0};
  for(const p of arr(state?.positions)){
    const s=key(p);if(!s)continue;let i=idx.get(s),a=i===undefined?null:actions[i],act=String(a?.action||'').toUpperCase();
    if(act==='SELL'){
      actions[i]={...a,action:'SELL',allocation_pct:0,finalSellAuthorityV308:true,finalSellLockedV308:true,reason:`${String(a?.reason||'SELL').slice(0,620)} · V30.8 FINAL-SELL: bestätigtes SELL bleibt ausführbar und darf nicht mehr zu HOLD zurückgestuft werden.`};
      counters.sellLocks++;continue;
    }
    const w=severeWeaknessV308(p);
    if(w.rawSevere&&!w.confirmed){
      counters.unconfirmedWeakSellsBlocked++;
      if(i!==undefined&&act==='HOLD')actions[i]={...a,reason:`${String(a?.reason||'HOLD').slice(0,520)} · V30.8.2: selbst ein extrem niedriger RawScore ist allein kein Sofortverkauf; Verkäufer-/Chartbruch ist nicht bestätigt.`};
      continue;
    }
    if(!w.severe)continue;
    const age=ageMinutes(p,now);
    if(age<c.freshProtectionMinutes){
      counters.freshWeakSellsBlocked++;
      if(i!==undefined)actions[i]={...(a||{}),symbol:s,name:p?.name,action:'HOLD',allocation_pct:0,confidence:Math.max(.76,num(a?.confidence,.76)),finalSellAuthorityV308:true,freshPositionSellGuardV3081:true,reason:`V30.8.2 FRESH-POSITION-SCHUTZ: ${s} ist erst ${age.toFixed(1)} Min. offen. Ein neu erzeugtes RawScore-SELL darf die Reife-/Candle-Guards nicht umgehen. Echter harter Risiko- oder Struktur-SELL bleibt sofort ausführbar.`};
      continue;
    }
    const forced={...(a||{}),symbol:s,name:p?.name,action:'SELL',allocation_pct:0,confidence:.96,finalSellAuthorityV308:true,forcedWeakSellV308:true,reason:`V30.8 SOFORT-SELL: ${s} ist nach Reifezeit UND bestätigtem Schwächesignal deutlich deterioriert. RawScore ${w.raw.toFixed(1)}/100, geglätteter Score ${w.stable.toFixed(1)}/100 (Abstand ${w.stableRawGap.toFixed(1)}), Einstiegsscore ${w.entry.toFixed(1)} (Verschlechterung ${w.entryDeterioration.toFixed(1)}), Chart ${w.chart>=0?'+':''}${w.chart.toFixed(2)}%, letzter Scan ${w.lastScan>=0?'+':''}${w.lastScan.toFixed(2)}%, Richtung ${w.direction||'UNBEKANNT'}.`};
    if(i===undefined){i=actions.length;idx.set(s,i);actions.push(forced)}else actions[i]=forced;
    counters.forcedWeakSells++;
  }
  plan.actions=actions;plan.summary=`${String(plan.summary||'').slice(0,140)} · V30.8.2 Final-Sell: ${counters.sellLocks} SELL fixiert · ${counters.forcedWeakSells} bestätigte Schwäche-Sofortverkäufe · ${counters.freshWeakSellsBlocked} frische Score-SELLs blockiert · ${counters.unconfirmedWeakSellsBlocked} unbestätigte RawScore-SELLs blockiert.`;
  return{plan,counters};
}

export class FinalSellAuthorityV308{
  constructor(inner,{getState}={}){this.inner=inner;this.getState=getState;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',payload=legacy?model:input,r=legacy?await this.inner.run(payload):await this.inner.run(model,payload);if(!isTradingInput(payload))return r;const p=parsePlan(r);if(!p)return r;const state=typeof this.getState==='function'?(this.getState()||{}):{},out=enforceFinalSellAuthorityV308(p,state,Date.now());this.latest=out;return encode(r,out.plan)}
  status(){return{enabled:true,...FINAL_SELL_AUTHORITY_V308,mode:'outermost-final-sell-authority',sellCannotBeDowngradedToHold:true,finalSellSameScan:true,severeWeaknessOverridesScoreHysteresis:true,freshPositionRawScoreProtection:true,forcedWeaknessNeedsChartConfirmation:true,absoluteRawScoreCannotForceSell:true,latest:this.latest?.counters||null,rule:'Ein von den inneren Reife-/Risiko-/Candle-Guards bestätigtes SELL bleibt SELL. V30.8.2 erzeugt selbst bei extrem niedrigem RawScore kein neues Sofort-SELL ohne bestätigten Chart-/Verkäuferbruch; frische Positionen sind zusätzlich 20 Minuten gegen äußeren Score-Churn geschützt.'}}
}
