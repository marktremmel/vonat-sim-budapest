// Where the sun is and what season it is — everything the sky and the
// ground read their colour from.
// --------------------------------------------------------------------- sun
/** Hungary keeps CEST from the last Sunday in March to the last Sunday in
 *  October — days 88 to 298 in 2026. Without allowing for it the clock runs an
 *  hour fast against the sun, which in July puts a 19:36 sun below the horizon
 *  when it should still be 8.4° up. Checked against SunCalc for Vác:
 *  ours 8.30°/292.99°, theirs 8.42°/292.87°, culmination 12:49 both. */
export function isSummerTime(dayOfYear) {
  return dayOfYear >= 88 && dayOfYear <= 298;
}

export function sunPosition(dayOfYear, hours, latDeg = 47.8, lonDeg = 18.95) {
  const rad = Math.PI / 180;
  if (isSummerTime(dayOfYear)) hours -= 1;
  const decl = 23.44 * rad * Math.sin(2 * Math.PI * (dayOfYear - 81) / 365);
  const B = 2 * Math.PI * (dayOfYear - 81) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const solar = hours + (lonDeg - 15) / 15 + eot / 60;       // CET standard meridian
  const H = (solar - 12) * 15 * rad;
  const lat = latDeg * rad;
  const alt = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H));
  let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));
  az += Math.PI;                                             // measured from north
  return { alt, az };
}

const HU_MONTHS = ["január","február","március","április","május","június",
                   "július","augusztus","szeptember","október","november","december"];
/** Day of year 1..365 as a calendar date. Non-leap, which is what the solar
 *  position code assumes as well. */
export function dateOfYear(day) {
  const len = [31,28,31,30,31,30,31,31,30,31,30,31];
  let d = Math.max(1, Math.min(365, Math.round(day))), m = 0;
  while (m < 11 && d > len[m]) { d -= len[m]; m++; }
  return { month: m + 1, day: d, name: HU_MONTHS[m],
           short: `${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
           hu: `${HU_MONTHS[m]} ${d}.` };
}

/**
 * The season as four numbers the shaders can use, from the day of the year.
 * Dates are for the Carpathian Basin, which is a good three weeks ahead of
 * northern Europe in spring and holds its leaves into November.
 *
 *   leaf   how much foliage a deciduous tree is carrying, 0 bare to 1 full
 *   autumn how far the colour has turned, 0 green to 1 gold and rust
 *   fresh  the light yellow-green of new growth, April into May
 *   crop   what is standing in the fields: 0 bare or ploughed, 0.5 green,
 *          1 ripe. Winter wheat is sown in October, green through the
 *          spring, ripe in the last week of June, cut in July, stubble
 *          through August, ploughed in September.
 */
export function seasonOf(day) {
  const d = ((day - 1) % 365 + 365) % 365 + 1;
  const ramp = (a, b) => Math.max(0, Math.min(1, (d - a) / (b - a)));
  const leaf = Math.min(ramp(84, 116), 1 - ramp(288, 320));      // 25 Mar – 16 Nov
  const autumn = Math.min(ramp(258, 292), 1 - ramp(300, 322)) * 1.0;
  const fresh = Math.min(ramp(88, 105), 1 - ramp(135, 158));
  let crop;
  if (d < 60) crop = 0.28;                       // winter wheat, low and green
  else if (d < 150) crop = 0.30 + ramp(60, 150) * 0.28;
  else if (d < 181) crop = 0.58 + ramp(150, 181) * 0.42;         // ripening
  else if (d < 205) crop = 1.0 - ramp(181, 205) * 0.88;          // cut
  else if (d < 250) crop = 0.12;                                 // stubble
  else if (d < 288) crop = 0.04;                                 // ploughed
  else crop = 0.04 + ramp(288, 320) * 0.24;                      // sown again
  return { leaf, autumn: Math.max(0, autumn), fresh, crop };
}

export function sunVector(alt, az) {
  // world: +x east, +y up, +z south (so north is -z)
  return [Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)];
}

const KEYS = [
  { a: -0.35, z: [0.038,0.052,0.092], h: [0.075,0.080,0.115], s: [0.05,0.06,0.10], g: [0.032,0.036,0.048], f: 0.00019 },
  { a: -0.12, z: [0.075,0.105,0.185], h: [0.250,0.180,0.180], s: [0.55,0.30,0.20], g: [0.062,0.066,0.082], f: 0.00021 },
  { a:  0.02, z: [0.140,0.205,0.355], h: [0.760,0.420,0.255], s: [1.35,0.66,0.32], g: [0.105,0.100,0.104], f: 0.00019 },
  { a:  0.10, z: [0.180,0.300,0.520], h: [0.880,0.620,0.420], s: [1.55,1.06,0.68], g: [0.110,0.100,0.090], f: 0.00013 },
  { a:  0.35, z: [0.230,0.400,0.680], h: [0.700,0.760,0.820], s: [1.35,1.24,1.08], g: [0.150,0.145,0.130], f: 0.000085 },
  { a:  0.90, z: [0.250,0.450,0.760], h: [0.680,0.780,0.870], s: [1.25,1.22,1.15], g: [0.170,0.170,0.160], f: 0.000065 },
];
const lerp3 = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

export function skyPalette(alt) {
  let i = 0;
  while (i < KEYS.length - 2 && alt > KEYS[i + 1].a) i++;
  const A = KEYS[i], B = KEYS[i + 1];
  const t = Math.max(0, Math.min(1, (alt - A.a) / (B.a - A.a)));
  return {
    zenith: lerp3(A.z, B.z, t), horizon: lerp3(A.h, B.h, t),
    sun: lerp3(A.s, B.s, t), ground: lerp3(A.g, B.g, t),
    fog: A.f + (B.f - A.f) * t,
  };
}
