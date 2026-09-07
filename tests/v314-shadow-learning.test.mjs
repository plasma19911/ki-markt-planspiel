import assert from 'node:assert';
import {
  recordShadowSnapshots,matureShadowSnapshots,scoreCalibrationV314,
  calibratedBuyThresholdV314,correlationGateV314,enforceShadowLearningV314,
  estimatedRoundTripCostPctV314,evidenceProfileV315,evidenceCalibrationV315,calibratedScoreBucketGateV315,
  canonicalEntryAssessmentV316,canonicalCalibrationV316,SHADOW_CALIBRATION_EPOCH
} from '../src/shadow-learning-v314.js';
import {completedVolumeRatio} from '../src/market-v3-base.js';

const base=()=>({version:31.4,open:{},matured:[],lastEntryAt:0,
  stats:{snapshots:0,matured:0,expired:0,themeBlocks:0,currencyBlocks:0,spacingBlocks:0,thresholdBlocks:0},threshold:null});
const t0=Date.now();
const completeVolume=completedVolumeRatio([100,120,80,200,0]);
assert.equal(completeVolume.source,'PREVIOUS_COMPLETED_1M');
assert.equal(completeVolume.observedVolume,200,'die laufende Null-Kerze darf die letzte abgeschlossene Volumenkerze nicht entwerten');
assert.equal(completeVolume.sampleCount,3);
assert.ok(completeVolume.ratio>1.9);
assert.equal(completedVolumeRatio([0,0,0]).source,'NO_RELIABLE_VOLUME');
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
const strongEvidence=evidenceProfileV315({momentum5:.3,momentum20:.7,volumeRatio:1.6,newsScore:.2,newsConfidence:.8,newsSources:['A','B'],rsi:60},[{momentum20:.1},{momentum20:.2}]);
assert.equal(strongEvidence.pillarCount,4);
assert.equal(strongEvidence.quality,100);
const evidenceCalibration=evidenceCalibrationV315([{evidenceVersion:31.5,evidenceQuality:20,ret:-.4},{evidenceVersion:31.5,evidenceQuality:80,ret:1.1},{evidenceQuality:0,ret:-9}]);
assert.ok(evidenceCalibration.find(x=>x.label==='CONFIRMED').avgReturnPct>1);
assert.equal(evidenceCalibration.reduce((n,x)=>n+x.samples,0),2,'alte V31.4-Samples werden nicht als schwache V31.5-Evidenz fehlklassifiziert');

const canonicalUniverse=[
  {symbol:'GOOD',momentum5Pct:.3,momentum20Pct:.8,volumeRatio:2,volumeRatioSource:'PREVIOUS_COMPLETED',newsScore:.6,newsConfidence:.9,newsSources:['OFFICIAL','WIRE']},
  {symbol:'PEER1',momentum5Pct:.1,momentum20Pct:.2},{symbol:'PEER2',momentum5Pct:0,momentum20Pct:0},{symbol:'PEER3',momentum5Pct:-.1,momentum20Pct:-.2}
];
const canonical=canonicalEntryAssessmentV316(canonicalUniverse[0],canonicalUniverse,[],.291);
assert.ok(canonical.score>=70,'mehrere unabhaengige bestaetigte Signale muessen klar herausstechen');
assert.equal(canonical.dataQuality,100);
const incomplete=canonicalEntryAssessmentV316({symbol:'MISS',momentum5Pct:.3,momentum20Pct:.8},canonicalUniverse,[],.291);
assert.ok(incomplete.dataQuality<canonical.dataQuality,'fehlende News- und Volumendaten muessen die Datenqualitaet senken');
assert.ok(incomplete.score<60,'reines Momentum ohne unabhaengige Bestaetigung darf nicht in die Kaufzone');
assert.equal(incomplete.orthogonalConfirmations,0);
const learnedRows=Array.from({length:25},(_,i)=>({symbol:`C${i}`,entryScoreVersion:31.7,entryScoreV317:canonical.score,ret:.6}));
const learned=canonicalEntryAssessmentV316(canonicalUniverse[0],canonicalUniverse,learnedRows,.291);
assert.equal(learned.mature,true);
assert.ok(learned.expectedNetEdgePct>0);
assert.equal(canonicalCalibrationV316(learnedRows,.291).find(x=>x.bucket===learned.bucket).samples,25);
const probationRows=[{symbol:'OLD1',entryScoreVersion:31.6,entryScoreV316:canonical.score,dataQualityV316:85,ret:-.2},{symbol:'OLD2',entryScoreVersion:31.6,entryScoreV316:canonical.score,dataQualityV316:85,ret:-.4}];
assert.equal(canonicalEntryAssessmentV316(canonicalUniverse[0],canonicalUniverse,probationRows,.291).probationBlocked,true,'zwei kompatible verlustreiche Nulltreffer muessen den Warmup-Bereich vorlaeufig pausieren');
const belowCostRows=[.10,.15,.20].map((ret,i)=>({symbol:`COST${i}`,entryScoreVersion:31.7,entryScoreV317:canonical.score,dataQualityV317:100,ret}));
const belowCost=canonicalEntryAssessmentV316(canonicalUniverse[0],canonicalUniverse,belowCostRows,.291);
assert.equal(belowCost.probationBlocked,true,'drei positive Rohbewegungen duerfen nicht gekauft werden, wenn sie nach Roundtrip-Kosten negativ bleiben');
assert.equal(belowCost.probationBlockReason,'NEGATIVE_NET_EDGE');
const flexibleWarmup=canonicalEntryAssessmentV316(canonicalUniverse[0],canonicalUniverse,belowCostRows.slice(0,2),.291);
assert.equal(flexibleWarmup.probationBlocked,false,'zwei positive Vorproben bleiben flexibel, bis die Mindestmenge fuer eine Netto-Sperre erreicht ist');

// Die alte Rohskala 0-10 wird vor dem Lernen auf 0-100 normalisiert.
const rawScale=recordShadowSnapshots(base(),[{symbol:'RAW',price:10,score:6.2,currency:'EUR'}],t0);
assert.equal(Object.values(rawScale.open)[0].score,62);

const positions=[{symbol:'A',theme:'CHINA_TECH',currency:'HKD'},{symbol:'B',theme:'CHINA_TECH',currency:'HKD'}];
assert.equal(correlationGateV314('C',{theme:'CHINA_TECH',currency:'HKD'},positions,{lastEntryAt:0},t0).kind,'THEME_CLUSTER');
assert.equal(correlationGateV314('ASML',{theme:'SEMI',currency:'EUR'},positions,{lastEntryAt:0},t0).ok,true);
assert.equal(correlationGateV314('ASML',{theme:'SEMI',currency:'EUR'},positions,{lastEntryAt:t0-60000},t0).kind,'ENTRY_SPACING');

const warmup={actions:[{symbol:'NEW',action:'BUY',allocation_pct:22}],summary:'x'};
const storage={data:null,async get(){return this.data},async put(k,v){this.data=v}};
const out=await enforceShadowLearningV314(warmup,{config:{slippage_percent:.1},candidates:[{symbol:'NEW',price:10,decisionScore:60,theme:'A',currency:'EUR',momentum5:.2,momentum20:.5,momentumAcceleration5:.1,volumeRatio:1.5,volumeRatioSource:'PREVIOUS_COMPLETED',newsScore:.2,newsConfidence:.8,newsSources:['OFFICIAL','WIRE']}],positions:[]},storage,t0);
assert.equal(out.plan.actions[0].action,'BUY');
assert.equal(out.persisted,true);
assert.ok(storage.data);
assert.equal(storage.data.lastEntryAt,0,'nur tatsaechlich ausgefuehrte Einstiege werden dauerhaft als Abstandsbasis gespeichert');
assert.equal(estimatedRoundTripCostPctV314({config:{slippage_percent:.1,fee_fixed:0}}),.291);

const bucketStorage={data:{version:31.7,calibrationEpoch:SHADOW_CALIBRATION_EPOCH,open:{},matured:Array.from({length:25},(_,i)=>({symbol:`B${i}`,score:66,ret:.02})),lastEntryAt:0,stats:{}},async get(){return this.data},async put(k,v){this.data=v}};
const bucketOut=await enforceShadowLearningV314({actions:[{symbol:'BUCKET',action:'BUY',allocation_pct:20}],summary:'x'},{config:{slippage_percent:.1},candidates:[{symbol:'BUCKET',price:10,decisionScore:69,momentum5:.3,momentum20:.5}],positions:[]},bucketStorage,t0);
assert.equal(bucketOut.counters.roundTripCostPct,.291,'nuller optionaler Kostenwert darf nicht als 0 Prozent interpretiert werden');
assert.equal(calibratedScoreBucketGateV315(66,bucketOut.calibration,.291).ok,false);

const legacyStorage={data:{version:31.7,open:{OLD:{symbol:'OLD',at:t0-1000,price:10}},matured:Array.from({length:30},(_,i)=>({symbol:`OLD${i}`,entryScoreVersion:31.7,entryScoreV317:65,ret:-1})),stats:{}},async get(){return this.data},async put(k,v){this.data=v}};
const epochOut=await enforceShadowLearningV314({actions:[],summary:'epoch'}, {candidates:[],positions:[]},legacyStorage,t0);
assert.equal(epochOut.counters.epochReset,true,'alte Kalibrierung aus unvollstaendigen News-/Volumeninputs muss einmalig archiviert werden');
assert.equal(epochOut.counters.archivedMaturedSamples,30);
assert.equal(legacyStorage.data.matured.length,0,'alte Defektsamples duerfen die neue Score-Epoche nicht blockieren');
assert.equal(legacyStorage.data.archiveSummary.reason,'NEWS_VOLUME_INPUT_PIPELINE_REPAIRED');

const pair={actions:[{symbol:'ONE',action:'BUY',allocation_pct:20},{symbol:'TWO',action:'BUY',allocation_pct:20}],summary:'x'};
const pairOut=await enforceShadowLearningV314(pair,{candidates:[
  {symbol:'ONE',price:10,decisionScore:65,theme:'A',currency:'EUR',momentum5:.2,momentum20:.5,volumeRatio:1.5,volumeRatioSource:'PREVIOUS_COMPLETED',newsScore:.2,newsConfidence:.8,newsSources:['A','B']},
  {symbol:'TWO',price:10,decisionScore:65,theme:'B',currency:'USD',momentum5:.2,momentum20:.5,volumeRatio:1.5,volumeRatioSource:'PREVIOUS_COMPLETED',newsScore:.2,newsConfidence:.8,newsSources:['A','B']}
],positions:[],history:[]},null,t0);
assert.equal(pairOut.plan.actions[0].action,'BUY');
assert.equal(pairOut.plan.actions[1].shadowBlockKind,'ENTRY_SPACING');
const heldOut=await enforceShadowLearningV314({actions:[{symbol:'HELD',action:'BUY',allocation_pct:40}],summary:'x'},{candidates:[{symbol:'HELD',price:10}],positions:[{symbol:'HELD',entry_price:10,last_price:10}]},null,t0);
assert.equal(heldOut.plan.actions[0].shadowBlockKind,'ALREADY_HELD_NO_AUTO_SCALEUP','automatisches Wiederholungs-BUY auf Bestand muss im finalen Plan verschwinden');
const negativeNews=await enforceShadowLearningV314({actions:[{symbol:'BAD',action:'BUY',allocation_pct:20}],summary:'x'},{candidates:[
  {symbol:'BAD',price:10,decisionScore:75,newsScore:-.6,newsConfidence:.9,newsSources:['OFFICIAL','WIRE'],momentum5:.3,momentum20:.5}
],positions:[],history:[]},null,t0);
assert.equal(negativeNews.plan.actions[0].shadowBlockKind,'CONFIRMED_NEGATIVE_NEWS');
console.log('OK — V31.7 orthogonal confirmation, probation, repeat-BUY protection and shadow learning');
