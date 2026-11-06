"""Builds the three "Librería Aurora" series films as HyperFrames projects.

    python build.py [v1_web|v2_portal|v3_todo ...]     (default: all)

Inputs
  GUIONES.md                 block text + tag ([CÁMARA ...] / [VOZ ...])
  voz/<id>.json, voz/<id>.wav HeyGen speech with word timestamps
  shared/avatar/<id>.mp4      lip-synced HeyGen clip (present = on-camera block)
  <film>/scenes/<id>.html     scene fragment: style <!--markup--> markup <!--script--> js [<!--sfx--> lines]
  common/fin.html             end card fragment

Fragment helpers (resolved here, before HyperFrames sees the file)
  {T:palabra}  {T:palabra:2}  {T:palabra:1:+0.4}   time of the n-th spoken word (+ offset), in block seconds
  {DUR} {VDUR}                 block composition length / voice length
  <shot id src="ui/x.png" crop="x y w h" at="left top width" />      a cropped capture (crop in CSS px)
  <phone id src="rec/x.mp4|ui/x.png" at="left top width" [start dur mstart] />
  <browser id src="rec/x.mp4|ui/x.png" url="..." at="left top width" [crop="x y w h"] [start dur mstart] />
  sfx lines:  name  time  volume                (after <!--sfx-->)

Writes <film>/index.html, <film>/compositions/*.html and copies the assets each film uses.
"""
import json, os, re, shutil, struct, subprocess, sys, unicodedata

ROOT = os.path.dirname(os.path.abspath(__file__))
VIDEO = os.path.dirname(ROOT)
LEAD, GAP, END = 0.5, 0.65, 7.5

FACES = {"mj": "feliz", "gaby": "gaby_amable"}
NAMES = {"mj": "María José", "gaby": "Gabriela"}

# film -> [(block id, chapter label, face for voice-only blocks)]
FILMS = {
    "v1_web": [
        ("w01", "", None), ("w02", "", "feliz"), ("w03", "", "pensando"), ("w04", "", None),
        ("w05", "", "orgullosa"), ("w06", "Domingo, 9:40 p.m.", "feliz"), ("w07", "Lunes, 10:30 a.m.", None),
        ("w08", "7:30 p.m.", "pensando"), ("w09", "", "calida"), ("w10", "", None),
    ],
    "v2_portal": [
        ("p01", "", None), ("p02", "", "agobiada"), ("p03", "", None), ("p04", "", None), ("p05", "", "decidida"),
        ("p06", "", None), ("p07", "", "agil"), ("p08", "", "pensando"), ("p09", "", "calida"), ("p10", "", None), ("p11", "", None),
    ],
    "v3_todo": [
        ("e01", "", None), ("e02", "Martes", "calida"), ("e03", "", "feliz"), ("e04", "9:00 a.m.", None), ("e05", "10:30 a.m.", "feliz"),
        ("e06", "11:45 a.m.", None), ("e07", "2:15 p.m.", "orgullosa"), ("e08", "", "pensando"), ("e09", "9:00 p.m.", "pensando"),
        ("e10", "", "decidida"), ("e11", "", None), ("e12", "", None),
    ],
}
TITLES = {"v1_web": "DENGO — La página que vende", "v2_portal": "DENGO — El portal de la seño Gabriela", "v3_todo": "DENGO — Tres puertas, una sola librería"}


# ── inputs ──────────────────────────────────────────────────────────────────
def guion():
    t = open(os.path.join(ROOT, "GUIONES.md"), encoding="utf-8").read()
    out = {}
    for m in re.finditer(r"\*\*(\w\d\d) · \[([^\]]+)\][^\n]*\n([^\n]+)", t):
        bid, tag, text = m.groups()
        out[bid] = {"tag": tag, "text": text.strip(), "speaker": "gaby" if "Gabriela" in tag and "María José" not in tag else "mj"}
    return out


def voice(bid):
    d = json.load(open(os.path.join(ROOT, "voz", f"{bid}.json"), encoding="utf-8"))["data"]
    words = [(w["word"], w["start"], w["end"]) for w in d["word_timestamps"] if not w["word"].startswith("<")]
    return d["duration"], words


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24])


SRC_DIRS = {"ui": os.path.join(ROOT, "capture"), "rec": os.path.join(ROOT, "shared", "rec"), "avatar": os.path.join(ROOT, "shared", "avatar"),
            "face": os.path.join(ROOT, "shared", "face"), "char": os.path.join(VIDEO, "personajes"), "art": os.path.join(ROOT, "common", "art")}


def src_path(rel):
    kind, name = rel.split("/", 1)
    return os.path.join(SRC_DIRS[kind], name)


def css_size(rel):
    w, h = png_size(src_path(rel))
    dpr = 3 if os.path.basename(rel).startswith("m_") else 2
    return w / dpr, h / dpr


# ── fragment expansion ──────────────────────────────────────────────────────
def attrs(tag):
    return dict(re.findall(r'(\w+)="([^"]*)"', tag))


def media(rel, a, cls="", style=""):
    if rel.endswith(".mp4"):
        t = f' data-start="{a.get("start", "0")}"' + (f' data-duration="{a["dur"]}"' if "dur" in a else "") + (f' data-media-start="{a["mstart"]}"' if "mstart" in a else "")
        return f'<video id="{a["id"]}-v" class="clip {cls}" src="assets/{rel}" muted playsinline{t} style="{style}"></video>'
    return f'<img class="{cls}" src="assets/{rel}" alt="" style="{style}" />'


def expand(markup, used):
    frames = {}  # shot/browser id -> (left, top, crop x, crop y, scale)

    def ring(m):
        a = attrs(m.group(0))
        L, T, cx, cy, s = frames[a["on"]]
        x, y, w, h = map(float, a["box"].split())
        pad = float(a.get("pad", 8))
        return (f'<div id="{a["id"]}" class="ring" style="left:{L + (x - cx) * s - pad:.0f}px;top:{T + (y - cy) * s - pad:.0f}px;'
                f'width:{w * s + 2 * pad:.0f}px;height:{h * s + 2 * pad:.0f}px"></div>')

    def shot(m):
        a = attrs(m.group(0)); rel = a["src"]; used.add(rel)
        L, T, W = map(float, a["at"].split())
        iw, ih = css_size(rel)
        cx, cy, cw, ch = map(float, a.get("crop", f"0 0 {iw} {ih}").split())
        s = W / cw
        frames[a["id"]] = (L, T, cx, cy, s)
        return (f'<div id="{a["id"]}" class="shot {a.get("class", "")}" style="left:{L:.0f}px;top:{T:.0f}px;width:{W:.0f}px;height:{ch * s:.0f}px">'
                f'<img id="{a["id"]}-i" src="assets/{rel}" alt="" style="width:{iw * s:.1f}px;left:{-cx * s:.1f}px;top:{-cy * s:.1f}px" /></div>')

    def phone(m):
        a = attrs(m.group(0)); rel = a["src"]; used.add(rel)
        L, T, W = map(float, a["at"].split())
        H = W * 844 / 390
        frames[a["id"]] = (L + 18, T + 18, 0, 0, W / 390)
        inner = media(rel, a, "fill") if rel.endswith(".mp4") else f'<img id="{a["id"]}-i" src="assets/{rel}" alt="" style="width:100%;position:absolute;left:0;top:0" />'
        return (f'<div id="{a["id"]}" class="phone" style="left:{L:.0f}px;top:{T:.0f}px;width:{W + 36:.0f}px;height:{H + 36:.0f}px">'
                f'<div class="screen" style="width:{W:.0f}px;height:{H:.0f}px">{inner}</div></div>')

    def browser(m):
        a = attrs(m.group(0)); rel = a["src"]; used.add(rel)
        L, T, W = map(float, a["at"].split())
        if rel.endswith(".mp4"):
            H = W * 900 / 1600
            frames[a["id"]] = (L, T + 56, 0, 0, W / 1600)
            inner = media(rel, a, "fill")
        else:
            iw, ih = css_size(rel)
            cx, cy, cw, ch = map(float, a.get("crop", f"0 0 {iw} {min(ih, iw * 900 / 1600)}").split())
            s = W / cw; H = ch * s
            frames[a["id"]] = (L, T + 56, cx, cy, s)
            inner = f'<img id="{a["id"]}-i" src="assets/{rel}" alt="" style="position:absolute;width:{iw * s:.1f}px;left:{-cx * s:.1f}px;top:{-cy * s:.1f}px" />'
        bar = f'<div class="bar"><i></i><i></i><i></i><span>{a.get("url", "")}</span></div>'
        return (f'<div id="{a["id"]}" class="browser" style="left:{L:.0f}px;top:{T:.0f}px;width:{W:.0f}px;height:{H + 56:.0f}px">{bar}'
                f'<div class="view" style="height:{H:.0f}px">{inner}</div></div>')

    markup = re.sub(r"<shot\b[^>]*/>", shot, markup)
    markup = re.sub(r"<phone\b[^>]*/>", phone, markup)
    markup = re.sub(r"<browser\b[^>]*/>", browser, markup)
    markup = re.sub(r"<ring\b[^>]*/>", ring, markup)
    for rel in re.findall(r'assets/((?:ui|rec|avatar|face|char|art)/[^"\')\s]+)', markup):
        used.add(rel)
    return markup


def resolve(text, words, dur, vdur, bid):
    def t(m):
        q, n, off = m.group(1), int(m.group(2) or 1), float(m.group(3) or 0)
        c = 0
        for w, s, _ in words:
            if norm(w) == norm(q):
                c += 1
                if c == n:
                    return f"{s + off:.3f}"
        raise SystemExit(f"{bid}: palabra no encontrada '{q}' #{n}")
    text = re.sub(r"\{INCLUDE:([\w.-]+)\}", lambda m: open(os.path.join(ROOT, "common", m.group(1)), encoding="utf-8").read(), text)
    text = re.sub(r"\{T:([^:}]+)(?::(\d+))?(?::([+-]?[\d.]+))?\}", t, text)
    return text.replace("{DUR}", f"{dur:.3f}").replace("{VDUR}", f"{vdur:.3f}")


# ── build one film ─────────────────────────────────────────────────────────
def build(film):
    g = guion()
    fdir = os.path.join(ROOT, film)
    os.makedirs(os.path.join(fdir, "compositions"), exist_ok=True)
    used, sfx, plan = set(), [], []
    t = LEAD
    for bid, label, face in FILMS[film]:
        vdur, words = voice(bid)
        cam = os.path.exists(os.path.join(SRC_DIRS["avatar"], f"{bid}.mp4"))
        plan.append(dict(id=bid, label=label, face=face, start=round(t, 3), vdur=vdur, words=words, cam=cam, speaker=g[bid]["speaker"]))
        t += vdur + GAP
    fin_start = round(t, 3)
    total = round(fin_start + END, 2)

    for i, b in enumerate(plan):
        b["dur"] = round((plan[i + 1]["start"] if i + 1 < len(plan) else fin_start) - b["start"], 3)
        frag = open(os.path.join(fdir, "scenes", f"{b['id']}.html"), encoding="utf-8").read()
        style, rest = frag.split("<!--markup-->")
        markup, rest = rest.split("<!--script-->")
        js, sfx_txt = (rest.split("<!--sfx-->") + [""])[:2]
        R = lambda s: resolve(s, b["words"], b["dur"], b["vdur"], b["id"])
        markup, js, style = expand(R(markup), used), R(js), R(style)
        for line in R(sfx_txt).strip().splitlines():
            if line.strip():
                name, at, vol = line.split()
                sfx.append((name, b["start"] + float(at), float(vol)))
        write_scene(fdir, b, style, markup, js, used)

    # end card
    frag = open(os.path.join(ROOT, "common", "fin.html"), encoding="utf-8").read()
    style, rest = frag.split("<!--markup-->")
    markup, js = rest.split("<!--script-->")
    write_scene(fdir, dict(id="fin", label="", face=None, cam=False, dur=END, vdur=END, words=[], speaker="mj", nobadge=True), style, expand(markup, used), js, used)
    sfx.append(("whoosh-short", fin_start + 0.2, 0.35))

    # index
    hosts = [host(b["id"], b["start"], b["dur"]) for b in plan] + [host("fin", fin_start, END)]
    if plan[0]["cam"]:
        # frame 0 is the thumbnail: hold the first frame of the opening clip until its scene starts
        first = f"avatar/{plan[0]['id']}_first.jpg"; used.add(first)
        hosts.insert(0, f'      <img id="poster0" class="clip" src="assets/{first}" alt="" data-start="0" data-duration="{plan[0]["start"] + 0.1:.2f}" data-track-index="0" style="position:absolute;left:0;top:0;width:1920px;height:1080px;object-fit:cover" />')
    audio = [f'      <audio id="voz-{b["id"]}" class="clip" src="assets/voz/{b["id"]}.wav" data-start="{b["start"]}" data-duration="{b["vdur"]:.3f}" data-track-index="3" data-volume="1"></audio>' for b in plan]
    audio.append(f'      <audio id="bgm" class="clip" src="assets/bgm/bed.wav" data-start="0" data-duration="{total}" data-track-index="4" data-volume="1"></audio>')
    for i, (name, at, vol) in enumerate(sfx):
        audio.append(f'      <audio id="sfx-{i}" class="clip" src="assets/sfx/{name}.mp3" data-start="{at:.3f}" data-duration="1.2" data-track-index="{5 + i % 4}" data-volume="{vol}"></audio>')
    html = INDEX.replace("%TITLE%", TITLES[film]).replace("%TOTAL%", str(total)).replace("%HOSTS%", "\n".join(hosts)).replace("%AUDIO%", "\n".join(audio))
    open(os.path.join(fdir, "index.html"), "w", encoding="utf-8").write(html)

    copy_assets(fdir, used, plan)
    bed(fdir, total, fin_start, plan)
    for name in ("hyperframes.json",):
        shutil.copy(os.path.join(VIDEO, "dia", name), os.path.join(fdir, name))
    json.dump({"name": film, "private": True, "type": "module", "scripts": {"dev": "npx --yes hyperframes@0.9.15 preview", "check": "npx --yes hyperframes@0.9.15 check", "render": "npx --yes hyperframes@0.9.15 render"}},
              open(os.path.join(fdir, "package.json"), "w"), indent=2)
    json.dump({"id": film, "name": film}, open(os.path.join(fdir, "meta.json"), "w"), indent=2)
    print(f"{film}: total {total}s  ({len(plan)} bloques, fin en {fin_start}s)")
    for b in plan:
        print(f'  {b["id"]} {b["start"]:7.2f}  voz {b["vdur"]:5.2f}  {"CÁMARA" if b["cam"] else "voz"}')


def host(cid, start, dur):
    return f'      <div id="{cid}" data-composition-id="{cid}" data-composition-src="compositions/{cid}.html" data-start="{start}" data-duration="{dur:.3f}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>'


def write_scene(fdir, b, style, markup, js, used):
    bid = b["id"]
    pre, post, prejs = "", "", ""
    m = re.search(r"<!--tag:(.*?)-->", markup)
    tagline = m.group(1).strip() if m else ""
    if b["cam"]:
        rel = f"avatar/{bid}.mp4"; used.add(rel); used.add(f"avatar/{bid}_last.jpg")
        pre = (f'<div id="{bid}-cam" class="cam"><img class="poster" src="assets/avatar/{bid}_last.jpg" alt="" />'
               f'<video id="{bid}-camv" class="clip" src="assets/{rel}" muted playsinline data-start="0" data-duration="{b["vdur"]:.3f}"></video>'
               f'<div id="{bid}-tag" class="tag"><b>{NAMES[b["speaker"]]}</b><span>{tagline}</span></div></div>')
        prejs = CAMJS.replace("%ID%", bid)
    elif not b.get("nobadge") and "<!--nobadge-->" not in markup:
        face = b["face"] or FACES[b["speaker"]]
        used.add(f"face/{face}.png")
        post = (f'<div id="{bid}-badge" class="badge"><div class="face"><img src="assets/face/{face}.png" alt="" /></div>'
                f'<div class="who"><b>{NAMES[b["speaker"]]}</b><div class="bars"><i></i><i></i><i></i><i></i><i></i></div></div></div>')
        words = [[round(s, 3), round(e, 3)] for _, s, e in b["words"]]
        prejs = BADGEJS.replace("%ID%", bid).replace("%WORDS%", json.dumps(words))
    label = f'<div class="time mask"><span id="{bid}-time">{b["label"]}</span></div>' if b["label"] else ""
    if b["label"]:
        prejs += f'\n    rise("#{bid}-time", 0.1);'
    html = SCENE.replace("%ID%", bid).replace("%STYLE%", style).replace("%PRE%", pre).replace("%LABEL%", label).replace("%MARKUP%", markup) \
        .replace("%POST%", post).replace("%PREJS%", prejs).replace("%JS%", js).replace("%DUR%", f"{b['dur']:.3f}")
    open(os.path.join(fdir, "compositions", f"{bid}.html"), "w", encoding="utf-8").write(html)


def copy_assets(fdir, used, plan):
    a = os.path.join(fdir, "assets")
    for rel in sorted(used):
        dst = os.path.join(a, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if rel.startswith("avatar/") and rel.endswith((".jpg")):
            if not os.path.exists(dst):
                last = rel.endswith("_last.jpg")
                clip = os.path.join(SRC_DIRS["avatar"], re.sub(r"_(last|first)\.jpg$", ".mp4", rel.split("/")[1]))
                seek = ["-sseof", "-0.2"] if last else ["-ss", "0"]
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *seek, "-i", clip, "-frames:v", "1", "-q:v", "2", dst], check=True)
            continue
        src = src_path(rel)
        if not os.path.exists(dst) or os.path.getmtime(src) > os.path.getmtime(dst):
            shutil.copy2(src, dst)
    os.makedirs(os.path.join(a, "voz"), exist_ok=True)
    for b in plan:
        shutil.copy2(os.path.join(ROOT, "voz", f"{b['id']}.wav"), os.path.join(a, "voz", f"{b['id']}.wav"))
    os.makedirs(os.path.join(a, "sfx"), exist_ok=True)
    for f in os.listdir(os.path.join(VIDEO, "dia", "assets", "sfx")):
        shutil.copy2(os.path.join(VIDEO, "dia", "assets", "sfx", f), os.path.join(a, "sfx", f))


def bed(fdir, total, fin_start, plan):
    """Loop the CC0 guitar bed to the film, lower under the voice, swell on the end card."""
    os.makedirs(os.path.join(fdir, "assets", "bgm"), exist_ok=True)
    out = os.path.join(fdir, "assets", "bgm", "bed.wav")
    src = os.path.join(ROOT, "musica", "acoustic_plains_cc0.mp3")
    first = plan[0]["start"]
    vol = f"0.55+0.45*clip(({first}-t)/0.6,0,1)+0.75*clip((t-{fin_start - 0.3})/1.4,0,1)"
    af = f"volume='{vol}':eval=frame,afade=t=in:d=1.2,afade=t=out:st={total - 3.2}:d=3.2,loudnorm=I=-27:TP=-3:LRA=11"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-stream_loop", "-1", "-i", src, "-t", str(total), "-af", af, "-ar", "48000", "-ac", "2", out], check=True)


CAMJS = """    // on camera: full frame, the lower-third tag, then pip(t) shrinks it to a window
    const CAM = "#%ID%-cam";
    const pip = (t, where = "bl", d = 0.8) => {
      const s = 0.25, W = 1920 * s, H = 1080 * s;
      const x = where === "br" ? 1920 - 56 - W : where === "tr" ? 1920 - 56 - W : 56;
      const y = where === "tr" ? 56 : 1080 - 56 - H;
      tl.to(CAM, { x, y, scale: s, borderRadius: 120, duration: d, ease: "power3.inOut" }, t);
      tl.to(CAM + " .tag", { opacity: 0, duration: 0.2 }, t);
    };
    const unpip = (t, d = 0.7) => tl.to(CAM, { x: 0, y: 0, scale: 1, borderRadius: 0, duration: d, ease: "power3.inOut" }, t);
    const tag = (t, hold = 3.4) => {
      tl.fromTo(CAM + " .tag", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.5, ease: "expo.out" }, t);
      tl.to(CAM + " .tag", { opacity: 0, x: -20, duration: 0.35, ease: "power2.in" }, t + hold);
    };"""

BADGEJS = """    // voice-only: her face badge, bars move with each spoken word
    tl.fromTo("#%ID%-badge", { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, 0.05);
    const WORDS = %WORDS%;
    const H = [0.55, 0.9, 0.7, 1, 0.6];
    WORDS.forEach(([s, e], k) => {
      const next = k + 1 < WORDS.length ? WORDS[k + 1][0] : e + 1;
      const down = Math.min(Math.max(s + 0.1, e - 0.04), next - 0.03);
      tl.to("#%ID%-badge .bars i", { scaleY: (i) => 0.25 + H[(i + k) % 5] * 0.75, duration: Math.min(0.09, down - s - 0.005), ease: "power1.out" }, s);
      tl.to("#%ID%-badge .bars i", { scaleY: 0.18, duration: Math.max(0.01, Math.min(0.12, next - down - 0.01)), ease: "power1.in" }, down);
    });"""

INDEX = """<!doctype html>
<html lang="es" data-composition-variables='[{"id":"whatsapp","type":"string","label":"WhatsApp","default":"+502 5568-3004"}]'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>%TITLE%</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #fbf6ee; }
      #root { position: relative; width: 100%; height: 100%; font-family: "Outfit", sans-serif; color: #1b2233; }
      #paper { position: absolute; inset: 0; background-color: #fbf6ee;
        background-image: linear-gradient(#efe6d5 1px, transparent 1px), linear-gradient(90deg, #efe6d5 1px, transparent 1px);
        background-size: 48px 48px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="%TOTAL%" data-width="1920" data-height="1080">
      <div id="paper"></div>
%HOSTS%
%AUDIO%
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
"""

SCENE = """<template>
  <style>
    #root { position: absolute; inset: 0; font-family: "Outfit", sans-serif; color: #1b2233; overflow: hidden; }
    .mask { display: block; overflow: hidden; padding-bottom: 0.08em; }
    .mask > span { display: block; }
    .time { position: absolute; left: 96px; top: 76px; z-index: 6; }
    .time > span { font-size: 64px; font-weight: 700; color: #b9532f; letter-spacing: -0.02em; line-height: 1.1; }
    .h { font-weight: 700; color: #1e4d68; letter-spacing: -0.025em; line-height: 1.04; }
    .sub { font-size: 38px; line-height: 1.3; color: #1b2233; }
    .card { position: absolute; background: #fff; border: 1px solid #e6dfd2; border-radius: 22px; box-shadow: 0 24px 60px rgba(27, 34, 51, 0.16); }
    .shot { position: absolute; overflow: hidden; background: #fff; border: 1px solid #e6dfd2; border-radius: 18px; box-shadow: 0 24px 60px rgba(27, 34, 51, 0.16); }
    .shot > img { position: absolute; max-width: none; }
    .shot.flat { box-shadow: none; }
    .phone { position: absolute; background: #1b2233; border-radius: 62px; padding: 18px; box-shadow: 0 30px 70px rgba(27, 34, 51, 0.28); }
    .phone .screen { position: relative; overflow: hidden; border-radius: 46px; background: #fff; }
    .phone video.fill, .browser video.fill { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
    .browser { position: absolute; overflow: hidden; background: #fff; border: 1px solid #e6dfd2; border-radius: 18px; box-shadow: 0 26px 64px rgba(27, 34, 51, 0.18); }
    .browser .bar { height: 56px; background: #f3eee5; display: flex; align-items: center; gap: 9px; padding: 0 18px; border-bottom: 1px solid #e6dfd2; }
    .browser .bar i { width: 13px; height: 13px; border-radius: 50%; background: #d8cfbf; display: block; }
    .browser .bar span { margin-left: 18px; font-size: 26px; color: #6b6458; background: #fff; border-radius: 999px; padding: 4px 18px; }
    .browser .view { position: relative; overflow: hidden; }
    .browser .view > img { max-width: none; }
    .ring { position: absolute; border: 6px solid #e07a5f; border-radius: 14px; opacity: 0; z-index: 5; }
    .pill { position: absolute; display: inline-flex; align-items: center; gap: 14px; background: #1e4d68; color: #fff; font-size: 34px; font-weight: 600; padding: 16px 30px; border-radius: 999px; box-shadow: 0 16px 40px rgba(30, 77, 104, 0.3); z-index: 6; }
    .pill.coral { background: #b9532f; box-shadow: 0 16px 40px rgba(224, 122, 95, 0.35); }
    .pill.sun { background: #f2c14e; color: #1b2233; box-shadow: 0 16px 40px rgba(242, 193, 78, 0.35); }
    .cam { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: hidden; transform-origin: 0 0; z-index: 8; background: #fbf6ee; box-shadow: 0 30px 80px rgba(27, 34, 51, 0.3); }
    .cam video, .cam .poster { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }
    .cam .tag { position: absolute; left: 96px; bottom: 96px; background: #fff; border-radius: 22px; padding: 22px 34px; opacity: 0; box-shadow: 0 20px 50px rgba(27, 34, 51, 0.2); }
    .cam .tag b { display: block; font-size: 46px; color: #1e4d68; letter-spacing: -0.02em; }
    .cam .tag span { display: block; font-size: 30px; color: #6b6458; margin-top: 2px; }
    .badge { position: absolute; left: 56px; bottom: 56px; display: flex; align-items: center; gap: 20px; z-index: 9; opacity: 0; }
    .badge .face { width: 168px; height: 168px; border-radius: 50%; overflow: hidden; border: 6px solid #fff; box-shadow: 0 18px 44px rgba(27, 34, 51, 0.22); background: #fbf6ee; }
    .badge .face img { width: 100%; height: 100%; object-fit: cover; }
    .badge .who { background: #fff; border-radius: 18px; padding: 12px 22px 14px; box-shadow: 0 14px 34px rgba(27, 34, 51, 0.14); }
    .badge .who b { display: block; font-size: 28px; color: #1e4d68; }
    .badge .bars { display: flex; gap: 6px; align-items: center; height: 30px; margin-top: 4px; }
    .badge .bars i { display: block; width: 8px; height: 30px; border-radius: 4px; background: #e07a5f; transform: scaleY(0.18); }
%STYLE%
  </style>
  <div id="root" data-composition-id="%ID%" data-width="1920" data-height="1080" data-layout-allow-overflow data-layout-allow-overlap>
    %LABEL%
%MARKUP%
    %PRE%
    %POST%
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    const DUR = %DUR%;
    const rise = (s, t, d = 0.55) => tl.fromTo(s, { yPercent: 115 }, { yPercent: 0, duration: d, ease: "expo.out" }, t);
    const lift = (s, t, d = 0.7) => tl.fromTo(s, { opacity: 0, y: 46, scale: 0.965 }, { opacity: 1, y: 0, scale: 1, duration: d, ease: "expo.out" }, t);
    const pop = (s, t) => tl.fromTo(s, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.9)" }, t);
    const slide = (s, t, x = -140) => tl.fromTo(s, { x, opacity: 0 }, { x: 0, opacity: 1, duration: 0.65, ease: "expo.out" }, t);
    const out = (s, t, d = 0.35) => tl.to(s, { opacity: 0, y: -16, duration: d, ease: "power2.in" }, t);
    const ring = (s, t, hold = 0) => { tl.fromTo(s, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.32, ease: "back.out(2.2)" }, t); if (hold) tl.to(s, { opacity: 0, duration: 0.25 }, t + hold); };
    const pan = (s, t, vars, d = 1.2) => tl.to(s, { ...vars, duration: d, ease: "power3.inOut" }, t);
    const count = (s, t, from, to, d = 0.9, fmt = (v) => Math.round(v).toString()) => {
      const o = { v: from };
      tl.to(o, { v: to, duration: d, ease: "power2.out", onUpdate: () => { const el = document.querySelector(s); if (el) el.textContent = fmt(o.v); } }, t);
    };
%PREJS%
%JS%
    window.__timelines["%ID%"] = tl;
  </script>
</template>
"""

if __name__ == "__main__":
    for f in (sys.argv[1:] or list(FILMS)):
        build(f)
