import assert from 'node:assert/strict';
import {enforcePaperExplorationV3172} from '../src/paper-exploration-v3172.js';

const now=Date.now(),freshAt=new Date(now).toISOString();
const broker={symbol:'ASML.AS',name:'ASML Holding',isin:'NL0010273215',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic master',assetClass:'EQUITY'};
const candidate={...broker,price:650,day_change:1.1,momentum5Pct:.08,momentum20Pct:.12,acceleration5Pct:.01,newsScore:0,intradayRsi:55,chartDirectionMode:'UP',confidence:.55,quoteAgeMinutes:.4,fresh:1,updated_at:freshAt};
const prediction={symbol:'ASML.AS',score:35,forecast20mScore:36.2,signalConfidence:.48,velocity5:3.2,agreement:4,regime:'BULL',m5:.08,m20:.12,accel:.01,news:0,day:1.1,rsi:55,direction:'UP'};
const learning={status:{matured:240,buySamples:0,missedOpportunities:12},predictions:{'ASML.AS':prediction}};
const state={positions:[],history:[],candidates:[candidate],config:{cash:10000}};

{
  const plan={actions:[{symbol:'ASML.AS',action:'HOLD',reason:'Score noch unter normaler Kaufzone'}],summary:'test'};
  const out=enforcePaperExplorationV3172(plan,state,learning,[broker],now);
  const action=out.plan.actions.find(x=>x.symbol==='ASML.AS');
  assert.equal(out.counters.injected,1);
  assert.equal(action.action,'BUY');
  assert.equal(action.allocation_pct,6);
  assert.equal(action.paperExplorationV3172,true);
  assert.equal(action.explorationConfirmationMode,'DYNAMIC');
}

{
  const amBroker={symbol:'AM.PA',name:'ArcelorMittal',isin:'LU1598757687',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic master',assetClass:'EQUITY'};
  const amCandidate={...amBroker,price:31,day_change:.7,momentum5Pct:.01,momentum20Pct:.06,acceleration5Pct:0,newsScore:0,intradayRsi:58,confidence:.645,quoteAgeMinutes:.5,fresh:1,updated_at:freshAt};
  const amPrediction={symbol:'AM.PA',score:60.5,forecast20mScore:64.83,signalConfidence:.645,velocity5:0,agreement:1,regime:'SIDEWAYS',m5:.01,m20:.06,accel:0,news:0,day:.7,rsi:58,direction:''};
  const out=enforcePaperExplorationV3172({actions:[{symbol:'AM.PA',action:'HOLD',reason:'data quality incomplete'}],summary:'test'},{positions:[],history:[],candidates:[amCandidate],config:{cash:10000}},{status:{matured:240,buySamples:0,missedOpportunities:7},predictions:{'AM.PA':amPrediction}},[amBroker],now);
  const action=out.plan.actions.find(x=>x.symbol==='AM.PA');
  assert.equal(out.counters.injected,1,'a strong static forecast may seed a paper BUY even before score velocity exists');
  assert.equal(action.action,'BUY');
  assert.equal(action.explorationConfirmationMode,'STATIC_FORECAST');
}

{
  const bad={...candidate,newsScore:-.6};
  const badLearning={...learning,predictions:{'ASML.AS':{...prediction,news:-.6}}};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},{...state,candidates:[bad]},badLearning,[broker],now);
  assert.equal(out.counters.injected,0);
}

{
  const learned={...learning,status:{...learning.status,buySamples:1}};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},state,learned,[broker],now);
  assert.equal(out.counters.injected,1,'one matured BUY sample must not permanently disable the learning path');
}

{
  const oneHeld={symbol:'OLD',invested:1200,entry_price:100,last_price:100,entry_fx:1,last_fx:1};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},{...state,positions:[oneHeld]},learning,[broker],now);
  assert.equal(out.counters.injected,1,'an unrelated open position must not disable the controlled probe path');
  assert.equal(out.plan.actions.find(x=>x.symbol==='ASML.AS')?.action,'BUY');
}

{
  const positions=[1,2,3].map(i=>({symbol:`OLD${i}`,invested:500,entry_price:10,last_price:10,entry_fx:1,last_fx:1}));
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},{...state,positions},learning,[broker],now);
  assert.equal(out.counters.injected,0);
  assert.equal(out.counters.reason,'PROBE_POSITION_LIMIT');
}

{
  const heldSame={symbol:'ASML.AS',invested:1200,entry_price:650,last_price:650,entry_fx:1,last_fx:1};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},{...state,positions:[heldSame]},learning,[broker],now);
  assert.equal(out.counters.injected,0,'a probe must never duplicate an already-held symbol');
  assert.ok(out.counters.blocked.some(x=>x.symbol==='ASML.AS'&&x.reason==='SYMBOL_ALREADY_OPEN'));
}

{
  const recentBuy={action:'KAUF',symbol:'OLD',ts:new Date(now-10*60*1000).toISOString()};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},{...state,history:[recentBuy]},learning,[broker],now);
  assert.equal(out.counters.injected,0);
  assert.equal(out.counters.reason,'PROBE_SPACING');
}

{
  const mdtBroker={symbol:'MDT',name:'Medtronic plc',isin:'IE00BTN1Y115',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic master',assetClass:'EQUITY'};
  const mdt={...mdtBroker,price:92.57,day_change:.4,momentum5Pct:.8,momentum20Pct:-.1,acceleration5Pct:.05,volumeRatio:1.4,volumeRatioSource:'LIVE',newsScore:.23,newsConfidence:.75,newsSources:['issuer'],intradayRsi:61,confidence:.65,fresh:1,updated_at:freshAt};
  const peers=[
    {symbol:'P1',price:10,momentum5Pct:-.1,momentum20Pct:-.8,confidence:.5,fresh:1,updated_at:freshAt},
    {symbol:'P2',price:10,momentum5Pct:.0,momentum20Pct:-.5,confidence:.5,fresh:1,updated_at:freshAt},
    {symbol:'P3',price:10,momentum5Pct:.1,momentum20Pct:-.3,confidence:.5,fresh:1,updated_at:freshAt}
  ];
  const staticLearning={status:{matured:0,buySamples:0,missedOpportunities:0},predictions:{}};
  const out=enforcePaperExplorationV3172({actions:[{symbol:'MDT',action:'HOLD',reason:'warmup probation'}],summary:'test'},{positions:[],history:[],candidates:[mdt,...peers],config:{cash:10000}},staticLearning,[mdtBroker],now);
  const action=out.plan.actions.find(x=>x.symbol==='MDT');
  assert.equal(out.counters.injected,1,'paper portfolio may use the strict canonical deadlock starter before outcome learning matures');
  assert.equal(out.counters.triggerMode,'STATIC_CANONICAL_DEADLOCK');
  assert.equal(action.action,'BUY');
  assert.equal(action.allocation_pct,6);
  assert.equal(action.staticDeadlockProbeV3176,true);
  assert.equal(action.multiProbeV3177,true);
  assert.equal(action.explorationConfirmationMode,'STATIC_CANONICAL_DEADLOCK');

  const withExisting={symbol:'OLD',invested:500,entry_price:10,last_price:10,entry_fx:1,last_fx:1};
  const out2=enforcePaperExplorationV3172({actions:[{symbol:'MDT',action:'HOLD',reason:'warmup probation'}],summary:'test'},{positions:[withExisting],history:[],candidates:[mdt,...peers],config:{cash:9500}},staticLearning,[mdtBroker],now);
  assert.equal(out2.counters.injected,1,'strict static deadlock recovery also works with one unrelated open position');
}

{
  const stale={...candidate,fresh:0};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},{...state,candidates:[stale]},learning,[broker],now);
  assert.equal(out.counters.injected,0,'stale/non-fresh candidates must never be used for a paper probe');
}

console.log('V31.7.7 controlled multi-position paper exploration tests passed');
