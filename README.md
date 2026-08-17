# KI Markt-Planspiel · Cloudflare + GitHub

Reines Paper-Trading / Planspiel. Keine echten Orders und aktuell kein Broker-Zugang.

## Was diese Version macht

- läuft serverseitig auf Cloudflare, auch wenn PC, Handy und Browser aus sind
- Cron Trigger jede Minute (`* * * * *`)
- SQLite Durable Object speichert Depot, Positionen, Verlauf, Lernwerte und Entscheidungen dauerhaft
- Zieldepot für eine spätere praktische Umsetzung: **finanzen.net ZERO / gettex**
- tägliches, branchenunabhängiges Aktienuniversum mit bis zu **3.000 liquiden Unternehmen**
- großer Aktienpool wird in Cloudflare-Free-tauglichen Minuten-Slices rotiert statt jede Minute komplett abgefragt
- Tech und Rüstung sind Zusatzbereiche, aber **kein Hauptfilter**
- normale europäische UCITS-ETFs werden mitgescannt; keine Hebel-/Inverse-ETFs
- Vanguard FTSE All-World UCITS ETF (A2PKXG / VWCE) und iShares Nasdaq-100 UCITS ETF (A0F5UF / EXXT) sind im ETF-Kern enthalten
- US-domiciled ETFs wie SPY/QQQ dienen nur als Markt-/Makro-Proxys, nicht als kaufbare ETF-Kandidaten
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
- eigener 2026-Tab: theoretischer perfekter Rückblick gegen kausalen Walk-Forward
- mobile Web-App mit Icon / Manifest
- Browser-Statuscache reduziert unnötige Dashboard-Anfragen; Hintergrundtabs pollen nicht dauerhaft
- kein Marktdaten-API-Key erforderlich

## ZERO / gettex

Die App ist auf Werte ausgerichtet, die später praktisch über finanzen.net ZERO / gettex umsetzbar sein sollen. Sehr kleine, extrem illiquide oder exotische Notierungen werden bewusst ausgesiebt.

Wichtig: Die öffentliche ZERO-Produktliste ist dynamisch und JavaScript-basiert. Das Repository behauptet deshalb **nicht**, den Brokerkatalog dauerhaft 1:1 zu spiegeln. Vor einer späteren echten Order muss die konkrete WKN/ISIN bei ZERO erneut auf Handelbarkeit geprüft werden.

Das Kostenmodell ist bewusst konservativ: Kleinst-/Bruchstückorders werden mit 1 € Zuschlag plus Slippage/Spread behandelt. Bei echten Orders ab 500 € kann die reine Ordergebühr bei ZERO 0 € sein; Marktspread und Ausführung bleiben trotzdem relevant.

## Cloudflare Free

Der Minuten-Cron bedeutet 1.440 geplante Läufe pro Tag. Der breite Aktienpool wird deshalb rotierend gescannt, damit ein einzelner Worker-Aufruf nicht mit Tausenden externen Kurs-/News-Abfragen überladen wird. Die KI hat zusätzlich Cooldowns und Fehler-Fallbacks; bei KI-Limits werden keine erfundenen Ersatzentscheidungen erzeugt.

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

## Deploy

```bash
npm install
npm run deploy
```

Für den vorgesehenen Betrieb ist die direkte Cloudflare-GitHub-Integration einfacher: Jeder Push auf `main` wird automatisch neu deployed, sofern das Projekt in Cloudflare entsprechend mit diesem Repository verbunden ist.
