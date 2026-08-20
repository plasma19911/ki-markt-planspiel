import assert from 'node:assert/strict';
import {FinalDecisionController} from '../src/final-decision-controller.js';

const planInput=(candidates=[],held=[])=>({messages:[{role:'user',content:`PAPER-TRADING ONLY. JSON-only. Kandidaten=${JSON.stringify(candidates)} Gehalten=${JSON.stringify(held)}`} ]});
const baseWith=actions=>({async run(){return{response:JSON.stringify({summary:'inner',actions})}}});
const run=async({candidates=[],held=[],actions=[],state={config:{cash:10000,start_capital:10000},positions:[]}})=>{
 const c=new FinalDecisionController(baseWith(actions),{getState:()=>state});
 const r=await c.run('fake',planInput(candidates,held));
 return JSON.parse(r.response);
};
const strong=symbol=>({symbol,liveScore:5.4,liveConfidence:.75,day:1.2,intraday5m:.12,intraday20m:.18,momentumAcceleration5:.05,intradayRsi:61,drawdownFrom20mHighPct:-.8,news:.2,eventRisk:'NONE',momentumState:'NORMAL',momentumSellSignal:'NONE'});

{
 const c=strong('ABC');
 const held=[{symbol:'ABC',pnlPct:1.2,invested:2500}];
 const p=await run({candidates:[c],held,actions:[{symbol:'ABC',action:'BUY',confidence:.8,allocation_pct:50,reason:'inner buy'}],state:{config:{cash:7500,start_capital:10000},positions:held}});
 assert.equal(p.actions.filter(x=>x.symbol==='ABC'&&x.action==='BUY').length,0,'Bestandsposition darf nicht automatisch erneut BUY werden');
 assert.equal(p.actions.filter(x=>x.symbol==='ABC').length,1,'pro Symbol genau eine finale Aktion');
}

{
 const c=strong('SAFE');
 const p=await run({candidates:[c],actions:[{symbol:'SAFE',action:'HOLD',confidence:.8,allocation_pct:0,reason:'TARGET-VENUE-BLOCK: gettex nicht verifiziert'}]});
 assert.equal(p.actions.some(x=>x.symbol==='SAFE'&&x.action==='BUY'),false,'harte innere Safety-HOLDs müssen bindend bleiben');
}

{
 const c={...strong('EXIT'),intraday5m:-.32,intraday20m:-.24,momentumAcceleration5:-.06,day:-1.3,drawdownFrom20mHighPct:-1.8};
 const held=[{symbol:'EXIT',pnlPct:-.7,invested:2000}];
 const p=await run({candidates:[c],held,actions:[{symbol:'EXIT',action:'HOLD',confidence:.6,allocation_pct:0,reason:'inner hold'}],state:{config:{cash:8000,start_capital:10000},positions:held}});
 assert.equal(p.actions.find(x=>x.symbol==='EXIT')?.action,'SELL','frische bestätigte Schwäche muss beim Exit berücksichtigt werden');
}

{
 const c=strong('DUST');
 const p=await run({candidates:[c],actions:[],state:{config:{cash:.02,start_capital:10000},positions:[]}});
 assert.equal(p.actions.some(x=>x.action==='BUY'),false,'Restcent dürfen keinen BUY erzeugen');
}

console.log('V26 final decision regression tests: OK');
