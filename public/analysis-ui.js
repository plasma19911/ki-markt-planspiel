import './quota-guard.js';
import './investment-ui.js';
import './news-learning-ui.js';
import './macro-ui.js';
import './exposure-ui.js';

// Zusätzliche Styles für die einfach erklärte Kandidatenansicht.
if(!document.querySelector('link[data-candidate-plain-ui]')){
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='/candidate-plain-ui.css';link.dataset.candidatePlainUi='1';
  document.head.appendChild(link);
}

// Die historische 2026-Perfekt-vs-KI-Auswertung wurde aus der Oberfläche entfernt.
// Diese Datei bleibt als schlanker Einstiegspunkt für die aktuellen Live-Module erhalten.
const byId=id=>document.getElementById(id);

function updateSignalsVisibility(){
  const section=byId('signals'),body=byId('candidatesBody');
  if(!section||!body)return;
  const hasRealSignal=[...body.querySelectorAll('tr')].some(row=>!row.querySelector('td[colspan]'));
  section.hidden=!hasRealSignal;
  const nav=document.querySelector('.mobileNav a[href="#signals"]');
  if(nav)nav.hidden=!hasRealSignal;
}

function installSignalsVisibility(){
  const body=byId('candidatesBody');
  if(!body)return;
  updateSignalsVisibility();
  new MutationObserver(updateSignalsVisibility).observe(body,{childList:true,subtree:true});
}

installSignalsVisibility();
