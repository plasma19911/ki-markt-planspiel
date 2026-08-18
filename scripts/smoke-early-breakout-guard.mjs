import assert from 'node:assert/strict';
import {EarlyBreakoutAiGuard,evaluateEarlyBreakout} from '../src/early-breakout-ai-guard.js';

const state={earlyBreakoutWatch:{candidates:[{symbol:'EARLY.DE',rank:1,source:'SMOKE'},{symbol:'LATE.DE',rank:2,source:'SMOKE'}]}};
const adapter={peekState:()=>state};
const inputFor=c=>({messages:[{role:'user',content:`JSON-only. Kandidaten=${JSON.stringify([c])} Gehalten=[]`}]});

const early={symbol:'EARLY.DE',type:'EQUITY',day:2.2,intraday5m:.31,intraday20m:.74,momentumAcceleration5:.09,intradayRsi:61,volumeRatio:1.42,momentumState:'BUILDING',momentumSellSignal:'NONE',momentumBreakoutScore:1.9,eventRisk:'NONE'};
const earlyEval=evaluateEarlyBreakout(early);assert.equal(earlyEval.confirmed,true,'Fruehe Beschleunigung muss bestaetigt werden koennen');
const buyBase={run:async()=>({response:JSON.stringify({summary:'AI BUY',actions:[{symbol:'EARLY.DE',action:'BUY',confidence:.79,allocation_pct:60,reason:'starkes Setup'}]})})};
const earlyOut=JSON.parse((await new EarlyBreakoutAiGuard(buyBase,adapter).run('test',inputFor(early))).response),earlyBuy=earlyOut.actions[0];
assert.equal(earlyBuy.action,'BUY');assert.ok(earlyBuy.allocation_pct>0&&earlyBuy.allocation_pct<=45,'Early-Breakout-Startgroesse muss begrenzt bleiben');assert.match(earlyBuy.reason,/EARLY-BREAKOUT bestätigt/);

const late={...early,symbol:'LATE.DE',day:10.8,intraday20m:3.4,intradayRsi:82,momentumState:'BREAKOUT'};
assert.equal(evaluateEarlyBreakout(late).confirmed,false,'Spaeter ueberhitzter Tagesgewinner darf nicht als Early Breakout gelten');
const lateBase={run:async()=>({response:JSON.stringify({summary:'AI BUY',actions:[{symbol:'LATE.DE',action:'BUY',confidence:.84,allocation_pct:40,reason:'hinterher'}]})})};
const lateOut=JSON.parse((await new EarlyBreakoutAiGuard(lateBase,adapter).run('test',inputFor(late))).response),lateAction=lateOut.actions[0];
assert.equal(lateAction.action,'HOLD','Spaeter/ueberhitzter Gainer muss blockiert werden');assert.equal(lateAction.allocation_pct,0);

const holdBase={run:async()=>({response:JSON.stringify({summary:'AI HOLD',actions:[{symbol:'EARLY.DE',action:'HOLD',confidence:.7,allocation_pct:0,reason:'noch warten'}]})})};
const holdOut=JSON.parse((await new EarlyBreakoutAiGuard(holdBase,adapter).run('test',inputFor(early))).response);
assert.equal(holdOut.actions.some(x=>x.action==='BUY'),false,'Early-Breakout-Schicht darf niemals selbst einen BUY erzwingen');

console.log(JSON.stringify({ok:true,earlyConfirmed:true,lateChaseBlocked:true,noForcedBuy:true,earlyBuy},null,2));
