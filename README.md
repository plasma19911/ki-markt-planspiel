# KI Markt-Planspiel · Cloudflare + GitHub

Reines Paper-Trading / Planspiel. Keine echten Orders und kein Broker-Zugang.

## Was diese Version macht

- läuft auf Cloudflare, auch wenn PC und Handy aus sind
- Cron Trigger jede Minute (`* * * * *`)
- SQLite Durable Object speichert Depot, Positionen, Verlauf und Entscheidungen dauerhaft
- Top-500-Aktien-Universum wird täglich per GitHub Action nach Marktkapitalisierung aktualisiert
- zusätzlich normale ETFs und Hebel-/Inverse-ETFs
- grober Markt-Scan in Batches
- 1-Minuten-Tiefenanalyse nur für die stärksten Kandidaten und gehaltene Positionen
- EMA 9/21, RSI 14, 5-/20-Minuten-Momentum, Volumen, Tagesbewegung, News-Sentiment
- Cloudflare Workers AI als zusätzliche Entscheidungsstufe
- feste Risiko-Grenzen verhindern, dass die KI beliebige Depotgrößen einsetzt
- vollständige Geld- und Entscheidungs-History
- mobile Web-App mit Icon / Manifest
- kein Marktdaten-API-Key

## Marktdaten

Die kostenlose Version verwendet öffentliche, nicht offiziell garantierte Yahoo-Finance-Endpunkte. Sie können sich ändern, verzögert sein oder zeitweise blockieren. Das System führt bei Datenfehlern keine erfundenen Trades aus, sondern schreibt den Fehler in die History.

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

Für den vorgesehenen Betrieb ist die direkte Cloudflare-GitHub-Integration einfacher: Jeder Push auf `main` wird automatisch neu deployed.
