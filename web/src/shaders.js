// ---------------------------------------------------------------- shaders
// --------------------------------------------------------- the cloud field
// Shared verbatim between the sky and the ground. The shadow crossing a
// field has to be cast by the cloud you can actually see overhead, and the
// only way to guarantee that is for both to evaluate the same function.
export const CLOUD_FIELD_GLSL = `
float h21s(vec2 p){ return fract(sin(dot(floor(p), vec2(127.1,311.7))) * 43758.5); }
float vn(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21s(i), h21s(i+vec2(1,0)), f.x),
             mix(h21s(i+vec2(0,1)), h21s(i+vec2(1,1)), f.x), f.y);
}
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return mat2(c,-s,s,c) * p; }

// Fractal noise that is *advected*, not scrolled. Each octave is carried at
// its own speed and turns over on its own clock, so a cumulus field boils —
// cells build, lean downwind and dissolve — instead of sliding past as one
// rigid sheet. That difference is the whole of what makes a sky look alive.
//  flow  uv per second at the base octave
//  evo   how fast the field turns over, 0 for cirrus, ~1 for convection
float fbmFlow(vec2 p, vec2 flow, float t, float evo, int oct){
  float a = 0.5, sum = 0.0, nrm = 0.0, m = 1.0;
  vec2 q = p;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    float fi = float(i);
    vec2 adv = flow * t * m * (1.0 + fi * 0.22);
    float ph = t * evo * (0.055 + fi * 0.075);
    vec2 turn = vec2(sin(ph + fi * 2.1), cos(ph * 0.83 + fi * 1.7)) * 0.6 * m;
    sum += a * vn(q + adv + turn);
    nrm += a;
    q = rot2(q, 0.63) * 2.03; m *= 2.03; a *= 0.5;
  }
  return sum / nrm;
}

// The raw noise field of a deck at a point on its plane, in metres.
float deckField(vec2 w, vec4 deck, vec4 shape, vec2 flow, float t, int oct){
  float scale = deck.y, fib = shape.y, build = shape.z;
  vec2 uv = w / scale;
  uv.x /= mix(1.0, 5.5, fib);                    // fibrous types stretch downwind
  float evo = 0.12 + build * 1.05 - fib * 0.10;
  // a slow domain warp: the large shapes themselves deform, which is what
  // stops a cloud field reading as a repeating stamp
  vec2 wp = vec2(fbmFlow(uv * 0.30 + 31.7, flow * 0.55, t, evo * 0.35, 2),
                 fbmFlow(uv * 0.30 + 11.3, flow * 0.55, t, evo * 0.35, 2)) - 0.5;
  uv += wp * (0.45 + build * 0.55);
  return fbmFlow(uv, flow, t, evo, oct);
}

// coverage → density, given the type's edge hardness
float deckDensity(float n, float cover, float sharp){
  float edge0 = mix(0.62, 0.30, cover);
  return smoothstep(edge0, edge0 + mix(0.36, 0.045, sharp), n);
}

// wind at a deck's altitude: the free atmosphere runs faster than the surface
vec2 deckFlowW(vec4 deck, vec4 wind){
  float shear = 1.0 + wind.w * deck.x / 1000.0;
  return wind.xz * (wind.y * shear) / deck.y;      // uv per second
}

`;

export const SKY_VS = `#version 300 es
in vec2 aPos; out vec2 vNdc;
void main(){ vNdc = aPos; gl_Position = vec4(aPos, 1.0, 1.0); }`;

export const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNdc; out vec4 fc;
uniform mat4 uInvVP; uniform vec3 uSunDir;
uniform vec3 uZenith, uHorizon, uGround, uSunCol;
uniform float uDither, uTime;
// per-deck: x altitude m, y feature scale m, z coverage 0..1, w opacity
uniform vec4 uDeckA, uDeckB;
// x sharpness, y fibrousness, z vertical build, w self-shadow depth
uniform vec4 uShapeA, uShapeB;
// x gloom, y rain veil, z pannus (ragged scud), w anvil link
uniform vec4 uMoodA, uMoodB;
// x,z unit wind direction in world axes, y speed m/s, w shear with height
uniform vec4 uWind;
// x altitude, y feature scale, z coverage, w sharpness
uniform vec4 uAnvil;
uniform float uFlash;                 // lightning, 0..1
uniform vec3 uMoonDir, uMoonCol;
uniform float uMoonPhase;

float bayer(vec2 p){
  // 4x4 ordered dither, the cheapest thing that reads as 1998
  int x = int(mod(p.x,4.0)), y = int(mod(p.y,4.0));
  int i = y*4+x;
  float t[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
  return t[i]/16.0 - 0.5;
}
${CLOUD_FIELD_GLSL}
// A deck of cloud at a real altitude. The view ray is intersected with a
// horizontal plane at that height, so the deck converges at the horizon the
// way a real one does and a 9 km cirrus sheet reads flatter than a 1 km
// cumulus field without any extra trickery.
//
// Returns rgb premultiplied by coverage in .rgb and the coverage in .a.
vec4 cloudDeck(vec3 dir, vec3 sunDir, vec4 deck, vec4 shape, vec4 mood,
               vec3 horizonCol, vec3 zenithCol, vec3 sunCol, float t) {
  if (deck.w <= 0.001 || deck.z <= 0.001 || dir.y < 0.006) return vec4(0.0);
  float alt = deck.x, scale = deck.y, cover = deck.z, opacity = deck.w;
  float sharp = shape.x, fib = shape.y, build = shape.z, shade = shape.w;
  float gloom = mood.x, pannus = mood.z;

  vec2 flow = deckFlowW(deck, uWind);
  vec2 w = dir.xz / dir.y * alt;                 // where the ray meets the deck
  float n = deckField(w, deck, shape, flow, t, 5);
  float density = deckDensity(n, cover, sharp);
  if (density <= 0.001) return vec4(0.0);

  // fade the deck out near the horizon: we are looking through more of it,
  // but it also runs out of sky
  float grazing = smoothstep(0.006, 0.10, dir.y);
  density *= grazing * opacity;

  // shading: the field gradient stands in for a surface normal, so heaps are
  // lit on the sun side and shadowed beneath, sheets stay nearly flat
  float e = scale * 0.09;
  float gx = deckField(w + vec2(e, 0.0), deck, shape, flow, t, 3)
           - deckField(w - vec2(e, 0.0), deck, shape, flow, t, 3);
  float gz = deckField(w + vec2(0.0, e), deck, shape, flow, t, 3)
           - deckField(w - vec2(0.0, e), deck, shape, flow, t, 3);
  vec3 nrm = normalize(vec3(-gx * build * 6.0, 1.0, -gz * build * 6.0));
  float lam = clamp(dot(nrm, sunDir) * 0.5 + 0.62, 0.0, 1.35);
  float depth = 1.0 - shade * (1.0 - smoothstep(0.25, 0.95, n));

  vec3 lit = sunCol * (0.55 + 0.65 * lam);
  vec3 base = mix(horizonCol * 0.55, zenithCol * 0.75, 0.35);
  vec3 col = mix(base, lit, clamp(lam * depth, 0.0, 1.0));
  // thin high cloud takes the sun's colour straight through it
  col = mix(col, sunCol * 0.95 + horizonCol * 0.3, fib * 0.45);

  // Gloom is what separates a fair-weather heap from a raining base. A deck
  // thick enough to rain out of transmits almost nothing: the sunlit term
  // goes, and what is left is a flat slate lit only by whatever daylight
  // scatters round the edges. Making it merely darker is not the same thing —
  // it has to lose its modelling as well as its brightness.
  if (gloom > 0.001) {
    float day = clamp((sunCol.r + sunCol.g + sunCol.b) * 0.36, 0.03, 1.0);
    vec3 murk = mix(vec3(0.36,0.375,0.41), vec3(0.075,0.080,0.098), gloom)
              * (0.30 + 0.85 * day);
    col = mix(col, murk, gloom * 0.92);
    // the thickest parts are the darkest: that is where the rain is
    col *= 1.0 - gloom * 0.42 * smoothstep(0.30, 0.92, n);
    // and a rim of light survives at the edge of the sheet
    col += sunCol * (1.0 - gloom) * 0.15 * smoothstep(0.55, 0.30, density);
    density = mix(density, min(1.0, density * 1.35 + 0.25 * cover), gloom * 0.8);
  }

  // An anvil is not independent weather. It is the top of the tower below it,
  // sheared flat at the tropopause and streaming downwind, so it stands over
  // and just downwind of the cell that fed it — never on its own.
  if (mood.w > 0.01) {
    vec4 src = vec4(uAnvil.x, uAnvil.y, uAnvil.z, 1.0);
    vec4 srcShape = vec4(uAnvil.w, 0.05, 1.0, 0.0);
    vec2 back = uWind.xz * uWind.y * 900.0;      // upwind, to the tower base
    float sn = deckField(w - back, src, srcShape, deckFlowW(src, uWind), t, 3);
    float sdns = deckDensity(sn, uAnvil.z, uAnvil.w);
    density *= mix(1.0, 0.12 + 1.5 * sdns, mood.w);
    if (density <= 0.001) return vec4(0.0);
  }

  // Pannus: the ragged scud that tears off below a raining base and races
  // along under it. Small, fast, much darker than what it hangs beneath.
  if (pannus > 0.02) {
    vec4 pd = vec4(alt * 0.32, scale * 0.16, 0.55, 1.0);
    vec4 ps = vec4(0.45, 0.55, 0.10, 0.0);
    vec2 pf = deckFlowW(pd, uWind) * 1.6;
    vec2 pw = dir.xz / dir.y * pd.x;
    float pn = deckField(pw, pd, ps, pf, t, 3);
    float pdens = deckDensity(pn, 0.42 + pannus * 0.25, 0.62)
                * smoothstep(0.010, 0.055, dir.y) * pannus;
    col = mix(col, col * 0.42, clamp(pdens, 0.0, 0.85));
    density = clamp(density + pdens * 0.5 * (1.0 - density), 0.0, 1.0);
  }

  return vec4(col * density, density);
}

// Rain does not stay in the cloud. Under a raining base the shafts hang
// between the base and the ground and lean downwind, and at ten kilometres
// they are the most legible thing in the sky. For a ray below the elevation
// of the cloud base at some distance, the deck's own density directly above
// that point says whether a curtain is falling there.
vec3 rainShafts(vec3 dir, vec4 deck, vec4 shape, float veil, float t,
                vec3 fogCol, out float amount) {
  amount = 0.0;
  if (veil <= 0.01 || dir.y <= 0.0 || dir.y > 0.30) return vec3(0.0);
  vec2 hd = dir.xz;
  float hl = length(hd);
  if (hl < 1e-4) return vec3(0.0);
  hd /= hl;
  vec2 flow = deckFlowW(deck, uWind);
  float acc = 0.0;
  for (int i = 0; i < 2; i++) {
    float D = i == 0 ? 4200.0 : 12000.0;
    float top = deck.x / D;                     // elevation of the base there
    if (dir.y >= top) continue;
    // the shaft leans: by the time it reaches the ground the wind has carried
    // it a long way downwind of the cell that dropped it
    vec2 lean = uWind.xz * uWind.y * 42.0;
    float n = deckField(hd * D + lean, deck, shape, flow, t, 3);
    // curtains, not a wash: a shower has edges, and the gap between two of
    // them is the whole reason you can tell one is coming
    float dens = smoothstep(0.18, 0.80, deckDensity(n, deck.z, shape.x));
    // a curtain is heaviest just under the base and fades out towards the
    // ground, where it has already been rained out
    float h = clamp(dir.y / max(top, 1e-4), 0.0, 1.0);
    acc += dens * mix(0.35, 1.0, h) * (i == 0 ? 0.62 : 0.38);
  }
  amount = clamp(acc * veil, 0.0, 0.92);
  // falling rain scatters light: a curtain is paler than the base above it
  return fogCol * 1.06 + vec3(0.02);
}

void main(){
  vec4 p0 = uInvVP * vec4(vNdc, -1.0, 1.0);
  vec4 p1 = uInvVP * vec4(vNdc,  1.0, 1.0);
  vec3 dir = normalize(p1.xyz/p1.w - p0.xyz/p0.w);
  float h = dir.y;
  vec3 col = h > 0.0
    ? mix(uHorizon, uZenith, pow(clamp(h,0.0,1.0), 0.55))
    : mix(uHorizon, uGround, pow(clamp(-h,0.0,1.0), 0.35));
  float sd = max(dot(dir, uSunDir), 0.0);
  // the sun's disc and aureole live behind the cloud, not in front of it
  col += uSunCol * (pow(sd, 220.0)*1.6 + pow(sd, 9.0)*0.30 + pow(sd, 2.5)*0.07);

  // 3D Moon disc, horizon enlargement illusion, lunar maria, synodic phase & halo
  float md = dot(dir, uMoonDir);
  if (md > 0.0) {
    vec3 mUp = vec3(0.0, 1.0, 0.0);
    vec3 mRight = normalize(cross(uMoonDir, mUp));
    vec3 mTop = cross(mRight, uMoonDir);
    // Horizon moon illusion: appears larger when low in the sky
    float moonScale = mix(58.0, 82.0, smoothstep(0.02, 0.45, max(0.0, uMoonDir.y)));
    vec2 mUv = vec2(dot(dir - uMoonDir, mRight), dot(dir - uMoonDir, mTop)) * moonScale;
    float rad = length(mUv);
    float disc = smoothstep(1.03, 0.97, rad);

    if (disc > 0.001) {
      float maria = sin(mUv.x * 3.8 + sin(mUv.y * 4.2)) * cos(mUv.y * 3.5 - mUv.x * 2.1);
      float crater = fract(sin(dot(floor(mUv * 5.5), vec2(12.9898, 78.233))) * 43758.5453);
      vec3 moonSurf = mix(vec3(0.94, 0.95, 0.98), vec3(0.68, 0.72, 0.78), smoothstep(-0.2, 0.6, maria) * 0.45 + crater * 0.15);

      // Warm golden harvest moon tint near horizon, silvery white when high
      vec3 moonTint = mix(vec3(1.18, 0.88, 0.58), vec3(0.96, 0.98, 1.05), smoothstep(0.04, 0.35, max(0.0, uMoonDir.y)));
      moonSurf *= moonTint;

      float phaseAngle = (uMoonPhase - 0.5) * 6.2831853;
      float nx = mUv.x;
      float nz = sqrt(max(0.0, 1.0 - rad * rad));
      float illum = nx * sin(phaseAngle) + nz * cos(phaseAngle);
      float term = smoothstep(-0.09, 0.09, illum);
      vec3 earthshine = vec3(0.05, 0.07, 0.10) * moonTint;
      vec3 finalMoon = mix(earthshine, moonSurf * 1.95, term);
      col = mix(col, finalMoon, disc);
    }
    float halo = pow(max(0.0, md), 160.0) * 0.48 + pow(max(0.0, md), 12.0) * 0.14 + pow(max(0.0, md), 3.0) * 0.04;
    col += uMoonCol * halo * (0.35 + 0.65 * (1.0 - abs(uMoonPhase - 0.5) * 2.0));
  }

  // two decks, highest composited first, each at its own real altitude
  vec4 hi = cloudDeck(dir, uSunDir, uDeckB, uShapeB, uMoodB,
                      uHorizon, uZenith, uSunCol, uTime);
  col = mix(col, hi.rgb / max(hi.a, 0.001), clamp(hi.a, 0.0, 0.985));
  vec4 lo = cloudDeck(dir, uSunDir, uDeckA, uShapeA, uMoodA,
                      uHorizon, uZenith, uSunCol, uTime);

  // lightning lights the cloud from inside, brightest in the thickest part
  if (uFlash > 0.001 && lo.a > 0.01) {
    vec3 bolt = vec3(0.92, 0.94, 1.0) * uFlash * (1.6 + uMoodA.x * 2.2);
    lo.rgb += bolt * lo.a * lo.a;
    col += bolt * 0.10;
  }
  col = mix(col, lo.rgb / max(lo.a, 0.001), clamp(lo.a, 0.0, 0.985));

  // and the rain hanging beneath it, in front of the sky but behind nothing
  float veilAmt;
  vec3 veilCol = rainShafts(dir, uDeckA, uShapeA, uMoodA.y, uTime,
                            uHorizon, veilAmt);
  col = mix(col, veilCol * (1.0 - uMoodA.x * 0.35), veilAmt);

  col += bayer(gl_FragCoord.xy) * uDither;
  fc = vec4(col, 1.0);
}`;

// Street and platform lamps as real lights. The lamp heads have always
// glowed, but nothing under them was lit, so a street at night was a row of
// bright dots over dark tarmac. The nearest 48 lamps to the camera arrive as
// uSL (world positions) each frame; each throws a warm pool about 30 m
// across. uSLon is the darkness, so the pools fade in with dusk.
export const FACADE_GLSL = `
// the photographed panel façades (tools/bake_facades.py → data/facades.webp):
// five tiles side by side, each a whole number of bays and storeys
uniform sampler2D uFacTex;
// Façades, shared by the polygon buildings (TRACK_FS) and the boxes (BLDG_FS).
// The owner's note: "not every building is a tower building with tower
// windows" — a shed has none, a small house has a few small ones, an office
// is glass, a shopping box is blank with a glazed front, a hall has a band of
// clerestory lights. The kind comes from the class the bake gives each
// building (bake_context.py CLS):
//   1 house · 2 Pest tenement · 3 panel block · 4 industrial hall (ribbon)
//   5 church · 6 glass office · 7 retail box · 8 blank shed / warehouse
//   9 civic / station · 10 modern flats
int facadeKind(int cls, float H, float seed) {
  seed = abs(seed);
  if (cls == 13) return 11;                          // a ruin: bare stone
  if (cls == 14) return 12;                          // an arena
  if (cls == 1) return 5;
  if (cls == 7) return 3;
  if (cls == 3) return seed < 0.55 ? 4 : 8;          // not every hall has windows
  if (cls == 6 || cls == 12) return 8;
  if (cls == 10) return 6;
  if (cls == 11) return 7;
  if (cls == 5) return H >= 12.0 ? 6 : 7;
  if (cls == 2 || cls == 8) return 9;
  if (cls == 4) return H >= 8.0 ? 10 : 1;
  if (cls == 9) return 2;
  return H < 8.0 ? 1 : 2;
}
// base: the wall colour, modified in place. Returns the window glow, added
// after lighting. u runs along the wall, relH is height above the building's
// own ground, H the wall height.
vec3 facade(inout vec3 base, float u, float relH, float H, int kind, float seed,
            float detail, float nightFac, vec3 sky) {
  // a negative seed: the wall colour is OSM's building:colour, keep it
  bool own = seed < 0.0;
  seed = abs(seed);
  vec3 ownCol = base;
  float glass = 0.0, mullion = 0.0, litShare = 0.4;
  float storeyH = 3.2, bayW = 4.2, groundH = 3.2;
  vec3 warm = vec3(1.95, 1.45, 0.75), cool = vec3(1.45, 1.58, 1.75);
  vec3 bulb = warm;
  bool topZone = relH > H - 1.0;
  // four ways of doing each house and each tenement, picked by the seed
  int variant = int(fract(seed * 4.713) * 4.0);
  if (kind == 2 || kind == 1) {
    // the old palette (ochres, greys) and the lighter one the owner asked
    // for: lemon, salmon, mint, sky, lilac, white, terracotta
    vec3 PAL[14] = vec3[14](vec3(0.80,0.70,0.50), vec3(0.86,0.82,0.70), vec3(0.88,0.80,0.56),
                          vec3(0.70,0.69,0.66), vec3(0.84,0.66,0.56), vec3(0.70,0.74,0.62),
                          vec3(0.78,0.74,0.66), vec3(0.94,0.86,0.56), vec3(0.93,0.71,0.60),
                          vec3(0.74,0.86,0.72), vec3(0.72,0.80,0.88), vec3(0.83,0.77,0.86),
                          vec3(0.92,0.91,0.87), vec3(0.80,0.56,0.43));
    base = own ? ownCol : PAL[int(seed * 14.0) % 14] * (0.92 + fract(seed * 13.7) * 0.14);
  }
  if (kind == 2) { groundH = 4.4; storeyH = 3.6; bayW = 2.9; }
  if (kind == 1) { groundH = 0.0; storeyH = 2.9; bayW = 3.6 + fract(seed * 5.3) * 2.4; }
  if (kind == 3) { groundH = 2.9; storeyH = 2.9; bayW = 3.3; }
  if (kind == 4) { bayW = 6.5; }
  if (kind == 5) { storeyH = max(H, 1.0); bayW = 3.4; }
  if (kind == 6) { groundH = 4.2; storeyH = 3.7; bayW = 1.6; }
  if (kind == 9) { groundH = 4.6; storeyH = 4.4; bayW = 4.6; }
  if (kind == 10) { groundH = 3.0; storeyH = 3.0; bayW = 3.2; }
  float up = relH - groundH;
  float storey = up < 0.0 ? -1.0 : floor(up / storeyH);
  float fy = up < 0.0 ? relH / max(groundH, 0.1) : fract(up / storeyH);
  float fx = fract(u / bayW);
  float bay = floor(u / bayW);

  if (kind == 2 && variant == 1 && up >= 0.0 && !topZone) {
    // a tenement with balconies: an iron railing in front of every other
    // bay on alternate floors, French windows behind them
    bool balc = mod(bay + storey, 2.0) < 1.0 && storey >= 0.0;
    float pane = step(0.26, fx) * step(fx, 0.74) * step(balc ? 0.06 : 0.18, fy) * step(fy, 0.80);
    float slab = balc ? step(0.08, fx) * step(fx, 0.92) * step(fy, 0.07) : 0.0;
    float rail = balc ? step(0.08, fx) * step(fx, 0.92) * step(0.07, fy) * step(fy, 0.36) * step(0.5, fract(u * 3.0)) : 0.0;
    mullion = step(0.48, fx) * step(fx, 0.52);
    base = mix(base, vec3(0.10, 0.12, 0.16), pane * (1.0 - mullion) * detail * 0.85);
    base = mix(base, base * 0.7, slab * detail);
    base = mix(base, vec3(0.16, 0.16, 0.17), rail * detail * 0.9);
    glass = pane; litShare = 0.45;
  } else if (kind == 2 && variant == 2 && up >= 0.0 && !topZone) {
    // pilasters between the bays and a cornice at every floor (eclectic)
    float pil = step(fx, 0.12) + step(0.88, fx);
    float cor = step(0.90, fy);
    float pane = step(0.30, fx) * step(fx, 0.70) * step(0.20, fy) * step(fy, 0.76);
    float pedi = step(0.26, fx) * step(fx, 0.74) * step(0.78, fy) * step(fy, 0.86) * step(abs(fx - 0.5) * 2.0, (0.86 - fy) * 12.0);
    base = mix(base, base * 1.14 + 0.05, clamp(pil + cor + pedi, 0.0, 1.0) * detail * 0.75);
    base = mix(base, vec3(0.10, 0.12, 0.16), pane * detail * 0.85);
    glass = pane; litShare = 0.45;
  } else if (kind == 2 && variant == 3 && up >= 0.0 && !topZone) {
    // renovated: plain render, bigger plastic windows, no surrounds
    float pane = step(0.18, fx) * step(fx, 0.82) * step(0.22, fy) * step(fy, 0.80);
    float frame = step(0.16, fx) * step(fx, 0.84) * step(0.20, fy) * step(fy, 0.82) - pane;
    mullion = step(0.49, fx) * step(fx, 0.51);
    base = mix(base, vec3(0.94, 0.94, 0.93), frame * detail * 0.8);
    base = mix(base, vec3(0.12, 0.15, 0.19), pane * (1.0 - mullion) * detail * 0.85);
    glass = pane; litShare = 0.5;
  } else if (kind == 2) {
    if (up < 0.0) {
      float plinth = step(relH, 0.6);
      float shop = step(0.08, fx) * step(fx, 0.92) * step(0.14, fy) * step(fy, 0.86);
      base = mix(base, base * 0.72, 0.55);
      base = mix(base, vec3(0.30, 0.28, 0.26), plinth);
      base = mix(base, vec3(0.10, 0.12, 0.15), shop * detail * 0.85);
      glass = shop; litShare = 0.70;
    } else if (topZone) {
      base *= 0.78;
    } else {
      float surround = step(0.20, fx) * step(fx, 0.80) * step(0.12, fy) * step(fy, 0.86);
      float pane = step(0.26, fx) * step(fx, 0.74) * step(0.18, fy) * step(fy, 0.78);
      float lintel = step(0.18, fx) * step(fx, 0.82) * step(0.86, fy) * step(fy, 0.93);
      mullion = step(0.48, fx) * step(fx, 0.52);
      float belt = step(fy, 0.05);
      base = mix(base, base * 1.12 + 0.04, (surround + lintel) * detail * 0.7);
      base = mix(base, base * 0.86, belt * detail);
      base = mix(base, vec3(0.10, 0.12, 0.16), pane * (1.0 - mullion) * detail * 0.85);
      glass = pane; litShare = 0.45;
    }
  } else if (kind == 1 && H < 5.6) {
    // A village house (Verőce, Göd, MÁV-telep): one storey, white or pale
    // plaster, a dark plinth, one or two windows a side with a white frame,
    // shutters on some, and a door now and then
    if (!own) {
      vec3 VIL[8] = vec3[8](vec3(0.94,0.93,0.89), vec3(0.95,0.91,0.80), vec3(0.93,0.86,0.66), vec3(0.92,0.92,0.90),
                            vec3(0.88,0.80,0.70), vec3(0.93,0.80,0.72), vec3(0.84,0.88,0.80), vec3(0.95,0.89,0.74));
      base = VIL[int(fract(seed * 6.17) * 8.0)] * (0.94 + fract(seed * 13.7) * 0.08);
    }
    float bw = 5.4 + fract(seed * 3.9) * 2.4;
    float wx = fract(u / bw + seed), wb = floor(u / bw + seed);
    float h1 = fract(sin(wb * 12.9898 + seed * 78.2) * 43758.5);
    base = mix(base, vec3(0.34, 0.31, 0.29), step(relH, 0.45) * detail);            // plinth
    bool door = h1 < 0.16;
    float ww = door ? 0.09 : 0.11;                                                 // share of the bay
    float x0 = 0.5 - ww, x1 = 0.5 + ww;
    float y0 = door ? 0.0 : 0.95, y1 = door ? 2.1 : 2.25;
    float inWin = step(x0, wx) * step(wx, x1) * step(y0, relH) * step(relH, y1);
    float frame = step(x0 - 0.018, wx) * step(wx, x1 + 0.018) * step(y0 - 0.08, relH) * step(relH, y1 + 0.08) - inWin;
    float blank = step(0.86, h1);                                                  // some bays have nothing
    if (!topZone && blank < 0.5) {
      if (door) {
        base = mix(base, vec3(0.36, 0.24, 0.16), inWin * detail * 0.95);
      } else {
        float shutters = step(0.5, fract(seed * 29.3)) * (step(x0 - 0.10, wx) * step(wx, x0 - 0.02) + step(x1 + 0.02, wx) * step(wx, x1 + 0.10))
                         * step(y0, relH) * step(relH, y1);
        vec3 shutCol = fract(seed * 23.1) < 0.5 ? vec3(0.40, 0.27, 0.17) : vec3(0.24, 0.42, 0.30);
        mullion = step(0.494, wx) * step(wx, 0.506);
        base = mix(base, vec3(0.95, 0.95, 0.93), frame * detail * 0.85);
        base = mix(base, shutCol, shutters * detail * 0.9);
        base = mix(base, vec3(0.13, 0.15, 0.19), inWin * (1.0 - mullion) * detail * 0.85);
        glass = inWin; litShare = 0.35;
      }
    }
  } else if (kind == 1 && variant != 0) {
    // other houses: the Kádár-era cube house with paired windows and wooden
    // shutters (1), brick below and render above (2), a wide window and a
    // porch light (3)
    float has = step(0.25, fract(sin(bay * 17.13 + seed * 41.7) * 43758.5));
    if (variant == 2) base = mix(base, vec3(0.62, 0.36, 0.27), step(relH, min(1.1, H * 0.35)) * detail);
    else base = mix(base, base * 0.72, step(relH, 0.5) * detail);            // plinth
    if (!topZone && relH > 0.8 && has > 0.5) {
      float w0 = variant == 3 ? 0.18 : 0.30, w1 = 1.0 - w0;
      float pane = step(w0, fx) * step(fx, w1) * step(0.32, fy) * step(fy, 0.76);
      float trim = step(w0 - 0.03, fx) * step(fx, w1 + 0.03) * step(0.29, fy) * step(fy, 0.79);
      float shut = variant == 1 ? (step(w0 - 0.15, fx) * step(fx, w0 - 0.02) + step(w1 + 0.02, fx) * step(fx, w1 + 0.15))
                                  * step(0.32, fy) * step(fy, 0.76) : 0.0;
      vec3 shutCol = fract(seed * 23.1) < 0.5 ? vec3(0.36, 0.24, 0.16) : vec3(0.22, 0.40, 0.28);
      mullion = step(0.485, fx) * step(fx, 0.515);
      base = mix(base, vec3(0.94, 0.93, 0.90), trim * detail * 0.7);
      base = mix(base, shutCol, shut * detail * 0.9);
      base = mix(base, vec3(0.12, 0.14, 0.18), pane * (1.0 - mullion) * detail * 0.82);
      glass = pane; litShare = 0.32;
    }
  } else if (kind == 1) {
    // a house: one or two small windows a floor, not a grid; some bays blank
    float has = step(0.30, fract(sin(bay * 12.9898 + seed * 78.2) * 43758.5));
    if (!topZone && relH > 0.7 && has > 0.5) {
      float pane = step(0.36, fx) * step(fx, 0.64) * step(0.34, fy) * step(fy, 0.74);
      float trim = step(0.32, fx) * step(fx, 0.68) * step(0.30, fy) * step(fy, 0.78);
      mullion = step(0.48, fx) * step(fx, 0.52);
      base = mix(base, vec3(0.93, 0.92, 0.88), trim * detail * 0.6);
      base = mix(base, vec3(0.12, 0.14, 0.18), pane * (1.0 - mullion) * detail * 0.8);
      glass = pane; litShare = 0.30;
    }
  } else if (kind == 3 && fract(seed * 3.31) < 0.75) {
    // a photographed panel façade, repeated along the wall a tile at a time
    // and painted this building's pastel (renovated blocks are: yellow,
    // peach, mint, blue — the lighter Budapest, not the grey one)
    int t = int(fract(seed * 7.77) * 5.0);
    vec2 tl = t < 2 ? vec2(4.0, 3.0) : t == 2 ? vec2(5.0, 4.0) : t == 3 ? vec2(6.0, 6.0) : vec2(8.0, 7.0);
    vec2 q = vec2(u / (tl.x * 3.3), relH / (tl.y * 2.85));
    vec2 uv = vec2((float(t) + fract(q.x)) / 5.0, 1.0 - fract(q.y));
    vec2 k = vec2(0.2, -1.0);
    vec3 tx = textureGrad(uFacTex, uv, dFdx(q) * k, dFdy(q) * k).rgb;
    float lum = dot(tx, vec3(0.299, 0.587, 0.114));
    vec3 PAST[7] = vec3[7](vec3(0.96,0.86,0.58), vec3(0.96,0.76,0.62), vec3(0.74,0.89,0.76),
                           vec3(0.72,0.83,0.94), vec3(0.85,0.79,0.91), vec3(0.94,0.92,0.86), vec3(0.96,0.82,0.70));
    vec3 tint = own ? ownCol * 1.15 : PAST[int(fract(seed * 5.13) * 7.0)];
    base = mix(tx, clamp(lum * tint * 1.5, 0.0, 1.0), t < 2 ? 0.35 : 0.72);
    base *= mix(1.0, 0.8, step(relH, 0.6));                                // plinth
    glass = smoothstep(0.36, 0.2, lum) * step(0.8, relH); litShare = 0.5;
  } else if (kind == 3) {
    int bt = int(mod(bay, 4.0));
    if (bt >= 2 && up > 0.0) {
      float bal = step(0.10, fx) * step(fx, 0.90) * step(0.35, fy) * step(fy, 0.88);
      float shield = (step(0.10, fx) * step(fx, 0.20) + step(0.80, fx) * step(fx, 0.90)) * step(0.35, fy);
      base = mix(base, vec3(0.08, 0.09, 0.11), bal * detail * 0.80);
      base = mix(base, vec3(0.82, 0.55, 0.28), shield * detail * 0.75);
      glass = bal * (1.0 - shield);
    } else {
      float frame = step(0.12, fx) * step(fx, 0.88) * step(0.22, fy) * step(fy, 0.80);
      float pane = step(0.18, fx) * step(fx, 0.82) * step(0.28, fy) * step(fy, 0.74);
      mullion = step(0.48, fx) * step(fx, 0.52);
      base = mix(base, vec3(0.90, 0.92, 0.95), frame * detail * 0.70);
      base = mix(base, vec3(0.11, 0.13, 0.17), pane * (1.0 - mullion) * detail * 0.80);
      glass = pane;
    }
    float joint = step(fy, 0.04) + step(0.97, fx);
    base *= 1.0 - clamp(joint, 0.0, 1.0) * 0.12 * detail;
    litShare = 0.55;
  } else if (kind == 5) {
    float cx = abs(fx - 0.5);
    float yTop = H * 0.72, yBot = H * 0.22;
    float arch = (relH > yTop) ? step(length(vec2(cx * 3.4, (relH - yTop) / (H * 0.12))), 0.5) : 1.0;
    float lancet = step(cx, 0.16) * step(yBot, relH) * step(relH, yTop + H * 0.06) * arch;
    base = mix(base, vec3(0.16, 0.20, 0.26), lancet * detail * 0.85);
    glass = lancet; litShare = 0.25;
  } else if (kind == 4) {
    // a hall: corrugated cladding and a clerestory band high up
    float rib = step(0.5, fract(u / 0.9));
    base *= 1.0 - rib * 0.05 * detail;
    float band = step(0.66, relH / max(H, 1.0)) * step(relH / max(H, 1.0), 0.84);
    float pane = band * step(0.08, fract(fx * 3.0)) * step(fract(fx * 3.0), 0.92);
    base = mix(base, vec3(0.15, 0.18, 0.22), pane * detail * 0.80);
    glass = pane; litShare = 0.15; bulb = cool;
  } else if (kind == 8) {
    // no windows at all: ribs, a plinth, now and then a big door
    float rib = step(0.5, fract(u / 0.8));
    base *= 1.0 - rib * 0.06 * detail;
    base = mix(base, base * 0.7, step(relH, 0.5));
    float door = step(0.35, fract(u / 23.0 + seed)) * step(fract(u / 23.0 + seed), 0.47) * step(relH, min(4.5, H * 0.7));
    base = mix(base, base * 0.55, door * detail);
  } else if (kind == 6) {
    // glass office: a curtain wall. Tinted glass that takes the sky, a slim
    // mullion grid, opaque spandrels at the floor lines
    vec3 tint = mix(vec3(0.20, 0.28, 0.32), vec3(0.26, 0.30, 0.34), fract(seed * 3.7));
    vec3 g = mix(tint, sky * 0.55 + tint * 0.45, 0.45);
    float mull = step(0.93, fx);
    float spandrel = up < 0.0 ? step(0.90, fy) : step(fy, 0.20);
    base = mix(g, vec3(0.42, 0.45, 0.48), max(mull, spandrel * 0.85));
    base = mix(base, base * 0.8, step(relH, 0.4));
    glass = (1.0 - mull) * (1.0 - spandrel); litShare = 0.42; bulb = cool;
    detail = 1.0;
  } else if (kind == 7) {
    // a shopping box: blank cladding, a glazed shopfront along part of the
    // ground floor and a coloured band under the parapet (no brand)
    base = mix(vec3(0.78, 0.78, 0.76), vec3(0.62, 0.64, 0.66), fract(seed * 7.1));
    float front = step(relH, 4.2) * step(0.3, relH) * step(fract(u / 60.0 + seed), 0.55);
    float bandTop = step(H - 1.6, relH) * step(relH, H - 0.4);
    vec3 bandCol = fract(seed * 11.3) < 0.5 ? vec3(0.18, 0.34, 0.62) : vec3(0.70, 0.22, 0.18);
    base = mix(base, bandCol, bandTop * detail);
    base = mix(base, vec3(0.14, 0.17, 0.20), front * detail * 0.9);
    glass = front; litShare = 0.9; bulb = cool;
  } else if (kind == 9) {
    // civic building or station: tall windows in a slow rhythm, rusticated base
    if (up < 0.0) {
      float arch = step(0.30, fx) * step(fx, 0.70) * step(0.15, fy) * step(fy, 0.92);
      base = mix(base, base * 0.82, step(fract(relH / 0.6), 0.1) * detail);
      base = mix(base, vec3(0.12, 0.13, 0.16), arch * detail * 0.8);
      glass = arch;
    } else if (!topZone) {
      float pane = step(0.32, fx) * step(fx, 0.68) * step(0.14, fy) * step(fy, 0.80);
      float trim = step(0.28, fx) * step(fx, 0.72) * step(0.10, fy) * step(fy, 0.86);
      base = mix(base, base * 1.1 + 0.03, trim * detail * 0.6);
      base = mix(base, vec3(0.12, 0.14, 0.18), pane * detail * 0.82);
      glass = pane;
    } else base *= 0.8;
    litShare = 0.22;
  } else if (kind == 10) {
    // modern flats: white and grey render, horizontal balcony bands
    base = mix(vec3(0.86, 0.86, 0.84), vec3(0.62, 0.63, 0.64), step(0.6, fract(seed * 5.9)));
    float balc = step(0.0, up) * step(fy, 0.16) * step(0.5, fract(bay * 0.5 + seed));
    float pane = step(0.14, fx) * step(fx, 0.86) * step(0.28, fy) * step(fy, 0.90);
    base = mix(base, vec3(0.20, 0.22, 0.25), balc * detail * 0.6);
    base = mix(base, vec3(0.12, 0.15, 0.18), pane * detail * 0.8);
    glass = pane; litShare = 0.5;
  }
  if (kind == 12) {
    // an arena: pale concrete or cladding, the dark bands of the concourses
    // and vomitories, a light fascia under the roof edge
    base = mix(vec3(0.80, 0.80, 0.78), vec3(0.62, 0.64, 0.66), fract(seed * 4.3));
    float fr = relH / max(H, 1.0);
    float band = step(0.32, fr) * step(fr, 0.42) + step(0.64, fr) * step(fr, 0.72);
    float pier = step(0.92, fract(u / 7.5));
    base = mix(base, vec3(0.16, 0.17, 0.19), band * (1.0 - pier) * detail * 0.85);
    base = mix(base, base * 1.12, step(0.88, fr) * detail);
    return vec3(0.0);
  }
  if (kind == 11) {
    base = vec3(0.70, 0.66, 0.58) * (0.9 + 0.2 * fract(seed * 9.1));
    float course = step(fract(relH / 0.45), 0.08) + step(fract(u / 1.1 + floor(relH / 0.45) * 0.5), 0.05);
    base *= 1.0 - clamp(course, 0.0, 1.0) * 0.12 * detail;
    return vec3(0.0);
  }
  if (nightFac < 0.01 || glass < 0.01) return vec3(0.0);
  vec2 room = vec2(floor(u / bayW * 0.5), storey) + seed * 91.0;
  float rHash = fract(sin(dot(room, vec2(127.1, 311.7))) * 43758.5453);
  float lit = step(rHash, litShare);
  vec3 bc = mix(bulb, vec3(1.40, 1.55, 1.70), step(0.72, fract(rHash * 7.31)));
  return bc * glass * (1.0 - mullion) * lit * nightFac * detail;
}
`;

export const STREETLIGHT_GLSL = `
uniform vec3 uSL[48]; uniform int uSLn; uniform float uSLon;
vec3 streetLight(vec3 wpos, vec3 base, vec3 nrm) {
  if (uSLon < 0.01) return vec3(0.0);
  float acc = 0.0;
  for (int i = 0; i < 48; i++) {
    if (i >= uSLn) break;
    vec3 d = uSL[i] - wpos;
    float r2 = dot(d, d);
    if (r2 > 1600.0) continue;
    float k = 1.0 / (1.0 + r2 / 70.0) * (1.0 - r2 / 1600.0);
    k *= clamp(dot(nrm, d * inversesqrt(r2)), 0.0, 1.0);
    acc += k;
  }
  return base * vec3(1.0, 0.80, 0.52) * min(acc, 2.2) * uSLon * 2.6;
}
`;

// The water surface, shared by the terrain (the mapped river) and the flood
// plane, so a raised Danube looks exactly like the Danube and not like a
// separate grey sheet. Needs uReflect, uViewport, uTime, uEye, uSunDir, uSunCol.
export const WATER_GLSL = `
vec3 waterSurface(vec3 vWorld, float vDist, vec3 tint, bool mirror) {
  vec3 col;
    vec2 q = vWorld.xz;
    float w1 = sin(q.x * 0.055 + uTime * 0.9) * sin(q.y * 0.041 - uTime * 0.7);
    float w2 = sin(q.x * 0.017 - uTime * 0.35) * sin(q.y * 0.023 + uTime * 0.28);
    float w3 = sin((q.x + q.y) * 0.11 + uTime * 1.7);
    vec3 wn = normalize(vec3(w1 * 0.075 + w3 * 0.022, 1.0,
                             w2 * 0.075 - w3 * 0.022));
    vec3 view = normalize(uEye - vWorld);
    float fres = pow(1.0 - clamp(dot(view, wn), 0.0, 1.0), 4.0);

    // Real reflection. The target holds the world mirrored about this plane
    // and drawn through the real camera's matrix, so the sample coordinate is
    // simply this fragment's own screen position — nothing to derive.
    vec2 suv = gl_FragCoord.xy / uViewport;
    // Ripple displacement, and it has to be small. It was a tenth of the
    // screen, which is not a ripple, it is a different picture. A wave a few
    // centimetres high displaces the reflected image by an angle, so the
    // screen-space offset falls off with distance — near water breaks up, the
    // far bank stays put, which is exactly what a river does.
    float ripple = 0.010 * clamp(24.0 / max(vDist, 4.0), 0.10, 1.0);
    suv += vec2(wn.x, wn.z) * ripple;

    // Water does not reflect like a mirror; it reflects like a mirror that
    // has been shaken. Each wave facet points somewhere slightly different,
    // so a point on the bank arrives at the eye from a whole range of places
    // along the line of sight — and because the surface tilts far more across
    // the view than along it, that range is a VERTICAL smear. A stretched
    // column of colour is what makes a reflection read as one; a single sharp
    // sample reads as a photograph lying flat on the river.
    //
    // The smear grows with distance, because the same wave slope subtends a
    // longer stretch of the far bank the further away it is.
    float smear = clamp(vDist / 900.0, 0.12, 1.0) * 0.055;
    vec3 refl = vec3(0.0);
    float wsum = 0.0;
    for (int i = -3; i <= 3; i++) {
      float fi = float(i);
      float wgt = exp(-fi * fi * 0.22);
      vec2 q2 = suv + vec2(wn.x * fi * 0.0016, fi * smear * 0.16);
      refl += texture(uReflect, clamp(q2, vec2(0.003), vec2(0.997))).rgb * wgt;
      wsum += wgt;
    }
    refl /= wsum;
    // water not at the river's level (a lake) cannot use the river's mirror
    // image: it reflects the sky instead
    if (!mirror) refl = mix(uFogCol, uSkyCol * 1.1, 0.35 + 0.3 * (1.0 - fres));
    refl *= vec3(0.86, 0.95, 0.92);          // the Danube is not a mirror

    // a real river never goes fully reflective, so cap it and keep the body
    // colour showing through even at grazing angles
    vec3 deep = vec3(0.038, 0.082, 0.078);
    // Schlick, roughly: almost nothing straight down, almost everything at a
    // grazing angle. Looking along the Danube you should see the far bank and
    // the sky in it; looking down over the parapet you should see the water.
    float mixAmt = clamp(0.03 + fres * 0.94, 0.0, 0.93);
    col = mix(deep, refl, mixAmt);
    col = mix(col, col * vec3(0.92, 1.04, 0.90) + vec3(0.012, 0.020, 0.010), 0.55);

    // The silver bridge: a low sun scatters off a thousand wave facets and
    // lays a path straight at the viewer. One sharp highlight cannot do it —
    // it needs a broad lobe whose width grows as the sun drops.
    vec3 h2 = normalize(uSunDir + view);
    float ndh = max(dot(wn, h2), 0.0);
    float low = 1.0 - clamp(uSunDir.y * 2.6, 0.0, 1.0);   // 1 at the horizon
    float tight = mix(900.0, 42.0, low);
    float broad = mix(90.0, 7.0, low);
    float glint = pow(ndh, tight) * 2.4 + pow(ndh, broad) * (0.22 + low * 0.85);
    // break the path into facets so it shimmers instead of smearing
    float facet = 0.55 + 0.45 * sin(q.x * 0.9 + uTime * 3.1)
                            * sin(q.y * 0.77 - uTime * 2.3);
    col += uSunCol * glint * (0.55 + 0.45 * facet);
    col *= 0.94;
  return col * tint;
}
`;

export const TERRAIN_VS = `#version 300 es
in vec3 aGrid;                       // xy -1..1 across the ring, z = skirt
out vec3 vWorld; out float vDist;
uniform mat4 uVP; uniform vec3 uEye;
uniform vec2 uOrigin;                // ring centre, snapped
uniform float uCell, uHalf;          // metres per quad, half-extent
uniform sampler2D uHeightNear, uHeightFar, uCover;
uniform vec2 uNearSize, uFarSize;    // px
uniform vec2 uNearStep, uFarStep;    // metres per px
uniform vec2 uFarOffset;             // near-origin minus far-origin, metres
uniform float uDanube;
uniform vec2 uWaterAB;   // level = a + b * north metres

float decode(vec3 c){ return (c.r*255.0*256.0 + c.g*255.0) * 0.1; }

// w is world xz, and world z runs south, so north = -w.y
float sampleH(vec2 w){
  vec2 nuv = vec2(w.x, -w.y) / (uNearSize * uNearStep);
  if (nuv.x > 0.002 && nuv.x < 0.998 && nuv.y > 0.002 && nuv.y < 0.998) {
    return decode(texture(uHeightNear, vec2(nuv.x, 1.0 - nuv.y)).rgb);
  }
  vec2 fuv = (w + uFarOffset) / (uFarSize * uFarStep);
  return decode(texture(uHeightFar, vec2(clamp(fuv.x,0.0,1.0), 1.0 - clamp(fuv.y,0.0,1.0))).rgb);
}
float sampleC(vec2 w){
  vec2 nuv = vec2(w.x, -w.y) / (uNearSize * uNearStep);
  if (nuv.x < 0.0 || nuv.x > 1.0 || nuv.y < 0.0 || nuv.y > 1.0) return 0.0;
  return texture(uCover, vec2(nuv.x, 1.0 - nuv.y)).r * 255.0;
}
void main(){
  vec2 w = uOrigin + aGrid.xy * uHalf;
  float h = sampleH(w) - aGrid.z * 90.0;
  float c = sampleC(w);
  // The Danube falls 86 mm per kilometre, so the river plane slopes. But a
  // gravel pit at Dunakeszi or a pond in a park is NOT the Danube and sits at
  // its own level — flattening every water pixel onto the river dug ten-metre
  // blue craters through the city. Snap to the river only where the ground
  // already agrees it is about river level; leave every other water body on
  // the surface the DEM gives it, which is flat there anyway.
  float wl = uWaterAB.x + uWaterAB.y * (-w.y);     // w.y is world z: north = -w.y
  if (c > 8.5 && c < 9.5) {
    // mapped water: the river, or a lake at its own level
    // (the tolerance grows with a drought, or a low river leaves its own
    // surface standing above the mirror plane and the reflection breaks)
    if (abs(h - wl) < 6.0 + max(0.0, -uDanube)) h = wl;
    else {
      // A lake at its own level (Dunakeszi tó): the surface model is lumpy
      // over water, so take the lowest ground round about as the lake's
      // level — the water was half at the river plane and half a tilted
      // blue carpet on the bumps
      float m = h;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7854;
        m = min(m, sampleH(w + vec2(cos(a), sin(a)) * 60.0));
        m = min(m, sampleH(w + vec2(cos(a), sin(a)) * 25.0));
      }
      h = m;
    }
  } else if (h < wl && wl - h < 14.0) {
    // Ground below the water surface IS under water. Without this the river
    // could not spread: raising the level only lifted the plane inside the
    // polygons the cover raster already called water, so the bank went wet
    // and nothing else happened. Now a rising Danube floods the low ground
    // beside it, which is what a rising Danube does. The 14 m band keeps a
    // deep quarry two kilometres away from filling up.
    h = wl;
  }
  vWorld = vec3(w.x, h, w.y);
  vDist = length(vWorld - uEye);
  gl_Position = uVP * vec4(vWorld, 1.0);
}`;

export const TERRAIN_FS = `#version 300 es
precision highp float;
in vec3 vWorld; in float vDist;
out vec4 fc;
uniform vec3 uSunDir, uSunCol, uSkyCol, uFogCol, uEye;
uniform float uFogDensity, uDither, uCorridorCut, uTime;
uniform vec4 uSeason;     // leaf, autumn, fresh, crop
uniform float uSnow, uWet, uLift;
uniform vec4 uCloudDeck, uCloudShape, uCloudWind;
uniform float uCloudT, uCloudShadow;
uniform vec4 uLamp; uniform vec3 uLampDir;
${STREETLIGHT_GLSL}
uniform sampler2D uCover, uReflect;
uniform vec2 uNearSize, uNearStep, uViewport;
uniform vec2 uWaterAB; uniform float uClipBelow; uniform float uDanube;

${CLOUD_FIELD_GLSL}
${WATER_GLSL}
// The shadow of the deck overhead, cast along the sun. Project the point up
// the sun's direction to the cloud's altitude and ask the same field whether
// there is cloud there. It removes the beam and leaves the skylight, which is
// what a cloud shadow actually does — the ground under one is not black, it
// is lit by the whole rest of the sky.
float cloudShade(vec3 wpos, vec3 sunDir, vec4 deck, vec4 shape, vec4 wind,
                 float t, float amount) {
  if (amount <= 0.002 || sunDir.y < 0.05 || deck.z <= 0.01) return 1.0;
  float rise = deck.x - wpos.y;
  if (rise <= 0.0) return 1.0;
  vec2 hit = wpos.xz + sunDir.xz / sunDir.y * rise;
  float n = deckField(hit, deck, shape, deckFlowW(deck, wind), t, 3);
  return 1.0 - amount * deckDensity(n, deck.z, shape.x);
}

// A train's headlight, as one spot. It is cheap enough to be worth having —
// a dozen instructions, and only for fragments in front of the train — and
// after dark it is the difference between driving and guessing.
vec3 headlight(vec3 wpos, vec3 base, vec3 nrm, vec4 lamp, vec3 ldir) {
  if (lamp.w < 0.01) return vec3(0.0);
  vec3 to = wpos - lamp.xyz;
  float d = length(to);
  if (d > 230.0 || d < 0.5) return vec3(0.0);
  vec3 dir = to / d;
  float spot = dot(dir, ldir);
  if (spot < 0.70) return vec3(0.0);
  float cone = smoothstep(0.70, 0.94, spot);
  float atten = pow(clamp(1.0 - d / 230.0, 0.0, 1.0), 1.9);
  float lam = clamp(dot(nrm, -dir) * 0.6 + 0.5, 0.0, 1.0);
  return base * vec3(1.0, 0.95, 0.84) * (3.2 * lamp.w * cone * atten * lam);
}

vec3 coverColour(float c){
  if (c < 0.5)  return vec3(0.42,0.46,0.29);   // unclassified rough ground
  if (c < 1.5)  return vec3(0.16,0.28,0.15);   // forest
  if (c < 2.5)  return vec3(0.31,0.37,0.22);   // scrub
  if (c < 3.5)  return vec3(0.45,0.52,0.28);   // meadow
  if (c < 4.5)  return vec3(0.55,0.51,0.29);   // farmland
  if (c < 5.5)  return vec3(0.37,0.45,0.26);   // orchard
  if (c < 6.5)  return vec3(0.48,0.46,0.26);   // vineyard
  if (c < 7.5)  return vec3(0.46,0.42,0.38);   // residential
  if (c < 8.5)  return vec3(0.40,0.39,0.38);   // industrial
  if (c < 9.5)  return vec3(0.20,0.30,0.34);   // water
  if (c < 10.5) return vec3(0.52,0.49,0.45);   // rock
  if (c < 11.5) return vec3(0.34,0.42,0.33);   // wetland
  if (c < 12.5) return vec3(0.36,0.33,0.30);   // railway formation
  if (c < 13.5) return vec3(0.30,0.45,0.24);   // park: mown, and greener
  if (c < 14.5) return vec3(0.72,0.68,0.55);   // sand
  return vec3(0.92,0.76,0.44);                 // Naszály limestone quarry: rich golden ochre / cut rock face
}
float bayer(vec2 p){
  int x = int(mod(p.x,4.0)), y = int(mod(p.y,4.0)); int i = y*4+x;
  float t[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
  return t[i]/16.0 - 0.5;
}
float h21(vec2 p){ return fract(sin(dot(floor(p), vec2(127.1,311.7))) * 43758.5); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x),
             mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y);
}
// Flat shading from screen derivatives is free and correct — until a surface
// is nearly edge-on, and then it is neither. At a grazing angle one pixel
// spans many metres along the surface, dFdx and dFdy point almost the same
// way, and their cross product is a small number made mostly of rounding
// error: the normal lands somewhere different in every pixel, so a distant
// road or field breaks into random light and dark dots. That is the speckle
// over the roads in the middle distance — not z-fighting, which is what it
// looks like, and not the geometry, which is flat and correct.
//
// Where the two derivatives come within about two degrees of parallel their
// answer is noise, so take the fallback instead.
vec3 flatNormal(vec3 wpos, vec3 fallback) {
  vec3 dx = dFdx(wpos), dy = dFdy(wpos);
  vec3 c = cross(dx, dy);
  float a = length(c);
  float s = length(dx) * length(dy);
  if (a < 1e-9) return fallback;
  // blended, not switched. A hard cut-off flickers along the line where the
  // test changes its mind, which trades one speckle for another.
  float k = smoothstep(0.012, 0.075, a / max(s, 1e-9));
  return normalize(mix(fallback, c / a, k));
}
void main(){
  vec2 nuv = vec2(vWorld.x, -vWorld.z) / (uNearSize * uNearStep);
  vec3 cov = (nuv.x > 0.0 && nuv.x < 1.0 && nuv.y > 0.0 && nuv.y < 1.0)
    ? texture(uCover, vec2(nuv.x, 1.0 - nuv.y)).rgb : vec3(0.0, 0.0, 1.0);
  float vCover = cov.r * 255.0;
  // Shorelines. The cover raster is 25 m pixels sampled nearest, so every
  // bank was a staircase of 25 m steps — at Népsziget a grey shipyard plate
  // stepping out into the bay. Water or land is decided instead from the
  // four texels around the point, weighted bilinearly, at 0.5: a smooth line
  // through the pixel corners (marching squares, in effect). Where the point
  // comes out as land on a water texel, it takes the heaviest land class.
  if (nuv.x > 0.0 && nuv.x < 1.0 && nuv.y > 0.0 && nuv.y < 1.0) {
    vec2 tsz = vec2(textureSize(uCover, 0));
    vec2 pp = vec2(nuv.x, 1.0 - nuv.y) * tsz - 0.5;
    ivec2 i0 = ivec2(floor(pp));
    vec2 f = fract(pp);
    ivec2 mx = ivec2(tsz) - 1;
    float c00 = texelFetch(uCover, clamp(i0, ivec2(0), mx), 0).r * 255.0;
    float c10 = texelFetch(uCover, clamp(i0 + ivec2(1, 0), ivec2(0), mx), 0).r * 255.0;
    float c01 = texelFetch(uCover, clamp(i0 + ivec2(0, 1), ivec2(0), mx), 0).r * 255.0;
    float c11 = texelFetch(uCover, clamp(i0 + ivec2(1, 1), ivec2(0), mx), 0).r * 255.0;
    float w00 = (1.0 - f.x) * (1.0 - f.y), w10 = f.x * (1.0 - f.y), w01 = (1.0 - f.x) * f.y, w11 = f.x * f.y;
    #define ISW(c) ((c) > 8.5 && (c) < 9.5 ? 1.0 : 0.0)
    float wf = ISW(c00) * w00 + ISW(c10) * w10 + ISW(c01) * w01 + ISW(c11) * w11;
    if (wf > 0.5) vCover = 9.0;
    else if (ISW(vCover) > 0.5) {
      float best = -1.0;
      if (ISW(c00) < 0.5 && w00 > best) { best = w00; vCover = c00; }
      if (ISW(c10) < 0.5 && w10 > best) { best = w10; vCover = c10; }
      if (ISW(c01) < 0.5 && w01 > best) { best = w01; vCover = c01; }
      if (ISW(c11) < 0.5 && w11 > best) { best = w11; vCover = c11; }
    }
    #undef ISW
  }
  // anything the ground has been pulled up to the water plane is water now,
  // whatever the land cover said it was
  {
    float wl0 = uWaterAB.x + uWaterAB.y * (-vWorld.z);
    if (vCover < 8.5 || vCover > 9.5) {
      if (vWorld.y <= wl0 + 0.05 && vWorld.y > wl0 - 0.05) vCover = 9.0;
    }
  }
  float fieldTint = cov.g;
  // the corridor mesh owns the ground near the railway; leaving the terrain
  // rings drawn underneath is what let them poke through the track
  if (cov.b * 255.0 < uCorridorCut) discard;
  // the reflection pass only wants what stands above the water
  float waterY = uWaterAB.x + uWaterAB.y * (-vWorld.z);
  if (uClipBelow > 0.5 && vWorld.y < waterY - 0.15) discard;
  // and water does not reflect itself: in the mirror pass the river surface
  // would cover the reflected sky and banks with its own dark body colour
  if (uClipBelow > 0.5 && vCover > 8.5 && vCover < 9.5 && vWorld.y < waterY + 0.3) discard;
  // per-face normal from screen derivatives: flat shading for free
  vec3 n = flatNormal(vWorld, vec3(0.0, 1.0, 0.0));
  if (n.y < 0.0) n = -n;
  vec3 base = coverColour(vCover);
  // A quarry is a wound in the hill, and on the Naszály it is the most
  // visible thing from the line: bright cut limestone in horizontal benches.
  // Every 12 m of height a bench: the cut face pale and bright, the ledge
  // below it darker and dusty, broken up so it does not read as stripes.
  if (vCover > 14.5) {
    float lev = vWorld.y / 10.0;
    float fb = fract(lev);
    float jitter = fract(sin(dot(floor(vWorld.xz / 9.0), vec2(41.3, 17.9))) * 4375.85);
    // mostly bright cut limestone; the benches show as thin dark lines where
    // there is slope, since the 25 m DEM is too flat inside the pit for wide
    // bands to show, and the whole pit must read as a white scar from the line
    vec3 cut = vec3(0.98, 0.96, 0.90);
    base = cut * (0.88 + jitter * 0.14);
    base = mix(base, vec3(0.50, 0.47, 0.42), step(0.88, fb) * 0.8);
  }
  // Residential land is not grey: in a village it is mostly gardens — lawn,
  // vegetable plots, fruit trees — with a paved yard here and there, and in
  // the city mostly paving and courtyards. One colour per ~14 m plot, from a
  // hash, so it reads as a patchwork of properties.
  if (vCover > 6.5 && vCover < 7.5) {
    vec2 plot = floor(vWorld.xz / vec2(14.0, 17.0));
    float h1 = fract(sin(dot(plot, vec2(127.1, 311.7))) * 43758.5453);
    float h2 = fract(h1 * 13.73);
    float city = smoothstep(16000.0, 11000.0, -vWorld.z);   // Budapest proper
    // ... and the gardens have seasons too (the owner: "trees change, but the
    // tiles do not"): fresh lawn in spring, dry in high summer, fallen leaves
    // in autumn, dormant grey-brown in winter; the vegetable plots are dug
    // earth from autumn to spring and green in summer; the fruit trees bare.
    float leafS = uSeason.x, autS = uSeason.y, freshS = uSeason.z;
    float dry = clamp((uSeason.w - 0.05) * 6.0, 0.0, 1.0) * (1.0 - clamp((uSeason.w - 0.3) * 6.0, 0.0, 1.0)) * leafS;
    vec3 lawn = mix(vec3(0.40, 0.40, 0.30), vec3(0.33, 0.44, 0.22), leafS);
    lawn = mix(lawn, vec3(0.37, 0.53, 0.22), freshS * 0.8);
    lawn = mix(lawn, vec3(0.47, 0.46, 0.26), dry * 0.7);
    lawn = mix(lawn, vec3(0.45, 0.38, 0.20), autS * 0.45);
    vec3 veg = mix(vec3(0.33, 0.27, 0.21), vec3(0.35, 0.45, 0.22), clamp(leafS * 1.4 - 0.3 - autS, 0.0, 1.0));
    vec3 tree = mix(vec3(0.34, 0.31, 0.27), vec3(0.22, 0.33, 0.16), leafS);
    tree = mix(tree, vec3(0.50, 0.36, 0.14), autS * 0.8);
    vec3 paved = vec3(0.47, 0.45, 0.42);
    vec3 plotCol = h1 < 0.45 ? lawn : h1 < 0.62 ? veg : h1 < 0.78 ? tree : paved;
    plotCol = mix(plotCol, paved * (0.92 + h2 * 0.12), city * 0.75);
    base = plotCol * (0.9 + h2 * 0.18);
  }
  // The whole landscape shifts: grass goes olive and then straw, woodland
  // turns and then bares off to grey-brown, and the fields follow the crop.
  base = mix(base, base * vec3(1.10,1.02,0.80), uSeason.y * 0.85);
  base = mix(base, base * vec3(0.86,0.88,0.94), (1.0 - uSeason.x) * 0.55);
  base = mix(base, base * vec3(1.02,1.14,0.86), uSeason.z * 0.40);
  // break up the flat classes: field-scale patches, then a finer grain that
  // fades out with distance so it never turns into noise on the horizon
  float closeness = exp(-vDist * 0.0011);
  float blotch = vnoise(vWorld.xz * 0.011) - 0.5;   // "patch" is reserved in GLSL ES
  float grain = (vnoise(vWorld.xz * 0.19) - 0.5) * closeness;
  base *= 1.0 + blotch * 0.26 + grain * 0.16;
  // every field, wood and orchard gets its own shade so the classes stop
  // reading as one flat wash of colour
  base *= 0.80 + fieldTint * 0.42;
  base = mix(base, base * vec3(1.10, 1.03, 0.86), fract(fieldTint * 7.3) * 0.30);

  // worked ground: furrows, rows and mown stripes, each field ploughed in its
  // own direction. A flat wash of green reads as carpet from a train window.
  if ((vCover > 2.5 && vCover < 6.5)) {
    float ang = fract(fieldTint * 11.3) * 3.14159;
    vec2 dir = vec2(cos(ang), sin(ang));
    float pitch = vCover > 5.5 ? 0.42          // vineyard rows, close together
                : vCover > 4.5 ? 0.11          // orchard, widely spaced
                : vCover > 3.5 ? 0.30          // ploughed farmland
                                : 0.16;        // mown meadow
    float rows = sin(dot(vWorld.xz, dir) * pitch);
    float strength = (vCover > 3.5 ? 0.13 : 0.07) * closeness;
    base *= 1.0 + rows * strength;

    // What is standing in the field. Winter wheat is green and low through
    // the spring, gold in the last week of June, cut in July, pale stubble
    // through August and turned bare earth in September. Not every field is
    // on the same crop or the same date, so each one is offset a little.
    if (vCover > 3.5 && vCover < 4.5) {
      float own = clamp(uSeason.w + (fract(fieldTint * 6.1) - 0.5) * 0.22, 0.0, 1.0);
      vec3 bare    = vec3(0.31, 0.24, 0.17);
      vec3 stubble = vec3(0.62, 0.56, 0.36);
      vec3 green   = vec3(0.33, 0.46, 0.20);
      vec3 ripe    = vec3(0.76, 0.65, 0.26);
      vec3 crop = own < 0.18 ? mix(bare, stubble, own / 0.18)
                : own < 0.45 ? mix(stubble, green, (own - 0.18) / 0.27)
                             : mix(green, ripe, (own - 0.45) / 0.55);
      // some fields are maize or sunflower and stay green much later
      if (fract(fieldTint * 9.7) > 0.72)
        crop = mix(crop, green * 1.05, clamp(uSeason.x, 0.0, 1.0) * 0.7);
      base = mix(base, crop, 0.80);
    }
    // orchards and vineyards show their worked ground between the rows
    if (vCover > 4.5)
      base = mix(base, vec3(0.38, 0.31, 0.22), (1.0 - uSeason.x) * 0.35);
  }
  base = mix(base, base * vec3(1.05, 1.0, 0.92), clamp(blotch + 0.5, 0.0, 1.0) * 0.35);
  if (vCover > 2.5 && vCover < 3.5)
    base = mix(base, vec3(0.60, 0.56, 0.34),
               clamp((uSeason.w - 0.55) * 1.4, 0.0, 1.0) * 0.45);
  // Winter: grass, scrub and rough ground go dormant — a dull straw and
  // grey-brown, not the green of July with a blue cast
  if (vCover < 3.5 || (vCover > 10.5 && vCover < 11.5))
    base = mix(base, vec3(0.44, 0.41, 0.31) * (0.9 + fieldTint * 0.2), (1.0 - uSeason.x) * 0.55);
  // a park is watered and mown, so it stays green when the meadows burn off
  if (vCover > 12.5 && vCover < 13.5)
    base = mix(base, vec3(0.28, 0.44, 0.22), 0.5);

  // Wet ground is darker, not shinier — the water fills the pores and stops
  // them scattering. Do it before the light so the shading still applies.
  if (vCover < 8.5 || vCover > 9.5) base *= mix(1.0, 0.62, uWet);

  // Lying snow holds on level ground and slides off anything steep, drifts
  // into the hollows, and does not lie on open water.
  if (uSnow > 0.001 && (vCover < 8.5 || vCover > 9.5)) {
    float flatness = smoothstep(0.52, 0.93, n.y);
    float drift = 0.72 + 0.55 * vnoise(vWorld.xz * 0.021);
    float lie = clamp(uSnow * flatness * drift, 0.0, 1.0);
    // a hedge or a wood keeps its own colour showing through for longer
    if (vCover > 0.5 && vCover < 2.5) lie *= 0.62;
    base = mix(base, vec3(0.80, 0.835, 0.90), lie);
  }
  float lam = max(dot(n, uSunDir), 0.0);
  lam *= cloudShade(vWorld, uSunDir, uCloudDeck, uCloudShape, uCloudWind,
                    uCloudT, uCloudShadow);
  float sky = 0.34 + 0.66 * clamp(n.y, 0.0, 1.0);
  // Under a closed base the sun is gone and the sky dome does all the
  // lighting, so the diffuse term has to grow as the direct one collapses.
  // Without this the ground goes to soot while the cloud stays legible grey,
  // which is the one thing an overcast day never looks like.
  vec3 col = base * (uSunCol * lam + uSkyCol * sky * (0.55 + uLift * 0.42)
                     + 0.055 + uLift * 0.085);
  // a shoreline: ground within a metre or so of the water goes wet and dark
  float wet = 1.0 - smoothstep(0.0, 2.2, vWorld.y - waterY);
  if (vCover < 8.5 || vCover > 9.5) col *= mix(1.0, 0.62, clamp(wet, 0.0, 1.0));

  if (vCover > 8.5 && vCover < 9.5) {
    // Drought. uWaterAB carries the Duna slider, so a negative offset is a
    // low river: the bed near the banks comes out of the water as gravel and
    // sandbars, from the edges inward — about 25 m of bed per metre of drop,
    // patchy, the way the Danube looked in 2022. There is no bathymetry, so
    // "depth" is how far this pixel is from dry land in the cover raster.
    float exposed = 0.0;
    if (uDanube < -0.05) {
      float shore = 400.0;
      for (int ring = 1; ring <= 6; ring++) {
        float r = float(ring) * 26.0;
        for (int k = 0; k < 10; k++) {
          float an = float(k) * 0.6283 + float(ring) * 0.3;
          vec2 pn = vec2(vWorld.x, -vWorld.z) + vec2(cos(an), sin(an)) * r;
          vec2 uv2 = pn / (uNearSize * uNearStep);
          float c2 = texture(uCover, vec2(uv2.x, 1.0 - uv2.y)).r * 255.0;
          if (c2 < 8.5 || c2 > 9.5) shore = min(shore, r);
        }
        if (shore < 400.0) break;
      }
      float patchy = fract(sin(dot(floor(vWorld.xz / 18.0), vec2(12.9, 78.2))) * 43758.5) * 30.0;
      exposed = step(shore + patchy * 0.6, -uDanube * 25.0);
    }
    if (exposed > 0.5) {
      float wetEdge = fract(sin(dot(floor(vWorld.xz / 7.0), vec2(3.1, 9.7))) * 1000.0);
      vec3 gravel = mix(vec3(0.62, 0.58, 0.50), vec3(0.52, 0.48, 0.40), wetEdge);
      col = gravel * (uSunCol * max(uSunDir.y, 0.0) * 0.9 + uSkyCol * 0.5 + 0.06);
    } else {
      col = waterSurface(vWorld, vDist, vec3(1.0), abs(vWorld.y - waterY) < 0.6);
    }
  }
  col += headlight(vWorld, base, n, uLamp, uLampDir);
  col += streetLight(vWorld, base, n);
  float f = 1.0 - exp(-vDist * uFogDensity);
  col = mix(col, uFogCol, clamp(f, 0.0, 1.0));
  col += bayer(gl_FragCoord.xy) * uDither;
  fc = vec4(col, 1.0);
}`;

export const TRACK_VS = `#version 300 es
in vec3 aPos; in vec3 aCol;
// Optional. A mesh that knows its own normals supplies them here; everything
// else leaves the attribute disabled, which reads as a constant zero and the
// fragment shader falls back to the screen derivatives. It exists because
// this one program draws BOTH the ground and the city's real footprints, and
// those two want opposite things when the derivatives fail: a road wants to
// be told it is flat, and a wall wants anything except that.
in vec3 aNrm;
// Optional, polygon buildings only: ground y, wall height, class, seed.
in vec4 aBld;
out vec3 vCol; out float vDist; out vec3 vWorld; out vec3 vNrm; out vec4 vBld;
uniform mat4 uVP; uniform vec3 uEye;
// Pull toward the eye, as a fraction of the distance. Road vehicles sit a
// few tens of centimetres above the road, and past a few hundred metres the
// depth buffer cannot tell the two apart, so the road "swallowed" the cars
// from above and far away. 0.3% of the range is invisible in size and plenty
// for the depth test. Zero for everything else.
uniform float uPull;
void main(){
  vCol = aCol; vWorld = aPos; vDist = length(aPos - uEye); vNrm = aNrm; vBld = aBld;
  vec3 p = aPos + (uEye - aPos) * uPull;
  gl_Position = uVP * vec4(p, 1.0);
}`;

export const TRACK_FS = `#version 300 es
precision highp float;
in vec3 vCol; in float vDist; in vec3 vWorld; in vec3 vNrm; in vec4 vBld; out vec4 fc;
uniform vec3 uEye;
uniform vec3 uSunDir, uSunCol, uSkyCol, uFogCol;
uniform float uFogDensity, uDither, uSnow, uWet, uLift;
uniform vec4 uCloudDeck, uCloudShape, uCloudWind;
uniform float uCloudT, uCloudShadow;
uniform vec4 uLamp; uniform vec3 uLampDir;
${STREETLIGHT_GLSL}
${FACADE_GLSL}
${CLOUD_FIELD_GLSL}
// A train's headlight, as one spot. It is cheap enough to be worth having —
// a dozen instructions, and only for fragments in front of the train — and
// after dark it is the difference between driving and guessing.
vec3 headlight(vec3 wpos, vec3 base, vec3 nrm, vec4 lamp, vec3 ldir) {
  if (lamp.w < 0.01) return vec3(0.0);
  vec3 to = wpos - lamp.xyz;
  float d = length(to);
  if (d > 230.0 || d < 0.5) return vec3(0.0);
  vec3 dir = to / d;
  float spot = dot(dir, ldir);
  if (spot < 0.70) return vec3(0.0);
  float cone = smoothstep(0.70, 0.94, spot);
  float atten = pow(clamp(1.0 - d / 230.0, 0.0, 1.0), 1.9);
  float lam = clamp(dot(nrm, -dir) * 0.6 + 0.5, 0.0, 1.0);
  return base * vec3(1.0, 0.95, 0.84) * (3.2 * lamp.w * cone * atten * lam);
}

// The shadow of the deck overhead, cast along the sun. Project the point up
// the sun's direction to the cloud's altitude and ask the same field whether
// there is cloud there. It removes the beam and leaves the skylight, which is
// what a cloud shadow actually does — the ground under one is not black, it
// is lit by the whole rest of the sky.
float cloudShade(vec3 wpos, vec3 sunDir, vec4 deck, vec4 shape, vec4 wind,
                 float t, float amount) {
  if (amount <= 0.002 || sunDir.y < 0.05 || deck.z <= 0.01) return 1.0;
  float rise = deck.x - wpos.y;
  if (rise <= 0.0) return 1.0;
  vec2 hit = wpos.xz + sunDir.xz / sunDir.y * rise;
  float n = deckField(hit, deck, shape, deckFlowW(deck, wind), t, 3);
  return 1.0 - amount * deckDensity(n, deck.z, shape.x);
}

float bayer(vec2 p){
  int x = int(mod(p.x,4.0)), y = int(mod(p.y,4.0)); int i = y*4+x;
  float t[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
  return t[i]/16.0 - 0.5;
}
float th21(vec2 p){ return fract(sin(dot(floor(p), vec2(127.1,311.7))) * 43758.5); }
// Flat shading from screen derivatives is free and correct — until a surface
// is nearly edge-on, and then it is neither. At a grazing angle one pixel
// spans many metres along the surface, dFdx and dFdy point almost the same
// way, and their cross product is a small number made mostly of rounding
// error: the normal lands somewhere different in every pixel, so a distant
// road or field breaks into random light and dark dots. That is the speckle
// over the roads in the middle distance — not z-fighting, which is what it
// looks like, and not the geometry, which is flat and correct.
//
// Where the two derivatives come within about two degrees of parallel their
// answer is noise, so take the fallback instead.
vec3 flatNormal(vec3 wpos) {
  vec3 dx = dFdx(wpos), dy = dFdy(wpos);
  vec3 c = cross(dx, dy);
  float a = length(c);
  if (a < 1e-8) return vec3(0.0, 1.0, 0.0);
  return c / a;
}
void main(){
  // a supplied normal beats a guessed one
  vec3 n = dot(vNrm, vNrm) > 0.25 ? normalize(vNrm) : flatNormal(vWorld);
  // a supplied normal faces whichever way the triangle was wound; a train
  // body seen from inside wants the side facing us
  if (dot(vNrm, vNrm) > 0.25 && dot(n, uEye - vWorld) < 0.0) n = -n;
  vec3 base = vCol;
  base *= mix(1.0, 0.60, uWet);
  // Snow lies on the ballast, the sleepers and the cess, but never on the
  // railhead — a running line is burnished clean by every wheel that passes.
  // The mesh carries no material id, so the railhead is picked out by being
  // the one neutral grey in the palette: everything else is warm or green.
  if (uSnow > 0.001) {
    float steel = 1.0 - smoothstep(0.0, 0.055, abs(vCol.r - vCol.b));
    float flatness = smoothstep(0.45, 0.92, n.y);
    float lie = clamp(uSnow * flatness * (1.0 - steel) * 1.05, 0.0, 1.0);
    base = mix(base, vec3(0.82, 0.85, 0.90), lie);
  }
  // Façades for the polygon buildings. vBld = [ground y, wall height, class,
  // seed], supplied per vertex by buildPolyBuildings; everything else has
  // vBld.y == 0 and skips this. Storeys count from the building's own
  // ground and the window grid runs along the wall itself, so rows sit on
  // floors and columns do not shear on walls that face off the world axes.
  // An earlier version measured height from a fixed 95 m above sea level
  // and laid the grid along world x or z.
  vec3 glow = vec3(0.0);
  float isWall = (vBld.y > 0.5 && dot(vNrm, vNrm) > 0.25 && abs(n.y) < 0.35) ? 1.0 : 0.0;
  if (isWall > 0.5) {
    vec2 tng = normalize(vec2(-n.z, n.x));
    float u = dot(vWorld.xz, tng);
    float relH = vWorld.y - vBld.x;
    float H = vBld.y;
    int kind = facadeKind(int(vBld.z + 0.5), H, vBld.w);
    float detail = 1.0 - smoothstep(0.35, 1.10, max(fwidth(u / 3.0), fwidth(relH / 3.3)));
    float nightFac = clamp((0.30 - uSunDir.y) * 4.0, 0.0, 1.0);
    glow = facade(base, u, relH, H, kind, vBld.w, detail, nightFac, uSkyCol);
  }

  float lam = max(dot(n, uSunDir), 0.0);
  lam *= cloudShade(vWorld, uSunDir, uCloudDeck, uCloudShape, uCloudWind,
                    uCloudT, uCloudShadow);
  vec3 col = base * (uSunCol * lam * 0.9 + uSkyCol * (0.5 + uLift * 0.38)
                     + 0.060 + uLift * 0.085);
  // Self-illuminated emissive lights: street lamps, platform lanterns, signals, train lights
  float emissive = max(vCol.r, max(vCol.g, vCol.b));
  if (emissive > 1.05) {
    col = vCol * 1.75;
  }
  // Solar panels (geom.js SOLAR marker colour): dark glass that takes the sky
  // at a glancing angle and flashes the sun at the right one — the black
  // shine the owner sees from the train
  if (distance(vCol, vec3(0.020, 0.030, 0.050)) < 0.004) {
    vec3 v = normalize(uEye - vWorld);
    float fres = pow(1.0 - clamp(dot(v, n), 0.0, 1.0), 3.0);
    col = mix(vec3(0.014, 0.020, 0.034), mix(uSkyCol * 0.8, uFogCol, 0.3), 0.12 + fres * 0.65);
    col += uSunCol * pow(max(dot(reflect(-uSunDir, n), v), 0.0), 90.0) * 2.6 * lam;
    float cellLine = step(0.92, fract(vWorld.x * 0.95)) + step(0.94, fract(vWorld.y * 1.4));
    col *= 1.0 - clamp(cellLine, 0.0, 1.0) * 0.25;
  }
  col += glow * 1.35;
  col += headlight(vWorld, base, n, uLamp, uLampDir);
  col += streetLight(vWorld, base, n);
  float f = 1.0 - exp(-vDist * uFogDensity);
  col = mix(col, uFogCol, clamp(f, 0.0, 1.0));
  col += bayer(gl_FragCoord.xy) * uDither;
  fc = vec4(col, 1.0);
}`;

export const VEG_VS = `#version 300 es
in vec3 aCorner;                     // x: -1..1, y: 0..1, z: plane (0 or 1)
out vec2 vUv; out float vDist; out float vKind; out float vSeed; out float vFootY;
out float vSp; out float vWaterY; out float vCloud;
uniform mat4 uVP; uniform vec3 uEye; uniform vec3 uRight;
uniform vec2 uOrigin; uniform float uSpacing; uniform int uSide;
uniform sampler2D uHeightNear, uCover;
uniform vec2 uNearSize, uNearStep;
uniform float uMaxDist;
uniform float uDense;                // 1: the close forest pass (woodland only)
uniform vec4 uCityBox;               // Budapest's box, (east, north) min and max
uniform vec2 uWaterAB;
uniform vec4 uSeason;                // leaf, autumn, fresh, crop
uniform vec3 uSunDir;
uniform vec4 uCloudDeck, uCloudShape, uCloudWind;
uniform float uCloudT, uCloudShadow;
${CLOUD_FIELD_GLSL}
// One sample at the foot of the tree, in the vertex shader. A billboard is
// four vertices and a great many fragments, and a tree is under the cloud or
// it is not — sampling the field per fragment would cost a hundred times as
// much to say the same thing.
float cloudShade(vec3 wpos, vec3 sunDir, vec4 deck, vec4 shape, vec4 wind,
                 float t, float amount) {
  if (amount <= 0.002 || sunDir.y < 0.05 || deck.z <= 0.01) return 1.0;
  float rise = deck.x - wpos.y;
  if (rise <= 0.0) return 1.0;
  vec2 hit = wpos.xz + sunDir.xz / sunDir.y * rise;
  float n = deckField(hit, deck, shape, deckFlowW(deck, wind), t, 3);
  return 1.0 - amount * deckDensity(n, deck.z, shape.x);
}

float decode(vec3 c){ return (c.r*255.0*256.0 + c.g*255.0) * 0.1; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

void main(){
  int id = gl_InstanceID;
  int n = uSide;
  vec2 cell = vec2(float(id % n), float(id / n)) - float(n) * 0.5;
  vec2 base = uOrigin + cell * uSpacing + uDense * 2.9;
  vec2 jit = vec2(hash(base + uDense * 31.7), hash(base + 7.3)) - 0.5;
  vec2 w = base + jit * uSpacing * 0.9;

  vec2 nuv = vec2(w.x, -w.y) / (uNearSize * uNearStep);
  float cov = 0.0, railDist = 255.0;
  if (nuv.x > 0.0 && nuv.x < 1.0 && nuv.y > 0.0 && nuv.y < 1.0) {
    vec4 cc4 = texture(uCover, vec2(nuv.x, 1.0 - nuv.y));
    vec3 cc = cc4.rgb;
    cov = cc.r * 255.0;
    railDist = cc.b * 255.0;
    // alpha 0: a cleared strip (the kisvasút's line through the forest)
    if (cc4.a < 0.5) railDist = 0.0;
  }

  // nothing grows within 30 m of a running line, whatever the land cover
  // says — the cover raster is 26 m per pixel and far too blunt for this
  // (and gardens: villages had no trees at all, the owner saw bare lawns
  // where Verőce is all fruit trees and walnuts)
  bool plant = ((cov > 0.5 && cov < 2.5) || (cov > 4.5 && cov < 7.5)
                || (cov > 10.5 && cov < 11.5) || (cov > 12.5 && cov < 13.5))
             && railDist > 30.0;
  float r = hash(w * 0.37);
  if (cov > 6.5 && cov < 7.5 && r > 0.40) plant = false;   // a tree in two garden cells out of five
  // in the city a "residential" cell is mostly courtyard and street: far
  // fewer, or they stand in the tenement blocks
  bool inCity = w.x > uCityBox.x && w.x < uCityBox.z && -w.y > uCityBox.y && -w.y < uCityBox.w;
  if (inCity && cov > 6.5 && cov < 7.5 && r > 0.07) plant = false;
  // the close forest pass: woodland only, the understorey between the trees
  if (uDense > 0.5 && !(cov > 0.5 && cov < 1.5)) plant = false;
  if (cov > 1.5 && cov < 2.5 && r > 0.45) plant = false;   // scrub is sparser
  if (cov > 4.5 && cov < 6.5 && r > 0.55) plant = false;
  if (cov > 10.5 && cov < 11.5 && r > 0.30) plant = false; // wetland, sparse
  if (cov > 12.5 && cov < 13.5 && r > 0.24) plant = false; // park, mown between

  float h = decode(texture(uHeightNear, vec2(clamp(nuv.x,0.,1.), 1.0 - clamp(nuv.y,0.,1.))).rgb);
  vec3 foot = vec3(w.x, h, w.y);
  float d = length(foot - uEye);
  if (!plant || d > uMaxDist || nuv.x <= 0.0 || nuv.x >= 1.0
      || nuv.y <= 0.0 || nuv.y >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // cull off-screen
    return;
  }

  // Species, for the Börzsöny and the Danube floodplain specifically.
  // Altitude does most of the work here: the Börzsöny is a beech zone above
  // roughly 450 m, sessile oak and hornbeam below that, Turkey oak on the
  // warm lower slopes, and pine plantations on the dry south-facing ones.
  // The floodplain is willow, poplar and alder. Black locust is everywhere
  // it has been let in, which is most disturbed ground. The chestnut groves
  // above Nagymaros and Zebegény are a real and locally famous thing.
  //
  //  0 bükk (beech)          1 kocsánytalan tölgy (sessile oak)
  //  2 gyertyán (hornbeam)   3 csertölgy (Turkey oak)
  //  4 akác (black locust)   5 erdeifenyő (Scots pine)
  //  6 nyár (poplar)         7 fűz (willow)
  //  8 éger (alder)          9 szelídgesztenye (sweet chestnut)
  // 10 mogyoró/kökény (hazel, blackthorn)   11 szőlő (vine)
  float rs = hash(w * 1.13 + 4.7);
  float rt = hash(w * 2.71 + 19.3);
  float sp;
  // 12 gyümölcsfa (apple, plum, cherry)  13 dió (walnut)
  // 14 lucfenyő/tuja (spruce, thuja)      15 nyír (birch)
  if (cov > 6.5 && cov < 7.5)      sp = rs < 0.40 ? 12.0         // gardens
                                      : rs < 0.58 ? 13.0
                                      : rs < 0.76 ? 14.0
                                      : rs < 0.88 ? 15.0 : 2.0;
  else if (cov > 5.5 && cov < 6.5) sp = 11.0;                   // vineyard
  else if (cov > 4.5 && cov < 5.5) sp = rs < 0.30 ? 9.0 : 5.0;  // orchard
  else if (cov > 12.5)             sp = rs < 0.30 ? 1.0          // park:
                                      : rs < 0.55 ? 9.0          // planted,
                                      : rs < 0.78 ? 2.0 : 6.0;   // not wild
  else if (cov > 10.5)             sp = rs < 0.55 ? 7.0 : 8.0;  // wetland
  else if (cov > 1.5 && cov < 2.5) sp = rs < 0.62 ? 10.0 : 4.0; // scrub
  else if (h < 118.0)              sp = rs < 0.40 ? 7.0         // floodplain
                                      : rs < 0.72 ? 6.0 : 8.0;
  else if (h > 430.0)              sp = rs < 0.66 ? 0.0         // beech zone
                                      : rs < 0.85 ? 2.0 : 5.0;
  else if (h > 260.0)              sp = rs < 0.42 ? 1.0
                                      : rs < 0.66 ? 2.0
                                      : rs < 0.80 ? 0.0
                                      : rs < 0.92 ? 5.0 : 9.0;
  else                             sp = rs < 0.30 ? 3.0
                                      : rs < 0.52 ? 1.0
                                      : rs < 0.70 ? 2.0
                                      : rs < 0.86 ? 4.0 : 6.0;

  // height by species, with a real spread inside each
  float tall;
  if (sp == 0.0)       tall = 22.0 + r * 12.0;  // beech, the tallest here
  else if (sp == 1.0)  tall = 16.0 + r * 10.0;  // sessile oak
  else if (sp == 2.0)  tall = 11.0 + r *  7.0;  // hornbeam, an understorey tree
  else if (sp == 3.0)  tall = 14.0 + r *  8.0;  // Turkey oak
  else if (sp == 4.0)  tall = 10.0 + r *  9.0;  // black locust
  else if (sp == 5.0)  tall = 15.0 + r * 10.0;  // pine
  else if (sp == 6.0)  tall = 18.0 + r * 11.0;  // poplar
  else if (sp == 7.0)  tall =  7.0 + r *  7.0;  // willow
  else if (sp == 8.0)  tall = 13.0 + r *  8.0;  // alder
  else if (sp == 9.0)  tall = 12.0 + r *  7.0;  // sweet chestnut
  else if (sp == 10.0) tall =  2.2 + r *  3.4;  // hazel, blackthorn
  else if (sp == 12.0) tall =  3.8 + r *  3.2;  // fruit tree
  else if (sp == 13.0) tall = 10.0 + r *  7.0;  // walnut
  else if (sp == 14.0) tall =  7.0 + r * 10.0;  // spruce, thuja
  else if (sp == 15.0) tall = 11.0 + r *  8.0;  // birch
  else                 tall =  1.5 + r *  0.5;  // vine
  tall *= clamp((railDist - 30.0) / 22.0, 0.30, 1.0);
  tall *= 0.86 + rt * 0.28;                     // no two trees the same
  if (uDense > 0.5) tall *= 0.62;               // the understorey is lower
  if (sp == 11.0) tall *= mix(0.55, 1.0, uSeason.x);

  float wide = tall * (sp == 12.0 ? 0.95 + rt * 0.25
                     : sp == 13.0 ? 0.72 + rt * 0.16
                     : sp == 14.0 ? 0.34 + rt * 0.08
                     : sp == 15.0 ? 0.36 + rt * 0.10
                     : sp == 6.0 ? 0.24 + rt * 0.08
                     : sp == 5.0 ? 0.34 + rt * 0.10
                     : sp == 11.0 ? 1.10
                     : sp == 7.0 ? 0.78 + rt * 0.26
                     : sp == 4.0 ? 0.52 + rt * 0.22
                     : sp == 0.0 ? 0.50 + rt * 0.18
                                 : 0.44 + rt * 0.26);

  // 3D X-Cross intersecting quads: Plane 0 at angle theta, Plane 1 at theta + 90 deg
  float treeAng = r * 6.2831853 + aCorner.z * 1.5707963;
  vec3 planeDir = vec3(cos(treeAng), 0.0, sin(treeAng));
  vec3 p = foot + planeDir * (aCorner.x * wide * 0.5) + vec3(0.0, aCorner.y * tall, 0.0);
  vUv = vec2(aCorner.x * 0.5 + 0.5, aCorner.y);
  vDist = d; vKind = cov; vSeed = r; vFootY = h; vSp = sp;
  vWaterY = uWaterAB.x + uWaterAB.y * w.y;
  vCloud = cloudShade(foot, uSunDir, uCloudDeck, uCloudShape, uCloudWind,
                      uCloudT, uCloudShadow);
  gl_Position = uVP * vec4(p, 1.0);
}`;

export const VEG_FS = `#version 300 es
precision highp float;
in vec2 vUv; in float vDist; in float vKind; in float vSeed; in float vFootY;
in float vSp; in float vWaterY; in float vCloud;
out vec4 fc;
uniform vec3 uSunCol, uSkyCol, uFogCol;
uniform float uFogDensity, uDither, uClipBelow, uSnow, uLift;
uniform vec4 uSeason;                // leaf, autumn, fresh, crop

void main(){
  if (uClipBelow > 0.5 && vFootY < vWaterY - 0.15) discard;
  vec2 p = vUv - vec2(0.5, 0.0);
  float y = vUv.y;
  int sp = int(vSp + 0.5);
  bool evergreen = (sp == 5 || sp == 14);   // pines and spruces keep their needles

  // crown shape per species: base width, tip width, taper, lobe size and
  // frequency, where the canopy starts, trunk width
  float trunkW, base_, tip, power, lobeAmp, lobeFreq, canopyFrom;
  if (sp == 0) {            // beech: a tall dense dome on a clean grey bole
    base_ = 0.40; tip = 0.12; power = 2.10; lobeAmp = 0.038; lobeFreq = 13.0;
    canopyFrom = 0.34; trunkW = 0.062;
  } else if (sp == 1 || sp == 3) {   // oak: broad, heavy, irregular
    base_ = 0.46; tip = 0.16; power = 2.40; lobeAmp = 0.072; lobeFreq = 11.0;
    canopyFrom = 0.28; trunkW = 0.080;
  } else if (sp == 2) {     // hornbeam: a narrow oval, low and dense
    base_ = 0.32; tip = 0.10; power = 1.70; lobeAmp = 0.042; lobeFreq = 16.0;
    canopyFrom = 0.22; trunkW = 0.050;
  } else if (sp == 4) {     // black locust: open, airy, awkwardly branched
    base_ = 0.34; tip = 0.20; power = 1.10; lobeAmp = 0.105; lobeFreq = 9.0;
    canopyFrom = 0.30; trunkW = 0.048;
  } else if (sp == 5) {     // pine: a spire, needled nearly to the ground
    base_ = 0.38; tip = 0.03; power = 0.85; lobeAmp = 0.072; lobeFreq = 30.0;
    canopyFrom = 0.10; trunkW = 0.048;
  } else if (sp == 6) {     // poplar: a column
    base_ = 0.22; tip = 0.06; power = 1.30; lobeAmp = 0.026; lobeFreq = 24.0;
    canopyFrom = 0.10; trunkW = 0.038;
  } else if (sp == 7) {     // willow: broad, and it weeps
    base_ = 0.48; tip = 0.32; power = 0.70; lobeAmp = 0.095; lobeFreq = 12.0;
    canopyFrom = 0.20; trunkW = 0.085;
  } else if (sp == 8) {     // alder: narrow, upright, dark
    base_ = 0.28; tip = 0.09; power = 1.40; lobeAmp = 0.048; lobeFreq = 18.0;
    canopyFrom = 0.20; trunkW = 0.045;
  } else if (sp == 9) {     // sweet chestnut: a wide round head, short bole
    base_ = 0.50; tip = 0.18; power = 2.70; lobeAmp = 0.060; lobeFreq = 12.0;
    canopyFrom = 0.30; trunkW = 0.090;
  } else if (sp == 12) {    // a fruit tree: a low round head on a short trunk
    base_ = 0.48; tip = 0.16; power = 2.20; lobeAmp = 0.060; lobeFreq = 14.0;
    canopyFrom = 0.34; trunkW = 0.060;
  } else if (sp == 13) {    // walnut: a big round spreading head
    base_ = 0.50; tip = 0.18; power = 2.60; lobeAmp = 0.055; lobeFreq = 10.0;
    canopyFrom = 0.26; trunkW = 0.075;
  } else if (sp == 14) {    // spruce, thuja: a dense dark cone to the ground
    base_ = 0.42; tip = 0.02; power = 0.95; lobeAmp = 0.050; lobeFreq = 34.0;
    canopyFrom = 0.04; trunkW = 0.040;
  } else if (sp == 15) {    // birch: slender, light, open
    base_ = 0.30; tip = 0.08; power = 1.45; lobeAmp = 0.070; lobeFreq = 20.0;
    canopyFrom = 0.30; trunkW = 0.034;
  } else if (sp == 10) {    // hazel and blackthorn: no trunk, bushy from the base
    base_ = 0.46; tip = 0.16; power = 1.60; lobeAmp = 0.080; lobeFreq = 19.0;
    canopyFrom = 0.02; trunkW = 0.030;
  } else {                  // vine: a low trained row
    base_ = 0.46; tip = 0.34; power = 1.00; lobeAmp = 0.060; lobeFreq = 26.0;
    canopyFrom = 0.30; trunkW = 0.045;
  }

  // Foliage. Deciduous species drop it: the crown thins, the silhouette
  // narrows, and what is left is dead brown — not green with the brightness
  // turned down, which is what made a January wood read as a summer one.
  float leaf = evergreen ? 1.0 : mix(0.12, 1.0, uSeason.x);
  float w;
  if (sp == 1 || sp == 3 || sp == 9 || sp == 0 || sp == 12 || sp == 13) {
    float t = clamp((y - canopyFrom) / (1.0 - canopyFrom), 0.0, 1.0);
    w = base_ * sqrt(max(0.0, 1.0 - pow(2.0 * t - 1.0, 2.0))) + tip * 0.4;
  } else if (sp == 7) {
    float t = clamp((y - canopyFrom) / (1.0 - canopyFrom), 0.0, 1.0);
    w = base_ * (1.0 - pow(abs(t - 0.34) * 1.5, 1.4));
  } else {
    w = mix(base_, tip, pow(y, power));
  }
  w *= mix(0.55, 1.0, leaf);

  float lobes = lobeAmp * sin(y * lobeFreq + vSeed * 27.0)
              + lobeAmp * 0.5 * sin(y * lobeFreq * 2.3 + vSeed * 11.0);
  float canopy = smoothstep(w + lobes, w + lobes - 0.045, abs(p.x))
               * step(canopyFrom, y) * step(y, 0.995);
  // A bare crown is not a smaller solid crown, it is a sparse one. Punch the
  // canopy out on a fine grid as the leaf goes: at full leaf everything
  // survives, at bare only a fifth does, and what is left reads as twigs
  // against the sky rather than as a green blob turned brown.
  if (!evergreen && leaf < 0.98) {
    vec2 cellp = floor(vec2(p.x * 46.0, y * 46.0));
    float keep = fract(sin(dot(cellp, vec2(41.3, 289.1)) + vSeed * 17.0) * 21937.7);
    canopy *= step(keep, mix(0.18, 1.0, leaf * leaf));
  }
  float trunk = smoothstep(trunkW, trunkW - 0.012, abs(p.x))
              * step(y, canopyFrom + 0.10);
  if (!evergreen && leaf < 0.75) {
    float br = smoothstep(0.030, 0.0,
      abs(abs(p.x) - (y - canopyFrom) * w * 1.5
          - 0.02 * sin(y * 9.0 + vSeed * 31.0)))
      * step(canopyFrom, y) * step(y, 0.97);
    trunk = max(trunk, br * (1.0 - leaf) * 0.9);
  }
  float a = clamp(trunk + canopy, 0.0, 1.0);
  // Leaf cluster micro-transparency: small airy gaps between leaf groups inside
  // the canopy so light and sky filter through naturally.
  if (canopy > 0.12 && y > canopyFrom + 0.04) {
    vec2 leafGrid = fract(p * 28.0 + vec2(vSeed * 7.1, vSeed * 13.3));
    float leafHole = smoothstep(0.36, 0.0, length(leafGrid - 0.5));
    a *= (1.0 - leafHole * 0.28);
  }
  // The canopy edge dither: soft broken foliage boundary
  {
    int bx = int(mod(gl_FragCoord.x, 4.0)), by = int(mod(gl_FragCoord.y, 4.0));
    float thr[16] = float[16](0.06,0.56,0.19,0.69, 0.81,0.31,0.94,0.44,
                              0.25,0.75,0.12,0.62, 1.00,0.50,0.88,0.38);
    if (a < thr[by * 4 + bx] * 0.78 + 0.16) discard;
  }

  vec3 leafCol = sp == 5  ? vec3(0.10,0.20,0.14)   // pine, blue-dark
               : sp == 14 ? vec3(0.08,0.18,0.12)   // spruce, darker still
               : sp == 15 ? vec3(0.30,0.42,0.18)   // birch, light
               : sp == 12 ? vec3(0.24,0.36,0.16)   // fruit tree
               : sp == 13 ? vec3(0.22,0.33,0.15)   // walnut
               : sp == 0  ? vec3(0.19,0.33,0.15)   // beech, bright green
               : sp == 4  ? vec3(0.30,0.40,0.20)   // locust, pale and yellowish
               : sp == 6  ? vec3(0.25,0.35,0.18)   // poplar
               : sp == 7  ? vec3(0.28,0.38,0.24)   // willow, grey-green
               : sp == 8  ? vec3(0.13,0.25,0.15)   // alder, very dark
               : sp == 9  ? vec3(0.20,0.31,0.14)   // chestnut
               : sp == 11 ? vec3(0.26,0.33,0.17)   // vine
               : sp == 3  ? vec3(0.20,0.30,0.13)   // Turkey oak
                          : vec3(0.17,0.29,0.14);  // sessile oak, hornbeam, scrub
  leafCol *= 0.84 + fract(vSeed * 13.7) * 0.32;
  leafCol = mix(leafCol, vec3(0.44,0.60,0.24), uSeason.z * (evergreen ? 0.08 : 0.55));
  // April: the fruit trees flower, white and pale pink, before the leaves
  if (sp == 12) leafCol = mix(leafCol, fract(vSeed * 3.3) < 0.5 ? vec3(0.96,0.93,0.92) : vec3(0.95,0.78,0.84),
                              uSeason.z * 0.85);

  // Autumn, and each species turns to its own colour: beech to copper,
  // hornbeam and locust to clear yellow, oak to rust and brown, poplar to
  // gold. A pine does none of it.
  float turn = clamp(uSeason.y * (0.55 + fract(vSeed * 5.9) * 0.9), 0.0, 1.0);
  vec3 gold = sp == 15 ? vec3(0.86,0.72,0.20)   // birch, clear yellow
            : sp == 12 ? vec3(0.76,0.40,0.14)   // fruit trees, orange and red
            : sp == 0 ? vec3(0.62,0.32,0.12)
            : sp == 2 || sp == 4 ? vec3(0.78,0.62,0.16)
            : sp == 6 || sp == 7 ? vec3(0.72,0.60,0.20)
            : sp == 9 ? vec3(0.70,0.46,0.14)
                      : vec3(0.54,0.30,0.12);
  if (!evergreen) leafCol = mix(leafCol, gold, turn);
  // and out of season it is dead leaf and bare twig, not green
  vec3 dead = vec3(0.31, 0.25, 0.18);
  if (!evergreen) leafCol = mix(dead, leafCol, smoothstep(0.0, 0.45, uSeason.x));

  vec3 bark = sp == 15 ? vec3(0.86,0.85,0.82)     // birch, white
            : sp == 0 ? vec3(0.42,0.42,0.40)      // beech, smooth pale grey
            : sp == 6 ? vec3(0.46,0.45,0.40)      // poplar
            : sp == 5 ? vec3(0.34,0.22,0.14)      // pine, red-brown
            : sp == 4 ? vec3(0.30,0.24,0.17)      // locust, deeply furrowed
            : sp == 7 ? vec3(0.24,0.20,0.15)
                      : vec3(0.21,0.17,0.13);
  vec3 col = mix(bark, leafCol, canopy);
  if (uSnow > 0.001)
    col = mix(col, vec3(0.86,0.89,0.93),
              clamp(uSnow * canopy * (0.30 + 0.70 * y) * (evergreen ? 1.0 : leaf),
                    0.0, 0.9));
  float shade = 0.55 + 0.45 * y - 0.28 * smoothstep(0.0, -0.35, p.x);
  col *= (uSunCol * shade * vCloud + uSkyCol * (0.42 + uLift * 0.36) + uLift * 0.06);
  float f = 1.0 - exp(-vDist * uFogDensity);
  col = mix(col, uFogCol, clamp(f, 0.0, 1.0));
  fc = vec4(col, 1.0);
}`;

export const BLIT_VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

// ---------------------------------------------------------------- output
// Light and brightness are not the same number, and until now they were.
// Everything was written straight into an 8-bit target, so a sunlit field and
// a lit cloud top both had to fit under 1.0 and the whole picture had to be
// dimmed to make room for the sun. The scene now renders to a float target
// where a value may be greater than one, and this stage decides what that
// looks like on a screen: multiply by the exposure, then run a filmic curve
// that rolls the highlights off instead of clipping them. A bright day can be
// bright without the sky turning into a flat white wall.
export const BLIT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fc;
uniform sampler2D uTex, uBloom, uDepth;
uniform float uVignette, uExposure, uBloomAmt, uTime, uGrain, uChroma;
// Photo mode. uDof: x mode (0 off, 1 depth of field, 2 tilt-shift
// "miniature"), y focus distance (m), z blur strength, w the sharp band's
// centre (0..1 up the picture, tilt-shift). uNF: the projection's near and
// far planes, to turn the depth buffer back into metres. uGrade: x hue shift
// (radians), y saturation, z contrast, w warmth (−1 cool … +1 warm).
uniform vec4 uDof, uGrade;
uniform vec2 uNF;
// Settings → graphics. uFx: x motion blur amount (0 off), y corner shading
// (ambient occlusion) strength (0 off), z: nearer than this (m) is left
// sharp and still (the cab, drawn with its own projection)
uniform vec3 uFx;
uniform mat4 uInvVP, uPrevVP;

float linDepth(vec2 uv){
  float z = texture(uDepth, uv).r * 2.0 - 1.0;
  return 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - z * (uNF.y - uNF.x));
}
// how blurred a point is, 0..1: by its distance from the focus plane, or in
// the miniature mode by its height in the picture (a lens tilted so only a
// band across the view is sharp, which makes a real town look like a model)
float coc(vec2 uv){
  if (uDof.x > 1.5) {
    float d = abs(uv.y - uDof.w);
    return smoothstep(0.06, 0.42, d);
  }
  // |f/z − 1|: 0 at the focus distance, 1 at half of it, growing slowly
  // behind it — the way a real lens's blur disc goes
  float z = linDepth(uv);
  if (z < uFx.z) return 0.0;
  return clamp(abs(uDof.y / max(z, 0.5) - 1.0) * 0.8, 0.0, 1.0);
}
vec3 hueShift(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

// Narkowicz's fit to the ACES curve: keeps saturation in the highlights
vec3 aces(vec3 x){
  return clamp((x*(2.51*x+0.03)) / (x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
void main(){
  vec2 d = vUv - 0.5;
  float dist2 = dot(d, d);

  // 1. Adjustable Chromatic Aberration
  vec2 caOff = d * (0.0055 * uChroma * (0.4 + dist2 * 2.5));
  vec3 c;
  c.r = texture(uTex, vUv + caOff).r;
  c.g = texture(uTex, vUv).g;
  c.b = texture(uTex, vUv - caOff).b;

  // 2. Subtle optical lens softness toward screen corners
  vec2 px = 1.0 / vec2(textureSize(uTex, 0));
  vec3 soft = (texture(uTex, vUv + vec2(px.x, 0.0)).rgb +
               texture(uTex, vUv - vec2(px.x, 0.0)).rgb +
               texture(uTex, vUv + vec2(0.0, px.y)).rgb +
               texture(uTex, vUv - vec2(0.0, px.y)).rgb) * 0.25;
  c = mix(c, soft, smoothstep(0.15, 0.55, dist2) * 0.30 * uChroma);

  // 2b. Photo mode: depth of field / tilt-shift. A gather blur over a golden
  // spiral; each tap counts only if it is itself blurred that far, so a
  // sharp foreground does not smear over the background behind it.
  if (uDof.x > 0.5) {
    float r0 = coc(vUv);
    float R = uDof.z * 14.0;                   // largest radius, in pixels
    vec3 acc = c; float wsum = 1.0;
    for (int i = 1; i < 24; i++) {
      float fi = float(i);
      float rr = sqrt(fi / 24.0) * R * max(r0, 0.1);   // the disc grows with the blur
      float th = fi * 2.39996;
      vec2 o = vec2(cos(th), sin(th)) * rr * px;
      float ct = coc(vUv + o) * R;
      float w = smoothstep(rr - 1.5, rr + 0.5, max(ct, r0 * R));
      acc += texture(uTex, vUv + o).rgb * w; wsum += w;
    }
    c = mix(c, acc / wsum, smoothstep(0.04, 0.55, r0));
  }

  // 2c. Motion blur: where this pixel was last frame (its world position
  // from the depth, through last frame's camera), and a smear along the way
  if (uFx.x > 0.0) {
    float dz = texture(uDepth, vUv).r;
    if (linDepth(vUv) > uFx.z) {
      vec4 wp = uInvVP * vec4(vUv * 2.0 - 1.0, dz * 2.0 - 1.0, 1.0);
      wp /= wp.w;
      vec4 pp = uPrevVP * wp;
      vec2 vel = (vUv - (pp.xy / pp.w * 0.5 + 0.5)) * uFx.x;
      float L = length(vel);
      if (L > 0.05) vel *= 0.05 / L;
      if (L > 0.0015) {
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 8; i++) acc += texture(uTex, vUv - vel * (float(i) / 7.0 - 0.5)).rgb;
        c = acc / 8.0;
      }
    }
  }

  // 2d. Corner shading: a pixel whose neighbours on BOTH sides are nearer
  // sits in a crease (a wall's foot, a courtyard, under the eaves); a plane
  // at any slope averages out and is left alone
  if (uFx.y > 0.0) {
    float z0 = linDepth(vUv), occ = 0.0;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 0.5236;
      vec2 o = vec2(cos(a), sin(a)) * px * 3.0;
      float za = linDepth(vUv + o), zb = linDepth(vUv - o);
      float crease = z0 - 0.5 * (za + zb);
      occ += smoothstep(0.004, 0.03, crease / z0) * step(crease, z0 * 0.25);
    }
    c *= 1.0 - uFx.y * 0.45 * occ / 6.0;
  }

  // 3. HDR Bloom & Filmic Tonemapping
  c += texture(uBloom, vUv).rgb * uBloomAmt;
  c *= uExposure;
  c = aces(c);

  // 3b. Grading: hue, saturation, contrast, warmth (neutral outside photo mode)
  c = hueShift(c, uGrade.x);
  float lumG = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(lumG), c, uGrade.y);
  c = (c - 0.5) * uGrade.z + 0.5;
  c *= vec3(1.0 + 0.10 * uGrade.w, 1.0 + 0.02 * uGrade.w, 1.0 - 0.12 * uGrade.w);
  c = clamp(c, 0.0, 1.0);

  // 4. Adjustable Dynamic 35mm analogue film grain
  float noise = fract(sin(dot(gl_FragCoord.xy + fract(uTime * 23.17) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float grain = (noise - 0.5) * 0.075 * uGrain * (1.0 - smoothstep(0.20, 0.90, lum));
  c += grain;

  // 5. Cinematic photographic vignette
  c *= 1.0 - uVignette * dist2 * 1.6;
  fc = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// Bloom is not a brightness control: it is what a lens does with light that
// is genuinely brighter than the rest of the frame. Only what survives the
// threshold blooms, so a sunlit snowfield glows and a grey overcast does not.
export const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fc;
uniform sampler2D uTex;
uniform float uThreshold, uExposure;
void main(){
  vec3 c = texture(uTex, vUv).rgb * uExposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  fc = vec4(c * smoothstep(uThreshold, uThreshold * 2.0, l) / max(uExposure, 1e-4), 1.0);
}`;

export const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fc;
uniform sampler2D uTex;
uniform vec2 uStep;               // one texel along the axis being blurred
void main(){
  // nine taps at five offsets, using the hardware's linear filtering to get
  // two samples for the price of one
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += texture(uTex, vUv + uStep * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv - uStep * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv + uStep * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUv - uStep * 3.2307692308).rgb * 0.0702702703;
  fc = vec4(c, 1.0);
}`;

// ------------------------------------------------------------ precipitation
// Real particles in a box that travels with the camera, not a pattern painted
// on the view. The first attempt sampled a grid on a sphere of fixed radius
// around the eye, which folded over at the edges of a wide field of view and
// made the streaks fan out from the centre — worst when you looked back or
// out of the side window. Instancing actual drops removes the whole class of
// problem: they are at world positions, so they have honest parallax, they
// are occluded by the terrain, and the streak is the drop's own motion
// projected by the same matrix as everything else.
//
// Each drop is a quad spanning where the drop is now to where it was one
// exposure ago. That vector is the resultant of the fall speed, the wind and
// the train's own 90 km/h, so rain leans back at speed and stands up when you
// stop — which is what you actually see out of a cab.
export const PRECIP_VS = `#version 300 es
in vec2 aCorner;                 // unit quad, -1..1
uniform mat4 uVP;
uniform vec3 uCam, uVel, uOffset;
uniform vec4 uPrecip;            // kind, rate, radius m, exposure s
uniform float uHalf;             // half-extent of the box, metres
uniform float uPy, uMinW;        // projection y scale, minimum width in ndc
uniform float uAspect, uTime;
out vec2 vQuad; out float vCore; out float vFade;

vec3 hash31(float n){
  vec3 p = fract(vec3(n * 0.1031, n * 0.1030, n * 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.xxy + p.yzz) * p.zyx);
}
void main(){
  float id = float(gl_InstanceID);
  vec3 r = hash31(id + 0.5);
  float box = uHalf * 2.0;
  // The drop's home position plus how far the field has travelled, wrapped
  // into a box centred on the camera. The offset arrives pre-wrapped, so the
  // coordinate never grows and the field never loses precision.
  vec3 home = r * box + uOffset;
  vec3 rel = mod(home - uCam + uHalf, box) - uHalf;
  vec3 world = uCam + rel;

  // a little spread in size and speed: identical drops read as a texture
  float sz = 0.55 + 1.1 * r.x;
  vec3 vel = uVel * (0.85 + 0.35 * r.y);
  bool snow = uPrecip.x > 1.5 && uPrecip.x < 2.5;
  if (snow) {
    // a flake is light enough that the eddies matter more than gravity
    float ph = r.z * 6.2831;
    world += vec3(sin(uTime * 1.5 + ph), 0.0, cos(uTime * 1.1 + ph * 1.7)) * 0.45;
  }

  vec4 c0 = uVP * vec4(world, 1.0);
  vec4 c1 = uVP * vec4(world - vel * uPrecip.w, 1.0);
  if (c0.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

  vec2 a = vec2(uAspect, 1.0);
  vec2 n0 = c0.xy / c0.w * a;
  vec2 n1 = c1.xy / max(c1.w, 0.05) * a;
  vec2 seg = n1 - n0;
  float L = length(seg);
  vec2 u = L > 1e-5 ? seg / L : vec2(0.0, 1.0);
  vec2 v = vec2(-u.y, u.x);

  float w = max(uPrecip.z * sz * uPy / c0.w, uMinW);
  float halfL = max(L * 0.5, w);
  vec2 mid = n0 + seg * 0.5;
  vec2 p = mid + u * aCorner.y * halfL + v * aCorner.x * w;

  vQuad = aCorner;
  vCore = clamp(1.0 - w / halfL, 0.0, 1.0);   // 0 for a dot, ~1 for a streak
  // drops right on the lens are a distraction, and the far ones are haze
  vFade = smoothstep(0.35, 1.2, c0.w) * (1.0 - smoothstep(uHalf * 0.55, uHalf, c0.w));
  gl_Position = vec4(p / a * c0.w, c0.z, c0.w);
}`;

export const PRECIP_FS = `#version 300 es
precision highp float;
in vec2 vQuad; in float vCore; in float vFade;
out vec4 fc;
uniform vec3 uTint;
uniform vec4 uPrecip;
void main(){
  // capsule: a line for rain, a disc for snow, whatever is between for sleet
  float along = max(0.0, abs(vQuad.y) - vCore) / max(1.0 - vCore, 1e-4);
  float d = length(vec2(vQuad.x, along));
  float a = smoothstep(1.0, 0.25, d) * vFade;
  bool snow = uPrecip.x > 1.5 && uPrecip.x < 2.5;
  a *= snow ? 0.95 : uPrecip.x > 3.5 && uPrecip.x < 4.5 ? 0.30 : 0.55;
  if (a < 0.004) discard;
  fc = vec4(uTint, a);
}`;

// ------------------------------------------------------------------- glass
// Water on the windscreen, which is a different thing from water in the air:
// it is stuck to the glass, it is in screen space, and on a train it runs
// *up* — the airflow drags it up the raked screen faster the faster you go.
// The wiper clears a sector and the film rebuilds behind it.
export const GLASS_VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos, 1.0, 1.0); }`;

export const GLASS_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fc;
uniform vec3 uTint;
uniform vec4 uGlass;      // rate 0..1, speed 0..1, look-ahead fade, aspect
uniform vec3 uWiper;      // sweep rate Hz (0 = parked), sweep half-angle, park
uniform float uTime;

vec2 hash22(vec2 p){
  vec3 q = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
  q += dot(q, q.yzx + 19.19);
  return fract(vec2((q.x + q.y) * q.z, (q.x + q.z) * q.y));
}
float hash12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main(){
  float rate = uGlass.x, spd = uGlass.y, ahead = uGlass.z, asp = uGlass.w;
  // a dry screen still has a wiper on it, so only bail when there is neither
  if (ahead <= 0.004 || (rate <= 0.004 && uWiper.x <= 0.0)) { fc = vec4(0.0); return; }

  // ---- the wiper, pivoted below the bottom of the screen
  vec2 piv = vec2(0.5, -0.16);
  vec2 rel = vec2((vUv.x - piv.x) * asp, vUv.y - piv.y);
  float th = atan(rel.x, max(rel.y, 1e-4));
  float rad = length(rel);
  float amp = uWiper.y, f = uWiper.x;
  float wet = 1.0;
  float blade = 0.0;
  if (f > 0.0) {
    float ang = amp * sin(uTime * f * 6.2831853);
    // when did the arm last cross this angle? sin crosses a level twice a
    // cycle, so there are two candidates and the newer one wins
    float c = clamp(th / amp, -1.0, 1.0);
    float u1 = asin(c) / 6.2831853;
    float u2 = 0.5 - u1;
    float ph = fract(uTime * f);
    float age = min(fract(ph - u1), fract(ph - u2)) / f;    // seconds
    wet = clamp(age / (2.6 - 1.8 * rate), 0.0, 1.0);
    if (abs(th) > amp) wet = 1.0;                 // outside the swept sector
    blade = smoothstep(0.030, 0.012, abs(th - ang)) * step(rad, 1.25)
          * step(0.10, rad);
  }

  // ---- the film: drops that slide up and leave a trail
  float a = 0.0;
  for (int i = 0; i < 2; i++) {
    float sc = i == 0 ? 24.0 : 41.0;
    vec2 g = vec2(vUv.x * asp, vUv.y) * sc;
    g.y += uTime * (0.35 + spd * 3.2) * (i == 0 ? 1.0 : 1.6);
    g.x += (vUv.x - 0.5) * (1.4 + spd * 2.6) * sc * 0.04;
    vec2 gc = floor(g), gf = fract(g) - 0.5;
    vec2 gj = hash22(gc + float(i) * 31.0) - 0.5;
    if (hash12(gc + float(i) * 7.0) > rate * 0.55) continue;
    float d = length((gf - gj * 0.8) * vec2(1.0, 0.42 + spd * 0.30));
    a = max(a, smoothstep(0.34, 0.06, d) * (i == 0 ? 1.0 : 0.6));
  }
  a *= rate * 0.42 * wet * ahead;
  vec3 col = mix(uTint, vec3(0.05, 0.06, 0.07), blade * 0.92);
  a = max(a, blade * 0.75 * ahead);
  if (a < 0.004) discard;
  fc = vec4(col, a);
}`;

export const BLDG_VS = `#version 300 es
in vec3 aCorner;                     // unit box, y 0..1
in vec4 aPosSize;                    // x, y, halfU, halfV
in vec4 aRotHgtCls;                  // rot, height, class, spare
out vec3 vWorld; out float vDist; out float vCls; out float vUp; out float vSeed;
out float vFlat; out float vCloud; out float vBase; out float vWallU;
out vec3 vNrm; out float vIsWall; out float vH;
uniform mat4 uVP; uniform vec3 uEye;
uniform sampler2D uHeightNear; uniform vec2 uNearSize, uNearStep;
uniform vec3 uSunDir;
uniform vec4 uCloudDeck, uCloudShape, uCloudWind;
uniform float uCloudT, uCloudShadow;
${CLOUD_FIELD_GLSL}
// A building is in the shadow of a cloud or it is not: one sample at its own
// foot, in the vertex shader, rather than a field lookup per fragment. The
// ground and the corridor take the shadow per pixel because a shadow edge
// crossing a field has to be an edge; a building is 15 m of wall and the
// difference does not survive a train window.
float cloudShade(vec3 wpos, vec3 sunDir, vec4 deck, vec4 shape, vec4 wind,
                 float t, float amount) {
  if (amount <= 0.002 || sunDir.y < 0.05 || deck.z <= 0.01) return 1.0;
  float rise = deck.x - wpos.y;
  if (rise <= 0.0) return 1.0;
  vec2 hit = wpos.xz + sunDir.xz / sunDir.y * rise;
  float n = deckField(hit, deck, shape, deckFlowW(deck, wind), t, 3);
  return 1.0 - amount * deckDensity(n, deck.z, shape.x);
}
float decode(vec3 c){ return (c.r*255.0*256.0 + c.g*255.0) * 0.1; }
void main(){
  float ang = aRotHgtCls.x, hgt = aRotHgtCls.y, flat_ = aRotHgtCls.w;
  float ca = cos(ang), sa = sin(ang);
  // The box carries a hipped roof: walls to 0.70 of the height, then the
  // corners draw in to 0.18 for the ridge. A factory shed or a prefabricated
  // slab block has no such thing, so for those the roof corners are pushed
  // back out to the eaves and flattened — one mesh, two roof forms.
  vec3 corner = aCorner;
  if (corner.y > 0.70) {
    if (flat_ > 0.5) {
      corner.x = sign(corner.x) * 1.0;
      corner.z = sign(corner.z) * 1.0;
      corner.y = 0.985;
    } else {
      // The mesh draws the roof corners in on both axes, which gives a
      // pyramid. A real roof has a ridge along the long axis, and on a big
      // footprint a pyramid is the difference between a town and a village.
      if (aPosSize.z > aPosSize.w) corner.x = sign(corner.x) * 0.80;
      else                         corner.z = sign(corner.z) * 0.80;
      // and a tall building has a shallow roof, not a third of its height
      float pitch = hgt > 11.0 ? 0.30 : 1.0;
      corner.y = 0.70 + (corner.y - 0.70) * pitch;
    }
  }
  vec2 local = vec2(corner.x * aPosSize.z, corner.z * aPosSize.w);
  vec2 w = aPosSize.xy + vec2(local.x * ca - local.y * sa,
                              local.x * sa + local.y * ca);
  // The ground under a box is the LOWEST of its centre and four corners: on
  // a slope a centre sample leaves the downhill wall standing in the air,
  // which was the floating houses. Sinking into the uphill side is invisible.
  // And the TOP is the building's height over the HIGHEST of them: on a
  // steep slope (Castle Hill) a house measured up from the foot of the slope
  // ended below the ground at its uphill side and the hill swallowed it. The
  // downhill wall is taller, which is how a hillside house is built.
  float g = 1e9, gTop = -1e9;
  for (int k = 0; k < 5; k++) {
    vec2 c = k == 0 ? vec2(0.0) : vec2(k == 1 || k == 2 ? 1.0 : -1.0, k == 1 || k == 3 ? 1.0 : -1.0);
    vec2 lc = vec2(c.x * aPosSize.z, c.y * aPosSize.w);
    vec2 p = aPosSize.xy + vec2(lc.x * ca - lc.y * sa, lc.x * sa + lc.y * ca);
    vec2 nuv = p / (uNearSize * uNearStep);
    float gk = decode(texture(uHeightNear, vec2(clamp(nuv.x,0.,1.), 1.0 - clamp(nuv.y,0.,1.))).rgb);
    g = min(g, gk); gTop = max(gTop, gk);
  }
  float lift = min(gTop - g, 30.0);
  if (lift > 1.5) lift += 1.0;           // the ground between the corners rises too
  vH = lift + 0.70 * hgt + 1.2;
  vWorld = vec3(w.x, g - 1.2 + (corner.y < 0.01 ? 0.0 : lift + corner.y * hgt), -w.y);   // world z runs south
  vDist = length(vWorld - uEye);
  vCls = aRotHgtCls.z; vUp = corner.y; vFlat = flat_;
  vSeed = fract(sin(dot(aPosSize.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vCloud = cloudShade(vec3(w.x, g, -w.y), uSunDir, uCloudDeck, uCloudShape,
                      uCloudWind, uCloudT, uCloudShadow);
  vBase = g - 1.2;                     // the building's own ground, for storeys
  // How far along its own wall this corner is. It has to come from HERE. It
  // was being derived in the fragment shader from the surface normal, and
  // that normal comes from screen derivatives, which at a grazing angle flip
  // between two answers from one pixel to the next — so the window grid
  // jumped with them and the whole wall dissolved into blue and white noise.
  // That is the "renders twice, different colours" Mark kept reporting, and
  // it is not two draws, it is one draw disagreeing with itself.
  // The box knows: a side face is either the pair at local x = ±halfU, in
  // which case the wall runs along local y, or the pair at ±halfV.
  vWallU = abs(aCorner.x) > abs(aCorner.z) ? local.y : local.x;
  // And the wall's own normal, likewise from here. A box knows exactly which
  // way each of its four sides faces — there is no reason to ask the screen
  // derivatives, and every reason not to: at a grazing angle they are noise,
  // and a normal that is noise is a brightness that is noise. Two shades of
  // the same wall interleaved pixel by pixel is precisely what "it renders
  // twice at the same position in different colours" looks like.
  vec2 nl = abs(aCorner.x) > abs(aCorner.z)
          ? vec2(sign(aCorner.x), 0.0) : vec2(0.0, sign(aCorner.z));
  vec2 nw = vec2(nl.x * ca - nl.y * sa, nl.x * sa + nl.y * ca);
  vNrm = vec3(nw.x, 0.0, -nw.y);          // world z runs south
  vIsWall = aCorner.y <= 0.70 ? 1.0 : 0.0;
  gl_Position = uVP * vec4(vWorld, 1.0);
}`;

export const BLDG_FS = `#version 300 es
precision highp float;
in vec3 vWorld; in float vDist; in float vCls; in float vUp; in float vSeed;
in float vFlat; in float vCloud; in float vBase; in float vWallU;
in vec3 vNrm; in float vIsWall; in float vH;
out vec4 fc;
uniform vec3 uEye;
uniform vec3 uSunDir, uSunCol, uSkyCol, uFogCol;
uniform float uFogDensity, uDither, uSnow, uWet, uLift, uNight;
${STREETLIGHT_GLSL}
${FACADE_GLSL}
float hb(vec2 p){ return fract(sin(dot(floor(p), vec2(127.1,311.7))) * 43758.5453); }
float bayer(vec2 p){
  int x = int(mod(p.x,4.0)), y = int(mod(p.y,4.0)); int i = y*4+x;
  float t[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
  return t[i]/16.0 - 0.5;
}
// Flat shading from screen derivatives is free and correct — until a surface
// is nearly edge-on, and then it is neither. At a grazing angle one pixel
// spans many metres along the surface, dFdx and dFdy point almost the same
// way, and their cross product is a small number made mostly of rounding
// error: the normal lands somewhere different in every pixel, so a distant
// road or field breaks into random light and dark dots. That is the speckle
// over the roads in the middle distance — not z-fighting, which is what it
// looks like, and not the geometry, which is flat and correct.
//
// Where the two derivatives come within about two degrees of parallel their
// answer is noise, so take the fallback instead.
vec3 flatNormal(vec3 wpos, vec3 fallback) {
  vec3 dx = dFdx(wpos), dy = dFdy(wpos);
  vec3 c = cross(dx, dy);
  float a = length(c);
  float s = length(dx) * length(dy);
  if (a < 1e-9) return fallback;
  // blended, not switched. A hard cut-off flickers along the line where the
  // test changes its mind, which trades one speckle for another.
  float k = smoothstep(0.012, 0.075, a / max(s, 1e-9));
  return normalize(mix(fallback, c / a, k));
}
void main(){
  // walls exactly, roofs from the derivatives — a roof is never seen edge-on
  vec3 n = vIsWall > 0.5 ? normalize(vNrm) : flatNormal(vWorld, vec3(0.0, 1.0, 0.0));
  if (dot(n, uEye - vWorld) < 0.0) n = -n;      // mirroring flips winding
  int cls = int(vCls + 0.5);
  vec3 wall = vec3(0.72,0.68,0.60);
  if (cls == 1) wall = vec3(0.86,0.83,0.75);        // church
  else if (cls == 2) wall = vec3(0.74,0.70,0.58);   // station
  else if (cls == 3) wall = vec3(0.56,0.55,0.53);   // industrial
  else if (cls == 4) wall = vec3(0.68,0.66,0.62);   // apartments
  else if (cls == 5) wall = vec3(0.63,0.64,0.66);   // retail, office
  else if (cls == 6) wall = vec3(0.52,0.48,0.43);   // sheds
  else if (cls == 7) {
    // A Hungarian panelház (házgyári lakótelep) is grey concrete until renovated,
    // and then painted with characteristic pastel blocks: apricot, sage green,
    // sky blue, warm sand, and coral.
    float renov = fract(vSeed * 17.31);
    wall = vec3(0.66, 0.67, 0.69);
    if (renov > 0.38) {
      float which = fract(vSeed * 53.7);
      if      (which < 0.22) wall = vec3(0.92, 0.68, 0.48);   // apricot / terracotta
      else if (which < 0.44) wall = vec3(0.68, 0.82, 0.66);   // sage green
      else if (which < 0.66) wall = vec3(0.60, 0.76, 0.90);   // bright sky blue
      else if (which < 0.85) wall = vec3(0.92, 0.86, 0.65);   // warm sand / cream
      else                   wall = vec3(0.88, 0.64, 0.68);   // dusty coral
    }
  }
  else if (cls == 8) wall = vec3(0.78,0.76,0.70);   // civic
  else if (cls == 9) wall = vec3(0.74,0.69,0.58);   // city block, ochre render
  wall *= 0.80 + vSeed * 0.34;
  bool roof = vUp > 0.705;
  bool flatRoof = vFlat > 0.5;
  vec3 col = roof
    ? (flatRoof ? vec3(0.34,0.34,0.33) * (0.85 + vSeed * 0.3)
                : mix(vec3(0.42,0.24,0.18), vec3(0.34,0.31,0.30), step(0.5, fract(vSeed*5.1))))
    : wall;

  float wallU = vWallU;
  vec2 pitch = (cls == 7) ? vec2(3.30, 2.90) : vec2(4.20, 3.30);
  float storey = (vWorld.y - vBase - 1.5) / pitch.y;
  vec2 grid = vec2(wallU / pitch.x, storey);
  float cellsPerPx = max(fwidth(grid.x), fwidth(grid.y));
  float detail = 1.0 - smoothstep(0.38, 1.20, cellsPerPx);
  if (cls == 7) detail = max(0.38, detail);

  // A Hungarian panelház (házgyári lakótelep) is defined by its vertical bay rhythm:
  // white-framed casement windows, protruding loggia balconies with amber/concrete
  // side shields and dark recessed openings, ground-floor entrance plinths, and
  // distinct prefab concrete panel joints.
  if (cls == 7 && !roof) {
    vec2 f2 = fract(grid);
    float bay = floor(grid.x);
    int bayType = int(mod(bay, 5.0));
    bool isStairwell = (bayType == 0);
    bool isBalcony = (bayType == 3 || bayType == 4);
    float renov = fract(vSeed * 17.31);

    // Contrasting vertical accent stripe on renovated facades
    if (renov > 0.60 && isBalcony) {
      col = mix(col, wall * 0.84 + vec3(0.05, 0.03, 0.01), 0.40);
    }

    // Ground floor entrance plinth
    if (storey < 0.85) {
      vec3 plinthCol = mix(vec3(0.64, 0.56, 0.48), vec3(0.48, 0.46, 0.44), renov);
      col = mix(col, plinthCol, detail * 0.85);
      // Entrance doorway
      float door = step(0.20, f2.x) * step(f2.x, 0.80) * step(0.12, f2.y) * step(f2.y, 0.88);
      col = mix(col, vec3(0.08, 0.09, 0.11), door * detail * 0.85);
    } else if (isStairwell) {
      // Staircase core: paired narrow vertical windows
      float sw = step(0.32, f2.x) * step(f2.x, 0.68) * step(0.25, f2.y) * step(f2.y, 0.85);
      float swGlass = step(0.36, f2.x) * step(f2.x, 0.64) * step(0.30, f2.y) * step(f2.y, 0.80);
      col = mix(col, vec3(0.92, 0.93, 0.95), sw * detail * 0.75);
      col = mix(col, vec3(0.12, 0.14, 0.18), swGlass * detail * 0.80);
    } else if (isBalcony) {
      // Protruding loggia balcony
      float balOpening = step(0.12, f2.x) * step(f2.x, 0.88) * step(0.38, f2.y) * step(f2.y, 0.90);
      float balParapet = step(0.10, f2.x) * step(f2.x, 0.90) * step(0.06, f2.y) * step(f2.y, 0.38);
      // Amber/terracotta side weather shields (classic Hungarian panel loggia)
      float sideShield = (step(0.10, f2.x) * step(f2.x, 0.22) + step(0.78, f2.x) * step(f2.x, 0.90))
                       * step(0.38, f2.y) * step(f2.y, 0.88);
      vec3 shieldCol = (renov > 0.60) ? vec3(0.75, 0.45, 0.28) : vec3(0.84, 0.68, 0.24);

      col = mix(col, vec3(0.07, 0.08, 0.10), balOpening * detail * 0.82);
      col = mix(col, shieldCol, sideShield * detail * 0.78);
      col = mix(col, col * 0.85, balParapet * detail);
    } else {
      // Standard residential panel window with white frame & dark panes
      float frame = step(0.10, f2.x) * step(f2.x, 0.90) * step(0.20, f2.y) * step(f2.y, 0.82);
      float glass = step(0.15, f2.x) * step(f2.x, 0.85) * step(0.25, f2.y) * step(f2.y, 0.77);
      float mullion = step(0.48, f2.x) * step(f2.x, 0.52);

      col = mix(col, vec3(0.92, 0.93, 0.95), frame * detail * 0.75);
      col = mix(col, vec3(0.11, 0.13, 0.17), glass * (1.0 - mullion) * detail * 0.80);
    }

    // Concrete prefab panel seam joints
    float joint = smoothstep(0.05, 0.0, min(f2.x, 1.0 - f2.x))
                + smoothstep(0.05, 0.0, min(f2.y, 1.0 - f2.y));
    col *= 1.0 - clamp(joint, 0.0, 1.0) * 0.14 * detail;
  }
  // every other kind of building: the shared façades (FACADE_GLSL)
  vec3 glow = vec3(0.0);
  if (!roof && cls != 7) {
    int kind = facadeKind(cls, vH, vSeed);
    float det = 1.0 - smoothstep(0.35, 1.10, max(fwidth(wallU / 3.0), fwidth((vWorld.y - vBase) / 3.3)));
    glow = facade(col, wallU, vWorld.y - vBase, vH, kind, vSeed, det, uNight, uSkyCol);
  }
  // snow settles on a roof and runs off a wall; a wet wall just goes darker
  if (roof) col = mix(col, vec3(0.84,0.87,0.92), clamp(uSnow * 1.1, 0.0, 1.0));
  col *= mix(1.0, roof ? 0.78 : 0.88, uWet);
  float lam = max(dot(n, uSunDir), 0.0) * vCloud;
  col *= (uSunCol * lam * 0.95 + uSkyCol * (0.42 + uLift * 0.38)
          + 0.055 + uLift * 0.085);
  // Lit windows, on the same grid as the panes drawn in daylight — they were
  // on different pitches before, so a panelház lit up in windows that were
  // not where its windows are. Which ones are lit is a
  // hash of the cell, so a building keeps the same ones all night, and how
  // many depends on what the building is: a block of flats is mostly lit at
  // nine in the evening, a shed is not.
  col += glow * 1.35;
  if (uNight > 0.01 && !roof && cls == 7) {
    vec2 cell = floor(grid);
    vec2 f2 = fract(grid);
    float pane = step(0.22, f2.x) * step(f2.x, 0.78)
               * step(0.30, f2.y) * step(f2.y, 0.80)
               * step(0.0, storey);
    float share = cls == 4 ? 0.62 : 0.34;
    // Lighting single panes at random gives a wall of scattered dots. A lit
    // room shows in two windows, so the hash is taken per PAIR of bays — the
    // same number of lights, in shapes the eye reads as windows.
    vec2 room = vec2(floor(cell.x * 0.5), cell.y);
    float lit = step(hb(room + vSeed * 37.0), share);
    float warm = hb(room + 11.0);
    vec3 bulb = mix(vec3(1.75, 1.30, 0.72), vec3(1.30, 1.45, 1.60), step(0.72, warm));
    // 0.28 is the fraction of the wall a pane covers, so the far limit is the
    // wall's own average brightness rather than nothing
    col += bulb * mix(share * 0.28, pane * lit, detail) * uNight;
  }
  col += streetLight(vWorld, roof ? col * 0.6 : wall, n) * 0.7;
  float f = 1.0 - exp(-vDist * uFogDensity);
  col = mix(col, uFogCol, clamp(f, 0.0, 1.0));
  col += bayer(gl_FragCoord.xy) * uDither;
  fc = vec4(col, 1.0);
}`;


export const BOARD_VS = `#version 300 es
in vec2 aCorner;
in vec4 aPosRow;                     // x, y, h, atlas row
in vec2 aAngN;                       // facing angle, atlas row count
out vec2 vUv; out float vDist;
uniform mat4 uVP; uniform vec3 uEye; uniform vec3 uRight;
void main(){
  // a real MÁV board sits parallel to the track, which from the cab is
  // edge-on and unreadable. Turn it to face the viewer instead: a game
  // convenience, and the only way the name is any use while moving.
  vec2 right = normalize(uRight.xz);
  float w = 4.6, h = 1.15;
  vec3 world = vec3(aPosRow.x + right.x * aCorner.x * w * 0.5,
                    aPosRow.z + aCorner.y * h * 0.5,
                    -aPosRow.y + right.y * aCorner.x * w * 0.5);
  vUv = vec2(aCorner.x * 0.5 + 0.5,
             (aPosRow.w + 1.0 - aCorner.y * 0.5) / aAngN.y);
  vDist = length(world - uEye);
  gl_Position = uVP * vec4(world, 1.0);
}`;

export const BOARD_FS = `#version 300 es
precision highp float;
in vec2 vUv; in float vDist; out vec4 fc;
uniform sampler2D uAtlas;
uniform vec3 uSunCol, uSkyCol, uFogCol;
uniform float uFogDensity;
void main(){
  vec3 c = texture(uAtlas, vUv).rgb;
  c *= (uSunCol * 0.55 + uSkyCol * 0.5 + 0.22);
  float f = 1.0 - exp(-vDist * uFogDensity);
  c = mix(c, uFogCol, clamp(f, 0.0, 1.0));
  fc = vec4(c, 1.0);
}`;


// The cab is geometry sitting in the world, not an overlay pinned to the
// screen. Look left and the pillar swings out of view; look down and you find
// the desk where you left it.
export const CAB_VS = `#version 300 es
in vec3 aPos; in vec3 aCol; in vec2 aUv;
out vec3 vCol; out vec2 vUv; out vec3 vWorld; out float vTex;
uniform mat4 uVP;
// Relative to the eye. The cab is centimetres from the camera and tens of
// kilometres from the origin, where a float resolves only a few millimetres:
// derivatives of absolute positions there are noise, and the walls speckled.
uniform vec3 uOrigin;
void main(){
  vCol = aCol; vUv = aUv; vWorld = aPos - uOrigin;
  vTex = aUv.x < -0.5 ? 0.0 : 1.0;      // negative uv marks plain surfaces
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

export const CAB_FS = `#version 300 es
precision highp float;
in vec3 vCol; in vec2 vUv; in vec3 vWorld; in float vTex;
out vec4 fc;
uniform sampler2D uPanel;
uniform vec3 uSunCol, uSkyCol, uSunDir;
// Flat shading from screen derivatives is free and correct — until a surface
// is nearly edge-on, and then it is neither. At a grazing angle one pixel
// spans many metres along the surface, dFdx and dFdy point almost the same
// way, and their cross product is a small number made mostly of rounding
// error: the normal lands somewhere different in every pixel, so a distant
// road or field breaks into random light and dark dots. That is the speckle
// over the roads in the middle distance — not z-fighting, which is what it
// looks like, and not the geometry, which is flat and correct.
//
// Where the two derivatives come within about two degrees of parallel their
// answer is noise, so take the fallback instead.
vec3 flatNormal(vec3 wpos, vec3 fallback) {
  vec3 dx = dFdx(wpos), dy = dFdy(wpos);
  vec3 c = cross(dx, dy);
  float a = length(c);
  float s = length(dx) * length(dy);
  if (a < 1e-9) return fallback;
  // blended, not switched. A hard cut-off flickers along the line where the
  // test changes its mind, which trades one speckle for another.
  float k = smoothstep(0.012, 0.075, a / max(s, 1e-9));
  return normalize(mix(fallback, c / a, k));
}
void main(){
  vec3 n = flatNormal(vWorld, vec3(0.0, 1.0, 0.0));
  float lam = 0.40 + 0.60 * max(dot(n, uSunDir), 0.0);
  // a cab is lit from inside as well as out, or it is a black box at dusk
  vec3 daylight = uSkyCol * 0.85 + uSunCol * 0.35;
  vec3 lamp = vec3(0.30, 0.27, 0.22);
  vec3 amb = daylight * lam + lamp;
  if (vTex > 0.5) {
    vec4 t = texture(uPanel, vUv);
    if (t.a < 0.02) discard;
    // the instruments are backlit, so they barely dim with the daylight
    fc = vec4(t.rgb * (0.80 + clamp(daylight.g, 0.0, 0.5) * 0.5), 1.0);
  } else {
    fc = vec4(vCol * amb * 1.35, 1.0);
  }
}`;


// ---------------------------------------------------------------- flood
// The Duna slider raises the river. The terrain rings already snap low
// ground to the new level, but the corridor along the railway (which is the
// riverbank for most of the line), the roads and the buildings are other
// meshes and stayed dry. So a raised river is also drawn as one sloped plane
// — level = a + b * north, which is exactly planar — depth-tested against
// the whole world: anything lower than the water is under it. Flood water on
// the Danube is brown, not blue.
export const FLOOD_VS = `#version 300 es
in vec2 aPos;
out vec3 vWorld; out float vDist;
uniform mat4 uVP; uniform vec3 uEye; uniform vec2 uWaterAB; uniform float uHalf;
void main(){
  vec2 xz = uEye.xz + aPos * uHalf;
  float y = uWaterAB.x + uWaterAB.y * (-xz.y) - 0.06;
  vWorld = vec3(xz.x, y, xz.y);
  vDist = length(vWorld - uEye);
  gl_Position = uVP * vec4(vWorld, 1.0);
}`;
export const FLOOD_FS = `#version 300 es
precision highp float;
in vec3 vWorld; in float vDist; out vec4 fc;
uniform vec3 uEye, uSunDir, uSunCol, uSkyCol, uFogCol;
uniform float uFogDensity, uTime, uDepthFade;
uniform sampler2D uReflect; uniform vec2 uViewport;
${WATER_GLSL}
void main(){
  // the same surface as the river, a little muddier: flood water carries silt
  vec3 col = waterSurface(vWorld, vDist, vec3(1.08, 1.02, 0.86), true);
  float f = 1.0 - exp(-vDist * uFogDensity);
  col = mix(col, uFogCol, clamp(f, 0.0, 1.0));
  fc = vec4(col, uDepthFade);
}`;


// Textured models, instanced (the road traffic's cars, tools/bake_models.py).
// Per instance: position, heading, length, atlas cell. A model is unit
// length facing +z; heading 0 faces north, like everything else.
export const MODEL_VS = `#version 300 es
layout(location = 0) in vec3 aPos; layout(location = 1) in vec2 aUv; layout(location = 2) in vec3 aNrm;
layout(location = 3) in vec4 aInst; layout(location = 4) in vec4 aInst2;
uniform mat4 uVP; uniform vec3 uEye; uniform vec2 uGrid; uniform float uPull;
out vec2 vUv; out vec3 vN; out vec3 vWorld; out float vDist;
void main(){
  float c = cos(aInst.w), s = sin(aInst.w);
  // model x maps to the car's LEFT: (x, y, z) → (left, up, forward) keeps
  // the model right-handed; mapping x to the right mirrored it inside out
  vec3 f = vec3(s, 0.0, -c), l = vec3(-c, 0.0, -s);
  vec3 p = aPos * aInst2.x;
  vec3 w = aInst.xyz + l * p.x + vec3(0.0, p.y, 0.0) + f * p.z;
  vN = l * aNrm.x + vec3(0.0, aNrm.y, 0.0) + f * aNrm.z;
  float cell = aInst2.y;
  vec2 cr = vec2(mod(cell, uGrid.x), floor(cell / uGrid.x));
  vUv = (cr + aUv) / uGrid;
  vWorld = w; vDist = length(w - uEye);
  w += (uEye - w) * uPull;
  gl_Position = uVP * vec4(w, 1.0);
}`;
export const MODEL_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vN; in vec3 vWorld; in float vDist;
out vec4 fc;
uniform sampler2D uTex;
uniform vec3 uSunDir, uSunCol, uSkyCol, uFogCol;
uniform float uFogDensity, uLift;
void main(){
  vec3 base = texture(uTex, vUv).rgb;
  base = pow(base, vec3(2.0));                 // the atlas is sRGB; light in linear-ish
  vec3 n = normalize(vN);
  float lam = max(dot(n, uSunDir), 0.0);
  vec3 col = base * (uSunCol * lam * 0.9 + uSkyCol * (0.55 + uLift * 0.38) + 0.06 + uLift * 0.085);
  float fg = 1.0 - exp(-vDist * uFogDensity);
  fc = vec4(mix(col, uFogCol, clamp(fg, 0.0, 1.0)), 1.0);
}`;
