import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CORE_ETFS,LEVERAGED_ETFS,ZERO_ETF_MASTER_COUNT} from '../src/constants.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const exists=p=>fs.existsSync(new URL(`../${p}`,import.meta.url));
const index=read('src/index.js'),indexCore=read('src/index-core.js'),v7=read('src/compact-portfolio-v7.js'),workflow=read('.github/workflows/refresh-universe.yml'),ui=read('public/index.html'),fees=read('src/zero-fee-model.js');

assert.equal(CORE_ETFS.length,0,'CORE_ETFS muss leer sein');
assert.equal(LEVERAGED_ETFS.length,0,'LEVERAGED_ETFS muss leer sein');
assert.equal(ZERO_ETF_MASTER_COUNT,0,'ETF-Masterpool muss deaktiviert sein');
assert.equal(exists('src/generated-zero-etfs.js'),false,'Generierter ETF-Master darf im Aktien-only-Build nicht existieren');
assert.equal(exists('scripts/refresh_etfs.py'),false,'ETF-Refresh darf im Aktien-only-Build nicht existieren');

// Der produktive HTTP-Wrapper delegiert /api/start an index-core.js. Die Aktien-only-
// Schalter müssen deshalb dort geprüft werden, nicht an einer veralteten Wrapper-Stelle.
assert.match(indexCore,/includeEtfs:false/,'Produktionsstart muss ETFs explizit deaktivieren');
assert.match(indexCore,/includeLeverage:false/,'Produktionsstart muss Hebelprodukte explizit deaktivieren');
assert.doesNotMatch(index+indexCore,/includeEtfs:true/,'Produktionspfad darf ETFs nirgends aktivieren');
assert.doesNotMatch(index+indexCore,/includeLeverage:true/,'Produktionspfad darf Hebelprodukte nirgends aktivieren');

assert.match(v7,/class StocksOnlyAiGuard/,'Produktionswrapper braucht einen Aktien-only AI-Guard');
assert.match(v7,/ensureStocksOnlyState/,'Persistenter Zustand muss auf Aktien-only migriert/gehalten werden');
assert.match(v7,/FULL-CASH-POLICY/,'Produktionsprompt muss die vorhandene Cash-Policy enthalten');
assert.match(v7,/OUTER-FULL-CASH/,'Äußerste Entscheidungsstufe muss die Cash-Policy enthalten');
assert.match(v7,/strategicCashReservePct:0/,'Strategische Cashreserve muss 0% sein');
assert.match(v7,/return `\$\{prefix\}\$\{policy\}\$\{p\.marker\}\$\{JSON\.stringify\(candidates\)\}\$\{p\.heldMarker\}\$\{JSON\.stringify\(held\)\}`/,'Policy muss VOR Kandidaten= stehen und Gehalten= muss als reines JSON am Nachrichtenende bleiben');
assert.doesNotMatch(v7,/JSON\.stringify\(held\)[^`]*AKTIEN-ONLY/,'Hinter Gehalten-JSON darf niemals Policy-Text angehängt werden');

// Aktuelles Ausführungsmodell: Trade Republic, reguläre Aktienorders als ganze Stücke.
assert.match(fees,/broker:'Trade Republic'/,'Gebührenmodell muss dem aktuellen Trade-Republic-Paper-Broker entsprechen');
assert.match(fees,/standardOrderFeeEur:1/,'Reguläre Aktienorder muss mit 1 EUR Abwicklungspauschale modelliert sein');
assert.match(fees,/fractionalExecution:'disabled/i,'Produktionsmodell darf keine erfundene Bruchstück-Ausführung voraussetzen');
assert.match(fees,/ETFs, Derivate und Krypto sind im Planspiel ausgeschlossen/,'Gebührenmodell muss den Aktien-only-Umfang dokumentieren');

// Universe-Erneuerung muss weiterhin ausschließlich den verifizierten Trade-Republic-Aktienmaster aktualisieren.
assert.doesNotMatch(workflow,/refresh_etfs/,'Universe-Workflow darf ETF-Refresh nicht mehr aufrufen');
assert.match(workflow,/Refresh Trade Republic verified stock master/i,'Universe-Workflow muss den verifizierten Trade-Republic-Aktienmaster aktualisieren');
assert.match(workflow,/scripts\/refresh_universe\.py/,'Universe-Workflow muss den aktuellen Aktien-Refresh ausführen');
assert.match(workflow,/public\/universe\.json/,'Universe-Workflow muss den produktiven Aktienmaster persistieren');

// Die aktuelle UI benutzt keine alte Badge-Wortwahl "Nur Aktien" mehr. Ihre sichtbaren
// Kernflächen sind aber eindeutig aktienbezogen; der harte Ausschluss von ETF/Hebel wird
// oben zusätzlich im produktiven Startpfad und Gebührenmodell geprüft.
assert.match(ui,/<th>Aktie<\/th>/i,'Kandidaten-UI muss Aktien als handelbares Instrument ausweisen');
assert.match(ui,/Wichtigste Aktien-News/i,'Live-News-UI muss aktienbezogen sein');
assert.match(ui,/Aktien einfach erklärt/i,'Analyse-UI muss aktienbezogen sein');

console.log(JSON.stringify({ok:true,stocksOnly:true,productionStartInCore:true,wholeShareBrokerModel:true,currentTradeRepublicUniverse:true,currentStockUi:true,parserInvariant:true,coreEtfs:CORE_ETFS.length,leveragedEtfs:LEVERAGED_ETFS.length,etfMasterCount:ZERO_ETF_MASTER_COUNT},null,2));
