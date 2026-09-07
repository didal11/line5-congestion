"""Download pinned official source files unchanged, using Python's standard library."""
import csv
from datetime import datetime, timezone
import hashlib
import http.cookiejar
import io
import json
from pathlib import Path
import urllib.parse
import urllib.request
import zipfile

from .config import RAW_DIR

SEOUL_PAGE = "https://data.seoul.go.kr/dataList/OA-12928/A/1/datasetView.do"
TIMETABLE_PAGE = "https://www.data.go.kr/data/15098251/fileData.do"
DOWNLOAD = "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?useCache=false"
SOURCES = [
    {"filename": "congestion_20260630.xlsx", "source_date": "2026-06-30", "page": SEOUL_PAGE, "url": DOWNLOAD, "post": {"infId": "OA-12928", "infSeq": "1", "seq": "23"}, "license": "KOGL Type 3: attribution, no derivatives"},
    {"filename": "congestion_20260331.xlsx", "source_date": "2026-03-31", "page": SEOUL_PAGE, "url": DOWNLOAD, "post": {"infId": "OA-12928", "infSeq": "1", "seq": "22"}, "license": "KOGL Type 3: attribution, no derivatives"},
    {"filename": "congestion_20251130.csv", "source_date": "2025-11-30", "page": SEOUL_PAGE, "url": DOWNLOAD, "post": {"infId": "OA-12928", "infSeq": "1", "seq": "19"}, "license": "KOGL Type 3: attribution, no derivatives"},
    {"filename": "timetable_20260616.csv", "source_date": "2026-06-16", "page": TIMETABLE_PAGE, "url": "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003657575&fileDetailSn=1&insertDataPrcus=N", "license": "No restrictions stated on source portal"},
]


def validate(data, filename):
    if filename.endswith(".xlsx"):
        with zipfile.ZipFile(io.BytesIO(data)) as book:
            if "xl/workbook.xml" not in book.namelist() or book.testzip():
                raise ValueError(f"Invalid workbook: {filename}")
        return {"format": "xlsx", "container_validated": True}
    for encoding in ("utf-8-sig", "cp949"):
        try:
            text = data.decode(encoding)
        except UnicodeDecodeError:
            continue
        rows = csv.reader(io.StringIO(text))
        header = next(rows)
        if "호선" not in header or not any("역" in c for c in header):
            raise ValueError(f"Unexpected CSV header: {filename}: {header}")
        count = 0
        for row in rows:
            if not row:
                continue
            if len(row) != len(header):
                raise ValueError(f"Ragged CSV row: {filename}: {count + 2}")
            count += 1
        return {"format": "csv", "encoding": encoding, "rows": count, "columns": header}
    raise ValueError(f"Unsupported encoding: {filename}")


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = RAW_DIR.parent / "sources.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    by_name = {item["filename"]: item for item in previous}
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = [("User-Agent", "Mozilla/5.0")]
    for source in SOURCES:
        path = RAW_DIR / source["filename"]
        if path.exists():
            data = path.read_bytes()
            expected = by_name.get(path.name, {}).get("sha256")
            if expected is None or hashlib.sha256(data).hexdigest() != expected:
                raise ValueError(f"Existing file has no matching recorded hash; preserve and review: {path}")
            validate(data, path.name)
            print(f"Verified existing: {path.name}", flush=True)
            continue
        print(f"Downloading: {path.name}", flush=True)
        with opener.open(source["page"], timeout=90) as response:
            response.read()
        body = urllib.parse.urlencode(source["post"]).encode() if "post" in source else None
        request = urllib.request.Request(source["url"], data=body, headers={"Referer": source["page"]})
        with opener.open(request, timeout=120) as response:
            data = response.read()
        inspection = validate(data, path.name)
        # Write exclusively: a rerun never replaces a user's existing raw file.
        with path.open("xb") as output:
            output.write(data)
        record = {**source, "provider": "Seoul Metro / 서울교통공사", "downloaded_at_utc": datetime.now(timezone.utc).isoformat(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "validation": inspection, "modified": False}
        by_name[path.name] = record
        manifest_path.write_text(json.dumps(list(by_name.values()), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Saved: {path.name} ({len(data):,} bytes)", flush=True)


if __name__ == "__main__":
    main()
