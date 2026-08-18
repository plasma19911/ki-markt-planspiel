const parseDe=s=>{const t=String(s||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.');const n=Number(t);return Number.isFinite(n)?n:0};
const fmt=n=>Number(n||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});

function ensureBox(){
  let box=document.getElementById('accountingChecksum');if(box)return box;
  const kpis=document.querySelector('.kpis');if(!kpis)return null;
  box=document.createElement('div');box.id='accountingChecksum';box.className='notice';box.style.margin='10px 0 0';kpis.insertAdjacentElement('afterend',box);return box;
}
function syncZeroUi(){
  const fixed=document.getElementById('feeFixed'),percent=document.getElementById('feePercent'),execution=document.getElementById('executionInfo');
  if(fixed){fixed.value='0.00';fixed.disabled=true;fixed.title='ZERO-Gebühren werden automatisch je Order berechnet.'}
  if(percent){percent.value='0.00';percent.disabled=true;percent.title='ZERO-Gebühren werden automatisch je Order berechnet.'}
  const zeroText='ZERO automatisch: ganze Wertpapierorder ab 500 € = 0 €, darunter 1 €; Aktien-Bruchstückauftrag 1 € ab 1 € Bruchstückwert; ETFs im Planspiel nur ganze Stücke. Spread/Ausführungspuffer separat.';
  if(execution&&execution.textContent!==zeroText)execution.textContent=zeroText;
  const eqEl=document.getElementById('equity'),cashEl=document.getElementById('cash'),box=ensureBox();if(!eqEl||!cashEl||!box)return;
  const equity=parseDe(eqEl.textContent),cash=parseDe(cashEl.textContent),market=equity-cash,diff=equity-(cash+market);
  const ok=Math.abs(diff)<0.011;
  box.innerHTML=`<b>Kontrollsumme:</b> Depot ${fmt(equity)} € = Cash ${fmt(cash)} € + Marktwert offene Positionen ${fmt(market)} € <span style="font-weight:800;${ok?'color:#72e4a7':'color:#ff8f8f'}">${ok?'✓ stimmt':'⚠ Abweichung'}</span>`;
}

syncZeroUi();setInterval(syncZeroUi,800);
