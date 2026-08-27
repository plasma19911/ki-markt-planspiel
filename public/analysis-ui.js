import './quota-guard.js';
import './investment-ui.js?v=20260819-1140';
import './agm-calendar-ui.js?v=20260820-1447';
import './daytrade-largecap-ui.js?v=20260821-1135';
import './news-learning-ui.js?v=20260827-1223';

// Sichtbare Prioritaet im Dashboard:
// 10 Aktive Positionen -> 11 Kapitalverlauf / Aktien-Trade-Chart ->
// 12 Kapitalverteilung -> 13 Live-Aktien-News.
// Der Ticker bekommt seine Order hier explizit, weil ein Grid-Kind ohne order
// sonst vor den Depotkarten mit order 10/11/12 gerendert wird.
function enforceLiveTickerAfterDepotCharts(){
  const ticker=document.getElementById('liveStockNews');
  if(!ticker)return;
  ticker.style.setProperty('order','13','important');
  ticker.style.setProperty('grid-column','1 / -1','important');
  ticker.dataset.visualPlacement='after-depot-trade-charts-v3';
}

enforceLiveTickerAfterDepotCharts();
const dashboardGrid=document.querySelector('.dashboardGrid');
if(dashboardGrid){
  new MutationObserver(enforceLiveTickerAfterDepotCharts).observe(dashboardGrid,{childList:true,subtree:false});
}
setTimeout(enforceLiveTickerAfterDepotCharts,100);
setTimeout(enforceLiveTickerAfterDepotCharts,600);

// Die sichtbare Oberfläche wird absichtlich nicht mehr per JavaScript in neue
// Hauptbereiche umgebaut. V30.0 sortiert die vorhandenen Depotkarten nach Chance
// und markiert zusätzlich die Qualität von Dip/Reclaim-Einstiegen.
