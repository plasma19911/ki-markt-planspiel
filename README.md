# KI Markt-Planspiel · Cloudflare + GitHub

Reines Paper-Trading / Planspiel. Keine echten Orders und aktuell kein Broker-Zugang.

## Was diese Version macht

- läuft serverseitig auf Cloudflare, auch wenn PC, Handy und Browser aus sind
- Cron Trigger alle 5 Minuten an Handelstagen (`*/5 5-22 * * 1-5`); der Windows-PC-Agent liefert die Minutenauflösung
- SQLite Durable Object speichert Depot, Positionen, Verlauf, Lernwerte und Entscheidungen dauerhaft
- Zieldepot für eine spätere praktische Umsetzung: **finanzen.net ZERO / gettex**
- tägliches, branchenunabhängiges Aktienuniversum mit bis zu **3.000 liquiden Unternehmen**
- großer Aktienpool wird in Cloudflare-Free-tauglichen Minuten-Slices rotiert statt jede Minute komplett abgefragt
- Tech und Rüstung sind Zusatzbereiche, aber **kein Hauptfilter**
- aktiver Produktionshandel ist derzeit auf normale Aktien begrenzt; Hebel-/Inverse-Produkte sind ausgeschlossen
- grober Markt-Scan in Batches, danach 1-Minuten-Tiefenanalyse nur für die stärksten Kandidaten
- EMA 9/21, RSI 14, 5-/20-Minuten-Momentum, Volumen, Tagesbewegung, FX und Ereignisrisiko
- frische Mehrquellen-News mit Clustering, Quellen-/Ereignislernen und Handelszeit-Alter
- Makro-/Geopolitik-Radar für Zinsen, Inflation, Wachstum, Energie, Krieg, Waffenruhe, Sanktionen und Handelskonflikte
- Unternehmens-Expositionsnetz: **Weltereignis → Wirkungskanal → konkrete Firma**
- PRE-NEWS / „noch nicht eingepreist“-Erkennung als öffentliche Schlussfolgerung, nie als Insiderwissen oder Gewinnwahrscheinlichkeit
- erklärbare Anlage-Dossiers mit Pro/Contra, Risiko, Überhitzung, Katalysator und Invalidierung
- Cloudflare Workers AI als zusätzliche Entscheidungsstufe; Markt-/News-Scanning läuft auch weiter, wenn die KI ihr Tageskontingent erreicht
- automatische BUY / SELL / HOLD-Entscheidungen ausschließlich mit Spielgeld
- vollständige Geld- und Entscheidungs-History; HALTEN-Phasen werden zusammengefasst
- Tages-Replay: erster heutiger Zwischenstand ab 22:05 Berliner Zeit; finaler Neuaufbau nach gettex-Schluss ab 23:05
- mobile Web-App mit Icon / Manifest
- Browser-Statuscache reduziert unnötige Dashboard-Anfragen; Hintergrundtabs pollen nicht dauerhaft
- kein Marktdaten-API-Key erforderlich

## ZERO / gettex

Die App ist auf Werte ausgerichtet, die später praktisch über finanzen.net ZERO / gettex umsetzbar sein sollen. Sehr kleine, extrem illiquide oder exotische Notierungen werden bewusst ausgesiebt.

Wichtig: Die öffentliche ZERO-Produktliste ist dynamisch und JavaScript-basiert. Das Repository behauptet deshalb **nicht**, den Brokerkatalog dauerhaft 1:1 zu spiegeln. Vor einer späteren echten Order muss die konkrete WKN/ISIN bei ZERO erneut auf Handelbarkeit geprüft werden.

Das Kostenmodell ist bewusst konservativ: Kleinst-/Bruchstückorders werden mit 1 € Zuschlag plus Slippage/Spread behandelt. Bei echten Orders ab 500 € kann die reine Ordergebühr bei ZERO 0 € sein; Marktspread und Ausführung bleiben trotzdem relevant.

## Cloudflare Free

Der 5-Minuten-Cron an Werktagen bedeutet rund 220 geplante Läufe pro Tag statt 1.440. Der breite Aktienpool wird deshalb rotierend gescannt, damit ein einzelner Worker-Aufruf nicht mit Tausenden externen Kurs-/News-Abfragen überladen wird. Die KI hat zusätzlich Cooldowns und Fehler-Fallbacks; bei KI-Limits werden keine erfundenen Ersatzentscheidungen erzeugt.

## Tages-Replay

Während des Handelstages sammelt das System Kandidaten und echte Paper-Trades in einem Tages-Capture. Ab 22:05 Berliner Zeit kann Cloudflare bereits einen **vorläufigen** Replay-Zwischenstand berechnen. Da gettex bis 23:00 läuft, wird ab 23:05 der heutige Report einmal aus dem finalen Capture neu aufgebaut. Dadurch gehen späte Trades und Kandidaten nicht verloren.

Der Windows-PC-Agent ist für den normalen Minuten-Scanner wichtig, aber der Tages-Replay hängt nicht mehr davon ab, dass der PC lokal einen separaten Replay berechnet.

## Marktdaten

Die kostenlose Version verwendet öffentliche, nicht offiziell garantierte Yahoo-Finance-Endpunkte und öffentliche News-/Makroquellen. Sie können sich ändern, verzögert sein oder zeitweise blockieren. Das System führt bei Datenfehlern keine erfundenen Trades aus, sondern schreibt den Fehler in die History.

## Onepager

Die kompakte Funktionsübersicht liegt unter `public/onepager.html` bzw. nach dem Deployment unter `/onepager.html`.

## GitHub + Cloudflare

Siehe `GITHUB-CLOUDFLARE-ANLEITUNG.html` oder `.txt`.

## Lokal testen

```bash
npm install
npm run dev
```

Dann `http://localhost:8787` öffnen.

Den Cron lokal testen:
`http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*`

## Secrets

Für den vorgesehenen Betrieb wird nur das Agent-Secret benötigt:

| Secret | Pflicht | Zweck |
| --- | --- | --- |
| `PC_AGENT_TOKEN` | ja | Authentifiziert den Windows-PC-Agent auf `/api/agent/*` |

Die normalen Steuerknöpfe der Weboberfläche (`Start`, `Stop`, `Scan`, `Reset`) verlangen **kein zusätzliches Passwort oder CONTROL_TOKEN**. Browser-Anfragen von fremden Origins werden weiterhin durch den Same-Origin-/CSRF-Guard abgewiesen.

## Deploy

```bash
npm install
npm run deploy
```

Für den vorgesehenen Betrieb ist die direkte Cloudflare-GitHub-Integration einfacher: Jeder Push auf `main` wird automatisch neu deployed, sofern das Projekt in Cloudflare entsprechend mit diesem Repository verbunden ist.
