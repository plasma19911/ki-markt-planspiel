export const DECISION_QUOTE_MAX_AGE_MINUTES=8;
export const POSITION_QUOTE_MAX_AGE_MINUTES=12;

const num=v=>Number.isFinite(Number(v))?Number(v):null;

export function quoteTimestampMs(row={}){
  for(const raw of [row.marketTimestamp,row.market_timestamp,row.quoteTimestamp,row.lastBarTimestamp]){
    const value=num(raw);if(value!==null&&value>0)return value<10_000_000_000?value*1000:value;
  }
  for(const raw of [row.quoteUpdatedAt,row.quote_updated_at,row.marketUpdatedAt,row.updated_at,row.updatedAt]){
    const value=Date.parse(String(raw||''));if(Number.isFinite(value))return value;
  }
  return null;
}

// Yahoo kann am Ende einer laufenden Kerze bereits einen Zeitstempel, aber noch
// keinen Schlusskurs liefern. Kurs und Zeit muessen deshalb aus demselben Index
// stammen; sonst sieht ein alter Kurs faelschlich wie ein neuer aus.
export function latestFiniteBar(timestamps=[],values=[]){
  const ts=Array.isArray(timestamps)?timestamps:[],vs=Array.isArray(values)?values:[];
  for(let i=Math.min(ts.length,vs.length)-1;i>=0;i--){
    const timestamp=num(ts[i]),value=num(vs[i]);
    if(timestamp!==null&&timestamp>0&&value!==null&&value>0)return{timestamp:timestamp<10_000_000_000?timestamp:timestamp/1000,value,index:i};
  }
  return null;
}

export function quoteAgeMinutes(row={},now=Date.now()){
  const timestamp=quoteTimestampMs(row);
  if(timestamp!==null)return Math.max(0,(now-timestamp)/60000);
  const explicit=num(row.quoteAgeMinutes??row.quote_age_minutes);
  return explicit===null?null:Math.max(0,explicit);
}

export function isFreshMarketQuote(row={},maxAgeMinutes=DECISION_QUOTE_MAX_AGE_MINUTES,now=Date.now()){
  if(!(num(row.price??row.last)>0)||row.fresh===false||row.fresh===0||row.stale===true)return false;
  const age=quoteAgeMinutes(row,now);
  return age!==null&&age<=maxAgeMinutes;
}

export function withMarketFreshness(row={},maxAgeMinutes=DECISION_QUOTE_MAX_AGE_MINUTES,now=Date.now()){
  const timestamp=quoteTimestampMs(row),age=quoteAgeMinutes(row,now),fresh=isFreshMarketQuote(row,maxAgeMinutes,now);
  return{...row,marketTimestamp:timestamp===null?null:Math.round(timestamp/1000),quoteAgeMinutes:age===null?null:+age.toFixed(2),quoteUpdatedAt:timestamp===null?null:new Date(timestamp).toISOString(),fresh,stale:!fresh};
}
