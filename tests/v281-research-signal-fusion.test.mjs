import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enforceResearchSignalFusionV281} from '../src/research-signal-fusion-v281.js';

function storage(){const m=new Map();return{kv:{get:k=>m.get(k),put:(k,v)=>m.set(k,structuredClone(v))}}}
const hold=s=>({summary:'x',actions:[{symbol:s,action:'HOLD',confidence:.7,allocation_pct:0,reason:'ENTRY-CONFIRM: noch warten'}]});
const now=Date.parse('2026-08-20T15:00:00Z');

{
 const st=storage(),state={config:{cash:7000},positions:[],marketBreadth:{regime:'BROAD_UP'},newsRadar:[{symbol:'AAA.DE',headline:'AAA raises 2026 guidance by 12%',publishedAt:'2026-08-20T14:55:00Z'}],candidates:[{symbol:'AAA.DE',instrument_type:'EQUITY',price:100,score:5.8,confidence:.67,momentum5:.18,momentum20:.55,momentum_acceleration5:.08,rsi:62,day_change:2,volumeRatio:1.5,newsScore:.5,drawdown_from_20m_high_pct:-.5,fiftyTwoWeekHigh:103}]};
 const r=enforceResearchSignalFusionV281(hold('AAA.DE'),state,st,now);
 assert.equal(r.plan.actions[0].action,'BUY','frische quantitative News + Momentum + Volumen darf sofort handeln');
 assert.match(r.plan.actions[0].reason,/gewichteter Evidenz-Score/);
 assert.equal(r.ranking[0].symbol,'AAA.DE');
 assert.ok(r.ranking[0].fusionScore>=72,'potenzieller Kauf bekommt sichtbaren 0-100 Research-Score');
}

{
 const st=storage(),state={config:{cash:7000},positions:[],marketBreadth:{regime:'MIXED'},newsRadar:[],candidates:[{symbol:'BBB.DE',instrument_type:'EQUITY',price:50,score:5.4,confidence:.64,momentum5:.10,momentum20:.35,momentum_acceleration5:.05,rsi:60,day_change:1.5,volumeRatio:1.2,newsScore:.1,drawdown_from_20m_high_pct:-.6}]};
 let r=enforceResearchSignalFusionV281(hold('BBB.DE'),state,st,now);
 assert.equal(r.plan.actions[0].action,'HOLD');
 r=enforceResearchSignalFusionV281(hold('BBB.DE'),state,st,now+2*60000);
 assert.ok(['BUY','HOLD'].includes(r.plan.actions[0].action),'Folgebestätigung darf weiche Einzelregeln überstimmen, aber nicht erzwungen werden');
}

{
 const st=storage(),state={config:{cash:5000},positions:[{symbol:'HELD.DE',invested:900,entry_price:95,last_price:100,entry_fx:1,last_fx:1}],marketBreadth:{regime:'BROAD_UP'},newsRadar:[],candidates:[{symbol:'HELD.DE',instrument_type:'EQUITY',price:100,score:5.7,confidence:.66,momentum5:.14,momentum20:.48,momentum_acceleration5:.06,rsi:61,day_change:2.1,volumeRatio:1.4,newsScore:.2,drawdown_from_20m_high_pct:-.4,fiftyTwoWeekHigh:104}]};
 const r=enforceResearchSignalFusionV281(hold('HELD.DE'),state,st,now);
 assert.equal(r.positionScores.length,1,'aktive Position bekommt Research-Score');
 assert.equal(r.positionScores[0].symbol,'HELD.DE');
 assert.ok(r.positionScores[0].fusionScore>0);
 assert.equal(r.positionScores[0].source,'LIVE');
}

{
 const state={config:{cash:7000},positions:[],marketBreadth:{regime:'BROAD_UP'},newsRadar:[],candidates:[{symbol:'BAD.DE',instrument_type:'EQUITY',price:20,score:6.5,confidence:.8,momentum5:.2,momentum20:.7,momentum_acceleration5:.1,rsi:65,day_change:2,volumeRatio:1.8,newsScore:.4,eventRisk:'HIGH',eventText:'Regulatory rejection'}]};
 const r=enforceResearchSignalFusionV281(hold('BAD.DE'),state,storage(),now);
 assert.equal(r.plan.actions[0].action,'HOLD','echtes HIGH-Event bleibt Hard-Block');
}

{
 const state={config:{cash:7000},positions:[],marketBreadth:{regime:'BROAD_UP'},newsRadar:[],candidates:[{symbol:'ETF.DE',instrument_type:'ETF',price:20,score:6.5,confidence:.8,momentum5:.2,momentum20:.7,momentum_acceleration5:.1,rsi:65,day_change:2,volumeRatio:1.8,newsScore:.4}]};
 const r=enforceResearchSignalFusionV281(hold('ETF.DE'),state,storage(),now);
 assert.equal(r.plan.actions[0].action,'HOLD','V28.1 bleibt strikt Aktien-only');
}

{
 const ui=readFileSync(new URL('../public/research-score-ui.js',import.meta.url),'utf8');
 assert.match(ui,/72–100 Kaufbereit/);
 assert.match(ui,/64–71 Bestätigen/);
 assert.match(ui,/58–63 Watch/);
 assert.match(ui,/kein SELL-Signal/);
 assert.match(ui,/#positionCards/);
 assert.match(ui,/#candidatesBody/);
}

console.log('V28.1 research signal fusion + score UI regression tests: OK');
