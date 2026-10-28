// Near trees as leaves on wood (27 Oct 2026, docs/LEAF_TREES.md). Within a hundred-odd metres of the
// camera a tree or bush is a trunk, eight limbs, sixteen side branches and
// 64 clusters of leaves, each cluster a camera-facing card on which the
// fragment shader cuts single leaves. Each leaf has its own colour and its
// own day to turn and to fall, so autumn comes leaf by leaf and the wood
// shows through as it goes. Light is worked out against the crown as a
// volume: a leaf deep in the crown on the far side from the sun is in the
// crown's own shadow, and a leaf between you and the sun glows through.
// Further out the forest stays VEG_VS's three-plane crosses; the two levels
// hand over in a dithered band (VEG_HANDOFF_GLSL).
//
// Which trees stand near is not decided here: VEG_PLACE_GLSL (the same
// function the far trees use) runs once per grid cell in a transform-feedback
// pass and writes one 12-float record per tree into a buffer, culled to the
// near radius and the view. Budapest's cadastre trees (TREE_VS) go through a
// second small pass from a list main.js keeps of the ones near the camera.
// The draw is then one instanced call over those records.
import { compile } from "./engine.js";
import { CLOUD_FIELD_GLSL, CRATER_GLSL, STREETLIGHT_GLSL, VEG_PLACE_GLSL,
         VEG_PAL_GLSL, VEG_HANDOFF_GLSL, VEG_BAND_GLSL } from "./shaders.js";

// One tree, in crown space: x, z across the crown and y up it, the crown a
// unit sphere (y −1 its foot, +1 its top) and y −2 the ground. FOL_VS bends
// this into each species' crown. 8 floats a vertex: the point (xyz) and kind
// (0 leaf card, 1 wood); then for a card its corner (±1, ±1), a random number
// and its place in the draw order (cards past a tree's budget are dropped,
// the rest grow to cover), for wood the outward direction and the radius as a
// share of the trunk's.
export function buildFoliageMesh() {
  let seed = 90127;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const V = [], I = [];
  const vert = (q, kind, c) => { V.push(q[0], q[1], q[2], kind, c[0], c[1], c[2], c[3]); return V.length / 8 - 1; };
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // a tube along pts, radius share rf at each point, `sides` faces
  function tube(pts, rf, sides) {
    const first = V.length / 8;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const t = nrm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const u = nrm(crs(t, Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), w = crs(t, u);
      for (let k = 0; k < sides; k++) {
        const ang = k / sides * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        vert(pts[i], 1, [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s, rf[i]]);
      }
    }
    for (let i = 0; i + 1 < pts.length; i++)
      for (let k = 0; k < sides; k++) {
        const a = first + i * sides + k, b = first + i * sides + (k + 1) % sides;
        I.push(a, a + sides, b, b, a + sides, b + sides);
      }
  }
  // the trunk, flared at the foot, running up into the crown as the leader
  tube([[0, -2, 0], [0, -1.5, 0], [0, -1, 0], [0, -0.45, 0], [0, 0.15, 0], [0, 0.62, 0]],
       [1.2, 1.0, 0.88, 0.7, 0.45, 0.14], 6);
  const tips = [[0, 0.78, 0]];
  for (let i = 0; i < 8; i++) {
    const az = i * 2.39996 + rnd() * 0.5, y0 = -0.85 + i / 7 * 1.0;
    let e = [Math.cos(az) * 0.84, y0 + 0.28 + rnd() * 0.28, Math.sin(az) * 0.84];
    const l = Math.hypot(e[0], e[1], e[2]);
    if (l > 0.92) e = e.map(v => v * 0.92 / l);
    const s = [0, y0, 0];
    const m = [s[0] * 0.45 + e[0] * 0.55, s[1] * 0.45 + e[1] * 0.55 + 0.08, s[2] * 0.45 + e[2] * 0.55];
    const k = 1 - i * 0.05;
    tube([s, m, e], [0.42 * k, 0.24 * k, 0.06 * k], 4);
    tips.push(e);
    for (let j = 0; j < 2; j++) {
      let f = [e[0] + (rnd() - 0.5) * 0.7, e[1] + (rnd() * 0.5 - 0.15), e[2] + (rnd() - 0.5) * 0.7];
      const lf = Math.hypot(f[0], f[1], f[2]), want = 0.70 + rnd() * 0.22;
      f = f.map(v => v * want / lf);
      tube([m, f], [0.11 * k, 0.025], 3);
      tips.push(f);
    }
  }
  const woodIdx = I.length;
  // leaf cards: two round every branch tip, the rest scattered over the shell
  const cards = [];
  for (const t of tips)
    for (let j = 0; j < 2; j++)
      cards.push([t[0] + (rnd() - 0.5) * 0.3, t[1] + (rnd() - 0.5) * 0.3, t[2] + (rnd() - 0.5) * 0.3]);
  while (cards.length < 64) {
    const d = nrm([rnd() - 0.5, rnd() - 0.35, rnd() - 0.5]), r = 0.55 + rnd() * 0.37;
    cards.push(d.map(v => v * r));
  }
  const order = cards.map((_, i) => i).sort(() => rnd() - 0.5);
  cards.forEach((q, i) => {
    const o = (order[i] + 0.5) / cards.length, r = rnd();
    const a = vert(q, 0, [-1, -1, r, o]);
    vert(q, 0, [1, -1, r, o]); vert(q, 0, [1, 1, r, o]); vert(q, 0, [-1, 1, r, o]);
    I.push(a, a + 1, a + 2, a, a + 2, a + 3);
  });
  return { verts: new Float32Array(V), idx: new Uint16Array(I), nIdx: I.length, woodIdx, cards: cards.length };
}

// Placement shared by both transform-feedback passes: the record a tree
// leaves for FOL_VS. Not within reach (the draw radius and FOL_MARGIN), or
// blown away: tall 0. Whether it is in view and near enough is FOL_VS's
// question, asked every frame; this pass runs only when the camera has gone
// far enough for the reach to matter (Foliage.place).
const FOL_REC_GLSL = `
uniform vec3 uEye; uniform float uNearR, uDrawR, uBudget;
uniform vec3 uSunDir;
uniform vec4 uCloudDeck, uCloudShape, uCloudWind;
uniform float uCloudT, uCloudShadow;
out vec4 oFoot; out vec4 oDim; out vec4 oExt;
${CLOUD_FIELD_GLSL}
float folCloud(vec3 wpos) {
  if (uCloudShadow <= 0.002 || uSunDir.y < 0.05 || uCloudDeck.z <= 0.01) return 1.0;
  float rise = uCloudDeck.x - wpos.y;
  if (rise <= 0.0) return 1.0;
  vec2 hit = wpos.xz + uSunDir.xz / uSunDir.y * rise;
  float n = deckField(hit, uCloudDeck, uCloudShape, deckFlowW(uCloudDeck, uCloudWind), uCloudT, 3);
  return 1.0 - uCloudShadow * deckDensity(n, uCloudDeck.z, uCloudShape.x);
}
${CRATER_GLSL}
void folRecord(bool ok, vec3 foot, float sp, float tall, float wide, float r, float rt) {
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
  oFoot = vec4(foot, sp); oDim = vec4(0.0); oExt = vec4(0.0);
  float d = length(foot - uEye);
  if (!ok || d > uNearR || sp > 15.5) return;
  if (uCraterN > 0) {
    if (blastAt(foot.xz) > 0.55) return;
    foot.y += craterDip(foot.xz);
    oFoot.y = foot.y;
  }
  oDim = vec4(tall, wide, r, rt);
  oExt = vec4(folCloud(foot), 0.0, uBudget, uDrawR);
}
`;

export const FOL_PLACE_VS = `#version 300 es
${VEG_PLACE_GLSL}
${FOL_REC_GLSL}
void main(){
  vec3 foot; float sp, tall, wide, r, rt, cov, railDist;
  bool ok = vegPlace(gl_VertexID, foot, sp, tall, wide, r, rt, cov, railDist);
  folRecord(ok, foot, sp, tall, wide, r, rt);
}`;

// the cadastre's trees, from main.js's list of the near ones (TREE_VS's layout)
export const FOL_CAD_VS = `#version 300 es
layout(location = 1) in vec4 aFoot;     // x, y, z, form
layout(location = 2) in vec4 aDim;      // height, crown, seed, -
${FOL_REC_GLSL}
void main(){
  folRecord(true, aFoot.xyz, aFoot.w, aDim.x, aDim.y, aDim.z, fract(aDim.z * 7.31 + 0.13));
}`;

export const FOL_NULL_FS = `#version 300 es
precision mediump float;
out vec4 fc;
void main(){ fc = vec4(0.0); }`;

// Each species' crown: where it starts up the tree (cf), its radius as a
// share of the crown width the placement gives (rw), its form (0 dome, 1
// cone, 2 flame or column, 3 weeping, 4 mound from the ground), how much
// light a metre of it stops in full leaf (dens), the trunk's radius as a
// share of the width, and the size of a leaf cluster. Crown starts and
// widths follow VEG_FS's silhouettes, so near and far are the same tree.
const FOL_SPECIES_GLSL = `
void folSpecies(int sp, out float cf, out float rw, out int shape, out float dens,
                out float trunk, out float card) {
  shape = 0; card = 0.42;
  if (sp == 0)                 { cf = 0.34; rw = 0.42; dens = 0.40; trunk = 0.031; }        // beech
  else if (sp == 1 || sp == 3) { cf = 0.28; rw = 0.47; dens = 0.30; trunk = 0.040; }        // oaks
  else if (sp == 2)  { cf = 0.22; rw = 0.34; shape = 2; dens = 0.38; trunk = 0.025; }       // hornbeam
  else if (sp == 4)  { cf = 0.30; rw = 0.38; dens = 0.16; trunk = 0.024; card = 0.34; }     // locust, airy
  else if (sp == 5)  { cf = 0.12; rw = 0.38; shape = 1; dens = 0.30; trunk = 0.024; card = 0.38; } // pine
  else if (sp == 6)  { cf = 0.15; rw = 0.30; shape = 2; dens = 0.30; trunk = 0.020; }       // poplar
  else if (sp == 7)  { cf = 0.20; rw = 0.50; shape = 3; dens = 0.25; trunk = 0.042; }       // willow
  else if (sp == 8)  { cf = 0.20; rw = 0.30; shape = 2; dens = 0.36; trunk = 0.022; }       // alder
  else if (sp == 9)  { cf = 0.30; rw = 0.50; dens = 0.38; trunk = 0.045; }                  // chestnut
  else if (sp == 10) { cf = 0.02; rw = 0.48; shape = 4; dens = 0.40; trunk = 0.015; }       // hazel, blackthorn
  else if (sp == 11) { cf = 0.30; rw = 0.48; shape = 4; dens = 0.35; trunk = 0.022; card = 0.45; } // vine
  else if (sp == 12) { cf = 0.34; rw = 0.50; dens = 0.30; trunk = 0.030; }                  // fruit tree
  else if (sp == 13) { cf = 0.26; rw = 0.50; dens = 0.30; trunk = 0.037; }                  // walnut
  else if (sp == 14) { cf = 0.04; rw = 0.42; shape = 1; dens = 0.50; trunk = 0.020; card = 0.40; } // spruce, thuja
  else if (sp == 15) { cf = 0.30; rw = 0.32; shape = 2; dens = 0.16; trunk = 0.017; card = 0.34; } // birch
  else               { cf = 0.30; rw = 0.44; dens = 0.30; trunk = 0.030; }
}
`;

export const FOL_VS = `#version 300 es
layout(location = 0) in vec4 aQ;      // crown-space point, kind (0 card, 1 wood)
layout(location = 1) in vec4 aC;      // card: corner, random, order; wood: direction, radius
layout(location = 2) in vec4 aFoot;   // the tree: foot (world), species
layout(location = 3) in vec4 aDim;    // tall, crown width, seed, second seed
layout(location = 4) in vec4 aExt;    // cloud over it, -, card budget, near radius
uniform mat4 uVP; uniform vec3 uEye, uSunDir;
uniform vec4 uSeason;
uniform float uTime, uPxPerM;
out vec3 vWorld, vN, vLamp, vEll;
out vec2 vUv;
out float vKind, vSp, vSeed, vCard, vLod, vSh, vAO, vCloud, vFade, vDist, vExpo;
${STREETLIGHT_GLSL}
${VEG_BAND_GLSL}
${FOL_SPECIES_GLSL}
// crown space to metres above the foot, bent into the species' form
vec3 folMap(vec3 q, float tall, float cf, float R, int shape, out float t) {
  if (q.y < -1.0) { t = 0.0; return vec3(0.0, tall * cf * (q.y + 2.0), 0.0); }
  t = (q.y + 1.0) * 0.5;
  float lxz = length(q.xz);
  float rho = min(lxz / sqrt(max(1.0 - q.y * q.y, 0.02)), 1.0);
  vec2 dir = lxz > 1e-4 ? q.xz / lxz : vec2(0.0);
  float W;
  if (shape == 1) { t = pow(t, 1.4); W = clamp((1.0 - t) * 1.05, 0.0, 1.0) * smoothstep(0.0, 0.08, t); }
  else if (shape == 2) W = pow(sin(3.14159 * pow(t, 0.75)), 0.7);
  else if (shape == 4) W = sqrt(max(0.0, 1.0 - t * t));
  else W = sqrt(max(0.0, 1.0 - (2.0 * t - 1.0) * (2.0 * t - 1.0)));
  float y = tall * (cf + t * (1.0 - cf));
  if (shape == 3) y -= tall * (1.0 - cf) * 0.5 * rho * rho * (0.3 + 0.7 * t);   // the willow hangs
  return vec3(dir.x * rho * W * R, y, dir.y * rho * W * R);
}
// metres of crown between P and the sun, the crown an ellipsoid
float folPath(vec3 P, vec3 C, vec3 Rad, vec3 L) {
  vec3 p = (P - C) / Rad, dl = L / Rad;
  float a = dot(dl, dl), b = 2.0 * dot(p, dl), c = dot(p, p) - 1.0;
  float disc = b * b - 4.0 * a * c;
  if (disc <= 0.0) return 0.0;
  float sq = sqrt(disc);
  float t0 = (-b - sq) / (2.0 * a), t1 = (-b + sq) / (2.0 * a);
  return max(0.0, t1 - max(t0, 0.0));
}
void main(){
  float tall = aDim.x;
  if (tall <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  int sp = int(aFoot.w + 0.5);
  float wide = aDim.y, seed = aDim.z, d = length(aFoot.xyz - uEye);
  vec2 nf = vegBand(aExt.w, seed);   // this tree's hand-off band (VEG_VS has the same)
  if (d > nf.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  {
    // in view? the crown's sphere against the clip box, generously
    float rad = max(tall, wide) * 0.7 + 2.0;
    vec4 c = uVP * vec4(aFoot.xyz + vec3(0.0, tall * 0.5, 0.0), 1.0);
    float m = rad * 2.5;
    if (c.w < -rad || c.x > c.w + m || c.x < -c.w - m || c.y > c.w + m || c.y < -c.w - m) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return;
    }
  }
  float cf, rw, dens, trunkF, cardF; int shape;
  folSpecies(sp, cf, rw, shape, dens, trunkF, cardF);
  bool ever = sp == 5 || sp == 14;
  float R = rw * wide, Hc = (1.0 - cf) * tall * 0.5;
  vec3 foot = aFoot.xyz;
  vec3 C = foot + vec3(0.0, tall * (cf + (1.0 - cf) * 0.5), 0.0);
  // every tree turns the same template its own way, and mirrors half of them
  float ang = seed * 6.2831853, ca = cos(ang), sa = sin(ang);
  float mir = aDim.w > 0.5 ? -1.0 : 1.0;
  vec3 q = aQ.xyz; q.x *= mir;
  q.xz = vec2(ca * q.x - sa * q.z, sa * q.x + ca * q.z);
  float t; vec3 off = folMap(q, tall, cf, R, shape, t);
  vec3 P;
  if (aQ.w > 0.5) {
    vec3 dv = aC.xyz; dv.x *= mir;
    dv.xz = vec2(ca * dv.x - sa * dv.z, sa * dv.x + ca * dv.z);
    P = foot + off + dv * max(trunkF * wide, 0.05) * aC.w;
    vN = dv; vUv = vec2(0.0); vCard = 0.0; vLod = 1.0;
  } else {
    // fewer, bigger clusters further out: the budget falls to 45% at the hand-off
    float budget = aExt.z * mix(1.0, 0.45, smoothstep(nf.y * 0.25, nf.y, d));
    if (aC.w >= budget) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    // (a narrow crown, a spruce or a poplar, keeps clusters to its own width,
    // or from above it was a round blob)
    float hs = cardF * min(0.65 * R + 0.35 * Hc, 1.1 * R) * (0.75 + 0.5 * aC.z) * inversesqrt(max(budget, 0.2));
    vec3 A = foot + off;
    float sway = sin(uTime * 1.7 + aC.z * 40.0 + foot.x * 0.07) * 0.05 * hs * t;
    A.xz += vec2(sway, sway * 0.6);
    vec3 vd = normalize(A - uEye);
    vec3 rgt = cross(vd, vec3(0.0, 1.0, 0.0));
    rgt = dot(rgt, rgt) > 1e-4 ? normalize(rgt) : vec3(1.0, 0.0, 0.0);
    vec3 up = cross(rgt, vd);
    float roll = aC.z * 6.2831853;
    vec2 c = vec2(cos(roll) * aC.x - sin(roll) * aC.y, sin(roll) * aC.x + cos(roll) * aC.y);
    vec3 side = rgt * c.x + up * c.y;
    P = A + side * hs;
    // the normal: out from the crown's middle, rounded over the card
    vec3 e = (A - C) / vec3(R, Hc, R);
    vN = normalize(normalize(e + vec3(0.0, 0.25, 0.0)) + 0.45 * side);
    vUv = aC.xy; vCard = aC.z;
    // leaves across the card by its size on screen: about 3 px a leaf,
    // never under 2 or over 16 (sub-pixel leaves are noise, NOTES)
    float px = 2.0 * hs * uPxPerM / max(d, 1.0);
    vLod = log2(clamp(px / 3.2, 2.0, 16.0));
  }
  vec3 e = (P - C) / vec3(R, Hc, R);
  vEll = e;
  float leafAmt = ever ? 1.0 : uSeason.x;
  vSh = exp(-folPath(P, C, vec3(R, Hc, R), uSunDir) * dens * mix(0.12, 1.0, leafAmt));
  float le = length(e);
  vAO = mix(0.45, 1.0, smoothstep(0.15, 1.0, le)) * (0.78 + 0.22 * clamp(e.y * 0.5 + 0.5, 0.0, 1.0));
  if (aQ.w > 0.5 && q.y < -1.0) vAO = mix(0.80, 1.0, smoothstep(-1.4, -2.0, q.y)) * mix(1.0, 0.85, leafAmt);
  // the sunny outside of the crown turns first
  vExpo = clamp(le, 0.0, 1.0) * 0.5 + clamp(e.y * 0.5 + 0.5, 0.0, 1.0) * 0.5;
  vLamp = streetLight(P, vec3(1.0), vN);
  vFade = smoothstep(nf.x, nf.y, d);
  vWorld = P; vDist = length(P - uEye);
  vKind = aQ.w; vSp = float(sp); vSeed = seed; vCloud = aExt.x;
  gl_Position = uVP * vec4(P, 1.0);
}`;

export const FOL_FS = `#version 300 es
precision highp float;
in vec3 vWorld, vN, vLamp, vEll;
in vec2 vUv;
in float vKind, vSp, vSeed, vCard, vLod, vSh, vAO, vCloud, vFade, vDist, vExpo;
out vec4 fc;
uniform vec3 uSunCol, uSkyCol, uFogCol, uSunDir, uEye;
uniform float uFogDensity, uSnow, uLift;
uniform vec4 uSeason;                // leaf, autumn, fresh, crop
${VEG_PAL_GLSL}
${VEG_HANDOFF_GLSL}
float folHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  if (vegHandoff(vSeed) < vFade) discard;
  int sp = int(vSp + 0.5);
  bool ever = sp == 5 || sp == 14;
  float leafAmt = ever ? 1.0 : uSeason.x;
  vec3 n = normalize(vN);
  vec3 bark = vegBark(sp);
  vec3 base = bark;
  bool leaf = false;
  if (vKind < 0.5) {
    vec2 uv = vUv;
    if (dot(uv, uv) > 1.0) discard;
    // the leaf grid: a power of two across, dithered between the two levels
    // either side of the card's size on screen so a level change is no pop
    float lf = floor(vLod);
    float lev = lf + (folHash(floor(gl_FragCoord.xy) + vCard * 7.0) < vLod - lf ? 1.0 : 0.0);
    float G = exp2(lev);
    vec2 g = (uv * 0.5 + 0.5) * G, cell = floor(g), f = fract(g) - 0.5;
    vec2 cc = (cell + 0.5) / G * 2.0 - 1.0;
    float id = folHash(cell + vCard * 73.1 + lev * 11.7);
    float id2 = folHash(cell * 1.71 + vCard * 29.3 + 5.3);
    float id3 = folHash(cell * 2.37 + vCard * 13.9 + 9.1);
    bool inCard = dot(cc, cc) < 0.92;
    // the order this leaf turns and falls in: the sunny outside first
    float age = clamp(id * 0.7 + (1.0 - vExpo) * 0.3, 0.0, 1.0);
    bool present = inCard && (ever || age >= 1.0 - leafAmt);
    // oak, beech and hornbeam hold some dead leaves through the winter
    bool held = !present && inCard && !ever && (sp <= 3) && id3 < 0.14;
    if (present || held) {
      float a = id2 * 6.2831853;
      vec2 lp = f - (vec2(id, id3) - 0.5) * 0.25;
      lp = vec2(cos(a) * lp.x - sin(a) * lp.y, sin(a) * lp.x + cos(a) * lp.y);
      float L = 0.50, Wd = 0.24;
      if (ever) { L = 0.56; Wd = 0.07; }
      else if (sp == 4 || sp == 15 || sp == 7) { L = 0.42; Wd = 0.14; }
      if (!ever && present) { float grow = mix(0.45, 1.0, smoothstep(0.0, 0.6, leafAmt)); L *= grow; Wd *= grow; }
      float xl = lp.x / L;
      leaf = abs(xl) < 1.0 && abs(lp.y) < Wd * (1.0 - xl * xl);
      if (ever && !leaf) {   // needles come in crossed pairs
        vec2 lq = vec2(lp.x * 0.5 - lp.y * 0.866, lp.x * 0.866 + lp.y * 0.5);
        float xq = lq.x / L;
        leaf = abs(xq) < 1.0 && abs(lq.y) < Wd * (1.0 - xq * xq);
      }
    }
    if (leaf) {
      vec3 green = vegGreen(sp) * (0.84 + fract(vSeed * 13.7) * 0.32) * (0.86 + id3 * 0.28);
      green = mix(green, green * vec3(1.18, 1.06, 0.70), id2 * 0.35);
      green = mix(green, vec3(0.44, 0.60, 0.24), uSeason.z * (ever ? 0.08 : 0.55));
      vec3 lc = green;
      if (!ever) {
        // autumn, leaf by leaf: each species' colour, some leaves redder,
        // some browner, the exposed ones first
        float turnLevel = clamp(uSeason.y * (0.55 + fract(vSeed * 5.9) * 0.9), 0.0, 1.0);
        float turned = smoothstep(age - 0.12, age + 0.12, turnLevel * 1.15);
        float redF = sp == 12 ? 0.70 : (sp == 1 || sp == 3) ? 0.25 : sp == 0 ? 0.30 : sp == 9 ? 0.20 : 0.08;
        vec3 gold = vegGold(sp);
        gold = mix(gold, vec3(0.62, 0.16, 0.08), step(1.0 - redF, id3) * 0.8);
        gold = mix(gold, vec3(0.40, 0.24, 0.12), id2 * 0.35) * (0.85 + 0.30 * id);
        lc = mix(green, gold, turned);
        vec3 dead = vec3(0.36, 0.25, 0.15) * (0.85 + 0.30 * id);
        lc = held ? dead : mix(dead, lc, smoothstep(0.0, 0.45, leafAmt));
        // April: the fruit trees flower, white and pale pink, before the leaves
        if (sp == 12 && id < uSeason.z * 0.9)
          lc = fract(vSeed * 3.3) < 0.5 ? vec3(0.96, 0.93, 0.92) : vec3(0.95, 0.78, 0.84);
      }
      base = lc;
    } else {
      // no leaf here: the twigs it grows on, two from the cluster's foot, each
      // forking once. They are the same length in every season (when they
      // reached further as the leaves fell, the owner saw the branches grow
      // in winter), short and thin: twigs, not limbs.
      // (not on a small, distant cluster in leaf, where a twig a pixel wide
      // was a grey speckle over the green)
      if (ever || (leafAmt > 0.5 && vLod < 3.0)) discard;
      float tw = 1e3, reach = 0.62;
      int nTw = vLod < 2.0 ? 1 : 2;   // a distant bare crown is mostly its limbs
      for (int k = 0; k < 2; k++) {
        if (k >= nTw) break;
        float ak = vCard * 17.0 + float(k) * 2.6;
        vec2 dir = normalize(vec2(sin(ak) * 0.8, 1.0));
        vec2 o = vec2(0.0, -0.75);
        vec2 pp = uv - o;
        float t = clamp(dot(pp, dir), 0.0, reach);
        tw = min(tw, length(pp - dir * t) + t * 0.012);
        float fa = (fract(ak) < 0.5 ? 0.6 : -0.6) + sin(ak * 5.3) * 0.2;
        vec2 fd = vec2(dir.x * cos(fa) - dir.y * sin(fa), dir.x * sin(fa) + dir.y * cos(fa));
        vec2 fp = uv - (o + dir * reach * 0.45);
        float ft = clamp(dot(fp, fd), 0.0, reach * 0.5);
        tw = min(tw, length(fp - fd * ft) + 0.006 + ft * 0.016);
      }
      if (tw > max(0.020, fwidth(uv.x) * 0.45)) discard;
      base = mix(bark, vec3(0.24, 0.19, 0.15), 0.6) * 0.8;   // twigs: darker than the bole
    }
  }
  if (uSnow > 0.001)
    base = mix(base, vec3(0.86, 0.89, 0.93),
               clamp(uSnow * smoothstep(0.05, 0.7, n.y) * (ever ? 1.0 : leaf ? leafAmt : 0.8), 0.0, 0.9));
  vec3 L = uSunDir, v = normalize(vWorld - uEye);
  float sunVis = vSh * vCloud;
  float wrap = clamp((dot(n, L) + 0.45) / 1.45, 0.0, 1.0);
  vec3 amb = uSkyCol * (0.42 + uLift * 0.36) * vAO + uLift * 0.06;
  vec3 col = base * (uSunCol * wrap * sunVis * 0.95 + amb);
  // light off the sunlit ground under the tree, onto the bole and undersides
  col += base * uSunCol * max(uSunDir.y, 0.0) * 0.12 * clamp(0.5 - 0.5 * n.y, 0.0, 1.0);
  if (leaf) {
    // the sun through the leaves: strongest looking toward it, a little on
    // every leaf's shaded side
    float back = pow(clamp(dot(v, L), 0.0, 1.0), 4.0);
    float behind = clamp(0.5 - 0.5 * dot(n, L), 0.0, 1.0);
    col += base * vec3(0.85, 1.10, 0.40) * uSunCol * sunVis * (0.15 * behind + 0.65 * back);
  }
  col += base * vLamp;
  float fog = 1.0 - exp(-vDist * uFogDensity);
  col = mix(col, uFogCol, clamp(fog, 0.0, 1.0));
  fc = vec4(col, 1.0);
}`;

const FOL_REC = 12;           // floats a tree record
const FOL_MARGIN = 40;        // m placed beyond the draw radius; placement reruns after 30
const FOL_CAD_MAX = 12288;    // cadastre trees in one near list (a park at 650 m)

// GL side: the template, the record buffer, the passes. main.js calls
// place() once a frame before any pass, and draw() from the vegetation
// block of drawWorld (never the reflection).
export class Foliage {
  constructor(gl, cap) {
    this.gl = gl;
    const m = buildFoliageMesh();
    this.mesh = m;
    const tf = ["oFoot", "oDim", "oExt"];
    this.pPlace = compile(gl, FOL_PLACE_VS, FOL_NULL_FS, tf);
    this.pCad = compile(gl, FOL_CAD_VS, FOL_NULL_FS, tf);
    this.pDraw = compile(gl, FOL_VS, FOL_FS);
    this.cap = cap + FOL_CAD_MAX;
    this.inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, this.cap * FOL_REC * 4, gl.DYNAMIC_COPY);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    for (let k = 0; k < 3; k++) {
      gl.enableVertexAttribArray(2 + k);
      gl.vertexAttribPointer(2 + k, 4, gl.FLOAT, false, FOL_REC * 4, k * 16);
      gl.vertexAttribDivisor(2 + k, 1);
    }
    this.emptyVao = gl.createVertexArray();
    this.cadBuf = gl.createBuffer();
    this.cadVao = gl.createVertexArray();
    gl.bindVertexArray(this.cadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, FOL_CAD_MAX * 32, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.tf = gl.createTransformFeedback();
    this.cad = new Float32Array(FOL_CAD_MAX * 8);
    this.cadN = 0;
    this.cadAt = null;
    this.trees = 0;
  }
  // the cadastre trees within reach of (x, z), from each loaded tile's list;
  // redone when the camera has moved 12 m or every 40 calls
  pickCadastre(tiles, x, z, reach) {
    const a = this.cadAt;
    if (a && Math.hypot(a[0] - x, a[1] - z) < 30 && a[2] === reach && ++a[3] < 120) return;
    this.cadAt = [x, z, reach, 0];
    const out = this.cad, r2 = (reach + 14) * (reach + 14);
    let n = 0;
    for (const L of tiles) {
      for (let i = 0; i < L.length && n < FOL_CAD_MAX; i += 8) {
        const dx = L[i] - x, dz = L[i + 2] - z;
        if (dx * dx + dz * dz > r2 || L[i + 3] > 15.5) continue;
        for (let k = 0; k < 8; k++) out[n * 8 + k] = L[i + k];
        n++;
      }
    }
    this.cadN = n;
    this.cadDirty = true;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cadBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, out, 0, n * 8);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  // o: vp, eye, nearR (the cadastre's), passes [[spacing, near radius,
  // budget, dense]], and the uniforms the far trees take (see main.js).
  // Reruns when the camera has moved 30 m, the passes or the craters have
  // changed, the cadastre list was redone, or every 40th call (for the
  // cloud shadow, which is sampled here).
  place(o) {
    const gl = this.gl;
    const key = JSON.stringify(o.passes) + "|" + o.nearR + "|" + o.craters;
    const a = this.at;
    if (a && !this.cadDirty && a.key === key && ++a.calls < 40
        && Math.hypot(a.x - o.eye[0], a.z - o.eye[2]) < 30) return;
    this.at = { x: o.eye[0], z: o.eye[2], key, calls: 0 };
    this.cadDirty = false;
    this.runs = (this.runs || 0) + 1;
    const rec = (p, drawR) => {
      const U = p.u;
      gl.uniform3fv(U.uEye, o.eye);
      gl.uniform1f(U.uNearR, drawR + FOL_MARGIN);
      gl.uniform1f(U.uDrawR, drawR);
      gl.uniform3fv(U.uSunDir, o.sunDir);
      gl.uniform4fv(U.uCloudDeck, o.decks.a);
      gl.uniform4fv(U.uCloudShape, o.decks.aShape);
      gl.uniform4fv(U.uCloudWind, o.decks.wind);
      gl.uniform1f(U.uCloudT, o.cloudT);
      gl.uniform1f(U.uCloudShadow, o.cloudShadow);
      o.setCraters(p);
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.tf);
    let n = 0;
    {
      const p = this.pPlace, U = p.u;
      gl.useProgram(p.p); rec(p, o.nearR);
      gl.uniform4fv(U.uSeason, o.season);
      gl.uniform4fv(U.uCityBox, o.cityBox);
      gl.uniform2f(U.uNearSize, o.nearSize[0], o.nearSize[1]);
      gl.uniform2f(U.uNearStep, o.nearStep, o.nearStep);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, o.texNear);
      gl.uniform1i(U.uHeightNear, 0);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, o.texCover);
      gl.uniform1i(U.uCover, 2);
      gl.bindVertexArray(this.emptyVao);
      for (const [spacing, r, budget, dense] of o.passes) {
        const side = 2 * Math.ceil((r + FOL_MARGIN) / spacing) + 3, cnt = side * side;
        if (n + cnt > this.cap - FOL_CAD_MAX) break;
        gl.uniform1f(U.uDense, dense);
        gl.uniform2f(U.uOrigin, Math.round(o.eye[0] / spacing) * spacing, Math.round(o.eye[2] / spacing) * spacing);
        gl.uniform1f(U.uSpacing, spacing);
        gl.uniform1i(U.uSide, side);
        gl.uniform1f(U.uBudget, budget);
        gl.uniform1f(U.uNearR, r + FOL_MARGIN);
        gl.uniform1f(U.uDrawR, r);
        gl.bindBufferRange(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.inst, n * FOL_REC * 4, cnt * FOL_REC * 4);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, cnt);
        gl.endTransformFeedback();
        n += cnt;
      }
    }
    if (this.cadN) {
      const p = this.pCad;
      gl.useProgram(p.p); rec(p, o.nearR);
      gl.uniform1f(p.u.uBudget, o.cadBudget);
      gl.bindVertexArray(this.cadVao);
      gl.bindBufferRange(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.inst, n * FOL_REC * 4, this.cadN * FOL_REC * 4);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, this.cadN);
      gl.endTransformFeedback();
      n += this.cadN;
    }
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.disable(gl.RASTERIZER_DISCARD);
    this.trees = n;
  }
  // the trees place() found, drawn in the pass that is current
  draw(o) {
    const gl = this.gl, n = this.trees;
    if (!n || this.noDraw) return;   // (noDraw: from the console, to time the rest alone)
    const p = this.pDraw, U = p.u;
    gl.useProgram(p.p);
    gl.uniformMatrix4fv(U.uVP, false, o.vp);
    gl.uniform3fv(U.uEye, o.eye);
    gl.uniform3fv(U.uSunDir, o.sunDir);
    gl.uniform4fv(U.uSeason, o.season);
    gl.uniform1f(U.uTime, o.time);
    gl.uniform1f(U.uPxPerM, o.pxPerM);
    gl.uniform3fv(U.uSunCol, o.pal.sun);
    gl.uniform3fv(U.uSkyCol, o.pal.zenith);
    gl.uniform3fv(U.uFogCol, o.pal.horizon);
    gl.uniform1f(U.uFogDensity, o.pal.fog);
    gl.uniform1f(U.uSnow, o.snow);
    gl.uniform1f(U.uLift, o.lift);
    o.setStreetLights(p);
    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.mesh.nIdx, gl.UNSIGNED_SHORT, 0, n);
    gl.bindVertexArray(null);
  }
}
