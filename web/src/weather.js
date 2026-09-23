// ------------------------------------------------------------------ weather
import { CLOUD_BY_ID } from "./clouds.js";

// Central European weather situations. The cloud atlas in clouds.js is the
// vocabulary — the ten base types at their real heights; this is the grammar.
// A situation says which decks are present, how much of the sky they cover,
// how dark they are, what falls out of them, how hard the wind blows and how
// far you can see. Everything downstream is driven from here.
//
// The situations are the ones the Carpathian Basin actually gets, named the
// way a Hungarian forecast names them, with the synoptic cause noted. The
// extremes are included because they are the interesting ones to drive in.
//
// precip kinds: 0 none · 1 eső rain · 2 hó snow · 3 havas eső sleet
//               4 szitálás drizzle · 5 jégeső hail · 6 ónos eső freezing rain
export const PRECIP = ["", "eső", "hó", "havas eső", "szitálás", "jégeső", "ónos eső"];
export const PRECIP_EN = ["", "rain", "snow", "sleet", "drizzle", "hail", "freezing rain"];

// wind: [bearing the wind blows FROM in degrees, mean m/s, gust factor]
// precip: [kind, rate 0..1]
// ground: [wet 0..1, lying snow 0..1]
// vis: meteorological visual range in metres — the distance at which contrast
//   falls to 5%, which is the definition a forecast uses. The fog density the
//   shaders want is 3.0 / vis, so this is not a dial, it is the number.
export const SITUATIONS = [
  {
    id: "derult", hu: "Derült ég", en: "clear",
    syn: "anticiklon — magasnyomás a Kárpát-medence fölött, felhőtlen",
    low: null, high: null,
    gloom: 0.0, wind: [315, 2.4, 1.3], precip: [0, 0],
    sun: 1.0, vis: 35000, ground: [0, 0], storm: 0, tempC: [3, 27],
  },
  {
    id: "anticiklon", hu: "Nyári anticiklon", en: "summer high",
    syn: "gyenge nyomási mező, délutáni gomolyokkal",
    low: "cu", lowAmt: 0.34, high: "ci", highAmt: 0.30,
    gloom: 0.05, wind: [300, 3.2, 1.5], precip: [0, 0],
    sun: 0.97, vis: 14000, ground: [0, 0], storm: 0, tempC: [8, 31],
  },
  {
    id: "gomolyos", hu: "Gomolyfelhős délután", en: "fair-weather cumulus",
    syn: "labilis, de száraz levegő — gomolyok a napi menetben",
    low: "cu", lowAmt: 0.58, high: "ci", highAmt: 0.22,
    gloom: 0.12, wind: [290, 5.0, 1.8], precip: [0, 0],
    sun: 0.92, vis: 22000, ground: [0, 0], storm: 0, tempC: [6, 26],
  },
  {
    id: "zapor", hu: "Záporos, hidegfront mögött", en: "post-frontal showers",
    syn: "hidegfront mögötti labilis levegő, zápor és napsütés váltakozva",
    low: "cu", lowAmt: 0.72, lowBuild: 1.5, high: "ci", highAmt: 0.35,
    gloom: 0.45, wind: [305, 8.5, 2.4], precip: [1, 0.45],
    sun: 0.62, vis: 12000, ground: [0.7, 0], storm: 0.05, tempC: [4, 19],
  },
  {
    id: "zivatar", hu: "Hidegfronti zivatar", en: "frontal thunderstorm",
    syn: "vonalba rendeződött zivatarlánc, széllökés, felhőszakadás",
    low: "cb", lowAmt: 0.88, high: "cs", highAmt: 0.85,
    gloom: 0.82, wind: [285, 13.0, 3.2], precip: [1, 0.85],
    sun: 0.20, vis: 4000, ground: [1.0, 0], storm: 1.0, tempC: [8, 22],
  },
  {
    id: "szupercella", hu: "Szupercella", en: "supercell",
    syn: "forgó zivatarcella — jégeső, kifutószél, nappali sötétedés",
    low: "cb", lowAmt: 1.0, high: "cs", highAmt: 1.0,
    gloom: 1.0, wind: [250, 20.0, 4.0], precip: [5, 1.0],
    sun: 0.07, vis: 1200, ground: [1.0, 0], storm: 1.6, tempC: [9, 21],
  },
  {
    id: "melegfront", hu: "Melegfronti esőzés", en: "warm-front rain",
    syn: "Ci → Cs → As → Ns — a klasszikus felhőzeti sorrend, tartós eső",
    low: "ns", lowAmt: 1.0, high: "as", highAmt: 0.9,
    gloom: 0.72, wind: [140, 5.5, 1.6], precip: [1, 0.55],
    sun: 0.16, vis: 5000, ground: [1.0, 0], storm: 0.02, tempC: [4, 17],
  },
  {
    id: "mediterran", hu: "Mediterrán ciklon", en: "Genoa low",
    syn: "genovai ciklon — kiadós, hosszan tartó csapadék keletről",
    low: "ns", lowAmt: 1.0, high: "as", highAmt: 1.0,
    gloom: 0.80, wind: [60, 9.0, 2.0], precip: [1, 0.75],
    sun: 0.10, vis: 3500, ground: [1.0, 0], storm: 0.05, tempC: [2, 14],
  },
  {
    id: "szitalas", hu: "Szitálás, borongás", en: "grey drizzle",
    syn: "alacsony rétegfelhőzet a hideg párnában, ólmos szürkeség",
    low: "st", lowAmt: 1.0, high: null,
    gloom: 0.58, wind: [200, 3.0, 1.3], precip: [4, 0.30],
    sun: 0.20, vis: 4000, ground: [0.9, 0], storm: 0, tempC: [1, 13],
  },
  {
    id: "kod", hu: "Anticiklonális köd", en: "inversion fog",
    syn: "téli magasnyomás, tartós inverzió — 200 m-es látás egész nap",
    low: "st", lowAmt: 1.0, high: null,
    gloom: 0.52, wind: [180, 1.0, 1.1], precip: [0, 0],
    sun: 0.08, vis: 250, ground: [0.6, 0.1], storm: 0, tempC: [-3, 4],
  },
  {
    id: "havazas", hu: "Havazás", en: "steady snow",
    syn: "hótakaró képződik — egyenletes, sűrű hullás gyenge szélben",
    low: "ns", lowAmt: 1.0, high: "as", highAmt: 0.8,
    gloom: 0.55, wind: [30, 4.0, 1.5], precip: [2, 0.60],
    sun: 0.22, vis: 2500, ground: [0.2, 0.85], storm: 0, tempC: [-4, 0],
  },
  {
    id: "hofuvas", hu: "Hófúvás", en: "blizzard",
    syn: "erős északkeleti szél és sűrű havazás — hóátfúvás a bevágásokban",
    low: "ns", lowAmt: 1.0, high: "as", highAmt: 1.0,
    gloom: 0.68, wind: [40, 17.0, 3.0], precip: [2, 1.0],
    sun: 0.12, vis: 400, ground: [0.1, 1.0], storm: 0, tempC: [-9, -3],
  },
  {
    id: "onos", hu: "Ónos eső", en: "freezing rain",
    syn: "meleg réteg fagyos párna fölött — mindenre üvegréteg fagy",
    low: "ns", lowAmt: 1.0, high: "as", highAmt: 0.9,
    gloom: 0.66, wind: [110, 6.0, 1.8], precip: [6, 0.45],
    sun: 0.14, vis: 4000, ground: [1.0, 0.25], storm: 0, tempC: [-2, 1],
  },
  {
    id: "szahara", hu: "Szaharai por", en: "Saharan dust",
    syn: "déli áramlás sivatagi porral — tejszerű ég, vörhenyes nap",
    low: "ac", lowAmt: 0.45, high: "cs", highAmt: 0.55,
    gloom: 0.10, wind: [170, 6.5, 1.7], precip: [0, 0],
    sun: 0.72, vis: 8000, ground: [0, 0], storm: 0,
    tint: [1.16, 0.96, 0.72], tempC: [11, 33],
  },
  {
    id: "oszi", hu: "Őszi párásság", en: "autumn haze",
    syn: "reggeli pára a Duna fölött, délre feloszló rétegfelhővel",
    low: "sc", lowAmt: 0.75, high: null,
    gloom: 0.30, wind: [230, 2.0, 1.2], precip: [0, 0],
    sun: 0.55, vis: 6000, ground: [0.35, 0], storm: 0, tempC: [2, 15],
  },
];

export const SIT_BY_ID = Object.fromEntries(SITUATIONS.map(s => [s.id, s]));

// Per cloud type: how the deck behaves as weather rather than as a portrait.
// gloom scales the type's own darkness, veil is how much rain hangs beneath
// it, pannus the ragged scud that forms under a raining base, anvil the
// downwind cirrus shield a Cb throws off at the tropopause.
const MOOD = {
  clear: [0, 0, 0, 0],
  cu:    [0.10, 0.05, 0.00, 0.00],
  sc:    [0.28, 0.06, 0.05, 0.00],
  st:    [0.34, 0.10, 0.10, 0.00],
  ac:    [0.16, 0.02, 0.00, 0.00],
  as:    [0.30, 0.18, 0.02, 0.00],
  ci:    [0.02, 0.00, 0.00, 0.00],
  cc:    [0.06, 0.00, 0.00, 0.00],
  cs:    [0.05, 0.00, 0.00, 0.00],
  ns:    [0.90, 0.85, 0.65, 0.00],
  cb:    [0.95, 1.00, 0.55, 0.90],
};

const clamp01 = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;

/** Beaufort force for a mean wind in m/s — the scale is defined on it. */
export function beaufort(ms) {
  const B = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  let f = 0; while (f < B.length && ms >= B[f]) f++;
  return f;
}
const COMPASS = ["É", "ÉÉK", "ÉK", "KÉK", "K", "KDK", "DK", "DDK",
                 "D", "DDNy", "DNy", "NyDNy", "Ny", "NyÉNy", "ÉNy", "ÉÉNy"];
export function compass(deg) { return COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]; }

/**
 * Resolve a situation and an intensity into everything the frame needs.
 *
 * `intensity` is the strength of the situation, not its brightness: at 0.3 the
 * same cold front gives broken cloud and a passing shower, at 1.8 it gives a
 * closed base, a black underside and a downpour. Coverage, thickness, gloom,
 * rain rate, wind and visibility all move together, which is what "harder"
 * actually means in the sky.
 */
export function resolveWeather(sitId, intensity, day, cloudOverride) {
  const s = SIT_BY_ID[sitId] || SITUATIONS[0];
  const k = Math.max(0, intensity);
  // below 1 the situation weakens, above 1 it deepens; neither runs away
  const up = Math.min(1, Math.max(0, k - 1));          // 0..1 above nominal
  const dn = Math.min(1, Math.max(0, 1 - k));          // 0..1 below nominal

  const low = cloudOverride || s.low;
  const gloom = clamp01(s.gloom * (1 - dn * 0.8) + up * (1 - s.gloom) * 0.75);
  const rate = clamp01(s.precip[1] * (1 - dn * 0.9) * (1 + up * 0.9));
  const kind = rate > 0.01 ? s.precip[0] : 0;
  const windSpeed = s.wind[1] * (1 - dn * 0.55) * (1 + up * 0.7);

  // the year's temperature swing: coldest around mid-January, warmest mid-July
  const season = 0.5 - 0.5 * Math.cos((day - 15) / 365 * Math.PI * 2);

  return {
    sit: s, intensity: k,
    lowId: low, lowAmt: (s.lowAmt != null ? s.lowAmt : 1) * (1 - dn * 0.6) * (1 + up * 0.45),
    highId: s.high, highAmt: (s.highAmt || 0) * (1 - dn * 0.5) * (1 + up * 0.3),
    lowBuild: s.lowBuild || 1,
    gloom,
    mood: MOOD[low] || MOOD.clear,
    moodHigh: MOOD[s.high] || MOOD.clear,
    wind: { from: s.wind[0], speed: windSpeed, gust: s.wind[2],
            beaufort: beaufort(windSpeed) },
    precip: { kind, rate },
    sun: clamp01(lerp(1, s.sun, clamp01(k))),
    // a weakening situation clears; a deepening one closes in
    vis: s.vis * (1 + dn * 2.2) / (1 + up * 1.1),
    wet: clamp01(s.ground[0] * Math.min(1, k * 1.1)),
    snow: clamp01(s.ground[1] * Math.min(1, k * 1.1)),
    storm: s.storm * (1 - dn) * (1 + up * 1.2),
    tint: s.tint || [1, 1, 1],
    tempC: lerp(s.tempC[0], s.tempC[1], season),
  };
}

/** The wind as a unit vector in world axes — x east, z south. */
export function windVector(fromDeg) {
  const to = (fromDeg + 180) * Math.PI / 180;    // blowing towards
  return [Math.sin(to), -Math.cos(to)];          // north is -z, so towards-north is -z
}

/**
 * Overcast is not the same sky made darker; it is a different sky. Thick
 * cloud kills the direct beam, so the sun colour collapses towards the
 * ambient, the zenith loses its blue, and the horizon goes the colour of the
 * cloud base. Doing this to the palette rather than in the shader keeps
 * everything — terrain, buildings, water, fog — consistent for free.
 */
export function weatherPalette(pal, wx, trim = 1) {
  const g = wx.gloom, t = wx.tint;
  // 3/vis is the extinction the stated visual range implies. The palette's own
  // curve is kept as a floor so a clear night still has some depth to it.
  const fogK = Math.max(pal.fog * 0.75, 3.0 / Math.max(wx.vis, 60)) * trim;
  const mixv = (a, b, m) => [lerp(a[0],b[0],m), lerp(a[1],b[1],m), lerp(a[2],b[2],m)];
  const lum = (pal.sun[0] + pal.sun[1] + pal.sun[2]) / 3;
  // the light that gets through a closed base: grey, and much less of it
  const dull = [lum * 0.55, lum * 0.57, lum * 0.60];
  const sun = mixv(pal.sun, dull, g).map((v, i) => v * wx.sun * t[i]);
  // under cloud the sky dome is the cloud base, and it is not blue
  const slate = [0.30 + 0.22 * lum, 0.32 + 0.22 * lum, 0.35 + 0.23 * lum];
  const murk  = [0.20 + 0.30 * lum, 0.21 + 0.30 * lum, 0.23 + 0.31 * lum];
  const zenith = mixv(pal.zenith, mixv(slate, murk, g), g * 0.92);
  const horizon = mixv(pal.horizon, mixv(slate, murk, g * 0.7), g * 0.88);
  // snow lying about throws light back up: the underside of the world lifts
  const ground = mixv(pal.ground, [0.72, 0.76, 0.82], wx.snow * 0.7);
  // In fog you cannot see the sky, because the fog *is* the sky: at two
  // hundred metres of visibility there is nothing overhead but more of what
  // is in front of you. Pull the dome onto the horizon colour rather than
  // leaving a clear blue lid over a world that has dissolved.
  const obscure = clamp01(1 - wx.vis / 3000) * 0.94;
  const zen = mixv(zenith, horizon, obscure);
  return {
    zenith: zen.map((v, i) => v * t[i]),
    horizon: horizon.map((v, i) => v * t[i]),
    ground: mixv(ground, horizon, obscure * 0.8),
    sun,
    fog: fogK,
    ambient: 0.055 + g * 0.10 + wx.snow * 0.06,
  };
}

/**
 * The two decks and their moods, ready for the sky shader.
 *
 * The cloud atlas gives the portrait of each type; the situation says how
 * much of it there is and how hard it is working. Coverage, thickness, gloom,
 * the rain hanging beneath and the scud beneath that all rise together with
 * the intensity, because that is what a deepening situation actually does.
 */
export function weatherDecks(wx) {
  const lo = CLOUD_BY_ID[wx.lowId] || CLOUD_BY_ID.clear;
  const hi = wx.highId ? CLOUD_BY_ID[wx.highId] : null;
  const rate = wx.precip.rate;

  const a = lo.deck.slice(), aShape = lo.shape.slice();
  a[2] = clamp01(lo.deck[2] * wx.lowAmt);
  a[3] = clamp01(lo.deck[3] * Math.min(1.15, 0.62 + wx.lowAmt * 0.5));
  aShape[2] *= wx.lowBuild;
  const m = wx.mood;
  const aMood = [
    clamp01(wx.gloom * (0.40 + 0.80 * m[0])),
    clamp01(m[1] * (0.20 + 1.4 * rate)),
    clamp01(m[2] * (0.25 + 1.2 * rate)),
    clamp01(m[3] * Math.min(1, wx.storm)),
  ];

  let b = [9000, 3000, 0, 0], bShape = [0, 0, 0, 0], bMood = [0, 0, 0, 0];
  if (hi && wx.highAmt > 0.01) {
    b = hi.deck.slice(); bShape = hi.shape.slice();
    b[2] = clamp01(hi.deck[2] * Math.min(1.4, wx.highAmt));
    b[3] = clamp01(hi.deck[3] * Math.min(1.2, 0.5 + wx.highAmt * 0.7));
    const mh = wx.moodHigh;
    bMood = [clamp01(wx.gloom * (0.20 + 0.60 * mh[0])), 0, 0,
             clamp01(aMood[3])];      // the anvil belongs to the tower below
  }
  const w = windVector(wx.wind.from);
  return {
    a, aShape, aMood, b, bShape, bMood,
    wind: [w[0], wx.wind.speed, w[1], 0.25],
    // the low deck's field, so the anvil can be tied to the cell that feeds it
    anvil: [a[0], a[1], a[2], aShape[0]],
  };
}

/**
 * How fast the particles are actually moving past the cab: the fall speed,
 * the wind and the train's own velocity, added up. Rain seen from a moving
 * train never falls vertically, and the faster you go the flatter it lies.
 */
export function precipVelocity(wx, trainVel) {
  const fall = wx.precip.kind === 2 ? 1.1          // snow, a metre a second
             : wx.precip.kind === 4 ? 2.2          // drizzle barely falls
             : wx.precip.kind === 5 ? 16.0         // hail comes down hard
             : 7.5 + wx.precip.rate * 3.0;         // rain
  const w = windVector(wx.wind.from);
  const gust = 1 + (wx.wind.gust - 1) * 0.4;
  return [w[0] * wx.wind.speed * gust - trainVel[0],
          -fall,
          w[1] * wx.wind.speed * gust - trainVel[2]];
}

/** The visual range a fog density implies, in metres — the inverse of 3/vis. */
export function visibilityOf(fogK) { return 3.0 / Math.max(fogK, 1e-9); }

/** Visual range as a forecast would say it. */
export function fmtVis(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m`
       : m < 10000 ? `${(m / 1000).toFixed(1)} km`
                   : `${Math.round(m / 1000)} km`;
}

// ---------------------------------------------------------------- fronts
//
// Until now one situation covered all sixty-two kilometres at once and never
// changed unless you changed it: you could drive from Budapest to the border
// through weather that was the same everywhere and the same for ever. Real
// weather has an EDGE, and it moves — that is the whole of what a front is,
// and it is the first item on Mark's list.
//
// The mechanism is deliberately small. A front is a chainage, a speed, and
// the two situations either side of it. Everything the sky, the ground, the
// audio and the train resistance read comes off one resolved object, so if
// that object is a blend of two situations at your own position, all of it
// follows for free and no downstream code knows the difference.
//
// What blends and what does not: the numbers blend — coverage, gloom, rain
// rate, wind, visibility, wetness, temperature — and the CATEGORIES do not.
// A sky cannot be half stratus and half cumulus, and rain cannot be half snow,
// so the deck types and the precipitation kind come from whichever side has
// the greater weight. Cross the line and they change over; the numbers have
// already carried you most of the way there, so it does not read as a switch.

const FRONT_WIDTH = 5200;        // metres from all-A to all-B

export function blendWeather(a, b, t) {
  if (t <= 0.001) return a;
  if (t >= 0.999) return b;
  const L = (x, y) => x + (y - x) * t;
  const dom = t < 0.5 ? a : b;               // the categorical side
  return {
    sit: dom.sit, intensity: L(a.intensity, b.intensity),
    lowId: dom.lowId, lowAmt: L(a.lowAmt, b.lowAmt),
    highId: dom.highId, highAmt: L(a.highAmt, b.highAmt),
    lowBuild: L(a.lowBuild, b.lowBuild),
    gloom: L(a.gloom, b.gloom),
    mood: dom.mood, moodHigh: dom.moodHigh,
    wind: { from: L(a.wind.from, b.wind.from), speed: L(a.wind.speed, b.wind.speed),
            gust: L(a.wind.gust, b.wind.gust),
            beaufort: beaufort(L(a.wind.speed, b.wind.speed)) },
    // rain does not fade into snow: the kind is the dominant side's, and only
    // the rate crosses over
    precip: { kind: dom.precip.kind, rate: L(a.precip.rate, b.precip.rate) },
    sun: L(a.sun, b.sun),
    // visibility crosses in reciprocal, because that is what fog density is
    vis: 1 / L(1 / Math.max(1, a.vis), 1 / Math.max(1, b.vis)),
    wet: L(a.wet, b.wet), snow: L(a.snow, b.snow),
    storm: L(a.storm, b.storm),
    tint: [L(a.tint[0], b.tint[0]), L(a.tint[1], b.tint[1]), L(a.tint[2], b.tint[2])],
    tempC: L(a.tempC, b.tempC),
    frontMix: t,
  };
}

/**
 * The weather where you are standing.
 *
 * The naming is the meteorologists': the air BEHIND a front is the new air it
 * is bringing, and the air AHEAD of it is the old air being pushed out. So for
 * a front travelling toward Szob, "behind" is on the Budapest side — the side
 * it has already passed — and that is the side whose weather has arrived.
 * Getting this the wrong way round puts the new sky in front of the front,
 * which is a wall of rain retreating from you at forty kilometres an hour.
 *
 * @param front  { km, speed, newId, oldId } or null for one flat sky. `km` is
 *               where the edge is now; `speed` is metres a second along the
 *               line, positive toward Szob.
 * @param atKm   your own chainage in metres.
 */
export function weatherAt(front, sitId, intensity, day, cloudOverride, atKm) {
  if (!front) return resolveWeather(sitId, intensity, day, cloudOverride);
  const oldAir = resolveWeather(front.oldId, intensity, day, cloudOverride);
  const newAir = resolveWeather(front.newId, intensity, day, cloudOverride);
  const dir = front.speed >= 0 ? 1 : -1;
  // 1 where the new air has fully arrived, 0 where it has not reached at all
  const t = clamp01(0.5 - dir * (atKm - front.km) / FRONT_WIDTH);
  return blendWeather(oldAir, newAir, t);
}

/** A situation the Carpathian Basin actually gets at this time of year,
 *  weighted by how often. Uniform picking gave blizzards in July. */
export function pickSituation(day, avoid) {
  const summer = day > 140 && day < 260, winter = day < 60 || day > 330;
  const W = summer
    ? { derult: 2, anticiklon: 3, gomolyos: 4, zapor: 2, zivatar: 1.4, szupercella: 0.3,
        melegfront: 0.8, szahara: 0.5, szitalas: 0.5 }
    : winter
    ? { havazas: 2, hofuvas: 0.4, onos: 0.6, kod: 2, szitalas: 1.5, derult: 1.2,
        mediterran: 1, melegfront: 0.8 }
    : { gomolyos: 2, zapor: 2, melegfront: 1.8, mediterran: 1, szitalas: 1.6, derult: 1.5,
        kod: day > 260 ? 1.2 : 0.3, oszi: day > 260 ? 2 : 0, anticiklon: 1, zivatar: 0.5 };
  let tot = 0;
  for (const k in W) if (k !== avoid) tot += W[k];
  let r = Math.random() * tot;
  for (const k in W) { if (k === avoid) continue; r -= W[k]; if (r <= 0) return k; }
  return "gomolyos";
}

/** A front that will reach chainage `atM` in a few minutes: its edge starts
 *  `dist` metres away on the side it comes from. `fromId` is the air you are
 *  in now (ahead of the front), and the new air comes in behind it. */
export function queueFront(fromId, atM, day, dist) {
  const dir = Math.random() < 0.5 ? 1 : -1;
  return { km: atM - dir * dist, speed: dir * (9 + Math.random() * 9),   // 30–65 km/h
           oldId: fromId, newId: pickSituation(day, fromId) };
}

/**
 * Move the front. Once you are well inside the new air, that air is the new
 * baseline and the next front is queued some kilometres off, so the sky keeps
 * turning every quarter of an hour or so, wherever on the line you are.
 * (It used to restart from the far end of the whole line: an hour and more
 * between changes, which in a play session is never.)
 */
export function stepFront(front, dt, atM, day = 200) {
  if (!front) return null;
  front.km += front.speed * dt;
  const dir = front.speed >= 0 ? 1 : -1;
  const behind = dir * (front.km - atM);            // how far the edge has gone past you
  if (behind > FRONT_WIDTH * 1.2)
    return queueFront(front.newId, atM, day, 9000 + Math.random() * 12000);
  // jumped far down the line, or outran it: bring it back into play
  if (behind < -40000) return queueFront(front.oldId, atM, day, 9000 + Math.random() * 12000);
  return front;
}
