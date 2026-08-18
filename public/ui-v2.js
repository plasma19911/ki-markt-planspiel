const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const money=(v,c='EUR')=>`${fmt(v)} ${String(c).toUpperCase()==='USD'?'$':'€'}`;
const pct=v=>`${Number(v)>=0?'+':''}${fmt(v)}%`;
const dt=v=>v?new Date(v).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'–';

function primaryUi(){
 document.body.classList.add('uiV2');document.title='KI Markt-Planspiel · ZERO Paper Trading';
 const eyebrow=document.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='LIVE PAPER TRADING · ZERO READY';
 const p=document.querySelector('header p');if(p)p.textContent='Depot · Aktien & ETFs · Live-Signale · News · Risiko · ZERO-Kostenmodell';
 const footer=document.querySelector('footer');if(footer)footer.textContent='KI Markt-Planspiel · Paper Trading · ZERO/gettex-Zielmodell · keine echten Orders';
 const kpis=[...document.querySelectorAll('.kpis article')];kpis.forEach(x=>x.classList.remove('kpiPrimary','kpiPositive','kpiNegative','kpiSecondary','kpiMoved'));
 [$('equity')?.parentElement,$('pnl')?.parentElement].filter(Boolean).forEach(x=>x.classList.add('kpiPrimary'));
 [$('cash')?.parentElement,$('feesTotal')?.parentElement,$('positionCount')?.parentElement,$('dailyRisk')?.parentElement].filter(Boolean).forEach(x=>x.classList.add('kpiSecondary'));
 [$('marketMode')?.parentElement,$('universeCount')?.parentElement].filter(Boolean).forEach(x=>x.classList.add('kpiMoved'));
 const grid=document.querySelector('#livePanel main.grid'),setup=$('setup');if(grid&&setup)grid.appendChild(setup);
}

function ensureQuickNav(){
 if(document.querySelector('.desktopQuickNav'))return;const tabs=document.querySelector('.appTabs');if(!tabs)return;
 const nav=document.createElement('nav');nav.className='desktopQuickNav';nav.innerHTML=`<a href="#overview">Depot</a><a href="#positions">Positionen</a><a href="#performanceDiagnostics">Performance</a><a href="#tradeHistory">Trades</a><a href="#signals">Signale</a><a href="#analysis">Analyse</a><a href="#news">News</a><a href="#stats">Statistik</a><a href="#setup">Einstellungen</a>`;tabs.insertAdjacentElement('afterend',nav)
}

function ensureStatusStrip(){
 let s=$('uiStatusStrip');if(s)return s;const k=document.querySelector('#livePanel .kpis');if(!k)return null;
 s=document.createElement('section');s.id='uiStatusStrip';s.className='uiStatusStrip';s.innerHTML=`<div class="uiStatusItem"><span id="uiLiveDot" class="uiStatusDot"></span><div><span>System</span><b id="uiLiveText">Status wird geladen</b></div></div><div class="uiStatusItem"><span>Marktmodus</span><b id="uiMarketMode">–</b></div><div class="uiStatusItem"><span>Universum im Scan</span><b id="uiUniverse">–</b></div><div class="uiStatusItem"><span>Letzter Scan</span><b id="uiLastScan">–</b></div>`;k.insertAdjacentElement('afterend',s);return s
}

function ensurePerformance(){
 let s=$('performanceDiagnostics');if(s)return s;const pos=$('positions');if(!pos)return null;
 s=document.createElement('section');s.id='performanceDiagnostics';s.className='card performanceDiagnostics';s.innerHTML=`<div class="cardTitle"><h2>Performance & Handlungsqualität</h2><span id="performancePill" class="tag">Analyse</span></div><div class="performanceIntro">Hier siehst du zuerst, ob das Depot durch geschlossene Fehltrades, offene Positionen oder Kosten verliert.</div><div id="diagnosticGrid" class="diagnosticGrid"></div><div id="lossDriver" class="lossDriver">Wird berechnet …</div><div class="recentTradeTitle"><b>Letzte Handelsaktionen</b><span class="tag">KAUF / VERKAUF / BLOCK</span></div><div id="recentTrades" class="recentTrades"></div>`;
 pos.insertAdjacentElement('afterend',s);
 const hist=document.querySelector('.history');if(hist){hist.id='tradeHistory';s.insertAdjacentElement('afterend',hist)}
 return s
}

function card(label,value,kind=''){return `<div class="diag ${kind}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`}
function histKind(a){a=String(a||'').toUpperCase();if(a==='KAUF')return'buy';if(a==='VERKAUF')return'sell';if(a.includes('BLOCKIERT'))return'blocked';if(a==='FEHLER')return'error';return''}
function decorateHistory(){document.querySelectorAll('#historyBody tr').forEach(tr=>{tr.classList.remove('trade-buy','trade-sell','trade-blocked','trade-error');const k=histKind(tr.children?.[1]?.textContent?.trim());if(k)tr.classList.add(`trade-${k}`)})}

function recentTrades(rows,currency){
 const el=$('recentTrades');if(!el)return;const list=(rows||[]).filter(h=>['KAUF','VERKAUF','FEHLER'].includes(h.action)||String(h.action||'').includes('BLOCKIERT')).slice(0,4);
 el.innerHTML=list.length?list.map(h=>{const k=histKind(h.action),amount=Number(h.amount||0),fee=Number(h.fee||0);return `<article class="recentTrade ${k}"><div class="rtTop"><span class="rtAction">${esc(h.action)}</span><span class="rtTime">${dt(h.ts)}</span></div><div class="rtSymbol">${esc(h.symbol||'–')}</div><div class="rtMeta">${amount?`${amount>0?'+':''}${money(amount,currency)}`:'keine Geldbewegung'}${fee?` · Gebühr ${money(fee,currency)}`:''}</div><div class="rtReason">${esc(h.reason||'')}</div></article>`}).join(''):'<div class="muted">Noch keine Kauf-/Verkaufsaktion vorhanden.</div>'
}

function lossDriver(s){
 const c=s.config||{},st=s.statistics||{},pnl=Number(s.pnl||0),real=Number(st.realizedPnl||0),unreal=Number(st.unrealizedPnl||0),fees=Number(c.total_fees||0),closed=Number(st.closedTrades||0),win=Number(st.winRate||0),pf=Number(st.profitFactor||0),avgWin=Math.max(0,Number(st.avgWin||0)),avgLoss=Math.abs(Number(st.avgLoss||0));
 if(pnl>=0)return{kind:'good',text:`Depot aktuell im Plus. Geschlossene Trades ${money(real,c.currency)}, offene Positionen ${money(unreal,c.currency)}, Gebühren ${money(fees,c.currency)}.`};
 const x=[];
 if(real<0&&Math.abs(real)>=Math.abs(unreal))x.push('der größere Verlustanteil kommt aus bereits geschlossenen Trades');else if(unreal<0)x.push('der größere Verlustanteil steckt aktuell in offenen Positionen');
 if(fees>0&&fees>=Math.abs(pnl)*.25)x.push('Gebühren sind im Verhältnis zum bisherigen Minus auffällig hoch');
 if(closed>=3&&win<45)x.push(`Trefferquote nur ${fmt(win,1)}%`);
 if(closed>=3&&avgLoss>avgWin&&avgLoss>0)x.push('Ø Verlust ist größer als Ø Gewinn');
 if(closed>=3&&pf>0&&pf<1)x.push(`Profit-Faktor ${fmt(pf,2)} liegt unter 1`);
 if(!x.length)x.push('noch zu wenige abgeschlossene Trades für einen eindeutigen Verlusttreiber');
 return{kind:x.length>=2?'bad':'warn',text:`Aktuell ${money(pnl,c.currency)} Gesamt-P/L: ${x.join(' · ')}.`}
}

function render(s){
 ensureStatusStrip();ensurePerformance();const c=s.config||{},st=s.statistics||{},a=s.accounting||{},currency=c.currency||'EUR',pnl=Number(s.pnl||0),closed=Number(st.closedTrades||0),win=Number(st.winRate||0),pf=Number(st.profitFactor||0),fees=Number(c.total_fees||0),start=Math.max(0,Number(c.start_capital||0)),recon=Math.abs(Number(a.realizedReconciliationDelta||0));
 const p=$('pnl')?.parentElement;if(p){p.classList.toggle('kpiPositive',pnl>=0);p.classList.toggle('kpiNegative',pnl<0)}
 const e=$('equity')?.parentElement;if(e){e.classList.toggle('kpiPositive',pnl>=0);e.classList.toggle('kpiNegative',pnl<0)}
 $('uiLiveDot')?.classList.toggle('on',Boolean(c.running));if($('uiLiveText'))$('uiLiveText').textContent=c.running?'Planspiel läuft · 60-Sek.-Scan':'Planspiel gestoppt';if($('uiMarketMode'))$('uiMarketMode').textContent=c.market_mode==='NEWS_ONLY'?'News only · Börsen zu':'Markt + News';if($('uiUniverse'))$('uiUniverse').textContent=String(c.universe_count||'–');if($('uiLastScan'))$('uiLastScan').textContent=dt(c.last_scan);
 const avgW=Number(st.avgWin||0),avgL=Math.abs(Number(st.avgLoss||0));
 if($('diagnosticGrid'))$('diagnosticGrid').innerHTML=[
  card('Realisiert',money(st.realizedPnl||0,currency),Number(st.realizedPnl||0)>=0?'good':'bad'),
  card('Unrealisiert',money(st.unrealizedPnl||0,currency),Number(st.unrealizedPnl||0)>=0?'good':'bad'),
  card('Trefferquote',closed?`${fmt(win,1)}% · ${closed} Trades`:'noch keine Trades',closed>=3?(win>=50?'good':win<40?'bad':'warn'):''),
  card('Profit-Faktor',closed?fmt(pf,2):'–',closed>=3?(pf>=1.2?'good':pf<1?'bad':'warn'):''),
  card('Ø Gewinn / Verlust',closed?`${money(avgW,currency)} / ${money(avgL,currency)}`:'–',closed>=3&&avgL>avgW?'bad':''),
  card('Gebühren / Start',start?`${money(fees,currency)} · ${fmt(fees/start*100,2)}%`:'–',start&&fees/start>.02?'warn':''),
  card('Summen-/History-Check',recon<.011?'stimmt ✓':`Abweichung ${money(recon,currency)}`,recon<.011?'good':'bad')
 ].join('');
 const d=lossDriver(s),box=$('lossDriver');if(box){box.className=`lossDriver ${d.kind}`;box.innerHTML=`<b>Warum wird es mehr oder weniger?</b><br>${esc(d.text)}`}
 const pill=$('performancePill');if(pill){pill.textContent=pnl>=0?'IM PLUS':closed<3?'NOCH WENIG DATEN':'VERLUSTTREIBER';pill.className=`tag ${pnl>=0?'good':'bad'}`}
 recentTrades(s.history,currency);decorateHistory()
}

function makeCollapsible(card,collapsed=true){
 if(!card||card.dataset.uiCollapsible==='1')return;const title=card.querySelector(':scope > .cardTitle');if(!title)return;card.dataset.uiCollapsible='1';card.classList.add('advancedCard');if(collapsed)card.classList.add('isCollapsed');
 const b=document.createElement('button');b.type='button';b.className='advancedToggle';b.textContent=collapsed?'Anzeigen':'Einklappen';b.onclick=()=>{const on=card.classList.toggle('isCollapsed');b.textContent=on?'Anzeigen':'Einklappen'};title.appendChild(b)
}
function advancedCards(){
 makeCollapsible($('setup'),window.innerWidth>700);makeCollapsible(document.querySelector('.health'),window.innerWidth>700);makeCollapsible($('brain'),window.innerWidth>700);makeCollapsible($('zeroBrokerTarget'),window.innerWidth>700)
}

async function load(){try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)return;render(await r.json())}catch{}}
function install(){primaryUi();ensureQuickNav();ensureStatusStrip();ensurePerformance();advancedCards();const obs=new MutationObserver(()=>advancedCards());obs.observe(document.querySelector('#livePanel main.grid')||document.body,{childList:true,subtree:true});load();setInterval(()=>{if(!document.hidden)load()},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()})}
install();
