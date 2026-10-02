// Engine: renderer, lights, camera rig, deterministic renderAt(t), preview UI.
// Everything on screen is a pure function of one time value t (seconds).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG, PHASES } from './config.js';
import { buildScene } from './builders.js';

const params = new URLSearchParams(location.search);
const EXPORT = params.has('export');
const { width: OUT_W, height: OUT_H, fps: FPS, duration: DURATION } = CONFIG.output;
const L = CONFIG.lighting;

// ------------------------------------------------------------------ renderer

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: EXPORT,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = L.exposure;
renderer.shadowMap.enabled = true;
// PCFSoftShadowMap was removed in three r18x; PCF + shadow.radius gives the soft filtered result.
renderer.shadowMap.type = THREE.PCFShadowMap;

// ------------------------------------------------------------------ scene, lights

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.background);
scene.fog = new THREE.Fog(CONFIG.colors.background, L.fogNear, L.fogFar);

const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;   // only glass + water use it

const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemiIntensity);
scene.add(hemi);

const sun = new THREE.DirectionalLight(L.sunColor, L.sunIntensity);
sun.position.set(...L.sunPosition);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(L.shadowMapSize, L.shadowMapSize);
sun.shadow.radius = L.shadowRadius;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
const sc = sun.shadow.camera;
sc.left = -L.shadowExtent; sc.right = L.shadowExtent;
sc.top = L.shadowExtent; sc.bottom = -L.shadowExtent;
sc.near = 1; sc.far = 120;
scene.add(sun, sun.target);

const { timeline, refs } = buildScene(scene, { envMap });

// ------------------------------------------------------------------ camera rig
// Spherical keys (azimuth, pitch, distance around a moving target), each channel interpolated
// with a non-uniform Catmull-Rom Hermite spline in time. Tangents are limited (Fritsch-Carlson)
// so the path never overshoots or reverses, and are zero at both ends: the move eases in from
// rest and settles into the final hold. No roll: the camera always looks at the target with +y up.

const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, OUT_W / OUT_H, CONFIG.camera.near, CONFIG.camera.far);
const KEYS = CONFIG.camera.keys;

function makeChannel(get) {
  const t = KEYS.map((k) => k.t);
  const v = KEYS.map(get);
  const n = v.length;
  const m = v.map((_, i) => {
    if (i === 0 || i === n - 1) return 0;
    const d0 = (v[i] - v[i - 1]) / (t[i] - t[i - 1]);
    const d1 = (v[i + 1] - v[i]) / (t[i + 1] - t[i]);
    if (d0 * d1 <= 0) return 0;
    const cr = (v[i + 1] - v[i - 1]) / (t[i + 1] - t[i - 1]);
    const lim = 3 * Math.min(Math.abs(d0), Math.abs(d1));
    return Math.sign(cr) * Math.min(Math.abs(cr), lim);
  });
  return (time) => {
    if (time <= t[0]) return v[0];
    if (time >= t[n - 1]) return v[n - 1];
    let i = 0;
    while (time > t[i + 1]) i++;
    const h = t[i + 1] - t[i];
    const s = (time - t[i]) / h;
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v[i] + (s3 - 2 * s2 + s) * h * m[i]
      + (-2 * s3 + 3 * s2) * v[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

const ch = {
  az: makeChannel((k) => k.az),
  pitch: makeChannel((k) => k.pitch),
  dist: makeChannel((k) => k.dist),
  tx: makeChannel((k) => k.target[0]),
  ty: makeChannel((k) => k.target[1]),
  tz: makeChannel((k) => k.target[2]),
};

function cameraAt(t) {
  const az = THREE.MathUtils.degToRad(ch.az(t));
  const pitch = THREE.MathUtils.degToRad(ch.pitch(t));
  const dist = ch.dist(t);
  const target = new THREE.Vector3(ch.tx(t), ch.ty(t), ch.tz(t));
  const position = new THREE.Vector3(
    target.x + dist * Math.cos(pitch) * Math.sin(az),
    target.y + dist * Math.sin(pitch),
    target.z + dist * Math.cos(pitch) * Math.cos(az),
  );
  return { position, target, fov: CONFIG.camera.fov };
}

// ------------------------------------------------------------------ optional GTAO
// Off by default: the baked contact shadows are stable through the roof fade, while screen-space
// AO cannot see a half-transparent roof and would change abruptly when it disappears.

let composer = null;
if (L.ao.mode === 'gtao') {
  const rt = new THREE.WebGLRenderTarget(OUT_W, OUT_H, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, OUT_W, OUT_H);
  gtao.updateGtaoMaterial({
    radius: L.ao.radius, distanceExponent: L.ao.distanceExponent,
    thickness: L.ao.thickness, scale: L.ao.scale, samples: L.ao.samples,
  });
  gtao.blendIntensity = L.ao.blendIntensity;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
}

// ------------------------------------------------------------------ sizing

function setSize(w, h, dpr) {
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  camera.aspect = OUT_W / OUT_H;   // composition is always locked to the 16:9 export frame
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
}

function fitPreview() {
  const ui = document.getElementById('ui');
  const availW = window.innerWidth;
  const availH = window.innerHeight - (ui ? ui.offsetHeight : 0);
  const scale = Math.min(availW / OUT_W, availH / OUT_H);
  setSize(Math.floor(OUT_W * scale), Math.floor(OUT_H * scale), Math.min(window.devicePixelRatio || 1, 2));
}

// ------------------------------------------------------------------ deterministic render

export function phaseAt(t) {
  return PHASES.find((p) => t >= p.start && t < p.end) || PHASES[PHASES.length - 1];
}

function renderAt(t) {
  const time = Math.min(Math.max(t, 0), DURATION);
  timeline.apply(time);
  const cam = cameraAt(time);
  camera.position.copy(cam.position);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(cam.target);
  camera.updateMatrixWorld();
  if (composer) composer.render();
  else renderer.render(scene, camera);
  return { t: time, phase: phaseAt(time) };
}

function getTimeline() {
  const frames = Math.round(DURATION * FPS);
  const r = (v) => +v.toFixed(4);
  const samples = [];
  for (let i = 0; i < frames; i++) {
    const t = i / FPS;
    const c = cameraAt(t);
    samples.push({
      frame: i, t: r(t), phase: phaseAt(t).id,
      position: c.position.toArray().map(r), target: c.target.toArray().map(r), fov: c.fov,
    });
  }
  return {
    meta: {
      fps: FPS, duration: DURATION, frames, width: OUT_W, height: OUT_H,
      units: 'metres', axes: '+x east, +y up, +z south; origin = plot centre at ground level',
      sun: { position: L.sunPosition, color: L.sunColor, intensity: L.sunIntensity },
      threeVersion: THREE.REVISION,
    },
    phases: PHASES.map((p) => ({ id: p.id, key: p.key, name: p.name, start: p.start, end: p.end })),
    events: timeline.events,
    camera: {
      fov: CONFIG.camera.fov,
      interpolation: 'monotone Catmull-Rom (Hermite) per spherical channel, zero end tangents, hold after last key',
      keys: KEYS,
      samples,
    },
  };
}

window.renderAt = renderAt;
window.getTimeline = getTimeline;
window.__scene = { scene, camera, renderer, refs };
window.renderFrameDataURL = (t) => {
  renderAt(t);
  return renderer.domElement.toDataURL('image/png');
};

// ------------------------------------------------------------------ boot

if (EXPORT) {
  document.body.classList.add('export');
  setSize(OUT_W, OUT_H, 1);
  renderAt(0);
  window.__ready = true;
} else {
  startPreview();
}

function startPreview() {
  const ui = document.getElementById('ui');
  ui.hidden = false;
  const scrub = document.getElementById('scrub');
  const play = document.getElementById('play');
  const readout = document.getElementById('readout');
  scrub.max = String(DURATION);
  scrub.step = String(1 / FPS);

  let t = params.has('t') ? parseFloat(params.get('t')) : 0;
  let playing = !params.has('t');
  let last = performance.now();

  const show = () => {
    const { phase } = renderAt(t);
    scrub.value = String(t);
    const frame = Math.min(Math.round(t * FPS), DURATION * FPS - 1);
    readout.textContent = `${t.toFixed(2)} s  ·  frame ${String(frame).padStart(3, '0')}  ·  `
      + `${String(phase.id).padStart(2, '0')} ${phase.name}  (${phase.start.toFixed(2)}–${phase.end.toFixed(2)} s)`;
    play.textContent = playing ? 'Pause' : 'Play';
  };

  // Preview clock only. Export never uses it: it calls renderAt(i / 30) directly.
  const loop = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    if (playing) {
      t += dt;
      if (t > DURATION) t = 0;
      show();
    }
    requestAnimationFrame(loop);
  };

  scrub.addEventListener('input', () => { playing = false; t = parseFloat(scrub.value); show(); });
  play.addEventListener('click', () => { playing = !playing; show(); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { playing = !playing; e.preventDefault(); }
    if (e.code === 'ArrowRight') { playing = false; t = Math.min(DURATION, t + 1 / FPS); }
    if (e.code === 'ArrowLeft') { playing = false; t = Math.max(0, t - 1 / FPS); }
    show();
  });
  window.addEventListener('resize', () => { fitPreview(); show(); });

  fitPreview();
  show();
  window.__ready = true;
  requestAnimationFrame(loop);
}
