import './quota-guard.js';
import './investment-ui.js';
import './news-learning-ui.js';
import './macro-ui.js';
import './exposure-ui.js';

const byId=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const fmt=(v,d=2)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const eur=v=>`${fmt(v)} €`;
const pct=v=>`${Number(v)>=0?'+':''}${fmt(v)}%`;
const date=v=>v?new Date(`${v}T12:00:00Z`).toLocaleDateString('de-DE'):'–';
