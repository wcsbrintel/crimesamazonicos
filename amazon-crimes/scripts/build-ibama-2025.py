#!/usr/bin/env python3
"""Build IBAMA 2025 official notices into a separate, privacy-safe GeoJSON."""
import argparse
import collections
import csv
import datetime
import io
import json
import os
import re
import tempfile
import unicodedata
import urllib.request
import zipfile

SOURCE = "https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip"
CATALOG = "https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao"
STATES = {"AC","AM","AP","MA","MT","PA","RO","RR","TO"}

def normalize(value):
    plain = unicodedata.normalize("NFKD", str(value or ""))
    plain = "".join(x for x in plain if not unicodedata.combining(x)).upper()
    return re.sub("[^A-Z0-9]+", "_", plain).strip("_")

def field(row, *keys):
    return next((str(row[normalize(k)]).strip() for k in keys if str(row.get(normalize(k), "")).strip()), "")

def decimal(v):
    try:
        return float(str(v).replace(",", "."))
    except (ValueError, TypeError):
        return None

def parse_date(s):
    s = str(s or "").strip()
    for pattern, order in [(r"^(\d{4})-(\d\d)-(\d\d)",(0,1,2)),(r"^(\d\d)/(\d\d)/(\d{4})",(2,1,0))]:
        m = re.search(pattern,s)
        if m:
            x=m.groups()
            try:
                d=datetime.date(*[int(x[k]) for k in order])
                return d.isoformat() if d.year == 2025 else ""
            except ValueError:
                pass
    return ""

def classify(tipo, descricao):
    t,d=normalize(tipo),normalize(descricao)
    if "PESCA" in t or ("FAUNA" in t and "PESC" in d): return "fishing"
    if "MINER" in t or "GARIMPO" in t: return "mining"
    if "POLU" in t or "CONTAMIN" in t: return "pollution"
    if "FOGO" in t or "QUEIMADA" in t or "INCENDIO" in d: return "fire"
    if "FAUNA" in t: return "wildlife"
    if "FLORA" in t or "VEGETA" in t or "DESMAT" in t:
        if any(x in d for x in ("MADEIRA","TRANSPORTAR","TORAS","SERRARIA","EXTRAIR")): return "logging"
        if any(x in d for x in ("DESMAT","SUPRIMIR","DESTRUIR","VEGETACAO","CORTE_RASO")): return "deforestation"
        return "flora_other"
    return "other"

def build(output):
    req=urllib.request.Request(SOURCE,headers={"User-Agent":"WCSBrasil-AmazonObservatory/2025 official public data"})
    with tempfile.NamedTemporaryFile(suffix=".zip",delete=False) as tmp:
        local=tmp.name
        with urllib.request.urlopen(req,timeout=180) as resp:
            size=0
            while True:
                block=resp.read(1024*1024)
                if not block: break
                size+=len(block)
                if size>650*1024*1024: raise RuntimeError("ZIP exceeds safety threshold")
                tmp.write(block)
    features,seen,counts=[],set(),collections.Counter()
    try:
        with zipfile.ZipFile(local) as z:
            names=[n for n in z.namelist() if re.search(r"2025[^/]*\.csv$",n,re.I)]
            if not names: raise RuntimeError("Annual 2025 CSV not found inside official ZIP")
            for name in names:
                with z.open(name) as f:
                    sample=f.read(8192)
                try: sample.decode("utf-8-sig"); enc="utf-8-sig"
                except UnicodeError: enc="latin-1"
                with z.open(name) as raw:
                    f=io.TextIOWrapper(raw,encoding=enc,errors="replace",newline="")
                    first=f.readline()
                    delimiter=";" if first.count(";")>=first.count(",") else ","
                    import itertools
                    reader=csv.DictReader(itertools.chain([first],f),delimiter=delimiter)
                    headers={normalize(k) for k in (reader.fieldnames or [])}
                    if "UF" not in headers or "TIPO_INFRACAO" not in headers:
                        raise RuntimeError("Unexpected source schema: "+", ".join(sorted(headers)[:25]))
                    for source_row in reader:
                        counts["records_read"]+=1
                        row={normalize(k):v for k,v in source_row.items() if k}
                        date=parse_date(field(row,"DAT_HORA_AUTO_INFRACAO","DATA_AUTO_INFRACAO"))
                        if not date: continue
                        counts["year_2025"]+=1
                        uf=normalize(field(row,"UF"))
                        if uf not in STATES: counts["outside_region"]+=1; continue
                        cancelled=normalize(field(row,"SIT_CANCELADO","SIT_AUT_CANCELADO"))
                        status=normalize(field(row,"DES_STATUS_FORMULARIO"))
                        if cancelled in {"S","SIM","TRUE","1"} or any(x in status for x in ("CANCEL","EXCLUID","SUBSTITUID")):
                            counts["cancelled"]+=1; continue
                        lat=decimal(field(row,"NUM_LATITUDE_AUTO","NUM_LATITUDE","LATITUDE"))
                        lon=decimal(field(row,"NUM_LONGITUDE_AUTO","NUM_LONGITUDE","LONGITUDE"))
                        if lat is None or lon is None or not (-18.5<=lat<=6 and -76<=lon<=-42) or (lat==0 and lon==0):
                            counts["missing_or_invalid_coordinates"]+=1; continue
                        key=field(row,"SEQ_AUTO_INFRACAO","SEQ_AUT")
                        if not key:
                            key=field(row,"NUM_AUTO_INFRACAO","NUM_AUT")+"-"+field(row,"SER_AUTO_INFRACAO","SER_AUT")
                        if not key.strip("- "): counts["missing_id"]+=1; continue
                        if key in seen: counts["duplicate_id"]+=1; continue
                        seen.add(key)
                        tipo=field(row,"TIPO_INFRACAO","TIPO_INF")
                        descricao=field(row,"DES_INFRACAO","DES_INF")
                        descricao=re.sub(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b","[redacted]",descricao)
                        category=classify(tipo,descricao)
                        features.append({"type":"Feature","geometry":{"type":"Point","coordinates":[round(lon,5),round(lat,5)]},
                          "properties":{"id":"IBAMA-2025-"+re.sub("[^A-Za-z0-9_-]","",key)[:45],
                           "category":category,"date":date,"uf":uf,"municipality":field(row,"MUNICIPIO","NOM_MUNICIPIO")[:100],
                           "notice":(field(row,"NUM_AUTO_INFRACAO","NUM_AUT")+" "+field(row,"SER_AUTO_INFRACAO","SER_AUT")).strip()[:80],
                           "type":tipo[:100],"description":descricao[:250],"source_url":CATALOG}})
                        counts["category_"+category]+=1
    finally:
        os.unlink(local)
    if not features: raise RuntimeError("No georeferenced 2025 records, refusing to publish empty layer")
    features.sort(key=lambda f:(f["properties"]["date"],f["properties"]["id"]))
    result={"type":"FeatureCollection","year":2025,"source":"IBAMA official open data – autos de infração",
      "source_url":CATALOG,"scope":"Brazilian Legal Amazon (nine UFs, not clipped to Amazon biome)",
      "generated_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "stats":dict(counts),"features":features}
    os.makedirs(os.path.dirname(output),exist_ok=True)
    with open(output+".tmp","w",encoding="utf-8") as f: json.dump(result,f,ensure_ascii=False,separators=(",",":"))
    os.replace(output+".tmp",output)
    print("IBAMA 2025 published",len(features),"georeferenced notices",dict(counts))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--output",default="public/data/ibama-2025.json")
    build(p.parse_args().output)
