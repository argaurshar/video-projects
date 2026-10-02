# House build sequence (Three.js geometry + camera pass)

A deterministic 15 s, 1920×1080, 30 fps clay-model animation of a single-storey house being built
in 12 phases, with one continuous drone move ending on a dollhouse cutaway hero frame.

This is a geometry and camera pass for later AI passes (photoreal still from `last_frame.png`, then a
video-to-video pass). It is built for clean, readable, stable frames, not realism.

## Deliverables

| File | What it is |
| --- | --- |
| `house_3d.mp4` | 1920×1080, 30 fps, 450 frames, exactly 15.0 s, H.264 CRF 12, yuv420p |
| `last_frame.png` | Frame 449 at full resolution: the hero still for the image model |
| `timeline.json` | Phase start/end times, every element's animation window, camera keys, per-frame camera position/target/FOV |
| `index.html`, `main.js` | Page + engine (renderer, lights, camera rig, `window.renderAt(t)`, preview UI) |
| `config.js` | The one config object: colours, lighting, phase timings, plan dimensions, camera keys |
| `builders.js` | One builder function per phase + furniture library + animators |
| `render.mjs` | Puppeteer exporter (frames → ffmpeg → mp4) |

## Preview

ES modules need http, not `file://`.

```bash
npm install            # three (pinned 0.186.1) + puppeteer-core
npm run preview        # http://localhost:8080
```

Space plays/pauses, ←/→ step one frame, the scrubber jumps anywhere. The readout shows time, frame
and the active phase. `?t=14.97` opens paused on a given time. `?export=1` shows the bare 1920×1080
export canvas with no UI.

## Export

```bash
npm run render                         # frames/ + house_3d.mp4 + last_frame.png + timeline.json
node render.mjs --still 14.97          # single frame -> still.png
node render.mjs --stills 0,5,10,14.97  # review stills -> stills/
node render.mjs --frames 120:180       # partial range, no encode
node render.mjs --timeline-only
node render.mjs --workers 3            # parallel browsers
```

The exporter starts a local static server, opens `index.html?export=1` at 1920×1080 with device
scale factor 1, calls `renderAt(i / 30)` for i = 0…449, reads each frame straight from the WebGL
canvas (`toDataURL`, no screen capture), then runs exactly:

```
ffmpeg -framerate 30 -i f_%04d.png -c:v libx264 -crf 12 -pix_fmt yuv420p house_3d.mp4
```

Chrome is found automatically (macOS/Linux/Windows paths), or set `CHROME_PATH=/path/to/chrome`.
`--swiftshader` forces software GL, which gives identical pixels on any machine. A full render took
3 min 20 s on 4 CPU cores with SwiftShader. three.js loads from jsDelivr through the importmap.
During export, those requests are answered from `node_modules/three`, so the version is pinned and
export works offline.

## Determinism

- Every element is a track on one `Timeline`: a pure function of `t`. `renderAt(t)` sets the whole
  scene from `t` alone, so frames can be rendered in any order.
- No `Math.random` in our code. Tree sizes and book blocks use a seeded mulberry32. `index.html` also
  swaps `Math.random` for a seeded PRNG in case any library calls it.
- No clocks, physics or accumulated state in export. The preview clock only drives the preview.
- Verified: frames 13, 200, 420 and 449 re-rendered in separate browser sessions are byte-identical
  to the batch render. Frames 435–449 are byte-identical to each other (a true 0.5 s hold).
- Pop check: the ffmpeg scene-change score between consecutive frames never exceeds 0.004.

## Changing things

Everything editable lives in `config.js`:

- `colors`: every material colour (clay walls, ground, deck, water, lines, trees…).
- `lighting`: sun position/colour/intensity, shadow softness, hemisphere fill, fog, AO mode.
- `phaseLength`, `phases`, `anim`: phase timings and default animation lengths.
- `plan`: plot, house grid, wall thickness, openings, partitions, terrace, pool, deck, parking,
  paths, trees. Swap in the real A-00 / A-01 numbers here.
- `camera.keys`: spherical camera keys (azimuth, pitch, distance, target) at given times.

Each phase is one function in `builders.js` (`phase01SetOut` … `phase12Finished`).

## Build sequence (12 × 1.25 s)

| # | Time (s) | Phase | What animates |
| --- | --- | --- | --- |
| 01 | 0.00–1.25 | Site set-out | Teal plot line draws itself, terracotta pool line, footprint pad grows |
| 02 | 1.25–2.50 | Foundation & pool dig | Slab extrudes up (0.30 m), pool shell sinks 1.4 m |
| 03 | 2.50–3.75 | Facade walls | Four 0.25 m walls extrude in turn, then the openings are cut |
| 04 | 3.75–5.00 | Partitions & bathroom | Partitions, door leaves, front door, bath, shower, vanity, WC |
| 05 | 5.00–6.25 | Study & bedroom | Desk, chair, shelving, bed, nightstands, wardrobe |
| 06 | 6.25–7.50 | Kitchen & dining | Kitchen run, tall unit, uppers, island, 3 stools, table, 6 chairs |
| 07 | 7.50–8.75 | Living room | Rug, TV unit, sofa, coffee table, armchair, plant |
| 08 | 8.75–10.00 | Roof slab | Terrace columns rise, the L-shaped roof lowers into place |
| 09 | 10.00–11.25 | Terrace & pool deck | Terrace paving, paths, timber deck sweep, coping, outdoor dining set |
| 10 | 11.25–12.50 | Pool fill & garden | Water rises, lawn tint, gravel parking, perimeter wall, 10 trees grow |
| 11 | 12.50–13.75 | Finishing touches | Window frames + glazing, loungers, parasol, planters, bollards, gate |
| 12 | 13.75–15.00 | The finished house | Roof lifts 5 m and fades (13.75–14.50), then a 0.5 s still hold |

Elements use cubic in-out or ease-out with a 0.5–0.9 s duration, staggered. Walls extrude,
furniture drops 1.2 m while growing from zero with a small squash-and-settle, and trees grow from
scale 0. Nothing appears at full size on a single frame.

## Camera

One continuous move with no cuts and no roll. Each spherical channel (azimuth, pitch, distance,
target) is a non-uniform Catmull-Rom Hermite spline in time. Its tangents are limited so the path
never overshoots or reverses, and they are zero at both ends.

| t (s) | Azimuth | Pitch | Distance | Note |
| --- | --- | --- | --- | --- |
| 0.0 | −97° (W) | 15° | 41 m | low, wide view of the empty plot |
| 3.0 | −90° | 18° | 37 m | push-in begins |
| 6.5 | −32° | 30° | 31 m | looking into the rooms as they fill |
| 10.0 | +18° (SSE) | 35° | 35 m | ~110° of orbit since 3 s |
| 14.5 | +21° | 57° | 46 m | high 3/4 hero view, held still to 15.0 |

FOV 38°. Azimuth is measured from south towards east. The street is on the north side, so the move
stays on the garden side.

## Look

Matte clay (`MeshStandardMaterial`, roughness ~0.9, no textures, no text). ACES Filmic, sRGB output,
exposure fixed at 1.0. One warm sun from the south-west at about 47° elevation with 4096² PCF soft
shadows, plus a hemisphere fill and light fog on a pale neutral background. No bloom, DOF, motion
blur, vignette or grain.

**Ambient occlusion:** baked contact shadows by default. These are soft analytic gradients under
every wall, piece of furniture, column, tree and the slab, and they fade in with their object.
Screen-space GTAO is available (`lighting.ao.mode = 'gtao'`), but it isn't the default. Its depth
pass can't represent the half-transparent roof in phase 12, so the AO would change abruptly the
moment the roof disappears. For the same reason, the roof's shadow comes from an invisible proxy
that shrinks away as the roof fades. A dithered transparent shadow would add noise.

**Shadows:** three r186 removed `PCFSoftShadowMap`. `PCFShadowMap` with `shadow.radius = 3` gives
the same soft filtered result.

## Plan and assumptions

**Input mismatch, please check.** The brief refers to A-00 (site plan) and A-01 (floor plan). The
attached image is neither. It shows a different, larger two-storey villa (stairs, lift, void
above, maid's and driver's rooms, carport). No site plan was attached. So the model is built from
the written programme in section 5 of the brief, which is self-consistent:

- **Grid.** Bays 3.13 / 2.50 / 9.62 m (west → east) × bands 4.13 / 5.12 m (north → south). The
  brief gives 9.63 and 5.13, which sum to 15.26 × 9.26. Those were trimmed 1 cm so the outer
  dimensions are exactly 15.25 × 9.25 m (141.1 m²).
- **Walls.** Exterior walls are 0.25 m. Partitions are 0.15 m, read as clearer partitions. With
  this grid the net room areas come out as:

  | Room | Model | Brief |
  | --- | --- | --- |
  | Bathroom (bay 1 × band 1) | 10.67 m² | 10.7 m² |
  | Study (bay 2 × band 1) | 8.94 m² | 9.1 m² |
  | Main bedroom (bays 1+2 × band 2) | 25.44 m² | 25.6 m² |
  | Open-plan living / dining / kitchen (bay 3, full depth) | 81.33 m² | 81.5 m² |

  All are within 2%, which strongly suggests this is the intended layout.
- **Bathroom access.** The bathroom is reached from the bedroom (en-suite). The study and bedroom
  open off the open-plan space.
- **Heights.** Floor slab 0.30 m, clear height 2.90 m, flat roof slab 0.30 m with a 0.60 m
  overhang.
- **Covered terrace.** 9.0 × 3.5 m = 31.5 m² off the south side of the open plan, under a roof
  extension carried on three 0.25 m columns. Terrace paving is 0.15 m, one step below the floor.
- **Orientation.** The street is on the north side, the garden, terrace and pool face south, and
  the sun comes from the south-west as specified.
- **Site layout.** None of this was drawn, so all of it is assumed:
  - Plot 32 × 22 m, centred on the origin. The house sits 2 m from the north boundary and 6 m from
    the west one.
  - Pool 8.0 × 3.5 × 1.4 m deep, south of the terrace, with a 0.30 m coping and a timber deck from
    the terrace to 1 m from the south wall.
  - Gravel parking 4 × 9 m on the east side at the vehicle gate.
  - A separate pedestrian gate on the north boundary leads to the front door.
  - A side path runs from the parking to the deck.
- **Perimeter wall.** 0.9 m along the street (San Jose limits front-setback fences to about 3 ft)
  and 1.5 m on the sides and rear.
- **Trees.** No site plan was supplied, so the 10 positions are assumed (`plan.trees`).
- **Plot line.** The teal plot line is drawn 0.26 m inside the boundary, so it stays visible along
  the inner face of the perimeter wall. The pool line rides up onto the coping when it is built.
- **Context.** A sidewalk and road on the north side, in near-ground greys, tell the image model
  where the street is.
- **Deck.** Built as solid strips rather than individual boards: 1–2 cm board gaps would be
  sub-pixel at this distance and shimmer in video.
