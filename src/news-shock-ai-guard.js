import {strongestNewsImpact} from './news-impact-intelligence.js';
import {getTradeDecisionLearning} from './trade-decision-learning.js';

const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,num(v)));
const key=x=>String(x?.symbol||x||'').toUpperCase().trim();
const responseText=r=>String(r?.response||r?.result?.response||'');
const NEWS_HEADERS={'accept':'application/rss+xml,application/xml,text/xml,*/*;q=0.7','user-agent':'Mozilla/5.0 (compatible; KI-Markt-Planspiel/CatalystGapV2)'};
const BROAD_TTL_MS=90*1000;
const TARGET_TTL_MS=120*1000;
let broadCache={at:0,items:[]};
const targetCache=new Map();

function parsePlan(r){const raw=responseText(r),a=raw.indexOf('{'),b=raw.lastIndexOf('}');if(a<0||b<=a)return null;try{const j=JSON.parse(raw.slice(a,b+1));return Array.isArray(j.actions)?j:null}catch{return null}}
function findPrompt(input){for(const m of arr(input?.messages)){const t=String(m?.content||'');if(t.includes('Kandidaten=')&&t.includes(' Gehalten='))return t}return''}
function parseBlock(text,start,end=null){const a=text.indexOf(start);if(a<0)return null;const from=a+start.length,b=end?text.indexOf(end,from):-1;try{return JSON.parse(text.slice(from,b>=0?b:text.length).trim())}catch{return null}}
function candidateMetrics(c={}){return{score:num(c?.liveScore,c?.score),confidence:num(c?.liveConfidence,c?.confidence),day:num(c?.day,c?.day_change??c?.dayChange),m5:num(c?.intraday5m,c?.momentum5),m20:num(c?.intraday20m,c?.momentum20),accel:num(c?.momentumAcceleration5,c?.momentum_acceleration5),draw:Number.isFinite(Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct))?Number(c?.drawdownFrom20mHighPct??c?.drawdown_from_20m_high_pct):null,rsi:num(c?.intradayRsi,c?.rsi||50),event:String(c?.eventRisk||c?.event_risk||'NONE').toUpperCase(),newsConfidence:num(c?.newsConfidence,c?.news_confidence)}}
function decode(x){return String(x||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function rssItems(text,source='Google Catalyst',limit=18){const out=[];for(const m of String(text||'').matchAll(/<item>([\s\S]*?)<\/item>/gi)){const b=m[1],title=decode(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),pub=decode(b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]);if(title)out.push({headline:title,title,publishedAt:pub&&Number.isFinite(Date.parse(pub))?new Date(pub).toISOString():null,source})}return out.slice(0,limit)}
function normal(x){return decode(x).toLowerCase().replace(/[^a-z0-9äöüß ]+/gi,' ').replace(/\s+/g,' ').trim()}
function companyWords(c={}){const stop=new Set(['inc','incorporated','corp','corporation','company','co','plc','ag','se','sa','nv','ltd','limited','holdings','holding','group','ordinary','shares','registered']);return normal(c?.name||c?.symbol).split(' ').filter(w=>w.length>=4&&!stop.has(w))}
function matchesCompany(c,title){const t=normal(title),w=companyWords(c);if(!t)return false;if(w.length>=2&&t.includes(`${w[0]} ${w[1]}`))return true;if(w[0]?.length>=5&&t.split(' ').includes(w[0]))return true;const s=key(c).split('.')[0].replace(/[^A-Z0-9]/g,'').toLowerCase();return s.length>=4&&new RegExp(`(^|\\s)${s}(\\s|$)`,'i').test(t)}
async function googleQuery(q,source){try{const u=new URL('https://news.google.com/rss/search');u.searchParams.set('q',q);u.searchParams.set('hl','en-US');u.searchParams.set('gl','US');u.searchParams.set('ceid','US:en');const r=await fetch(u,{headers:NEWS_HEADERS});if(!r.ok)return[];return rssItems(await r.text(),source)}catch{return[]}}
async function broadCatalysts(){const now=Date.now();if(now-broadCache.at<BROAD_TTL_MS)return broadCache.items;const q='("phase 3" OR "primary endpoint" OR "FDA approval" OR "raises guidance" OR "profit warning" OR "strategic investment" OR warrant OR "major contract" OR acquisition OR merger) stocks when:1d',items=await googleQuery(q,'Google Catalyst Radar');broadCache={at:now,items};return items}
async function targetedCatalysts(c){const s=key(c),cached=targetCache.get(s),now=Date.now();if(cached&&now-cached.at<TARGET_TTL_MS)return cached.items;const name=String(c?.name||s).replace(/"/g,'').trim(),items=await googleQuery(`"${name}" stock when:1d`,'Google Catalyst Gap');targetCache.set(s,{at:now,items});if(targetCache.size>20){const oldest=[...targetCache.entries()].sort((a,b)=>a[1].at-b[1].at).slice(0,targetCache.size-16);for(const [k] of oldest)targetCache.delete(k)}return items}
function existingRowsFor(symbol,state,c={}){const b=key(symbol).split('.')[0],rows=[];for(const n of arr(state?.newsRadar)){if(key(n).split('.')[0]===b)rows.push(n)}for(const h of arr(c?.headlines))rows.push(typeof h==='string'?{headline:h}:h);return rows}
async function discoverMissingCatalysts(candidates,state){
 const broad=await broadCatalysts(),ranked=arr(candidates).map(c=>{const m=candidateMetrics(c),existing=strongestNewsImpact(existingRowsFor(key(c),state,c)),gap=Math.abs(m.day)*(1.15-clamp(m.newsConfidence,0,1))*(1+Math.max(0,4-existing.impact)*.22);return{c,m,existing,gap}}).sort((a,b)=>b.gap-a.gap),target=ranked.find(x=>x.existing.impact<4)?.c||ranked[0]?.c||null,targeted=target?await targetedCatalysts(target):[],out=new Map();
 for(const c of candidates){const rows=[];for(const x of broad)if(matchesCompany(c,x.headline))rows.push(x);if(target&&key(c)===key(target))rows.push(...targeted.filter(x=>matchesCompany(c,x.headline)||targeted.indexOf(x)<5));if(rows.length)out.set(key(c),rows)}
 return out;
}
function newsRowsFor(symbol,state,c={},extraBySymbol=null){return[...existingRowsFor(symbol,state,c),...arr(extraBySymbol?.get?.(key(symbol)))]}
function shockProfile(c,state,learn={},extraBySymbol=null){const rows=newsRowsFor(c?.symbol,state,c,extraBySymbol),impact=strongestNewsImpact(rows),m=candidateMetrics(c),positive=impact.direction>0&&impact.impact>=4,negative=impact.direction<0&&impact.impact>=4;
 const shockMove=Math.abs(m.day)>=8||Math.abs(m.m20)>=3;
 const learnedRetest=clamp(num(learn?.summary?.newsShockRetestMultiplier,1),.78,1.22);
 const expectedRetest=clamp(Math.sqrt(Math.max(0,Math.abs(m.day)))*.24*learnedRetest,.45,4.75);
 const pulledBack=Number.isFinite(m.draw)&&m.draw<=-expectedRetest;
 const reclaim=m.m5>=0&&m.accel>0&&m.event!=='HIGH';
 const continuationReady=positive&&shockMove&&pulledBack&&reclaim;
 const tooExtended=positive&&shockMove&&!pulledBack;
 return{impact,m,positive,negative,shockMove,expectedRetest,pulledBack,reclaim,continuationReady,tooExtended,rows,learnedRetest};}
function reasonImpact(p){const h=String(p.impact.headline||'').slice(0,170);return`${p.impact.type} Impact ${p.impact.impact}/5${h?` · ${h}`:''}`}

async function postProcess(r,input,getState,storage){
 const plan=parsePlan(r),prompt=findPrompt(input);if(!plan||!prompt)return r;
 const state=typeof getState==='function'?(getState()||{}):{},learn=getTradeDecisionLearning(storage),candidates=arr(parseBlock(prompt,'Kandidaten=',' Gehalten=')||[]),held=arr(parseBlock(prompt,' Gehalten=')||[]),heldSet=new Set(held.map(key)),map=new Map(candidates.map(c=>[key(c),c]));
 const extraBySymbol=await discoverMissingCatalysts(candidates,state);
 const profiles=candidates.filter(c=>!heldSet.has(key(c))).map(c=>({c,p:shockProfile(c,state,learn,extraBySymbol)}));
 const positiveShocks=profiles.filter(x=>x.p.positive&&x.p.shockMove).sort((a,b)=>b.p.impact.impact-a.p.impact.impact||Math.abs(b.p.m.day)-Math.abs(a.p.m.day)||b.p.m.score-a.p.m.score);
 const leader=positiveShocks[0]||null;
 const negative=new Map(profiles.filter(x=>x.p.negative).map(x=>[key(x.c),x.p]));
 const out=[],notes=[];
 for(const a of arr(plan.actions)){
  const act=String(a?.action||'').toUpperCase(),s=key(a),c=map.get(s),p=c?shockProfile(c,state,learn,extraBySymbol):null;
  if(act==='BUY'&&negative.has(s)){const q=negative.get(s);out.push({symbol:s,action:'HOLD',confidence:.78,allocation_pct:0,reason:`NEWS-IMPACT BLOCK: fundamentaler negativer Katalysator (${reasonImpact(q)}). Kein optischer Dip-Kauf gegen strukturelle News.`});notes.push(`${s} negativer News-Schock blockiert`);continue}
  // Ein wartender News-Leader hat kein Total-Veto über andere gute Setups. Er sorgt nur
  // dafür, dass der Ersatztrade kleiner bleibt und Cash für seinen Retest verfügbar ist.
  if(act==='BUY'&&leader&&key(leader.c)!==s&&leader.p.tooExtended&&leader.p.m.score>=num(c?.score)-.5){
   const old=Math.max(1,num(a?.allocation_pct)),next=Math.max(2,old*.78);out.push({...a,allocation_pct:+next.toFixed(2),reason:`${String(a?.reason||'').slice(0,225)} · CATALYST-GAP V2: ${key(leader.c)} ist ein frischer starker News-Leader und wartet auf Retest. Dieser Trade bleibt aktiv, wird aber kleiner gestartet (${next.toFixed(1)}%).`});notes.push(`${s} kleiner wegen wartendem Catalyst-Leader`);continue
  }
  if(act==='BUY'&&p?.positive&&p.shockMove&&!p.continuationReady){out.push({symbol:s,action:'HOLD',confidence:.74,allocation_pct:0,reason:`NEWS-SHOCK WAIT V2: ${reasonImpact(p)}. Der Katalysator ist jetzt erkannt, aber der bereits gelaufene Kurs wird nicht gejagt. Dynamischer Retest ca. ${p.expectedRetest.toFixed(2)}% (Lernfaktor ${p.learnedRetest.toFixed(2)}); danach Käufer-Reclaim abwarten.`});notes.push(`${s} Catalyst erkannt – Peak-Kauf gestoppt`);continue}
  if(act==='BUY'&&p?.continuationReady){out.push({...a,allocation_pct:+Math.min(14,Math.max(3,num(a?.allocation_pct))).toFixed(2),confidence:clamp(Math.max(num(a?.confidence,.65),.74),.62,.88),reason:`${String(a?.reason||'').slice(0,195)} · NEWS-SHOCK CONTINUATION V2: ${reasonImpact(p)} · geordneter Retest ${p.m.draw.toFixed(2)}% und Käufer-Reclaim bestätigt; Starter, finale Candle-/Tagesreview-Prüfung folgt.`});continue}
  out.push(a);
 }
 const actioned=new Set(out.map(key)),hasBuy=out.some(a=>String(a?.action||'').toUpperCase()==='BUY');
 if(!hasBuy&&leader?.p.continuationReady&&!actioned.has(key(leader.c))){out.push({symbol:key(leader.c),action:'BUY',confidence:clamp(Math.max(leader.p.m.confidence,.74),.62,.86),allocation_pct:9,reason:`NEWS-SHOCK AUTO V2: ${reasonImpact(leader.p)} · nach grossem News-Sprung jetzt geordneter Retest ${leader.p.m.draw.toFixed(2)}% + positiver Reclaim. Kein Peak-Chase; Starter, finale Schutzstufen entscheiden.`});notes.push(`${key(leader.c)} News-Retest aktiviert`)}
 else if(leader?.p.tooExtended&&!actioned.has(key(leader.c))){out.push({symbol:key(leader.c),action:'HOLD',confidence:.76,allocation_pct:0,reason:`CATALYST WATCH V2: ${reasonImpact(leader.p)}. Der starke Katalysator wurde trotz vorheriger News-Lücke gefunden. Kurs bereits stark gelaufen – nicht hinterherkaufen; Retest + Käufer-Reclaim beobachten.`});notes.push(`${key(leader.c)} als verpassten Catalyst-Leader auf Watch`)}
 plan.actions=out;if(notes.length)plan.summary=`${String(plan.summary||'').slice(0,125)} · CATALYST-GAP V2: ${notes.slice(0,4).join(' · ')}.`;return{...r,response:JSON.stringify(plan)};
}

export class NewsShockAiGuard{
 constructor(base,{getState=null,storage=null}={}){this.base=base;this.getState=getState;this.storage=storage}
 async run(model,input){const r=await this.base.run(model,input);return await postProcess(r,input,this.getState,this.storage)}
}
