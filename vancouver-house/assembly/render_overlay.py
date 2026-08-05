#!/usr/bin/env python3
"""Author the motion-graphics layer for the Vancouver House explainer.

Why this exists: the image-to-video model cannot draw architectural diagrams.
Asked to animate dimension lines and floorplate outlines it produced amber
scribbles on the facade. So the AI clips are used only as background plates and
every informative element -- dimension lines, plan shapes, counters, panels,
labels, captions -- is drawn here as real vector graphics, frame by frame.

Emits overlay/%05d.png (RGBA, 1080x1920) plus the frame count on stdout.
"""

import math
import os
import sys
from PIL import Image, ImageDraw, ImageFont

# ----------------------------------------------------------------- constants
W, H = 1080, 1920
FPS = 25
TOP = 422           # charcoal bar above the plate
BOT = 96            # charcoal bar below the plate
INNER_TOP = TOP
INNER_BOT = H - BOT
INNER_H = INNER_BOT - INNER_TOP

CHARCOAL = (26, 26, 28, 255)
WHITE = (255, 255, 255, 255)
AMBER = (232, 160, 74, 255)
PARK = (126, 172, 152, 255)
INK = (18, 18, 20, 255)

BANNER = ["Every weird building has a reason.", "Here's this one."]
SPECS = "VANCOUVER HOUSE  ·  BIG  ·  2020"

FDIR = "/usr/share/fonts/truetype/dejavu"
F_SERIF = f"{FDIR}/DejaVuSerif.ttf"
F_SANS = f"{FDIR}/DejaVuSans-Bold.ttf"
F_MONO = f"{FDIR}/DejaVuSansMono-Bold.ttf"

_cache = {}


def font(path, size):
    key = (path, size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(path, size)
    return _cache[key]


# ----------------------------------------------------------------- timeline
# (name, out_duration, plate_in, plate_out)
BEATS = [
    ("site",     3.5,  0.0,  5.0),
    ("bridge",   3.5,  5.0, 10.0),
    ("rule",     4.0, 10.0, 15.0),
    ("obvious",  6.5, 15.0, 22.0),
    ("loophole", 6.0, 22.0, 30.0),
    ("cantilev", 6.0, 30.0, 40.0),
    ("morph",    7.0, 40.0, 50.0),
    ("double",   3.5, 50.0, 56.0),
    ("shadow",   4.0, 60.0, 68.0),
    ("reads",    3.0, 68.0, 74.0),
    ("card",     4.5, 75.0, 81.0),
]

# One word at a time, matched to each beat's window.
LINES = {
    "site":     "This is the worst-shaped plot of land in Vancouver.",
    "bridge":   "Three bridge off-ramps. Nobody built here for decades.",
    "rule":     "The rule: no building within thirty metres of the bridge.",
    "obvious":  "Obey it literally and you get this. A splinter. Tiny floors "
                "facing a highway. Unsellable.",
    "loophole": "But read it again. Thirty metres of height. Above that line, "
                "the air is free.",
    "cantilev": "So the base stays pinched, then the tower leans out over the "
                "bridge and takes the space back.",
    "morph":    "Floor by floor the triangle opens. The sharp corner fattens. "
                "By the top, a full rectangle.",
    "double":   "Same site. Double the floor area.",
    "shadow":   "This curve is the sun. The park next door keeps its light.",
    "reads":    "Slab. Blade. Wedge. One building.",
    "card":     "Not a shape someone wanted. A shape the site allowed.",
}

STARTS = {}
_t = 0.0
for _n, _d, _a, _b in BEATS:
    STARTS[_n] = _t
    _t += _d
TOTAL = _t
NFRAMES = int(round(TOTAL * FPS))


# ------------------------------------------------------------------- easing
def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_in(p, dur, t):
    """Progress 0..1 over `dur` seconds starting at beat-local time `t`."""
    return smooth((p - t) / dur) if dur > 0 else 1.0


def fade(p, hold_in=0.35, hold_out=0.3, dur=1.0):
    """Alpha envelope across a beat of length `dur`."""
    a = smooth(p / hold_in) if hold_in > 0 else 1.0
    b = smooth((dur - p) / hold_out) if hold_out > 0 else 1.0
    return clamp(min(a, b))


def alpha(colour, a):
    return colour[:3] + (int(clamp(a) * 255),)


# ------------------------------------------------------------------ drawing
def dashed(d, p0, p1, colour, width=3, dash=16, gap=12, progress=1.0):
    x0, y0 = p0
    x1, y1 = p1
    total = math.hypot(x1 - x0, y1 - y0) * clamp(progress)
    if total <= 0:
        return
    ux, uy = (x1 - x0), (y1 - y0)
    L = math.hypot(ux, uy) or 1
    ux, uy = ux / L, uy / L
    pos = 0.0
    while pos < total:
        seg = min(dash, total - pos)
        d.line([(x0 + ux * pos, y0 + uy * pos),
                (x0 + ux * (pos + seg), y0 + uy * (pos + seg))],
               fill=colour, width=width)
        pos += dash + gap


def dim_line(d, p0, p1, colour, label=None, width=3, progress=1.0, tick=14,
             font_obj=None, label_bg=True):
    """Technical-drawing dimension line with end ticks and a centred label."""
    x0, y0 = p0
    x1, y1 = p1
    cx = x0 + (x1 - x0) * clamp(progress)
    cy = y0 + (y1 - y0) * clamp(progress)
    d.line([(x0, y0), (cx, cy)], fill=colour, width=width)
    ang = math.atan2(y1 - y0, x1 - x0) + math.pi / 2
    tx, ty = math.cos(ang) * tick, math.sin(ang) * tick
    d.line([(x0 - tx, y0 - ty), (x0 + tx, y0 + ty)], fill=colour, width=width)
    if progress >= 0.99:
        d.line([(x1 - tx, y1 - ty), (x1 + tx, y1 + ty)], fill=colour, width=width)
        if label:
            f = font_obj or font(F_MONO, 40)
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            bb = d.textbbox((0, 0), label, font=f)
            tw, th = bb[2] - bb[0], bb[3] - bb[1]
            box = [mx - tw / 2 - 14, my - th / 2 - 10,
                   mx + tw / 2 + 14, my + th / 2 + 12]
            if label_bg:
                d.rectangle(box, fill=alpha(INK, colour[3] / 255 * 0.85))
            d.text((mx - tw / 2, my - th / 2 - 4), label, font=f, fill=colour)


def panel(d, xy, wh, title, rows, a, accent=AMBER, slide=0.0):
    """Left-hand information panel: accent rule, title, then rows."""
    x, y = xy
    x -= slide
    pw, ph = wh
    d.rectangle([x, y, x + pw, y + ph], fill=alpha(INK, a * 0.82))
    d.rectangle([x, y, x + 7, y + ph], fill=alpha(accent, a))
    ft = font(F_SANS, 30)
    d.text((x + 26, y + 20), title, font=ft, fill=alpha(accent, a))
    fr = font(F_SANS, 34)
    yy = y + 68
    for row in rows:
        d.text((x + 26, yy), row, font=fr, fill=alpha(WHITE, a))
        yy += 46


def plan_shape(d, cx, cy, size, k, colour, width=4, fill_a=0.0):
    """Floorplate outline. k=0 sharp wedge -> k=1 full rectangle."""
    hw, hh = size * 0.5, size * 0.34
    # front edge always full width; back edge widens with k
    back = hw * (0.06 + 0.94 * k)
    pts = [(cx - hw, cy + hh), (cx + hw, cy + hh),
           (cx + back, cy - hh), (cx - back, cy - hh)]
    if fill_a > 0:
        d.polygon(pts, fill=alpha(colour, fill_a))
    d.line(pts + [pts[0]], fill=colour, width=width, joint="curve")


def counter(d, cx, cy, value, suffix, a, size=110):
    f = font(F_MONO, size)
    txt = f"x{value:.1f}"
    bb = d.textbbox((0, 0), txt, font=f)
    d.text((cx - (bb[2] - bb[0]) / 2, cy), txt, font=f, fill=alpha(AMBER, a))
    fs = font(F_SANS, 32)
    bb2 = d.textbbox((0, 0), suffix, font=fs)
    d.text((cx - (bb2[2] - bb2[0]) / 2, cy + size + 14), suffix,
           font=fs, fill=alpha(WHITE, a))


def scrim(img):
    """Dark gradient up from the plate's bottom edge.

    The plates are bright bone-white where the tower sits, so white captions and
    amber labels lose contrast without this. Cheap to build: a 1px-wide ramp
    scaled up and alpha-composited.
    """
    band = 620
    ramp = Image.new("L", (1, band))
    for i in range(band):
        ramp.putpixel((0, i), int(200 * (i / band) ** 1.6))
    mask = ramp.resize((W, band))
    dark = Image.new("RGBA", (W, band), (10, 10, 12, 255))
    dark.putalpha(mask)
    img.alpha_composite(dark, (0, INNER_BOT - band))


def headline(d, text, y, a, colour=WHITE, size=44, pad=18, centre=True, x=60):
    """Text on its own dark plate so it survives a bright plate underneath."""
    f = font(F_SANS, size)
    bb = d.textbbox((0, 0), text, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    tx = (W - tw) / 2 if centre else x
    d.rectangle([tx - pad, y - pad * 0.6, tx + tw + pad, y + th + pad],
                fill=alpha(INK, a * 0.82))
    d.text((tx, y), text, font=f, fill=alpha(colour, a))
    return tw


def caption(d, words, p, dur):
    """One word at a time, centred, heavy outline -- the reference's cadence."""
    if not words:
        return
    idx = int(clamp(p / dur, 0, 0.999) * len(words))
    word = words[idx]
    f = font(F_SANS, 58)
    bb = d.textbbox((0, 0), word, font=f)
    tw = bb[2] - bb[0]
    x, y = (W - tw) / 2, INNER_TOP + INNER_H * 0.74
    for ox in (-4, -2, 0, 2, 4):
        for oy in (-4, -2, 0, 2, 4):
            if ox or oy:
                d.text((x + ox, y + oy), word, font=f, fill=(0, 0, 0, 235))
    d.text((x, y), word, font=f, fill=WHITE)


def chrome(d, gi):
    """Banner, spec line and the beat progress rail -- present every frame."""
    fb = font(F_SERIF, 43)
    d.text((44, 150), BANNER[0], font=fb, fill=WHITE)
    d.text((44, 202), BANNER[1], font=fb, fill=WHITE)
    fs = font(F_SANS, 22)
    d.text((44, 96), SPECS, font=fs, fill=alpha(AMBER, 0.9))

    # progress rail
    t = gi / FPS
    x0, rail_w, y = 44, W - 88, 300
    gap = 6
    seg = (rail_w - gap * (len(BEATS) - 1)) / len(BEATS)
    acc = 0.0
    for i, (_n, dur, _a, _b) in enumerate(BEATS):
        x = x0 + i * (seg + gap)
        done = clamp((t - acc) / dur)
        d.rectangle([x, y, x + seg, y + 5], fill=alpha(WHITE, 0.18))
        if done > 0:
            d.rectangle([x, y, x + seg * done, y + 5], fill=AMBER)
        acc += dur


# -------------------------------------------------------------------- beats
def draw_site(d, p, dur):
    a = fade(p, 0.4, 0.3, dur)
    f = font(F_SANS, 72)
    txt = "THE WORST-SHAPED"
    bb = d.textbbox((0, 0), txt, font=f)
    d.text(((W - (bb[2] - bb[0])) / 2, INNER_TOP + 110), txt,
           font=f, fill=alpha(WHITE, a))
    txt2 = "PLOT IN VANCOUVER"
    bb2 = d.textbbox((0, 0), txt2, font=f)
    d.text(((W - (bb2[2] - bb2[0])) / 2, INNER_TOP + 190), txt2,
           font=f, fill=alpha(AMBER, a))
    # trace the site triangle
    pr = ease_in(p, 1.6, 0.5)
    tri = [(430, 980), (700, 1010), (560, 1140)]
    for i in range(3):
        dashed(d, tri[i], tri[(i + 1) % 3], alpha(AMBER, a),
               width=4, progress=clamp(pr * 3 - i))


def draw_bridge(d, p, dur):
    a = fade(p, 0.35, 0.3, dur)
    panel(d, (44, INNER_TOP + 90), (600, 214), "THE SITE",
          ["Granville Bridge splits", "into three off-ramps.",
           "Left over: unbuildable", "slivers. Vacant for decades."],
          a, slide=(1 - ease_in(p, 0.6, 0.0)) * 660)
    f = font(F_MONO, 34)
    for i, lab in enumerate(("RAMP 1", "RAMP 2", "RAMP 3")):
        aa = a * clamp(ease_in(p, 0.5, 0.6 + i * 0.35))
        d.text((150 + i * 250, 1320), lab, font=f, fill=alpha(AMBER, aa))


def draw_rule(d, p, dur):
    a = fade(p, 0.3, 0.3, dur)
    panel(d, (44, INNER_TOP + 80), (640, 168), "THE RULE",
          ["No building within", "30 metres of the bridge."],
          a, slide=(1 - ease_in(p, 0.5, 0.0)) * 700)
    pr = ease_in(p, 1.2, 0.5)
    y = 1180
    dim_line(d, (330, y), (720, y), alpha(AMBER, a), "30 m", progress=pr)
    # hatched exclusion band
    if pr > 0.6:
        aa = a * clamp((pr - 0.6) / 0.4)
        for x in range(330, 720, 26):
            d.line([(x, y + 18), (x - 40, y + 118)], fill=alpha(AMBER, aa * 0.5),
                   width=3)


def draw_obvious(d, p, dur):
    a = fade(p, 0.3, 0.3, dur)
    panel(d, (44, INNER_TOP + 70), (600, 260), "OBEY IT LITERALLY",
          ["A splinter tower.", "x  Tiny floorplates",
           "x  Facing a highway", "x  Nobody wants them"],
          a, slide=(1 - ease_in(p, 0.5, 0.0)) * 660)
    # plan inset: the sharp wedge
    aa = a * clamp(ease_in(p, 0.7, 1.0))
    if aa > 0:
        cx, cy = 840, 1300
        d.rectangle([cx - 150, cy - 130, cx + 150, cy + 150],
                    fill=alpha(INK, aa * 0.72))
        plan_shape(d, cx, cy + 10, 190, 0.0, alpha(AMBER, aa), fill_a=aa * 0.22)
        fl = font(F_SANS, 26)
        d.text((cx - 96, cy - 116), "FLOORPLATE", font=fl, fill=alpha(WHITE, aa))


def draw_loophole(d, p, dur):
    """The turn. The whole video hinges on this frame reading clearly."""
    a = fade(p, 0.25, 0.3, dur)
    # strike the misreading, then reveal the actual wording
    p1 = ease_in(p, 0.8, 0.2)
    p2 = ease_in(p, 0.8, 1.6)
    f = font(F_SANS, 44)
    x, y = 60, INNER_TOP + 80
    # backing plate: "HEIGHT" is the crux of the whole video and cannot sit
    # amber-on-bone-white
    d.rectangle([x - 24, y - 22, W - 60, y + 156], fill=alpha(INK, a * 0.84))
    s1 = "within 30 m of the bridge"
    d.text((x, y), s1, font=f, fill=alpha(WHITE, a * 0.55 * p1))
    if p1 > 0.5:
        bb = d.textbbox((x, y), s1, font=f)
        d.line([(x, y + 34), (x + (bb[2] - bb[0]) * clamp((p1 - 0.5) * 2), y + 34)],
               fill=alpha(AMBER, a), width=5)
    if p2 > 0:
        d.text((x, y + 76), "up to 30 m of", font=font(F_SANS, 52),
               fill=alpha(WHITE, a * p2))
        d.text((x + 330, y + 76), "HEIGHT", font=font(F_SANS, 52),
               fill=alpha(AMBER, a * p2))
    # the 30 m line drawn across the frame, then open air above it
    p3 = ease_in(p, 1.0, 2.6)
    ly = 1480
    if p3 > 0:
        d.line([(0, ly), (W * p3, ly)], fill=alpha(AMBER, a), width=5)
        dim_line(d, (200, ly), (200, ly - 150), alpha(AMBER, a * p3), "30 m",
                 progress=p3)
    p4 = ease_in(p, 0.9, 3.7)
    if p4 > 0:
        tw = headline(d, "ABOVE THIS LINE: UNRESTRICTED", ly - 250, a * p4,
                      colour=AMBER, size=40)
        mx = (W - tw) / 2
        for i in range(3):
            ax = mx + 120 + i * 180
            ah = 60 * p4
            d.line([(ax, ly - 60), (ax, ly - 60 - ah)], fill=alpha(AMBER, a * p4),
                   width=4)
            d.polygon([(ax - 12, ly - 56 - ah), (ax + 12, ly - 56 - ah),
                       (ax, ly - 80 - ah)], fill=alpha(AMBER, a * p4))


def draw_cantilev(d, p, dur):
    a = fade(p, 0.3, 0.3, dur)
    panel(d, (44, INNER_TOP + 70), (620, 214), "THE MOVE",
          ["Base stays pinched.", "Above 30 m the tower",
           "cantilevers back out", "over the bridge."],
          a, slide=(1 - ease_in(p, 0.5, 0.0)) * 680)
    # sweeping arrow reclaiming the area
    pr = ease_in(p, 1.6, 1.0)
    if pr > 0:
        cxs = [(520, 1500), (600, 1300), (700, 1080), (760, 900)]
        for i in range(len(cxs) - 1):
            seg = clamp(pr * 3 - i)
            if seg > 0:
                x0, y0 = cxs[i]
                x1, y1 = cxs[i + 1]
                d.line([(x0, y0), (x0 + (x1 - x0) * seg, y0 + (y1 - y0) * seg)],
                       fill=alpha(AMBER, a), width=6)
        if pr > 0.95:
            d.polygon([(742, 912), (778, 900), (752, 872)], fill=alpha(AMBER, a))
    # storey ticks
    p2 = ease_in(p, 0.8, 2.4)
    if p2 > 0:
        fm = font(F_MONO, 26)
        for i, (lab, yy) in enumerate((("L59", 720), ("L40", 990),
                                       ("L20", 1260), ("L01", 1530))):
            aa = a * p2 * clamp(p2 * 4 - i)
            d.line([(920, yy), (975, yy)], fill=alpha(WHITE, aa * 0.8), width=3)
            d.text((985, yy - 16), lab, font=fm, fill=alpha(WHITE, aa * 0.9))


def draw_morph(d, p, dur):
    """The thesis. The plates never showed the morph, so it is drawn here."""
    a = fade(p, 0.25, 0.3, dur)
    fh = font(F_SANS, 30)
    d.text((640, INNER_TOP + 70), "PLAN AT EACH LEVEL", font=fh,
           fill=alpha(AMBER, a))
    levels = [("L01", 0.00), ("L20", 0.33), ("L40", 0.66), ("L59", 1.00)]
    for i, (lab, k) in enumerate(levels):
        appear = ease_in(p, 0.7, 0.5 + i * 0.9)
        if appear <= 0:
            continue
        aa = a * appear
        cy = 1520 - i * 250
        cx = 860
        d.rectangle([cx - 165, cy - 100, cx + 165, cy + 110],
                    fill=alpha(INK, aa * 0.7))
        plan_shape(d, cx, cy + 6, 210, k, alpha(AMBER, aa), fill_a=aa * 0.2)
        d.text((cx - 150, cy - 92), lab, font=font(F_MONO, 28),
               fill=alpha(WHITE, aa))
        if i > 0:
            d.line([(cx, cy - 104), (cx, cy - 146)],
                   fill=alpha(AMBER, aa * 0.5), width=3)
    p2 = ease_in(p, 0.8, 4.4)
    if p2 > 0:
        panel(d, (44, INNER_TOP + 90), (540, 168), "TRIANGLE TO RECTANGLE",
              ["The sharp corner", "fattens floor by floor."], a * p2)


def draw_double(d, p, dur):
    a = fade(p, 0.25, 0.25, dur)
    pr = ease_in(p, 1.4, 0.3)
    cx, cy = W / 2, 1230
    # counter sits above the shapes so it never collides with the caption band
    f = font(F_MONO, 96)
    txt = f"x{1.0 + 1.0 * pr:.1f}"
    bb = d.textbbox((0, 0), txt, font=f)
    tw = bb[2] - bb[0]
    d.rectangle([cx - tw / 2 - 26, INNER_TOP + 60, cx + tw / 2 + 26,
                 INNER_TOP + 196], fill=alpha(INK, a * 0.82))
    d.text((cx - tw / 2, INNER_TOP + 66), txt, font=f, fill=alpha(AMBER, a))
    headline(d, "FLOORPLATE  ·  SAME SITE", INNER_TOP + 214, a, size=34)
    plan_shape(d, cx, cy, 420, 1.0, alpha(AMBER, a), width=5, fill_a=a * 0.14)
    plan_shape(d, cx, cy, 420 * (1 - 0.52 * pr), 0.0, alpha(WHITE, a), width=4)


def draw_shadow(d, p, dur):
    a = fade(p, 0.25, 0.25, dur)
    pr = ease_in(p, 1.5, 0.2)
    # sun arc
    cx, cy, r = W / 2, 1180, 430
    steps = 40
    for i in range(steps):
        f0 = i / steps
        if f0 > pr:
            break
        t0 = math.pi * (1 - f0)
        t1 = math.pi * (1 - min(1.0, f0 + 1 / steps))
        d.line([(cx + r * math.cos(t0), cy - r * math.sin(t0) * 0.55),
                (cx + r * math.cos(t1), cy - r * math.sin(t1) * 0.55)],
               fill=alpha(AMBER, a), width=4)
    if pr > 0.9:
        d.ellipse([cx + r - 16, cy - 16, cx + r + 16, cy + 16], fill=alpha(AMBER, a))
    p2 = ease_in(p, 0.8, 1.6)
    if p2 > 0:
        headline(d, "THE PARK KEEPS ITS LIGHT", INNER_TOP + 80, a * p2,
                 colour=AMBER, size=40)
        d.rectangle([300, 1436, 352, 1476], fill=alpha(PARK, a * p2))
        d.rectangle([364, 1430, 742, 1484], fill=alpha(INK, a * p2 * 0.8))
        d.text((378, 1440), "PARK: IN SUN", font=font(F_SANS, 30),
               fill=alpha(WHITE, a * p2))
        dashed(d, (300, 1560), (700, 1494), alpha(WHITE, a * p2 * 0.85),
               width=3, progress=p2)
        d.text((300, 1584), "shadow stops here", font=font(F_SANS, 26),
               fill=alpha(WHITE, a * p2 * 0.8))


def draw_reads(d, p, dur):
    a = fade(p, 0.25, 0.25, dur)
    labs = [("SLAB", 1.0), ("BLADE", 0.0), ("WEDGE", 0.45)]
    for i, (lab, k) in enumerate(labs):
        aa = a * clamp(ease_in(p, 0.4, 0.15 + i * 0.35))
        cx = 210 + i * 330
        cy = 1400
        d.rectangle([cx - 130, cy - 110, cx + 130, cy + 120],
                    fill=alpha(INK, aa * 0.75))
        plan_shape(d, cx, cy + 20, 170, k, alpha(AMBER, aa), fill_a=aa * 0.2)
        bb = d.textbbox((0, 0), lab, font=font(F_SANS, 30))
        d.text((cx - (bb[2] - bb[0]) / 2, cy - 100), lab, font=font(F_SANS, 30),
               fill=alpha(WHITE, aa))
    p2 = ease_in(p, 0.5, 1.4)
    if p2 > 0:
        headline(d, "ONE BUILDING. THREE READS.", INNER_TOP + 110, a * p2,
                 colour=AMBER, size=44)


def draw_card(d, p, dur):
    # no fade-out: the name card is the last thing on screen and holds
    a = fade(p, 0.3, 0.0, dur)
    # one dark card behind the whole reveal; the plate under it is bright
    grow = ease_in(p, 0.6, 0.1)
    if grow > 0:
        ch = 470 * grow
        d.rectangle([70, INNER_TOP + 90, W - 70, INNER_TOP + 90 + ch],
                    fill=alpha(INK, a * 0.86))
        d.rectangle([70, INNER_TOP + 90, W - 70, INNER_TOP + 97],
                    fill=alpha(AMBER, a))
    f = font(F_SANS, 78)
    for i, line in enumerate(("VANCOUVER", "HOUSE")):
        pr = clamp(ease_in(p, 0.5, 0.5 + i * 0.25))
        bb = d.textbbox((0, 0), line, font=f)
        d.text(((W - (bb[2] - bb[0])) / 2, INNER_TOP + 140 + i * 88), line,
               font=f, fill=alpha(WHITE, a * pr))
    rows = ["BIG / BJARKE INGELS GROUP", "VANCOUVER, CANADA  ·  2020",
            "59 STOREYS  ·  150 m"]
    for i, row in enumerate(rows):
        pr = clamp(ease_in(p, 0.4, 1.3 + i * 0.22))
        fr = font(F_MONO, 30)
        bb = d.textbbox((0, 0), row, font=fr)
        d.text(((W - (bb[2] - bb[0])) / 2, INNER_TOP + 348 + i * 44), row,
               font=fr, fill=alpha(AMBER, a * pr))
    pr = clamp(ease_in(p, 0.6, 2.4))
    if pr > 0:
        fs = font(F_SERIF, 38)
        for i, m in enumerate(("Not a shape someone wanted.",
                               "A shape the site allowed.")):
            bb = d.textbbox((0, 0), m, font=fs)
            tw = bb[2] - bb[0]
            tx = (W - tw) / 2
            d.rectangle([tx - 20, 1512 + i * 54, tx + tw + 20, 1566 + i * 54],
                        fill=alpha(INK, a * pr * 0.8))
            d.text((tx, 1518 + i * 54), m, font=fs,
                   fill=alpha(WHITE, a * pr * 0.95))


DRAW = {
    "site": draw_site, "bridge": draw_bridge, "rule": draw_rule,
    "obvious": draw_obvious, "loophole": draw_loophole,
    "cantilev": draw_cantilev, "morph": draw_morph, "double": draw_double,
    "shadow": draw_shadow, "reads": draw_reads, "card": draw_card,
}


# --------------------------------------------------------------------- main
def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "overlay"
    os.makedirs(out, exist_ok=True)
    words = {k: v.split() for k, v in LINES.items()}

    for gi in range(NFRAMES):
        t = gi / FPS
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        scrim(img)
        d = ImageDraw.Draw(img)

        # charcoal letterbox bars
        d.rectangle([0, 0, W, INNER_TOP], fill=CHARCOAL)
        d.rectangle([0, INNER_BOT, W, H], fill=CHARCOAL)
        chrome(d, gi)

        for name, dur, _a, _b in BEATS:
            s = STARTS[name]
            if s <= t < s + dur:
                p = t - s
                DRAW[name](d, p, dur)
                caption(d, words[name], p, dur)
                break

        img.save(f"{out}/{gi:05d}.png", compress_level=1)
        if gi % 100 == 0:
            print(f"{gi}/{NFRAMES}", file=sys.stderr)

    print(NFRAMES)


if __name__ == "__main__":
    main()
