#!/usr/bin/env python3
from __future__ import annotations
import json
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
import exchange_calendars as xcals

OUT = Path(__file__).resolve().parents[1] / "public" / "market-calendar.json"
CODES = {
    "XNYS": ["XNYS"], "XETR": ["XETR", "XFRA"], "XPAR": ["XPAR"], "XAMS": ["XAMS"],
    "XSWX": ["XSWX"], "XLON": ["XLON"], "XSTO": ["XSTO"], "XOSL": ["XOSL"],
    "XIST": ["XIST"], "XTKS": ["XTKS"], "XKRX": ["XKRX"], "XTAI": ["XTAI"],
    "XHKG": ["XHKG"], "XSHG": ["XSHG"], "XNSE": ["XNSE", "XBOM"], "XASX": ["XASX"],
    "XTSE": ["XTSE"], "BVMF": ["BVMF"], "XJSE": ["XJSE"]
}

def get_calendar(candidates):
    for name in candidates:
        try:
            return xcals.get_calendar(name)
        except Exception:
            pass
    return None

def main():
    start = date.today() - timedelta(days=10)
    end = date.today() + timedelta(days=70)
    exchanges = {}
    skipped = []
    for code, aliases in CODES.items():
        cal = get_calendar(aliases)
        if cal is None:
            skipped.append(code)
            continue
        rows = {}
        try:
            sessions = cal.sessions_in_range(str(start), str(end))
            schedule = cal.schedule.loc[sessions]
            for _, row in schedule.iterrows():
                local_open = row["open"].tz_convert(cal.tz)
                local_close = row["close"].tz_convert(cal.tz)
                key = local_open.strftime("%Y-%m-%d")
                rows[key] = {"open": local_open.strftime("%H:%M"), "close": local_close.strftime("%H:%M")}
            d = start
            while d <= end:
                if d.weekday() < 5 and d.isoformat() not in rows:
                    rows[d.isoformat()] = {"closed": True}
                d += timedelta(days=1)
            exchanges[code] = rows
        except Exception as exc:
            skipped.append(f"{code}: {exc}")
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "exchange_calendars generated sessions; worker falls back to weekday hours where unavailable",
        "range": {"from": start.isoformat(), "to": end.isoformat()},
        "exchanges": exchanges,
        "skipped": skipped,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(exchanges)} exchange calendars to {OUT}; skipped={skipped}")

if __name__ == "__main__":
    main()
