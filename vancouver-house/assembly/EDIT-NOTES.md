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

## Two rules learned from QC

**Never draw a plan diagram directly over the building.** The floorplate
comparison was first composited straight onto the tower and read as a gable line
on the facade — a viewer sees a shape *on* the building, not a plan *of* it.
Every plan diagram now sits inside an opaque plate so it is unmistakably a
diagram. The `x2` panel is near-opaque (0.97) because it is the payoff number.

**The plates do not reliably show the massing the graphics assert.** See the
open issue below.

## Open issue: the plates contradict the argument

In several shots the AI plate shows a tower that **tapers inward** as it rises —
wider at the base, narrower at the crown. That is the opposite of Vancouver
House, and the opposite of what the graphics assert directly on top of it.

The graphics layer carries the argument correctly, and keeping all plan diagrams
inside plates means the viewer reads the diagram rather than the plate. But the
background still undercuts the foreground in the doubling and morph beats if you
look at the silhouette.

This cannot be fixed in post. The real fix is one of:

1. Re-generate the affected clips with much more explicit massing language in the
   prompt, and reject any take whose silhouette tapers the wrong way — the
   keyframes themselves (`../keyframes/K13_hero.jpg`, `K05`, `K06`) do show the
   correct pinched base, so the stills are right and the video model drifted off
   them.
2. Or model the massing properly in 3D and render the plates, which is what this
   format really wants and what removes the problem permanently.

Option 1 is cheap (325-650 credits per clip) and worth trying first.

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
