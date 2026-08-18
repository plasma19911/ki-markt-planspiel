const $=id=>document.getElementById(id);

function makeDetails(className,title,subtitle){
 const d=document.createElement('details');d.className=className;
 const s=document.createElement('summary');s.innerHTML=`<span><b>${title}</b><small>${subtitle}</small></span><span class="detailsChevron">⌄</span>`;d.appendChild(s);return d;
}

function installFocusLayout(){
 const grid=document.querySelector('.dashboardGrid');if(!grid||document.querySelector('.secondaryDetails'))return;
 const setup=$('setup');
 // Nur echte Nebeninformationen einklappen. Replay, Aktivitäten, Positionen,
 // Kandidaten, Katalysatoren und der kleine Depotchart bleiben sichtbar.
 const secondary=[$('news'),$('analysis'),$('stats'),document.querySelector('.dashboardHealth'),$('brain'),document.querySelector('.dashboardHistory')].filter(Boolean);
 const details=makeDetails('secondaryDetails','Weitere Analysen & Details','News-Radar, Detailanalyse, Statistik, Systemstatus, KI-Log und History');
 const inner=document.createElement('div');inner.className='secondaryGrid';details.appendChild(inner);
 grid.insertBefore(details,setup||null);secondary.forEach(el=>inner.appendChild(el));

 // Kapitalverteilung ist bewusst kein eigener großer Chart mehr in der Hauptansicht.
 const allocation=document.querySelector('.dashboardAllocation');if(allocation)allocation.hidden=true;

 if(setup){
   const settings=makeDetails('settingsDetails','Einstellungen','Startkapital, Laufzeit, Gebühren und Steuerung');
   const si=document.createElement('div');si.className='settingsInner';settings.appendChild(si);grid.insertBefore(settings,setup);si.appendChild(setup);
 }
 const ids=new Set(secondary.map(el=>el.id).filter(Boolean));
 document.querySelectorAll('a[href^="#"]').forEach(link=>link.addEventListener('click',()=>{
   const id=decodeURIComponent(link.getAttribute('href').slice(1));if(ids.has(id))details.open=true;if(id==='setup')document.querySelector('.settingsDetails')?.setAttribute('open','');
 }));
 const current=decodeURIComponent(location.hash.replace(/^#/,''));if(ids.has(current))details.open=true;if(current==='setup')document.querySelector('.settingsDetails')?.setAttribute('open','');
}
installFocusLayout();
