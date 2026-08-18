import assert from 'node:assert/strict';
import {ProfitOptimizerAiGuard} from '../src/profit-optimizer.js';

const storage=(()=>{const m=new Map();return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,v)}}})();
const openedTwoHoursAgo=new Date(Date.now()-120*60*1000).toISOString();
const state={
  positions:[{symbol:'DTE.DE',opened_at:openedTwoHoursAgo,entry_price:28.90,last_price:28.85,invested:999}],
  futureWatch:{candidates:[]}
};
const adapter={peekState:()=>state};
const base={run:async()=>({response:JSON.stringify({summary:'AI wartet',actions:[
  {symbol:'DTE.DE',action:'HOLD',confidence:.45,allocation_pct:0,reason:'abwarten'},
  {symbol:'MELI',action:'HOLD',confidence:.72,allocation_pct:0,reason:'noch nicht entschieden'}
]})})};

const dte={symbol:'DTE.DE',type:'EQUITY',score:-.05,liveScore:-.05,confidence:.39,liveConfidence:.39,day:1.7,intraday5m:-.10,intraday20m:.05,intradayRsi:50,volumeRatio:1,momentumState:'EXHAUSTION',momentumSellSignal:'WATCH',momentumExhaustionScore:2,drawdownFrom20mHighPct:-.65,eventRisk:'NONE',news:0};
const meli={symbol:'MELI',type:'EQUITY',score:6.0,liveScore:6.0,confidence:.82,liveConfidence:.82,day:.8,intraday5m:.32,intraday20m:.82,intradayRsi:61,volumeRatio:1.55,momentumState:'BUILDING',momentumSellSignal:'NONE',momentumBreakoutScore:2.8,drawdownFrom20mHighPct:-.45,eventRisk:'NONE',news:.25};
const input={messages:[{role:'user',content:`JSON-only. Kandidaten=${JSON.stringify([meli,dte])} Gehalten=${JSON.stringify([{symbol:'DTE.DE',pnlPct:-.17}])}`} ]};
const out=JSON.parse((await new ProfitOptimizerAiGuard(base,adapter,storage).run('test',input)).response);
const sell=out.actions.find(x=>x.symbol==='DTE.DE'&&x.action==='SELL');
const buy=out.actions.find(x=>x.symbol==='MELI'&&x.action==='BUY');
assert.ok(sell,'Zerfallene, seit >90 Minuten schwache Position muss zum Exit freigegeben werden');
assert.match(sell.reason,/TIME\/THESIS-EXIT|OPPORTUNITY-COST-ROTATION/);
assert.ok(buy,'Klar besseres bestaetigtes Setup soll als BUY erscheinen');
assert.ok(buy.allocation_pct>0&&buy.allocation_pct<=72,'Neue Position darf weder 0 noch erzwungene >72% Einzelgroesse bekommen');
assert.ok(!/FULL-CASH/i.test(JSON.stringify(out)),'Alte FULL-CASH-Logik darf nicht wieder auftauchen');

const winnerState={...state,positions:[{symbol:'DTE.DE',opened_at:openedTwoHoursAgo,entry_price:28,last_price:28.70,invested:999}]};
const winnerAdapter={peekState:()=>winnerState};
const strongHeld={...dte,score:5.4,liveScore:5.4,confidence:.72,liveConfidence:.72,momentumState:'BUILDING',momentumSellSignal:'NONE',momentumExhaustionScore:0,intraday5m:.15,intraday20m:.45};
const modestNew={...meli,score:6.1,liveScore:6.1,confidence:.76,liveConfidence:.76,momentumBreakoutScore:1.8};
const winnerInput={messages:[{role:'user',content:`JSON-only. Kandidaten=${JSON.stringify([modestNew,strongHeld])} Gehalten=${JSON.stringify([{symbol:'DTE.DE',pnlPct:2.5}])}`} ]};
const winnerOut=JSON.parse((await new ProfitOptimizerAiGuard(base,winnerAdapter,storage).run('test',winnerInput)).response);
assert.equal(winnerOut.actions.some(x=>x.symbol==='DTE.DE'&&x.action==='SELL'),false,'Gesunder Gewinner darf nicht wegen kleinem Score-Vorsprung hektisch verkauft werden');

console.log(JSON.stringify({ok:true,timeExit:Boolean(sell),rotationBuy:buy,protectedWinner:true},null,2));
