// Free-tier runtime gate for the actual target venue: finanzen.net ZERO via gettex.
// Official gettex stock hours in 2026: Mon-Fri 07:30-23:00 Europe/Berlin.
// The 2026 closed dates below mirror the official gettex trading calendar.
const TZ='Europe/Berlin';
const OPEN_MINUTE=7*60+30;
const CLOSE_MINUTE=23*60;
const PREOPEN_MINUTES=5;
const CLOSED_2026=new Set(['2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-24','2026-12-25','2026-12-31']);

function parts(date){
 const p=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),o={};
 for(const x of p)o[x.type]=x.value;
 return{ymd:`${o.year}-${o.month}-${o.day}`,weekday:o.weekday,minute:Number(o.hour)*60+Number(o.minute),hour:Number(o.hour),min:Number(o.minute)};
}
function tradingDay(p){return !['Sat','Sun'].includes(p.weekday)&&!CLOSED_2026.has(p.ymd)}

export function gettexSessionState(date=new Date()){
 const p=parts(date),isTradingDay=tradingDay(p),preopenStart=OPEN_MINUTE-PREOPEN_MINUTES;
 const preopen=isTradingDay&&p.minute>=preopenStart&&p.minute<OPEN_MINUTE;
 const open=isTradingDay&&p.minute>=OPEN_MINUTE&&p.minute<CLOSE_MINUTE;
 let phase='CLOSED';if(preopen)phase='PREOPEN';else if(open)phase='OPEN';else if(!isTradingDay)phase='NON_TRADING_DAY';
 return{timezone:TZ,localDate:p.ymd,localMinute:p.minute,phase,open,preopen,isTradingDay,prepareNow:preopen&&p.minute===preopenStart,openLocal:'07:30',closeLocal:'23:00',preopenLocal:'07:25',closed2026:CLOSED_2026.has(p.ymd)};
}

export function shouldRunScheduledScan(date=new Date()){
 const s=gettexSessionState(date);return s.open;
}
export function shouldRunPreopenPrepare(date=new Date()){
 const s=gettexSessionState(date);return s.prepareNow;
}
