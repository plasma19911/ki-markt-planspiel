import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const wrapper=read('src/index-v18.js'),v4=read('src/compact-portfolio-v4.js');

for(const path of ['/api/start','/api/stop','/api/reset','/api/scan','/api/manual-trade','/api/migrate-from-old-sql','/api/runtime-trade-config','/api/runtime-trade-config/reset'])assert.ok(wrapper.includes(`'${path}'`),`${path} muss im Control-Guard stehen`);
assert.ok(wrapper.includes("'/api/order-approvals/'"),'Dynamische Freigabe-/Ablehnungs-Pfade müssen über ihr Präfix geschützt sein');
assert.match(wrapper,/GUARDED_PREFIXES\.some\(prefix=>url\.pathname\.startsWith\(prefix\)\)/,'Der Guard muss dynamische Pfade tatsächlich auswerten');
const destructive=wrapper.match(/const DESTRUCTIVE_PATHS=new Set\(\[([^\]]*)\]\)/)[1];
for(const path of ['/api/start','/api/reset','/api/migrate-from-old-sql'])assert.ok(destructive.includes(path),`${path} muss als destruktiv gelten`);
assert.match(wrapper,/function sameOriginBrowser\(request\)/,'Nur echte same-origin-Browseraufrufe dürfen ohne Bestätigungsheader laufen');
assert.match(wrapper,/controlConfirmationRequired/,'Nicht-destruktive CLI-Steuerung braucht eine 409-Antwort');
assert.match(v4,/live-compact-state-present/,'Legacy-Import muss vorhandenen Live-Zustand erkennen');
assert.ok(v4.indexOf('live-compact-state-present')<v4.indexOf('await super.migrateLegacySql()'),'Die Blockade muss vor dem Import greifen');
console.log(JSON.stringify({ok:true,guardedControlEndpoints:9,dynamicOrderApprovalGuard:true,legacyImportCannotOverwriteLiveState:true},null,2));
