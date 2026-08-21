const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const LEGAL=new Set(['inc','incorporated','corp','corporation','company','co','plc','ag','se','sa','nv','oyj','ab','asa','ltd','limited','holdings','holding','group','registered','ordinary','shares','ord','shs']);
const normalize=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9äöüß]+/gi,' ').replace(/\s+/g,' ').trim();
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
export function sanitizeNewsEntityRelevance(result={}){
 const refs=new Map();
 for(const x of [...(result?.universe||[]),...(result?.candidates||[])])if(key(x))refs.set(key(x),x);
 const candidates=new Map((result?.candidates||[]).map(x=>[key(x),x]));
 let droppedRows=0,droppedHeadlines=0,neutralizedCandidates=0;
 const clean=[];
 for(const row of result?.newsRadar||[]){
  const s=key(row),meta=refs.get(s);if(!meta){clean.push(row);continue}
  const headlines=(Array.isArray(row?.headlines)?row.headlines:[row?.headline]).filter(Boolean),relevant=headlines.filter(h=>newsHeadlineMatchesEntity(meta,h));
  droppedHeadlines+=Math.max(0,headlines.length-relevant.length);
  if(!relevant.length){
   droppedRows++;const c=candidates.get(s);if(c){neutralizeCandidate(c,row);neutralizedCandidates++}continue;
  }
  if(relevant.length!==headlines.length){
   const c=candidates.get(s);if(c){neutralizeCandidate(c,row);neutralizedCandidates++}
   clean.push({...row,score:0,confidence:0,freshImpact:0,latestWeight:0,tendency:'NEUTRAL',sourceCount:0,sources:[],clusterCount:0,confirmationCount:0,headline:relevant[0],headlines:relevant,newsEntityFiltered:true});
  }else clean.push({...row,headline:relevant[0],headlines:relevant});
 }
 result.newsRadar=clean;
 result.newsEntityFilter={version:1,droppedRows,droppedHeadlines,neutralizedCandidates,policy:'Headlines ohne expliziten Firmen- oder Tickerbezug werden nicht als symbolbezogenes Score-Signal verwendet.'};
 if(Array.isArray(result.candidates))result.candidates.sort((a,b)=>num(b?.score)-num(a?.score));
 return result;
}
