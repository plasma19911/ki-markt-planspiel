import {classifyNewsImpact} from './news-impact-intelligence.js';

const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const base=v=>key(v).split('.')[0];
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const normal=v=>clean(v).normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9äöüß]+/gi,' ').trim();
const HEADERS={'accept':'application/json,application/rss+xml,text/xml,*/*;q=.6','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/V31.7.10 paper-news-catalyst)'};
const cache=new Map();

export const NEWS_CATALYST_V31710={
  version:31.710,
  patch:'31.7.10-fresh-news+market-reaction-confirmation',
  paperOnly:true,
  cacheSeconds:90,
  maxLookupsPerScan:2,
  maxAgeMinutes:120,
  positiveImpactMin:3,
  negativeImpactMin:4,
  positiveM5Min:.15,
  positiveM20Min:0,
  negativeM5Max:-.15,
  negativeM20Max:-.25,
  relativeVolumeConfirm:1.10,
  maxNewsScoreAbs:.70,
  rule:'Frische News sind nur ein Katalysator. Positive News werden erst mit positiver 5m/20m-Kursreaktion und Volumen/Impuls zur BUY-Bestaetigung. Strukturell negative News blockieren neue BUYs; gehaltene Positionen werden nur bei bestaetigter negativer Reaktion oder mehrfach bestaetigtem kritischem Ereignis zum SELL vorgeschlagen.'
};

function tokens(v=''){const stop=new Set(['inc','corp','corporation','company','group','holdings','holding','plc','ag','se','sa','nv','ltd','limited','registered','shares','ordinary','class','stock','aktie','aktien']);return normal(v).split(' ').filter(x=>x.length>=3&&!stop.has(x))}
function companyName(x={}){return clean(x?.name||x?.companyName||x?.tradeRepublicName||base(x))}
function matchesCompany(x={},headline=''){
  const h=` ${normal(headline)} `,words=tokens(companyName(x)),ticker=base(x).toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!h.trim())return false;
  if(words.length>=2&&h.includes(` ${words[0]} ${words[1]} `))return true;
  if(words[0]?.length>=5&&h.includes(` ${words[0]} `))return true;
  return ticker.length>=4&&new RegExp(`(^|\\s)${ticker}(\\s|$)`,'i').test(h);
}
function publishedIso(raw){const n=Number(raw);if(Number.isFinite(n)&&n>1e9)return new Date(n*(n<1e12?1000:1)).toISOString();const t=Date.parse(String(raw||''));return Number.isFinite(t)?new Date(t).toISOString():null}
function ageMinutes(row,now=Date.now()){const t=Date.parse(String(row?.publishedAt||''));return Number.isFinite(t)?Math.max(0,(now-t)/60000):Infinity}
function freshness(age){return age<=15?1:age<=45?.90:age<=90?.76:age<=120?.58:0}
function uniqRows(rows=[]){const seen=new Set(),out=[];for(const r of arr(rows).sort((a,b)=>(Date.parse(b?.publishedAt)||0)-(Date.parse(a?.publishedAt)||0))){const k=normal(r?.headline).slice(0,180);if(!k||seen.has(k))continue;seen.add(k);out.push(r)}return out}

async function yahooRows(target){
  const q=new URL('https://query2.finance.yahoo.com/v1/finance/search');q.searchParams.set('q',`${companyName(target)} ${base(target)}`);q.searchParams.set('quotesCount','0');q.searchParams.set('newsCount','10');q.searchParams.set('enableFuzzyQuery','false');
  const r=await fetch(q,{headers:HEADERS,redirect:'follow'});if(!r.ok)throw new Error(`Yahoo HTTP ${r.status}`);const j=await r.json(),rows=[];
  for(const x of arr(j?.news)){const headline=clean(x?.title),publishedAt=publishedIso(x?.providerPublishTime||x?.publishedAt),source=clean(x?.publisher||x?.provider?.displayName||'Yahoo Finance');if(headline&&publishedAt&&matchesCompany(target,headline))rows.push({headline,publishedAt,source,url:clean(x?.link||x?.url),origin:'YAHOO'})}
  return rows;
}
function decodeXml(v){return clean(v).replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]+>/g,' ').trim()}
async function googleRows(target){
  const q=new URL('https://news.google.com/rss/search');q.searchParams.set('q',`"${companyName(target).replace(/"/g,'')}" stock OR shares when:2h`);q.searchParams.set('hl','en-US');q.searchParams.set('gl','US');q.searchParams.set('ceid','US:en');
  const r=await fetch(q,{headers:HEADERS,redirect:'follow'});if(!r.ok)throw new Error(`Google News HTTP ${r.status}`);const xml=await r.text(),rows=[];
  for(const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){const b=m[1],headline=decodeXml(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),pub=decodeXml(b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]),src=decodeXml(b.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1])||'Google News',publishedAt=publishedIso(pub);if(headline&&publishedAt&&matchesCompany(target,headline))rows.push({headline,publishedAt,source:src,url:null,origin:'GOOGLE'})}
  return rows.slice(0,10);
}
async function fetchTarget(target){const started=Date.now();let rows=[],errors=[];try{rows=await yahooRows(target)}catch(e){errors.push(String(e?.message||e))}if(rows.length<2){try{rows.push(...await googleRows(target))}catch(e){errors.push(String(e?.message||e))}}return{at:Date.now(),rows:uniqRows(rows),latencyMs:Date.now()-started,error:errors.join(' · ').slice(0,200)}}

function metrics(x={}){return{
  m5:num(x?.momentum5Pct,x?.momentum5??x?.intraday5m),m20:num(x?.momentum20Pct,x?.momentum20??x?.intraday20m),volume:num(x?.volumeRatio??x?.volume_ratio,1),day:num(x?.day_change??x?.dayChange??x?.day),
  direction:String(x?.chartDirectionMode??x?.direction??'').toUpperCase(),scoreStep:num(x?.scoreDeltaThisScan),chartStep:num(x?.chartMoveLastScanPct)
}}
export function scoreNewsCatalystV31710(target={},rows=[],now=Date.now()){
  const fresh=uniqRows(rows).filter(r=>ageMinutes(r,now)<=NEWS_CATALYST_V31710.maxAgeMinutes),ranked=fresh.map(r=>{const impact=classifyNewsImpact(r.headline),age=ageMinutes(r,now),freshnessWeight=freshness(age),strength=impact.direction*(impact.impact/5)*freshnessWeight;return{...r,impact,ageMinutes:+age.toFixed(1),freshnessWeight:+freshnessWeight.toFixed(3),strength:+strength.toFixed(4)}}).filter(r=>r.freshnessWeight>0).sort((a,b)=>Math.abs(b.strength)-Math.abs(a.strength)||(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));
  const best=ranked[0]||null,m=metrics(target),sources=[...new Set(ranked.slice(0,6).map(r=>r.source).filter(Boolean))],sourceCount=sources.length,confidence=best?clamp(.30+best.impact.impact*.07+Math.min(.20,sourceCount*.07)+best.freshnessWeight*.15,.30,.92):0;
  const positiveReaction=m.m5>=NEWS_CATALYST_V31710.positiveM5Min&&m.m20>=NEWS_CATALYST_V31710.positiveM20Min&&(m.volume>=NEWS_CATALYST_V31710.relativeVolumeConfirm||m.m5+m.m20>=.35);
  const negativeReaction=m.m5<=NEWS_CATALYST_V31710.negativeM5Max||m.m20<=NEWS_CATALYST_V31710.negativeM20Max||(m.direction==='DOWN'&&(m.scoreStep<=-1||m.chartStep<=-.10));
  const positive=Boolean(best&&best.impact.direction>0&&best.impact.impact>=NEWS_CATALYST_V31710.positiveImpactMin),negative=Boolean(best&&best.impact.direction<0&&best.impact.impact>=NEWS_CATALYST_V31710.negativeImpactMin),criticalNegative=Boolean(negative&&best.impact.impact>=5&&best.impact.structural===true&&best.freshnessWeight>=.76&&(sourceCount>=2||negativeReaction));
  const positiveConfirmed=positive&&positiveReaction&&!((m.day>=4||m.m20>=2)&&m.m5<.12),negativeConfirmed=negative&&(negativeReaction||criticalNegative),chaseRisk=positive&&(m.day>=4||m.m20>=2)&&m.m5<.12;
  const rawStrength=best?clamp(best.strength,-NEWS_CATALYST_V31710.maxNewsScoreAbs,NEWS_CATALYST_V31710.maxNewsScoreAbs):0;
  return{symbol:key(target),headline:best?.headline||'',eventType:best?.impact?.type||'NONE',direction:best?.impact?.direction||0,impact:best?.impact?.impact||0,structural:best?.impact?.structural===true,publishedAt:best?.publishedAt||null,ageMinutes:best?.ageMinutes??null,newsScore:+rawStrength.toFixed(3),confidence:+confidence.toFixed(3),sources,sourceCount,positive,negative,positiveReaction,negativeReaction,positiveConfirmed,negativeConfirmed,criticalNegative,chaseRisk,m5:m.m5,m20:m.m20,volume:m.volume,rows:ranked.slice(0,6)};
}
function targetList(state={}){const map=new Map(),add=(x,priority)=>{const s=key(x);if(!s)return;const old=map.get(s),score=num(x?.daytradeLiveScore,x?.decisionScore??x?.score);if(!old||priority>old.priority)map.set(s,{...x,symbol:s,priority,score})};for(const p of arr(state?.positions))add(p,3);for(const c of arr(state?.candidates)){const score=num(c?.daytradeLiveScore,c?.decisionScore??c?.score),move=Math.abs(num(c?.day_change??c?.dayChange));if(score>=50||move>=2)add(c,score>=58?2:1)}return[...map.values()].sort((a,b)=>b.priority-a.priority||b.score-a.score).slice(0,10)}

export async function refreshNewsCatalystsV31710(state={},now=Date.now()){
  const targets=targetList(state),expired=targets.filter(t=>{const c=cache.get(key(t));return!c||now-c.at>=NEWS_CATALYST_V31710.cacheSeconds*1000}).sort((a,b)=>(cache.get(key(a))?.at||0)-(cache.get(key(b))?.at||0)||b.priority-a.priority).slice(0,NEWS_CATALYST_V31710.maxLookupsPerScan);
  await Promise.all(expired.map(async t=>cache.set(key(t),await fetchTarget(t))));
  const symbols=targets.map(t=>{const c=cache.get(key(t))||{at:0,rows:[],latencyMs:0,error:null};return{...scoreNewsCatalystV31710(t,c.rows,now),fetchedAt:c.at?new Date(c.at).toISOString():null,latencyMs:c.latencyMs||0,error:c.error||null}});
  return{enabled:true,...NEWS_CATALYST_V31710,updatedAt:new Date(now).toISOString(),targets:targets.length,lookups:expired.length,symbols};
}
function mergeHeadlines(old=[],profile={}){const news=arr(profile.rows).map(r=>({headline:r.headline,title:r.headline,publishedAt:r.publishedAt,source:r.source,url:r.url||null,impactType:r.impact?.type,impact:r.impact?.impact,direction:r.impact?.direction,freshNewsCatalystV31710:true}));const seen=new Set(),out=[];for(const r of [...news,...arr(old)]){const h=normal(typeof r==='string'?r:r?.headline||r?.title);if(!h||seen.has(h))continue;seen.add(h);out.push(r)}return out.slice(0,12)}
function enrichRow(row={},profile=null){if(!profile||!profile.headline)return row;const existing=clamp(row?.newsScore??row?.news_score??0,-1,1),shouldApplyPositive=profile.positiveConfirmed,shouldApplyNegative=profile.negative,score=shouldApplyPositive?Math.max(existing,profile.newsScore):shouldApplyNegative?Math.min(existing,profile.newsScore):existing,sources=[...new Set([...arr(row?.newsSources??row?.news_sources),...profile.sources])].slice(0,8);return{...row,newsScore:+score.toFixed(3),news_score:+score.toFixed(3),newsConfidence:Math.max(num(row?.newsConfidence??row?.news_confidence),profile.confidence),news_confidence:Math.max(num(row?.newsConfidence??row?.news_confidence),profile.confidence),newsSources:sources,news_sources:sources,headlines:mergeHeadlines(row?.headlines,profile),newsCatalystV31710:profile,eventRisk:profile.criticalNegative?'HIGH':row?.eventRisk??row?.event_risk,event_risk:profile.criticalNegative?'HIGH':row?.event_risk??row?.eventRisk}}
export function applyNewsCatalystSnapshotV31710(state={},snapshot={}){const by=new Map(arr(snapshot?.symbols).map(x=>[key(x),x]));state.candidates=arr(state?.candidates).map(x=>enrichRow(x,by.get(key(x))));state.positions=arr(state?.positions).map(x=>enrichRow(x,by.get(key(x))));state.newsCatalystV31710=snapshot;return state}

export function enforceNewsCatalystPlanV31710(plan={},state={}){
  if(!plan||!Array.isArray(plan.actions))return{plan,counters:{}};const rows=[...arr(state?.candidates),...arr(state?.positions)],by=new Map(rows.map(x=>[key(x),x?.newsCatalystV31710]).filter(([s,p])=>s&&p)),held=new Set(arr(state?.positions).map(key)),actions=plan.actions.map(a=>({...a})),index=new Map(actions.map((a,i)=>[key(a),i]));let negativeBuyBlocks=0,chaseBlocks=0,negativeExits=0,positiveConfirmed=0;
  for(let i=0;i<actions.length;i++){const a=actions[i],s=key(a),p=by.get(s),act=String(a?.action||'').toUpperCase();if(!p)continue;if(p.positiveConfirmed)positiveConfirmed++;if(act==='BUY'&&p.negative){actions[i]={...a,action:'HOLD',allocation_pct:0,confidence:Math.max(num(a?.confidence),.78),newsCatalystBlockV31710:true,reason:`V31.7.10 NEWS-BLOCK: ${p.eventType} (${p.headline.slice(0,180)}). Frischer negativer Katalysator; kein BUY gegen strukturelle News.`};negativeBuyBlocks++;continue}if(act==='BUY'&&p.chaseRisk){actions[i]={...a,action:'HOLD',allocation_pct:0,confidence:Math.max(num(a?.confidence),.72),newsCatalystChaseBlockV31710:true,reason:`V31.7.10 NEWS-CHASE-BLOCK: positiver Katalysator erkannt, aber Kurs bereits ausgedehnt ohne bestaetigten 5m-Reclaim. Meldung wird beobachtet, nicht hinterhergekauft.`};chaseBlocks++}}
  for(const s of held){const p=by.get(s);if(!p?.negativeConfirmed)continue;let i=index.get(s),a=i==null?null:actions[i];if(a&&String(a?.action||'').toUpperCase()==='SELL')continue;if(i==null){i=actions.length;index.set(s,i);actions.push({symbol:s,action:'HOLD',allocation_pct:0});a=actions[i]}actions[i]={...a,symbol:s,action:'SELL',allocation_pct:0,confidence:Math.max(num(a?.confidence),p.criticalNegative?.9:.80),newsCatalystExitV31710:true,reason:`V31.7.10 NEWS-CATALYST EXIT: ${p.eventType} (${p.headline.slice(0,180)}). Negative Kursreaktion ${p.negativeReaction?'bestaetigt':'durch mehrfach bestaetigtes kritisches Ereignis ersetzt'}; Paper-Gewinn/Verlust wird gegen weitere Verschlechterung geschuetzt.`};negativeExits++}
  const out={...plan,actions};if(negativeBuyBlocks||chaseBlocks||negativeExits||positiveConfirmed)out.summary=`${String(plan.summary||'').slice(0,120)} · V31.7.10 News: ${positiveConfirmed} positiv bestaetigt · ${negativeBuyBlocks} BUY blockiert · ${chaseBlocks} Chase blockiert · ${negativeExits} Exit.`;return{plan:out,counters:{positiveConfirmed,negativeBuyBlocks,chaseBlocks,negativeExits}}
}

export class NewsCatalystGuardV31710{
  constructor(inner,{getState}={}){this.inner=inner;this.getState=getState;this.latest=null}
  async run(model,input){const legacy=input===undefined&&model&&typeof model==='object',r=legacy?await this.inner.run(model):await this.inner.run(model,input),state=typeof this.getState==='function'?(this.getState()||{}):{};let raw=String(r?.response||r?.result?.response||''),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return r;let plan;try{plan=JSON.parse(raw.slice(a,b+1))}catch{return r}const out=enforceNewsCatalystPlanV31710(plan,state);this.latest=out.counters;const encoded=JSON.stringify(out.plan);if(r?.result&&typeof r.result==='object'&&'response'in r.result)return{...r,result:{...r.result,response:encoded}};if(r&&typeof r==='object'&&'response'in r)return{...r,response:encoded};return{response:encoded}}
  status(){return{enabled:true,...NEWS_CATALYST_V31710,insideUnifiedAuthority:true,decisionAuthority:false,latest:this.latest}}
}
