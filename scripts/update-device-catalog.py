"""Refresh model-to-name data from Google's public Play supported-device catalog."""
import csv
import io
import json
import urllib.request
from pathlib import Path

URL = "https://storage.googleapis.com/play_public/supported_devices.csv"
raw = urllib.request.urlopen(URL, timeout=30).read()
text = raw.decode("utf-16") if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else raw.decode("utf-8-sig")
groups = {}
for row in csv.DictReader(io.StringIO(text)):
    brand = row.get("Retail Branding", "").strip()
    name = row.get("Marketing Name", "").strip()
    model = row.get("Model", "").strip()
    if not brand or not name or not model:
        continue
    label = name if name.lower().startswith(brand.lower()) else brand + " " + name
    groups.setdefault(model.lower(), {}).setdefault(brand.lower(), set()).add(label)
lookup = {}
for model, brands in groups.items():
    labels = set().union(*brands.values())
    lookup[model] = next(iter(labels)) if len(labels) == 1 else {brand: next(iter(names)) for brand, names in brands.items() if len(names) == 1}
output = Path(__file__).resolve().parents[1] / "server" / "device-catalog.json"
output.write_text(json.dumps(lookup, ensure_ascii=True, sort_keys=True, separators=(",", ":")), encoding="utf-8")
print(f"Updated {len(lookup)} model codes; ambiguous names require a matching manufacturer.")
