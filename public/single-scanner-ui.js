const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const fmt=n=>new Intl.NumberFormat('de-DE').format(Math.max(0,Math.round(num(n))));
const sec=v=>{const n=num(v,NaN);return Number.isFinite(n)&&n>0?`${n.toFixed(n<10?1:0)} s`:'–'};

function ensureBar(){
 let el=document.getElementById('scannerLiveBar');if(el)return el;
 el=document.createElement('section');
 el.id='scannerLiveBar';el.className='scannerLiveBar';el.setAttribute('aria-live','polite');
 el.innerHTML='<div class="scannerLiveBadge">EIN-SCANNER</div><div class="scannerLiveMain"><b id="scannerLiveTitle">Scannerstatus wird geladen …</b><small id="scannerLiveMeta">Warte auf PC-Agent.</small></div><div class="scannerLiveSpeed"><b id="scannerLiveSpeed">–</b><small>letzter Vollscan</small></div>';
 const panel=document.getElementById('livePanel');
 if(panel&&panel.parentNode)panel.parentNode.insertBefore(el,panel);else document.querySelector('.mainArea')?.appendChild(el);
 return el;
}
function pick(root){
 const wide=root?.pcWideSweep||{};
 const agent=root?.pcAgent||root?.agent||{};
 const metrics=agent?.metrics||root?.agentMetrics||{};
 return {
  master:num(wide.masterCount,metrics.wideSweepMasterCount),
  scanned:num(wide.scannedCount,metrics.wideSweepScannedLastCycle),
  fresh:num(wide.freshQuoteCount,metrics.wideSweepFreshQuotesLastCycle),
  batches:num(wide.batchCount,metrics.wideSweepBatchesLastCycle),
  parallel:num(wide.parallelRequests,metrics.wideSweepParallelRequests),
  elapsed:num(wide.elapsedSeconds,metrics.wideSweepLastElapsedSeconds),
  failures:num(wide.failures,metrics.wideSweepFailuresLastCycle),
  throttles:num(wide.throttles,metrics.wideSweepThrottlesLastCycle),
  profile:String(wide.profile||metrics.agentMode||metrics.version||''),
  backoff:Boolean(wide.sourceBackoff)||Boolean(metrics.wideSweepSparkBackoffUntil),
  online:agent.online!==false,
  updatedAt:wide.updatedAt||agent.lastSeenAt||root?.config?.last_scan||null
 };
}
function render(s){
 const bar=ensureBar(),title=bar.querySelector('#scannerLiveTitle'),meta=bar.querySelector('#scannerLiveMeta'),speed=bar.querySelector('#scannerLiveSpeed');
 bar.classList.remove('ok','warn','bad');
 const single=/SINGLE_SUPER_SCANNER|single-super-scanner/i.test(s.profile);
 const total=s.master>0?s.master:8530;
 const coverage=s.scanned>0?Math.min(100,Math.round(s.scanned/Math.max(1,total)*100)):0;
 if(!s.online){bar.classList.add('bad');title.textContent='PC-Agent offline';meta.textContent='Der Ein-Scanner sendet aktuell keine frischen Daten.';speed.textContent='–';return}
 if(s.backoff||s.throttles>0){bar.classList.add('warn')}else if(single&&s.scanned>0){bar.classList.add('ok')}
 else{bar.classList.add('warn')}
 title.textContent=single?'Ein einziger Superscanner aktiv':(s.scanned>0?'Scanner aktiv · Umstellung auf Ein-Scanner wird erkannt':'Scanner wartet auf ersten Vollscan');
 const bits=[];
 if(s.scanned>0)bits.push(`${fmt(s.scanned)}/${fmt(total)} Aktien (${coverage} %) angefragt`);
 if(s.fresh>0)bits.push(`${fmt(s.fresh)} frische Kurse`);
 if(s.batches>0)bits.push(`${fmt(s.batches)} Batches`);
 if(s.parallel>0)bits.push(`${fmt(s.parallel)} parallel`);
 if(s.failures>0)bits.push(`${fmt(s.failures)} Fehler`);
 if(s.throttles>0)bits.push(`${fmt(s.throttles)} Drosselungen`);
 meta.textContent=bits.length?bits.join(' · '):'Warte auf den nächsten Scanlauf des PC-Agenten.';
 speed.textContent=sec(s.elapsed);
}
async function loadScanner(){
 ensureBar();
 try{
  const r=await fetch('/api/status?view=dashboard&_scanner='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw new Error('HTTP '+r.status);
  render(pick(await r.json()));
 }catch(e){const b=ensureBar();b.classList.add('warn');b.querySelector('#scannerLiveTitle').textContent='Scannerstatus vorübergehend nicht lesbar';b.querySelector('#scannerLiveMeta').textContent='Die restliche App läuft weiter; Status wird automatisch erneut geladen.'}
}
loadScanner();
setInterval(loadScanner,15000);
