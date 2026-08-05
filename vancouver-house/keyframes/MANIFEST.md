# Keyframes — generated

13 stills, 9:16, `seedream-5-pro` at 1440x2560. `K13_hero.jpg` was generated first and
approved as the style lock; every other frame was generated with it passed as an `image`
reference, which is why the city context, bridge geometry, palette and camera distance stay
consistent across the set.

Full-resolution originals also live permanently in the Magnific account (this container is
ephemeral; these committed copies are the durable record).

| File | Beat | Script timing | Reads correctly? |
|---|---|---|---|
| `K01_hook.jpg` | Amber triangular slivers between the bridge ramps, no tower | 0:00-0:07 | Yes |
| `K02_site.jpg` | One vacant amber sliver, closer | 0:07-0:14 | Yes |
| `K03_rule.jpg` | Setback prism swallows most of the lot | 0:14-0:22 | Yes |
| `K04_naive.jpg` | The splinter tower — deliberately terrible | 0:22-0:29 | Yes, reads as a needle |
| `K05_discovery.jpg` | The amber zone revealed as low; open air above | 0:29-0:38 | Yes |
| `K06_move.jpg` | Pinched below, flaring and leaning out above | 0:38-0:46 | Yes |
| `K07_morph.jpg` | Amber wireframe floorplates, triangle to rectangle | 0:46-0:55 | Yes |
| `K08_doubling.jpg` | Top-down, small triangle nested in large rectangle | 0:55-1:02 | Yes |
| `K09_plaza.jpg` | Pinched base, ground given back | 1:02-1:09 | **Weakest** — reads as a waisted tower more than a plaza |
| `K10_shadow.jpg` | Amber sun arc, shadow stops short of the green park | 1:09-1:16 | Yes |
| `K11_blade.jpg` | The blade read from a rooftop angle | 1:16-1:23 | Yes |
| `K12_flatiron.jpg` | Ghosted amber Flatiron silhouette alongside | 1:23-1:28 | Yes |
| `K13_hero.jpg` | Clean final form — **style lock** | 1:28-1:31 | Yes |

`_contact-sheet.jpg` is a 13-up review sheet of the whole set.

## Known gaps before assembly

1. **No dimension labels.** Every prompt specifies "no text" on purpose — image models render
   numerals unreliably. The `30m` labels for K03 and K05, and the floor-area callout for K08,
   are burned in with ffmpeg at assembly time instead.
2. **K09 is the weak frame.** It renders the pinched waist but not the public plaza underneath
   the bridge. Worth one regeneration with the camera dropped closer to the ground plane and
   the tower pushed to the top edge of frame.
3. **K14 does not exist and must not be generated.** The closing shot is a licensed photograph
   of the completed building. See `../prompts/keyframes.md`.
