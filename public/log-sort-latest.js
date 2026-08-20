const arr=v=>Array.isArray(v)?v:[];
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ts=x=>{const t=Date.parse(String(x?.ts||x?.time||x?.created_at||''));return Number.isFinite(t)?t:0};
const dt=s=>s?new Date(s).toLocaleString('de-DE'):'–';

function renderAiLog(s){
 const el=document.getElementById('aiLog');if(!el)return;
 const rows=arr(s?.aiLog).slice().sort((a,b)=>ts(b)-ts(a)||num(b?.id)-num(a?.id));
 el.innerHTML=rows.map(x=>`<article class="msg"><div><b>${esc(x.title)}</b>${x.symbol?` · ${esc(x.symbol)}`:''}</div><p>${esc(x.message)}</p><small>${dt(x.ts)}${x.confidence!=null?` · Konfidenz ${Math.round(num(x.confidence)*100)} %`:''}</small></article>`).join('')||'<div class="muted">Noch keine KI-Notizen.</div>';
}

function sortExistingByTime(containerSelector,timeSelector){
 const root=document.querySelector(containerSelector);if(!root)return;
 const rows=[...root.children];
 rows.sort((a,b)=>{
  const ta=Date.parse(a.querySelector(timeSelector)?.getAttribute('data-ts')||'')||0;
  const tb=Date.parse(b.querySelector(timeSelector)?.getAttribute('data-ts')||'')||0;
  return tb-ta;
 });
 rows.forEach(x=>root.appendChild(x));
}

document.addEventListener('planspiel:status',e=>{renderAiLog(e.detail||{});});
