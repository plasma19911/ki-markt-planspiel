import assert from 'node:assert/strict';
import {enforceLossSellInvariant} from '../src/loss-sell-invariant.js';

const plan=reason=>({summary:'FINAL-CONTROLLER',actions:[{symbol:'TEST',action:'SELL',confidence:.84,allocation_pct:0,reason}]});
const state=(position,candidate)=>({positions:[{symbol:'TEST',entry_price:100,last_price:position.last_price??99.7,...position}],candidates:[{symbol:'TEST',price:candidate.price??position.last_price??99.7,eventRisk:'NONE',news:0,intraday5m:-.1,intraday20m:-.1,momentumAcceleration5:-.01,drawdownFrom20mHighPct:-.5,...candidate}]});

{
 const reason='FINAL-CONTROLLER HARD EXIT: ADAPTIVE EXIT-HOLD: Verkäuferstruktur ist noch nicht stark genug · Verkäufer-Vorsprung -10%/14% · weiter beobachten statt zu früh schließen.';
 const out=enforceLossSellInvariant(plan(reason),state({last_price:99.85},{sellerShare:45}));
 assert.equal(out.blocked,1,'SAGILITY-artiger Verlust-Sell gegen stärkere Käuferseite muss blockiert werden');
 assert.equal(out.plan.actions[0].action,'HOLD');
 assert.match(out.plan.actions[0].reason,/LOSS-SELL-INVARIANT V27\.3/);
}

{
 const reason='FINAL-CONTROLLER HARD EXIT: ADAPTIVE EXIT-HOLD: Verkäuferstruktur ist noch nicht stark genug · Verkäufer-Vorsprung 6%/14% · weiter beobachten statt zu früh schließen.';
 const out=enforceLossSellInvariant(plan(reason),state({last_price:99.4},{sellerShare:58,intraday20m:-.24,momentumAcceleration5:-.04}));
 assert.equal(out.blocked,1,'GUBRA-artiger widersprüchlicher Minus-Sell muss blockiert werden');
 assert.equal(out.plan.actions[0].action,'HOLD');
}

{
 const reason='FINAL-CONTROLLER HARD EXIT: SEVERE_NEGATIVE bestätigtes regulatorisches Hochrisiko-Ereignis.';
 const out=enforceLossSellInvariant(plan(reason),state({last_price:99.6},{eventRisk:'HIGH',eventText:'Regulatorische Ablehnung bestätigt',news:-.9,sellerShare:45}));
 assert.equal(out.blocked,0,'echter externer Hard-Risk muss trotz Verlust sofort verkaufbar bleiben');
 assert.equal(out.plan.actions[0].action,'SELL');
}

{
 const reason='FINAL-CONTROLLER THESIS-INVALIDATION EXIT: bestätigte Verkäuferdominanz und Strukturbruch.';
 const out=enforceLossSellInvariant(plan(reason),state({last_price:97},{sellerShare:69,intraday5m:-.42,intraday20m:-.55,momentumAcceleration5:-.11,drawdownFrom20mHighPct:-2.2}));
 assert.equal(out.blocked,0,'tiefer Verlust mit echter Verkäuferkontrolle und Strukturbruch muss weiter SELL erlauben');
 assert.equal(out.plan.actions[0].action,'SELL');
}

console.log('V27.3 loss sell invariant regression tests: OK');
