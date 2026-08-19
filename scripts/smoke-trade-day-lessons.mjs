import {TradeDayLessonsAiGuard} from '../src/trade-day-lessons-guard.js';

function inputFor(candidate){
  return {messages:[{content:`Kandidaten=${JSON.stringify([candidate])} Gehalten=[]`}]};
}
async function run(candidate,reason,allocation=12){
  const base={run:async()=>({response:JSON.stringify({actions:[{symbol:candidate.symbol,action:'BUY',confidence:.8,allocation_pct:allocation,reason}],summary:'test'})})};
  const guard=new TradeDayLessonsAiGuard(base,{getState:()=>({history:[]})});
  const out=await guard.run('test',inputFor(candidate));
  return JSON.parse(out.response).actions[0];
}
function expect(cond,msg){if(!cond)throw new Error(msg)}

const shallow=await run(
  {symbol:'BHC.TO',day_change:-3.42,intraday5m:.05,intraday20m:-.20,momentumAcceleration5:.16,drawdownFrom20mHighPct:-.27,score:5.85},
  'EARLY-DIP AUTO DIP_REBOUND: Test · MULTI-TIMEFRAME SOFT-DATA: Tages-/Wochenchart unvollständig'
);
expect(shallow.action==='HOLD','shallow missing-MTF auto dip must be HOLD');

const tsem=await run(
  {symbol:'TSEM',day_change:-1.2,intraday5m:.14,intraday20m:-.15,momentumAcceleration5:.19,drawdownFrom20mHighPct:-.50,score:5.85},
  'EARLY-DIP AUTO DIP_REBOUND: Test · MULTI-TIMEFRAME SOFT-DATA: Tages-/Wochenchart unvollständig'
);
expect(tsem.action==='HOLD','-0.50% micro dip must be HOLD');

const deepSoft=await run(
  {symbol:'DEEP',day_change:-2.8,intraday5m:.18,intraday20m:-.8,momentumAcceleration5:.08,drawdownFrom20mHighPct:-1.55,score:5.4},
  'EARLY-DIP AUTO DIP_REBOUND: Test · MULTI-TIMEFRAME SOFT-DATA: Tages-/Wochenchart unvollständig',
  12
);
expect(deepSoft.action==='BUY','deep strong soft-MTF dip may remain a small BUY');
expect(deepSoft.allocation_pct<=5,'deep soft-MTF dip must be capped at 5%');

const confirmed=await run(
  {symbol:'GOOD',day_change:-.8,intraday5m:.20,intraday20m:.10,momentumAcceleration5:.08,drawdownFrom20mHighPct:-1.40,score:5.5},
  'EARLY-DIP DIP_REBOUND: Test · MULTI-TIMEFRAME V1.3: Tages- und Wochenstruktur konstruktiv',
  14
);
expect(confirmed.action==='BUY','confirmed real dip should stay BUY');
expect(confirmed.allocation_pct<=7,'moderate real dip should be risk-capped');

const outlier=await run(
  {symbol:'BADQUOTE',day_change:88,intraday5m:.2,intraday20m:1,momentumAcceleration5:.1,drawdownFrom20mHighPct:-2,score:6.5},
  'EARLY-DIP DIP_REBOUND: Test · MULTI-TIMEFRAME V1.3: ok'
);
expect(outlier.action==='HOLD','extreme day move must be HOLD pending verification');

console.log('trade-day-lessons V2 smoke: OK');
