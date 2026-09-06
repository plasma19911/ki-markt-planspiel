// Vereinfacht die Kandidaten-Tabelle fuer die normale Nutzung.
// Alte interne Scanner-Scores bleiben verborgen; der V28.1 Research-Fusion-Score
// wird separat sichtbar angezeigt und von dieser Kurzansicht nicht entfernt.

const body=document.getElementById('candidatesBody');
let applying=false;

function installStyle(){
 if(document.getElementById('candidate-simple-style'))return;
 const s=document.createElement('style');s.id='candidate-simple-style';s.textContent=`
 #signals .candidateScore,#signals .candidateState{display:none!important}
 #signals .simpleRating,#signals .simpleSafety{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:68px!important;padding:5px 9px!important;border-radius:999px!important;font-size:11px!important;font-weight:750!important;line-height:1!important;white-space:nowrap!important}
 #signals .simpleRating.top,#signals .simpleSafety.high{background:rgba(70,214,154,.14)!important;color:#75e5b2!important;border:1px solid rgba(70,214,154,.25)!important}
 #signals .simpleRating.good,#signals .simpleSafety.mid{background:rgba(120,180,255,.12)!important;color:#9bc7ef!important;border:1px solid rgba(120,180,255,.24)!important}
 #signals .simpleRating.watch{background:rgba(239,190,90,.12)!important;color:#e8c77b!important;border:1px solid rgba(239,190,90,.22)!important}
 #signals .simpleRating.weak,#signals .simpleSafety.low{background:rgba(255,112,128,.11)!important;color:#f0a0aa!important;border:1px solid rgba(255,112,128,.20)!important}
 #signals .plainCell{line-height:1.35!important}
 #signals .candidateHelp{font-size:11px!important;color:#8196aa!important;padding-top:7px!important;padding-bottom:7px!important}
 @media(max-width:700px){#signals .simpleRating,#signals .simpleSafety{min-width:58px!important;padding:4px 7px!important;font-size:10px!important}}
 `;document.head.appendChild(s)
}

function ratingText(raw=''){
 const t=String(raw).toLowerCase();
 if(t.includes('sehr interessant'))return['Top','top'];
 if(t.includes('interessant'))return['Gut','good'];
 if(t.includes('beobachten'))return['Warten','watch'];
 if(t.includes('im depot'))return['Im Depot','good'];
 return['Schwach','weak'];
}
function safetyText(raw=''){
 const m=String(raw).match(/(\d+)\s*%/),n=m?Number(m[1]):NaN;
 if(Number.isFinite(n)){if(n>=72)return['Hoch','high'];if(n>=58)return['Mittel','mid'];return['Niedrig','low']}
 return['–','low'];
}
function shortCompany(text=''){
 let t=String(text).replace(/\s+/g,' ').trim();
 if(!t||/geschäftsfeld noch nicht eindeutig|wird mit den nächsten stammdaten/i.test(t))return'–';
 t=t.split(/(?<=[.!?])\s+/)[0]||t;
 if(t.length>115)t=t.slice(0,112).replace(/\s+\S*$/,'')+'…';
 return t;
}
function shortReason(text=''){
 let t=String(text).replace(/\s+/g,' ').trim();
 if(!t)return'–';
 t=t.replace(/^(Positiv|Negativ|Neutral):\s*/i,'').replace(/^Aktuelle Meldung:\s*/i,'').replace(/^Termin\/Ereignis:\s*/i,'');
 if(/keine starke neue firmenmeldung/i.test(t))return'Branche / Gesamtmarkt';
 if(/nachrichtenlage eher positiv/i.test(t))return'News eher positiv';
 if(/nachrichtenlage eher negativ/i.test(t))return'News eher negativ';
 if(/im depot.*laufend geprüft/i.test(t))return'Position wird beobachtet';
 if(/kauf wartet auf kursbestätigung/i.test(t))return'Wartet auf besseren Einstieg';
 t=t.replace(/\s*·\s*aktuell keine neue starke Firmenmeldung\.?/i,'');
 if(t.length>125)t=t.slice(0,122).replace(/\s+\S*$/,'')+'…';
 return t||'–';
}

function simplify(){
 if(applying||!body)return;applying=true;
 try{
  const table=body.closest('table');
  const heads=table?.querySelectorAll('thead th');
  if(heads?.length>=7){heads[0].textContent='Aktie';heads[1].textContent='Bewertung';heads[2].textContent='Heute';heads[3].textContent='Sicherheit';heads[4].textContent='Risiko';heads[5].textContent='Firma kurz';heads[6].textContent='Aktuell'}
  const help=document.querySelector('#signals .candidateHelp');if(help&&help.dataset.simple!=='1'){help.textContent='Kurzansicht: Gesamtqualität, Tagesbewegung, Sicherheit, Research-Score und aktueller Auslöser.';help.dataset.simple='1'}
  body.querySelectorAll('tr').forEach(tr=>{
   if(tr.dataset.simpleCandidate==='1')return;
   const cells=tr.children;if(cells.length<7)return;
   tr.dataset.simpleCandidate='1';
   tr.querySelectorAll('.candidateState,.candidateScore').forEach(x=>x.remove());
   const oldRating=cells[1].textContent,[rt,rc]=ratingText(oldRating);cells[1].innerHTML=`<span class="simpleRating ${rc}">${rt}</span>`;
   const [st,sc]=safetyText(cells[3].textContent);cells[3].innerHTML=`<span class="simpleSafety ${sc}">${st}</span>`;
   const risk=String(cells[4].textContent).trim().toLowerCase();
   const pill=cells[4].querySelector('.eventPill');if(pill)pill.textContent=risk.includes('hoch')?'Hoch':risk.includes('mittel')?'Mittel':'Niedrig';
   cells[5].textContent=shortCompany(cells[5].textContent);
   cells[6].textContent=shortReason(cells[6].textContent);
  });
 }finally{applying=false}
}

installStyle();simplify();
document.addEventListener('planspiel:status',()=>requestAnimationFrame(simplify));
