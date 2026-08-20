// V28.3 compatibility file retained only for the changelog.
// Score rendering and trading-hours rendering moved to the single V28.6 UI
// to prevent duplicate badges/legends.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const entries=[
 {at:'20.08.2026 · 19:25',title:'V28.6 · Einheitlicher Score & bessere Chancen rotieren',items:['Jeder aktuell an die Entscheidung übergebene Aktienkandidat und jede offene Position erhält denselben normalisierten Research-Score 0–100.','Fehlende optionale Momentum-/Volumen-/News-Felder zählen neutral statt den Score künstlich Richtung 0 zu drücken.','Deutlich schwache Positionen dürfen bei großem, mehrfach bestätigtem Score-Abstand kontrolliert gegen bessere Chancen rotiert werden; maximal eine Rotation, Mindesthaltezeit und Cooldown verhindern Churn.','Score-Badges und Legenden werden nur noch von einem UI-Modul gerendert; doppelte Anzeigen sind entfernt.']},
 {at:'20.08.2026 · 18:55',title:'V28.5 · Live-Score, Minutentakt & Chart-Transparenz',items:['Research-Score in der schlanken Dashboard-Antwort.','Cloudflare-Minutencheck füllt echte Scan-Lücken.','Globale DOM-Beobachter entfernt; Kapitalchart erklärt flache Depotphasen.']},
 {at:'20.08.2026 · 18:25',title:'V28.3 · Score-Anzeige, Börsenzeiten und Main=Live',items:['Research-Score, gettex-Zeiten und Main→Live-Absicherung ergänzt.']},
 {at:'20.08.2026',title:'V28.2 · Relative Opportunity Learning',items:['Käufe werden mit gleichzeitig verfügbaren Alternativen verglichen; Gewinner werden vor weichen Noise-Exits geschützt.']},
 {at:'20.08.2026',title:'V28.1 · Research Signal Fusion',items:['Momentum, Volumen, Reclaim, News, 52W, Multi-Scan, Regime und Forward-Lernen werden gewichtet.']},
 {at:'20.08.2026',title:'V28.0 · Trade Maturity',items:['Mindest-Reifezeit und Recovery-Fenster für neue Positionen.']},
 {at:'20.08.2026',title:'V27.9 · Opportunity Learning',items:['Verpasste Chancen, Reclaims und Idle-Cash-Lernen ergänzt.']}
];
function inject(){const list=document.querySelector('#changelogOverlay .changelogList');if(!list||list.querySelector('[data-v286-changelog]'))return;list.querySelector('.latest')?.classList.remove('latest');for(let i=entries.length-1;i>=0;i--){const e=entries[i],a=document.createElement('article');a.className='changelogEntry'+(i===0?' latest':'');a.dataset.v286Changelog='1';a.innerHTML=`<div class="changelogTime">${esc(e.at)}</div><h3>${esc(e.title)}</h3><ul>${e.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;list.prepend(a)}}
document.addEventListener('click',e=>{if(e.target.closest('#changelogToggle'))setTimeout(inject,0)});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject,{once:true});else inject();
window.__V283_UI_LIVE__={version:28.6,compatibilityOnly:true,scoreRenderer:false};
