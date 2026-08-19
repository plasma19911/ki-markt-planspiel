let done=false;
function installTradeRange(){
 const card=document.getElementById('positionTradeChart');if(!card)return false;
 const first=card.querySelector('.tradeChartRanges button[data-range="1d"]');if(!first)return false;
 first.dataset.range='trade';first.textContent='Trade';
 const subtitle=document.getElementById('tradeChartSubtitle');if(subtitle&&!subtitle.dataset.historyHint){subtitle.dataset.historyHint='1';subtitle.textContent='Kompletter Trade-Zeitraum mit allen Kauf- und Verkaufspunkten; 5 Tage / 1 Monat optional.'}
 if(!done){done=true;setTimeout(()=>first.click(),80)}
 return true;
}
const mo=new MutationObserver(()=>{if(installTradeRange())mo.disconnect()});
mo.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(installTradeRange,0);
