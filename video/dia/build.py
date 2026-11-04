"""Builds the DENGO "Un día con María José" film from the narration timing.

    python build.py

Reads voz/cNN.json (HeyGen word timestamps) for every block that has real
voice; blocks without it use an estimated length and evenly spread words, so
the film can be previewed before the voice exists. Re-run after adding audio:
every scene's internal times are scaled by real/estimated length (K).
Writes index.html, compositions/maria.html and compositions/cNN.html
(from scenes/cNN.html fragments).
"""
import json, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
GAP = 0.7          # silence between blocks
LEAD = 0.6         # before the first word of the film
END_HOLD = 3.6     # end card hold after the last block

# id, on-screen time label, estimated seconds (used only when no voice yet)
BLOCKS = [
    ("c01", "María José", 13.4), ("c02", "7:45 a.m.", 8.8), ("c03", "La meta", 11.8),
    ("c04", "8:00 a.m.", 7.0), ("c05", "9:30 a.m.", 11.0), ("c06", "10:42 a.m.", 12.8),
    ("c07", "11:15 a.m.", 13.1), ("c08", "1:30 p.m.", 8.1), ("c09", "3:12 p.m.", 12.2),
    ("c10", "4:05 p.m.", 16.35), ("c11", "7:30 p.m.", 5.2), ("c12", "9:00 p.m.", 7.58),
    ("c13", "9:20 p.m.", 17.08), ("c14", "Lo que viene", 9.06), ("c15", "DENGO", 8.02),
    ("c16", "", 7.11),
]

# María José's mood keys per block, seconds relative to the block (scaled by K)
MOODS = {
    "c01": [(0, "happy"), (4.3, "neutral"), (6.8, "worried"), (11.2, "happy")],
    "c02": [(0, "calm"), (2.8, "neutral"), (7.4, "happy")],
    "c03": [(0, "determined"), (6.4, "happy")],
    "c04": [(0, "neutral")],
    "c05": [(0, "happy"), (8.4, "neutral")],
    "c06": [(0, "surprised"), (0.9, "worried"), (7.0, "surprised"), (8.2, "happy")],
    "c07": [(0, "neutral"), (10.5, "calm")],
    "c08": [(0, "neutral"), (5.3, "happy")],
    "c09": [(0, "thinking"), (4.3, "neutral"), (6.3, "happy")],
    "c10": [(0, "surprised"), (1.5, "worried"), (6.0, "calm"), (9.8, "happy"), (11.4, "calm")],
    "c11": [(0, "happy")],
    "c12": [(0, "thinking"), (2.2, "neutral")],
    "c13": [(0, "thinking"), (4.5, "neutral"), (14.6, "happy")],
    "c14": [(0, "thinking"), (6.5, "happy")],
    "c15": [(0, "happy")],
    "c16": [(0, "happy")],
}
PROPS = {"c02": [("mug", 0, 8.6)]}


def script_text(bid):
    g = open(os.path.join(ROOT, "GUION.md"), encoding="utf-8").read()
    m = re.search(rf"^{bid} · [^\n]*\n([^\n]+)", g, re.M)
    return m.group(1).strip() if m else ""


def timing(bid, est):
    p = os.path.join(ROOT, "voz", f"{bid}.json")
    if os.path.exists(p):
        raw = open(p, encoding="utf-8-sig").read()
        d = json.loads(raw[raw.index("{"):])["data"]
        words = [(w["start"], w["end"]) for w in d["word_timestamps"] if not w["word"].startswith("<")]
        return d["duration"], words, True
    n = max(1, len(script_text(bid).split()))
    span = est - 0.6
    words = [(0.3 + i * span / n, 0.3 + (i + 0.7) * span / n) for i in range(n)]
    return est, words, False


def main():
    t = LEAD
    plan = []
    for bid, label, est in BLOCKS:
        dur, words, real = timing(bid, est)
        plan.append(dict(id=bid, label=label, start=round(t, 3), dur=dur, words=words, real=real, K=dur / est if not real else 1.0))
        t += dur + GAP
    total = round(t - GAP + END_HOLD, 2)

    # ── index.html ──
    hosts, audios = [], []
    for i, b in enumerate(plan):
        end = plan[i + 1]["start"] if i + 1 < len(plan) else total
        hosts.append(f'      <div id="{b["id"]}" data-composition-id="{b["id"]}" data-composition-src="compositions/{b["id"]}.html" data-start="{b["start"]}" data-duration="{round(end - b["start"], 3)}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>')
        if b["real"]:
            audios.append(f'      <audio id="voz-{b["id"]}" class="clip" src="assets/voz/{b["id"]}.wav" data-start="{b["start"]}" data-duration="{round(b["dur"], 3)}" data-track-index="3" data-volume="1"></audio>')
    sfx = []
    for i, (bid, rel, name, vol) in enumerate(SFX):
        b = next(x for x in plan if x["id"] == bid)
        sfx.append(f'      <audio id="sfx-{i}" class="clip" src="assets/sfx/{name}.mp3" data-start="{round(b["start"] + rel * b["K"], 3)}" data-duration="1.2" data-track-index="{5 + i}" data-volume="{vol}"></audio>')
    index = INDEX.replace("%TOTAL%", str(total)).replace("%HOSTS%", "\n".join(hosts)).replace("%AUDIO%", "\n".join(audios + sfx))
    open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8").write(index)

    # ── maria.html ──
    words, moods, props = [], [], []
    for b in plan:
        words += [[round(b["start"] + s, 3), round(b["start"] + e, 3)] for s, e in b["words"]]
        moods += [[round(b["start"] + r * b["K"], 3), m] for r, m in MOODS.get(b["id"], [])]
        for name, a, z in PROPS.get(b["id"], []):
            props.append([name, round(b["start"] + a * b["K"], 3), round(b["start"] + z * b["K"], 3)])
    exit_at = round(plan[-1]["start"] + plan[-1]["dur"] + 0.4, 3)
    maria = MARIA.replace("%WORDS%", json.dumps(words)).replace("%MOODS%", json.dumps(moods)).replace("%PROPS%", json.dumps(props)) \
        .replace("%TOTAL%", str(total)).replace("%EXIT%", str(exit_at))
    open(os.path.join(ROOT, "compositions", "maria.html"), "w", encoding="utf-8").write(maria)

    # ── scenes ──
    for b in plan:
        frag = open(os.path.join(ROOT, "scenes", f"{b['id']}.html"), encoding="utf-8").read()
        style, rest = frag.split("<!--markup-->")
        markup, js = rest.split("<!--script-->")
        label = f'<div class="time mask"><span id="{b["id"]}-time">{b["label"]}</span></div>' if b["label"] else ""
        html = SCENE.replace("%ID%", b["id"]).replace("%STYLE%", style).replace("%LABEL%", label).replace("%MARKUP%", markup) \
            .replace("%JS%", js).replace("%TIMEJS%", f'    rise("#{b["id"]}-time", 0.05);' if b["label"] else "").replace("%K%", f"{b['K']:.4f}")
        open(os.path.join(ROOT, "compositions", f"{b['id']}.html"), "w", encoding="utf-8").write(html)

    print(f"total {total}s")
    for b in plan:
        print(f'{b["id"]} start {b["start"]:7.2f} dur {b["dur"]:6.2f} {"voz" if b["real"] else "ESTIMADO"}')


# (block, seconds into the block, file, volume)
SFX = [
    ("c01", 7.9, "pop", 0.5), ("c01", 9.6, "pop", 0.5),
    ("c05", 2.5, "click-soft", 0.6),
    ("c06", 7.0, "pop", 0.5),
    ("c09", 4.6, "typing", 0.35), ("c09", 6.3, "notification", 0.5),
    ("c10", 0.5, "whoosh-short", 0.4),
    ("c13", 1.6, "typing", 0.3),
]

INDEX = """<!doctype html>
<html lang="es" data-composition-variables='[{"id":"whatsapp","type":"string","label":"WhatsApp","default":"+502 5568-3004"}]'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #f5f8fa; }
      #root { position: relative; width: 100%; height: 100%; font-family: "Outfit", sans-serif; color: #121826; }
      #paper { position: absolute; inset: 0; background-color: #f5f8fa;
        background-image: linear-gradient(#e3ebf0 1px, transparent 1px), linear-gradient(90deg, #e3ebf0 1px, transparent 1px);
        background-size: 48px 48px; }
      #maria { z-index: 20; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="%TOTAL%" data-width="1920" data-height="1080">
      <div id="paper"></div>
%HOSTS%
      <div id="maria" data-composition-id="maria" data-composition-src="compositions/maria.html" data-start="0" data-duration="%TOTAL%" data-track-index="2" data-track-kind="graphics" data-width="1920" data-height="1080"></div>
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
    #root { position: absolute; inset: 0; font-family: "Outfit", sans-serif; color: #121826; }
    .mask { display: block; overflow: hidden; }
    .mask > span { display: block; }
    .time { position: absolute; left: 80px; top: 84px; }
    .time > span { font-size: 84px; font-weight: 700; color: #1e4d68; letter-spacing: -0.02em; line-height: 1.12; }
    .ui { position: absolute; display: block; height: auto; border-radius: 14px; border: 1px solid #e3e8ee; background: #fff; box-shadow: 0 22px 56px rgba(18, 24, 38, 0.14); }
    .ring { position: absolute; border: 5px solid #e07a5f; border-radius: 12px; opacity: 0; }
    .h { font-weight: 700; color: #1e4d68; letter-spacing: -0.02em; line-height: 1.1; }
    .card { position: absolute; background: #fff; border: 1px solid #e3e8ee; border-radius: 18px; box-shadow: 0 22px 56px rgba(18, 24, 38, 0.12); }
%STYLE%
  </style>
  <div id="root" data-composition-id="%ID%" data-width="1920" data-height="1080" data-layout-allow-overflow>
    %LABEL%
%MARKUP%
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    const K = %K%;
    const at = (t) => t * K;
    const rise = (s, t, d = 0.5) => tl.fromTo(s, { yPercent: 115 }, { yPercent: 0, duration: d, ease: "expo.out" }, at(t));
    const wipe = (s, t, d = 0.6) => tl.fromTo(s, { clipPath: "inset(0 0 100% 0 round 14px)" }, { clipPath: "inset(0 0 0% 0 round 14px)", duration: d, ease: "power3.out" }, at(t));
    const wipeX = (s, t, d = 0.7) => tl.fromTo(s, { clipPath: "inset(0 100% 0 0 round 14px)" }, { clipPath: "inset(0 0% 0 0 round 14px)", duration: d, ease: "power2.inOut" }, at(t));
    const pop = (s, t) => tl.fromTo(s, { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: 0.42, ease: "back.out(1.8)" }, at(t));
    const slide = (s, t, x = -120) => tl.fromTo(s, { x: x, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: "expo.out" }, at(t));
    const gone = (s, t, d = 0.35) => tl.to(s, { opacity: 0, scale: 0.97, duration: d, ease: "power2.in" }, at(t));
    const ring = (s, t) => tl.fromTo(s, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, at(t));
%TIMEJS%
%JS%
    window.__timelines["%ID%"] = tl;
  </script>
</template>
"""

MARIA = open(os.path.join(ROOT, "templates", "maria.tpl.html"), encoding="utf-8").read() if os.path.exists(os.path.join(ROOT, "templates", "maria.tpl.html")) else ""

if __name__ == "__main__":
    main()
