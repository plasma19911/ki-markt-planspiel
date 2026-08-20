import assert from 'node:assert/strict';
import {enforceLossSellInvariant} from '../src/loss-sell-invariant.js';

const sellPlan=(symbol,reason)=>({summary:'FINAL-CONTROLLER V27.1',actions:[{symbol,action:'SELL',confidence:.84,allocation_pct:0,reason}]});
const buyPlan=(symbol,pct,reason='FINAL-CONTROLLER V27.1 BUY EARLY_BREAKOUT')=>({summary:'FINAL-CONTROLLER V27.1',actions:[{symbol,action:'BUY',confidence:.74,allocation_pct:pct,reason}]});
const eurState=(symbol,position={},candidate={})=>({config:{cash:1500,slippage_percent:.10},positions:[{symbol,invested:100,entry_fee:1,entry_price:100,last_price:position.last_price??99.7,entry_fx:1,last_fx:1,zero_quantity:1,instrument_type:'EQUITY',...position}],candidates:[{symbol,price:candidate.price??position.last_price??99.7,fx_rate:1,eventRisk:'NONE',news:0,intraday5m:-.1,intraday20m:-.1,momentumAcceleration5:-.01,drawdownFrom20mHighPct:-.5,instrument_type:'EQUITY',...candidate}]});

{
 const symbol='SAGILITY.NS';
 const reason='FINAL-CONTROLLER HARD EXIT: ADAPTIVE EXIT-HOLD: Verkäuferstruktur ist noch nicht stark genug · Verkäufer-Vorsprung -10%/14% · weiter beobachten statt zu früh schließen.';
 const out=enforceLossSellInvariant(sellPlan(symbol,reason),eurState(symbol,{last_price:99.85},{sellerShare:45}));
 assert.equal(out.blocked,1,'SAGILITY-artiger Verlust-Sell gegen stärkere Käuferseite muss blockiert werden');
 assert.equal(out.plan.actions[0].action,'HOLD');
 assert.match(out.plan.actions[0].reason,/LOSS-SELL-INVARIANT V27\.4/);
}

{
 const symbol='GUBRA.CO';
 const reason='FINAL-CONTROLLER HARD EXIT: ADAPTIVE EXIT-HOLD: Verkäuferstruktur ist noch nicht stark genug · Verkäufer-Vorsprung 6%/14% · weiter beobachten statt zu früh schließen.';
 const out=enforceLossSellInvariant(sellPlan(symbol,reason),eurState(symbol,{last_price:99.4},{sellerShare:58,intraday20m:-.24,momentumAcceleration5:-.04}));
 assert.equal(out.blocked,1,'GUBRA-artiger widersprüchlicher Minus-Sell muss blockiert werden');
 assert.equal(out.plan.actions[0].action,'HOLD');
}

{
 const symbol='PARAS.NS',reason='FINAL-CONTROLLER PROFIT EXIT: Gewinnerstruktur ist unabhängig bestätigt gebrochen.';
 const state={
  config:{cash:1400,slippage_percent:.10},
  positions:[{symbol,invested:79.854035,entry_fee:2,entry_price:1495.3939244384765,last_price:1496.5,entry_fx:.0089,last_fx:.0089,zero_quantity:5.999999992486291,instrument_type:'EQUITY'}],
  candidates:[{symbol,price:1496.5,fx_rate:.0089,eventRisk:'NONE',news:0,sellerShare:55,intraday5m:-.05,intraday20m:-.08,momentumAcceleration5:-.01,drawdownFrom20mHighPct:-.35,instrument_type:'EQUITY'}]
 };
 const out=enforceLossSellInvariant(sellPlan(symbol,reason),state);
 assert.equal(out.blocked,1,'PARAS-artiger PROFIT EXIT darf nicht passieren, wenn ZERO-Netto-P/L nach Gebühren negativ ist');
 assert.equal(out.plan.actions[0].action,'HOLD');
 assert.match(out.plan.actions[0].reason,/PROFIT EXIT.*ZERO-Gebühren.*Verlust/i);
}

{
 const symbol='RISK.DE';
 const reason='FINAL-CONTROLLER HARD EXIT: SEVERE_NEGATIVE bestätigtes regulatorisches Hochrisiko-Ereignis.';
 const out=enforceLossSellInvariant(sellPlan(symbol,reason),eurState(symbol,{last_price:99.6},{eventRisk:'HIGH',eventText:'Regulatorische Ablehnung bestätigt',news:-.9,sellerShare:45}));
 assert.equal(out.blocked,0,'echter externer Hard-Risk muss trotz Verlust sofort verkaufbar bleiben');
 assert.equal(out.plan.actions[0].action,'SELL');
}

{
 const symbol='BREAK.DE';
 const reason='FINAL-CONTROLLER THESIS-INVALIDATION EXIT: bestätigte Verkäuferdominanz und Strukturbruch.';
 const out=enforceLossSellInvariant(sellPlan(symbol,reason),eurState(symbol,{last_price:97},{sellerShare:69,intraday5m:-.42,intraday20m:-.55,momentumAcceleration5:-.11,drawdownFrom20mHighPct:-2.2}));
 assert.equal(out.blocked,0,'tiefer Verlust mit echter Verkäuferkontrolle und Strukturbruch muss weiter SELL erlauben');
 assert.equal(out.plan.actions[0].action,'SELL');
}

{
 const symbol='PARAS.NS';
 const state={config:{cash:1470,slippage_percent:.10},positions:[],candidates:[{symbol,price:1495,fx_rate:.0089,instrument_type:'EQUITY',eventRisk:'NONE',news:0}]};
 const out=enforceLossSellInvariant(buyPlan(symbol,5.3),state);
 assert.equal(out.uneconomicBuys,1,'kleine PARAS-artige Order mit rund 80 EUR und hoher Gebührenlast muss blockiert werden');
 assert.equal(out.plan.actions[0].action,'HOLD');
 assert.match(out.plan.actions[0].reason,/ORDER-ECONOMICS V27\.4/);
}

{
 const symbol='NORMAL.DE';
 const state={config:{cash:1500,slippage_percent:.10},positions:[],candidates:[{symbol,price:50,fx_rate:1,instrument_type:'EQUITY',eventRisk:'NONE',news:0}]};
 const out=enforceLossSellInvariant(buyPlan(symbol,40),state);
 assert.equal(out.uneconomicBuys,0,'wirtschaftlich große Order darf nicht von der Kostenregel blockiert werden');
 assert.equal(out.plan.actions[0].action,'BUY');
 assert.match(out.plan.actions[0].reason,/V27\.4/,'Versionslabel muss live auf V27.4 normalisiert werden');
 assert.match(out.plan.summary,/V27\.4/);
}

console.log('V27.3/V27.4 loss sell invariant regression tests: OK');
