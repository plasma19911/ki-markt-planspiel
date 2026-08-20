// V28.5 lightweight live UI. Event-driven only: no global MutationObserver.
const num=(v,d=NaN)=>Number.isFinite(Number(v))?Number(v):d;
const norm=v=>String(v||'').toUpperCase().trim();
let latest=null;

function installStyle(){if(document.getElementById('v285-style'))return;const s=document.createElement('style');s.id='v285-style';s.textContent=`
.v285Partial{opacity:.9}.v285FlatNote{font-size:10px;color:#7890a6;margin-top:4px}.v285Hours{display:flex;gap:6px;align-items:center}.v285Hours .open{color:#75e5b2}.v285Hours .closed{color:#f0a0aa}.v285Hours .pre{color:#e8c77b}
`;document.head.appendChild(s)}
function berlin(){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),o={};for(const x of p)o[x.type]=x.value;return{weekday:o.weekday,minute:Number(o.hour)*60+Number(o.minute)}}
function hours(){const x=berlin(),day=!['Sat','Sun'].includes(x.weekday),m=x.minute;if(!day)return['Geschlossen','closed'];if(m>=445&&m<450)return['Voranalyse · Trading ab 07:30','pre'];if(m>=450&&m<1380)return['Trading LIVE · bis 23:00','open'];return[m<445?'Geschlossen · ab 07:30':'Geschlossen · nächster Börsentag 07:30','closed']}
function updateHours(){let chip=document.querySelector('.v285Hours');if(!chip){const strip=document.querySelector('.statusStrip');if(!strip)return;chip=document.createElement('div');chip.className='statusChip v285Hours';chip.innerHTML='<span>gettex</span><b>–</b>';strip.appendChild(chip)}const [t,c]=hours(),b=chip.querySelector('b');if(b){b.textContent=t;b.className=c}}

function markPartialScores(status){const rows=status?.researchSignalFusionPolicy?.positionScores||[],partial=new Set(rows.filter(x=>x?.partial).map(x=>norm(x.symbol)));if(!partial.size)return;document.querySelectorAll('#positionCards .positionCard').forEach(card=>{const sym=norm(card.querySelector('.positionSymbol')?.childNodes?.[0]?.textContent||card.querySelector('.positionSymbol')?.textContent);if(!partial.has(sym))return;const badge=card.querySelector('.researchScoreBadge');if(badge){badge.classList.add('v285Partial');const small=badge.querySelector('small');if(small)small.textContent='Teilscore';badge.title='Teilscore aus vorhandenen Positions-/Signalwerten. Die Position stammt aus der Zeit vor V28.1; ein vollständiger Research-Score ersetzt diesen Wert automatisch.'}})}

function showFlatChartInfo(status){const card=document.querySelector('.dashboardChart');if(!card)return;let note=card.querySelector('.v285FlatNote');if(!note){note=document.createElement('div');note.className='v285FlatNote';card.appendChild(note)}const snaps=Array.isArray(status?.snapshots)?status.snapshots:[],vals=snaps.map(x=>Number(x?.equity)).filter(Number.isFinite);if(vals.length<2){note.textContent='Kapitalchart wartet auf weitere Scanpunkte.';return}const min=Math.min(...vals),max=Math.max(...vals),flat=Math.abs(max-min)<0.02;const last=status?.config?.last_scan?new Date(status.config.last_scan).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'–';note.textContent=flat?`Scanner läuft · ${vals.length} Scanpunkte · Depotwert aktuell unverändert · letzter Scan ${last}`:`${vals.length} Scanpunkte · letzter Scan ${last}`}

function updateScanHeader(status){const el=document.getElementById('scanHeaderStatus');if(!el)return;const scan=Date.parse(String(status?.config?.last_scan||'')),seen=Date.parse(String(status?.pcAgent?.lastSeenAt||status?.pcAgent?.last_seen_at||'')),scanAge=Number.isFinite(scan)?Date.now()-scan:Infinity,agentFresh=Number.isFinite(seen)&&Date.now()-seen<90_000;if(agentFresh&&scanAge>90_000){el.textContent=`Scan läuft / Lücke wird gefüllt · Agent online`;el.className='yellow'}}

function apply(status){latest=status||latest;if(!latest)return;installStyle();updateHours();requestAnimationFrame(()=>requestAnimationFrame(()=>{markPartialScores(latest);showFlatChartInfo(latest);updateScanHeader(latest)}))}

document.addEventListener('planspiel:status',e=>apply(e.detail));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{installStyle();updateHours()},{once:true});else{installStyle();updateHours()}
setInterval(updateHours,60_000);
window.__V285_UI_LIVE__={version:28.5,eventDriven:true,noGlobalMutationObserver:true};
