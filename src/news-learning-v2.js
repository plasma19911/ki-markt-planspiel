import {clamp,num} from './constants.js';
import {updateNewsLearning as baseUpdate} from './news-learning.js';

const HORIZON='6h';

function trustedSourceStats(events){
 const out={};
 for(const e of events||[]){
  if(!Array.isArray(e.sources)||e.sources.length!==1)continue;
  const r=e.results?.[HORIZON];if(!r||!Number.isFinite(Number(r.alignedAbnormalPct)))continue;
  const key=e.sources[0],x=out[key]||(out[key]={key,samples:0,wins:0,sum:0,sumAbs:0});
  x.samples++;x.wins+=num(r.alignedAbnormalPct)>0?1:0;x.sum+=num(r.alignedAbnormalPct);x.sumAbs+=Math.abs(num(r.abnormalPct));
 }
 return Object.values(out).map(x=>{
  const hitRate=(x.wins+4)/(x.samples+8),avgAlignedPct=x.samples?x.sum/x.samples:0,avgAbsMovePct=x.samples?x.sumAbs/x.samples:0;
  const reliabilityScore=clamp(Math.round(50+(hitRate-.5)*65+clamp(avgAlignedPct,-3,3)*6),0,100);
  return{key:x.key,samples:x.samples,hitRate,avgAlignedPct,avgAbsMovePct,reliabilityScore,trusted:x.samples>=12&&reliabilityScore>=52&&avgAlignedPct>0,demoted:x.samples>=20&&reliabilityScore<45&&avgAlignedPct<=0};
 }).sort((a,b)=>(Number(b.trusted)-Number(a.trusted))||(b.reliabilityScore-a.reliabilityScore)||(b.samples-a.samples));
}

function confirmationStats(events){
 const buckets={};
 for(const e of events||[]){const r=e.results?.[HORIZON];if(!r||!Number.isFinite(Number(r.alignedAbnormalPct)))continue;const n=Math.max(1,Number(e.sources?.length||1)),key=n>=3?'3+ Quellen':n===2?'2 Quellen':'1 Quelle',x=buckets[key]||(buckets[key]={key,samples:0,wins:0,sum:0});x.samples++;x.wins+=num(r.alignedAbnormalPct)>0?1:0;x.sum+=num(r.alignedAbnormalPct)}
 return Object.values(buckets).map(x=>({key:x.key,samples:x.samples,hitRate:(x.wins+3)/(x.samples+6),avgAlignedPct:x.samples?x.sum/x.samples:0})).sort((a,b)=>b.samples-a.samples);
}

export async function updateNewsLearning(state){
 const l=await baseUpdate(state),trusted=trustedSourceStats(l.events),confirmation=confirmationStats(l.events);
 l.trustedSources=trusted;
 l.confirmationStats=confirmation;
 l.summary={...(l.summary||{}),topSources:trusted.filter(x=>x.samples>=5).slice(0,10),trustedSources:trusted.filter(x=>x.trusted).slice(0,8),demotedSources:trusted.filter(x=>x.demoted).slice(0,8),confirmationStats:confirmation,sourcePolicy:{minimumTrustedSamples:12,minimumDemotionSamples:20,activeSources:trusted.filter(x=>x.trusted).map(x=>x.key),demotedSources:trusted.filter(x=>x.demoted).map(x=>x.key)},sourceAttributionNote:'Quellenranking nutzt nur eindeutig einer Quelle zuordenbare 6h-Ereignisse. Erst ab 20 Messungen ohne positive abnormale Reaktion wird eine Quelle aus der Signalbildung entfernt; Mehrquellen-Meldungen bleiben separat messbar.'};
 state.newsLearning=l;return l;
}

export function newsLearningContext(state){
 const l=state?.newsLearning;if(!l)return null;
 return{benchmark:l.benchmark||'ACWI',updatedAt:l.updatedAt,sourceAttributionNote:l.summary?.sourceAttributionNote||'',trustedSources:(l.summary?.trustedSources||[]).slice(0,6),demotedSources:(l.summary?.demotedSources||[]).slice(0,6),topTypes:(l.summary?.topTypes||[]).filter(x=>num(x.samples)>=8).slice(0,6),confirmationStats:(l.summary?.confirmationStats||[]).slice(0,3),evaluatedEvents:num(l.summary?.evaluatedEvents),notice:'Quellen werden erst ab 12 eindeutigen 6h-Auswertungen positiv gewichtet und erst ab 20 wirkungslosen Messungen aus der Signalbildung genommen. Keine Erfolgswahrscheinlichkeit.'};
}
