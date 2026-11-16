"""Check a lesson file: python3 tests/validate.py episodes/s1e1.json"""
import hashlib, json, re, sys

# sha256 of private names (lowercase), so the names themselves never appear in this public repo.
PRIVATE = {'fbd8dafe1f79f47371dd79d334d9a6c1aaab28c14b9533417462629d576639f3','62228e6f9859b7298a5fe862ab0ce1275bc2bd046a9308a2102968196be803d2'}

def secs(t):
    m, s = str(t).split(":")
    return int(m) * 60 + float(s)

path = sys.argv[1]
d = json.load(open(path, encoding="utf-8"))
errs = []
stories = {s["id"] for s in d["stories"]}
ids = set()
for k in ("id", "label", "videoId", "stories", "expressions"):
    if k not in d: errs.append(f"missing top-level {k}")
for i, x in enumerate(d["expressions"], 1):
    tag = f"#{x.get('n')} {x.get('id')}"
    if x.get("n") != i: errs.append(f"{tag}: n should be {i}")
    if x["id"] in ids: errs.append(f"{tag}: duplicate id")
    ids.add(x["id"])
    if x.get("story") not in stories: errs.append(f"{tag}: unknown story")
    for f in ("phrase", "meaning", "example", "practice"):
        if not x.get(f): errs.append(f"{tag}: missing {f}")
    if not 2 <= len(x.get("toneCards", [])) <= 3: errs.append(f"{tag}: needs 2-3 toneCards")
    for c in x["clips"]:
        if secs(c["end"]) <= secs(c["start"]): errs.append(f"{tag}: clip end before start")
        if secs(c["end"]) - secs(c["start"]) > 25: errs.append(f"{tag}: clip longer than 25 s")
        if not any(c["hl"].lower() in t.lower() for _, t in c["lines"]): errs.append(f"{tag}: hl not found in lines")
    text = json.dumps(x, ensure_ascii=False)
    if any(hashlib.sha256(w.lower().encode()).hexdigest() in PRIVATE for w in re.findall(r"[A-Za-z]+", text)):
        errs.append(f"{tag}: contains a private name")
print(f"{len(d['expressions'])} expressions, {sum(len(x['clips']) for x in d['expressions'])} clips")
print("\n".join(errs) if errs else "OK")
sys.exit(1 if errs else 0)
