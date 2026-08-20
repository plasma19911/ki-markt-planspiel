import assert from 'node:assert/strict';
import fs from 'node:fs';

const entry=fs.readFileSync(new URL('../src/compact-portfolio-v11.js',import.meta.url),'utf8');
const changelog=fs.readFileSync(new URL('../public/ui-v283-fix.js',import.meta.url),'utf8');
const publicFiles=fs.readdirSync(new URL('../public/',import.meta.url));

const required=['V27.9','V28.0','V28.1','V28.2','V28.3','V28.4','V28.5','V28.6','V28.7','V28.8','V28.9','V29.0'];
for(const version of required)assert.ok(changelog.includes(version),`${version} fehlt im sichtbaren Änderungsverlauf`);

const productionVersion=entry.match(/V(\d+\.\d+)/)?.[1];
assert.ok(productionVersion,'Produktionsversion konnte nicht aus compact-portfolio-v11.js gelesen werden');
assert.ok(changelog.includes(`V${productionVersion}`),`Produktionsversion V${productionVersion} fehlt im sichtbaren Änderungsverlauf`);

const uiVersions=publicFiles.map(name=>name.match(/^v(\d{3})-live-ui\.js$/i)?.[1]).filter(Boolean).map(v=>`V${v.slice(0,2)}.${v.slice(2)}`);
for(const version of uiVersions)assert.ok(changelog.includes(version),`${version} aus einer Live-UI-Datei fehlt im sichtbaren Änderungsverlauf`);

assert.ok(changelog.includes('8.523 von 8.523 Aktien'),'V28.8 muss den bestätigten C#-Vollscan beschreiben');
assert.ok(changelog.includes('PC-Agent 2.2.0'),'PC-Agent-Update 2.2.0 fehlt im sichtbaren Änderungsverlauf');
assert.ok(changelog.includes('Score-Hysterese'),'V28.9 muss die getrennten Ein-/Ausstiegszonen dokumentieren');
assert.ok(changelog.includes('60–64'),'V29.0 muss den Scout-Einstieg ab 60 dokumentieren');
assert.ok(changelog.includes('70–75'),'V29.0 muss Gewinnsicherung bei noch hohem Haltescore dokumentieren');
assert.ok(changelog.includes('dynamischen Peak-Schutz'),'V29.0 dynamischer Gewinnschutz fehlt');
assert.ok(!changelog.includes('pro Minute ein Viertel des Masters'),'veraltete V28.8-PowerShell-Beschreibung ist noch im sichtbaren Änderungsverlauf');

console.log(JSON.stringify({ok:true,productionVersion:`V${productionVersion}`,requiredVersions:required,uiVersions,pcAgent:'2.2.0-prepared'},null,2));
