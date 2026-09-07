// V31.7.30: Conservatively remove non-equity ticker-bar artefacts before
// resolving PC-Agent leader entries against the verified broker master.
const INDEX_SYMBOLS=new Set([
  'NDX','DJI','IXIC','NYA','XAX','SPX','SP500','VIX','RUT',
  'US2000USD','US500USD','US30USD','USTECUSD','DAX','GDAXI','MDAX',
  'TECDAX','UKX','FTSE','PX1','CAC40','SX5E','STOXX50','IBEX35','AEX',
  'SMI','FTSEMIB','NI225','JP225','HSI','KOSPI','KS11','AS51','XJO',
  'TSX','BVSP','SENSEX','NIFTY'
]);
const FUTURE_RE=/^[A-Z]{1,3}[12]$/;
const YIELD_RE=/^[A-Z]{2}\d{1,2}Y$/;
// Do not reject ordinary numeric Asian tickers. Only suffixless long mixed
// letter/digit tokens are treated as widget artefacts.
const JUNK_RE=/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{9,}$/;

export function isNonEquityEntry(symbol){
  const s=String(symbol||'').toUpperCase().trim();
  if(!s)return true;
  return INDEX_SYMBOLS.has(s)||s.startsWith('^')||FUTURE_RE.test(s)||YIELD_RE.test(s)||JUNK_RE.test(s);
}
