import assert from 'node:assert/strict';
import {repairQuoteAnomaliesState,sanitizeHeldPromptPositions} from '../src/quote-sanity.js';

const state={
  config:{start_capital:1000,cash:0},
  positions:[{symbol:'PENCE.L',instrument_type:'EQUITY',invested:999,entry_price:120,last_price:121,entry_fx:.0117,last_fx:1.17,currency:'GBp'}],
  snapshots:[
    {id:1,equity:1000,cash:0},
    {id:2,equity:110889.11,cash:0},
    {id:3,equity:1004,cash:0}
  ],
  history:[{id:1,action:'HALTEN',equity:110889.11,total_pnl:109889.11}],
  aiLog:[]
};
const r=repairQuoteAnomaliesState(state);
assert.equal(r.changed,true);
assert.equal(r.repairedPositions,1);
assert.ok(Math.abs(state.positions[0].last_fx-.0117)<1e-9,'GBp/GBP 100x-FX-Sprung muss auf Entry-Skala zurückgeführt werden');
assert.ok(r.currentEquity>900&&r.currentEquity<1100,'1000-EUR-Depot darf nach Quote-Reparatur nicht fünf- oder sechsstellig bewertet werden');
assert.equal(r.removedSnapshots,1,'offensichtlicher 100x-Depotpeak muss aus dem Chart entfernt werden');
assert.ok(state.history[0].equity<1100,'HALTEN-History darf den falschen 100x-Depotwert nicht behalten');
assert.equal(state.aiLog.at(-1).title,'Kurs-/FX-Ausreißer korrigiert');

const priceScale={config:{start_capital:1000,cash:0},positions:[{symbol:'SCALE',instrument_type:'EQUITY',invested:999,entry_price:100,last_price:10000,entry_fx:1,last_fx:1}],snapshots:[],history:[],aiLog:[]};
const p=repairQuoteAnomaliesState(priceScale);
assert.equal(p.repairedPositions,1);
assert.equal(priceScale.positions[0].last_price,100,'100x-Kursskalierung muss repariert werden');

const normal={config:{start_capital:1000,cash:0},positions:[{symbol:'REAL',instrument_type:'EQUITY',invested:999,entry_price:100,last_price:300,entry_fx:1,last_fx:1}],snapshots:[],history:[],aiLog:[]};
const n=repairQuoteAnomaliesState(normal);
assert.equal(n.repairedPositions,0,'ein normaler 3x-Kurs darf nicht als 100x-Skalierungsfehler behandelt werden');
assert.equal(normal.positions[0].last_price,300);

const held=sanitizeHeldPromptPositions([{symbol:'PENCE.L',pnlPct:10988.91,peakPnlPct:10988.91,givebackPct:0}],state);
assert.ok(Math.abs(held[0].pnlPct)<500,'extremer falscher Prompt-P/L muss vor der KI-Entscheidung ersetzt werden');
assert.match(held[0].quoteSanity,/replaced/);

console.log(JSON.stringify({ok:true,currentEquity:r.currentEquity,removedSnapshots:r.removedSnapshots,repairedFx:state.positions[0].last_fx,repairedPrice:priceScale.positions[0].last_price},null,2));
