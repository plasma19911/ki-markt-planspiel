import {MarketPortfolio as BasePortfolio} from './compact-portfolio-v22-active-learning.js';

// Kleine produktive Statusschicht: die eigentliche V27.6-Handelslogik bleibt unveraendert,
// aber der HV-Kalender ist seit 20.08.2026 ein fester Tages-Snapshot.
export class MarketPortfolio extends BasePortfolio{
 async status(){
  const s=await super.status();
  if(s?.finalDecisionPolicy){
   s.finalDecisionPolicy={
    ...s.finalDecisionPolicy,
    agmCalendarDailyRefresh:true,
    agmScoreEvaluationOnceDaily:true,
    agmLiveReevaluationEveryScan:false,
    agmScoreLockedUntilNextDailyRefresh:true,
    agmDailyInputs:['ZAHLEN','CHART','NEWS'],
    rule:'V27.6 AGM-PREVIEW: HV-Termine und der 0-100-Score werden einmal taeglich als Tages-Snapshot aus Zahlen, 1-Jahres-Chart und frischen News aktualisiert. Der Score bleibt danach bis zum naechsten Tageslauf unveraendert. Aktuelle Markt-/Risikosignale duerfen einen Kauf weiterhin blockieren, veraendern aber den gespeicherten HV-Score nicht. Alle V27.5-Audit-Sicherungen bleiben aktiv.'
   };
  }
  if(s?.agmCalendarPolicy){
   s.agmCalendarPolicy={
    ...s.agmCalendarPolicy,
    refreshCadence:'daily',
    scoreEvaluationCadence:'daily',
    liveReevaluation:'none',
    scoreReevaluation:'once daily only',
    scoreLockedUntilNextDailyRefresh:true,
    dailyInputs:['ZAHLEN','CHART','NEWS']
   };
  }
  if(s?.agmCalendar){
   s.agmCalendar={...s.agmCalendar,refreshCadence:'daily',scoreEvaluationCadence:'daily',scoreReevaluation:'once daily only',scoreLockedUntilNextDailyRefresh:true};
  }
  return s;
 }
}
