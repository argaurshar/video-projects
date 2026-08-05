#!/usr/bin/env bash
# Final assembly for the Vancouver House explainer.
#
# Run this locally (not in the Claude sandbox — that environment's egress policy
# blocks the Magnific CDN, so the clips cannot be downloaded there).
#
#   1. Download the 12 clips from the Magnific account into ./clips as
#      01.mp4 ... 12.mp4, in storyboard order.
#   2. Put the licensed closing photograph at ./assets/payoff.jpg
#   3. ./build.sh
#
# Requires: ffmpeg with libx264, freetype and subtitles filters.

set -euo pipefail
cd "$(dirname "$0")"

W=1080; H=1920
BANNER="Every weird building has a reason. Here's this one."
SERIF="${SERIF_FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf}"
SANS="${SANS_FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf}"

mkdir -p out

# ---------------------------------------------------------------- 1. captions
python3 make_captions.py > out/captions.srt

# ------------------------------------------------------- 2. concat the clips
: > out/concat.txt
for i in $(seq -w 1 12); do
  [ -f "clips/${i}.mp4" ] || { echo "missing clips/${i}.mp4" >&2; exit 1; }
  echo "file 'clips/${i}.mp4'" >> out/concat.txt
done
ffmpeg -y -f concat -safe 0 -i out/concat.txt -c:v libx264 -crf 17 -pix_fmt yuv420p out/chain.mp4

# ------------------------------------- 3. the payoff: 6s slow push on the photo
ffmpeg -y -loop 1 -i assets/payoff.jpg -t 6 \
  -vf "scale=${W}:-2,zoompan=z='min(zoom+0.0006,1.10)':d=150:s=${W}x${H}:fps=25,format=yuv420p" \
  -c:v libx264 -crf 17 out/payoff.mp4

# --------------------------------------------------- 4. join chain + payoff
printf "file 'chain.mp4'\nfile 'payoff.mp4'\n" > out/final_concat.txt
ffmpeg -y -f concat -safe 0 -i out/final_concat.txt -c copy out/joined.mp4

# ------------------------- 5. letterbox + banner + karaoke captions + narration
# Deep charcoal (not pure black) letterbox: 22% top, 5% bottom.
TOP=$((H * 22 / 100))
BOT=$((H * 5 / 100))
INNER=$((H - TOP - BOT))

ffmpeg -y -i out/joined.mp4 -i assets/narration.mp3 \
  -filter_complex "\
    [0:v]scale=${W}:${INNER}:force_original_aspect_ratio=increase,crop=${W}:${INNER}[v]; \
    color=c=0x1A1A1C:s=${W}x${H}:d=1[bg]; \
    [bg][v]overlay=0:${TOP}:shortest=1[framed]; \
    [framed]drawtext=fontfile='${SERIF}':text='${BANNER}':fontcolor=white:fontsize=44:\
x=40:y=$((TOP / 2 - 30)):line_spacing=8[bannered]; \
    [bannered]subtitles=out/captions.srt:force_style='FontName=DejaVu Sans,Bold=1,\
Fontsize=30,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,\
Shadow=2,Alignment=2,MarginV=$((H * 38 / 100))'[out]" \
  -map "[out]" -map 1:a -shortest \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k \
  out/vancouver-house.mp4

echo "-> out/vancouver-house.mp4"

# ------------------------------------------------------------------ dimension
# labels (30m on beats 3 and 5, floor-area on beat 8) are NOT drawn here.
# They are deliberately omitted from the renders because image models draw
# numerals unreliably. Add them as timed drawtext filters once you have eyeballed
# where the dashed lines actually land in the rendered clips, e.g.:
#
#   drawtext=fontfile='${SANS}':text='30m':fontcolor=0xE0A050:fontsize=34:\
#   x=700:y=1180:enable='between(t,16,22)'
