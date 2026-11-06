"""Generate HeyGen speech (with word timestamps) for every block in GUIONES.md.

Usage: python gen_voice.py [block ids...]   (default: all missing)
Writes voz/<id>.json (HeyGen response) and voz/<id>.wav.
"""
import json, os, re, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
VOZ = os.path.join(ROOT, "voz")
HG = ["wsl.exe", "-d", "Ubuntu", "--", "/home/alejandra_yol/.local/bin/heygen"]
VOICES = {
    "mj": "a40ae4101c5b41748cfb7553538f0f66",  # Lucía Sabia – Friendly
    "gaby": "c593e249943b4c8d8e6d4cadcc04e000",  # Daniela
}


def blocks():
    t = open(os.path.join(ROOT, "GUIONES.md"), encoding="utf-8").read()
    out = []
    for m in re.finditer(r"\*\*(\w\d\d) · \[([^\]]+)\][^\n]*\n([^\n]+)", t):
        bid, tag, text = m.groups()
        speaker = "gaby" if "Gabriela" in tag and "María José" not in tag else "mj"
        out.append({"id": bid, "tag": tag, "speaker": speaker, "text": text.strip()})
    return out


def wsl_path(p):
    p = os.path.abspath(p).replace("\\", "/")
    return "/mnt/" + p[0].lower() + p[2:]


def gen(b):
    os.makedirs(VOZ, exist_ok=True)
    body = {"text": b["text"], "voice_id": VOICES[b["speaker"]], "language": "es"}
    req = os.path.join(VOZ, f"{b['id']}.req.json")
    json.dump(body, open(req, "w", encoding="utf-8"), ensure_ascii=False)
    r = subprocess.run(HG + ["voice", "speech", "create", "-d", wsl_path(req)],
                       capture_output=True, text=True, encoding="utf-8")
    os.remove(req)
    try:
        d = json.loads(r.stdout)
    except Exception:
        raise SystemExit(f"{b['id']}: {r.stdout[:300]} {r.stderr[:300]}")
    if "data" not in d:
        raise SystemExit(f"{b['id']}: {r.stdout[:300]}")
    json.dump(d, open(os.path.join(VOZ, f"{b['id']}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    urllib.request.urlretrieve(d["data"]["audio_url"], os.path.join(VOZ, f"{b['id']}.wav"))
    return d["data"]["duration"]


if __name__ == "__main__":
    want = set(sys.argv[1:])
    total = 0.0
    for b in blocks():
        if want and b["id"] not in want:
            continue
        if not want and os.path.exists(os.path.join(VOZ, f"{b['id']}.wav")):
            continue
        dur = gen(b)
        total += dur
        print(f"{b['id']} {b['speaker']:4} {dur:6.2f}s  {b['tag']}")
    print(f"total {total:.1f}s")
