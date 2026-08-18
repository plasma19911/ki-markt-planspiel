import './quota-guard.js';
import './investment-ui.js';
import './news-learning-ui.js';
import './macro-ui.js';
import './exposure-ui.js';
import './focus-ui.js';

function addCss(href,key){
 if(document.querySelector(`link[data-ui-${key}]`))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset[`ui${key[0].toUpperCase()+key.slice(1)}`]='1';document.head.appendChild(link);
}
addCss('/candidate-plain-ui.css?v=20260818-2205','candidate');
// Nur noch eine finale Layout-Schicht. compact-ui.css wird bewusst nicht mehr geladen,
// weil seine Grid-Regeln mit der Basisoberfläche kollidiert haben.
addCss('/stable-ui.css?v=20260818-2205','stable');

const byId=id=>document.getElementById(id);
function updateSignalsVisibility(){
 const section=byId('signals'),body=byId('candidatesBody');
 if(!section||!body)return;
 const hasRealSignal=[...body.querySelectorAll('tr')].some(row=>!row.querySelector('td[colspan]'));
 section.hidden=!hasRealSignal;
 const nav=document.querySelector('.mobileNav a[href="#signals"]');if(nav)nav.hidden=!hasRealSignal;
}
function installSignalsVisibility(){
 const body=byId('candidatesBody');if(!body)return;updateSignalsVisibility();new MutationObserver(updateSignalsVisibility).observe(body,{childList:true,subtree:true});
}
installSignalsVisibility();
