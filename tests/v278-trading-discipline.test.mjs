import assert from 'node:assert/strict';
import {enforceTradingBehaviorV278,TradingBehaviorGuardV278} from '../src/trading-behavior-v278.js';

function storage(){
 const m=new Map();
 return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v)),delete:k=>m.delete(k)},_m:m};
}
function stateFor(candidate,extra={}){
 return{
  config:{cash:10000,start_capital:10000,scan_count:1,risk_mode:'offensiv',slippage_percent:.1},
  positions:[],candidates:[candidate],...extra
 };
}
function buyPlan(symbol){return{summary:'FINAL-CONTROLLER V27.7',actions:[{symbol,action:'BUY',confidence:.72,allocation_pct:20,reason:'FINAL-CONTROLLER V27.7 BUY EARLY_BREAKOUT: sauber'}]}}
function sellPlan(symbol){return{summary:'FINAL-CONTROLLER V27.7',actions:[{symbol,action:'SELL',confidence:.76,allocation_pct:0,reason:'FINAL-CONTROLLER THESIS-INVALIDATION EXIT: bestätigter Strukturbruch'}]}}

{
 const s=storage(),c={symbol:'STABLE.DE',score:4.6,confidence:.64,price:100,day_change:.5,momentum5:.10,momentum20:.20,momentum_acceleration5:.04,rsi:60};
 const st=stateFor(c),t=Date.parse('2026-08-20T14:00:00Z');
 let r=enforceTradingBehaviorV278(buyPlan(c.symbol),st,s,t);
 assert.equal(r.plan.actions[0].action,'HOLD');
 assert.match(r.plan.actions[0].reason,/2 Min/);
 r=enforceTradingBehaviorV278(buyPlan(c.symbol),st,s,t+2.1*60000);
 assert.equal(r.plan.actions[0].action,'BUY','ruhiges Setup darf nach 2 Minuten stabiler Struktur kaufen');
}

{
 const s=storage(),c={symbol:'VOL.DE',score:4.7,confidence:.64,price:100,day_change:1,momentum5:.56,momentum20:.90,momentum_acceleration5:.25,rsi:60};
 const st=stateFor(c),t=Date.parse('2026-08-20T14:00:00Z');
 let r=enforceTradingBehaviorV278(buyPlan(c.symbol),st,s,t);
 assert.equal(r.plan.actions[0].action,'HOLD');
 assert.match(r.plan.actions[0].reason,/4 Min/);
 r=enforceTradingBehaviorV278(buyPlan(c.symbol),st,s,t+3*60000);
 assert.equal(r.plan.actions[0].action,'HOLD','volatiler Titel darf nach 3 Minuten noch nicht rein');
 r=enforceTradingBehaviorV278(buyPlan(c.symbol),st,s,t+4.1*60000);
 assert.equal(r.plan.actions[0].action,'BUY','volatiler Titel darf erst nach 4 Minuten stabiler Struktur rein');
}

{
 const s=storage(),c={symbol:'PULL.DE',score:4.6,confidence:.64,price:100,day_change:-1,momentum5:.02,momentum20:-.22,momentum_acceleration5:.05,rsi:55,drawdown_from_20m_high_pct:-1.0};
 const st=stateFor(c),t=Date.parse('2026-08-20T14:00:00Z'),plan={summary:'FINAL-CONTROLLER V27.7',actions:[{symbol:c.symbol,action:'BUY',confidence:.72,allocation_pct:20,reason:'FINAL-CONTROLLER V27.7 BUY PULLBACK_RECLAIM: Erholung bestätigt'}]};
 let r=enforceTradingBehaviorV278(structuredClone(plan),st,s,t);
 assert.equal(r.plan.actions[0].action,'HOLD');
 assert.match(r.plan.actions[0].reason,/ENTRY-CONFIRM V27\.8/,'moderater negativer 20m-Trend darf Reclaim nicht pauschal als Verschlechterung blockieren');
 assert.doesNotMatch(r.plan.actions[0].reason,/verschlechtert sich/);
 r=enforceTradingBehaviorV278(structuredClone(plan),st,s,t+2.1*60000);
 assert.equal(r.plan.actions[0].action,'BUY','bestätigter Pullback/Reclaim darf nach stabiler Erholung kaufen');
}

{
 const s=storage(),p={symbol:'LOSS.DE',instrument_type:'EQUITY',invested:1000,entry_fee:1,entry_price:100,last_price:99.5,entry_fx:1,last_fx:1,zero_quantity:10,opened_at:'2026-08-20T12:00:00Z'},c={symbol:'LOSS.DE',score:-2,confidence:.7,price:99.5,momentum5:-.15,momentum20:-.25,momentum_acceleration5:-.04,seller_share:64,rsi:48};
 const st=stateFor(c,{positions:[p]}),t=Date.parse('2026-08-20T14:00:00Z');st.config.scan_count=20;
 let r=enforceTradingBehaviorV278(sellPlan('LOSS.DE'),st,s,t);
 assert.equal(r.plan.actions[0].action,'HOLD');
 assert.match(r.plan.actions[0].reason,/erster Soft-SELL/);
 st.config.scan_count=21;
 r=enforceTradingBehaviorV278(sellPlan('LOSS.DE'),st,s,t+60000);
 assert.equal(r.plan.actions[0].action,'SELL','Soft-SELL braucht einen getrennten Folgescan');
 assert.match(r.plan.actions[0].reason,/Folgescan erneut bestätigt/);
}

{
 const s=storage(),p={symbol:'RESET.DE',instrument_type:'EQUITY',invested:1000,entry_fee:1,entry_price:100,last_price:99.5,entry_fx:1,last_fx:1,zero_quantity:10},c={symbol:'RESET.DE',price:99.5,momentum5:-.15,momentum20:-.25,momentum_acceleration5:-.04,seller_share:64};
 const st=stateFor(c,{positions:[p]}),t=Date.parse('2026-08-20T14:00:00Z');st.config.scan_count=30;
 let r=enforceTradingBehaviorV278(sellPlan('RESET.DE'),st,s,t);
 assert.equal(r.plan.actions[0].action,'HOLD');
 st.config.scan_count=31;
 r=enforceTradingBehaviorV278({summary:'hold',actions:[{symbol:'RESET.DE',action:'HOLD',confidence:.7,allocation_pct:0,reason:'Struktur stabilisiert'}]},st,s,t+60000);
 assert.equal(r.plan.actions[0].action,'HOLD');
 st.config.scan_count=32;
 r=enforceTradingBehaviorV278(sellPlan('RESET.DE'),st,s,t+120000);
 assert.equal(r.plan.actions[0].action,'HOLD','unterbrochene SELL-These muss neu bestätigt werden');
}

{
 const s=storage(),p={symbol:'HARD.DE',instrument_type:'EQUITY',invested:1000,entry_fee:1,entry_price:100,last_price:95,entry_fx:1,last_fx:1,zero_quantity:10},c={symbol:'HARD.DE',price:95,event_risk:'HIGH',event_text:'Regulatory rejection',momentum5:-.2,momentum20:-.3,momentum_acceleration5:-.04};
 const st=stateFor(c,{positions:[p]});st.config.scan_count=40;
 const r=enforceTradingBehaviorV278(sellPlan('HARD.DE'),st,s,Date.parse('2026-08-20T14:00:00Z'));
 assert.equal(r.plan.actions[0].action,'SELL','echtes Hard-Risk bleibt sofort ausführbar');
}

{
 let captured=null;
 const inner={async run(model,input){captured={model,input};return{response:JSON.stringify({summary:'ok',actions:[]})}}};
 const st={config:{cash:1000,start_capital:1000,scan_count:1},positions:[{symbol:'HELD.DE',invested:500,entry_price:10,last_price:10,entry_fx:1,last_fx:1}],candidates:[]};
 const guard=new TradingBehaviorGuardV278(inner,{getState:()=>st,storage:storage(),now:()=>Date.parse('2026-08-20T14:00:00Z')});
 await guard.run('@cf/test-model',{messages:[{role:'user',content:'JSON-only Kandidaten=[] Gehalten=[]'}]});
 assert.equal(captured.model,'@cf/test-model');
 assert.match(captured.input.messages.at(-1).content,/HELD\.DE/);
 assert.match(captured.input.messages.at(-1).content,/BUY verboten/);
 assert.equal(guard.status().version,27.8);
 assert.equal(guard.status().softSellNeedsRepeatScan,true);
 assert.equal(guard.status().heldPromptPlanOnly,true);
 assert.equal(guard.status().pullbackReclaimAware,true);
}

{
 let captured=null;
 const inner={async run(model,input){captured={model,input};return{response:'News-Tendenz neutral.'}}};
 const st={config:{cash:1000,start_capital:1000,scan_count:1},positions:[{symbol:'HELD.DE',invested:500,entry_price:10,last_price:10,entry_fx:1,last_fx:1}],candidates:[]};
 const guard=new TradingBehaviorGuardV278(inner,{getState:()=>st,storage:storage()});
 const input={messages:[{role:'user',content:'Fasse die aktuelle Mehrquellen-Nachrichtenlage in einem Satz zusammen.'}]};
 const out=await guard.run('@cf/test-model',input);
 assert.equal(captured.input.messages.length,1,'BUY-Sperrhinweis darf News-/Nicht-Handels-Prompts nicht verändern');
 assert.doesNotMatch(captured.input.messages[0].content,/BUY verboten/);
 assert.equal(out.response,'News-Tendenz neutral.');
}

{
 const r=enforceTradingBehaviorV278({summary:'FINAL-CONTROLLER V27.7: 0 BUY · 3 Bestands-BUY(s) verhindert.',actions:[]},{config:{cash:1000,start_capital:1000,scan_count:1},positions:[],candidates:[]},storage(),Date.parse('2026-08-20T14:00:00Z'));
 assert.match(r.plan.summary,/3 gehaltene Kandidat\(en\) aus Neukauf-Ranking ausgeschlossen\./);
 assert.doesNotMatch(r.plan.summary,/Bestands-BUY/,'Summary darf interne Kandidatenfilterung nicht als echten BUY-Versuch darstellen');
}

console.log('V27.8 adaptive trading discipline regression tests: OK');
