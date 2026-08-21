// Compatibility filename retained for older imports.
// Effective target broker is Trade Republic. Regular stock trading is modelled
// Monday-Friday 07:30-23:00 Europe/Berlin; instrument availability can still vary.
const TZ='Europe/Berlin';
const OPEN_MINUTE=7*60+30;
const CLOSE_MINUTE=23*60;
const PREOPEN_MINUTES=5;

function parts(date){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),o={};
 for(const x of p)o[x.type]=x.value;
 return{ymd:`${o.year}-${o.month}-${o.day}`,weekday:o.weekday,minute:Number(o.hour)*60+Number(o.minute)};
}
function tradingDay(p){return !['Sat','Sun'].includes(p.weekday)}

export function tradeRepublicSessionState(date=new Date()){
 const p=parts(date),isTradingDay=tradingDay(p),preopenStart=OPEN_MINUTE-PREOPEN_MINUTES;
 const preopen=isTradingDay&&p.minute>=preopenStart&&p.minute<OPEN_MINUTE;
 const open=isTradingDay&&p.minute>=OPEN_MINUTE&&p.minute<CLOSE_MINUTE;
 let phase='CLOSED';if(preopen)phase='PREOPEN';else if(open)phase='OPEN';else if(!isTradingDay)phase='NON_TRADING_DAY';
 return{broker:'Trade Republic',venue:'Bestpreis / Trade Republic execution',timezone:TZ,localDate:p.ymd,localMinute:p.minute,phase,open,preopen,isTradingDay,prepareNow:preopen&&p.minute===preopenStart,openLocal:'07:30',closeLocal:'23:00',preopenLocal:'07:25',instrumentAvailabilityMayVary:true};
}

// Compatibility export used by src/index.js.
export const gettexSessionState=tradeRepublicSessionState;
export function shouldRunScheduledScan(date=new Date()){return tradeRepublicSessionState(date).open;}
export function shouldRunPreopenPrepare(date=new Date()){return tradeRepublicSessionState(date).prepareNow;}
