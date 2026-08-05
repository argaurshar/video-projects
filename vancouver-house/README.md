# Vancouver House — architecture explainer video

A 90-second vertical (9:16) explainer in the format of the supplied reference video,
rebuilt for a different project.

- **Subject:** Vancouver House — BIG / Bjarke Ingels Group, Vancouver. 59 storeys, 149m.
- **Format reference:** the Leeza SOHO video. Structure lifted, palette and branding replaced.
  See [`reference-analysis.md`](reference-analysis.md) for the frame-by-frame decode.

## Why this project

The reference video's whole mechanism is *hidden infrastructure dictates a weird form* — a
subway tunnel under the site forces Leeza SOHO to split in two. Vancouver House has the same
narrative DNA and a completely different result:

> A triangular sliver of land between three bridge off-ramps, plus a rule banning building
> within 30m of the bridge — a rule that turns out to apply **only below 30m of height**. So the
> tower is pinched at the base, then flares back out over the bridge, morphing from a triangle
> to a rectangle and roughly doubling its floorplate on the way up.

Reads as a sibling to the reference, not a clone. The triangle-to-rectangle morph is one
continuous transformation, which is what start/end keyframe video generation handles best.

## Files

| File | What it is |
|---|---|
| [`reference-analysis.md`](reference-analysis.md) | Frame-by-frame decode of the source video |
| [`script.md`](script.md) | 14-beat narration script with timings and sources |
| [`prompts/keyframes.md`](prompts/keyframes.md) | The 14 image prompts + locked style block |
| [`keyframes/`](keyframes/) | The 13 generated stills + `MANIFEST.md` + contact sheet |

## Palette — ours, not the reference's

The user chose *same format, own palette*. The reference is neutral grey + sage green; ours is
slate blue + teal + bone white, with **amber reserved exclusively for constraint geometry**
(setbacks, dimension lines, sun arcs). Same legibility, clearly a different channel.

## Banner line

The reference's banner — *"Finally you found a page dedicated to Explaining Architecture"* — is
the original channel's branding and is **not** reused. **Chosen replacement:**

> **Every weird building has a reason. Here's this one.**

Rendered as 2 lines, white serif, top-left of the deep-charcoal upper bar, static throughout.

## Pipeline

1. **Images (current stage).** Generate K01-K13 at 9:16 2k via Magnific `seedream-5-pro`, with
   K13 (the approved clay hero) passed as an `image` reference to every other frame so the city
   context and model scale stay identical. K14 is a licensed real photograph, not generated.
2. **Video.** Chain consecutive stills as `keyframes.start` / `keyframes.end` into
   `kling-3.0` or `bytedance-seedance-pro-2.0` at 9:16 1080p, ~5-7s per clip, 13 clips.
3. **Assembly.** `video_concatenate`, then burn in the charcoal letterbox, the static banner,
   and one-word-at-a-time karaoke captions with ffmpeg. Narration via `audio_tts`.

## Status

- [x] Reference video decoded frame-by-frame
- [x] Project selected and researched
- [x] Script written and fact-checked against sources
- [x] Style lock generated (2 candidates) and approved — tight/warm variant
- [x] K01-K13 generated, all reference-chained to the style lock
- [ ] Regenerate K09 (plaza beat doesn't read yet — see `keyframes/MANIFEST.md`)
- [ ] Source the licensed closing photograph (K14)
- [ ] Video chain — 12 clips, consecutive stills as start/end keyframes
- [ ] Assembly — concat, letterbox, banner, karaoke captions, TTS narration

## Note on the sandbox

The Magnific CDN host is blocked by this environment's egress proxy, so generated images
cannot be fetched with `curl`. Retrieve them via `creation_status` with `inlineImage: true`
and decode the returned `data:` URI locally.
