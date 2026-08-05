#!/usr/bin/env python3
"""Generate the narration track locally and lay it out against the beat grid.

Uses the HyperFrames CLI's bundled Kokoro TTS, which runs fully offline. This
matters here: the sandbox's egress policy blocks the hosted-TTS CDN, so a
cloud-generated mp3 cannot be fetched back into the session. Local synthesis
removes that dependency entirely.

One clip is synthesised per beat and placed at that beat's start, rather than
reading the script as one continuous take. A single take drifts against the
karaoke captions within a few seconds; per-beat placement keeps voice, captions
and graphics locked together.

Lines that overrun their beat are sped up slightly (never stretched -- slowing
a voice to fill time sounds worse than a fractionally brisk read).

  python3 make_narration.py <outdir>
"""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_overlay as R  # noqa: E402

VOICE = "bm_george"   # British male, documentary register
TAIL = 0.25           # seconds of air left before each beat's cut


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "vo"
    os.makedirs(out, exist_ok=True)
    total = sum(b[1] for b in R.BEATS)
    spec = []

    for name, dur, _a, _b in R.BEATS:
        txt = os.path.join(out, f"{name}.txt")
        wav = os.path.join(out, f"{name}.wav")
        with open(txt, "w") as f:
            f.write(R.LINES[name])
        subprocess.run(["npx", "-y", "hyperframes", "tts", "--text-file", txt,
                        "-o", wav, "-v", VOICE, "-s", "1.0"],
                       check=True, capture_output=True)
        d = float(subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", wav],
            capture_output=True, text=True).stdout.strip())
        spec.append((name, R.STARTS[name], dur, d))
        flag = "  -> speeding up" if d > dur - TAIL else ""
        print(f"  {name:10s} window {dur:4.1f}s  speech {d:5.2f}s{flag}")

    inputs, filters, labels = [], [], []
    for i, (name, start, dur, d) in enumerate(spec):
        tempo = max(1.0, d / (dur - TAIL))
        inputs += ["-i", os.path.join(out, f"{name}.wav")]
        f = f"[{i}:a]"
        if tempo > 1.001:
            f += f"atempo={tempo:.4f},"
        ms = int(start * 1000)
        filters.append(f + f"adelay={ms}|{ms},apad[a{i}]")
        labels.append(f"[a{i}]")

    fc = (";".join(filters) + ";" + "".join(labels)
          + f"amix=inputs={len(spec)}:normalize=0,atrim=0:{total},"
            "alimiter=level_in=1:level_out=0.95[out]")
    track = os.path.join(out, "narration_timed.wav")
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error"] + inputs +
                   ["-filter_complex", fc, "-map", "[out]",
                    "-c:a", "pcm_s16le", track], check=True)
    print(f"-> {track}  ({total:.1f}s)")
    print("Mux with:")
    print(f"  ffmpeg -i vancouver-house-51s.mp4 -i {track} -map 0:v -map 1:a "
          "-c:v copy -c:a aac -b:a 192k -shortest out.mp4")


if __name__ == "__main__":
    main()
