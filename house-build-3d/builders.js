// Scene builders: one builder per build phase, plus the static context (ground, street).
// Every animated element registers a track on the Timeline. A track is a pure function of t,
// so renderAt(t) can jump to any moment in any order and always produce the same frame.

import * as THREE from 'three';
import { CONFIG, phaseStart } from './config.js';

const C = CONFIG.colors;
const P = CONFIG.plan;
const HS = P.house;
const A = CONFIG.anim;

// ------------------------------------------------------------------ deterministic helpers

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const Ease = {
  linear: (x) => x,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
};

// ------------------------------------------------------------------ timeline

export class Timeline {
  constructor() {
    this.tracks = [];
    this.events = [];
  }
  add(phase, label, start, dur, apply) {
    this.tracks.push({ start, dur, apply });
    this.events.push({ phase, label, start: +start.toFixed(3), end: +(start + dur).toFixed(3) });
  }
  apply(t) {
    for (const k of this.tracks) k.apply(clamp01((t - k.start) / k.dur), t);
  }
}

// ------------------------------------------------------------------ materials

function std(hex, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0.0, ...extra });
}

export function makeMaterials(envMap) {
  const lineMat = (hex) => new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
  const M = {
    wall: std(C.wall),
    slab: std(C.wall),
    roof: std(C.wall),
    ground: std(C.ground, { roughness: 1 }),
    lawn: std(C.ground, { roughness: 1 }),
    paving: std(C.paving),
    gravel: std(C.gravel, { roughness: 1 }),
    sidewalk: std(C.sidewalk),
    road: std(C.road, { roughness: 1 }),
    deck: std(C.deck, { roughness: 0.85 }),
    poolShell: std(C.ground, { side: THREE.BackSide, roughness: 0.7 }),
    water: std(C.water, {
      roughness: 0.08, envMap, envMapIntensity: 0.55, transparent: true, opacity: 0, depthWrite: false,
    }),
    frame: std(C.frame, { roughness: 0.55 }),
    glass: std(C.glass, {
      roughness: 0.05, metalness: 0.15, envMap, envMapIntensity: 0.6, transparent: true, opacity: 0.82,
    }),
    oak: std(C.oak, { roughness: 0.8 }),
    oakDark: std(C.oakDark, { roughness: 0.8 }),
    fabric: std(C.fabric, { roughness: 1 }),
    fabricDark: std(C.fabricDark, { roughness: 1 }),
    linen: std(C.linen, { roughness: 1 }),
    worktop: std(C.worktop, { roughness: 0.6 }),
    ceramic: std(C.ceramic, { roughness: 0.45 }),
    canopy: std(C.canopy, { flatShading: true, roughness: 1 }),
    trunk: std(C.trunk, { roughness: 1 }),
    dark: std(C.frame, { roughness: 0.4 }),
    plotLine: lineMat(C.plotLine),
    poolLine: lineMat(C.poolLine),
  };
  // Invisible caster for the roof shadow: writes no colour or depth, but still renders into the
  // sun's shadow map (shadow passes use their own depth material).
  M.shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  return M;
}

// ------------------------------------------------------------------ geometry helpers

const geoCache = new Map();
function boxGeo(w, h, d) {
  const key = `${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));
  return geoCache.get(key);
}

function shade(m, cast = true, receive = true) {
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

// Bottom-centred box at (x, y, z).
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = shade(new THREE.Mesh(boxGeo(w, h, d), mat));
  m.position.set(x, y, z);
  return m;
}

// Axis-aligned box from min/max corners (world or parent space).
function boxMM(x0, y0, z0, x1, y1, z1, mat) {
  return box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, y0, (z0 + z1) / 2);
}

function cyl(r, h, mat, x = 0, y = 0, z = 0, seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, h, seg).translate(0, h / 2, 0);
  const m = shade(new THREE.Mesh(g, mat));
  m.position.set(x, y, z);
  return m;
}

function group(x, y, z, children = []) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  for (const c of children) g.add(c);
  return g;
}

// house-local (x east, z south from the NW outer wall corner) -> world
const hx = (x) => HS.origin[0] + x;
const hz = (z) => HS.origin[1] + z;
const FY = HS.floorY;

// Facing helper: rotation so local +z points along (fx, fz).
const facing = (fx, fz) => Math.atan2(fx, fz);

// ------------------------------------------------------------------ baked contact shadows
// A soft dark rectangle on the floor: full inside the footprint, quadratic fall-off over
// `spread` metres outside each edge ([-x, +x, -z, +z] in the decal's local frame).

const decalVert = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const decalFrag = /* glsl */ `
  uniform vec2 halfSize;
  uniform vec4 spread;
  uniform float opacity;
  varying vec2 vP;
  float fall(float d, float s) {
    if (d <= 0.0) return 1.0;
    if (s <= 1e-4) return 0.0;
    float x = clamp(d / s, 0.0, 1.0);
    return (1.0 - x) * (1.0 - x);
  }
  void main() {
    float dx = vP.x < 0.0 ? (-vP.x - halfSize.x) : (vP.x - halfSize.x);
    float sx = vP.x < 0.0 ? spread.x : spread.y;
    float dz = vP.y < 0.0 ? (-vP.y - halfSize.y) : (vP.y - halfSize.y);
    float sz = vP.y < 0.0 ? spread.z : spread.w;
    gl_FragColor = vec4(0.0, 0.0, 0.0, fall(dx, sx) * fall(dz, sz) * opacity);
  }`;

function contactDecal({ cx, cz, y = 0, w, d, rot = 0, spread = 0.3, opacity = 0.28 }) {
  const s = Array.isArray(spread) ? spread : [spread, spread, spread, spread];
  const x0 = -w / 2 - s[0], x1 = w / 2 + s[1];
  const z0 = -d / 2 - s[2], z1 = d / 2 + s[3];
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2)
    .translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: decalVert,
    fragmentShader: decalFrag,
    uniforms: {
      halfSize: { value: new THREE.Vector2(w / 2, d / 2) },
      spread: { value: new THREE.Vector4(...s) },
      opacity: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.set(cx, y + 0.002, cz);
  m.rotation.y = rot;
  m.renderOrder = 1;
  m.userData.baseOpacity = opacity;
  m.userData.isDecal = true;
  m.visible = false;
  return m;
}

function setDecals(decals, k) {
  for (const d of decals) {
    d.material.uniforms.opacity.value = d.userData.baseOpacity * k;
    d.visible = k > 0.001;
  }
}

// ------------------------------------------------------------------ animators
// Each returns an apply(raw) function for Timeline.add. `raw` is linear progress 0..1.

const EPS = 1e-3;

function extrudeY(obj, decals = [], ease = Ease.inOutCubic) {
  return (raw) => {
    const e = ease(raw);
    obj.visible = raw > 0;
    obj.scale.y = Math.max(e, EPS);
    setDecals(decals, e);
  };
}

function growAll(obj, decals = [], ease = Ease.inOutCubic) {
  return (raw) => {
    const e = ease(raw);
    obj.visible = raw > 0;
    obj.scale.setScalar(Math.max(e, EPS));
    setDecals(decals, e);
  };
}

function growXZ(obj, decals = [], ease = Ease.inOutCubic) {
  return (raw) => {
    const e = ease(raw);
    obj.visible = raw > 0;
    obj.scale.set(Math.max(e, EPS), 1, Math.max(e, EPS));
    setDecals(decals, e);
  };
}

// Falls from `height`, grows from zero while falling, then a small squash-and-settle on landing.
function dropIn(obj, decals = [], height = A.dropHeight) {
  const baseY = obj.position.y;
  return (raw) => {
    obj.visible = raw > 0;
    const fall = Ease.outCubic(raw);
    const grow = Ease.inOutCubic(clamp01(raw / 0.45));
    const settle = Math.sin(Math.PI * clamp01((raw - 0.7) / 0.3)) * 0.045;
    obj.position.y = baseY + height * (1 - fall);
    const s = Math.max(grow, EPS);
    obj.scale.set(s * (1 + settle * 0.5), s * (1 - settle), s * (1 + settle * 0.5));
    setDecals(decals, Ease.inOutCubic(clamp01((raw - 0.35) / 0.65)));
  };
}

// Colour cross-fade on a material.
function tintMaterial(mat, fromHex, toHex) {
  const a = new THREE.Color(fromHex), b = new THREE.Color(toHex);
  return (raw) => mat.color.copy(a).lerp(b, Ease.inOutCubic(raw));
}

// ------------------------------------------------------------------ walls

// A straight wall with openings, built in wall-local space:
// local +x runs from `from` to `to`, local +z is the left-hand normal, y is up from the floor.
// Openings: { s (centre distance from start), w, sill, head, kind }.
function buildWall({ from, to, t, h, openings = [], mat, withFillers = false }) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const L = Math.hypot(dx, dz);
  const dir = new THREE.Vector3(dx / L, 0, dz / L);
  const n = new THREE.Vector3(-dir.z, 0, dir.x);
  const theta = Math.atan2(-dir.z, dir.x);

  // Elevation outline: door openings (sill 0) are notches in the outline, windows are holes.
  // One extruded mesh per wall: watertight, no T-junction cracks between pieces.
  const ops = [...openings].sort((p, q) => p.s - q.s);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (const o of ops) {
    if (o.sill > 0) continue;
    const a = o.s - o.w / 2, b = o.s + o.w / 2;
    shape.lineTo(a, 0);
    shape.lineTo(a, o.head);
    shape.lineTo(b, o.head);
    shape.lineTo(b, 0);
  }
  shape.lineTo(L, 0);
  shape.lineTo(L, h);
  shape.lineTo(0, h);
  shape.closePath();
  const fillers = [];
  for (const o of ops) {
    const a = o.s - o.w / 2, b = o.s + o.w / 2;
    if (o.sill > 0) {
      const hole = new THREE.Path();
      hole.moveTo(a, o.sill);
      hole.lineTo(a, o.head);
      hole.lineTo(b, o.head);
      hole.lineTo(b, o.sill);
      hole.closePath();
      shape.holes.push(hole);
    }
    if (withFillers) {
      const f = shade(new THREE.Mesh(new THREE.BoxGeometry(o.w, o.head - o.sill, t), mat));
      f.position.set(o.s, (o.sill + o.head) / 2, 0);
      fillers.push(f);
    }
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }).translate(0, 0, -t / 2);

  const solid = shade(new THREE.Mesh(geo, mat));
  const rig = group(hx(from[0]), FY, hz(from[1]), [solid, ...fillers]);
  rig.rotation.y = theta;
  return { rig, fillers, ops, L, dir, n, theta };
}

// Door leaf hinged at one jamb, opened by `angle` towards the wall's left normal (swing +1) or right (-1).
function doorLeaf({ s, w, head, t, swing = 1, hinge = 'start', angle = THREE.MathUtils.degToRad(80), mat, thickness = 0.04 }) {
  const lw = w - 0.02;
  const hingeX = hinge === 'start' ? s - w / 2 + 0.01 : s + w / 2 - 0.01;
  const leaf = box(lw, head - 0.01, thickness, mat, hinge === 'start' ? lw / 2 : -lw / 2, 0, 0);
  const g = group(hingeX, 0, swing * (t / 2 - thickness / 2), [leaf]);
  g.rotation.y = swing * angle * (hinge === 'start' ? -1 : 1);
  return g;
}

// Window / slider frame + glazing in wall-local space, pivot at the opening centre.
function windowUnit(o, M) {
  const hgt = o.head - o.sill;
  const p = 0.06, fd = 0.09;
  const g = group(o.s, o.sill + hgt / 2, 0);
  const add = (w, h, d, x, y, mat) => {
    const m = shade(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
    m.position.set(x, y, 0);
    g.add(m);
    return m;
  };
  add(p, hgt, fd, -o.w / 2 + p / 2, 0, M.frame);
  add(p, hgt, fd, o.w / 2 - p / 2, 0, M.frame);
  add(o.w, p, fd, 0, hgt / 2 - p / 2, M.frame);
  add(o.w, p, fd, 0, -hgt / 2 + p / 2, M.frame);
  const mullions = o.kind === 'slider' || o.w > 1.6 ? 1 : 0;
  for (let i = 1; i <= mullions; i++) add(p, hgt, fd, -o.w / 2 + (o.w * i) / (mullions + 1), 0, M.frame);
  const glass = add(o.w - 2 * p, hgt - 2 * p, 0.014, 0, 0, M.glass);
  glass.castShadow = false;
  return g;
}

// ------------------------------------------------------------------ furniture library
// Every piece is a Group with its origin at the bottom centre of its footprint, facing local +z.
// Returns { obj, w, d } so a contact shadow can be fitted.

const F = {
  bed(M) {
    const g = new THREE.Group();
    // length along local x, headboard at +x
    g.add(box(2.0, 0.28, 1.8, M.oak, -0.04, 0, 0));
    g.add(box(1.94, 0.22, 1.72, M.linen, -0.05, 0.28, 0));
    g.add(box(1.25, 0.07, 1.82, M.fabric, -0.4, 0.47, 0));
    g.add(box(0.42, 0.12, 0.68, M.linen, 0.68, 0.5, -0.42));
    g.add(box(0.42, 0.12, 0.68, M.linen, 0.68, 0.5, 0.42));
    g.add(box(0.08, 1.05, 1.9, M.oakDark, 1.0, 0, 0));
    return { obj: g, w: 2.1, d: 1.9 };
  },
  nightstand(M) {
    const g = new THREE.Group();
    g.add(box(0.45, 0.5, 0.4, M.oak));
    g.add(cyl(0.09, 0.05, M.linen, 0, 0.5, 0));
    g.add(cyl(0.02, 0.22, M.dark, 0, 0.55, 0, 8));
    g.add(cyl(0.12, 0.16, M.linen, 0, 0.75, 0));
    return { obj: g, w: 0.45, d: 0.4 };
  },
  wardrobe(M) {
    const g = new THREE.Group();
    g.add(box(0.79, 2.2, 0.6, M.oak, -0.405, 0, 0));
    g.add(box(0.79, 2.2, 0.6, M.oak, 0.405, 0, 0));
    return { obj: g, w: 1.6, d: 0.6 };
  },
  desk(M) {
    const g = new THREE.Group();
    g.add(box(1.4, 0.04, 0.7, M.oak, 0, 0.71, 0));
    g.add(box(0.04, 0.71, 0.66, M.oak, -0.66, 0, 0));
    g.add(box(0.04, 0.71, 0.66, M.oak, 0.66, 0, 0));
    g.add(box(0.56, 0.34, 0.03, M.dark, 0, 0.9, 0.22));
    g.add(box(0.05, 0.16, 0.05, M.dark, 0, 0.75, 0.22));
    return { obj: g, w: 1.4, d: 0.7 };
  },
  officeChair(M) {
    const g = new THREE.Group();
    g.add(cyl(0.28, 0.04, M.dark, 0, 0, 0, 5));
    g.add(cyl(0.03, 0.42, M.dark, 0, 0.04, 0, 8));
    g.add(box(0.5, 0.08, 0.48, M.fabricDark, 0, 0.44, 0));
    g.add(box(0.48, 0.5, 0.07, M.fabricDark, 0, 0.55, -0.23));
    return { obj: g, w: 0.56, d: 0.56 };
  },
  shelving(M, rng) {
    const g = new THREE.Group();
    const L = 2.0, D = 0.35, H = 2.0;
    g.add(box(0.03, H, D, M.oak, -L / 2 + 0.015, 0, 0));
    g.add(box(0.03, H, D, M.oak, L / 2 - 0.015, 0, 0));
    g.add(box(L, H, 0.02, M.oakDark, 0, 0, -D / 2 + 0.01));
    const levels = [0.0, 0.42, 0.84, 1.26, 1.68, 1.97];
    for (const y of levels) g.add(box(L - 0.06, 0.03, D - 0.02, M.oak, 0, y, 0.01));
    // Book blocks: chunky groups so they stay stable at video resolution.
    const tones = [M.fabric, M.fabricDark, M.linen, M.oakDark];
    for (let i = 0; i < 4; i++) {
      let x = -L / 2 + 0.06;
      while (x < L / 2 - 0.2) {
        const bw = 0.12 + rng() * 0.22;
        if (x + bw > L / 2 - 0.06) break;
        if (rng() > 0.28) {
          const bh = 0.24 + rng() * 0.1;
          g.add(box(bw, bh, D - 0.08, tones[Math.floor(rng() * tones.length)], x + bw / 2, levels[i] + 0.03, 0.02));
        }
        x += bw + 0.03 + rng() * 0.08;
      }
    }
    return { obj: g, w: L, d: D };
  },
  bathtub(M) {
    const g = new THREE.Group();
    const L = 1.7, W = 0.75, H = 0.55, r = 0.08;
    g.add(box(L, 0.12, W, M.ceramic));
    g.add(box(L, H, r, M.ceramic, 0, 0, -W / 2 + r / 2));
    g.add(box(L, H, r, M.ceramic, 0, 0, W / 2 - r / 2));
    g.add(box(r, H, W - 2 * r, M.ceramic, -L / 2 + r / 2, 0, 0));
    g.add(box(r, H, W - 2 * r, M.ceramic, L / 2 - r / 2, 0, 0));
    return { obj: g, w: L, d: W };
  },
  shower(M) {
    const g = new THREE.Group();
    g.add(box(0.9, 0.05, 0.9, M.ceramic));
    const screen = box(0.88, 1.95, 0.012, M.glass, 0, 0.05, 0.44);
    screen.castShadow = false;
    g.add(screen);
    g.add(box(0.9, 0.03, 0.03, M.frame, 0, 2.0, 0.44));
    return { obj: g, w: 0.9, d: 0.9 };
  },
  vanity(M) {
    const g = new THREE.Group();
    g.add(box(1.0, 0.82, 0.48, M.oak));
    g.add(box(1.02, 0.04, 0.5, M.ceramic, 0, 0.82, 0));
    g.add(box(0.46, 0.12, 0.34, M.ceramic, 0, 0.86, 0.02));
    g.add(box(0.8, 0.7, 0.02, M.glass, 0, 1.15, -0.24));
    return { obj: g, w: 1.0, d: 0.5 };
  },
  wc(M) {
    const g = new THREE.Group();
    g.add(box(0.4, 0.8, 0.18, M.ceramic, 0, 0, -0.25));
    g.add(box(0.36, 0.4, 0.5, M.ceramic, 0, 0, 0.08));
    return { obj: g, w: 0.4, d: 0.68 };
  },
  kitchenRun(M) {
    const g = new THREE.Group();
    const L = 4.7;
    g.add(box(L, 0.1, 0.55, M.oakDark, 0, 0, -0.03));
    g.add(box(L, 0.76, 0.6, M.oak, 0, 0.1, 0));
    g.add(box(L, 0.04, 0.65, M.worktop, 0, 0.86, 0.0));
    g.add(box(0.72, 0.006, 0.44, M.dark, 0.25, 0.9, 0.0));   // sink under the window
    g.add(box(0.62, 0.006, 0.5, M.dark, -1.55, 0.9, 0.0));   // hob
    return { obj: g, w: L, d: 0.65 };
  },
  tallUnit(M) {
    const g = new THREE.Group();
    g.add(box(0.7, 2.25, 0.65, M.oak));
    return { obj: g, w: 0.7, d: 0.65 };
  },
  upperUnit(M) {
    const g = new THREE.Group();
    g.add(box(1.25, 0.72, 0.35, M.oak, 0, 1.48, 0));
    return { obj: g, w: 1.25, d: 0.35 };
  },
  island(M) {
    const g = new THREE.Group();
    g.add(box(2.4, 0.88, 0.72, M.oak, 0, 0, -0.14));
    g.add(box(2.46, 0.04, 1.02, M.worktop, 0, 0.88, 0));
    return { obj: g, w: 2.46, d: 1.02 };
  },
  stool(M) {
    const g = new THREE.Group();
    g.add(cyl(0.2, 0.03, M.dark, 0, 0, 0, 16));
    g.add(cyl(0.025, 0.62, M.dark, 0, 0.03, 0, 8));
    g.add(cyl(0.2, 0.07, M.fabric, 0, 0.62, 0, 16));
    return { obj: g, w: 0.4, d: 0.4 };
  },
  diningTable(M, w = 2.0, d = 1.0, mat = M.oak) {
    const g = new THREE.Group();
    g.add(box(w, 0.045, d, mat, 0, 0.71, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(box(0.06, 0.71, 0.06, mat, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1)));
    }
    return { obj: g, w, d };
  },
  chair(M, frame = M.oak, seat = M.fabric) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.035, 0.43, 0.035, frame, sx * 0.2, 0, sz * 0.2));
    g.add(box(0.46, 0.04, 0.46, frame, 0, 0.43, 0));
    g.add(box(0.42, 0.04, 0.42, seat, 0, 0.47, 0.01));
    g.add(box(0.46, 0.4, 0.035, frame, 0, 0.47, -0.21));
    return { obj: g, w: 0.46, d: 0.46 };
  },
  sofa(M) {
    const g = new THREE.Group();
    const L = 2.2, D = 0.95;
    g.add(box(L, 0.42, D, M.fabric));
    g.add(box(L, 0.42, 0.22, M.fabric, 0, 0.42, -D / 2 + 0.11));
    g.add(box(0.18, 0.2, D, M.fabric, -L / 2 + 0.09, 0.42, 0));
    g.add(box(0.18, 0.2, D, M.fabric, L / 2 - 0.09, 0.42, 0));
    for (const x of [-0.6, 0.0, 0.6]) g.add(box(0.58, 0.1, 0.66, M.linen, x * 0.98, 0.42, 0.1));
    return { obj: g, w: L, d: D };
  },
  armchair(M) {
    const g = new THREE.Group();
    g.add(box(0.85, 0.4, 0.85, M.fabric));
    g.add(box(0.85, 0.42, 0.18, M.fabric, 0, 0.4, -0.335));
    g.add(box(0.14, 0.18, 0.85, M.fabric, -0.355, 0.4, 0));
    g.add(box(0.14, 0.18, 0.85, M.fabric, 0.355, 0.4, 0));
    g.add(box(0.56, 0.09, 0.6, M.linen, 0, 0.4, 0.08));
    return { obj: g, w: 0.85, d: 0.85 };
  },
  coffeeTable(M) {
    const g = new THREE.Group();
    g.add(box(1.0, 0.06, 0.6, M.oak, 0, 0.32, 0));
    g.add(box(0.9, 0.32, 0.5, M.oakDark, 0, 0, 0));
    return { obj: g, w: 1.0, d: 0.6 };
  },
  tvUnit(M) {
    const g = new THREE.Group();
    g.add(box(2.0, 0.48, 0.42, M.oak));
    g.add(box(1.45, 0.82, 0.05, M.dark, 0, 0.62, -0.08));
    g.add(box(0.3, 0.14, 0.18, M.dark, 0, 0.48, -0.06));
    return { obj: g, w: 2.0, d: 0.42 };
  },
  rug(M) {
    const g = new THREE.Group();
    const r = box(2.8, 0.012, 3.2, M.fabric);
    r.castShadow = false;
    g.add(r);
    return { obj: g, w: 2.8, d: 3.2 };
  },
  plant(M) {
    const g = new THREE.Group();
    g.add(cyl(0.21, 0.42, M.ceramic, 0, 0, 0, 16));
    const leaf = shade(new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), M.canopy));
    leaf.position.set(0, 0.92, 0);
    leaf.scale.set(1, 1.25, 1);
    g.add(leaf);
    return { obj: g, w: 0.42, d: 0.42 };
  },
  lounger(M) {
    const g = new THREE.Group();
    g.add(box(0.7, 0.28, 2.0, M.oakDark));
    g.add(box(0.64, 0.07, 1.36, M.linen, 0, 0.28, 0.3));
    const back = box(0.64, 0.07, 0.66, M.linen, 0, 0, 0);
    const pivot = group(0, 0.28, -0.4, [back]);
    back.position.set(0, 0, -0.33);
    pivot.rotation.x = THREE.MathUtils.degToRad(38);
    g.add(pivot);
    return { obj: g, w: 0.7, d: 2.0 };
  },
  planter(M) {
    const g = new THREE.Group();
    g.add(box(0.6, 0.55, 0.6, M.wall));
    const shrub = shade(new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), M.canopy));
    shrub.position.set(0, 0.8, 0);
    g.add(shrub);
    return { obj: g, w: 0.6, d: 0.6 };
  },
  bollard(M) {
    const g = new THREE.Group();
    g.add(cyl(0.07, 0.6, M.frame, 0, 0, 0, 12));
    return { obj: g, w: 0.14, d: 0.14 };
  },
};

// ------------------------------------------------------------------ placement helper

// Place a furniture piece in the world, add its contact shadow and register a drop-in track.
function placeFurniture(ctx, phase, label, piece, { x, z, y = FY, rot = 0, start, dur = A.furniture, mode = 'drop', spread = 0.22, opacity = 0.3 }) {
  const { obj, w, d } = piece;
  obj.position.set(x, y, z);
  obj.rotation.y = rot;
  obj.visible = false;
  ctx.scene.add(obj);
  const decal = contactDecal({ cx: x, cz: z, y, w, d, rot, spread, opacity });
  ctx.scene.add(decal);
  const apply = mode === 'drop' ? dropIn(obj, [decal])
    : mode === 'extrude' ? extrudeY(obj, [decal])
    : growAll(obj, [decal]);
  ctx.tl.add(phase, label, start, dur, apply);
  return obj;
}

// A thin ribbon line on the ground that draws itself along a polyline.
function drawLine(ctx, phase, label, pts, mat, start, dur, { width = 0.07, y = 0.012, closed = true } = {}) {
  const path = closed ? [...pts, pts[0]] : pts;
  const segs = [];
  const root = new THREE.Group();
  ctx.scene.add(root);
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, z0] = path[i], [x1, z1] = path[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const geo = new THREE.BoxGeometry(len + width, 0.004, width).translate((len + width) / 2 - width / 2, 0, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x0, y, z0);
    m.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
    m.visible = false;
    root.add(m);
    segs.push({ m, from: total, len });
    total += len;
  }
  ctx.tl.add(phase, label, start, dur, (raw) => {
    const drawn = Ease.inOutCubic(raw) * total;
    for (const s of segs) {
      const k = clamp01((drawn - s.from) / s.len);
      s.m.visible = k > 0;
      s.m.scale.x = Math.max(k, EPS);
    }
  });
  return root;
}

// Flat XZ shape (world coords) with optional rectangular holes, lying at height y.
function flatShape(outer, holes, mat, y = 0) {
  const toShape = (pts, S) => {
    S.moveTo(pts[0][0], -pts[0][1]);
    for (let i = 1; i < pts.length; i++) S.lineTo(pts[i][0], -pts[i][1]);
    S.closePath();
    return S;
  };
  const shape = toShape(outer, new THREE.Shape());
  for (const h of holes) shape.holes.push(toShape(h, new THREE.Path()));
  const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// ================================================================== STATIC CONTEXT

function buildStaticContext(ctx) {
  const { scene, M } = ctx;
  const pl = P.plot;
  const plotRect = rect(pl.x0, pl.z0, pl.x0 + pl.w, pl.z0 + pl.d);
  const poolRect = rect(P.pool.x[0], P.pool.z[0], P.pool.x[1], P.pool.z[1]);

  // Ground outside the plot (with the plot cut out) and the plot surface (with the pool cut out).
  scene.add(flatShape(rect(-300, -300, 300, 300), [plotRect], M.ground, 0));
  ctx.refs.lawn = flatShape(plotRect, [poolRect], M.lawn, 0);
  scene.add(ctx.refs.lawn);

  // Street context on the north side: sidewalk and road, flush with the ground.
  const sw = boxMM(-300, -0.02, P.street.sidewalk[0], 300, 0.06, P.street.sidewalk[1], M.sidewalk);
  sw.castShadow = false;
  const rd = boxMM(-300, -0.02, P.street.road[0], 300, 0.004, P.street.road[1], M.road);
  rd.castShadow = false;
  scene.add(sw, rd);
}

// ================================================================== PHASE BUILDERS

// 01 Site set-out: plot line draws itself, pool outline, house footprint pad.
function phase01SetOut(ctx) {
  const t0 = phaseStart(1);
  const pl = P.plot;
  // Plot line: drawn just inside the boundary so it stays visible along the inner face of the
  // perimeter wall. Starts at the vehicle entrance and runs clockwise.
  const i = P.perimeterWall.thickness + 0.06;
  const x0 = pl.x0 + i, z0 = pl.z0 + i, x1 = pl.x0 + pl.w - i, z1 = pl.z0 + pl.d - i;
  drawLine(ctx, 1, 'plot boundary line', [[P.vehicleGate.x[0], z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]],
    ctx.M.plotLine, t0 + 0.05, A.line, { closed: true });
  // Pool set-out line: sits on the pool edge, later rides up onto the coping (phase 9).
  ctx.refs.poolLine = drawLine(ctx, 1, 'pool set-out line', rect(P.pool.x[0], P.pool.z[0], P.pool.x[1], P.pool.z[1]),
    ctx.M.poolLine, t0 + 0.3, 0.75, { width: 0.06, y: 0.014 });

  const pad = boxMM(hx(0), 0, hz(0), hx(15.25), 0.02, hz(9.25), ctx.M.paving);
  pad.castShadow = false;
  const padRig = group(hx(15.25 / 2), 0, hz(9.25 / 2), [pad]);
  pad.position.set(0, 0, 0);
  padRig.visible = false;
  ctx.scene.add(padRig);
  ctx.tl.add(1, 'house footprint pad', t0 + 0.5, 0.7, growXZ(padRig));
}

// 02 Foundation & pool dig: slab rises, pool shell sinks into the ground.
function phase02Foundation(ctx) {
  const t0 = phaseStart(2);
  const pr = HS.slabProjection;
  const slab = boxMM(hx(-pr), 0, hz(-pr), hx(15.25 + pr), FY, hz(9.25 + pr), ctx.M.slab);
  const rig = group(0, 0, 0, [slab]);
  rig.visible = false;
  ctx.scene.add(rig);
  const baseDecal = contactDecal({
    cx: hx(15.25 / 2), cz: hz(9.25 / 2), w: 15.25 + 2 * pr, d: 9.25 + 2 * pr, spread: 0.7, opacity: 0.32,
  });
  ctx.scene.add(baseDecal);
  ctx.tl.add(2, 'foundation slab rises', t0 + 0.05, A.slab, extrudeY(rig, [baseDecal]));

  // Pool shell: an inward-facing box below ground. Before the dig its floor sits flush with the
  // ground in the ground colour, so the hole in the lawn is never visible.
  const pool = P.pool;
  const w = pool.x[1] - pool.x[0], d = pool.z[1] - pool.z[0];
  const shellGeo = new THREE.BoxGeometry(w, pool.depth, d).translate(0, -pool.depth / 2, 0);
  const shell = new THREE.Mesh(shellGeo, ctx.M.poolShell);
  shell.receiveShadow = true;
  const shellRig = group((pool.x[0] + pool.x[1]) / 2, 0, (pool.z[0] + pool.z[1]) / 2, [shell]);
  shellRig.scale.y = 0.002;
  ctx.scene.add(shellRig);
  const tint = tintMaterial(ctx.M.poolShell, C.ground, C.poolShell);
  ctx.tl.add(2, 'pool shell sinks', t0 + 0.4, 0.8, (raw) => {
    const e = Ease.inOutCubic(raw);
    shellRig.scale.y = Math.max(e, 0.002);
    tint(raw);
  });
}

// 03 Facade walls: perimeter walls extrude, then the openings are cut.
function phase03Facade(ctx) {
  const t0 = phaseStart(3);
  const t = HS.extWall, h = HS.wallHeight, W = 15.25, D = 9.25, c = t / 2;
  const defs = [
    { side: 'N', from: [0, c], to: [W, c], axis: 0 },
    { side: 'E', from: [W - c, t], to: [W - c, D - t], axis: 1 },
    { side: 'S', from: [W, D - c], to: [0, D - c], axis: 0 },
    { side: 'W', from: [c, D - t], to: [c, t], axis: 1 },
  ];
  ctx.refs.extWalls = [];
  defs.forEach((def, i) => {
    const start = def.from[def.axis];
    const openings = (P.openings[def.side] || []).map((o) => ({ ...o, s: Math.abs(o.at - start) }));
    const wall = buildWall({ from: def.from, to: def.to, t, h, openings, mat: ctx.M.wall, withFillers: true });
    wall.rig.visible = false;
    ctx.scene.add(wall.rig);
    // Contact shadow on the inner floor only (local +z is the inside for these clockwise walls).
    const mid = [(def.from[0] + def.to[0]) / 2, (def.from[1] + def.to[1]) / 2];
    const decal = contactDecal({
      cx: hx(mid[0]), cz: hz(mid[1]), y: FY, w: wall.L, d: t, rot: wall.theta,
      spread: [0, 0, 0, 0.35], opacity: 0.22,
    });
    ctx.scene.add(decal);
    const ws = t0 + i * 0.1;
    ctx.tl.add(3, `facade wall ${def.side} extrudes`, ws, A.wall, extrudeY(wall.rig, [decal]));
    wall.fillers.forEach((f, j) => {
      ctx.tl.add(3, `opening cut ${def.side}${j + 1}`, ws + A.wall - 0.1 + j * 0.04, 0.5, (raw) => {
        const e = Ease.inOutCubic(raw);
        f.visible = raw < 1;
        f.scale.setScalar(Math.max(1 - e, EPS));
      });
    });
    ctx.refs.extWalls.push({ ...wall, def });
  });
}

// 04 Partitions & bathroom: interior walls, doors, bathroom fittings.
function phase04Partitions(ctx) {
  const t0 = phaseStart(4);
  const { M } = ctx;
  const t = HS.intWall, h = HS.wallHeight;
  P.partitions.forEach((p, i) => {
    const openings = p.doors.map((d) => ({ s: d.at, w: d.w, sill: 0, head: d.head, kind: 'door' }));
    const wall = buildWall({ from: p.from, to: p.to, t, h, openings, mat: M.wall });
    wall.rig.visible = false;
    ctx.scene.add(wall.rig);
    const mid = [(p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2];
    const decal = contactDecal({
      cx: hx(mid[0]), cz: hz(mid[1]), y: FY, w: wall.L, d: t, rot: wall.theta, spread: 0.32, opacity: 0.22,
    });
    ctx.scene.add(decal);
    ctx.tl.add(4, `partition ${p.id} extrudes`, t0 + i * 0.1, 0.7, extrudeY(wall.rig, [decal]));
    p.doors.forEach((d, j) => {
      const leaf = doorLeaf({ s: d.at, w: d.w, head: d.head, t, swing: d.swing, hinge: d.hinge, mat: M.oak });
      leaf.visible = false;
      wall.rig.add(leaf);
      ctx.tl.add(4, `door ${p.id}${j + 1}`, t0 + 0.45 + (i + j) * 0.06, 0.5, extrudeY(leaf));
    });
  });

  // Front door leaf, closed, in the north facade.
  const north = ctx.refs.extWalls.find((w) => w.def.side === 'N');
  const entry = north.ops.find((o) => o.kind === 'entry');
  const front = doorLeaf({ s: entry.s, w: entry.w, head: entry.head, t: HS.extWall, swing: 1, angle: 0, mat: M.oakDark, thickness: 0.06 });
  front.position.z = 0;
  front.visible = false;
  north.rig.add(front);
  ctx.tl.add(4, 'front door', t0 + 0.55, 0.5, extrudeY(front));

  // Bathroom fittings (bathroom: x 0.25-3.055, z 0.25-4.055 house-local).
  const s = t0 + 0.5;
  placeFurniture(ctx, 4, 'bathtub', F.bathtub(M), { x: hx(1.15), z: hz(0.675), start: s });
  placeFurniture(ctx, 4, 'shower tray + screen', F.shower(M), { x: hx(2.555), z: hz(0.75), start: s + 0.08 });
  placeFurniture(ctx, 4, 'vanity', F.vanity(M), { x: hx(3.055 - 0.25), z: hz(2.8), rot: facing(-1, 0), start: s + 0.16 });
  placeFurniture(ctx, 4, 'wc', F.wc(M), { x: hx(0.25 + 0.34), z: hz(3.25), rot: facing(1, 0), start: s + 0.24 });
}

// 05 Study & bedroom: desk, shelving, bed, wardrobe.
function phase05StudyBedroom(ctx) {
  const t0 = phaseStart(5);
  const { M } = ctx;
  // Study: x 3.205-5.555, z 0.25-4.055
  placeFurniture(ctx, 5, 'desk', F.desk(M), { x: hx(4.38), z: hz(0.62), rot: facing(0, -1), start: t0 });
  placeFurniture(ctx, 5, 'desk chair', F.officeChair(M), { x: hx(4.38), z: hz(1.42), rot: facing(0, -1), start: t0 + 0.08 });
  placeFurniture(ctx, 5, 'shelving', F.shelving(M, ctx.rng), { x: hx(3.205 + 0.175), z: hz(2.75), rot: facing(1, 0), start: t0 + 0.16, mode: 'extrude' });
  // Bedroom: x 0.25-5.555, z 4.205-9.0
  placeFurniture(ctx, 5, 'bed', F.bed(M), { x: hx(5.555 - 1.08), z: hz(7.0), start: t0 + 0.3, spread: 0.3 });
  placeFurniture(ctx, 5, 'nightstand N', F.nightstand(M), { x: hx(5.555 - 0.23), z: hz(5.75), rot: facing(-1, 0), start: t0 + 0.4 });
  placeFurniture(ctx, 5, 'nightstand S', F.nightstand(M), { x: hx(5.555 - 0.23), z: hz(8.25), rot: facing(-1, 0), start: t0 + 0.46 });
  placeFurniture(ctx, 5, 'wardrobe', F.wardrobe(M), { x: hx(1.15), z: hz(4.205 + 0.3), rot: facing(0, 1), start: t0 + 0.55, mode: 'extrude' });
}

// 06 Kitchen & dining: kitchen run, island + stools, dining table + chairs.
function phase06Kitchen(ctx) {
  const t0 = phaseStart(6);
  const { M } = ctx;
  // Open plan: x 5.705-15.0, z 0.25-9.0
  placeFurniture(ctx, 6, 'kitchen run', F.kitchenRun(M), { x: hx(11.95), z: hz(0.25 + 0.325), start: t0, mode: 'extrude', dur: 0.65 });
  placeFurniture(ctx, 6, 'tall unit', F.tallUnit(M), { x: hx(14.65), z: hz(0.25 + 0.325), start: t0 + 0.08, mode: 'extrude', dur: 0.65 });
  placeFurniture(ctx, 6, 'upper cabinets', F.upperUnit(M), { x: hx(10.225), z: hz(0.25 + 0.175), start: t0 + 0.16, mode: 'extrude', spread: 0.0, opacity: 0 });
  placeFurniture(ctx, 6, 'island', F.island(M), { x: hx(11.6), z: hz(2.7), start: t0 + 0.24 });
  [10.9, 11.6, 12.3].forEach((x, i) => placeFurniture(ctx, 6, `stool ${i + 1}`, F.stool(M), {
    x: hx(x), z: hz(3.55), start: t0 + 0.36 + i * 0.05,
  }));
  const tx = 12.2, tz = 5.6;
  placeFurniture(ctx, 6, 'dining table', F.diningTable(M), { x: hx(tx), z: hz(tz), start: t0 + 0.45 });
  const chairs = [
    [tx - 0.5, tz - 0.78, 0, 1], [tx + 0.5, tz - 0.78, 0, 1],
    [tx - 0.5, tz + 0.78, 0, -1], [tx + 0.5, tz + 0.78, 0, -1],
    [tx - 1.25, tz, 1, 0], [tx + 1.25, tz, -1, 0],
  ];
  chairs.forEach(([x, z, fx, fz], i) => placeFurniture(ctx, 6, `dining chair ${i + 1}`, F.chair(M), {
    x: hx(x), z: hz(z), rot: facing(fx, fz), start: t0 + 0.53 + i * 0.05,
  }));
}

// 07 Living room: rug, TV unit, sofa, coffee table, armchair, plant.
function phase07Living(ctx) {
  const t0 = phaseStart(7);
  const { M } = ctx;
  placeFurniture(ctx, 7, 'rug', F.rug(M), { x: hx(7.55), z: hz(7.0), start: t0, mode: 'grow', spread: 0.1, opacity: 0.12 });
  placeFurniture(ctx, 7, 'tv unit', F.tvUnit(M), { x: hx(5.705 + 0.21), z: hz(7.0), rot: facing(1, 0), start: t0 + 0.1 });
  placeFurniture(ctx, 7, 'sofa', F.sofa(M), { x: hx(9.05), z: hz(7.0), rot: facing(-1, 0), start: t0 + 0.2, spread: 0.28 });
  placeFurniture(ctx, 7, 'coffee table', F.coffeeTable(M), { x: hx(7.55), z: hz(7.0), rot: facing(1, 0), start: t0 + 0.3 });
  placeFurniture(ctx, 7, 'armchair', F.armchair(M), { x: hx(7.3), z: hz(5.45), rot: facing(0.15, 1), start: t0 + 0.4 });
  placeFurniture(ctx, 7, 'plant', F.plant(M), { x: hx(6.1), z: hz(8.55), start: t0 + 0.5, mode: 'grow' });
}

// 08 Roof slab: columns rise, flat roof with overhang lowers into place over the covered terrace.
function phase08Roof(ctx) {
  const t0 = phaseStart(8);
  const { M } = ctx;
  const ter = P.terrace;
  const soffit = FY + HS.wallHeight;
  P.columns.forEach(([x, z], i) => {
    const col = box(0.25, soffit - ter.top, 0.25, M.wall, 0, 0, 0);
    const rig = group(hx(x), ter.top, hz(z), [col]);
    rig.visible = false;
    ctx.scene.add(rig);
    const decal = contactDecal({ cx: hx(x), cz: hz(z), y: ter.top, w: 0.25, d: 0.25, spread: 0.3, opacity: 0.25 });
    ctx.scene.add(decal);
    ctx.tl.add(8, `terrace column ${i + 1}`, t0 + i * 0.06, 0.6, extrudeY(rig, [decal]));
  });

  // L-shaped roof: main roof with overhang + terrace canopy, one extruded slab.
  const o = HS.roofOverhang, tr = P.terraceRoof;
  const pts = [[-o, -o], [15.25 + o, -o], [tr.x[1], tr.z[1]], [tr.x[0], tr.z[1]], [tr.x[0], 9.25 + o], [-o, 9.25 + o]];
  const cx = hx(15.25 / 2), cz = hz(13.05 / 2);
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? shape.lineTo(hx(x) - cx, -(hz(z) - cz)) : shape.moveTo(hx(x) - cx, -(hz(z) - cz))));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: HS.roofThickness, bevelEnabled: false }).rotateX(-Math.PI / 2);
  const roof = shade(new THREE.Mesh(geo, M.roof), false, true);
  // While it fades the roof is transparent: draw it after decals, glass and water so it
  // blends over them instead of letting them show through.
  roof.renderOrder = 2;
  // The roof's shadow comes from an invisible proxy that can shrink away smoothly in phase 12
  // (a transparent caster would either pop off or need a noisy dithered shadow).
  const shadowProxy = shade(new THREE.Mesh(geo, M.shadowOnly), true, false);
  const inner = group(0, 0, 0, [roof, shadowProxy]);   // phase 12 lift + fade
  const outer = group(cx, soffit, cz, [inner]);  // phase 8 lower into place
  outer.visible = false;
  ctx.scene.add(outer);
  ctx.refs.roof = { outer, inner, mesh: roof, shadowProxy };
  ctx.tl.add(8, 'roof slab lowers into place', t0 + 0.2, 0.85, (raw) => {
    outer.visible = raw > 0;
    const s = Math.max(Ease.inOutCubic(clamp01(raw / 0.55)), EPS);
    outer.scale.set(s, 1, s);
    outer.position.y = soffit + A.roofDrop * (1 - Ease.inOutCubic(raw));
  });
}

// 09 Terrace & pool deck: terrace paving, paths, outdoor dining set, timber deck around the pool.
function phase09Terrace(ctx) {
  const t0 = phaseStart(9);
  const { M } = ctx;
  const ter = P.terrace;
  const terr = boxMM(hx(ter.x[0]), 0, hz(ter.z[0]), hx(ter.x[1]), ter.top, hz(ter.z[1]), M.paving);
  const terrRig = group(0, 0, 0, [terr]);
  terrRig.visible = false;
  ctx.scene.add(terrRig);
  ctx.tl.add(9, 'terrace paving', t0, 0.6, extrudeY(terrRig));

  P.paths.forEach((p, i) => {
    const m = boxMM(p.x[0], 0, p.z[0], p.x[1], 0.05, p.z[1], M.paving);
    m.castShadow = false;
    const rig = group(0, 0, 0, [m]);
    rig.visible = false;
    ctx.scene.add(rig);
    ctx.tl.add(9, `paving path ${i + 1}`, t0 + 0.1 + i * 0.08, 0.55, extrudeY(rig));
  });

  // Timber deck: rows rise in a sweep from the terrace towards the garden, leaving the pool + coping.
  const dk = P.deck, pool = P.pool, cp = pool.coping;
  const hole = { x0: pool.x[0] - cp, x1: pool.x[1] + cp, z0: pool.z[0] - cp, z1: pool.z[1] + cp };
  const rows = 24;
  const rowD = (dk.z[1] - dk.z[0]) / rows;
  for (let r = 0; r < rows; r++) {
    const z0 = dk.z[0] + r * rowD, z1 = z0 + rowD;
    const parts = [];
    const add = (x0, za, x1, zb) => {
      if (x1 - x0 > 1e-3 && zb - za > 1e-3) parts.push(boxMM(x0, 0, za, x1, dk.top, zb, M.deck));
    };
    const za = clamp(hole.z0, z0, z1), zb = clamp(hole.z1, z0, z1);
    add(dk.x[0], z0, dk.x[1], za);            // full-width strip north of the pool
    add(dk.x[0], za, hole.x0, zb);            // beside the pool, west
    add(hole.x1, za, dk.x[1], zb);            // beside the pool, east
    add(dk.x[0], zb, dk.x[1], z1);            // full-width strip south of the pool
    const rig = group(0, 0, 0, parts);
    rig.visible = false;
    ctx.scene.add(rig);
    ctx.tl.add(9, `deck row ${r + 1}`, t0 + 0.2 + r * 0.022, 0.5, extrudeY(rig));
  }
  // Pool coping ring.
  const ct = dk.top + 0.01;
  const coping = [
    boxMM(hole.x0, 0, hole.z0, hole.x1, ct, pool.z[0], M.paving),
    boxMM(hole.x0, 0, pool.z[1], hole.x1, ct, hole.z1, M.paving),
    boxMM(hole.x0, 0, pool.z[0], pool.x[0], ct, pool.z[1], M.paving),
    boxMM(pool.x[1], 0, pool.z[0], hole.x1, ct, pool.z[1], M.paving),
  ];
  const copRig = group(0, 0, 0, coping);
  copRig.visible = false;
  ctx.scene.add(copRig);
  const copingAnim = extrudeY(copRig);
  ctx.tl.add(9, 'pool coping', t0 + 0.45, 0.55, (raw) => {
    copingAnim(raw);
    ctx.refs.poolLine.position.y = ct * Ease.inOutCubic(raw);
  });

  // Outdoor dining set on the covered terrace, outside the dining slider.
  const tx = hx(12.6), tz = hz(10.95);
  placeFurniture(ctx, 9, 'outdoor table', F.diningTable(M, 1.8, 0.9, M.oakDark), { x: tx, z: tz, y: ter.top, start: t0 + 0.5 });
  const ch = [[-0.45, -0.72, 0, 1], [0.45, -0.72, 0, 1], [-0.45, 0.72, 0, -1], [0.45, 0.72, 0, -1], [-1.18, 0, 1, 0], [1.18, 0, -1, 0]];
  ch.forEach(([dx, dz, fx, fz], i) => placeFurniture(ctx, 9, `outdoor chair ${i + 1}`, F.chair(M, M.oakDark, M.linen), {
    x: tx + dx, z: tz + dz, y: ter.top, rot: facing(fx, fz), start: t0 + 0.58 + i * 0.04,
  }));
}

// 10 Pool fill & garden: water rises, lawn tint, trees grow, perimeter wall, gravel parking.
function phase10Garden(ctx) {
  const t0 = phaseStart(10);
  const { M, rng } = ctx;
  const pool = P.pool;
  const w = pool.x[1] - pool.x[0] - 0.01, d = pool.z[1] - pool.z[0] - 0.01;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), M.water);
  water.receiveShadow = true;
  water.position.set((pool.x[0] + pool.x[1]) / 2, -pool.depth + 0.02, (pool.z[0] + pool.z[1]) / 2);
  water.visible = false;
  ctx.scene.add(water);
  ctx.tl.add(10, 'pool fills', t0, 0.85, (raw) => {
    water.visible = raw > 0;
    water.position.y = -pool.depth + 0.02 + (pool.waterLevel + pool.depth - 0.02) * Ease.inOutCubic(raw);
    M.water.opacity = 0.9 * Ease.inOutCubic(clamp01(raw / 0.4));
  });

  ctx.tl.add(10, 'lawn tint', t0 + 0.05, 0.9, tintMaterial(M.lawn, C.ground, C.lawn));

  // Gravel parking at the vehicle entrance.
  const pk = P.parking;
  const gravel = boxMM(pk.x[0], 0, pk.z[0], pk.x[1], pk.top, pk.z[1], M.gravel);
  gravel.castShadow = false;
  const gRig = group(0, 0, 0, [gravel]);
  gRig.visible = false;
  ctx.scene.add(gRig);
  ctx.tl.add(10, 'gravel parking', t0 + 0.25, 0.6, extrudeY(gRig));

  // Perimeter wall with gaps at the vehicle and pedestrian entrances.
  const pl = P.plot, pw = P.perimeterWall, th = pw.thickness;
  const x0 = pl.x0, x1 = pl.x0 + pl.w, z0 = pl.z0, z1 = pl.z0 + pl.d;
  const front = [[x0, P.pedestrianGate.x[0]], [P.pedestrianGate.x[1], P.vehicleGate.x[0]], [P.vehicleGate.x[1], x1]];
  const segs = [];
  for (const [a, b] of front) if (b - a > 0.01) segs.push(boxMM(a, 0, z0, b, pw.frontHeight, z0 + th, M.wall));
  segs.push(boxMM(x1 - th, 0, z0 + th, x1, pw.sideHeight, z1, M.wall));
  segs.push(boxMM(x0, 0, z1 - th, x1 - th, pw.sideHeight, z1, M.wall));
  segs.push(boxMM(x0, 0, z0 + th, x0 + th, pw.sideHeight, z1 - th, M.wall));
  const wallRig = group(0, 0, 0, segs);
  wallRig.visible = false;
  ctx.scene.add(wallRig);
  const decals = [
    contactDecal({ cx: 0, cz: z0 + th / 2, w: pl.w, d: th, spread: [0, 0, 0.25, 0.25], opacity: 0.18 }),
    contactDecal({ cx: x1 - th / 2, cz: 0, w: th, d: pl.d, spread: [0.3, 0.3, 0, 0], opacity: 0.2 }),
    contactDecal({ cx: 0, cz: z1 - th / 2, w: pl.w, d: th, spread: [0, 0, 0.3, 0.3], opacity: 0.2 }),
    contactDecal({ cx: x0 + th / 2, cz: 0, w: th, d: pl.d, spread: [0.3, 0.3, 0, 0], opacity: 0.2 }),
  ];
  decals.forEach((dc) => ctx.scene.add(dc));
  ctx.tl.add(10, 'perimeter wall', t0 + 0.1, 0.75, extrudeY(wallRig, decals));

  // Low-poly trees grow from scale 0, staggered.
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  P.trees.forEach(([x, z, r], i) => {
    const k = 0.94 + rng() * 0.12;
    const trunkH = 2.1 + rng() * 0.3;
    const R = r * k;
    const trunk = cyl(0.11, trunkH + R * 0.5, M.trunk, 0, 0, 0, 8);
    const canopy = shade(new THREE.Mesh(canopyGeo, M.canopy));
    canopy.scale.set(R, R * 0.9, R);
    canopy.position.y = trunkH + R * 0.8;
    canopy.rotation.y = rng() * Math.PI * 2;
    const tree = group(x, 0, z, [trunk, canopy]);
    tree.visible = false;
    ctx.scene.add(tree);
    const decal = contactDecal({ cx: x, cz: z, w: 0.22, d: 0.22, spread: 0.45, opacity: 0.25 });
    ctx.scene.add(decal);
    ctx.tl.add(10, `tree ${i + 1} grows`, t0 + 0.2 + i * 0.065, A.tree, growAll(tree, [decal]));
  });
}

// 11 Finishing touches: window glazing, sun loungers, parasol, planters, gate, bollards.
function phase11Finishing(ctx) {
  const t0 = phaseStart(11);
  const { M } = ctx;
  let k = 0;
  for (const wall of ctx.refs.extWalls) {
    for (const o of wall.ops) {
      if (o.kind !== 'window' && o.kind !== 'slider') continue;
      const unit = windowUnit(o, M);
      unit.visible = false;
      wall.rig.add(unit);
      ctx.tl.add(11, `glazing ${wall.def.side} @${o.at}`, t0 + k * 0.04, 0.5, growAll(unit));
      k++;
    }
  }

  // Sun loungers on the deck east of the pool, heads to the north.
  [6.75, 8.05].forEach((x, i) => placeFurniture(ctx, 11, `sun lounger ${i + 1}`, F.lounger(M), {
    x, z: 7.3, y: P.deck.top, rot: facing(0, 1), start: t0 + 0.2 + i * 0.08,
  }));

  // Parasol: pole extrudes, canopy opens.
  const px = 7.4, pz = 5.0, py = P.deck.top;
  const pole = cyl(0.03, 2.35, M.oakDark, 0, 0, 0, 8);
  const base = cyl(0.25, 0.06, M.frame, 0, 0, 0, 16);
  const canopyGeo = new THREE.ConeGeometry(1.35, 0.42, 8).translate(0, 0.21, 0);
  const canopy = shade(new THREE.Mesh(canopyGeo, M.linen));
  const canopyRig = group(0, 2.05, 0, [canopy]);
  const parasol = group(px, py, pz, [base, pole, canopyRig]);
  parasol.visible = false;
  ctx.scene.add(parasol);
  const pd = contactDecal({ cx: px, cz: pz, y: py, w: 0.5, d: 0.5, spread: 0.15, opacity: 0.25 });
  ctx.scene.add(pd);
  ctx.tl.add(11, 'parasol pole', t0 + 0.35, 0.5, extrudeY(parasol, [pd]));
  ctx.tl.add(11, 'parasol opens', t0 + 0.6, 0.5, (raw) => {
    const e = Math.max(Ease.inOutCubic(raw), EPS);
    canopyRig.visible = raw > 0;
    canopyRig.scale.set(e, 0.3 + 0.7 * e, e);
  });

  // Planters inside the pedestrian gate, bollards along the side path.
  [[-4.1, -10.6], [-1.7, -10.6]].forEach(([x, z], i) => placeFurniture(ctx, 11, `planter ${i + 1}`, F.planter(M), {
    x, z, y: 0, start: t0 + 0.45 + i * 0.06, mode: 'grow',
  }));
  [-6.5, -2.5, 1.5].forEach((z, i) => placeFurniture(ctx, 11, `bollard ${i + 1}`, F.bollard(M), {
    x: 7.85, z, y: 0, start: t0 + 0.55 + i * 0.05, mode: 'extrude', spread: 0.12,
  }));

  // Pedestrian gate leaf, open inwards.
  const gx = P.pedestrianGate.x, z0 = P.plot.z0;
  const gw = gx[1] - gx[0] - 0.04;
  const leaf = box(gw, P.perimeterWall.frontHeight - 0.05, 0.05, M.oakDark, gw / 2, 0, 0);
  const gate = group(gx[0] + 0.02, 0.03, z0 + 0.1, [leaf]);
  gate.rotation.y = -THREE.MathUtils.degToRad(65);
  gate.visible = false;
  ctx.scene.add(gate);
  ctx.tl.add(11, 'pedestrian gate', t0 + 0.65, 0.5, extrudeY(gate));
}

// 12 The finished house: the roof lifts off and fades away -> dollhouse cutaway.
function phase12Finished(ctx) {
  const t0 = phaseStart(12);
  const { inner, shadowProxy } = ctx.refs.roof;
  const mat = ctx.M.roof;
  ctx.tl.add(12, 'roof lifts off and fades', t0, 0.75, (raw) => {
    const lift = Ease.inOutCubic(raw);
    const fade = 1 - Ease.inOutCubic(clamp01((raw - 0.1) / 0.9));
    inner.position.y = A.roofLift * lift;
    inner.visible = raw < 1;
    const transparent = fade < 0.999;
    if (mat.transparent !== transparent) {
      mat.transparent = transparent;
      mat.depthWrite = !transparent;
      mat.needsUpdate = true;
    }
    mat.opacity = fade;
    const s = Math.max(fade, EPS);
    shadowProxy.scale.set(s, 1, s);
    shadowProxy.visible = fade > 0.001;
  });
}

export const PHASE_BUILDERS = [
  phase01SetOut, phase02Foundation, phase03Facade, phase04Partitions,
  phase05StudyBedroom, phase06Kitchen, phase07Living, phase08Roof,
  phase09Terrace, phase10Garden, phase11Finishing, phase12Finished,
];

export function buildScene(scene, { envMap }) {
  const ctx = {
    scene,
    tl: new Timeline(),
    M: makeMaterials(envMap),
    rng: mulberry32(CONFIG.seed),
    refs: {},
  };
  buildStaticContext(ctx);
  for (const build of PHASE_BUILDERS) build(ctx);
  return { timeline: ctx.tl, refs: ctx.refs, materials: ctx.M };
}
