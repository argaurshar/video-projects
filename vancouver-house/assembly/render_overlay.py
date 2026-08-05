#!/usr/bin/env python3
"""Author the motion-graphics layer for the Vancouver House explainer.

Why this exists: the image-to-video model cannot draw architectural diagrams.
Asked to animate dimension lines and floorplate outlines it produced amber
scribbles on the facade. So the AI clips are used only as background plates and
every informative element -- dimension lines, plan shapes, counters, panels,
labels, captions -- is drawn here as real vector graphics, frame by frame.

LAYOUT CONTRACT (added after an audit found 7 of 11 beats colliding):

    422 .. 470     top charcoal bar bleed / breathing room
    470 .. 1600    CONTENT -- every graphic element must fit inside this
    1600 .. 1636   dead air
    1636 .. 1824   CAPTION band -- reserved, no graphic may enter it
    1824 .. 1920   bottom charcoal bar

Nothing is placed by eye any more. Elements anchor to CONTENT_TOP /
CONTENT_BOT, and `check_bounds()` fails the render if anything strays outside
the content zone, so a future edit cannot silently reintroduce an overlap.

Emits overlay/%05d.png (RGBA, 1080x1920) plus the frame count on stdout.
"""

import math
import os
import sys
from PIL import Image, ImageDraw, ImageFont

# ----------------------------------------------------------------- constants
W, H = 1080, 1920
FPS = 25
TOP = 422
BOT = 96
INNER_TOP = TOP
INNER_BOT = H - BOT

CONTENT_TOP = 470
CONTENT_BOT = 1600
CAP_TOP = 1636
CAP_SIZE = 54

CHARCOAL = (26, 26, 28, 255)
WHITE = (255, 255, 255, 255)
AMBER = (232, 160, 74, 255)
PARK = (126, 172, 152, 255)
INK = (18, 18, 20, 255)

# Panels must be near-opaque. At 0.7 the model city read straight through the
# plan diagrams and made them unreadable.
PANEL_A = 0.94

BANNER = ["Every weird building has a reason.", "Here's this one."]
SPECS = "VANCOUVER HOUSE  ·  BIG  ·  2020"
CROSS = "×"

FDIR = "/usr/share/fonts/truetype/dejavu"
F_SERIF = f"{FDIR}/DejaVuSerif.ttf"
F_SANS = f"{FDIR}/DejaVuSans-Bold.ttf"
F_MONO = f"{FDIR}/DejaVuSansMono-Bold.ttf"

_cache = {}
_violations = []


def font(path, size):
    key = (path, size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(path, size)
    return _cache[key]


def check_bounds(tag, top, bottom):
    """Record any element that escapes the content zone."""
    if top < CONTENT_TOP - 1 or bottom > CONTENT_BOT + 1:
        _violations.append(f"{tag}: {top:.0f}..{bottom:.0f}")


# ----------------------------------------------------------------- timeline
# (name, out_duration, plate_in, plate_out) -- build51.py mirrors this exactly
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
    return smooth((p - t) / dur) if dur > 0 else 1.0


def fade(p, hold_in=0.35, hold_out=0.3, dur=1.0):
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
             font_obj=None):
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
            f = font_obj or font(F_MONO, 38)
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            bb = d.textbbox((0, 0), label, font=f)
            tw, th = bb[2] - bb[0], bb[3] - bb[1]
            d.rectangle([mx - tw / 2 - 14, my - th / 2 - 12,
                         mx + tw / 2 + 14, my + th / 2 + 14],
                        fill=alpha(INK, colour[3] / 255 * PANEL_A))
            d.text((mx - tw / 2, my - th / 2 - 6), label, font=f, fill=colour)


def panel(d, x, y, title, rows, a, accent=AMBER, slide=0.0, tag="panel"):
    """Information panel, auto-sized to its content. Returns (w, h).

    Width used to be hardcoded, which meant a longer row could run past the
    plate edge. It is now measured.
    """
    ft, fr = font(F_SANS, 30), font(F_SANS, 34)
    pad, gap = 28, 46
    widths = [d.textbbox((0, 0), title, font=ft)[2]]
    widths += [d.textbbox((0, 0), r, font=fr)[2] for r in rows]
    pw = max(widths) + pad * 2 + 12
    ph = 68 + gap * len(rows) + 16
    x -= slide
    d.rectangle([x, y, x + pw, y + ph], fill=alpha(INK, a * PANEL_A))
    d.rectangle([x, y, x + 7, y + ph], fill=alpha(accent, a))
    d.text((x + pad, y + 20), title, font=ft, fill=alpha(accent, a))
    yy = y + 68
    for row in rows:
        d.text((x + pad, yy), row, font=fr, fill=alpha(WHITE, a))
        yy += gap
    check_bounds(tag, y, y + ph)
    return pw, ph


def plate_text(d, text, y, a, colour=WHITE, size=44, centre=True, x=60,
               tag="text"):
    f = font(F_SANS, size)
    bb = d.textbbox((0, 0), text, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    tx = (W - tw) / 2 if centre else x
    pad = 18
    d.rectangle([tx - pad, y - pad * 0.6, tx + tw + pad, y + th + pad],
                fill=alpha(INK, a * PANEL_A))
    d.text((tx, y), text, font=f, fill=alpha(colour, a))
    check_bounds(tag, y - pad * 0.6, y + th + pad)
    return tw


def plan_shape(d, cx, cy, size, k, colour, width=4, fill_a=0.0):
    """Floorplate outline. k=0 sharp wedge -> k=1 full rectangle."""
    hw, hh = size * 0.5, size * 0.34
    back = hw * (0.06 + 0.94 * k)
    pts = [(cx - hw, cy + hh), (cx + hw, cy + hh),
           (cx + back, cy - hh), (cx - back, cy - hh)]
    if fill_a > 0:
        d.polygon(pts, fill=alpha(colour, fill_a))
    d.line(pts + [pts[0]], fill=colour, width=width, joint="curve")


def plan_box(d, cx, cy, bw, bh, label, k, a, size=None):
    """A plan diagram inside its own opaque plate, never over the building."""
    d.rectangle([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2],
                fill=alpha(INK, a * PANEL_A))
    d.text((cx - bw / 2 + 18, cy - bh / 2 + 14), label, font=font(F_MONO, 26),
           fill=alpha(WHITE, a))
    plan_shape(d, cx, cy + 22, size or bw * 0.62, k, alpha(AMBER, a),
               fill_a=a * 0.22)
    check_bounds(f"planbox {label}", cy - bh / 2, cy + bh / 2)


def caption(d, words, p, dur):
    if not words:
        return
    idx = int(clamp(p / dur, 0, 0.999) * len(words))
    word = words[idx]
    f = font(F_SANS, CAP_SIZE)
    bb = d.textbbox((0, 0), word, font=f)
    x, y = (W - (bb[2] - bb[0])) / 2, CAP_TOP
    for ox in (-4, -2, 0, 2, 4):
        for oy in (-4, -2, 0, 2, 4):
            if ox or oy:
                d.text((x + ox, y + oy), word, font=f, fill=(0, 0, 0, 235))
    d.text((x, y), word, font=f, fill=WHITE)


def scrim(img):
    """Dark ramp behind the caption band only -- it no longer needs to cover
    the content zone now that every graphic sits on its own plate."""
    band = 420
    ramp = Image.new("L", (1, band))
    for i in range(band):
        ramp.putpixel((0, i), int(205 * (i / band) ** 1.5))
    dark = Image.new("RGBA", (W, band), (10, 10, 12, 255))
    dark.putalpha(ramp.resize((W, band)))
    img.alpha_composite(dark, (0, INNER_BOT - band))


def chrome(d, gi):
    fb = font(F_SERIF, 43)
    d.text((44, 150), BANNER[0], font=fb, fill=WHITE)
    d.text((44, 202), BANNER[1], font=fb, fill=WHITE)
    d.text((44, 96), SPECS, font=font(F_SANS, 22), fill=alpha(AMBER, 0.9))
    t = gi / FPS
    x0, rail_w, y, gap = 44, W - 88, 300, 6
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
    for i, (txt, col) in enumerate((("THE WORST-SHAPED", WHITE),
                                    ("PLOT IN VANCOUVER", AMBER))):
        bb = d.textbbox((0, 0), txt, font=f)
        d.text(((W - (bb[2] - bb[0])) / 2, CONTENT_TOP + 40 + i * 84), txt,
               font=f, fill=alpha(col, a))
    check_bounds("site title", CONTENT_TOP + 40, CONTENT_TOP + 208)
    pr = ease_in(p, 1.6, 0.5)
    tri = [(430, 1010), (700, 1040), (560, 1170)]
    for i in range(3):
        dashed(d, tri[i], tri[(i + 1) % 3], alpha(AMBER, a), width=4,
               progress=clamp(pr * 3 - i))


def draw_bridge(d, p, dur):
    a = fade(p, 0.35, 0.3, dur)
    panel(d, 44, CONTENT_TOP + 30, "THE SITE",
          ["Granville Bridge splits", "into three off-ramps.",
           "Left over: unbuildable", "slivers. Vacant for decades."],
          a, slide=(1 - ease_in(p, 0.6, 0.0)) * 700, tag="bridge panel")
    f = font(F_MONO, 32)
    for i, lab in enumerate(("RAMP 1", "RAMP 2", "RAMP 3")):
        aa = a * clamp(ease_in(p, 0.5, 0.6 + i * 0.35))
        if aa <= 0:
            continue
        x, y = 140 + i * 250, 1290
        bb = d.textbbox((0, 0), lab, font=f)
        d.rectangle([x - 12, y - 8, x + bb[2] - bb[0] + 12, y + 42],
                    fill=alpha(INK, aa * PANEL_A))
        d.text((x, y), lab, font=f, fill=alpha(AMBER, aa))
    check_bounds("ramp labels", 1282, 1332)


def draw_rule(d, p, dur):
    a = fade(p, 0.3, 0.3, dur)
    panel(d, 44, CONTENT_TOP + 30, "THE RULE",
          ["No building within", "30 metres of the bridge."],
          a, slide=(1 - ease_in(p, 0.5, 0.0)) * 740, tag="rule panel")
    pr = ease_in(p, 1.2, 0.5)
    y = 1200
    dim_line(d, (330, y), (720, y), alpha(AMBER, a), "30 m", progress=pr)
    if pr > 0.6:
        aa = a * clamp((pr - 0.6) / 0.4)
        for x in range(330, 720, 26):
            d.line([(x, y + 22), (x - 40, y + 118)],
                   fill=alpha(AMBER, aa * 0.55), width=3)
    check_bounds("rule dim", y - 40, y + 118)


def draw_obvious(d, p, dur):
    a = fade(p, 0.3, 0.3, dur)
    panel(d, 44, CONTENT_TOP + 30, "OBEY IT LITERALLY",
          ["A splinter tower.", f"{CROSS}  Tiny floorplates",
           f"{CROSS}  Facing a highway", f"{CROSS}  Nobody wants them"],
          a, slide=(1 - ease_in(p, 0.5, 0.0)) * 700, tag="obvious panel")
    aa = a * clamp(ease_in(p, 0.7, 1.0))
    if aa > 0:
        plan_box(d, 858, 1330, 320, 300, "FLOORPLATE", 0.0, aa, size=210)


def draw_loophole(d, p, dur):
    """The turn. The whole video hinges on this reading clearly."""
    a = fade(p, 0.25, 0.3, dur)
    p1 = ease_in(p, 0.8, 0.2)
    p2 = ease_in(p, 0.8, 1.6)
    f = font(F_SANS, 44)
    x, y = 60, CONTENT_TOP + 32
    d.rectangle([x - 24, y - 22, W - 60, y + 156], fill=alpha(INK, a * PANEL_A))
    s1 = "within 30 m of the bridge"
    d.text((x, y), s1, font=f, fill=alpha(WHITE, a * 0.55 * p1))
    if p1 > 0.5:
        bb = d.textbbox((x, y), s1, font=f)
        d.line([(x, y + 34), (x + (bb[2] - bb[0]) * clamp((p1 - 0.5) * 2), y + 34)],
               fill=alpha(AMBER, a), width=5)
    if p2 > 0:
        f2 = font(F_SANS, 52)
        lead = "up to 30 m of "
        d.text((x, y + 76), lead, font=f2, fill=alpha(WHITE, a * p2))
        # measured, not hardcoded -- a fixed offset had "of" and "HEIGHT"
        # printing on top of each other
        lead_w = d.textbbox((0, 0), lead, font=f2)[2]
        d.text((x + lead_w, y + 76), "HEIGHT", font=f2,
               fill=alpha(AMBER, a * p2))
    check_bounds("loophole plate", y - 22, y + 156)

    p3 = ease_in(p, 1.0, 2.6)
    ly = 1400
    if p3 > 0:
        d.line([(0, ly), (W * p3, ly)], fill=alpha(AMBER, a), width=5)
        dim_line(d, (200, ly), (200, ly - 150), alpha(AMBER, a * p3), "30 m",
                 progress=p3)
    p4 = ease_in(p, 0.9, 3.7)
    if p4 > 0:
        tw = plate_text(d, "ABOVE THIS LINE: UNRESTRICTED", ly - 250, a * p4,
                        colour=AMBER, size=40, tag="loophole msg")
        mx = (W - tw) / 2
        for i in range(3):
            ax = mx + 120 + i * 180
            ah = 56 * p4
            d.line([(ax, ly - 60), (ax, ly - 60 - ah)],
                   fill=alpha(AMBER, a * p4), width=4)
            d.polygon([(ax - 12, ly - 56 - ah), (ax + 12, ly - 56 - ah),
                       (ax, ly - 80 - ah)], fill=alpha(AMBER, a * p4))


def draw_cantilev(d, p, dur):
    a = fade(p, 0.3, 0.3, dur)
    panel(d, 44, CONTENT_TOP + 30, "THE MOVE",
          ["Base stays pinched.", "Above 30 m the tower",
           "cantilevers back out", "over the bridge."],
          a, slide=(1 - ease_in(p, 0.5, 0.0)) * 720, tag="cantilev panel")
    pr = ease_in(p, 1.6, 1.0)
    if pr > 0:
        pts = [(520, 1420), (600, 1240), (700, 1040), (760, 880)]
        for i in range(len(pts) - 1):
            seg = clamp(pr * 3 - i)
            if seg > 0:
                x0, y0 = pts[i]
                x1, y1 = pts[i + 1]
                d.line([(x0, y0), (x0 + (x1 - x0) * seg, y0 + (y1 - y0) * seg)],
                       fill=alpha(AMBER, a), width=6)
        if pr > 0.95:
            d.polygon([(742, 892), (778, 880), (752, 852)], fill=alpha(AMBER, a))
        check_bounds("cantilev arrow", 852, 1420)
    p2 = ease_in(p, 0.8, 2.4)
    if p2 > 0:
        fm = font(F_MONO, 26)
        for i, (lab, yy) in enumerate((("L59", 700), ("L40", 940),
                                       ("L20", 1180), ("L01", 1420))):
            aa = a * p2 * clamp(p2 * 4 - i)
            if aa <= 0:
                continue
            d.line([(920, yy), (972, yy)], fill=alpha(WHITE, aa * 0.85), width=3)
            d.rectangle([980, yy - 18, 1060, yy + 20],
                        fill=alpha(INK, aa * PANEL_A))
            d.text((988, yy - 15), lab, font=fm, fill=alpha(WHITE, aa))
        check_bounds("storey ticks", 682, 1440)


def draw_morph(d, p, dur):
    """The thesis. One right-hand rail, no competing left panel -- the two
    used to overlap each other and the tower."""
    a = fade(p, 0.25, 0.3, dur)
    rail_x = 862
    plate_text(d, "PLAN AT EACH LEVEL", CONTENT_TOP + 10, a, colour=AMBER,
               size=32, centre=False, x=628, tag="morph header")
    levels = [("L01", 0.00), ("L20", 0.33), ("L40", 0.66), ("L59", 1.00)]
    for i, (lab, k) in enumerate(levels):
        appear = ease_in(p, 0.7, 0.5 + i * 0.85)
        if appear <= 0:
            continue
        aa = a * appear
        cy = 1450 - i * 258
        plan_box(d, rail_x, cy, 340, 232, lab, k, aa, size=210)
        if i > 0:
            d.line([(rail_x, cy + 116), (rail_x, cy + 142)],
                   fill=alpha(AMBER, aa * 0.55), width=3)


def draw_double(d, p, dur):
    """Plan comparison lives in its own panel. Drawn over the tower it read as
    a gable line on the facade rather than as two floorplates in plan."""
    a = fade(p, 0.25, 0.25, dur)
    pr = ease_in(p, 1.4, 0.3)
    px, py, pw, ph = 90, CONTENT_TOP + 60, W - 180, 520
    d.rectangle([px, py, px + pw, py + ph], fill=alpha(INK, a * 0.97))
    d.rectangle([px, py, px + pw, py + 7], fill=alpha(AMBER, a))
    d.text((px + 28, py + 30), "FLOORPLATE  ·  SAME SITE", font=font(F_SANS, 32),
           fill=alpha(AMBER, a))
    cx, cy = px + pw / 2, py + 250
    plan_shape(d, cx, cy, 400, 1.0, alpha(AMBER, a), width=5, fill_a=a * 0.16)
    plan_shape(d, cx, cy, 400 * (1 - 0.52 * pr), 0.0, alpha(WHITE, a), width=4)
    fl = font(F_MONO, 24)
    d.text((px + 28, py + 214), "L01", font=fl, fill=alpha(WHITE, a))
    d.text((px + pw - 80, py + 214), "L59", font=fl, fill=alpha(AMBER, a))
    f = font(F_MONO, 84)
    txt = f"{CROSS}{1.0 + 1.0 * pr:.1f}"
    bb = d.textbbox((0, 0), txt, font=f)
    d.text((cx - (bb[2] - bb[0]) / 2, py + ph - 130), txt, font=f,
           fill=alpha(AMBER, a))
    check_bounds("double panel", py, py + ph)


def draw_shadow(d, p, dur):
    a = fade(p, 0.25, 0.25, dur)
    pr = ease_in(p, 1.5, 0.2)
    cx, cy, r = W / 2, 1150, 430
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
    check_bounds("sun arc", cy - r * 0.55 - 16, cy + 16)
    p2 = ease_in(p, 0.8, 1.6)
    if p2 > 0:
        plate_text(d, "THE PARK KEEPS ITS LIGHT", CONTENT_TOP + 20, a * p2,
                   colour=AMBER, size=40, tag="shadow msg")
        d.rectangle([300, 1330, 352, 1370], fill=alpha(PARK, a * p2))
        d.rectangle([364, 1324, 742, 1378], fill=alpha(INK, a * p2 * PANEL_A))
        d.text((378, 1334), "PARK: IN SUN", font=font(F_SANS, 30),
               fill=alpha(WHITE, a * p2))
        dashed(d, (300, 1470), (700, 1396), alpha(WHITE, a * p2 * 0.85),
               width=3, progress=p2)
        d.text((300, 1500), "shadow stops here", font=font(F_SANS, 26),
               fill=alpha(WHITE, a * p2 * 0.85))
        check_bounds("park key", 1324, 1540)


def draw_reads(d, p, dur):
    a = fade(p, 0.25, 0.25, dur)
    labs = [("SLAB", 1.0), ("BLADE", 0.0), ("WEDGE", 0.45)]
    for i, (lab, k) in enumerate(labs):
        aa = a * clamp(ease_in(p, 0.4, 0.15 + i * 0.35))
        if aa <= 0:
            continue
        plan_box(d, 200 + i * 340, 1300, 300, 260, lab, k, aa, size=190)
    p2 = ease_in(p, 0.5, 1.4)
    if p2 > 0:
        plate_text(d, "ONE BUILDING. THREE READS.", CONTENT_TOP + 20, a * p2,
                   colour=AMBER, size=44, tag="reads msg")


def draw_card(d, p, dur):
    a = fade(p, 0.3, 0.0, dur)
    grow = ease_in(p, 0.6, 0.1)
    y0 = CONTENT_TOP + 20
    if grow > 0:
        ch = 470 * grow
        d.rectangle([70, y0, W - 70, y0 + ch], fill=alpha(INK, a * 0.94))
        d.rectangle([70, y0, W - 70, y0 + 7], fill=alpha(AMBER, a))
    f = font(F_SANS, 78)
    for i, line in enumerate(("VANCOUVER", "HOUSE")):
        pr = clamp(ease_in(p, 0.5, 0.5 + i * 0.25))
        bb = d.textbbox((0, 0), line, font=f)
        d.text(((W - (bb[2] - bb[0])) / 2, y0 + 50 + i * 88), line, font=f,
               fill=alpha(WHITE, a * pr))
    rows = ["BIG / BJARKE INGELS GROUP", "VANCOUVER, CANADA  ·  2020",
            "59 STOREYS  ·  150 m"]
    for i, row in enumerate(rows):
        pr = clamp(ease_in(p, 0.4, 1.3 + i * 0.22))
        fr = font(F_MONO, 30)
        bb = d.textbbox((0, 0), row, font=fr)
        d.text(((W - (bb[2] - bb[0])) / 2, y0 + 258 + i * 44), row, font=fr,
               fill=alpha(AMBER, a * pr))
    check_bounds("card", y0, y0 + 470)
    pr = clamp(ease_in(p, 0.6, 2.4))
    if pr > 0:
        fs = font(F_SERIF, 38)
        for i, m in enumerate(("Not a shape someone wanted.",
                               "A shape the site allowed.")):
            bb = d.textbbox((0, 0), m, font=fs)
            tw = bb[2] - bb[0]
            tx = (W - tw) / 2
            yy = 1400 + i * 58
            d.rectangle([tx - 20, yy - 8, tx + tw + 20, yy + 48],
                        fill=alpha(INK, a * pr * 0.85))
            d.text((tx, yy), m, font=fs, fill=alpha(WHITE, a * pr * 0.95))
        check_bounds("card quote", 1392, 1506)


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
        if gi % 200 == 0:
            print(f"{gi}/{NFRAMES}", file=sys.stderr)

    if _violations:
        print("LAYOUT VIOLATIONS (element outside "
              f"{CONTENT_TOP}..{CONTENT_BOT}):", file=sys.stderr)
        for v in sorted(set(_violations)):
            print("  " + v, file=sys.stderr)
        sys.exit(1)
    print(NFRAMES)


if __name__ == "__main__":
    main()
