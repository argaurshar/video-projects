#!/usr/bin/env python3
"""Generate the word-by-word karaoke SRT for the Vancouver House explainer.

The reference video shows exactly one word at a time at ~3 words/sec. This
distributes each beat's words evenly across that beat's time window, which is
what reads as "karaoke" without needing forced alignment.

Usage:  python3 make_captions.py > captions.srt
"""

# (start_seconds, end_seconds, text)
BEATS = [
    (0.0,  7.0,  "This is the worst-shaped piece of land in Vancouver. "
                 "It's a triangle. And it sits directly underneath a bridge."),
    (7.0,  14.0, "Where the Granville Bridge hits downtown, it splits into three ramps. "
                 "The slivers of land left between them were so awkward that for decades, "
                 "nobody built on them."),
    (14.0, 22.0, "Then the city set a condition. You cannot build within thirty metres "
                 "of the bridge. On a plot this narrow, that erases almost all of it."),
    (22.0, 29.0, "So any normal tower here is a thin triangular splinter, pressed against "
                 "a highway. Small floors. Bad apartments. Nobody wants them."),
    (29.0, 38.0, "But read the condition again. The thirty-metre setback only applies up to "
                 "thirty metres of height. Above that line, the air is free."),
    (38.0, 46.0, "So the tower stays pinched at the bottom, obeying the rule, and the moment "
                 "it clears the bridge, it starts leaning back out over it."),
    (46.0, 55.0, "Floor by floor, the triangle opens. The sharp corner fattens. By the top, "
                 "the plan is a full rectangle."),
    (55.0, 62.0, "The floorplate roughly doubles on the way up. The building takes back every "
                 "square metre the bridge took from it."),
    (62.0, 69.0, "And because the base stayed thin, the ground it never used becomes a public "
                 "plaza, right underneath the bridge."),
    (69.0, 76.0, "The curve on this side isn't sculpture. It's the sun, pulled back so the "
                 "park next door never falls into shadow."),
    (76.0, 83.0, "Walk around it and it changes. A slab. A blade. A twist. It's none of those. "
                 "It's a triangle becoming a rectangle."),
    (83.0, 88.0, "Same trick as the Flatiron. Not a shape someone wanted. A shape the site allowed."),
    (88.0, 91.0, "Congratulations. You now know Vancouver House."),
]


def ts(seconds: float) -> str:
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"


def main() -> None:
    index = 1
    for start, end, text in BEATS:
        words = text.split()
        step = (end - start) / len(words)
        for i, word in enumerate(words):
            w_start = start + i * step
            w_end = w_start + step
            print(index)
            print(f"{ts(w_start)} --> {ts(w_end)}")
            print(word)
            print()
            index += 1


if __name__ == "__main__":
    main()
