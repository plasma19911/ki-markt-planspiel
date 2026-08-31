import assert from 'node:assert';
import {
  recordShadowSnapshots,matureShadowSnapshots,scoreCalibrationV314,
  calibratedBuyThresholdV314,correlationGateV314,enforceShadowLearningV314,
  estimatedRoundTripCostPctV314
} from '../src/shadow-learning-v314.js';

const base=()=>({version:31.4,open:{},matured:[],lastEntryAt:0,
  stats:{snapshots:0,matured:0,expired:0,themeBlocks:0,currencyBlocks:0,spacingBlocks:0,thresholdBlocks:0},threshold:null});
const t0=Date.now();
const candidates=Array.from({length:170},(_,i)=>({symbol:'S'+i,price:100,fx_rate:1,
  decisionScore:50+(i%35),theme:'T'+(i%8),currency:'EUR'}));
let mem=recordShadowSnapshots(base(),candidates,t0);
assert.equal(Object.keys(mem.open).length,170);

const later=t0+61*60000;
const moved=candidates.map(c=>({...c,price:c.decisionScore>=70?101.5:99.7}));
mem=matureShadowSnapshots(mem,moved,later);
assert.equal(mem.matured.length,170);
assert.equal(Object.keys(mem.open).length,0);

const calibration=scoreCalibrationV314(mem.matured);
assert.ok(calibration.find(row=>row.bucket===70).avgReturnPct>1.4);
assert.ok(calibration.find(row=>row.bucket===50).avgReturnPct<0);
const threshold=calibratedBuyThresholdV314(mem.matured,.29);
assert.equal(threshold.calibrated,true);
assert.equal(threshold.threshold,70);

// Die alte Rohskala 0-10 wird vor dem Lernen auf 0-100 normalisiert.
const rawScale=recordShadowSnapshots(base(),[{symbol:'RAW',price:10,score:6.2,currency:'EUR'}],t0);
assert.equal(Object.values(rawScale.open)[0].score,62);

const positions=[{symbol:'A',theme:'CHINA_TECH',currency:'HKD'},{symbol:'B',theme:'CHINA_TECH',currency:'HKD'}];
assert.equal(correlationGateV314('C',{theme:'CHINA_TECH',currency:'HKD'},positions,{lastEntryAt:0},t0).kind,'THEME_CLUSTER');
assert.equal(correlationGateV314('ASML',{theme:'SEMI',currency:'EUR'},positions,{lastEntryAt:0},t0).ok,true);
assert.equal(correlationGateV314('ASML',{theme:'SEMI',currency:'EUR'},positions,{lastEntryAt:t0-60000},t0).kind,'ENTRY_SPACING');

const warmup={actions:[{symbol:'NEW',action:'BUY',allocation_pct:22}],summary:'x'};
const storage={data:null,async get(){return this.data},async put(k,v){this.data=v}};
const out=await enforceShadowLearningV314(warmup,{config:{slippage_percent:.1},candidates:[{symbol:'NEW',price:10,decisionScore:60,theme:'A',currency:'EUR'}],positions:[]},storage,t0);
assert.equal(out.plan.actions[0].action,'BUY');
assert.equal(out.persisted,true);
assert.ok(storage.data);
assert.equal(storage.data.lastEntryAt,0,'nur tatsaechlich ausgefuehrte Einstiege werden dauerhaft als Abstandsbasis gespeichert');
assert.equal(estimatedRoundTripCostPctV314({config:{slippage_percent:.1,fee_fixed:0}}),.291);

const pair={actions:[{symbol:'ONE',action:'BUY',allocation_pct:20},{symbol:'TWO',action:'BUY',allocation_pct:20}],summary:'x'};
const pairOut=await enforceShadowLearningV314(pair,{candidates:[
  {symbol:'ONE',price:10,decisionScore:65,theme:'A',currency:'EUR'},
  {symbol:'TWO',price:10,decisionScore:65,theme:'B',currency:'USD'}
],positions:[],history:[]},null,t0);
assert.equal(pairOut.plan.actions[0].action,'BUY');
assert.equal(pairOut.plan.actions[1].shadowBlockKind,'ENTRY_SPACING');
console.log('OK — V31.4 Shadow Learning, canonical score, cost model and concentration filter');
