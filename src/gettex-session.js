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

function easterSundayUtc(year){
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
 return new Date(Date.UTC(year,month-1,day));
}
function isoUtc(d){return d.toISOString().slice(0,10)}
function venueHoliday(ymd){
 const year=Number(String(ymd).slice(0,4));if(!Number.isFinite(year))return false;
 const fixed=new Set([`${year}-01-01`,`${year}-05-01`,`${year}-12-24`,`${year}-12-25`,`${year}-12-26`,`${year}-12-31`]);
 if(fixed.has(ymd))return true;
 const easter=easterSundayUtc(year),goodFriday=new Date(easter.getTime()-2*86400000),easterMonday=new Date(easter.getTime()+86400000);
 return ymd===isoUtc(goodFriday)||ymd===isoUtc(easterMonday);
}
function tradingDay(p){return !['Sat','Sun'].includes(p.weekday)&&!venueHoliday(p.ymd)}

export function tradeRepublicSessionState(date=new Date()){
 const p=parts(date),isHoliday=venueHoliday(p.ymd),isTradingDay=tradingDay(p),preopenStart=OPEN_MINUTE-PREOPEN_MINUTES;
 const preopen=isTradingDay&&p.minute>=preopenStart&&p.minute<OPEN_MINUTE;
 const open=isTradingDay&&p.minute>=OPEN_MINUTE&&p.minute<CLOSE_MINUTE;
 let phase='CLOSED';if(preopen)phase='PREOPEN';else if(open)phase='OPEN';else if(!isTradingDay)phase='NON_TRADING_DAY';
 return{broker:'Trade Republic',venue:'Bestpreis / Trade Republic execution',timezone:TZ,localDate:p.ymd,localMinute:p.minute,phase,open,preopen,isTradingDay,isVenueHoliday:isHoliday,prepareNow:preopen&&p.minute===preopenStart,openLocal:'07:30',closeLocal:'23:00',preopenLocal:'07:25',instrumentAvailabilityMayVary:true};
}

// Compatibility export used by src/index.js.
export const gettexSessionState=tradeRepublicSessionState;
export function shouldRunScheduledScan(date=new Date()){return tradeRepublicSessionState(date).open;}
export function shouldRunPreopenPrepare(date=new Date()){return tradeRepublicSessionState(date).prepareNow;}
