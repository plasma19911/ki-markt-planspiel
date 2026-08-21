import assert from 'node:assert/strict';
import fs from 'node:fs';

const entry=fs.readFileSync(new URL('../src/compact-portfolio-v11.js',import.meta.url),'utf8');
const changelog=fs.readFileSync(new URL('../public/ui-v283-fix.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('../public/changelog-v292.js',import.meta.url),'utf8');
const publicFiles=fs.readdirSync(new URL('../public/',import.meta.url));

const required=['V27.9','V28.0','V28.1','V28.2','V28.3','V28.4','V28.5','V28.6','V28.7','V28.8','V28.9','V29.0','V29.1','V29.2','V29.3','V29.4','V29.5','V29.6'];
for(const version of required)assert.ok(changelog.includes(version),`${version} fehlt im sichtbaren Änderungsverlauf`);

const productionVersion=entry.match(/V(\d+\.\d+)/)?.[1];
assert.ok(productionVersion,'Produktionsversion konnte nicht aus compact-portfolio-v11.js gelesen werden');
assert.ok(changelog.includes(`V${productionVersion}`),`Produktionsversion V${productionVersion} fehlt im sichtbaren Änderungsverlauf`);

const uiVersions=publicFiles.map(name=>name.match(/^v(\d{3})-live-ui\.js$/i)?.[1]).filter(Boolean).map(v=>`V${v.slice(0,2)}.${v.slice(2)}`);
for(const version of uiVersions)assert.ok(changelog.includes(version),`${version} aus einer Live-UI-Datei fehlt im sichtbaren Änderungsverlauf`);

assert.ok(changelog.includes('8.523 von 8.523 Aktien'),'V28.8 muss den bestätigten C#-Vollscan beschreiben');
assert.ok(changelog.includes('PC-Agent 2.2.0'),'PC-Agent-Update 2.2.0 fehlt im sichtbaren Änderungsverlauf');
assert.ok(changelog.includes('Score-Hysterese'),'V28.9 muss die historische Hysterese dokumentieren');
assert.ok(changelog.includes('50–52 beobachten'),'V29.x muss die historische Beobachtungszone dokumentieren');
assert.ok(changelog.includes('53–55 Scout'),'V29.x muss den historischen Scout ab 53 dokumentieren');
assert.ok(changelog.includes('56–57 Mikro'),'V29.x muss den historischen Mikro-Einstieg dokumentieren');
assert.ok(changelog.includes('58–61 früher Einstieg'),'V29.x muss den historischen frühen Einstieg dokumentieren');
assert.ok(changelog.includes('62–67 regulärer Kauf'),'V29.1 muss regulären Kauf 62–67 dokumentieren');
assert.ok(changelog.includes('62+ stark halten'),'V29.1 muss starke Haltezone dokumentieren');
assert.ok(changelog.includes('46–49 Verkauf beobachten'),'V29.1 muss Sell-Watch-Zone dokumentieren');
assert.ok(changelog.includes('bis 45 nur bei bestätigter Schwäche verkaufen'),'V29.1 muss bestätigten Score-Exit dokumentieren');
assert.ok(changelog.includes('bis 32 dringender Score-Exit'),'V29.1 muss dringenden Score-Exit dokumentieren');
assert.ok(changelog.includes('mindestens 62'),'V29.1 muss Rotation ab regulärer Kaufzone dokumentieren');
assert.ok(changelog.includes('70–75'),'V29.1 muss Gewinnsicherung bei noch hohem Haltescore dokumentieren');
assert.ok(changelog.includes('Alte weiche V28.x-Schwellen'),'V29.1 muss das Überschreiben alter weicher Schwellen dokumentieren');
assert.ok(changelog.includes('ersten 1.000 Aktien'),'V29.2 muss den behobenen 1.000er-Cut dokumentieren');
assert.ok(changelog.includes('Top 400 → Deep 240 → Final 60'),'V29.2 muss die neue Scanner-Pipeline dokumentieren');
assert.ok(changelog.includes('PC-Deep-Score'),'V29.2 muss die sichtbare PC-Score-Fallbackanzeige dokumentieren');
assert.ok(changelog.includes('ab 56 = SOFORT BUY'),'V29.3 muss die verbindliche Sofortkaufgrenze dokumentieren');
assert.ok(changelog.includes('Teil-/Legacy-Score'),'V29.4 muss den behobenen Depot-Score-Skalenwechsel dokumentieren');
assert.ok(changelog.includes('mindestens 10 Punkte'),'V29.4 muss den +10 Score-Exit dokumentieren');
assert.ok(changelog.includes('mindestens 15 Punkte'),'V29.4 muss den -15 Score-Exit dokumentieren');
assert.ok(changelog.includes('einzige normale SELL-Regel'),'V29.5 muss die finale SELL-Autorität dokumentieren');
assert.ok(changelog.includes('verstrichener Zeit'),'V29.6 muss zeitabhängige Score-Glättung dokumentieren');
assert.ok(changelog.includes('einmal unter 56 zurücksetzen'),'V29.6 muss den Reentry-Reset gegen Gebühren-Churn dokumentieren');
assert.ok(changelog.includes('Chart seit dem Kauf tatsächlich positiv'),'V29.6 muss +10 nur bei positivem Chart dokumentieren');
assert.ok(!changelog.includes('pro Minute ein Viertel des Masters'),'veraltete V28.8-PowerShell-Beschreibung ist noch im sichtbaren Änderungsverlauf');

console.log(JSON.stringify({ok:true,productionVersion:`V${productionVersion}`,requiredVersions:required,uiVersions,pcAgent:'2.2.0-prepared',scorePipeline:'V29.6 immediate-buy-56 + time/quality score + chart-aware +10/-15 exits + reentry reset'},null,2));
