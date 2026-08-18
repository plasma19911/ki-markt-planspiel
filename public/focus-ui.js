const $=id=>document.getElementById(id);

function makeDetails(className,title,subtitle){
  const details=document.createElement('details');
  details.className=className;
  const summary=document.createElement('summary');
  summary.innerHTML=`<span><b>${title}</b><small>${subtitle}</small></span><span class="detailsChevron">⌄</span>`;
  details.appendChild(summary);
  return details;
}

function installFocusLayout(){
  const grid=document.querySelector('.dashboardGrid');
  if(!grid||document.querySelector('.secondaryDetails'))return;

  const setup=$('setup');
  const secondary=[
    $('news'),
    $('analysis'),
    document.querySelector('.replayCard'),
    document.querySelector('.activityCard'),
    $('stats'),
    document.querySelector('.dashboardHealth'),
    $('brain'),
    document.querySelector('.dashboardHistory'),
    document.querySelector('.dashboardAllocation')
  ].filter(Boolean);

  const details=makeDetails(
    'secondaryDetails',
    'Weitere Analysen & Details',
    'News-Radar, KI-Analyse, Replay, Statistik, Health, Log, History und Kapitalverteilung'
  );
  const inner=document.createElement('div');
  inner.className='secondaryGrid';
  details.appendChild(inner);
  grid.insertBefore(details,setup||null);
  secondary.forEach(el=>inner.appendChild(el));

  if(setup){
    const settings=makeDetails('settingsDetails','Einstellungen','Startkapital, Laufzeit, Gebühren und Steuerung');
    const settingsInner=document.createElement('div');
    settingsInner.className='settingsInner';
    settings.appendChild(settingsInner);
    grid.insertBefore(settings,setup);
    settingsInner.appendChild(setup);
  }

  const secondaryIds=new Set(secondary.map(el=>el.id).filter(Boolean));
  document.querySelectorAll('a[href^="#"]').forEach(link=>{
    link.addEventListener('click',()=>{
      const id=decodeURIComponent(link.getAttribute('href').slice(1));
      if(secondaryIds.has(id))details.open=true;
      if(id==='setup')document.querySelector('.settingsDetails')?.setAttribute('open','');
    });
  });

  const current=decodeURIComponent(location.hash.replace(/^#/,''));
  if(secondaryIds.has(current))details.open=true;
  if(current==='setup')document.querySelector('.settingsDetails')?.setAttribute('open','');
}

installFocusLayout();
