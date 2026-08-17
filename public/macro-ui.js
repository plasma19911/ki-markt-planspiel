const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=1)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const dt=v=>v?new Date(v).toLocaleString('de-DE'):'–';

function ensure(){
 if($('macroRadar'))return $('macroRadar');
 const anchor=$('analysis')||$('news');if(!anchor)return null;
 const s=document.createElement('section');s.id='macroRadar';s.className='card';
 s.innerHTML=`<div class="cardTitle"><h2>Weltwirtschaft & Geopolitik</h2><span id="macroRiskPill" class="tag">Risiko –</span></div>
 <div id="macroMeta" class="muted">Zentralbanken, Inflation, Wachstum, Energie, Krieg, Sanktionen und Handelskonflikte werden mit Marktreaktionen abgeglichen.</div>
 <div id="macroEvents"></div>
 <div id="macroLearning" class="trendSummary"></div>
 <div class="notice"><b>Keine Automatikkäufe:</b> Ein Krieg, Zinsschritt oder anderes Ereignis ist nur ein Zusatzsignal. Die KI verlangt dazu Kurs-/Trendbestätigung und lernt erst nach ausreichend vielen Fällen eine historische Kategorie-Wirkung.</div>`;
 anchor.insertAdjacentElement('afterend',s);
 const nav=document.querySelector('.mobileNav');
 if(nav&&!nav.querySelector('a[href="#macroRadar"]')){
  const a=document.createElement('a');a.href='#macroRadar';a.textContent='Weltlage';
  const after=nav.querySelector('a[href="#analysis"]');after?.insertAdjacentElement('afterend',a)||nav.appendChild(a);
 }
 return s;
}

function riskClass(n){return n>=70?'bad':n>=45?'yellow':'good'}
function confClass(v){return v?.confirmed?'good':'yellow'}
function eventCard(e){
 const c=e.marketConfirmation||{},read=(c.readings||[]).slice(0,5).map(x=>`${esc(x.symbol)} ${Number(x.movePct)>=0?'+':''}${fmt(x.movePct,2)}%`).join(' · ');
 return `<article class="dossierCard" style="margin-top:10px">
  <div class="dossierHead"><div><div class="eyebrow">${esc(e.label||e.category||'Ereignis')}</div><h3>${esc(e.headline||'')}</h3></div><div><div class="dossierScore ${confClass(c)}">${fmt(c.score||0,0)}</div><div class="muted">Marktbestätigung</div></div></div>
  <div class="dossierMetrics">
   <div class="dossierMetric"><span>Schweregrad</span><b>${fmt(e.severity||0,0)}/100</b></div>
   <div class="dossierMetric"><span>Bestätigt?</span><b class="${confClass(c)}">${c.confirmed?'JA':'NOCH NICHT'}</b></div>
   <div class="dossierMetric"><span>Quellen</span><b>${esc((e.sources||[]).join(' + ')||'–')}</b></div>
  </div>
  <div class="dossierBlock"><b>Mögliche Gewinnergruppen</b><div>${esc((e.beneficiaries||[]).join(' · ')||'keine pauschale Zuordnung')}</div></div>
  <div class="dossierBlock"><b>Mögliche Belastungen</b><div>${esc((e.headwinds||[]).join(' · ')||'keine pauschale Zuordnung')}</div></div>
  <div class="muted">Marktreaktion: ${read||'noch keine ausreichend frischen Proxy-Kurse'} · Meldung ${dt(e.publishedAt)}</div>
 </article>`;
}

function learningText(l){
 const t=l?.summary?.trustedCategories||[];
 if(!l)return'Noch keine Makro-Lernhistorie.';
 if(!t.length)return`${Number(l.summary?.evaluatedEvents||0)} Ereignisse mit 6h-Wirkung ausgewertet. Noch keine Kategorie hat mindestens 8 saubere Fälle.`;
 return `Gelernte Kategorien: ${t.map(x=>`${x.label}: ${x.samples} Fälle · ${fmt(x.hitRate*100,0)}% historisch passend · Score ${fmt(x.reliabilityScore,0)}/100`).join(' | ')}`;
}

async function load(){
 if(document.hidden)return;const section=ensure();if(!section)return;
 try{
  const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json(),rad=s.macroRadar,l=s.macroLearning;
  if(!rad){$('macroMeta').textContent='Makro-/Geopolitik-Radar wird beim nächsten vollständigen Scan aufgebaut.';$('macroEvents').innerHTML='<div class="analysisStatus">Noch keine globalen Ereignisdaten.</div>';$('macroLearning').textContent='Makro-Lernphase noch nicht gestartet.';return}
  const risk=Number(rad.severityIndex||0);$('macroRiskPill').textContent=`Globales Risiko ${fmt(risk,0)}/100`;$('macroRiskPill').className=`tag ${riskClass(risk)}`;
  const health=(rad.sourceHealth||[]).map(x=>`${x.source}: ${x.status}`).join(' · ');$('macroMeta').textContent=`Stand ${dt(rad.updatedAt)} · ${health}. Ereignisse werden gegen Öl, Gold, VIX, Zinsen, Weltmarkt und Branchen-ETFs geprüft.`;
  $('macroEvents').innerHTML=(rad.events||[]).length?(rad.events||[]).map(eventCard).join(''):'<div class="analysisStatus">Keine ausreichend relevante aktuelle Makro-/Geopolitik-Meldung erkannt.</div>';
  $('macroLearning').textContent=learningText(l);
 }catch(e){$('macroMeta').textContent=`Makro-Radar derzeit nicht verfügbar: ${e.message}`}
}

load();setInterval(load,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
