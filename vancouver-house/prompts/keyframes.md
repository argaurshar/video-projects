# Keyframe prompts — Vancouver House explainer

14 stills, 9:16, generated with `seedream-5-pro` at 2k via Magnific.

**Workflow:** K13 (the clay hero) is generated first and approved as the style lock. It is
then passed as an `image` reference to every other prompt so the city context, palette and
model scale stay identical across all 14 frames. Consecutive stills are later chained as
start/end keyframes into video.

**Palette (locked, ours — deliberately not the reference video's):**

| Element | Colour |
|---|---|
| Subject tower | bone-white matte clay |
| Context blocks | cool slate blue-grey |
| Landscape | muted teal-green |
| Water (False Creek) | pale steel-blue |
| Ground plane | flat pale concrete grey |
| **Constraint geometry** | **amber / ochre** — the only accent, used *only* for rules, setbacks, dimension lines and sun arcs |
| Letterbox | deep charcoal (not pure black) |

## Style block

Appended verbatim to every prompt below:

> Everything is a physical architectural study model: the subject tower is smooth matte
> bone-white clay, completely blank with no windows, no mullions and no facade detail, only
> faint horizontal floor-slab lines; the surrounding city is uniform cool slate blue-grey
> untextured extruded blocks; the ground plane is flat pale concrete grey with muted
> teal-green park areas and small stylised toy conifer trees; a channel of pale steel-blue
> water runs along the left edge. Soft studio lighting at neutral 5000K with a single soft
> sun from the upper left casting one clean directional shadow across the ground plane.
> Located in Vancouver. No sky, no clouds, no text, no people, no cars, no glass, no
> reflections, no windows, no signage, and no colour beyond the stated palette.
> Physically-based lighting, matte diffuse surfaces, deep depth of field, clean architectural
> scale-model aesthetic, vertical composition.

---

## K01 — the hook (0:00)

Top-down aerial, 35mm, from directly above. A multi-lane elevated road bridge sweeps in from
the lower edge and forks into three curving ramps, leaving two sharp empty triangular slivers
of bare ground between them. **No tower yet — the slivers are vacant.** The two triangles are
filled with a flat translucent amber wash.

## K02 — the site (0:07)

Three-quarter aerial, 35mm, descending toward one triangular sliver. The vacant amber triangle
is now the clear subject, hemmed by the bridge ramp on one side and a street on the other. Its
sharpness and smallness against the neighbouring slate blocks is the point of the shot.

## K03 — the rule (0:14)

Three-quarter aerial, 35mm. A translucent amber prism, offset thirty metres from the bridge
edge, swallows most of the vacant triangle. Thin black dashed dimension lines with tick marks
run from the bridge edge to the prism face, labelled `30m`. The remaining buildable ground is
a tiny slate-grey remnant.

## K04 — the naive answer (0:22)

Three-quarter view, 50mm, low aerial. A thin bone-white triangular prism is extruded to full
height straight up from the tiny remnant, hugging the bridge — a mean, splinter-thin tower with
no flare and no cantilever. Deliberately unattractive massing. The amber setback prism remains
visible at the base.

## K05 — the discovery (0:29)

Three-quarter view, 50mm. The amber setback prism is revealed to be **only thirty metres tall**
— a low amber slab at the base with clear empty air above it. A vertical black dashed dimension
line runs up the side of the amber slab labelled `30m`, and a second dashed line continues
upward through the empty air above it, unlabelled and open.

## K06 — the move (0:38)

Three-quarter view, 50mm. The tower is pinched to a sharp triangle below the amber thirty-metre
line, then begins visibly flaring and leaning outward above it, cantilevering back out over the
bridge deck. The amber slab stays at the base as the reason for the pinch.

## K07 — the morph (0:46)

Three-quarter view, 50mm, slightly elevated. The tower is rendered as a ghosted translucent
bone-white mass with **four stacked amber wireframe floorplate outlines** visible through it at
even intervals — a sharp narrow triangle at the base, opening progressively, ending as a full
rectangle at the crown.

## K08 — the doubling (0:55)

Top-down aerial, 35mm, straight down on the tower. Two amber wireframe outlines are overlaid on
the roof: the small sharp base triangle nested inside the large crown rectangle, making the
roughly two-to-one area difference immediately readable. Thin black dashed leader lines connect
the two outlines.

## K09 — the plaza (1:02)

Low three-quarter aerial, 28mm, close to the ground. The pinched base of the tower leaves the
ground plane open — a broad pale concrete plaza flows underneath the bridge ramps, dotted with
teal-green planting beds and small toy conifers. The tower's cantilevered upper mass looms
overhead, filling the top of the frame.

## K10 — the shadow rule (1:09)

Top-down aerial, 35mm. A thin amber arc traces the sun's path across the top of the frame, with
small amber tick marks. A long soft directional shadow sweeps from the tower across the ground —
and stops short of a teal-green park block, which stays fully lit. Thin black dashed lines mark
the shadow's edge against the park boundary.

## K11 — the read (1:16)

Three-quarter view, 70mm, eye-level-ish from a neighbouring rooftop. The tower is seen from an
angle where it reads as a thin blade — almost flat, almost twisting. Same building, same model,
no amber geometry. Pure silhouette shot.

## K12 — the ancestry (1:23)

Three-quarter view, 50mm. The bone-white Vancouver House tower stands with a **ghosted
translucent amber silhouette of the Flatiron Building** overlaid beside it at matched scale,
so the shared narrow-wedge-plan logic is visible in one glance.

## K13 — the clay hero (1:28) — STYLE LOCK

*(This is the frame already generated and approved. It is the reference image for all others.)*

Three-quarter aerial, 50mm, from roughly 150 metres altitude, camera close so the tower fills
the majority of the vertical frame. Slender 59-storey residential tower whose floorplate morphs
from a sharp narrow triangle at its pinched base to a full wide rectangle at its crown, flaring
outward as it rises and cantilevering over a multi-lane elevated road bridge that forks into
three curving ramps at its foot. No amber geometry — the finished argument, clean.

## K14 — the payoff (1:29-1:31)

**Not AI-generated.** This must be a real, correctly licensed photograph of the completed
Vancouver House, cross-faded from K13. Generating a synthetic "photo" of a real building and
presenting it as documentary would misrepresent the building — the whole point of the ending is
that it is the real thing. Source a licensed image before assembly.

---

## Honest limitation

These prompts control the *picture*, not the architecture. The model will not read the site,
will not size a member, and will melt geometry and invent junctions if unchecked — particularly
the floorplate morph in K06/K07, which is the hardest thing here for it to keep consistent.
Every frame needs checking against the massing logic before it goes into the video chain.

## Nine choices (swap any one word)

Shot: three-quarter aerial (varies per frame) · Camera: 35-70mm · Subject: 59-storey residential
tower · Material: matte bone-white clay / slate blue-grey blocks / teal-green landscape · Light:
soft studio 5000K, single sun upper-left · Style: clay white model (massing) · Context: Vancouver,
Granville Bridge, False Creek · Exclusion: no sky, people, cars, glass, windows, text ·
Technical: PBR, matte diffuse, deep depth of field.

**Most likely single improvement:** if the morph reads weakly, change `flaring outward` to
`its floorplate rotating and widening` — this pushes the model toward showing the plan change
rather than a simple taper.
