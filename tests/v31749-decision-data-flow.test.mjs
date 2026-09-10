import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UnifiedDecisionCoreV310} from '../src/unified-decision-core-v310.js';
import {enforcePaperExplorationV3172} from '../src/paper-exploration-v3172.js';
import {pcQuoteFallbackV31750,pcDeepFallbackV31750} from '../src/market-v3-base.js';

const now=Date.parse('2026-09-10T10:00:00Z');
const exact={isin:'DE000A1EWWW0',assetClass:'EQUITY',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic official universe'};

// Der aktuelle Scan muss Volumen und Kursfrische bis in die finale V31.7-Schicht tragen.
{
  const r2=readFileSync(new URL('../src/r2-portfolio.js',import.meta.url),'utf8');
  for(const field of ['price:num(x.price)','marketTimestamp:','quoteAgeMinutes:','fresh:x?.fresh===true||Number(x?.fresh)===1','volumeRatio:','volumeRatioSource:','volumeSampleCount:'])assert.ok(r2.includes(field),`${field} fehlt im Entscheidungs-Prompt`);
  const candidate={symbol:'FLOW.DE',name:'Flow AG',type:'EQUITY',price:100,decisionScore:72,liveScore:72,confidence:.78,liveConfidence:.78,momentum5Pct:.25,intraday5m:.25,momentum20Pct:.55,intraday20m:.55,momentumAcceleration5:.08,volumeRatio:1.5,volumeRatioSource:'PREVIOUS_COMPLETED',volumeSampleCount:18,newsScore:.2,news:.2,newsConfidence:.8,newsSources:['WIRE'],fresh:true,quoteAgeMinutes:.3,marketTimestamp:now/1000,...exact};
  const inner={run:async()=>({response:JSON.stringify({actions:[{symbol:'FLOW.DE',action:'HOLD',allocation_pct:0,reason:'baseline'}],summary:'x'})})};
  const core=new UnifiedDecisionCoreV310(inner,{getState:()=>({config:{cash:10000,scan_count:1},positions:[],candidates:[],history:[]}),getBrokerRows:async()=>[candidate],readOutcomeMemory:async()=>({}),writeOutcomeMemory:async()=>{}});
  await core.run('model',{messages:[{role:'user',content:`Kandidaten=${JSON.stringify([candidate])} Gehalten=[]`}]});
  assert.ok(core.latest.audit.topCandidates[0].dataQuality>=75,'Volumen und News muessen als verfuegbare Daten in der Finalschicht ankommen');
  assert.equal(core.latest.audit.topCandidates[0].orthogonalConfirmations,2);
}

// Der im Prompt dauerhaft gespeicherte Gewinn-Peak muss die letzte Trailing-Instanz erreichen.
{
  const stored={symbol:'WIN.DE',name:'Winner',invested:2200,entry_price:100,last_price:102.7,entry_fx:1,last_fx:1,opened_at:new Date(now-120*60000).toISOString(),decisionScore:72,rawDecisionScore:60};
  const promptHeld={...stored,pnlPct:2.7,peakPnlPct:3.8,givebackPct:1.1};
  const inner={run:async()=>({response:JSON.stringify({actions:[{symbol:'WIN.DE',action:'HOLD',allocation_pct:0,reason:'hold'}],summary:'x'})})};
  const core=new UnifiedDecisionCoreV310(inner,{getState:()=>({config:{cash:5000,scan_count:2},positions:[stored],candidates:[],history:[]}),getBrokerRows:async()=>[],readOutcomeMemory:async()=>({}),writeOutcomeMemory:async()=>{}});
  const response=await core.run('model',{messages:[{role:'user',content:`Kandidaten=[] Gehalten=${JSON.stringify([promptHeld])}`}]});
  const plan=JSON.parse(response.response);
  assert.equal(plan.actions[0].action,'SELL','3.8% Peak mit 1.1% Ruecklauf muss den 0.9%-Trail ausloesen');
  assert.equal(core.latest.audit.positionStateSource,'PROMPT_CURRENT_SCAN');
}

// Quote-Alter ist die kanonische Frischequelle; ein fehlendes Legacy-fresh-Flag darf nicht blockieren.
{
  const broker={symbol:'ASML.AS',name:'ASML Holding',isin:'NL0010273215',brokerVerified:true,brokerMatchMode:'EXACT_NORMALIZED_NAME',brokerVerificationSource:'Trade Republic master',assetClass:'EQUITY'};
  const candidate={...broker,type:'EQUITY',price:650,decisionScore:64,day_change:1.1,momentum5Pct:.22,momentum20Pct:.25,acceleration5Pct:.02,volumeRatio:1.3,volumeRatioSource:'PREVIOUS_COMPLETED',newsScore:.08,newsConfidence:.7,newsSources:['WIRE'],intradayRsi:55,confidence:.72,quoteAgeMinutes:.4,marketTimestamp:now/1000};
  const prediction={symbol:'ASML.AS',score:64,forecast20mScore:67.2,signalConfidence:.72,velocity5:3.2,agreement:4,regime:'BULL',m5:.22,m20:.25,accel:.02,news:.08,day:1.1,rsi:55,direction:'UP'};
  const out=enforcePaperExplorationV3172({actions:[],summary:'x'},{positions:[],history:[],candidates:[candidate],config:{cash:10000}},{status:{matured:240,buySamples:0,missedOpportunities:12,mode:'BALANCED'},predictions:{'ASML.AS':prediction}},[broker],now);
  assert.equal(out.counters.injected,1);
}

// Wenn Yahoo aus Cloudflare heraus ausfaellt, bleibt der bereits auf dem PC
// zeitgekoppelte Kurs als vorsichtiger Kandidat erhalten. Er erfindet weder
// Volumen noch RSI und muss weiterhin News/Volumen- und Kosten-Gates bestehen.
{
  const bridge=readFileSync(new URL('../src/compact-portfolio-v288-pc-first.js',import.meta.url),'utf8');
  for(const field of ['pcPrice:c.price','pcDay:c.day','pcMomentum20:c.momentum20','pcMomentum5:c.momentum5','pcQuoteSource:'])assert.ok(bridge.includes(field),`${field} fehlt in der PC-Worker-Bruecke`);
  const row={symbol:'SAP.DE',name:'SAP',type:'EQUITY',currency:'EUR',pcPrice:250,pcPreScore:68,pcDeepScore:72,pcDay:1.2,pcMomentum5:.22,pcMomentum20:.55,pcMomentumAcceleration5:.04,pcConfidence:.72,pcMarketTimestamp:now/1000,pcStale:false};
  const coarse=pcQuoteFallbackV31750(row,now),deep=pcDeepFallbackV31750(coarse,now);
  assert.equal(coarse.fresh,true);assert.equal(deep.pcDeepFallback,true);assert.equal(deep.price,250);
  assert.equal(deep.volumeRatio,null,'PC-Fallback darf fehlendes Volumen nicht erfinden');
  assert.equal(pcQuoteFallbackV31750({...row,pcMarketTimestamp:(now-9*60000)/1000},now),null,'alter PC-Kurs darf nicht wiederbelebt werden');
}

console.log('V31.7.50 current data + profit peak + PC quote fallback regressions passed');
