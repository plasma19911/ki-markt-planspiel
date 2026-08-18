import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CORE_ETFS,LEVERAGED_ETFS,ZERO_ETF_MASTER_COUNT} from '../src/constants.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const exists=p=>fs.existsSync(new URL(`../${p}`,import.meta.url));
const index=read('src/index.js'),v7=read('src/compact-portfolio-v7.js'),workflow=read('.github/workflows/refresh-universe.yml'),ui=read('public/index.html'),fees=read('src/zero-fee-model.js');

assert.equal(CORE_ETFS.length,0,'CORE_ETFS muss leer sein');
assert.equal(LEVERAGED_ETFS.length,0,'LEVERAGED_ETFS muss leer sein');
assert.equal(ZERO_ETF_MASTER_COUNT,0,'ETF-Masterpool muss deaktiviert sein');
assert.equal(exists('src/generated-zero-etfs.js'),false,'Generierter ETF-Master darf im Aktien-only-Build nicht existieren');
assert.equal(exists('scripts/refresh_etfs.py'),false,'ETF-Refresh darf im Aktien-only-Build nicht existieren');
assert.match(index,/includeEtfs:false/,'Produktionsstart muss ETFs explizit deaktivieren');
assert.doesNotMatch(index,/includeEtfs:true/,'Produktionsstart darf ETFs nirgends aktivieren');
assert.match(v7,/class StocksOnlyAiGuard/,'Produktionswrapper braucht einen Aktien-only AI-Guard');
assert.match(v7,/ensureStocksOnlyState/,'Persistenter Zustand muss auf Aktien-only migriert/gehalten werden');
assert.match(v7,/FULL-CASH-POLICY/,'Produktionsprompt muss die 100%-Cash-Policy enthalten');
assert.match(v7,/OUTER-FULL-CASH/,'Äußerste Entscheidungsstufe muss die 100%-Cash-Policy erzwingen');
assert.match(v7,/strategicCashReservePct:0/,'Strategische Cashreserve muss 0% sein');
assert.match(v7,/return `\$\{prefix\}\$\{policy\}\$\{p\.marker\}\$\{JSON\.stringify\(candidates\)\}\$\{p\.heldMarker\}\$\{JSON\.stringify\(held\)\}`/,'Policy muss VOR Kandidaten= stehen und Gehalten= muss als reines JSON am Nachrichtenende bleiben');
assert.doesNotMatch(v7,/JSON\.stringify\(held\)[^`]*AKTIEN-ONLY/,'Hinter Gehalten-JSON darf niemals Policy-Text angehängt werden');
assert.match(fees,/stock-full-cash/,'ZERO-Fillmodell muss auf vollständige Cash-Auslastung versioniert sein');
assert.match(fees,/MIXED_FULL_CASH/,'Aktien-Bruchstückfill muss zur Cash-Auslastung aktiv sein');
assert.doesNotMatch(workflow,/refresh_etfs/,'Universe-Workflow darf ETF-Refresh nicht mehr aufrufen');
assert.match(workflow,/stock master pool/i);
assert.match(ui,/Nur Aktien/i,'Live-UI muss Aktien-only sichtbar machen');
assert.match(ui,/ETFs und Hebelprodukte sind ausgeschlossen/,'UI muss den Ausschluss eindeutig erklären');

console.log(JSON.stringify({ok:true,stocksOnly:true,fullCashPolicy:true,parserInvariant:true,coreEtfs:CORE_ETFS.length,leveragedEtfs:LEVERAGED_ETFS.length,etfMasterCount:ZERO_ETF_MASTER_COUNT},null,2));
