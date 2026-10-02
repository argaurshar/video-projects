// Single source of truth for the build-sequence animation.
// Units: metres (1 unit = 1 m). Seconds for all timings.
// World axes: +x = east, +z = south, +y = up. Ground level y = 0.
// Plot centre is the world origin. Street is on the north boundary.

export const CONFIG = {
  output: { width: 1920, height: 1080, fps: 30, duration: 15.0 },

  // Seeds every pseudo-random choice (tree size/rotation, book heights...).
  seed: 20261002,

  colors: {
    background: '#EEF0EC',
    wall: '#F2F2EE',          // walls and slabs
    ground: '#E9EEE7',
    lawn: '#DBE6D2',          // tint the lawn fades to in phase 10
    paving: '#DEDFDA',
    gravel: '#D3D1CA',
    sidewalk: '#E4E5E1',
    road: '#D9DAD6',
    deck: '#D8C3A5',
    water: '#9FD4DF',
    poolShell: '#E3ECEC',
    frame: '#1E1E1E',         // window frames, TV, hob
    glass: '#28323A',
    oak: '#D3B994',           // light oak
    oakDark: '#B99C77',
    fabric: '#C3C5C4',        // soft grey fabric
    fabricDark: '#A9ADAE',
    linen: '#EDEDE8',         // mattress, pillows, cushions
    worktop: '#F6F6F2',
    ceramic: '#FAFAF7',
    canopy: '#CFE0C4',        // low-poly tree canopy
    trunk: '#A89E90',
    plotLine: '#5FA8B8',
    poolLine: '#D9826A',
  },

  lighting: {
    exposure: 1.0,
    // Warm late-morning sun from the south-west (spec). Position is relative to the plot centre.
    sunColor: '#FFF1DE',
    sunIntensity: 2.7,
    sunPosition: [-28, 40, 24],   // azimuth SW, elevation ~47 degrees
    shadowMapSize: 4096,
    shadowRadius: 3.0,            // PCF softness in shadow-map texels
    shadowExtent: 24,             // half-size of the orthographic shadow frustum
    hemiSky: '#F3F6F9',
    hemiGround: '#DAD6CC',
    hemiIntensity: 1.25,
    fogNear: 95,
    fogFar: 260,
    // Ambient occlusion. 'contact' = baked contact shadows only (default, stable through the roof
    // fade). 'gtao' = contact shadows + screen-space GTAO on top (slower; see README caveat).
    ao: {
      mode: 'contact',
      radius: 0.6,
      distanceExponent: 1.4,
      thickness: 1.2,
      scale: 1.0,
      samples: 16,
      blendIntensity: 0.75,
    },
  },

  // 12 phases x 1.25 s. Start/end are derived: start = (index) * phaseLength.
  phaseLength: 1.25,
  phases: [
    { id: 1, key: 'setout', name: 'Site set-out' },
    { id: 2, key: 'foundation', name: 'Foundation & pool dig' },
    { id: 3, key: 'facade', name: 'Facade walls' },
    { id: 4, key: 'partitions', name: 'Partitions & bathroom' },
    { id: 5, key: 'study', name: 'Study & bedroom' },
    { id: 6, key: 'kitchen', name: 'Kitchen & dining' },
    { id: 7, key: 'living', name: 'Living room' },
    { id: 8, key: 'roof', name: 'Roof slab' },
    { id: 9, key: 'terrace', name: 'Terrace & pool deck' },
    { id: 10, key: 'garden', name: 'Pool fill & garden' },
    { id: 11, key: 'finishing', name: 'Finishing touches' },
    { id: 12, key: 'finished', name: 'The finished house' },
  ],

  // Default element animation lengths (each element 0.5-0.9 s, staggered).
  anim: {
    line: 0.9,
    wall: 0.75,
    slab: 0.7,
    furniture: 0.6,
    tree: 0.85,
    stagger: 0.08,
    dropHeight: 1.2,
    roofDrop: 3.0,
    roofLift: 5.0,
  },

  // ---------------------------------------------------------------- plan
  plan: {
    plot: { x0: -16, z0: -11, w: 32, d: 22 },          // 32 x 22 m

    house: {
      origin: [-10, -9],               // NW outer corner of the walls (world x, z)
      bays: [3.13, 2.50, 9.62],        // west -> east, outer face / partition centre-lines (sum 15.25)
      bands: [4.13, 5.12],             // north -> south (sum 9.25)
      extWall: 0.25,
      intWall: 0.15,
      floorY: 0.30,                    // top of ground-floor slab
      slabProjection: 0.15,            // slab edge visible beyond wall face
      wallHeight: 2.90,                // floor to roof soffit
      roofThickness: 0.30,
      roofOverhang: 0.60,
    },

    // Openings: `at` = centre position along the wall from its start (house-local metres),
    // w = width, sill/head = heights above finished floor.
    // Wall ends: N/S walls run x 0 -> 15.25, W/E walls run z 0 -> 9.25 (house-local).
    openings: {
      N: [
        { at: 1.55, w: 0.90, sill: 1.40, head: 2.20, kind: 'window' },  // bathroom (high)
        { at: 4.38, w: 1.20, sill: 0.90, head: 2.20, kind: 'window' },  // study
        { at: 7.10, w: 1.10, sill: 0.00, head: 2.30, kind: 'entry' },   // front door
        { at: 12.20, w: 2.40, sill: 1.05, head: 2.20, kind: 'window' }, // kitchen
      ],
      S: [
        { at: 2.80, w: 2.40, sill: 0.50, head: 2.30, kind: 'window' },  // bedroom
        { at: 8.60, w: 3.00, sill: 0.00, head: 2.50, kind: 'slider' },  // living -> terrace
        { at: 12.60, w: 3.00, sill: 0.00, head: 2.50, kind: 'slider' }, // dining -> terrace
      ],
      W: [
        { at: 6.80, w: 1.40, sill: 0.90, head: 2.20, kind: 'window' },  // bedroom side
      ],
      E: [
        { at: 5.20, w: 2.00, sill: 0.60, head: 2.30, kind: 'window' },  // dining
      ],
    },

    // Interior partitions (house-local). Doors: `at` along the wall from its start.
    // swing +1 opens towards the wall's left-hand normal (direction rotated +90 deg: south -> west, east -> south).
    partitions: [
      { id: 'bath-study', from: [3.13, 0.25], to: [3.13, 4.055], doors: [] },
      { id: 'core', from: [5.63, 0.25], to: [5.63, 9.0], doors: [
        { at: 3.05, w: 0.90, head: 2.10, swing: 1, hinge: 'end' },    // study door (opens into study)
        { at: 4.75, w: 0.90, head: 2.10, swing: 1, hinge: 'start' },  // bedroom door (opens into bedroom)
      ] },
      { id: 'band', from: [0.25, 4.13], to: [5.555, 4.13], doors: [
        { at: 2.15, w: 0.80, head: 2.10, swing: -1, hinge: 'start' }, // en-suite bathroom door (opens into bathroom)
      ] },
    ],

    // Covered terrace under the roof overhang, 9.0 x 3.5 = 31.5 m2 (house-local).
    terrace: { x: [6.25, 15.25], z: [9.25, 12.75], top: 0.15 },
    terraceRoof: { x: [5.95, 15.85], z: [9.85, 13.05] },
    columns: [[6.40, 12.60], [10.75, 12.60], [15.10, 12.60]],

    // World coordinates from here on.
    pool: { x: [-2.5, 5.5], z: [5.5, 9.0], depth: 1.4, waterLevel: -0.12, coping: 0.30 },
    deck: { x: [-3.75, 9.5], z: [3.75, 10.0], top: 0.15, plank: 0.145, gap: 0.012 },
    parking: { x: [11.5, 15.5], z: [-11.0, -2.0], top: 0.04 },        // 4 x 9 m gravel
    vehicleGate: { x: [11.5, 15.5] },                                // gap in north wall
    pedestrianGate: { x: [-3.45, -2.35] },                           // gap in north wall
    paths: [
      { x: [-3.45, -2.35], z: [-11.0, -10.3] },   // pedestrian gate -> front walk
      { x: [-3.45, 11.5], z: [-10.3, -9.15] },    // front walk: parking -> front door
      { x: [6.4, 7.6], z: [-9.15, 3.75] },        // side path to the pool deck
    ],
    perimeterWall: { thickness: 0.2, frontHeight: 0.9, sideHeight: 1.5 },
    street: { sidewalk: [-13.0, -11.0], road: [-21.0, -13.0] },

    // Tree positions (world x, z) and nominal canopy radius.
    trees: [
      [-14.2, -7.4, 1.5], [-14.3, -1.6, 1.6], [-14.0, 3.9, 1.6], [-13.4, 9.0, 1.5],
      [-8.2, 9.4, 1.4], [12.8, 9.2, 1.5], [14.4, 4.4, 1.5], [14.3, 0.2, 1.3],
      [8.9, -6.6, 1.4], [-12.6, -10.0, 1.1],
    ],
  },

  // ---------------------------------------------------------------- camera
  // Spherical keys around a moving target. az: degrees from south (+z) towards east (+x).
  // pitch: degrees above horizontal. Interpolated with a monotone Catmull-Rom (Hermite) spline
  // over time, zero velocity at both ends. Holds still after the last key.
  camera: {
    fov: 38,
    near: 0.5,
    far: 600,
    keys: [
      { t: 0.0, az: -97, pitch: 15, dist: 41, target: [-1.0, 0.0, 0.0] },
      { t: 3.0, az: -90, pitch: 18, dist: 37, target: [-1.8, 0.4, -1.2] },
      { t: 6.5, az: -32, pitch: 30, dist: 31, target: [-2.5, 1.0, -3.0] },
      { t: 10.0, az: 18, pitch: 35, dist: 35, target: [-1.0, 0.8, -1.2] },
      { t: 14.5, az: 21, pitch: 57, dist: 46, target: [1.9, 0.0, 1.4] },
    ],
  },
};

export const PHASES = CONFIG.phases.map((p, i) => ({
  ...p,
  start: +(i * CONFIG.phaseLength).toFixed(4),
  end: +((i + 1) * CONFIG.phaseLength).toFixed(4),
}));

export const phaseStart = (id) => (id - 1) * CONFIG.phaseLength;
