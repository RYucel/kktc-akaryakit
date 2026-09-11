"""KKTC Resmî Gazete fiyat cetvelini okur; modele/vergi varsayımlarına dokunmaz."""
import argparse
from datetime import date, datetime
from html.parser import HTMLParser
from io import BytesIO
import json
import re
import sys
import time
import unicodedata
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from pypdf import PdfReader

INDEX = "https://basimevi.gov.ct.tr/"


def normalize(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text.upper()) if c.isalnum())


class GazetteIndex(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.stack.append({"text": [], "links": []})
        if tag == "a":
            href = dict(attrs).get("href", "")
            for row in self.stack:
                row["links"].append(href)

    def handle_data(self, text):
        for row in self.stack:
            row["text"].append(text)

    def handle_endtag(self, tag):
        if tag == "tr" and self.stack:
            self.rows.append(self.stack.pop())


def discover(html, today):
    parser = GazetteIndex()
    parser.feed(html)
    found = {}
    for row in parser.rows:
        text = " ".join(row["text"])
        normalized = normalize(text)
        if not all(token in normalized for token in ["AZAMISATISFIYAT", "BENZIN", "EURO"]):
            continue
        published = re.search(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b", text)
        if not published:
            continue
        day, month, year = map(int, published.groups())
        publication = date(year, month, day).isoformat()
        if publication > today:
            continue
        for href in row["links"]:
            url = urljoin(INDEX, href)
            path = urlparse(url).path
            match = re.fullmatch(r"/Portals/6/(\d{4})/(\d+)\.pdf", path, re.I)
            if match and urlparse(url).hostname == "basimevi.gov.ct.tr" and int(match[1]) == year:
                found[url] = {"url": url, "yayinTarihi": publication, "gazeteNo": int(match[2])}
    if not found:
        raise ValueError("Gazete dizininde tarihli akaryakıt fiyat emirnamesi bulunamadı.")
    return sorted(found.values(), key=lambda row: (row["yayinTarihi"], row["gazeteNo"]), reverse=True)


def parse_page(text, source, page_number):
    text = " ".join(text.split())
    normalized = normalize(text)
    if not all(token in normalized for token in ["CETVEL", "PERAKENDE", "AZAMISATISFIYAT", "YURURLUGE"]):
        return None
    # Read only the table, never the repealed ordinance or prices elsewhere in the PDF.
    table = re.split(r"Cetvel", text, flags=re.I)[-1]
    table = re.split(r"Yürürlükten", table, flags=re.I)[0]
    number = r"(\d+[,.]\s*\d+)\s*-?\s*TL\s*\.?\s*/\s*Lt\.?\s*,?"
    products = {}
    for key, label in [("b95", r"95\s*Oktan"), ("b98", r"98\s*Oktan"), ("dz", r"Euro\s*Diesel")]:
        matches = re.findall(label + r"\s*" + number + r"\s*" + number, table, re.I)
        if len(matches) != 1:
            raise ValueError(f"{key}: cetvelde tek ve kesin fiyat çifti bulunamadı (PDF s. {page_number}).")
        iaf, pump = [float(re.sub(r"\s", "", value).replace(",", ".")) for value in matches[0]]
        if not 0 < iaf <= pump <= 1000 or abs(pump * 100 - round(pump * 100)) > 0.000001:
            raise ValueError(f"{key}: fiyat aralığı veya ondalık basamağı geçersiz.")
        products[key] = {"resmiPompa": pump, "resmiIAF": iaf}
    effective = re.findall(r"Bu\s+Emirname\s+(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})\s+tarihinden\s+itibaren\s+yürürlüğe", text, re.I)
    if len(effective) != 1:
        raise ValueError("Emirnamenin yürürlük tarihi kesin okunamadı.")
    day, month, year = map(int, effective[0])
    effective_date = date(year, month, day).isoformat()
    if effective_date < source["yayinTarihi"]:
        raise ValueError("Yürürlük tarihi yayın tarihinden eski; elle inceleme gerekli.")
    return {"tarih": effective_date, "urunler": products, "kaynak": {**source, "ad": "KKTC Resmî Gazete", "sayfa": page_number}, "yontem": "otomatik"}


def parse_pdf(content, source):
    reader = PdfReader(BytesIO(content))
    found = []
    for index, page in enumerate(reader.pages):
        result = parse_page(page.extract_text() or "", source, index + 1)
        if result:
            found.append(result)
    if not found:
        raise ValueError("PDF içinde okunabilir fiyat cetveli yok; taranmış veya biçimi değişmiş olabilir.")
    if len(found) != 1:
        raise ValueError("PDF içinde birden fazla fiyat cetveli var; elle inceleme gerekli.")
    return found[0]


def download(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "basimevi.gov.ct.tr":
        raise ValueError("Yalnız KKTC Resmî Gazete kaynağına izin verilir.")
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={"User-Agent": "KKTC-Akaryakit/1.0 (public price checker)"}), timeout=60) as response:
                if urlparse(response.url).hostname != "basimevi.gov.ct.tr":
                    raise ValueError("Beklenmeyen kaynak yönlendirmesi.")
                data = response.read(40 * 1024 * 1024 + 1)
                if len(data) > 40 * 1024 * 1024:
                    raise ValueError("Kaynak dosya 40 MB sınırını aşıyor.")
                return data
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def latest(today):
    candidates = discover(download(INDEX).decode("utf-8-sig"), today)
    # Future ordinances may already be published. Find the newest effective one.
    for source in candidates[:8]:
        price = parse_pdf(download(source["url"]), source)
        if price["tarih"] <= today:
            return price
    raise ValueError("Yürürlükte olan fiyat bulunamadı; mevcut veri korunuyor.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--today", default=datetime.now(ZoneInfo("Asia/Nicosia")).date().isoformat())
    args = parser.parse_args()
    try:
        print(json.dumps(latest(date.fromisoformat(args.today).isoformat()), ensure_ascii=False))
    except Exception as error:
        print(f"Fiyat güncellenemedi: {error}", file=sys.stderr)
        sys.exit(1)
