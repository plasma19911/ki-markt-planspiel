const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const LEGAL=new Set(['inc','incorporated','corp','corporation','company','co','plc','ag','se','sa','nv','oyj','ab','asa','ltd','limited','holdings','holding','group','registered','ordinary','shares','ord','shs']);
const POSITIVE=['raises guidance','raised guidance','beats estimates','beat estimates','record orders','record backlog','approval granted','strategic partnership','new customer','buyback','dividend increase','price target raised','funding secured','strong demand','prognose angehoben','gewinn steigt','umsatz steigt','übertrifft erwartungen'];
const NEGATIVE=['cuts guidance','cut guidance','misses estimates','missed estimates','investigation','regulatory probe','data breach','cyberattack','production delay','delivery delay','recall','price target cut','bankruptcy','default','fraud','export ban','prognose gesenkt','gewinnwarnung','umsatzwarnung','verfehlt erwartungen'];
const normalize=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9äöüß]+/gi,' ').replace(/\s+/g,' ').trim();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
function headlineScore(headline=''){const text=normalize(headline);let score=0;for(const x of POSITIVE)if(text.includes(normalize(x)))score+=.85;for(const x of NEGATIVE)if(text.includes(normalize(x)))score-=.9;return clamp(score,-2,2)}
function companyWords(c={}){return normalize(c?.name||c?.symbol).split(' ').filter(w=>w.length>=4&&!LEGAL.has(w))}
export function newsHeadlineMatchesEntity(c={},headline=''){
 const t=normalize(headline);if(!t)return false;
 const words=companyWords(c),tokens=new Set(t.split(' '));
 if(words.length&&t.includes(words.slice(0,Math.min(2,words.length)).join(' ')))return true;
 if(words[0]?.length>=5&&tokens.has(words[0]))return true;
 const sym=key(c).split('.')[0].replace(/[^A-Z0-9]/gi,'').toLowerCase();
 return sym.length>=4&&tokens.has(sym);
}
function reverseNewsContribution(c={},radar={}){
 const score=num(c.newsScore,c.news_score),confidence=num(c.newsConfidence,c.news_confidence),weight=num(radar.latestWeight,0);
 return score*confidence*weight;
}
function neutralizeCandidate(c,radar){
 const removed=reverseNewsContribution(c,radar);
 c.score=num(c.score)-removed;
 c.newsScore=0;c.newsConfidence=0;c.newsSources=[];c.headlines=[];c.newsTradingAgeHours=null;c.newsClusters=0;
 c.newsEntityFiltered=true;c.newsEntityRemovedContribution=+removed.toFixed(6);
 if(Array.isArray(c.pro))c.pro=c.pro.filter(x=>!/^News \+/i.test(String(x||'')));
 if(Array.isArray(c.contra))c.contra=c.contra.filter(x=>!/^News /i.test(String(x||'')));
 if(Array.isArray(c.reasons))c.reasons=[...(c.pro||[]),...(c.contra||[])];
}
function applyRelevantCandidate(c,radar,next){
 const old=reverseNewsContribution(c,radar),fresh=num(next.latestWeight),score=num(next.score),confidence=num(next.confidence),added=score*confidence*fresh;
 c.score=num(c.score)-old+added;c.newsScore=score;c.newsConfidence=confidence;c.newsSources=next.sources;c.headlines=next.headlines;c.newsTradingAgeHours=radar.tradingAgeHours??radar.trading_age_hours??null;c.newsClusters=next.clusterCount;c.newsEntityFiltered=true;c.newsEntityRemovedContribution=+(old-added).toFixed(6);
 if(Array.isArray(c.pro))c.pro=c.pro.filter(x=>!/^News \+/i.test(String(x||'')));
 if(Array.isArray(c.contra))c.contra=c.contra.filter(x=>!/^News /i.test(String(x||'')));
 if(score>.25)c.pro=[...(c.pro||[]),`News +${score.toFixed(1)} · ${next.clusterCount} relevanter Ereigniscluster`];
 if(score<-.25)c.contra=[...(c.contra||[]),`News ${score.toFixed(1)} · ${next.clusterCount} relevanter Ereigniscluster`];
 c.reasons=[...(c.pro||[]),...(c.contra||[])];
}
export function sanitizeNewsEntityRelevance(result={}){
 const refs=new Map();
 for(const x of [...(result?.universe||[]),...(result?.candidates||[])])if(key(x))refs.set(key(x),x);
 const candidates=new Map((result?.candidates||[]).map(x=>[key(x),x]));
 let droppedRows=0,droppedHeadlines=0,neutralizedCandidates=0;
 const clean=[];
 for(const row of result?.newsRadar||[]){
  const s=key(row),meta=refs.get(s);if(!meta){clean.push(row);continue}
  const details=(Array.isArray(row?.headlineDetails)?row.headlineDetails:Array.isArray(row?.headline_details)?row.headline_details:[]).filter(x=>x?.headline),headlines=(Array.isArray(row?.headlines)?row.headlines:[row?.headline]).filter(Boolean),relevantDetails=details.filter(x=>newsHeadlineMatchesEntity(meta,x.headline)),relevant=(relevantDetails.length?relevantDetails.map(x=>x.headline):headlines.filter(h=>newsHeadlineMatchesEntity(meta,h)));
  droppedHeadlines+=Math.max(0,headlines.length-relevant.length);
  if(!relevant.length){
   droppedRows++;const c=candidates.get(s);if(c){neutralizeCandidate(c,row);neutralizedCandidates++}continue;
  }
  if(relevant.length!==headlines.length){
   const scored=relevantDetails.length?relevantDetails.map(x=>num(x.eventScore,headlineScore(x.headline))):relevant.map(headlineScore),score=clamp(scored.length?scored.reduce((a,b)=>a+b,0)/scored.length:0,-2,2),sourceSet=new Set((relevantDetails.length?relevantDetails.flatMap(x=>x.sources||[]):row.sources||[]).map(String).filter(Boolean)),confirmations=relevantDetails.length?relevantDetails.reduce((a,x)=>a+Math.max(1,num(x.confirmations,1)),0):relevant.length,latestWeight=num(relevantDetails[0]?.freshness,row.latestWeight),confidence=clamp(.22+Math.min(.26,relevant.length*.045)+Math.min(.28,sourceSet.size*.1)+Math.min(.18,latestWeight*.1)+Math.min(.14,confirmations*.04),0,1),next={...row,score,confidence,freshImpact:Math.abs(score)*confidence*Math.max(.1,latestWeight),latestWeight,tendency:score>.28?'BULLISH':score<-.28?'BEARISH':'NEUTRAL',sourceCount:sourceSet.size,sources:[...sourceSet],clusterCount:relevant.length,confirmationCount:confirmations,headline:relevant[0],headlines:relevant,headlineDetails:relevantDetails,newsAt:relevantDetails[0]?.publishedAt||row.newsAt,newsEntityFiltered:true,newsEntityPartiallyFiltered:true};
   const c=candidates.get(s);if(c){applyRelevantCandidate(c,row,next);neutralizedCandidates++}
   clean.push(next);
  }else clean.push({...row,headline:relevant[0],headlines:relevant});
 }
 result.newsRadar=clean;
 result.newsEntityFilter={version:1,droppedRows,droppedHeadlines,neutralizedCandidates,policy:'Headlines ohne expliziten Firmen- oder Tickerbezug werden nicht als symbolbezogenes Score-Signal verwendet.'};
 if(Array.isArray(result.candidates))result.candidates.sort((a,b)=>num(b?.score)-num(a?.score));
 return result;
}
