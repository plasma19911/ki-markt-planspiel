#!/usr/bin/env python3
from __future__ import annotations
import json
import math
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
import yfinance as yf

OUT = Path(__file__).resolve().parents[1] / "public" / "universe.json"
REGIONS = ["us","ca","gb","de","fr","ch","nl","se","dk","no","fi","it","es","be","at","jp","hk","cn","tw","kr","in","au","sg","br","mx","za"]
PRIMARY_EXCHANGES = {
    "us":{"NMS","NYQ","NGM","NCM","ASE","PCX"},"ca":{"TOR","VAN","NEO"},"gb":{"LSE"},"de":{"GER"},"fr":{"PAR"},"ch":{"EBS"},"nl":{"AMS"},"se":{"STO"},"dk":{"CPH"},"no":{"OSL"},"fi":{"HEL"},"it":{"MIL"},"es":{"MCE"},"be":{"BRU"},"at":{"VIE"},"jp":{"JPX","TYO"},"hk":{"HKG"},"cn":{"SHH","SHZ"},"tw":{"TAI","TWO"},"kr":{"KSC","KOE"},"in":{"NSI","BSE"},"au":{"ASX"},"sg":{"SES"},"br":{"SAO"},"mx":{"MEX"},"za":{"JNB"}
}
LISTING_WORDS={"INC","INCORPORATED","CORP","CORPORATION","CO","COMPANY","LTD","LIMITED","PLC","AG","SE","NV","SA","SPA","HOLDING","HOLDINGS","GROUP","ORD","ORDINARY","SHARE","SHARES","SHS","REGISTERED","REG","R","ADR","GDR","CDR","DRN","BDR","ED","HEDGED","HEDGE","ADS","UNIT","UNITS","STOCK","CLASS","CL","SERIES","THE","AND","A","B","C","D","I","II","III"}
GENERIC_WORDS={"UNITED","GLOBAL","INTERNATIONAL","TECHNOLOGY","TECHNOLOGIES","INDUSTRIES","INDUSTRIAL","ENERGY","SYSTEMS","FINANCIAL","SERVICES","HOLDING","HOLDINGS","GROUP","COMPANY","BANK","BANCO","BANKING"}
MAX_PLAUSIBLE_MCAP_USD=10_000_000_000_000.0
MIN_AVG_VOLUME=100.0


def scalar(v,default=0):
    if isinstance(v,dict):
        for k in ("raw","value"):
            if k in v:return scalar(v[k],default)
    try:return float(v)
    except Exception:return default

def one_region(region):
    q=yf.EquityQuery("and",[yf.EquityQuery("eq",["region",region]),yf.EquityQuery("gt",["intradaymarketcap",0])])
    return yf.screen(q,offset=0,size=120,sortField="intradaymarketcap",sortAsc=False).get("quotes",[])

def broad_fallback(offset):
    q=yf.EquityQuery("gt",["intradaymarketcap",0])
    return yf.screen(q,offset=offset,size=250,sortField="intradaymarketcap",sortAsc=False).get("quotes",[])

def last_fx(symbol):
    try:
        h=yf.Ticker(symbol).history(period="5d",interval="1d",auto_adjust=False)
        if h is None or h.empty or "Close" not in h:return 0.0
        s=h["Close"].dropna();return float(s.iloc[-1]) if len(s) else 0.0
    except Exception:return 0.0

def build_fx_map(currencies):
    fx={"USD":1.0};fail=[]
    for raw in sorted(set(c for c in currencies if c)):
        c=str(raw).strip()
        if not c or c=="USD":continue
        if c.lower() in ("gbp","gbp."):c="GBP"
        if c=="GBp":
            r=last_fx("GBPUSD=X")
            if r>0:fx[raw]=r/100.0
            else:fail.append(raw)
            continue
        d=last_fx(f"{c}USD=X")
        if d>0:fx[raw]=d;continue
        inv=last_fx(f"USD{c}=X")
        if inv>0:fx[raw]=1.0/inv;continue
        fail.append(raw)
    return fx,fail

def raw_tokens(name):
    text=unicodedata.normalize("NFKD",str(name or "")).encode("ascii","ignore").decode("ascii").upper();text=re.sub(r"[^A-Z0-9]+"," ",text)
    return [t for t in text.split() if t]

def meaningful_tokens(name):
    toks=[]
    for t in raw_tokens(name):
        if t in LISTING_WORDS or t in {"USD","EUR","CAD","CHF","GBP","BRL","MXN"} or len(t)<=1:continue
        s=t[:9] if len(t)>9 else t
        if not toks or toks[-1]!=s:toks.append(s)
    return toks

def company_key(name,symbol):
    toks=meaningful_tokens(name);return " ".join(toks[:7]) if toks else re.sub(r"[^A-Z0-9]","",symbol.split(".")[0])

def alpha_root(symbol):return re.sub(r"[^A-Z]","",str(symbol or "").split('.')[0].upper())

def representative_score(item):
    region=str(item.get("region") or "").lower();exchange=str(item.get("exchange") or "").upper();name=str(item.get("name") or "").upper();symbol=str(item.get("symbol") or "")
    primary=1 if exchange in PRIMARY_EXCHANGES.get(region,set()) else 0;depositary=1 if re.search(r"\b(ADR|GDR|CDR|DRN|BDR|ADS)\b",name) else 0;volume=max(0.0,scalar(item.get("avgVolume"),0))
    return(primary,-depositary,math.log10(volume+1.0),-len(symbol),item.get("marketCapUSD",0.0))

def fuzzy_same_company(a,b):
    ca,cb=float(a.get("marketCapUSD") or 0),float(b.get("marketCapUSD") or 0)
    if ca<=0 or cb<=0 or abs(ca-cb)/max(ca,cb)>0.04:return False
    ta=set(meaningful_tokens(a.get("name")));tb=set(meaningful_tokens(b.get("name")))
    # Vierbuchstabige Marken wie META/FORD/SONY muessen ebenfalls Cross-Listings erkennen.
    distinct_a={x for x in ta if x not in GENERIC_WORDS and len(x)>=4};distinct_b={x for x in tb if x not in GENERIC_WORDS and len(x)>=4}
    if distinct_a & distinct_b:return True
    ra,rb=alpha_root(a.get("symbol")),alpha_root(b.get("symbol"));common=0
    for x,y in zip(ra,rb):
        if x!=y:break
        common+=1
    if common>=4:return True
    union=ta|tb;inter=ta&tb;j=len(inter)/len(union) if union else 0
    return common>=3 and j>=0.20

def second_pass_dedupe(items):
    rows=sorted(items,key=lambda x:float(x.get("marketCapUSD") or 0),reverse=True);out=[];collapsed=0
    for item in rows:
        match=None
        for old in reversed(out[-100:]):
            oc=float(old.get("marketCapUSD") or 0);ic=float(item.get("marketCapUSD") or 0)
            if oc and ic and abs(oc-ic)/max(oc,ic)>0.04:continue
            if fuzzy_same_company(item,old):match=old;break
        if match is None:out.append(item)
        else:
            collapsed+=1
            if representative_score(item)>representative_score(match):out[out.index(match)]=item
    return out,collapsed

def main():
    rows=[];failures=[]
    for region in REGIONS:
        try:rows.extend(one_region(region))
        except Exception as e:failures.append(f"{region}: {e}")
    for off in (0,250,500,750,1000):
        try:rows.extend(broad_fallback(off))
        except Exception as e:failures.append(f"broad-{off}: {e}")

    raw_items=[];currencies=[]
    for q in rows:
        symbol=str(q.get("symbol") or "").strip().upper();qt=str(q.get("quoteType") or "EQUITY").upper();mcap=scalar(q.get("marketCap"),scalar(q.get("intradaymarketcap"),0))
        if not symbol or qt not in ("EQUITY","") or mcap<=0:continue
        currency=str(q.get("currency") or "USD").strip() or "USD";currencies.append(currency);raw_items.append((q,symbol,mcap,currency))
    fx,fx_failures=build_fx_map(currencies)
    if fx_failures:failures.append("FX missing: "+", ".join(sorted(set(fx_failures))))

    by_symbol={};outlier_count=0;receipt_count=0;illiquid_count=0
    for q,symbol,mcap,currency in raw_items:
        rate=fx.get(currency)
        if not rate or rate<=0:continue
        musd=mcap*rate;name=q.get("longName") or q.get("shortName") or q.get("displayName") or symbol;avgvol=scalar(q.get("averageDailyVolume3Month"),scalar(q.get("averageDailyVolume10Day"),0))
        # Yahoo-Screener kann einzelne internationale Hüllen mit offensichtlich falscher Skalierung liefern.
        if musd<=0 or musd>MAX_PLAUSIBLE_MCAP_USD:outlier_count+=1;continue
        if avgvol>0 and avgvol<MIN_AVG_VOLUME:illiquid_count+=1;continue
        # CDR/DRN/BDR sind fuer dieses globale Firmenuniversum reine Sekundaerhuellen und erzeugen Duplikate.
        if re.search(r"\b(CDR|DRN|BDR)\b",str(name).upper()):receipt_count+=1;continue
        item={"symbol":symbol,"name":name,"marketCap":mcap,"marketCapUSD":musd,"region":q.get("region"),"exchange":q.get("exchange"),"currency":currency,"sector":q.get("sector") or q.get("sectorDisp"),"industry":q.get("industry") or q.get("industryDisp"),"avgVolume":avgvol}
        item["companyKey"]=company_key(name,symbol);old=by_symbol.get(symbol)
        if old is None or musd>old["marketCapUSD"]:by_symbol[symbol]=item

    by_company={};exact_collapsed=0
    for item in by_symbol.values():
        key=item["companyKey"];old=by_company.get(key)
        if old is None:by_company[key]=item
        else:
            exact_collapsed+=1
            if representative_score(item)>representative_score(old):by_company[key]=item
    unique,fuzzy_collapsed=second_pass_dedupe(list(by_company.values()));top=sorted(unique,key=lambda x:x["marketCapUSD"],reverse=True)[:500]
    if len(top)<450:raise RuntimeError(f"Only {len(top)} unique plausible companies found; refusing overwrite. Failures: {failures[:5]}")

    payload={"generated_at":datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),"source":"yfinance Yahoo EquityQuery; FX-normalized representative listings; outlier/liquidity guard; exact+fuzzy cross-listing dedupe","count":len(top),"unique_companies":len(top),"raw_unique_symbols":len(by_symbol),"duplicate_listings_collapsed":exact_collapsed+fuzzy_collapsed,"exact_duplicates_collapsed":exact_collapsed,"fuzzy_duplicates_collapsed":fuzzy_collapsed,"rejected_implausible_market_caps":outlier_count,"rejected_secondary_receipts":receipt_count,"rejected_ultra_illiquid":illiquid_count,"equities":top}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8");print(f"Wrote {len(top)} companies; exact={exact_collapsed}, fuzzy={fuzzy_collapsed}, outliers={outlier_count}, receipts={receipt_count}, illiquid={illiquid_count}")
    if failures:print("Warnings:",failures)

if __name__=="__main__":main()