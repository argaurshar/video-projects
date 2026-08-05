# Reference video — format decode

Source: `2d6e769a-Video66852.mp4` (user-supplied, 90.93s, 720x1280, 30fps, h264).
Subject: **Leeza SOHO, Beijing** — Zaha Hadid Architects.

Analysed frame-by-frame: contact sheets at 1 fps across the full runtime, plus 4 fps
across the first 16s. Audio transcription was unavailable (the sandbox proxy blocks the
Whisper model download), but the video burns its script in as word-by-word karaoke
captions, so the on-screen captions *are* the script and were read directly from frames.

## Layout

| Element | Spec |
|---|---|
| Canvas | 720x1280 (9:16) |
| Letterbox | Solid black bar top (~22% of frame height) + thin black bar bottom (~5%) |
| Banner | 2 lines, white serif, top-left of the upper black bar, static for the whole runtime |
| Captions | One word at a time, centred, ~58% frame height, bold white sans, heavy black drop shadow |
| Caption rate | ~3 words/sec |
| Payoff | Final ~6s hard-cuts to 5 real photographs, then the name reveal |

## Render style

- Matte white clay tower, entirely blank — no windows, no mullions, no facade detail.
- Mid-grey neutral untextured context blocks.
- Pale sage-green landscape, tiny stylised toy conifers.
- One soft sun, single clean directional shadow. No sky.
- Camera: slow continuous orbit + dolly. **Never cuts** until the photo payoff.
  Camera height tracks the argument — eye-level for foundations, top-down for the twist.

## Colour discipline

Only three things ever break the greyscale, and each one carries meaning:

1. White speed-ribbons — wind.
2. A blue-grey glass strip — the atrium void.
3. Black dashed dimension lines with `H` / `H/15` labels — the code rule.

## The argument structure (the actual product)

| Time | Beat |
|---|---|
| 0-13s | **Rule, then problem.** "To support a building over 200m tall you normally bury at least one fifteenth of the structure underground." Shown as an `H` / `H/15` dimension diagram. |
| 13-25s | **The obstacle.** A subway tunnel cuts diagonally under the site; the foundation would slice straight through it. Drawn as a white tube under the plinth, Chinese signage on the ground. |
| 25-45s | **The move.** The mass splits along the tunnel line. A vertical seam opens; the tower becomes two halves standing independently, connected only by glass above. |
| 45-70s | **The consequence.** The void becomes a 194m atrium, rotating 45 degrees as it rises to realign with the street grid. Sky-bridge rings appear as structural ties and public corridors. |
| 70-85s | **The flourish.** Top-down orbit over the two teardrop roof openings and the spiral. |
| 85-91s | **Payoff.** "Congratulations, you now know Leeza SOHO, Beijing" over real photographs. |

## Why it works

1. **The form is never presented as a style choice.** Every geometric move is forced by a
   constraint the viewer accepted ten seconds earlier. There is no aesthetic claim to argue with.
2. **The clay-white palette removes aesthetic judgement.** You cannot like or dislike the
   colour, so you only read geometry.
3. **The photo is a reward, not an opener.** It arrives only once you understand the building,
   which converts comprehension into a payoff.

## What we lift, and what we do not

Lift: the argument structure, the single-orbit camera, the caption rhythm, the
constraint-before-form ordering, the photo-as-reward ending.

Do not lift: the banner line "Finally you found a page dedicated to Explaining
Architecture" (that is the original channel's branding) and the exact palette. See
`README.md` for the replacement palette and banner options.
