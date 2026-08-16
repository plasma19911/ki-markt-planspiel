# KI Markt-Planspiel · Cloudflare + GitHub

Reines Paper-Trading / Planspiel. Keine echten Orders und kein Broker-Zugang.

## Was diese Version macht

- läuft auf Cloudflare, auch wenn PC und Handy aus sind
- Cron Trigger jede Minute (`* * * * *`)
- SQLite Durable Object speichert Depot, Positionen, Verlauf und Entscheidungen dauerhaft
- Top-500-Aktien-Universum wird täglich per GitHub Action nach **FX-normalisierter Marktkapitalisierung in USD** aktualisiert
- zusätzlich normale ETFs und Hebel-/Inverse-ETFs
- zusätzlich priorisierte Defense-/Tech-Aktien, die auch außerhalb der Top 500 relevant sein können
- grober Markt-Scan in Batches
- 1-Minuten-Tiefenanalyse nur für die stärksten Kandidaten und gehaltene Positionen
- EMA 9/21, RSI 14, 5-/20-Minuten-Momentum, Volumen, Tagesbewegung und News-Sentiment
- Cloudflare Workers AI als zusätzliche Entscheidungsstufe
- **Budget-only Live-Trading:** keine feste Positionszahl, keine Mindest-/Maximal-Haltedauer, keine Branchen-, Hebel-, Reserve- oder Cooldown-Grenze
- einzige harte Portfolio-Grenze ist das tatsächlich vorhandene Spielgeld inklusive Gebühren
- Gebühren und Ausführungspuffer/Slippage werden bei Kauf und Verkauf berücksichtigt
- vollständige Geld- und Entscheidungs-History
- HALTEN-Phasen werden zusammengefasst
- eigener Tab „Vorwoche · 100 €“ als Hindsight-Rückschau ohne feste Trade-/Positionszahl
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
