import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CORE_ETFS,LEVERAGED_ETFS,ZERO_ETF_MASTER_COUNT} from '../src/constants.js';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const exists=p=>fs.existsSync(new URL(`../${p}`,import.meta.url));
const index=read('src/index.js'),v7=read('src/compact-portfolio-v7.js'),workflow=read('.github/workflows/refresh-universe.yml'),ui=read('public/index.html');

assert.equal(CORE_ETFS.length,0,'CORE_ETFS muss leer sein');
assert.equal(LEVERAGED_ETFS.length,0,'LEVERAGED_ETFS muss leer sein');
assert.equal(ZERO_ETF_MASTER_COUNT,0,'ETF-Masterpool muss deaktiviert sein');
assert.equal(exists('src/generated-zero-etfs.js'),false,'Generierter ETF-Master darf im Aktien-only-Build nicht existieren');
assert.equal(exists('scripts/refresh_etfs.py'),false,'ETF-Refresh darf im Aktien-only-Build nicht existieren');
assert.match(index,/includeEtfs:false/,'Produktionsstart muss ETFs explizit deaktivieren');
assert.doesNotMatch(index,/includeEtfs:true/,'Produktionsstart darf ETFs nirgends aktivieren');
assert.match(v7,/class StocksOnlyAiGuard/,'Produktionswrapper braucht einen Aktien-only AI-Guard');
assert.match(v7,/filterPlanResponseToStocks/,'KI-BUYs müssen auf aktuelle Aktienkandidaten gefiltert werden');
assert.match(v7,/ensureStocksOnlyState/,'Persistenter Zustand muss auf Aktien-only migriert/gehalten werden');
assert.doesNotMatch(workflow,/refresh_etfs/,'Universe-Workflow darf ETF-Refresh nicht mehr aufrufen');
assert.match(workflow,/stock master pool/i);
assert.match(ui,/Nur Aktien/i,'Live-UI muss Aktien-only sichtbar machen');
assert.match(ui,/ETFs und Hebelprodukte sind ausgeschlossen/,'UI muss den Ausschluss eindeutig erklären');

console.log(JSON.stringify({ok:true,stocksOnly:true,coreEtfs:CORE_ETFS.length,leveragedEtfs:LEVERAGED_ETFS.length,etfMasterCount:ZERO_ETF_MASTER_COUNT},null,2));
