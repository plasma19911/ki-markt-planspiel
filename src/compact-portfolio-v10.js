import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v9.js';

const AGENT_STATE_KEY='state/windows-pc-agent-v1';
const AGENT_PREFETCH_KEY='state/windows-pc-prefetch-v1';
const LEADER_CACHE_KV_KEY='cache/free-top25-leaders-v1';
const AGENT_ONLINE_MS=150*1000;
const AGENT_PREFETCH_TTL_MS=12*60*1000;
const LEADER_TARGET=25;
const MIN_EXTERNAL_LEADERS=10;

const key=v=>String(v||'').toUpperCase().trim();
const baseSymbol=v=>key(v).split('.')[0];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const cleanText=(v,max=180)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const arr=v=>Array.isArray(v)?v:[];

function fresh(ts,ttl=AGENT_PREFETCH_TTL_MS){const n=Date.parse(String(ts||''));return Number.isFinite(n)&&Date.now()-n>=0&&Date.now()-n<ttl}
function cpu(v){return Math.max(0,Math.min(100,num(v,0)))}
function bytes(v){return Math.max(0,Math.round(num(v,0)))}

function normalizeHeartbeat(payload={}){
  return{
    lastSeenAt:new Date().toISOString(),
    version:cleanText(payload.version||'1.0',30),
    hostName:cleanText(payload.hostName||'',80),
    storagePath:cleanText(payload.storagePath||'E:\\KI-Markt-Agent',180),
    storageBytes:bytes(payload.storageBytes),
    maxStorageBytes:bytes(payload.maxStorageBytes),
    cpuPct:+cpu(payload.cpuPct).toFixed(2),
    ramMb:+Math.max(0,num(payload.ramMb,0)).toFixed(1),
    downloadedBytes:bytes(payload.downloadedBytes),
    uploadedBytes:bytes(payload.uploadedBytes),
    localPhase:cleanText(payload.localPhase||'',30),
    agentMode:cleanText(payload.agentMode||'WINDOWS_HYBRID',40),
    lastLocalCleanupAt:payload.lastLocalCleanupAt?cleanText(payload.lastLocalCleanupAt,50):null,
    lastError:payload.lastError?cleanText(payload.lastError,240):null
  };
}

function normalizeLeaderEntries(payload={}){
  const out=[],seen=new Set();
  for(const x of arr(payload.leaderEntries).slice(0,160)){
    const symbol=key(typeof x==='string'?x:x?.symbol);if(!symbol||symbol.length>24)continue;
    const market=cleanText(typeof x==='string'?'GLOBAL':x?.market||'GLOBAL',16).toUpperCase(),source=cleanText(typeof x==='string'?'PC-Agent':x?.source||'PC-Agent',80),rank=Math.max(1,Math.round(num(typeof x==='string'?out.length+1:x?.rank,out.length+1)));
    const k=`${market}:${symbol}`;if(seen.has(k))continue;seen.add(k);out.push({symbol,market,source,rank});
  }
  return out;
}

function masterIndex(rows){
  const exact=new Map(),byBase=new Map();
  for(const row of rows){const s=key(row?.symbol);if(!s)continue;exact.set(s,row);const b=baseSymbol(s),a=byBase.get(b)||[];a.push(row);byBase.set(b,a)}
  const pref=row=>{const s=key(row?.symbol);if(s.endsWith('.DE'))return 0;if(s.endsWith('.F'))return 1;if(s.endsWith('.SG'))return 2;if(!s.includes('.'))return 3;return 4};
  for(const a of byBase.values())a.sort((x,y)=>pref(x)-pref(y)||num(y?.marketCapUSD||y?.marketCap)-num(x?.marketCapUSD||x?.marketCap));
  return{exact,byBase};
}

function resolveMaster(entry,index){
  const s=key(entry?.symbol);if(!s)return null;
  if(entry?.market==='DE')return(index.byBase.get(baseSymbol(s))||[]).find(x=>/\.(DE|F|SG|MU|HM)$/.test(key(x?.symbol)))||index.exact.get(s)||(index.byBase.get(baseSymbol(s))||[])[0]||null;
  return index.exact.get(s)||(index.byBase.get(baseSymbol(s))||[])[0]||null;
}

function buildLeaderCache(entries,rows){
  const index=masterIndex(rows),scores=new Map(),sourceStats=new Map();
  for(const e of entries){const row=resolveMaster(e,index);const stat=sourceStats.get(e.source)||{name:e.source,found:0,matched:0,error:null};stat.found++;if(row){stat.matched++;const s=key(row.symbol),old=scores.get(s)||{row,score:0,sources:new Set(),bestRank:999};old.score+=Math.max(.2,6-(Math.max(1,e.rank)-1)*.12);old.sources.add(e.source);old.bestRank=Math.min(old.bestRank,e.rank);scores.set(s,old)}sourceStats.set(e.source,stat)}
  let ranked=[...scores.values()].map(x=>({...x,sourceCount:x.sources.size,sources:[...x.sources]})).sort((a,b)=>b.sourceCount-a.sourceCount||b.score-a.score||a.bestRank-b.bestRank);
  const used=new Set(ranked.map(x=>key(x.row.symbol)));
  if(ranked.length<LEADER_TARGET){for(const row of rows){const s=key(row?.symbol);if(!s||used.has(s))continue;used.add(s);ranked.push({row,score:0,sourceCount:0,sources:['MASTER-FALLBACK'],bestRank:999});if(ranked.length>=LEADER_TARGET)break}}
  const leaders=ranked.slice(0,LEADER_TARGET).map((x,i)=>({...x.row,externalLeaderRank:i+1,externalLeaderScore:+x.score.toFixed(3),externalLeaderSources:x.sources}));
  const matched=[...scores.values()].length,updatedAt=new Date().toISOString();
  return{leaders,meta:{updatedAt,target:LEADER_TARGET,externalResolved:matched,externalHealthy:matched>=MIN_EXTERNAL_LEADERS,sourceStats:[...sourceStats.values()],selected:leaders.length,mode:'PC_AGENT_TOP_25'}};
}

function normalizeFutureWatch(input,index){
  if(!input||typeof input!=='object')return null;
  const candidates=[];
  for(const x of arr(input.candidates).slice(0,20)){
    const entry={symbol:key(x?.symbol),market:'GLOBAL'},row=resolveMaster(entry,index);if(!row)continue;
    candidates.push({
      symbol:key(row.symbol),name:cleanText(row.name||x?.name||row.symbol,120),theme:cleanText(x?.theme||'Strukturthema',100),themeId:cleanText(x?.themeId||'',50),
      watchScore:Math.max(0,Math.min(100,Math.round(num(x?.watchScore)))),issueStrength:Math.max(0,Math.min(100,Math.round(num(x?.issueStrength)))),quietScore:Math.max(0,Math.min(100,Math.round(num(x?.quietScore)))),
      dayPct:+num(x?.dayPct).toFixed(2),momentum20Pct:+num(x?.momentum20Pct).toFixed(2),price:+Math.max(0,num(x?.price)).toFixed(6),preNews:Boolean(x?.preNews),alreadyMoving:Boolean(x?.alreadyMoving),
      reason:cleanText(x?.reason||'',260),headlines:arr(x?.headlines).slice(0,3).map(h=>({title:cleanText(h?.title||'',220),source:cleanText(h?.source||'PC-Agent',100),seenAt:h?.seenAt?cleanText(h.seenAt,50):null})),updatedAt:new Date().toISOString()
    });
  }
  candidates.sort((a,b)=>Number(a.alreadyMoving)-Number(b.alreadyMoving)||b.watchScore-a.watchScore||b.issueStrength-a.issueStrength);
  return{version:2,updatedAt:new Date().toISOString(),candidateCount:candidates.slice(0,10).length,activeThemes:arr(input.activeThemes).slice(0,10).map(t=>({id:cleanText(t?.id||'',50),label:cleanText(t?.label||'',100),issueStrength:Math.max(0,Math.min(100,Math.round(num(t?.issueStrength)))),headlineCount:Math.max(0,Math.round(num(t?.headlineCount)))})),candidates:candidates.slice(0,10),source:'Windows-PC-Agent · Weltmeldungen + gebündelte Kurse',notice:'Frühindikator/Wachliste, keine Kaufempfehlung. Der PC sammelt die Voranalyse; automatische BUYs bleiben an die normalen Cloudflare-Live-, Risiko-, Liquiditäts- und Kostenprüfungen gebunden.'};
}

export class MarketPortfolio extends BasePortfolio{
  async agentHeartbeat(payload={}){
    const heartbeat=normalizeHeartbeat(payload);try{this.ctx?.storage?.kv?.put(AGENT_STATE_KEY,heartbeat)}catch{}
    return{ok:true,agent:'WINDOWS_PC_AGENT',heartbeat};
  }

  _agentPrefetch(){try{return this.ctx?.storage?.kv?.get(AGENT_PREFETCH_KEY)||null}catch{return null}}

  async agentPrefetch(payload={}){
    const heartbeat=normalizeHeartbeat(payload?.metrics||payload);try{this.ctx?.storage?.kv?.put(AGENT_STATE_KEY,heartbeat)}catch{}
    const entries=normalizeLeaderEntries(payload),data=await this.zeroAssets?._load?.().catch(()=>null),rows=arr(data?.equities).filter(x=>x?.symbol),index=masterIndex(rows),leader=buildLeaderCache(entries,rows),futureWatch=normalizeFutureWatch(payload?.futureWatch,index);
    const prefetch={receivedAt:new Date().toISOString(),leaderUpdatedAt:payload?.leaderUpdatedAt?cleanText(payload.leaderUpdatedAt,50):new Date().toISOString(),futureUpdatedAt:futureWatch?.updatedAt||null,leaderEntryCount:entries.length,resolvedLeaderCount:leader.meta.externalResolved,futureWatch,metrics:heartbeat};
    try{this.ctx?.storage?.kv?.put(AGENT_PREFETCH_KEY,prefetch);this.ctx?.storage?.kv?.put(LEADER_CACHE_KV_KEY,{at:Date.now(),leaders:leader.leaders,meta:leader.meta})}catch{}
    if(this.zeroAssets){this.zeroAssets.leaderCache=null;this.zeroAssets.leaderCacheAt=0;this.zeroAssets.lastLeaderMeta=leader.meta}
    if(futureWatch&&this.engine?.store?.update){await this.engine.store.update(s=>{s.futureWatch=futureWatch;return true})}
    return{ok:true,agent:'WINDOWS_PC_AGENT',prefetch:{receivedAt:prefetch.receivedAt,leaderEntryCount:entries.length,resolvedLeaderCount:leader.meta.externalResolved,futureCandidates:futureWatch?.candidateCount||0},heartbeat};
  }

  agentStatus(){
    let h=null,p=null;try{h=this.ctx?.storage?.kv?.get(AGENT_STATE_KEY)||null;p=this.ctx?.storage?.kv?.get(AGENT_PREFETCH_KEY)||null}catch{}
    const online=fresh(h?.lastSeenAt,AGENT_ONLINE_MS),ageMs=h?.lastSeenAt?Math.max(0,Date.now()-Date.parse(h.lastSeenAt)):null;
    return{configured:Boolean(this.env?.PC_AGENT_TOKEN),online,lastSeenAt:h?.lastSeenAt||null,ageSeconds:Number.isFinite(ageMs)?Math.round(ageMs/1000):null,fallbackAfterSeconds:Math.round(AGENT_ONLINE_MS/1000),prefetchFresh:fresh(p?.receivedAt),prefetchAt:p?.receivedAt||null,resolvedLeaderCount:num(p?.resolvedLeaderCount),futureCandidates:num(p?.futureWatch?.candidateCount),metrics:h||null};
  }

  async _refreshFutureWatch(force=false){
    const p=this._agentPrefetch(),fw=p?.futureWatch;
    if(fw&&fresh(p?.receivedAt)&&fresh(fw?.updatedAt,12*60*1000)){
      const raw=this.bucketAdapter?.peekState?.();if(raw?.futureWatch?.updatedAt===fw.updatedAt)return raw.futureWatch;
      if(this.engine?.store?.update){const r=await this.engine.store.update(s=>{s.futureWatch=fw;return true});return r?.state?.futureWatch||fw}
      return fw;
    }
    return super._refreshFutureWatch(force);
  }

  async scanFromAgent(payload={}){await this.agentHeartbeat(payload);const r=await this.scan();return{...r,scanSource:'WINDOWS_PC_AGENT'}}

  async status(){
    const s=await super.status(),agent=this.agentStatus();s.pcAgent=agent;
    if(s.freeTierBudget)s.freeTierBudget={...s.freeTierBudget,pcAgentPreferred:true,cloudflareFallbackIntervalMinutes:5,cloudflareFallbackOnlyWhenPcOffline:true,pcAgentOnline:agent.online,pcAgentPrefetchFresh:agent.prefetchFresh,note:`Hybrid-Free-Profil: Windows-PC-Agent bevorzugt; Cloudflare-Cron nur alle 5 Minuten als Fallback. ${s.freeTierBudget.note||''}`};
    return s;
  }
}
