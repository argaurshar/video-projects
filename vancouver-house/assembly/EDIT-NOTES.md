# Why the 80s cut was rebuilt

The first pass asked the image-to-video model to animate the explanation itself:
dimension lines drawing in, floorplate outlines resolving, a setback volume
collapsing. Reviewed frame by frame, it failed on every count.

| Intended | What actually rendered |
|---|---|
| Floorplate wireframes resolving triangle → rectangle | Amber scribbles on the facade |
| Setback prism collapsing to a 30 m slab | A formless orange blob at the base |
| Nested triangle-in-rectangle on the roof | An amber diamond, meaning nothing |
| Tower morphing triangle-base → rectangle-crown | A plain tapered obelisk; the morph never happens |
| A state change every 1-2s | Seconds of near-identical camera drift |

Plus no text, numbers or labels anywhere — so nothing informative was ever on
screen. 80 seconds of handsome drift.

**The conclusion: the informative layer cannot be prompted, it has to be
authored.** Image-to-video models do camera moves and soft morphs. They do not
do technical drawing.

## The rebuild

The AI clips are demoted to what they are genuinely good at — beautiful,
consistent background plates — and every informative element is drawn as real
vector graphics in `render_overlay.py`, composited per frame.

1. **Retimed.** 11 sub-ranges sliced out of the 80s cut, each sped up 1.08x-2.0x.
   Rate follows narrative load: the loophole and morph beats stay slow, the
   camera-drift passages run at 2x. 81s → 51.5s.
2. **Authored graphics.** Information panels, dimension lines with end ticks and
   labels, floorplate plan shapes, an animated ×2 counter, a sun arc, storey
   ticks, a beat progress rail, a persistent spec line, and the closing name card.
3. **Karaoke captions.** One word at a time, matched per beat, drawn in PIL for
   exact control rather than through the `subtitles` filter.

The single most important addition is the **`PLAN AT EACH LEVEL` rail** in the
morph beat — four plan outlines from L01 to L59, drawn as clean polygons that
open from a sharp wedge to a full rectangle. That is the thesis of the whole
video, and the AI never once rendered it.

## Legibility

The plates are bone-white where the tower sits, so white captions and amber
labels disappeared over them. Two fixes, both in `render_overlay.py`:

- `scrim()` — a gradient ramp up from the plate's bottom edge, on every frame,
  guaranteeing the caption band always has contrast.
- `headline()` / explicit backing plates — every headline, the name card and the
  loophole text block sit on their own dark plate. The `HEIGHT` reveal is the
  hinge of the entire argument and was unreadable amber-on-white before this.

## Rebuilding

```bash
python3 assembly/build51.py <80s-cut.mp4> out/
```

Then mux narration:

```bash
ffmpeg -i out/vancouver-house-51s.mp4 -i narration.mp3 \
       -c:v copy -c:a aac -shortest out/vancouver-house-51s-audio.mp4
```

`BEATS` is declared identically in `build51.py` and `render_overlay.py` — change
one and you must change the other, or the graphics will drift out of sync with
the plates.
