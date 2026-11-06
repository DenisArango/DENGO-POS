"""Lip-synced HeyGen avatar clips for the on-camera blocks, driven by the voice already in voz/<id>.json.

Usage: python gen_avatar.py <block ids...>
Writes avatar/<id>.mp4. Only blocks listed in CAMERA are allowed (budget).
"""
import json, os, subprocess, sys, time, urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
HG = ["wsl.exe", "-d", "Ubuntu", "--", "/home/alejandra_yol/.local/bin/heygen"]
LOOK = {
    "libreria": "090f9fe841826ec91a7c8d1edd4e1b54",
    "casa": "7f5998bcfd08c0ac9d8108e7b14b13e0",
    "oficina": "4b6457520eda74a1b389f29504a6f287",
    "aula": "52e11d2876c5306c2777b0f5662af43f",
}
# block -> (look, body language)
CAMERA = {
    "w01": ("libreria", "slightly worried, tilts head, small open-palm shrug"),
    "w04": ("oficina", "starts thoughtful with a hand near the chin, then relaxes and smiles with relief"),
    "w07": ("libreria", "proud and pleased, small confident nod, gestures to the side as if showing the counter"),
    "w10": ("libreria", "happy and warm, friendly smile, small inviting hand gesture toward the viewer"),
    "p01": ("libreria", "overwhelmed, sighs, raises both hands slightly, shakes head a little"),
    "p03": ("oficina", "decided and confident, steady nods, explaining with calm hand gestures"),
    "p04": ("aula", "kind and friendly, gentle smile, small wave at the start"),
    "p06": ("aula", "happy, lifts the phone slightly and smiles"),
    "p10": ("aula", "relieved, relaxed shoulders, warm smile"),
    "p11": ("libreria", "proud, confident smile, small nod to the viewer"),
    "e01": ("casa", "warm and calm, holding the coffee mug, gentle smile"),
    "e04": ("libreria", "energetic and quick, lively gestures"),
    "e06": ("aula", "cheerful, bright smile, small nod"),
    "e11": ("casa", "reflective, calm, thoughtful pauses, then a soft smile"),
    "e12": ("libreria", "proud and warm, confident smile, inviting gesture to the viewer"),
}


def wsl_path(p):
    p = os.path.abspath(p).replace("\\", "/")
    return "/mnt/" + p[0].lower() + p[2:]


def hg(args):
    r = subprocess.run(HG + args, capture_output=True, text=True, encoding="utf-8")
    try:
        return json.loads(r.stdout)
    except Exception:
        raise SystemExit(f"heygen: {r.stdout[:400]} {r.stderr[:400]}")


def create(bid):
    look, motion = CAMERA[bid]
    voz = json.load(open(os.path.join(ROOT, "voz", f"{bid}.json"), encoding="utf-8"))["data"]
    body = {
        "type": "avatar",
        "avatar_id": LOOK[look],
        "audio_url": voz["audio_url"],
        "resolution": "1080p",
        "aspect_ratio": "16:9",
        "expressiveness": "medium",
        "motion_prompt": motion,
        "title": f"DENGO serie {bid}",
    }
    req = os.path.join(ROOT, "avatar", f"{bid}.req.json")
    os.makedirs(os.path.dirname(req), exist_ok=True)
    json.dump(body, open(req, "w", encoding="utf-8"))
    d = hg(["video", "create", "-d", wsl_path(req)])
    os.remove(req)
    vid = (d.get("data") or {}).get("video_id") or (d.get("data") or {}).get("id")
    if not vid:
        raise SystemExit(f"{bid}: {json.dumps(d)[:400]}")
    return vid


def wait(bid, vid):
    for _ in range(240):
        d = hg(["video", "get", vid]).get("data", {})
        st = d.get("status")
        if st == "completed":
            url = d.get("video_url")
            urllib.request.urlretrieve(url, os.path.join(ROOT, "avatar", f"{bid}.mp4"))
            return d.get("duration")
        if st == "failed":
            raise SystemExit(f"{bid} failed: {json.dumps(d)[:400]}")
        time.sleep(15)
    raise SystemExit(f"{bid}: timeout ({vid})")


if __name__ == "__main__":
    ids = [b for b in sys.argv[1:] if b in CAMERA]
    jobs = {b: create(b) for b in ids if not os.path.exists(os.path.join(ROOT, "avatar", f"{b}.mp4"))}
    for b, v in jobs.items():
        print(b, "submitted", v, flush=True)
    for b, v in jobs.items():
        print(b, "done", wait(b, v), flush=True)
