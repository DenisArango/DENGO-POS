"""Replace screencast frames that a mid-recording screenshot corrupted (zoomed/partial frames)
with the last good frame. python deglitch.py shared/rec/x.mp4 [...]"""
import subprocess, sys, os

W, H = 48, 48


def frames(path):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
    n = W * H
    return [raw[i:i + n] for i in range(0, len(raw) - n + 1, n)]


def diff(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


for path in sys.argv[1:]:
    fr = frames(path)
    bad = set()
    for i in range(1, len(fr)):
        if i in bad:
            continue
        # a run of frames that differ from the frame before it, ending when the picture returns to it
        if diff(fr[i], fr[i - 1]) > 18:
            for j in range(i + 1, min(i + 12, len(fr))):
                if diff(fr[j], fr[i - 1]) < 12:
                    bad.update(range(i, j))
                    break
    if not bad:
        print(path, "ok"); continue
    runs, cur = [], None
    for i in sorted(bad):
        if cur and i == cur[1] + 1:
            cur[1] = i
        else:
            cur = [i, i]; runs.append(cur)
    parts, cur = [], "0:v"
    for k, (a, b) in enumerate(runs):
        parts.append(f"[{cur}]split[a{k}][b{k}];[a{k}][b{k}]freezeframes=first={a}:last={b}:replace={a - 1}[v{k}]")
        cur = f"v{k}"
    chain = ";".join(parts)
    tmp = path + ".tmp.mp4"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-filter_complex", chain, "-map", f"[{cur}]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-g", "30", "-an", tmp], check=True)
    print(path, "froze", len(bad), "frames at", [round(a / 30, 2) for a, _ in runs])
    os.replace(tmp, path)
