# Vorbereitung: finanzen.net ZERO / Handy-Freigabe

Stand: 17.08.2026

## Ziel

Die App bleibt heute PAPER TRADING. Parallel erzeugt sie kurzlebige BUY/SELL-Vorschlaege fuer eine spaetere Echtgeld-Anbindung. Ein Nutzer kann einen Vorschlag am Handy bestaetigen oder ablehnen. Eine lokale Bestaetigung ist **noch keine Brokerorder**.

## ZERO-Abbildung im Planspiel

`compact-portfolio-v7.js` legt ueber die bestehende V6-Sicherheits-/Freigabeschicht ein zentrales ZERO-Ausfuehrungsmodell.

### Brokergebuehren

Die Brokergebuehr wird nicht mehr pauschal mit 1 EUR pro Kauf/Verkauf gerechnet:

- normale Ganzstueck-Wertpapierorder ab 500 EUR: 0 EUR Brokergebuehr
- normale Ganzstueck-Wertpapierorder unter 500 EUR: 1 EUR Mindermengenzuschlag
- Aktien-Bruchstueckauftrag: 1 EUR Bruchstueck-Zuschlag; kein zusaetzlicher Mindermengenzuschlag auf diesen Bruchstueckauftrag
- Auftrag aus ganzen Aktien plus Bruchstueck wird wie bei ZERO als Ganzstueck- und Bruchstueckkomponente behandelt
- normale ETF-Boersenorders werden im Planspiel als ganze Stuecke modelliert; nicht investierbares Restcash bleibt Cash
- marktueblicher Spread/Preisausfuehrung ist **separat** von der Brokergebuehr und kann erst mit aktuellen gettex Bid/Ask-Daten exakt bestimmt werden

Die zentrale Regel liegt in `src/zero-fee-model.js`. Regressionstest: `scripts/smoke-zero-fees.mjs`.

### Aktien- und ETF-Katalog

ZERO nennt aktuell mehr als 8.500 Aktien und mehr als 2.000 ETFs. gettex nennt rund 8.600 Aktien. Deshalb wurde der Master-Kandidatenpool auf diese Groessenordnung erweitert:

- Aktien-Refresh Ziel: 8.600 verschiedene Kandidaten
- ETF-Refresh Ziel: bis zu 2.200 normale Kandidaten
- die Live-Abfragen bleiben rotierend, damit Cloudflare nicht alle Werte gleichzeitig abrufen muss
- jeder Kandidat ist nur `brokerCatalogCandidate`; `brokerVerified` bleibt false, solange kein offizieller ZERO-/Partner-Connector die konkrete Handelbarkeit bestaetigt hat

Die oeffentlichen ZERO-Produktlisten sind JavaScript-dynamisch; eine stabile oeffentlich dokumentierte Katalog-API ist derzeit nicht vorhanden. Daher wird **nicht** behauptet, dass der gespeicherte Masterpool eine 1:1-Kopie des ZERO-Katalogs ist. Vor jeder spaeteren Echtgeldorder ist die Broker-Verifikation Pflicht.

## Sicherheitsmodell

1. Die Trading-Engine erstellt nach allen technischen Guards einen BUY/SELL-Vorschlag.
2. `compact-portfolio-v6.js` legt ihn fuer maximal 120 Sekunden in `state/order-approvals-v1` ab; V7 veraendert daran nichts.
3. Die Freigabe-Endpunkte sind fail-closed. Ohne `ORDER_APPROVAL_MODE=enabled` plus Cloudflare Access funktionieren sie nicht.
4. Cloudflare Access JWT wird im Worker selbst gegen die Access-JWKS, Issuer und AUD verifiziert.
5. Optional kann `CF_ACCESS_APPROVER_EMAIL` die Freigabe auf genau eine Access-Identitaet begrenzen.
6. Nach `Bestaetigen` lautet der Status nur `APPROVED_LOCAL`. `brokerSent=false` bleibt hart gesetzt.
7. Ein spaeterer Broker-Handoff muss Instrument/ISIN, ZERO/gettex-Handelbarkeit, Brokerkurs, Bid/Ask/Spread, FX, Ordertyp, endgueltige ZERO-Gebuehr, Positionsgroesse, Cash und Ablaufzeit erneut pruefen.
8. Ohne offiziellen Connector wird nichts an finanzen.net ZERO gesendet.

## Cloudflare Access spaeter aktivieren

Empfohlen ist, die gesamte Echtgeld-/Freigabe-App als Cloudflare-Access-Anwendung zu schuetzen. Mindestens muessen die Pfade `/api/order-approvals*` geschuetzt sein.

Worker-Konfiguration / Umgebungsvariablen:

- `ORDER_APPROVAL_MODE=enabled`
- `CF_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`
- `CF_ACCESS_AUD=<Application Audience AUD>`
- optional `CF_ACCESS_APPROVER_EMAIL=<deine Access-E-Mail>`

ZERO-Passwort, Secure-TAN-Aktivierungscode oder TAN-Geheimnisse gehoeren **nie** in GitHub, Worker-Variablen, LocalStorage oder unsere Datenbank.

## Aktuell dokumentierte ZERO-Wege

ZERO dokumentiert direkte Integrationen mit stock3 und TraderFox. Im finanzen.net/tradespot-Umfeld kann ein ZERO-Depot ebenfalls verbunden und nach Broker-Login/Autorisierung fuer Orders verwendet werden. Diese vorhandenen Integrationen sind keine automatisch frei nutzbare API fuer unsere eigene App.

Die ZERO Secure-TAN-App autorisiert insbesondere die Handelssession. Laut ZERO muss der Nutzer nach der TAN-Freigabe wieder in das Depot zurueckkehren und die Order dort verbindlich aufgeben. Deshalb wird keine TAN- oder Browser-Automation nachgebaut.

## Was wir ausdruecklich nicht tun

- kein automatisierter Login in die ZERO-Webseite
- kein Scraping des eingeloggten Depots
- kein Browser-Bot, der Kauf/Verkauf klickt
- keine Speicherung von ZERO-Passwort oder TAN-Geheimnissen
- kein Umgehen von Secure TAN, Session-Freigabe oder Broker-Bestaetigung
- kein automatisierter Hochfrequenzhandel ueber die ZERO-Webseite
- keine Behauptung einer exakten Brokerhandelbarkeit nur aufgrund eines Yahoo-/gettex-Kandidaten

## Rechtlicher Rahmen (technische Einordnung, keine Rechtsberatung)

Fuer die private Verwaltung des eigenen Vermoegens ist die Situation wesentlich anders als bei einer App, die fuer Dritte Anlageberatung, Vermittlung, Portfolioverwaltung oder Orderausfuehrung anbietet. Die MiFID-II-Systematik nimmt Personen, die nur eigenes Vermoegen verwalten, grundsaetzlich aus dem Anwendungsbereich, vorbehaltlich besonderer Faelle wie Market Making, direkter Handelsplatzteilnahme oder Hochfrequenzhandel. Das deutsche WpIG erfasst insbesondere gewerbsmaessige Wertpapierdienstleistungen fuer andere und bestimmte Formen von Eigenhandel.

Die geplante persoenliche App bleibt deshalb technisch auf den eigenen Nutzer, eigenes Depot und menschliche Endfreigabe ausgelegt. Vor einer Vermarktung fuer andere Personen, Fremddepots, automatischer Portfolioverwaltung fuer Dritte oder einer direkten Handelsplatzanbindung ist eine gesonderte aufsichtsrechtliche Pruefung erforderlich.

Unabhaengig davon gelten die Vertragsbedingungen des Brokers. ZERO weist in seiner Fair Use Policy ausdruecklich darauf hin, dass Programme, die auf die Website zugreifen, um automatisierten oder hochfrequenten Handel zu betreiben, unerwuenscht sind und bis zur Kuendigung der Kundenbeziehung fuehren koennen. Deshalb darf ein spaeterer Connector nur eine von ZERO bzw. einem Partner ausdruecklich erlaubte technische Schnittstelle verwenden.

## Naechster Schritt fuer eine echte Verbindung

Erst wenn ZERO, stock3, TraderFox, tradespot oder ein anderer offiziell autorisierter Partner eine dokumentierte und fuer diesen Zweck erlaubte Schnittstelle bereitstellt, wird ein Adapter implementiert. Der Adapter bekommt nur bereits lokal bestaetigte, noch gueltige Order-Intents und muss vor Versand erneut validieren. Bis dahin bleibt `brokerConnector: NONE` und `brokerDispatchEnabled: false`.
