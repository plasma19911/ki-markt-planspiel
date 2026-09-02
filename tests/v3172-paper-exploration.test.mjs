import assert from 'node:assert/strict';
import {enforcePaperExplorationV3172} from '../src/paper-exploration-v3172.js';

const now=Date.now(),freshAt=new Date(now).toISOString();
const broker={symbol:'ASML.AS',name:'ASML Holding',isin:'NL0010273215',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic master',assetClass:'EQUITY'};
const candidate={...broker,price:650,day_change:1.1,momentum5Pct:.12,momentum20Pct:.15,acceleration5Pct:.01,newsScore:.08,intradayRsi:55,chartDirectionMode:'UP',confidence:.65,quoteAgeMinutes:.4,fresh:1,updated_at:freshAt};
const state={positions:[],history:[],candidates:[candidate],config:{cash:10000}};
const status={matured:240,buySamples:0,missedOpportunities:12,mode:'BALANCED'};

{
  const prediction={symbol:'ASML.AS',score:35,forecast20mScore:36.2,signalConfidence:.72,velocity5:133.8,agreement:4,regime:'BULL',m5:.12,m20:.15,accel:.01,news:.08,day:1.1,rsi:55,direction:'UP'};
  const out=enforcePaperExplorationV3172({actions:[{symbol:'ASML.AS',action:'HOLD'}],summary:'test'},state,{status,predictions:{'ASML.AS':prediction}},[broker],now);
  assert.equal(out.counters.injected,0,'low absolute score must not become BUY only through an extreme velocity spike');
}

{
  const prediction={symbol:'ASML.AS',score:54,forecast20mScore:57.2,signalConfidence:.65,velocity5:3.2,agreement:4,regime:'BULL',m5:.12,m20:.15,accel:.01,news:.08,day:1.1,rsi:55,direction:'UP'};
  const out=enforcePaperExplorationV3172({actions:[{symbol:'ASML.AS',action:'HOLD'}],summary:'test'},state,{status,predictions:{'ASML.AS':prediction}},[broker],now);
  const action=out.plan.actions.find(x=>x.symbol==='ASML.AS');
  assert.equal(out.counters.injected,1);
  assert.equal(action.action,'BUY');
  assert.equal(action.allocation_pct,8);
  assert.equal(action.netProfitEntryV3178,true);
}

{
  const prediction={symbol:'ASML.AS',score:54,forecast20mScore:57.2,signalConfidence:.65,velocity5:3.2,agreement:4,regime:'BULL',m5:.12,m20:.15,accel:.01,news:.08,day:1.1,rsi:55,direction:'UP'};
  const weakStatus={...status,buySamples:3,buyHitRate:33.3,avgBuy20mNetReturnPct:-.22,mode:'DEFENSIVE'};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},state,{status:weakStatus,predictions:{'ASML.AS':prediction}},[broker],now);
  assert.equal(out.counters.injected,0,'poor net BUY performance must suspend medium-score exploratory buys');
}

{
  const recentBuy={action:'KAUF',symbol:'OLD',ts:new Date(now-10*60*1000).toISOString()};
  const prediction={symbol:'ASML.AS',score:54,forecast20mScore:57.2,signalConfidence:.65,velocity5:3.2,agreement:4,regime:'BULL',m5:.12,m20:.15,accel:.01,news:.08,day:1.1,rsi:55,direction:'UP'};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},{...state,history:[recentBuy]},{status,predictions:{'ASML.AS':prediction}},[broker],now);
  assert.equal(out.counters.injected,0);
  assert.equal(out.counters.reason,'PROBE_SPACING');
}

{
  const stale={...candidate,fresh:0};
  const prediction={symbol:'ASML.AS',score:54,forecast20mScore:57.2,signalConfidence:.65,velocity5:3.2,agreement:4,regime:'BULL',m5:.12,m20:.15,accel:.01,news:.08,day:1.1,rsi:55,direction:'UP'};
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},{...state,candidates:[stale]},{status,predictions:{'ASML.AS':prediction}},[broker],now);
  assert.equal(out.counters.injected,0,'stale candidates must never be used for an exploration entry');
}

{
  const broker2={symbol:'HIGH.DE',name:'High Quality',isin:'DE0000000002',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic master',assetClass:'EQUITY'};
  const candidate2={...broker2,price:100,day_change:1,momentum5Pct:.12,momentum20Pct:.18,acceleration5Pct:.01,newsScore:.1,intradayRsi:58,confidence:.68,quoteAgeMinutes:.4,fresh:1,updated_at:freshAt};
  const predictions={
    'ASML.AS':{symbol:'ASML.AS',score:52,forecast20mScore:54,signalConfidence:.65,velocity5:130,agreement:4,regime:'BULL',m5:.12,m20:.15,accel:.01,news:.08,day:1.1,rsi:55,direction:'UP'},
    'HIGH.DE':{symbol:'HIGH.DE',score:58,forecast20mScore:62,signalConfidence:.68,velocity5:3,agreement:4,regime:'BULL',m5:.12,m20:.18,accel:.01,news:.1,day:1,rsi:58,direction:'UP'}
  };
  const out=enforcePaperExplorationV3172({actions:[],summary:'test'},{...state,candidates:[candidate,candidate2]},{status,predictions},[broker,broker2],now);
  assert.equal(out.counters.chosen.symbol,'HIGH.DE','capped velocity must not let the weaker candidate win only through a huge spike');
}

console.log('V31.7.8 profitability-first paper exploration tests passed');
