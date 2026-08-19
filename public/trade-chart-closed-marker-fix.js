/* Closed-trade chart fix
   Verkaufte Aktien werden immer im kompletten Trade-Zeitraum geladen, damit
   KAUF und VERKAUF nicht durch 1T/5T/1M aus dem sichtbaren Chart fallen.
   Zusätzlich werden Datum/Uhrzeit der Marker direkt unter dem Chart gezeigt.
*/
const originalFetch = window.fetch.bind(window);
const BUY = new Set(['KAUF','BUY']);
const SELL = new Set(['VERKAUF','SELL']);

function activeClosedSymbol(){
  const b=document.querySelector('#positionTradeChart .tradeSymbol.active.sold');
  return b?.dataset?.symbol ? String(b.dataset.symbol).toUpperCase() : '';
}
function isPositionChart(input){
  try{
    const raw=typeof input==='string'?input:(input?.url||'');
    const u=new URL(raw,location.href);
    return u.pathname==='/api/position-chart';
  }catch{return false}
}
function forcedTradeUrl(input){
  const raw=typeof input==='string'?input:(input?.url||'');
  const u=new URL(raw,location.href);
  const sym=String(u.searchParams.get('symbol')||'').toUpperCase();
  const closed=activeClosedSymbol();
  if(closed && sym===closed){
    u.searchParams.set('range','trade');
    u.searchParams.set('_closedTrade',String(Date.now()));
    return u.toString();
  }
  return null;
}
function fmtTs(v){
  const t=Date.parse(String(v||''));
  return Number.isFinite(t)?new Date(t).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}):'–';
}
function ensureSummary(){
  const card=document.getElementById('positionTradeChart');
  const info=document.getElementById('tradeChartInfo');
  if(!card||!info)return null;
  let el=document.getElementById('closedTradeMarkerSummary');
  if(!el){
    el=document.createElement('div');
    el.id='closedTradeMarkerSummary';
    el.style.cssText='display:none;margin:8px 0 0;padding:8px 10px;border:1px solid rgba(74,108,137,.28);border-radius:9px;background:#0a1824;font-size:11px;color:#9fb5c9;gap:8px;flex-wrap:wrap;align-items:center';
    info.insertAdjacentElement('beforebegin',el);
  }
  return el;
}
function renderTradeMarkers(data){
  const el=ensureSummary(); if(!el)return;
  const closed=!data?.position?.open;
  const events=Array.isArray(data?.events)?data.events:[];
  if(!closed||!events.length){el.style.display='none';el.innerHTML='';return}
  const buys=events.filter(e=>BUY.has(String(e?.action||'').toUpperCase()));
  const sells=events.filter(e=>SELL.has(String(e?.action||'').toUpperCase()));
  const chips=[];
  for(const e of buys)chips.push(`<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:rgba(70,214,154,.10);border:1px solid rgba(70,214,154,.35);color:#79e7b5"><b>▲ KAUF</b> ${fmtTs(e.ts)}</span>`);
  for(const e of sells)chips.push(`<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;background:rgba(255,112,128,.10);border:1px solid rgba(255,112,128,.35);color:#ff9aa6"><b>▼ VERKAUF</b> ${fmtTs(e.ts)}</span>`);
  el.style.display='flex';
  el.innerHTML=`<b style="color:#dbe9f5">Kompletter Trade-Zeitraum:</b>${chips.join('')}<span style="color:#7890a6">Die grünen/roten Marker stehen an denselben Zeitpunkten im Kurschart.</span>`;
  const pill=document.getElementById('tradeChartPill');
  if(pill)setTimeout(()=>{pill.textContent=(pill.textContent||'').replace(/·\s*(1T|5T|1M)\s*$/,'· TRADE');},0);
}

window.fetch=async function(input,init){
  if(!isPositionChart(input))return originalFetch(input,init);
  const forced=forcedTradeUrl(input);
  const response=await originalFetch(forced||input,{...(init||{}),cache:'no-store'});
  if(response.ok){
    response.clone().json().then(data=>{
      if(forced||data?.range==='trade')setTimeout(()=>renderTradeMarkers(data),0);
      else setTimeout(()=>{const el=ensureSummary();if(el){el.style.display='none';el.innerHTML='';}},0);
    }).catch(()=>{});
  }
  return response;
};

// Der Haupt-Chart wird als Modul kurz danach aufgebaut. MutationObserver sorgt dafür,
// dass ein Wechsel auf eine verkaufte Aktie sofort als historischer Trade erkennbar ist.
const observer=new MutationObserver(()=>{
  const closed=Boolean(activeClosedSymbol()),card=document.getElementById('positionTradeChart');
  if(card)card.dataset.closedTradeView=closed?'1':'0';
});
observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
