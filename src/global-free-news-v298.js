import {classifyNewsImpact,detectNewsLanguageV298} from './news-impact-intelligence.js';

const KEY='state/global-free-news-v298';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>Number.isFinite(Number(v));
const num=(v,d=0)=>finite(v)?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=v=>String(v?.symbol||v||'').toUpperCase().trim();
const base=v=>key(v).split('.')[0];
const nowIso=()=>new Date().toISOString();
const read=(storage,d)=>{try{return storage?.kv?.get(KEY)||d}catch{return d}};
const write=(storage,v)=>{try{storage?.kv?.put(KEY,v)}catch{}};
const HEADERS={'accept':'application/rss+xml,application/atom+xml,application/json,text/xml,*/*;q=0.6','user-agent':'KI-Markt-Planspiel/29.8 free-news research contact=paper-trading'};

export const GLOBAL_FREE_NEWS_V298={
 version:29.8,
 freeOnly:true,
 cacheSeconds:90,
 maxTrackedSymbols:10,
 gdeltBatchSize:5,
 gdeltHours:6,
 maxRowsPerSymbol:12,
 maxScoreAbs:.70,
 primarySourceBoost:1.18,
 aggregatorWeight:.78,
 freshness:{m15:1,m60:.88,m180:.68,m720:.38,older:.16},
 rule:'Kostenlose Primärquellen + GDELT. Meldungen verändern den News-Anteil des DecisionScore; sie sind keine zweite BUY-Sperre hinter Score 56.'
};

const STOP=new Set(['the','and','for','with','from','this','that','after','before','into','will','says','said','stock','shares','company','group','corp','corporation','inc','limited','ltd','plc','aktie','aktien','unternehmen','firma','und','der','die','das','mit','von','für','des','den','les','des','pour','avec','una','para','con','della','delle','per','com','uma','een','voor','met']);
const clean=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const normal=s=>clean(s).normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const tokens=s=>normal(s).split(' ').filter(x=>x.length>=3&&!STOP.has(x));
const hash=s=>{let h=2166136261;for(const ch of String(s||'')){h^=ch.codePointAt(0)||0;h=Math.imul(h,16777619)}return(h>>>0).toString(36)};
function similarity(a,b){const A=new Set(tokens(a)),B=new Set(tokens(b));if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/(A.size+B.size-n)}

export function freshnessWeightV298(publishedAt,now=Date.now()){
 const t=Date.parse(String(publishedAt||''));if(!Number.isFinite(t))return .45;
 const age=Math.max(0,(now-t)/60000),f=GLOBAL_FREE_NEWS_V298.freshness;
 return age<=15?f.m15:age<=60?f.m60:age<=180?f.m180:age<=720?f.m720:f.older;
}
export function newsFingerprintV298(row={}){
 const impact=classifyNewsImpact(row?.headline||row?.title||'');
 const core=tokens(row?.headline||row?.title||'').slice(0,9).sort().join('|');
 const bucket=Math.floor((Date.parse(String(row?.publishedAt||''))||0)/(90*60000));
 return `${base(row?.symbol)}:${impact.type}:${bucket}:${hash(core)}`;
}
export function dedupeNewsV298(rows=[]){
 const sorted=arr(rows).filter(r=>r&&(r.headline||r.title)).sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)),out=[];
 for(const r of sorted){
  const h=clean(r.headline||r.title),impact=classifyNewsImpact(h),t=Date.parse(String(r.publishedAt||''))||0;
  const dup=out.find(x=>{
   const xi=classifyNewsImpact(x.headline||x.title),xt=Date.parse(String(x.publishedAt||''))||0;
   if(base(x.symbol)!==base(r.symbol))return false;
   if(similarity(x.headline||x.title,h)>=.62)return true;
   return impact.type!=='OTHER'&&impact.type===xi.type&&Math.abs(t-xt)<=90*60000;
  });
  if(dup){dup.duplicateSources=[...new Set([...(dup.duplicateSources||[dup.source]),r.source].filter(Boolean))];continue}
  out.push({...r,headline:h,fingerprint:newsFingerprintV298(r),duplicateSources:[r.source].filter(Boolean)});
 }
 return out;
}
function sourceWeight(r={}){if(r.primary||r.official)return GLOBAL_FREE_NEWS_V298.primarySourceBoost;if(String(r.source||'').startsWith('GDELT/'))return GLOBAL_FREE_NEWS_V298.aggregatorWeight;return .86}
export function scoreNewsRowsV298(rows=[],now=Date.now()){
 const unique=dedupeNewsV298(rows),ranked=unique.map(r=>{
  const impact=classifyNewsImpact(r.headline||r.title||''),fresh=freshnessWeightV298(r.publishedAt,now),sw=sourceWeight(r),strength=impact.direction*(impact.impact/5)*fresh*sw;
  return{...r,impact,freshnessWeight:+fresh.toFixed(3),sourceWeight:+sw.toFixed(3),strength:+strength.toFixed(4),language:r.language||detectNewsLanguageV298(r.headline||r.title||'')};
 }).sort((a,b)=>Math.abs(b.strength)-Math.abs(a.strength)||(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));
 let total=0,den=0;for(let i=0;i<Math.min(4,ranked.length);i++){const w=[1,.62,.38,.24][i];total+=ranked[i].strength*w;den+=w}
 const score=den?clamp(total/den,-GLOBAL_FREE_NEWS_V298.maxScoreAbs,GLOBAL_FREE_NEWS_V298.maxScoreAbs):0;
 const meaningful=ranked.filter(x=>x.impact.impact>=2),primary=meaningful.filter(x=>x.primary||x.official).length,confidence=clamp(.24+Math.min(.42,meaningful.length*.09)+Math.min(.22,primary*.11)+Math.min(.12,(ranked[0]?.duplicateSources?.length||1)*.03),0,1);
 return{newsScore:+score.toFixed(3),confidence:+confidence.toFixed(3),rows:ranked.slice(0,GLOBAL_FREE_NEWS_V298.maxRowsPerSymbol),headline:ranked[0]?.headline||'',sources:[...new Set(ranked.flatMap(x=>x.duplicateSources||[x.source]).filter(Boolean))].slice(0,8)};
}

function companyTokens(c={}){const n=tokens(c?.name||'').filter(x=>x.length>=4);return n.slice(0,4)}
function searchName(c={}){const words=companyTokens(c);return words.slice(0,3).join(' ')||base(c)}
function matchesCompany(c={},headline=''){
 const h=normal(headline),words=companyTokens(c),b=base(c).toLowerCase();if(!h)return false;
 if(words.length>=2&&h.includes(`${words[0]} ${words[1]}`))return true;
 if(words[0]?.length>=5&&h.split(' ').includes(words[0]))return true;
 return b.length>=4&&new RegExp(`(^|\\s)${b.replace(/[^a-z0-9]/g,'')}(\\s|$)`,'i').test(h);
}
function tracked(state={}){
 const seen=new Map(),add=(x,priority)=>{const s=key(x);if(!s||seen.has(s))return;seen.set(s,{symbol:s,name:String(x?.name||s).slice(0,120),score:num(x?.decisionScore,x?.score),priority})};
 for(const p of arr(state?.positions))add(p,2);
 for(const c of arr(state?.candidates).sort((a,b)=>num(b?.decisionScore,b?.score)-num(a?.decisionScore,a?.score)))add(c,1);
 return [...seen.values()].sort((a,b)=>b.priority-a.priority||b.score-a.score).slice(0,GLOBAL_FREE_NEWS_V298.maxTrackedSymbols);
}
function chunks(a,n){const out=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out}
function parseAtom(xml,source,type){const out=[];for(const m of String(xml||'').matchAll(/<entry>([\s\S]*?)<\/entry>/gi)){const b=m[1],title=clean(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),updated=clean(b.match(/<(?:updated|published)[^>]*>([\s\S]*?)<\/(?:updated|published)>/i)?.[1]);if(title)out.push({headline:title,source,primary:true,official:true,filingType:type,publishedAt:updated&&Number.isFinite(Date.parse(updated))?new Date(updated).toISOString():nowIso()})}return out}
async function fetchSec(type='8-K'){
 const started=Date.now();try{const u=new URL('https://www.sec.gov/cgi-bin/browse-edgar');u.searchParams.set('action','getcurrent');u.searchParams.set('type',type);u.searchParams.set('owner','include');u.searchParams.set('count','80');u.searchParams.set('output','atom');const r=await fetch(u,{headers:HEADERS,redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const rows=parseAtom(await r.text(),`SEC EDGAR ${type}`,type);return{source:`SEC EDGAR ${type}`,tier:'PRIMARY',ok:rows.length>0,latencyMs:Date.now()-started,rows,error:rows.length?'':'keine Meldungen'}}catch(e){return{source:`SEC EDGAR ${type}`,tier:'PRIMARY',ok:false,latencyMs:Date.now()-started,rows:[],error:String(e?.message||e).slice(0,140)}}
}
async function fetchGdeltBatch(batch=[]){
 const started=Date.now(),label=`GDELT ${batch.map(x=>base(x.symbol)).join(',')}`;try{const terms=batch.map(c=>`\"${searchName(c).replace(/\"/g,'')}\"`).filter(Boolean);if(!terms.length)return{source:label,tier:'GLOBAL_FREE',ok:false,latencyMs:0,rows:[],error:'keine Suchbegriffe'};const u=new URL('https://api.gdeltproject.org/api/v2/doc/doc');u.searchParams.set('query',`(${terms.join(' OR ')})`);u.searchParams.set('mode','artlist');u.searchParams.set('maxrecords','50');u.searchParams.set('format','json');u.searchParams.set('sort','datedesc');u.searchParams.set('timespan',`${GLOBAL_FREE_NEWS_V298.gdeltHours}h`);const r=await fetch(u,{headers:{...HEADERS,accept:'application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json(),rows=[];for(const x of arr(j?.articles)){const headline=clean(x?.title);if(!headline)continue;const c=batch.find(q=>matchesCompany(q,headline));if(!c)continue;rows.push({symbol:c.symbol,headline,source:`GDELT/${clean(x?.domain||'News')}`,primary:false,official:false,publishedAt:x?.seendate&&Number.isFinite(Date.parse(x.seendate))?new Date(x.seendate).toISOString():nowIso(),language:String(x?.language||'').toLowerCase()||detectNewsLanguageV298(headline),url:String(x?.url||'').slice(0,500)})}return{source:label,tier:'GLOBAL_FREE',ok:rows.length>0,latencyMs:Date.now()-started,rows,error:rows.length?'':'keine passenden Meldungen'}}catch(e){return{source:label,tier:'GLOBAL_FREE',ok:false,latencyMs:Date.now()-started,rows:[],error:String(e?.message||e).slice(0,140)}}
}
async function fetchAsx(c){
 const started=Date.now(),s=base(c),label=`ASX ${s}`;try{const u=`https://www.asx.com.au/asx/1/company/${encodeURIComponent(s)}/announcements?count=20&market_sensitive=true`;const r=await fetch(u,{headers:{...HEADERS,accept:'application/json'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json(),rows=arr(j?.data||j?.announcements).map(x=>({symbol:c.symbol,headline:clean(x?.header||x?.headline||x?.title),source:'ASX Market Announcements',primary:true,official:true,publishedAt:x?.document_release_date||x?.date||nowIso(),language:'en'})).filter(x=>x.headline);return{source:label,tier:'PRIMARY',ok:rows.length>0,latencyMs:Date.now()-started,rows,error:rows.length?'':'keine Meldungen'}}catch(e){return{source:label,tier:'PRIMARY',ok:false,latencyMs:Date.now()-started,rows:[],error:String(e?.message||e).slice(0,140)}}
}
async function collect(state={}){
 const targets=tracked(state),requests=[fetchSec('8-K'),fetchSec('6-K'),...chunks(targets,GLOBAL_FREE_NEWS_V298.gdeltBatchSize).map(fetchGdeltBatch),...targets.filter(x=>x.symbol.endsWith('.AX')).slice(0,2).map(fetchAsx)],results=await Promise.all(requests),by=new Map(targets.map(x=>[x.symbol,[]]));
 const secRows=results.filter(x=>x.source.startsWith('SEC EDGAR')).flatMap(x=>x.rows||[]);for(const c of targets)for(const r of secRows)if(matchesCompany(c,r.headline))by.get(c.symbol)?.push({...r,symbol:c.symbol});
 for(const r of results.flatMap(x=>x.rows||[])){if(r.symbol&&by.has(key(r.symbol)))by.get(key(r.symbol)).push(r)}
 const symbols=[];for(const c of targets){const scored=scoreNewsRowsV298(by.get(c.symbol)||[]);symbols.push({symbol:c.symbol,name:c.name,news_score:scored.newsScore,news_confidence:scored.confidence,headline:scored.headline,sources:scored.sources,rows:scored.rows})}
 return{updatedAt:nowIso(),targets,symbols,sourceHealth:results.map(x=>({source:x.source,tier:x.tier,status:x.ok?'OK':'DOWN',latencyMs:x.latencyMs,error:x.error||''})),freeOnly:true};
}
function cacheDefaults(){return{version:29.8,updatedAt:null,at:0,symbols:[],sourceHealth:[],targets:[],freeOnly:true}}
function applyToState(state={},snapshot={}){
 const by=new Map(arr(snapshot?.symbols).map(x=>[key(x),x]));
 for(const c of arr(state?.candidates)){const n=by.get(key(c));if(!n)continue;c.news_score=n.news_score;c.newsScore=n.news_score;c.news_confidence=n.news_confidence;c.newsConfidence=n.news_confidence;c.headlines=n.rows.map(x=>({headline:x.headline,title:x.headline,publishedAt:x.publishedAt,source:x.source,language:x.language,primary:x.primary,impactType:x.impact?.type,impact:x.impact?.impact,direction:x.impact?.direction}));}
 state.newsRadar=arr(snapshot?.symbols).filter(x=>x.headline).map(x=>({symbol:x.symbol,name:x.name,headline:x.headline,news_score:x.news_score,score:x.news_score,confidence:x.news_confidence,sources:x.sources,publishedAt:x.rows?.[0]?.publishedAt||snapshot.updatedAt,language:x.rows?.[0]?.language||'',primary:Boolean(x.rows?.[0]?.primary),freeNewsV298:true}));
}
function isTradingInput(input){return Boolean(arr(input?.messages).some(m=>String(m?.content||'').includes('Kandidaten=')&&String(m?.content||'').includes(' Gehalten=')))}

export class GlobalFreeNewsGuardV298{
 constructor(baseAi,{getState=null,storage=null}={}){this.base=baseAi;this.getState=getState;this.storage=storage;this.last={...cacheDefaults(),...read(storage,cacheDefaults())}}
 async refresh(force=false){const state=typeof this.getState==='function'?(this.getState()||{}):{},age=Date.now()-num(this.last?.at,0);if(!force&&age<GLOBAL_FREE_NEWS_V298.cacheSeconds*1000){applyToState(state,this.last);return this.last}const snap=await collect(state);this.last={...snap,version:29.8,at:Date.now()};write(this.storage,this.last);applyToState(state,this.last);return this.last}
 async run(model,input){if(isTradingInput(input))await this.refresh(false);return await this.base.run(model,input)}
 status(){return{enabled:true,version:29.8,freeOnly:true,rule:GLOBAL_FREE_NEWS_V298.rule,updatedAt:this.last?.updatedAt||null,trackedSymbols:arr(this.last?.targets).length,sourceHealth:arr(this.last?.sourceHealth),symbols:arr(this.last?.symbols).map(x=>({symbol:x.symbol,name:x.name,news_score:x.news_score,news_confidence:x.news_confidence,headline:x.headline,sources:x.sources,rows:x.rows?.slice(0,5)||[]}))}}
}
