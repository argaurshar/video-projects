#!/usr/bin/env python3
"""Build the 51.5s Vancouver House explainer from the 80s AI animation cut.

Pipeline:
  1. Slice 11 sub-ranges out of the 80s cut and retime each (1.08x - 2.0x) so
     pacing follows narrative load rather than being uniform.
  2. Render the authored motion-graphics layer (render_overlay.py).
  3. Composite: charcoal frame -> plate -> graphics.

The AI clips are background plates only. Everything informative is drawn in
render_overlay.py -- see the note at the top of that file for why.

  python3 build51.py <80s-cut.mp4> [outdir]
"""

import os
import subprocess
import sys

# (segment, out_duration, plate_in, plate_out) -- must match BEATS in render_overlay.py
BEATS = [
    ("01", 3.5,  0.0,  5.0),   # site
    ("02", 3.5,  5.0, 10.0),   # bridge
    ("03", 4.0, 10.0, 15.0),   # rule
    ("04", 6.5, 15.0, 22.0),   # obvious
    ("05", 6.0, 22.0, 30.0),   # loophole
    ("06", 6.0, 30.0, 40.0),   # cantilever
    ("07", 7.0, 40.0, 50.0),   # morph
    ("08", 3.5, 50.0, 56.0),   # doubling
    ("09", 4.0, 60.0, 68.0),   # shadow
    ("10", 3.0, 68.0, 74.0),   # reads
    ("11", 4.5, 75.0, 81.0),   # card
]

W, H, PLATE_H, TOP = 1080, 1920, 1514, 310
FPS = 25
TOTAL = sum(b[1] for b in BEATS)
HERE = os.path.dirname(os.path.abspath(__file__))


def run(args):
    subprocess.run(args, check=True)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "out")
    seg, ovl = os.path.join(out, "seg"), os.path.join(out, "overlay")
    os.makedirs(seg, exist_ok=True)

    for name, dur, pin, pout in BEATS:
        rate = (pout - pin) / dur
        vf = (f"setpts=PTS/{rate:.6f},"
              f"scale={W}:{PLATE_H}:force_original_aspect_ratio=increase,"
              f"crop={W}:{PLATE_H},fps={FPS}")
        run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-ss", str(pin),
             "-to", str(pout), "-i", src, "-vf", vf, "-an", "-c:v", "libx264",
             "-crf", "16", "-pix_fmt", "yuv420p", f"{seg}/{name}.mp4"])
        print(f"  {name}  {pout - pin:.1f}s -> {dur:.1f}s  ({rate:.2f}x)")

    lst = f"{seg}/list.txt"
    with open(lst, "w") as f:
        for name, *_ in BEATS:
            f.write(f"file '{seg}/{name}.mp4'\n")
    plate = f"{out}/plate.mp4"
    run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-f", "concat", "-safe", "0",
         "-i", lst, "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", plate])

    run([sys.executable, f"{HERE}/render_overlay.py", ovl])

    final = f"{out}/vancouver-house-51s.mp4"
    run(["ffmpeg", "-nostdin", "-y", "-v", "error",
         "-f", "lavfi", "-i", f"color=c=0x1A1A1C:s={W}x{H}:r={FPS}:d={TOTAL}",
         "-i", plate, "-framerate", str(FPS), "-i", f"{ovl}/%05d.png",
         "-filter_complex",
         f"[0:v][1:v]overlay=0:{TOP}:shortest=1[a];[a][2:v]overlay=0:0:shortest=1[v]",
         "-map", "[v]", "-c:v", "libx264", "-crf", "18", "-preset", "medium",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", final])
    print(f"-> {final}  ({TOTAL:.1f}s)")
    print("Add narration with:")
    print(f"  ffmpeg -i {final} -i narration.mp3 -c:v copy -c:a aac "
          f"-shortest {out}/vancouver-house-51s-audio.mp4")


if __name__ == "__main__":
    main()
