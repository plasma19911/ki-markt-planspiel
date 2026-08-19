const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const fmt=n=>new Intl.NumberFormat('de-DE').format(Math.max(0,Math.round(num(n))));
const sec=v=>{const n=num(v,NaN);return Number.isFinite(n)&&n>0?`${n.toFixed(n<10?1:0)} s`:'–'};
const money2=(v,c='EUR')=>`${num(v).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})} ${String(c).toUpperCase()==='USD'?'$':'€'}`;

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

function positionValue(p){
 const invested=num(p?.invested),ep=num(p?.entry_price),lp=num(p?.last_price,ep),ef=num(p?.entry_fx,1),lf=num(p?.last_fx,ef);
 return ep>0&&ef>0?invested*(lp/ep)*(lf/ef):invested;
}
function relabelAccounting(s){
 const c=s?.config||{},currency=String(c.currency||'EUR'),cash=num(c.cash),equity=num(s?.equity),marketValue=(Array.isArray(s?.positions)?s.positions:[]).reduce((a,p)=>a+positionValue(p),0),delta=equity-(cash+marketValue);
 const heroLabel=document.querySelector('#overview .kpiCard.primary span');if(heroLabel)heroLabel.textContent='Gesamtwert';
 const sideLabels=[...document.querySelectorAll('.sideAccount small')];for(const x of sideLabels)if(x.textContent.trim()==='Depotwert')x.textContent='Gesamtwert';
 const cashShare=document.getElementById('cashShare');if(cashShare)cashShare.textContent=`davon Cash · ${equity>0?(cash/equity*100).toLocaleString('de-DE',{maximumFractionDigits:1}):'0'} %`;
 const investedShare=document.getElementById('investedShare');if(investedShare)investedShare.textContent=`Aktienwert ${money2(marketValue,currency)} · ${equity>0?(marketValue/equity*100).toLocaleString('de-DE',{maximumFractionDigits:1}):'0'} %`;
 const historyHead=[...document.querySelectorAll('.dashboardHistory thead th')].find(x=>x.textContent.trim()==='Depot');if(historyHead)historyHead.textContent='Gesamtwert';
 const chartEyebrow=document.querySelector('.dashboardChart .sectionEyebrow');if(chartEyebrow)chartEyebrow.textContent='KONTO';
 let alert=document.getElementById('accountingMismatchAlert');
 if(Math.abs(delta)>.05){
  if(!alert){alert=document.createElement('div');alert.id='accountingMismatchAlert';alert.className='error';document.querySelector('#overview')?.after(alert)}
  alert.textContent=`Buchhaltungswarnung: Gesamtwert weicht um ${money2(delta,currency)} von Cash + Aktienwert ab.`;alert.style.display='block';
 }else if(alert)alert.style.display='none';
}
function cleanKnownFxChartGlitch(s){
 if(!Array.isArray(s?.snapshots)||s.snapshots.length<3)return;
 const repairedPositions=(Array.isArray(s.positions)?s.positions:[]).filter(p=>p?.fx_basis_repaired_at),repairedSells=(Array.isArray(s.history)?s.history:[]).filter(h=>h?.fx_phantom_sell_repaired);
 if(!repairedPositions.length&&!repairedSells.length)return;
 const starts=[];
 for(const p of repairedPositions){const t=Date.parse(String(p.opened_at||p.openedAt||p.fx_basis_repaired_at||''));if(Number.isFinite(t))starts.push(t)}
 for(const h of repairedSells){const t=Date.parse(String(h.ts||''));if(Number.isFinite(t))starts.push(t-15*60*1000)}
 if(!starts.length)return;
 const start=Math.min(...starts),end=start+50*60*1000,eq=num(s.equity);
 if(!(eq>0))return;
 const before=s.snapshots.length;
 s.snapshots=s.snapshots.filter(x=>{const t=Date.parse(String(x?.ts||x?.at||x?.created_at||'')),e=num(x?.equity,eq);if(!Number.isFinite(t)||t<start||t>end)return true;return Math.abs(e/eq-1)<=.08});
 if(s.snapshots.length<before)setTimeout(()=>window.dispatchEvent(new Event('resize')),20);
}

document.addEventListener('planspiel:status',e=>{const s=e.detail||{};relabelAccounting(s);cleanKnownFxChartGlitch(s)});

async function loadScanner(){
 ensureBar();
 try{
  const r=await fetch('/api/status?view=dashboard&_scanner='+Date.now(),{cache:'no-store'});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const data=await r.json();render(pick(data));relabelAccounting(data);cleanKnownFxChartGlitch(data);
 }catch(e){const b=ensureBar();b.classList.add('warn');b.querySelector('#scannerLiveTitle').textContent='Scannerstatus vorübergehend nicht lesbar';b.querySelector('#scannerLiveMeta').textContent='Die restliche App läuft weiter; Status wird automatisch erneut geladen.'}
}
loadScanner();
setInterval(loadScanner,15000);
import('/changelog-latest.js?v=20260819-1455').catch(()=>{});
import('/changelog-optimization.js?v=20260819-1455').catch(()=>{});
