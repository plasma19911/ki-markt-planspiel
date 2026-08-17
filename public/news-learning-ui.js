const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=1)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});

function ensureSection(){
 if($('newsLearning'))return $('newsLearning');
 const news=$('news');if(!news)return null;
 const s=document.createElement('section');s.id='newsLearning';s.className='card';
 s.innerHTML='<div class="cardTitle"><h2>Gelernte News-Wirkung</h2><span class="tag">Quelle × Ereignis</span></div><div id="newsLearningMeta" class="muted">Lernphase startet mit neuen Meldungen.</div><div class="tableWrap"><table><thead><tr><th>Quelle / Typ</th><th>Samples</th><th>Treffer</th><th>Ø abnormal</th><th>Wirkungs-Score</th></tr></thead><tbody id="newsLearningBody"></tbody></table></div><div class="notice">Gemessen wird die anschließende Kursreaktion relativ zum Weltmarkt ACWI nach Handelszeit. Das zeigt historische statistische Wirkung – nicht bewiesene Kausalität und keine Garantie für die nächste Meldung.</div>';
 news.insertAdjacentElement('afterend',s);return s;
}

function rows(list,prefix=''){
 if(!list?.length)return '';
 return list.map(x=>`<tr><td><b>${esc(prefix+x.key)}</b></td><td>${Number(x.samples||0)}</td><td>${fmt(Number(x.hitRate||0)*100,0)}%</td><td class="${Number(x.avgAlignedPct)>=0?'good':'bad'}">${Number(x.avgAlignedPct)>=0?'+':''}${fmt(x.avgAlignedPct,2)}%</td><td><b>${fmt(x.reliabilityScore,0)}/100</b></td></tr>`).join('');
}

async function load(){
 if(document.hidden)return;const section=ensureSection();if(!section)return;
 const meta=$('newsLearningMeta'),body=$('newsLearningBody');
 try{
  const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const s=await r.json(),l=s.newsLearning,sm=l?.summary;
  if(!l||!sm){meta.textContent='Noch keine News-Wirkungshistorie. Nach neuen Meldungen beginnt die kausale Auswertung.';body.innerHTML='<tr><td colspan="5">Lernphase noch nicht gestartet.</td></tr>';return}
  meta.textContent=`${sm.evaluatedEvents||0} Meldungen bereits ausgewertet · ${sm.pendingEvents||0} noch offen · Benchmark ${l.benchmark||'ACWI'} · ${sm.notice||''}`;
  const html=rows(sm.topSources||[],'Quelle: ')+rows(sm.topTypes||[],'Typ: ');
  body.innerHTML=html||'<tr><td colspan="5">Noch zu wenige 6-Stunden-Auswertungen für ein Ranking.</td></tr>';
 }catch(e){meta.textContent=`News-Lernen derzeit nicht lesbar: ${e.message}`;body.innerHTML='<tr><td colspan="5">–</td></tr>'}
}

load();setInterval(load,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
