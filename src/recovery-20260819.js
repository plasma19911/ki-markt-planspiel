// One-time recovery source from the last verified production health snapshot before
// the accidental 2026-08-19 22:32 Berlin restart. Self-guarding recovery run triggered.
// Removed after successful restore.
export const RECOVERY_20260819={
 config:{
  running:1,start_capital:10000,cash:8398.448297401768,currency:'EUR',risk_mode:'offensiv',
  include_etfs:0,include_leverage:0,ai_enabled:1,
  started_at:'2026-08-19T12:00:00.000Z',ends_at:'2026-08-26T12:00:00.000Z',
  last_scan:'2026-08-19T20:27:14.663Z',scan_count:385,last_error:null,scan_lock_until:0,
  universe_count:173,fee_fixed:0,fee_percent:0,slippage_percent:.10,total_fees:0,
  market_mode:'MARKET_AND_NEWS'
 },
 positions:[
  {
   symbol:'SCHO.CO',name:'Aktieselskabet Schouw & Co.',instrument_type:'EQUITY',theme:null,company_key:'AKTIESELS SCHOUW',
   invested:763.822576,entry_fee:1,entry_price:720.7199999999999,last_price:717,entry_fx:.1336,last_fx:.1336,currency:'DKK',
   opened_at:'2026-08-19T12:17:24.694Z',score:3.0024648905981177,signal_confidence:.7030064890598118,
   quote_sanity_last_price:717,quote_sanity_last_fx:.1336,zero_quantity:7.932671287461709,zero_whole_shares:7,zero_fractional_shares:.9326712874617087,zero_uses_fractional:true,
   zero_fee_model_version:'zero-securities-2026-08-v4-stock-full-cash',fx_basis_repaired_at:'2026-08-19T12:19:16.739Z',fx_basis_repair_reason:'FOREIGN_NATIVE_ENTRY_PRICE_WITH_ENTRY_FX_1',fx_basis_original_entry_fx:1,quote_sanity_repaired_at:'2026-08-19T12:19:16.739Z',quote_sanity_reason:'FOREIGN_FX_ENTRY_BASIS_REPAIRED'
  },
  {
   symbol:'LOGI-B.ST',name:'Logistea AB (publ)',instrument_type:'EQUITY',theme:null,company_key:'LOGISTEA AB PUBL',
   invested:534.375803,entry_fee:1,entry_price:13.17315984725952,last_price:13.359999656677246,entry_fx:.0901,last_fx:.0902,currency:'SEK',
   opened_at:'2026-08-19T12:23:25.923Z',score:4.7,signal_confidence:.63,zero_quantity:450.22751420134756,zero_whole_shares:450,zero_fractional_shares:.22751420134756017,zero_uses_fractional:true,
   zero_fee_model_version:'zero-securities-2026-08-v4-stock-full-cash',fx_basis_repaired_at:'2026-08-19T12:25:16.509Z',fx_basis_repair_reason:'FOREIGN_NATIVE_ENTRY_PRICE_WITH_ENTRY_FX_1',fx_basis_original_entry_fx:1,quote_sanity_last_price:13.359999656677246,quote_sanity_last_fx:.0902,quote_sanity_repaired_at:'2026-08-19T12:25:16.509Z',quote_sanity_reason:'FOREIGN_FX_ENTRY_BASIS_REPAIRED'
  }
 ],
 history:[{
  id:1,ts:'2026-08-19T20:27:14.663Z',end_ts:'2026-08-19T20:27:14.663Z',event_count:1,start_scan:385,end_scan:385,action:'HALTEN',symbol:'',name:'',instrument_type:'',amount:0,fee:0,trade_pnl:null,cash_before:8398.448297401768,cash_after:8398.448297401768,equity:9700.8849562844,total_pnl:-299.1150437155993,score:null,reason:'Depot nach versehentlichem Neustart aus dem letzten verifizierten Health-Snapshot wiederhergestellt. Der Tages-Replay/Lernspeicher blieb separat erhalten.'
 }],
 snapshots:[{id:1,ts:'2026-08-19T20:27:14.663Z',equity:9700.8849562844,cash:8398.448297401768}],
 candidates:[],newsRadar:[],sourceHealth:[],aiLog:[]
};
