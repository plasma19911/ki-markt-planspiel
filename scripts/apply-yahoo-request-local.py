from pathlib import Path
import re

# Guarded one-shot: Yahoo source is published only after all runtime regressions pass.
# Replacement callbacks preserve backslashes inside embedded JavaScript regex literals.
root=Path(__file__).resolve().parents[1]
p=root/'src/yahoo-spark-repair.js'
s=p.read_text(encoding='utf-8')

if "./request-fetch-budget.js" not in s:
    s="import {withRequestLocalTask} from './request-fetch-budget.js';\n"+s

s=s.replace('// - Chart: shared short cache + inflight dedupe + bounded concurrency to avoid 429 storms.','// - Chart: shared completed-byte cache + request-local inflight dedupe/concurrency to avoid 429 storms.')
s=s.replace("let yahooSession=null,sessionPromise=null;\n  const chartCache=new Map(),chartInflight=new Map(),chartQueue=[];let chartActive=0,lastChartStart=0;","let yahooSession=null;\n  const chartCache=new Map();")
s=s.replace("chartInflightHits:0,chartQueued:0,chartQuery2Recovered:0", "chartInflightHits:0,chartQueued:0,chartQuery2Recovered:0,crossRequestPromiseSharing:false,requestLocalChartTasks:true")

session_re=re.compile(r"  async function ensureYahooSession\(\)\{.*?\n  \}\n\n  async function fetchPart",re.S)
session_new="""  async function ensureYahooSession(){
    if(yahooSession&&Date.now()<yahooSession.expiresAt)return yahooSession;
    return withRequestLocalTask('session',async()=>{
      if(yahooSession&&Date.now()<yahooSession.expiresAt)return yahooSession;
      stats.quoteSessionAttempts++;
      try{
        const landing=await nativeFetch('https://fc.yahoo.com/',{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)','accept':'text/html,*/*'}});
        const rawCookie=landing.headers.get('set-cookie')||'';
        const cm=rawCookie.match(/(?:^|,\\s*)((?:A3S?|GUC)=[^;,\\s]+)/i)||rawCookie.match(/([^=;,\\s]+=[^;,\\s]+)/);
        const cookie=cm?.[1]||'';
        const h={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)','accept':'text/plain,*/*'};if(cookie)h.cookie=cookie;
        const cr=await nativeFetch('https://query1.finance.yahoo.com/v1/test/getcrumb',{headers:h});
        const crumb=cr.ok?(await cr.text()).trim():'';
        if(!crumb||crumb.length>200||crumb.includes('<'))throw new Error(`Crumb HTTP ${cr.status}`);
        yahooSession={cookie,crumb,expiresAt:Date.now()+YAHOO_SESSION_MS};stats.lastError=null;return yahooSession;
      }catch(e){stats.lastError=`Yahoo Session: ${String(e?.message||e).slice(0,140)}`;return null}
    },{group:'yahoo-session',maxParallel:1,dedupe:true});
  }

  async function fetchPart"""
s,n=session_re.subn(lambda _m: session_new,s,count=1)
if n!=1 and "withRequestLocalTask('session'" not in s: raise RuntimeError('ensureYahooSession block not found')

queue_re=re.compile(r"  function pumpChartQueue\(\)\{.*?\n  async function chartResilient",re.S)
s,n=queue_re.subn(lambda _m:"  async function chartResilient",s,count=1)
if n!=1 and 'function pumpChartQueue' in s: raise RuntimeError('chart queue block not found')

chart_re=re.compile(r"  async function chartResilient\(input,init,u\)\{.*?\n  \}\n\n  globalThis\.fetch=async function yahooMarketRepairFetch",re.S)
chart_new="""  async function chartResilient(input,init,u){
    const key=canonicalChartKey(u),cached=chartCache.get(key),now=Date.now();
    if(cached&&now-cached.at<(cached.ok?CHART_CACHE_MS:CHART_ERROR_CACHE_MS)){stats.chartCacheHits++;return responseFromSnapshot(cached.snap)}
    const snap=await withRequestLocalTask(key,async()=>{
      const again=chartCache.get(key),t=Date.now();
      if(again&&t-again.at<(again.ok?CHART_CACHE_MS:CHART_ERROR_CACHE_MS)){stats.chartCacheHits++;return again.snap}
      let r=await nativeFetch(input,init);
      if(!r.ok&&[429,500,502,503,504].includes(r.status)&&u.hostname==='query1.finance.yahoo.com'&&reserve()){
        await sleep(100);const q2=new URL(u);q2.hostname='query2.finance.yahoo.com';const rr=await nativeFetch(q2,init);if(rr.ok){stats.chartQuery2Recovered++;stats.lastRepairAt=new Date().toISOString();r=rr}
      }
      const clean=await sanitizedResponse(r,{'x-ki-yahoo-chart-sanity':'1'}),n=Number(clean.headers?.get('x-ki-yahoo-price-sanitized')||0);if(n)stats.sanitizedPriceFields+=n;
      const out=await responseSnapshot(clean);chartCache.set(key,{at:Date.now(),ok:clean.ok,snap:out});
      if(chartCache.size>180)for(const [k,v] of chartCache)if(Date.now()-v.at>CHART_CACHE_MS*2)chartCache.delete(k);
      return out;
    },{group:'yahoo-chart',maxParallel:CHART_MAX_PARALLEL,minStartGapMs:55,dedupe:true});
    return responseFromSnapshot(snap)
  }

  globalThis.fetch=async function yahooMarketRepairFetch"""
s,n=chart_re.subn(lambda _m: chart_new,s,count=1)
if n!=1 and 'withRequestLocalTask(key' not in s: raise RuntimeError('chartResilient block not found')

for forbidden in ['sessionPromise','chartInflight','chartQueue','chartActive','lastChartStart','chartGate','pumpChartQueue']:
    if forbidden in s: raise RuntimeError(f'forbidden cross-request token remains: {forbidden}')

p.write_text(s,encoding='utf-8')
print('src/yahoo-spark-repair.js patched')
