import assert from 'node:assert/strict';
import {enforceUnifiedDecisionCoreV310,UnifiedDecisionCoreV310} from '../src/unified-decision-core-v310.js';

const exact={isin:'DE000A1EWWW0',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic official universe'};
const now=Date.parse('2026-08-25T12:00:00Z');

{
  const candidate={symbol:'TEST.DE',name:'Test AG',decisionScore:72,momentum5Pct:.2,momentum20Pct:.5,momentumAcceleration5:.08,volumeRatio:1.5,volumeRatioSource:'PREVIOUS_COMPLETED',newsScore:.2,newsConfidence:.8,newsSources:['OFFICIAL','WIRE'],entryQualityScore:68,...exact};
  const state={config:{cash:10000,scan_count:1},positions:[],candidates:[candidate],history:[]};
  const plan={actions:[{symbol:'TEST.DE',action:'HOLD',allocation_pct:0,reason:'soft timing hold'}],summary:'test'};
  const out=await enforceUnifiedDecisionCoreV310(plan,state,null,[candidate],now);
  const a=out.plan.actions.find(x=>x.symbol==='TEST.DE');
  assert.equal(a.action,'BUY','70+ exact-TR candidate with mild pullback should be buyable');
  assert.ok(Number(a.allocation_pct)>=22,'strong candidate should not remain a mini starter');
  assert.ok(out.audit.changes.length>=1,'decision changes must be audited');
  assert.equal(out.audit.patch,'31.7.1-candidate-state-recovery+orthogonal-confirmation+probation+failed-setup-exit');
  assert.ok(out.audit.outcomeLearning,'outcome learning metadata must be part of the unified audit');
  assert.ok(out.audit.shadowLearning,'shadow calibration metadata must be part of the unified audit');
  assert.equal(out.audit.finalActions[0].expectedNetEdgePctV316,null,'Warmup-Edge muss null bleiben und darf nicht als scheinbare 0-Prozent-Prognose erscheinen');
}

{
  const held={symbol:'HELD.DE',name:'Held AG',invested:2200,entry_price:100,last_price:100.1,entry_fx:1,last_fx:1,opened_at:'2026-08-25T11:00:00Z',decisionScore:75,rawDecisionScore:60,...exact};
  const state={config:{cash:5000,scan_count:2},positions:[held],candidates:[held],history:[]};
  const out=await enforceUnifiedDecisionCoreV310({actions:[{symbol:'HELD.DE',action:'BUY',allocation_pct:60,reason:'legacy repeat buy'}],summary:'x'},state,null,[held],now);
  assert.equal(out.plan.actions.find(x=>x.symbol==='HELD.DE').action,'HOLD','bereits gehaltene Aktie darf nicht erneut automatisch gekauft werden');
}

{
  const p={symbol:'LOSS.DE',name:'Loss AG',invested:2200,entry_price:100,last_price:98.5,entry_fx:1,last_fx:1,opened_at:'2026-08-25T11:00:00Z',decisionScore:70,rawDecisionScore:60};
  const state={config:{cash:5000,scan_count:2},positions:[p],candidates:[],history:[]};
  const out=await enforceUnifiedDecisionCoreV310({actions:[{symbol:'LOSS.DE',action:'HOLD',reason:'score still okay'}],summary:'x'},state,null,[],now);
  const a=out.plan.actions.find(x=>x.symbol==='LOSS.DE');
  assert.equal(a.action,'SELL','-1.5% must trigger hard price stop');
  assert.equal(a.hardStopV310,true);
}

{
  const p={symbol:'NEW.DE',name:'New AG',invested:2200,entry_price:100,last_price:99.8,entry_fx:1,last_fx:1,opened_at:'2026-08-25T11:55:00Z'};
  const state={config:{cash:5000,scan_count:3},positions:[p],candidates:[],history:[]};
  const out=await enforceUnifiedDecisionCoreV310({actions:[{symbol:'NEW.DE',action:'SELL',reason:'raw score wobble'}],summary:'x'},state,null,[],now);
  assert.equal(out.plan.actions.find(x=>x.symbol==='NEW.DE').action,'HOLD','fresh normal score sell should be blocked');
}

{
  const p={symbol:'ROTATE.DE',name:'Rotate AG',invested:2400,entry_price:100,last_price:100.1,entry_fx:1,last_fx:1,opened_at:'2026-08-25T11:40:00Z',decisionScore:52,rawDecisionScore:48,momentum5Pct:-0.1,momentum20Pct:-0.2};
  const state={config:{cash:1000,scan_count:4},positions:[p],candidates:[p],history:[]};
  const plan={actions:[{symbol:'ROTATE.DE',action:'SELL',relativeRotationV304:true,reason:'paired score rotation'}],summary:'x'};
  const out=await enforceUnifiedDecisionCoreV310(plan,state,null,[],now);
  const a=out.plan.actions.find(x=>x.symbol==='ROTATE.DE');
  assert.equal(a.action,'SELL','unified authority must preserve a qualified paired rotation');
  assert.equal(a.pairedRotationApprovedV313,true);
}

{
  const candidate={symbol:'PROMPT.DE',name:'Prompt AG',price:100,decisionScore:64,daytradeLiveScore:64,confidence:.74,momentum5Pct:.24,momentum20Pct:.3,momentumAcceleration5:.08,acceleration5Pct:.08,volumeRatio:1.5,volumeRatioSource:'PREVIOUS_COMPLETED',newsScore:.2,newsConfidence:.8,newsSources:['OFFICIAL','WIRE'],entryQualityScore:68,day_change:1.1,intradayRsi:61,chartDirectionMode:'UP',eventRisk:'NONE',momentumSellSignal:'NONE',...exact};
  let memory={};
  const inner={run:async()=>({response:JSON.stringify({actions:[{symbol:'PROMPT.DE',action:'HOLD',allocation_pct:0,reason:'baseline'}],summary:'prompt recovery'})})};
  const core=new UnifiedDecisionCoreV310(inner,{
    getState:()=>({config:{cash:10000,scan_count:81},positions:[],candidates:[],history:[]}),
    getBrokerRows:async()=>[candidate],
    readOutcomeMemory:async()=>memory,
    writeOutcomeMemory:async next=>{memory=next}
  });
  await core.run('model',{messages:[{role:'user',content:`Kandidaten=${JSON.stringify([candidate])} Gehalten=[]`}]});
  const status=core.status();
  assert.equal(status.outcomeLearning.currentCandidates,1,'current prompt candidates must feed outcome learning even if persisted state is empty');
  assert.equal(status.outcomeLearning.trackedSymbols,1,'prompt candidate must be persisted for later 5/20/60/240m evaluation');
  assert.equal(core.latest.audit.candidateStateSource,'PROMPT_CURRENT_SCAN');
  assert.equal(core.latest.audit.currentCandidateCount,1);
}
console.log('V31.7.1 candidate recovery + orthogonal entry + unified capital velocity regression OK');