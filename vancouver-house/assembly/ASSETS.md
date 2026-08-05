# Rendered assets

All video and audio lives in the Magnific account. It could not be committed here:
this sandbox's egress policy blocks the Magnific CDN host, so the rendered files
cannot be downloaded from inside the Claude session. The links below are the
canonical copies — download them from a normal machine to run `build.sh`.

## Finished animation

**[Full animation cut — 80s, 1080x1920, no captions](https://www.magnific.com/app/creation/iGZJam73uK)**

Assembled from the 12 clips below in storyboard order. Two intermediate halves exist
if you need to re-cut: [part A, beats 1-6](https://www.magnific.com/app/creation/N23wthT6D9)
and [part B, beats 7-12](https://www.magnific.com/app/creation/8amMSyBIrU).

## Narration

**[Voiceover — Henry Beckett, ElevenLabs v3](https://www.magnific.com/app/creation/gOwkMYuSXO)**

British documentary register, stability 0.55, speed 1.0. Save as `assembly/assets/narration.mp3`.

## The 12 clips

Model: Kling 2.5, 1080p, 9:16, start/end keyframes taken from consecutive stills in
`../keyframes/`. Duration is weighted to narrative load — 10s on the four beats that
carry the argument, 5s elsewhere.

| # | Transition | Beat | Dur | Link |
|---|---|---|---|---|
| 01 | K01 → K02 | Hook: the worst-shaped land | 5s | [clip](https://www.magnific.com/app/creation/w4Ox3nr7EI) |
| 02 | K02 → K03 | The 30m condition lands | 5s | [clip](https://www.magnific.com/app/creation/Lwgb613swO) |
| 03 | K03 → K04 | The splinter extrudes | 5s | [clip](https://www.magnific.com/app/creation/u5HtgFLQLD) |
| 04 | K04 → K05 | **The discovery: the zone is only 30m tall** | 10s | [clip](https://www.magnific.com/app/creation/Sy7129AUb8) |
| 05 | K05 → K06 | **The flare out over the bridge** | 10s | [clip](https://www.magnific.com/app/creation/rgLF9PKxtc) |
| 06 | K06 → K07 | **The floorplate morph** | 10s | [clip](https://www.magnific.com/app/creation/gOwkZnRSXO) |
| 07 | K07 → K08 | **Rise to top-down, area doubled** | 10s | [clip](https://www.magnific.com/app/creation/Sy712TBUb8) |
| 08 | K08 → K09 | Descend to the plaza | 5s | [clip](https://www.magnific.com/app/creation/8amM5cgIrU) |
| 09 | K09 → K10 | Rise to the shadow study | 5s | [clip](https://www.magnific.com/app/creation/lJUKRkKgv9) |
| 10 | K10 → K11 | Drop to the blade read | 5s | [clip](https://www.magnific.com/app/creation/nVciInBYQD) |
| 11 | K11 → K12 | Flatiron fades in | 5s | [clip](https://www.magnific.com/app/creation/IfhDkvUtvE) |
| 12 | K12 → K13 | Flatiron fades out, final form | 5s | [clip](https://www.magnific.com/app/creation/JNPLMprOq4) |

One earlier clip 01 exists on Seedance 2.0 Pro rather than Kling 2.5, generated as a
cost probe before the model was switched. It is superseded and should not be used.

## Not verified

**The motion in these clips has not been reviewed.** The CDN block means the rendered
video could not be fetched or frame-sampled inside the session, and `creation_status`
inlines stills only. Watch the full cut before assembly and check specifically:

1. **Clip 06, the floorplate morph.** The hardest ask in the set — the amber wireframes
   have to draw in cleanly without the tower's geometry swimming.
2. **Clips 07 and 09**, which arc the camera to a top-down view. Long vertical camera
   moves are where these models most often lose the model's rigidity.
3. **Clip 03**, where the tower extrudes from the ground. Growth animations sometimes
   read as the camera moving instead.

Any clip that fails re-renders on its own for ~325 credits (5s) or ~650 (10s) without
touching the rest of the chain.

## Costs

12 clips ≈ 5,200 credits · narration 302 · 15 stills ≈ 1,500. The single Seedance probe
clip cost 4,900 on its own, which is why the chain moved to Kling 2.5.
