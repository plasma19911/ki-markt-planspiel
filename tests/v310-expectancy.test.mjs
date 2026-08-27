import assert from 'node:assert/strict';
import {enforceExpectancyCoreV310} from '../src/expectancy-core-v310.js';
const now=Date.parse('2026-08-25T12:00:00Z');
function p(extra={}){return {symbol:'TEST.DE',name:'Test',invested:2500,entry_price:100,last_price:100,entry_fx:1,last_fx:1,opened_at:new Date(now-60*60000).toISOString(),...extra}}
{
 const plan={actions:[{symbol:'TEST.DE',action:'SELL',reason:'Gewinn sichern'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,{positions:[p({last_price:100.9,maxPnlPctSinceEntry:1.0})]},now);
 assert.equal(out.plan.actions[0].action,'HOLD','+0.9% darf nicht mehr früh abgeschnitten werden');
}
{
 const plan={actions:[{symbol:'TEST.DE',action:'HOLD',reason:'hold'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,{positions:[p({last_price:98.5})]},now);
 assert.equal(out.plan.actions[0].action,'SELL','-1.5% muss Hard-Stop auslösen');
 assert.equal(out.counters.hardStops,1);
}
{
 const plan={actions:[{symbol:'TEST.DE',action:'HOLD',reason:'hold'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,{positions:[p({last_price:102.7,maxPnlPctSinceEntry:3.8})]},now);
 assert.equal(out.plan.actions[0].action,'SELL','Gewinner nach Trail-Rücklauf sichern');
}
{
 const fresh=p({opened_at:new Date(now-5*60000).toISOString(),last_price:99.7});
 const plan={actions:[{symbol:'TEST.DE',action:'SELL',reason:'Score schwächer'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,{positions:[fresh]},now);
 assert.equal(out.plan.actions[0].action,'HOLD','frischer normaler Score-Sell muss blockiert werden');
}
{
 const state={cash:5000,positions:[],candidates:[{symbol:'TEST.DE',score:72}],history:[{symbol:'TEST.DE',action:'SELL',timestamp:new Date(now-20*60000).toISOString(),score:70}]};
 const plan={actions:[{symbol:'TEST.DE',action:'BUY',allocation_pct:20,reason:'buy'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,state,now);
 assert.equal(out.plan.actions[0].action,'HOLD','Reentry unter 45 Min ohne +6 Score muss blockiert werden');
}
{
 const state={cash:10000,positions:[],candidates:[{symbol:'TEST.DE',score:72}],history:[]};
 const plan={actions:[{symbol:'TEST.DE',action:'BUY',allocation_pct:10,reason:'buy'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,state,now);
 assert.ok(out.plan.actions[0].allocation_pct>=22,'Mindestticket 2200 EUR auf 10k Cash muss >=22% ergeben');
}
{
 const held=p({opened_at:new Date(now-20*60000).toISOString(),last_price:100.1});
 const plan={actions:[{symbol:'TEST.DE',action:'SELL',relativeRotationV304:true,reason:'paired rotation'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,{positions:[held],candidates:[{symbol:'TEST.DE',decisionScore:52,momentum5Pct:-0.1,momentum20Pct:-0.2}]},now);
 assert.equal(out.plan.actions[0].action,'SELL','qualifizierte Paarrotation darf nicht mehr auf HOLD gedreht werden');
 assert.equal(out.counters.pairedRotationSells,1);
}
{
 const stuck=p({opened_at:new Date(now-181*60000).toISOString(),last_price:100.2,decisionScore:54,rawDecisionScore:49,momentum5Pct:-0.12,momentum20Pct:-0.25});
 const plan={actions:[{symbol:'TEST.DE',action:'HOLD',reason:'flat'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,{positions:[stuck],candidates:[stuck]},now);
 assert.equal(out.plan.actions[0].action,'SELL','bestätigt stagnierende Position muss nach 180 Min Kapital freigeben');
 assert.equal(out.plan.actions[0].stagnationExitV313,true);
}
{
 const strong=p({opened_at:new Date(now-300*60000).toISOString(),last_price:100.2,decisionScore:74,rawDecisionScore:71,momentum5Pct:0.12,momentum20Pct:0.28});
 const plan={actions:[{symbol:'TEST.DE',action:'HOLD',reason:'strong'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,{positions:[strong],candidates:[strong]},now);
 assert.equal(out.plan.actions[0].action,'HOLD','alte, aber starke bzw. laufende Position darf nicht allein wegen Zeit verkauft werden');
}
{
 const fading=p({opened_at:new Date(now-100*60000).toISOString(),last_price:101.1,maxPnlPctSinceEntry:1.5,momentum5Pct:-0.1,momentum20Pct:-0.2});
 const plan={actions:[{symbol:'TEST.DE',action:'SELL',reason:'momentum fades'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,{positions:[fading],candidates:[fading]},now);
 assert.equal(out.plan.actions[0].action,'SELL','nutzbarer Gewinn darf nach bestätigtem Profit-Fade gesichert werden');
 assert.equal(out.plan.actions[0].profitFadeExitV313,true);
}
{
 const state={cash:5000,positions:[],candidates:[{symbol:'TEST.DE',score:70}],history:[{symbol:'TEST.DE',action:'SELL',timestamp:new Date(now-50*60000).toISOString(),score:70}]};
 const plan={actions:[{symbol:'TEST.DE',action:'BUY',allocation_pct:50,reason:'fresh setup'}],summary:'x'};
 const out=enforceExpectancyCoreV310(plan,state,now);
 assert.equal(out.plan.actions[0].action,'BUY','nach 45 Min darf ein valider Reentry wieder flexibel möglich sein');
}
console.log('V31.3 capital-velocity expectancy regression OK');
