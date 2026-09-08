# Broker-Einordnung: Trade Republic

Stand: 08.09.2026

Diese Datei beschrieb bis V31.7.33 finanzen.net ZERO / gettex. Das war seit der
Umstellung des Kostenmodells auf `trade-republic-securities-2026-08-v1` falsch
und hat zu Fehlschluessen ueber die im Planspiel gerechneten Gebuehren gefuehrt.
Zielbroker ist Trade Republic.

## Ziel

Die App bleibt PAPER TRADING. Es werden zu keinem Zeitpunkt echte Brokerorders
gesendet. Parallel erzeugt sie kurzlebige BUY/SELL-Vorschlaege, die ein Nutzer
lokal bestaetigen oder ablehnen kann. Eine lokale Bestaetigung ist **keine**
Brokerorder.

## Kostenmodell

Massgeblich ist `src/zero-fee-model.js`. Der Dateiname ist aus
Kompatibilitaetsgruenden geblieben, weil aeltere Schichten `ZERO_FEE_MODEL`
importieren; der Inhalt bildet Trade Republic ab. Regressionstest:
`scripts/smoke-zero-fees.mjs`.

- 1 EUR Fremdkostenpauschale je Order, **unabhaengig vom Ordervolumen**
- Kauf und Verkauf jeweils 1 EUR, ein Roundtrip kostet also 2 EUR
- kein Mindermengenzuschlag, keine Mindestordergroesse
- keine Bruchstueckzuschlaege; das Planspiel modelliert ausschliesslich ganze
  Stuecke
- nur Aktien; ETFs, Derivate und Krypto sind im Planspiel ausgeschlossen
- Spread und Preisausfuehrung sind **separat** von der Gebuehr und im Modell
  nicht in der Pauschale enthalten

Seit dem PFOF-Verbot zum 30.06.2026 routet Trade Republic Orders per
Bestpreis-Algorithmus an mehrere Boersen; die 1-EUR-Pauschale ist dabei der
Standardpreis. Wer den Handelsplatz gezielt aus rund 30 Boersen selbst waehlt,
zahlt stattdessen 2 EUR. Das Planspiel rechnet mit der Standardausfuehrung. Wer
regelmaessig den Handelsplatz selbst waehlt, muss `standardOrderFeeEur` auf 2
setzen.

Das Kostenmodell frueherer Fassungen (0 EUR ab 500 EUR Ordervolumen, 1 EUR
Mindermengenzuschlag darunter, 1 EUR Bruchstueckzuschlag) galt fuer ZERO und ist
nicht mehr gueltig.

## Aktien-Katalog

Der Master-Kandidatenpool ist auf liquide, bei Trade Republic praktisch
handelbare Aktien ausgerichtet. Jeder Kandidat ist nur
`brokerCatalogCandidate`; `brokerVerified` bleibt false, solange kein offizieller
Connector die konkrete Handelbarkeit bestaetigt hat. Das Repository behauptet
**nicht**, den Brokerkatalog 1:1 zu spiegeln.

## Warum es keine Anbindung gibt

Trade Republic bietet keine oeffentliche, dokumentierte Schnittstelle zum
Platzieren von Orders an. Es existiert schlicht nichts, wogegen ein Connector
implementiert werden koennte.

Nachgebaute Clients, die die Endpunkte der Mobil-App mitbenutzen, sind
ausdruecklich kein gangbarer Weg:

- sie verstossen gegen die Nutzungsbedingungen und koennen zur Kuendigung der
  Kundenbeziehung fuehren
- sie erfordern die Hinterlegung von Zugangsdaten, die echtes Geld bewegen
- bei einem Fehler traegt der Nutzer den Schaden allein

## Was wir ausdruecklich nicht tun

- kein automatisierter Login in die Trade-Republic-App oder -Webseite
- kein Scraping des eingeloggten Depots
- kein Browser-Bot, der Kauf/Verkauf klickt
- keine Speicherung von Zugangsdaten, PIN oder Geraetekopplung
- kein Umgehen von Freigabe- oder Bestaetigungsschritten
- kein automatisierter Handel ueber inoffizielle Endpunkte
- keine Behauptung einer exakten Brokerhandelbarkeit allein aufgrund eines
  Yahoo-Kandidaten

## Sicherheitsmodell der lokalen Freigabe

1. Die Trading-Engine erstellt nach allen technischen Guards einen BUY/SELL-Vorschlag.
2. `compact-portfolio-v6.js` legt ihn fuer maximal 120 Sekunden in
   `state/order-approvals-v1` ab.
3. Die Freigabe-Endpunkte sind fail-closed. Ohne `ORDER_APPROVAL_MODE=enabled`
   plus Cloudflare Access funktionieren sie nicht.
4. Cloudflare Access JWT wird im Worker gegen die Access-JWKS, Issuer und AUD
   verifiziert.
5. Optional begrenzt `CF_ACCESS_APPROVER_EMAIL` die Freigabe auf genau eine
   Access-Identitaet.
6. Nach `Bestaetigen` lautet der Status nur `APPROVED_LOCAL`. `brokerSent=false`
   bleibt hart gesetzt.
7. `brokerConnector: NONE` und `brokerDispatchEnabled: false` bleiben bestehen.

Worker-Konfiguration:

- `ORDER_APPROVAL_MODE=enabled`
- `CF_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`
- `CF_ACCESS_AUD=<Application Audience AUD>`
- optional `CF_ACCESS_APPROVER_EMAIL=<Access-E-Mail>`

Broker-Zugangsdaten jeder Art gehoeren **nie** in GitHub, Worker-Variablen,
LocalStorage oder die Datenbank.

## Benachrichtigungen

Push-Benachrichtigungen bei Kauf-/Verkaufssignalen sind **nicht geplant** —
weder ueber Telegram noch ueber Web Push oder einen anderen Kanal. Es existiert
folgerichtig kein Service Worker und keine Benachrichtigungslogik im Repository.

## Rechtlicher Rahmen (technische Einordnung, keine Rechtsberatung)

Fuer die private Verwaltung des eigenen Vermoegens ist die Situation wesentlich
anders als bei einer App, die fuer Dritte Anlageberatung, Vermittlung,
Portfolioverwaltung oder Orderausfuehrung anbietet. Die MiFID-II-Systematik nimmt
Personen, die nur eigenes Vermoegen verwalten, grundsaetzlich aus dem
Anwendungsbereich, vorbehaltlich besonderer Faelle wie Market Making, direkter
Handelsplatzteilnahme oder Hochfrequenzhandel. Das deutsche WpIG erfasst
insbesondere gewerbsmaessige Wertpapierdienstleistungen fuer andere und
bestimmte Formen von Eigenhandel.

Die App bleibt technisch auf den eigenen Nutzer, das eigene Depot und eine
menschliche Endfreigabe ausgelegt. Vor einer Vermarktung fuer andere Personen,
Fremddepots, automatischer Portfolioverwaltung fuer Dritte oder einer direkten
Handelsplatzanbindung ist eine gesonderte aufsichtsrechtliche Pruefung
erforderlich.

Unabhaengig davon gelten die Vertragsbedingungen des Brokers.

## Naechster Schritt fuer eine echte Verbindung

Erst wenn Trade Republic oder ein offiziell autorisierter Partner eine
dokumentierte und fuer diesen Zweck erlaubte Schnittstelle bereitstellt, wird ein
Adapter implementiert. Der Adapter bekaeme nur bereits lokal bestaetigte, noch
gueltige Order-Intents und muesste vor Versand erneut Instrument/ISIN,
Handelbarkeit, Brokerkurs, Bid/Ask/Spread, FX, Ordertyp, endgueltige Gebuehr,
Positionsgroesse, Cash und Ablaufzeit pruefen. Bis dahin bleibt der Stand
unveraendert: Paper Trading ohne Brokerversand.
