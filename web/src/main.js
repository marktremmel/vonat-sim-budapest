import * as S from "./shaders.js";
import { Sound } from "./audio.js";
import { drawPanel } from "./panel.js";
import { buildLandmarks, buildTrainsheds, setLandmarkWater } from "./landmarks.js";
import { buildParts } from "./parts.js";
import { CityTiles, metresPerDegree } from "./city.js";
import { Solids } from "./collide.js";
import { makeCar, stepCar, carGeometry } from "./car.js";
import { drawInstruments, buildCab } from "./cab.js";
import { CLOUD_TYPES } from "./clouds.js";
import { SITUATIONS, resolveWeather, weatherAt, stepFront, weatherPalette, weatherDecks,
         precipVelocity, windVector, compass, visibilityOf, fmtVis,
         PRECIP, PRECIP_EN, pickSituation, queueFront } from "./weather.js";
import { compile, texFromImage, gridMesh, M4, norm, cross, add, scale, sub } from "./engine.js";
import { LAYERS, drawHud, isAuthenticStreetOrSquare } from "./hud.js";
import { installInput } from "./input.js";
import { Route, Driver, KISS, STOCKS, LEVER_MAX } from "./route.js";
import { UNIFIED_FRAME, localToUnified, unifiedToLocal, geoToUnified, unifiedToGeo, MultiRoute, LINE_OFFSETS } from "./unified.js";
import { AirTraffic, makePlane, stepPlane, buildAircraft, buildCockpit, PLANES } from "./aircraft.js";
import { buildPOIs, pickPOI, stepDirector } from "./tour.js";
import { sunPosition, sunVector, skyPalette, dateOfYear, seasonOf } from "./env.js";
import { buildCityExtras, buildParkThings, setNoPierAt } from "./geom.js";
import { buildTrack, buildCorridor, buildRoads, unpackBuildings, unpackRoads,
         unpackPolyBuildings, buildPolyBuildings, buildWalls, graffitiSpots, prepareUnderpasses, unpackRails, buildYardTracks,
         boxMesh, buildStations, boardAtlas, buildSignals, buildCrossings,
         buildPlatformPeople, buildPlatformLamps,
         buildBufferStops, roadSurfaceAt, underpassDip, setShoulders,
         osmPlatformSections, buildFootbridges, buildWalkers, buildHorses } from "./geom.js";
import { buildTrains, CAR_LEN, carLayout } from "./trains.js";
import { TrainWreck, trackGround } from "./wreck.js";
import { buildCatenary, buildYardWires } from "./catenary.js";
import { unpackStructures, buildStructures } from "./structures.js";
import { Traffic, ASPECT, ASPECT_NAME, RoadTraffic, buildRoadTraffic, buildTrafficLights, RT_SPRAY,
         danubeLane, RiverTraffic, buildRiverTraffic } from "./traffic.js";
import { bindSettings, loadPrefs, savePrefs } from "./settings.js";
import { RunScore, CATS, starsFor } from "./score.js";
import { MISSIONS, TIERS, totalStars, renderMissions, scorecardHTML, starStr, dailyMission, DISPATCH, mTitle, tierName } from "./missions.js";
import { tt, LANG } from "./i18n.js";
import { buildHeart, buildBulbs } from "./easter.js";
import { initPhotoFx } from "./photofx.js";
import { Kisvasut } from "./kisvasut.js";
import { Particles, VFX_MAX, Murmuration } from "./vfx.js";
import { Trams } from "./trams.js";

const RES = { w: 512, h: 288 };            // internal render size, upscaled
// nested square annuli: each ring has a hole exactly filled by the finer one,
// so the plane is tiled once and ordinary depth testing sorts everything
const RINGS = [
  { half: 1600,  n: 192, hole: 0 },        // ~17 m cells
  { half: 6400,  n: 176, hole: 0.25 },     // ~73 m
  { half: 26000, n: 144, hole: 0.246 },    // ~361 m
];


const state = {
  hour: 19.4, day: 200, speedMul: 1, paused: false,
  yaw: 0, pitch: -0.02, fov: 78, manual: false, labels: true, follow: false,
  fog: 1.0, zoom: 1.0, map: false, layer: 0, followIdx: -1, followCarIdx: -1, followShipIdx: -1, menu: true,
  drone: { p: [0, 150, 0], v: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, active: false },
  sound: false, lateness: null, panel: false, cab: true,
  wxId: "gomolyos", wxInt: 1.0, cloudType: "", wxT: 0, precipT: 0,
  flash: 0, flashPulses: [], strike: null, wiper: 0, wiperAuto: true, volume: 0.7,
  exposure: 1.35, bloom: 0.5, lights: 1, night: 0, hornMode: 0, danube: 0,
  grain: 0.35, chroma: 0.40, vignette: 0.28,
  precipOff: [0, 0, 0],
  panelView: { zoom: 1, pan: 0 },
  sharp: 1.4,                       // internal resolution multiplier
  cine: "off", cineRate: 1.6,      // the animator: what drifts, and how fast
  bare: false,                      // panel and read-outs hidden
  show: { sky: true, terrain: true, track: true, veg: true,
          buildings: true, roads: true, catenary: true, structs: true,
          polys: true, boxes: true },
};

function fmtTime(h) {
  const t = ((h % 24) + 24) % 24;
  return String(Math.floor(t)).padStart(2, "0") + ":" +
         String(Math.floor((t % 1) * 60)).padStart(2, "0");
}

/** This used to await `img.decode()`. Chromium never settles that promise
 *  while the document is hidden — not rejects, never settles — so a build
 *  opened in a background tab sat on a blank screen for ever with no error
 *  to show for it. The load event fires either way, and an image that has
 *  loaded is perfectly good enough to hand to texImage2D. */
async function loadImage(src) {
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("image failed to load: " + src.slice(0, 40)));
    img.src = src;
  });
  return img;
}

export async function boot(assets) {
  const t0 = performance.now();
  // the loading screen's bar (index.html): 70% was the download; each step
  // here yields once so the bar can repaint between the long builds
  const step = async (text, f) => {
    if (window.__loadStep) window.__loadStep(text, f);
    // memory at each step, for the console (window.__bootMem): Chrome only
    if (performance.memory) (window.__bootMem = window.__bootMem || []).push([text, Math.round(performance.memory.usedJSHeapSize / 1e6)]);
    // (a hidden tab gets its timers throttled to one a minute: no bar to
    // repaint there anyway, so no yield)
    if (!document.hidden) await new Promise(r => setTimeout(r, 0));
  };
  await step(tt("textúrák", "textures"), 0.71);
  const world = assets.world, routeData = assets.route;
  const cv = document.getElementById("gl");
  const gl = cv.getContext("webgl2", { antialias: false, depth: true });
  if (!gl) { document.getElementById("err").textContent =
    "This needs WebGL2. Try a different browser."; return; }

  const hud = document.getElementById("hud");
  const hx = hud.getContext("2d");
  const [imgNear, imgFar, imgCover, imgMap] = await Promise.all([
    loadImage(assets.heightNear), loadImage(assets.heightFar),
    loadImage(assets.coverNear), loadImage(assets.map),
  ]);
  const mapMeta = assets.mapMeta;
  // lat/lon → this line's [east, north] metres (every line has its own frame)
  const geoToFrame = (() => {
    const nr = assets.world.near, [mlat, mlon] = metresPerDegree(nr.frame_lat ?? (nr.south + nr.north) / 2);
    return (lat, lon) => [(lon - nr.west) * mlon, (lat - nr.south) * mlat];
  })();
  const texNear = texFromImage(gl, imgNear, { filter: gl.LINEAR });
  const texFar = texFromImage(gl, imgFar, { filter: gl.LINEAR });
  const texCover = texFromImage(gl, imgCover, { filter: gl.NEAREST });

  const route = new Route(routeData);
  const driver = new Driver(route, KISS);
  driver.m = route.m0 + 60;

  // ---- programs
  const pSky = compile(gl, S.SKY_VS, S.SKY_FS);
  const pTer = compile(gl, S.TERRAIN_VS, S.TERRAIN_FS);
  const pTrk = compile(gl, S.TRACK_VS, S.TRACK_FS);
  const pVeg = compile(gl, S.VEG_VS, S.VEG_FS);
  const pTree = compile(gl, S.TREE_VS, S.VEG_FS);     // the cadastre's trees, one instance each
  // particles (vfx.js): one instanced draw of camera-facing quads
  const pVfx = compile(gl, S.VFX_VS, S.VFX_FS);
  const vfx = new Particles();
  let murm = null;                                 // the Kispest starlings (vfx.js Murmuration)
  const vfxVao = gl.createVertexArray();
  const vfxInst = gl.createBuffer();
  {
    gl.bindVertexArray(vfxVao);
    const q = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, q);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, vfxInst);
    gl.bufferData(gl.ARRAY_BUFFER, VFX_MAX * 12 * 4, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 48, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
  }
  const pBld = compile(gl, S.BLDG_VS, S.BLDG_FS);
  const pBrd = compile(gl, S.BOARD_VS, S.BOARD_FS);
  const pCab = compile(gl, S.CAB_VS, S.CAB_FS);
  const pPre = compile(gl, S.PRECIP_VS, S.PRECIP_FS);
  const pFlood = compile(gl, S.FLOOD_VS, S.FLOOD_FS);
  const floodVao = gl.createVertexArray();
  gl.bindVertexArray(floodVao);
  const floodBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, floodBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const pGls = compile(gl, S.GLASS_VS, S.GLASS_FS);
  const pBlit = compile(gl, S.BLIT_VS, S.BLIT_FS);
  const pBright = compile(gl, S.BLIT_VS, S.BRIGHT_FS);
  const pBlur = compile(gl, S.BLIT_VS, S.BLUR_FS);
  // The façade atlas (tools/bake_facades.py), mip-mapped, on texture unit 6
  // for good: only the two building programs read it, and nothing else uses
  // that unit. A grey pixel if it is missing.
  {
    const ft = gl.createTexture();
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, ft);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 196, 188, 255]));
    try {
      const img = await loadImage((window.DATA_BASE || "data/") + "facades.webp");
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, ft);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    } catch (e) { console.warn("no façade atlas", e); }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    for (const p of [pTrk, pBld]) { gl.useProgram(p.p); if (p.u.uFacTex) gl.uniform1i(p.u.uFacTex, 6); }
    gl.useProgram(null);
  }

  await step(tt("terep és pálya", "terrain and track"), 0.74);
  // ---- geometry
  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(quadVao);
  const qb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // one quad, drawn once per drop
  const dropVao = gl.createVertexArray();
  gl.bindVertexArray(dropVao);
  const dropBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dropBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(
    [-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const PRECIP_BOX = 26;                 // half-extent of the drop box, metres
  const PRECIP_MAX = 22000;              // drops at rate 1.0
  const rings = RINGS.map(r => ({ ...r, mesh: gridMesh(gl, r.n, r.hole) }));

  const vegVao = gl.createVertexArray();
  gl.bindVertexArray(vegVao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  // Three quads 60° apart (18 vertices). Two at 90° read as a paper X up
  // close and a star from above; three read as a round crown and trunk.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, 0, 0,   1, 0, 0,   1, 1, 0,  -1, 0, 0,   1, 1, 0,  -1, 1, 0,
    -1, 0, 1,   1, 0, 1,   1, 1, 1,  -1, 0, 1,   1, 1, 1,  -1, 1, 1,
    -1, 0, 2,   1, 0, 2,   1, 1, 2,  -1, 0, 2,   1, 1, 2,  -1, 1, 2
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  // one tile's cadastre trees: the same X-cross corners, and 8 floats per
  // tree (foot x, y, z, form; height, crown, seed, 0)
  function treeVao(inst) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, inst, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(1, 1); gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    return { vao, bufs: [b], n: inst.length / 8 };
  }

  function trackVao(pts) {
    const m = buildTrack(route, pts);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const b1 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b1);
    gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const b2 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b2);
    gl.bufferData(gl.ARRAY_BUFFER, m.cols, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, count: m.count };
  }
  const trkDown = trackVao(routeData.track_down);
  const trkUp = trackVao(routeData.track_up);

  // CPU access to the same heightmap the shaders read, so earthworks and
  // roads can be laid on the actual ground
  const nearSpanX = texNear.w * world.near.step_m;
  const nearSpanY = texNear.h * world.near.step_m;
  // Pixel i holds the height at its CENTRE, (i + 0.5) steps in (bake_world.py
  // samples there, and the GPU's linear filter reads it so). Without the half
  // pixel everything laid on the ground from here sat 13 m off the drawn
  // terrain: metres under it or over it on any slope.
  function demAt(wx, wy) {
    let u = wx / nearSpanX * texNear.w - 0.5;
    let v = (1 - wy / nearSpanY) * texNear.h - 0.5;
    u = Math.max(0, Math.min(texNear.w - 1.001, u));
    v = Math.max(0, Math.min(texNear.h - 1.001, v));
    const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
    const d = texNear.data, W_ = texNear.w;
    const at = (x, y) => { const i = (y * W_ + x) * 4; return (d[i] * 256 + d[i + 1]) * 0.1; };
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy)
         + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  }

  function colouredVao(mesh) {
    const bufs = [], mk = () => { const x = gl.createBuffer(); bufs.push(x); return x; };
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const b1 = mk();
    gl.bindBuffer(gl.ARRAY_BUFFER, b1);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const b2 = mk();
    gl.bindBuffer(gl.ARRAY_BUFFER, b2);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.cols, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    // a mesh that knows its own normals hands them over; the rest leave the
    // attribute disabled, which the shader reads as "work it out yourself"
    if (mesh.nrms && mesh.nrms.length) {
      const b3 = mk();
      gl.bindBuffer(gl.ARRAY_BUFFER, b3);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.nrms, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(2);
      gl.vertexAttrib3f(2, 0, 0, 0);
    }
    // polygon buildings also hand over [ground, wall height, class, seed]
    if (mesh.info && mesh.info.length) {
      const b4 = mk();
      gl.bindBuffer(gl.ARRAY_BUFFER, b4);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.info, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(3);
      gl.vertexAttrib4f(3, 0, 0, 0, 0);
    }
    gl.bindVertexArray(null);
    return { vao, count: mesh.count, bufs };
  }
  function freeVao(m) {
    if (!m) return;
    gl.deleteVertexArray(m.vao);
    for (const b of m.bufs || []) gl.deleteBuffer(b);
  }
  function coverAt(wx, wy) {
    const u = (wx / nearSpanX * texCover.w) | 0;
    const v = ((1 - wy / nearSpanY) * texCover.h) | 0;
    if (u < 0 || v < 0 || u >= texCover.w || v >= texCover.h) return 0;
    return texCover.data[(v * texCover.w + u) * 4];
  }
  // Each lake at one level. The terrain took a lake's level per vertex, from
  // the lowest ground within 60 m, and the surface model is lumpy over water,
  // so across the Dunakeszi lakes half the surface stood a metre or two up
  // as water-coloured ground. Here every connected water body of the cover
  // raster except the river itself (the one more than 6 km across) is made
  // flat as a whole: at the river plane if the ground under it sits within
  // a metre of it (a side arm, or a gravel pit at river level: stored as -1),
  // else at the 10th percentile of the ground under it. (Dunakeszi's lake is
  // at river level, and only the pixels within 6 m of the plane snapped to it.)
  const lakeLevels = (() => {
    const W = texCover.w, H = texCover.h, D = texCover.data, out = new Float32Array(W * H);
    const seen = new Uint8Array(W * H), stack = new Int32Array(W * H);
    const wA0 = (assets.world.water && assets.world.water.a) || 104.0, wB0 = (assets.world.water && assets.world.water.b) || 0.0;
    let lakes = 0;
    for (let i0 = 0; i0 < W * H; i0++) {
      if (seen[i0] || D[i0 * 4] !== 9) continue;
      let sp = 0; const comp = []; stack[sp++] = i0; seen[i0] = 1;
      while (sp) {
        const i = stack[--sp]; comp.push(i);
        const u = i % W, v = (i / W) | 0;
        for (const j of [u > 0 ? i - 1 : -1, u < W - 1 ? i + 1 : -1, v > 0 ? i - W : -1, v < H - 1 ? i + W : -1])
          if (j >= 0 && !seen[j] && D[j * 4] === 9) { seen[j] = 1; stack[sp++] = j; }
      }
      if (comp.length < 4) continue;
      let u0 = W, u1 = 0, v0 = H, v1 = 0;
      for (const i of comp) { const u = i % W, v = (i / W) | 0; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      if (Math.hypot((u1 - u0) / W * nearSpanX, (v1 - v0) / H * nearSpanY) > 6000) continue;   // the river
      const hs = [];
      let ys = 0;
      for (const i of comp) {
        const x = ((i % W) + 0.5) / W * nearSpanX, y = (1 - (((i / W) | 0) + 0.5) / H) * nearSpanY;
        const h = demAt(x, y); if (!isFinite(h)) continue;
        hs.push(h); ys += y;
      }
      if (!hs.length) continue;
      hs.sort((a, b) => a - b);
      const lvl = hs[Math.floor(hs.length * 0.1)], plane = wA0 + wB0 * ys / hs.length;
      const v = Math.abs(lvl - plane) < 1.0 ? -1 : lvl;
      for (const i of comp) out[i] = v;
      lakes++;
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, W, H, 0, gl.RED, gl.FLOAT, out);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
                          [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex, data: out, lakes, at: (x, y) => {
      const u = (x / nearSpanX * W) | 0, v = ((1 - y / nearSpanY) * H) | 0;
      return u < 0 || v < 0 || u >= W || v >= H ? 0 : out[v * W + u]; } };
  })();
  const ctx = assets.context;
  const roadWays = ctx.roads ? unpackRoads(ctx.roads.data, ctx.roads.count, !!ctx.roads.lanes) : [];
  // the fitted Danube plane, so a bridge over the river clears it rather
  // than lying on the bed. The slider offset is deliberately not applied:
  // the road mesh is built once, and a bridge does not rise with the gauge.
  const wA = (assets.world.water && assets.world.water.a) || 104.0;
  const wB = (assets.world.water && assets.world.water.b) || 0.0;
  // how far a point is from the nearest running rail, for the roads that have
  // to be dug under the line. A coarse grid over the down line is plenty: the
  // ramp is fifty metres long and the answer only has to be smooth.
  const railDistAt = (() => {
    const CELL = 64, grid = new Map();
    const D2 = routeData.track_down;
    for (let i = 0; i < D2.length; i++) {
      const k = Math.floor(D2[i][0] / CELL) + "," + Math.floor(D2[i][1] / CELL);
      const a = grid.get(k); if (a) a.push(i); else grid.set(k, [i]);
    }
    // distance to the nearest running rail, and the rail's height there —
    // both, because a road near the line has to sit on the corridor surface
    // and the corridor is defined off rail level
    return (x, y) => {
      let best = Infinity, y0 = NaN, m = NaN, bi = -1;
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        for (const i of grid.get((cx+dx) + "," + (cy+dy)) || []) {
          const p = D2[i];
          const d = Math.hypot(p[0]-x, p[1]-y);
          if (d < best) { best = d; y0 = p[2]; m = p[3]; bi = i; }
        }
      }
      // which side: > 0 left of the down line (the corridor's +offset side)
      let s = 0;
      if (bi >= 0) {
        const a = D2[Math.max(0, bi - 1)], b = D2[Math.min(D2.length - 1, bi + 1)];
        s = (b[0] - a[0]) * (y - D2[bi][1]) - (b[1] - a[1]) * (x - D2[bi][0]);
      }
      return { d: best, railY: y0, m, s };
    };
  })();
  // distance to the nearer running track, down or up, along its segments
  // (railDistAt above looks at the down line's points only)
  const trackDist = (() => {
    const CELL = 25, G = new Map();
    for (const T of [routeData.track_down, routeData.track_up]) for (let i = 1; i < T.length; i++) {
      const a = T[i - 1], b = T[i];
      for (const p of [a, b]) { const k = Math.floor(p[0] / CELL) + "," + Math.floor(p[1] / CELL);
        const L = G.get(k); if (L) L.push([a, b]); else G.set(k, [[a, b]]); }
    }
    return (x, y) => {
      let best = Infinity; const i0 = Math.floor(x / CELL), j0 = Math.floor(y / CELL);
      for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++)
        for (const [a, b] of G.get(i + "," + j) || []) {
          const ex = b[0] - a[0], ey = b[1] - a[1], ll = ex * ex + ey * ey || 1;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / ll));
          best = Math.min(best, Math.hypot(a[0] + ex * t - x, a[1] + ey * t - y));
        }
      return best;
    };
  })();
  // OSM lines beside the railway (walls, barriers) cut back where they come
  // within `gap` metres of a running track: six walls on line 70 stood on or
  // across the rails, and the trains ran through them
  function clearOfTrack(list, gap) {
    const out = [];
    for (const w of list) {
      // the line at 1 m steps, then kept in runs of points clear of the track
      const P = [w.pts[0]];
      for (let i = 1; i < w.pts.length; i++) {
        const a = w.pts[i - 1], b = w.pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
        for (let k = 1; k <= n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
      }
      let run = [];
      for (const q of P) {
        if (trackDist(q[0], q[1]) >= gap) run.push(q);
        else { if (run.length > 1) out.push({ ...w, pts: run }); run = []; }
      }
      if (run.length > 1) out.push({ ...w, pts: run.length === P.length ? w.pts : run });
    }
    return out;
  }
  // a raised stretch (tools/raise_profile.py: S21 through Zugló and Kőbánya)
  // is one wide embankment where sidings or a second line run beside the
  // running tracks: the top is widened on that side to carry them (they stand
  // at rail height, buildYardTracks), up to 30 m, in 10 m bins spread ±20 m
  const railWays = (ctx.rails && ctx.rails.data) ? unpackRails(ctx.rails.data, ctx.rails.count) : [];
  // the line's extras (bake_linex.py, bake_platforms.py), fetched once here:
  // the platforms are needed for the stations, the rest further down
  const lineLine = new URLSearchParams(location.search).get("line") || "line70";
  let lineEx = null;
  try {
    lineEx = await fetch(`${window.DATA_BASE || "data/"}extras${lineLine === "line70" ? "" : "_" + lineLine}.json`).then(r => r.ok ? r.json() : null);
  } catch (e) { console.warn("line extras unavailable", e); }
  if ((routeData.raised || []).length) {
    const liftAt = (m) => routeData.raised.some(([a, , , d]) => m > a && m < d);
    const E = { l: new Map(), r: new Map() };
    for (const w of railWays) for (const q of w.pts) {
      if (w.cls >= 2 || q[3] >= 60 || !liftAt(q[2])) continue;   // not the disused sidings
      const r = railDistAt(q[0], q[1]);
      if (!r || r.d < 3) continue;
      const side = r.s > 0 ? E.l : E.r, k = Math.round(q[2] / 10);
      side.set(k, Math.max(side.get(k) || 0, Math.min(30, r.d + 3.2 - 4.6)));
    }
    const at = (M, m) => { const k = Math.round(m / 10); let v = 0;
      for (let j = -2; j <= 2; j++) v = Math.max(v, M.get(k + j) || 0); return v; };
    setShoulders((m, side) => liftAt(m) ? at(side > 0 ? E.l : E.r, m) : 0, liftAt);
  }
  // roads that pass under the line: their floor (geom.js prepareUnderpasses),
  // which the corridor digs its cutting to and the road and the cars use
  const underpasses = prepareUnderpasses(roadWays, (ctx.roads && ctx.roads.widths) ? ctx.roads.widths : [], demAt, railDistAt);
  const corridor = colouredVao(buildCorridor(routeData.track_down, demAt, coverAt, 1, routeData.bridges || [], underpasses,
                                                     (routeData.raised || []).length > 0 || (routeData.tunnels || []).length > 0,
                                                     routeData.tunnels || []));

  // two platforms only where the formation actually widens: Vác 9 roads,
  // Szob 10, Nagymaros 6, Verőce 4, Vác-Alsóváros 4. Kismaros,
  // Nagymaros-Visegrád, Zebegény and Szob alsó are two-track halts.
  const MAJOR = new Set(["Vác", "Szob", "Nagymaros", "Verőce", "Vác-Alsóváros",
                         // line 2
                         "Esztergom", "Dorog", "Pilisvörösvár", "Piliscsaba", "Óbuda", "Solymár"]);
  // traffic: block occupancy over the synthesised signal plan
  const traffic = new Traffic(route, routeData.signals, assets.timetable);
  const POIS = buildPOIs(routeData, (assets.context || {}).landmarks);
  const poiSeen = new Map();
  const playerTrain = { dir: 1, m: driver.m, v: 0, length: KISS.lengthM,
                        carLen: 26, carH: 4.6, cars: 6, col: [0.05,0.42,0.45],
                        svc: { id: "player", pattern: "all" }, aspect: 3 };
  traffic.trains.push(playerTrain);

  function dynamicVao(withNormals = false) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const cap = 3 * 400000;
    const b1 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b1);
    gl.bufferData(gl.ARRAY_BUFFER, cap * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const b2 = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b2);
    gl.bufferData(gl.ARRAY_BUFFER, cap * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    // a mesh seen from half a metre (the inside of a carriage) cannot take its
    // normals from screen derivatives: world coordinates in the tens of
    // kilometres have millimetre precision, which is a pixel at that range,
    // and the walls fizz. Such meshes supply their own.
    let b3 = null;
    if (withNormals) {
      b3 = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b3);
      gl.bufferData(gl.ARRAY_BUFFER, cap * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    return { vao, vb: b1, cb: b2, nb: b3, count: 0, cap };
  }
  const peopleDyn = dynamicVao();
  const heroDyn = dynamicVao();
  const trainDyn = dynamicVao(true);
  const airDyn = dynamicVao(true);
  const air = new AirTraffic(demAt);
  const xingDyn = dynamicVao();
  const carDyn = dynamicVao();
  const shipDyn = dynamicVao();
  const lampDyn = dynamicVao();      // the lit heads of the platform lamps
  const heartDyn = dynamicVao(true); // Dobogókő (easter.js)
  const bulbDyn = dynamicVao(true);  // photo mode's placed lamps
  // Budapest's city box in this line's frame (east, north), for the
  // vegetation: fewer garden trees in the tenement districts
  const cityBoxLine = (() => {
    const W = assets.world.near, lat0 = W.frame_lat ?? (W.south + W.north) / 2, p = lat0 * Math.PI / 180;
    const mlat = 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p);
    const mlon = 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p);
    return new Float32Array([(18.93 - W.west) * mlon, (47.39 - W.south) * mlat, (19.25 - W.west) * mlon, (47.58 - W.south) * mlat]);
  })();
  // ---- textured models (tools/bake_models.py): the road traffic's cars.
  // Loaded in the background; until they arrive the cars are the old boxes.
  const pMdl = compile(gl, S.MODEL_VS, S.MODEL_FS);
  let carModels = null;
  (async () => {
    try {
      const base = (window.DATA_BASE || "data/") + "models/";
      const meta = await fetch(base + "cars.json").then(r => r.json());
      const img = await loadImage(base + meta.atlas);
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);
      const f32 = b64 => new Float32Array(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
      for (const m of meta.models) {
        m.vao = gl.createVertexArray(); gl.bindVertexArray(m.vao);
        for (const [loc, key, n] of [[0, "pos", 3], [1, "uv", 2], [2, "nrm", 3]]) {
          const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
          gl.bufferData(gl.ARRAY_BUFFER, f32(m[key]), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
        }
        m.ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.ib);
        gl.bufferData(gl.ARRAY_BUFFER, 4 * 8 * 64, gl.DYNAMIC_DRAW); m.icap = 64;
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(3, 1);
        gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(4, 1);
        gl.bindVertexArray(null);
        m.n = 0;
      }
      meta.tex = tex;
      carModels = meta;
    } catch (e) { console.warn("car models unavailable", e); }
  })();
  // ---- graffiti (owner, Oct 2026): pieces from the sticker pack's graffiti
  // sheet on the spots geom.js collected (walls beside the line, standing
  // wagons). Built once, after the yard and the walls; not on phones.
  const pDec = compile(gl, S.DECAL_VS, S.DECAL_FS);
  let graffiti = null;
  async function makeGraffiti() {
    if (state.lite || !graffitiSpots.length) return;
    try {
      const base = window.DATA_BASE || "data/";
      const meta = await fetch(base + "stickers.json").then(r => r.json());
      const items = meta.items.filter(i => i.kind === "Grafitti"), sh = meta.sheets.b;
      if (!items.length) return;
      const img = await loadImage(base + sh.file);
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);
      const P = new FBuf(), U = new FBuf();
      for (const g of graffitiSpots) {
        const it = items[Math.floor(g.seed * 7.31) % items.length], asp = it.w / it.h;
        const hh = Math.min(g.h, g.len / asp), ww = hh * asp;
        if (hh < 0.5) continue;
        // "along" is the viewer's right as they face the wall
        const ax = -g.on, an = g.ox;
        const u0 = (it.x + 1) / sh.w, u1 = (it.x + it.w - 1) / sh.w, v0 = (it.y + 1) / sh.h, v1 = (it.y + it.h - 1) / sh.h;
        const c = (k, up, u, v) => { P.push(g.x + ax * k * ww / 2, g.y + up, -(g.n + an * k * ww / 2)); U.push(u, v); };
        c(-1, 0, u0, v1); c(1, 0, u1, v1); c(1, hh, u1, v0);
        c(-1, 0, u0, v1); c(1, hh, u1, v0); c(-1, hh, u0, v0);
      }
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const b0 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b0); gl.bufferData(gl.ARRAY_BUFFER, P.arr(), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const b2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b2); gl.bufferData(gl.ARRAY_BUFFER, U.arr(), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      graffiti = { vao, tex, count: P.length / 3 };
      state.graffitiN = graffiti.count / 6;
    } catch (e) { console.warn("graffiti unavailable", e); }
  }
  function drawGraffiti(vp, eye, pal, lift) {
    if (!graffiti || !graffiti.count) return;
    gl.useProgram(pDec.p);
    gl.uniformMatrix4fv(pDec.u.uVP, false, vp);
    gl.uniform3fv(pDec.u.uEye, eye);
    gl.uniform3fv(pDec.u.uSunCol, pal.sun);
    gl.uniform3fv(pDec.u.uSkyCol, pal.zenith);
    gl.uniform3fv(pDec.u.uFogCol, pal.horizon);
    gl.uniform1f(pDec.u.uFogDensity, pal.fog);
    gl.uniform1f(pDec.u.uLift, lift);
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, graffiti.tex);
    gl.uniform1i(pDec.u.uTex, 9);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(graffiti.vao);
    gl.drawArrays(gl.TRIANGLES, 0, graffiti.count);
    gl.activeTexture(gl.TEXTURE0);
  }
  // ---- people as textured, animated models (tools/bake_people.py): 24
  // figures from the PSX Characters pack with an 8-frame walk and a standing
  // pose, the frames in an integer texture read by the vertex shader. Not on
  // phones; until they load (and on phones) people are the old box figures.
  const pPpl = compile(gl, S.PEOPLE_VS, S.PEOPLE_FS);
  let people3d = null;
  const pplWalk = [], pplStand = [];       // eight numbers a person (geom.js)
  state.ppl = { walk: pplWalk, stand: pplStand };   // (for the console)
  if (!state.lite) (async () => {
    try {
      const base = (window.DATA_BASE || "data/") + "models/";
      const meta = await fetch(base + "people.json").then(r => r.json());
      const [bin, img] = await Promise.all([fetch(base + meta.bin).then(r => r.arrayBuffer()), loadImage(base + meta.atlas)]);
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // the frames: one row per person per frame, one texel per vertex
      const rowsPer = meta.frames + 1, W = Math.max(...meta.people.map(q => q.nv)), H = meta.people.length * rowsPer;
      const src = new Int16Array(bin), data = new Int16Array(W * H * 4);
      meta.people.forEach((q, pi) => {
        for (let f = 0; f < rowsPer; f++) data.set(src.subarray(q.vo + f * q.nv * 4, q.vo + (f + 1) * q.nv * 4), ((pi * rowsPer + f) * W) * 4);
      });
      const anim = gl.createTexture();
      gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, anim);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16I, W, H, 0, gl.RGBA_INTEGER, gl.SHORT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);
      meta.people.forEach((q, pi) => {
        q.vao = gl.createVertexArray(); gl.bindVertexArray(q.vao);
        const ids = new Float32Array(q.nv); for (let i = 0; i < q.nv; i++) ids[i] = i;
        const b0 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b0); gl.bufferData(gl.ARRAY_BUFFER, ids, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
        const b2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b2);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bin, q.uo, q.nv * 2), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
        q.ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, q.ib);
        gl.bufferData(gl.ARRAY_BUFFER, 4 * 8 * 32, gl.DYNAMIC_DRAW); q.icap = 32;
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(3, 1);
        gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(4, 1);
        const eb = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(bin, q.io, q.ni), gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        q.n = 0; q.row0 = pi * rowsPer; q.inst = [];
      });
      meta.tex = tex; meta.anim = anim;
      people3d = meta;
      state.pplHour = 0;                    // rebuild the platforms' people as models
    } catch (e) { console.warn("people models unavailable", e); }
  })();
  // sort this frame's people (walkers, and those standing within 700 m) into
  // their models and upload
  function uploadPeople(camX, camZ) {
    if (!people3d) return;
    const P = people3d.people;
    for (const q of P) q.inst.length = 0;
    const add = (a, i) => { const q = P[Math.min(P.length - 1, (a[i + 5] * P.length) | 0)];
      q.inst.push(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], 0.0, a[i + 6], a[i + 7]); };
    for (let i = 0; i < pplWalk.length; i += 8) add(pplWalk, i);
    for (let i = 0; i < pplStand.length; i += 8)
      if (Math.abs(pplStand[i] - camX) < 700 && Math.abs(pplStand[i + 2] + camZ) < 700) add(pplStand, i);

    // Hero Character (player):
    if (state.person && state.person.active && !state.person.firstPerson) {
      const p = state.person;
      const charIdx = Math.max(0, Math.min(P.length - 1, p.charIdx || 0));
      const q = P[charIdx];
      const H = p.height || 1.82;
      const phase = (p.phase !== undefined) ? p.phase : -1.0;
      const tint = p.tintScale || 1.0;
      const pitch = p.pitchAngle || 0.0;
      q.inst.push(p.x, p.y, -p.n, p.yaw || 0, H, pitch, phase, tint);
    }

    let total = 0;
    for (const q of P) {
      q.n = q.inst.length / 8; total += q.n;
      if (!q.n) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, q.ib);
      if (q.n > q.icap) { q.icap = q.n * 2; gl.bufferData(gl.ARRAY_BUFFER, 4 * 8 * q.icap, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(q.inst));
    }
    state.people3dN = total;
  }
  function drawPeople(vp, eye, sunDir, pal, lift) {
    if (!people3d || !state.people3dN) return;
    gl.useProgram(pPpl.p);
    gl.uniformMatrix4fv(pPpl.u.uVP, false, vp);
    gl.uniform3fv(pPpl.u.uEye, eye);
    gl.uniform2f(pPpl.u.uGrid, people3d.cols, people3d.rows);
    gl.uniform1f(pPpl.u.uFrames, people3d.frames);
    gl.uniform1f(pPpl.u.uPull, 0.004);
    gl.uniform3fv(pPpl.u.uSunDir, sunDir);
    gl.uniform3fv(pPpl.u.uSunCol, pal.sun);
    gl.uniform3fv(pPpl.u.uSkyCol, pal.zenith);
    gl.uniform3fv(pPpl.u.uFogCol, pal.horizon);
    gl.uniform1f(pPpl.u.uFogDensity, pal.fog);
    gl.uniform1f(pPpl.u.uLift, lift);
    gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D, people3d.tex);
    gl.uniform1i(pPpl.u.uTex, 10);
    gl.activeTexture(gl.TEXTURE11); gl.bindTexture(gl.TEXTURE_2D, people3d.anim);
    gl.uniform1i(pPpl.u.uAnim, 11);
    people3d.people.forEach((q, pi) => {
      if (!q.n) return;
      gl.uniform1f(pPpl.u.uRow0, q.row0);
      gl.uniform1f(pPpl.u.uCell, pi);
      gl.bindVertexArray(q.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, q.ni, gl.UNSIGNED_SHORT, 0, q.n);
    });
    gl.activeTexture(gl.TEXTURE0);
  }
  function drawModels(vp, eye, sunDir, pal, lift) {
    if (!carModels || !state.show.roads) return;
    gl.useProgram(pMdl.p);
    gl.uniformMatrix4fv(pMdl.u.uVP, false, vp);
    gl.uniform3fv(pMdl.u.uEye, eye);
    gl.uniform2f(pMdl.u.uGrid, carModels.cols, carModels.rows);
    gl.uniform1f(pMdl.u.uPull, 0.005);
    gl.uniform3fv(pMdl.u.uSunDir, sunDir);
    gl.uniform3fv(pMdl.u.uSunCol, pal.sun);
    gl.uniform3fv(pMdl.u.uSkyCol, pal.zenith);
    gl.uniform3fv(pMdl.u.uFogCol, pal.horizon);
    gl.uniform1f(pMdl.u.uFogDensity, pal.fog);
    gl.uniform1f(pMdl.u.uLift, lift);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, carModels.tex);
    gl.uniform1i(pMdl.u.uTex, 7);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-12.0, -26.0);
    for (const m of carModels.models) {
      if (!m.n) continue;
      gl.bindVertexArray(m.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, m.count, m.n);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.activeTexture(gl.TEXTURE0);
  }
  function uploadModelInstances(inst) {
    if (!carModels) return;
    carModels.models.forEach((m, i) => {
      const a = inst && inst[i] ? inst[i] : [];
      m.n = a.length / 8;
      if (!m.n) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, m.ib);
      if (m.n > m.icap) { m.icap = m.n * 2; gl.bufferData(gl.ARRAY_BUFFER, 4 * 8 * m.icap, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(a));
    });
  }
  const dobogo = (routeData.peaks || []).find(p => /Dobogó/.test(p.name));

  // the cab: geometry rebuilt each frame, instruments drawn to a texture
  const panelCanvas = document.createElement("canvas");
  panelCanvas.width = 2048; panelCanvas.height = 500;
  const panelCtx = panelCanvas.getContext("2d");
  const panelTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, panelTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, panelCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const cabVao = gl.createVertexArray();
  gl.bindVertexArray(cabVao);
  const cabPos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cabPos);
  gl.bufferData(gl.ARRAY_BUFFER, 3 * 4 * 2400, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const cabCol = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cabCol);
  gl.bufferData(gl.ARRAY_BUFFER, 3 * 4 * 2400, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const cabUv = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cabUv);
  gl.bufferData(gl.ARRAY_BUFFER, 2 * 4 * 2400, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  let cabCount = 0;
  const sigDyn = dynamicVao();
  function upload(dyn, mesh) {
    if (!mesh || !mesh.verts || mesh.count === 0) { dyn.count = 0; return; }
    gl.bindVertexArray(dyn.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, dyn.vb);
    if (mesh.verts.length > dyn.cap) {
      dyn.cap = Math.max(mesh.verts.length, dyn.cap * 2);
      gl.bufferData(gl.ARRAY_BUFFER, dyn.cap * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.verts);
    gl.bindBuffer(gl.ARRAY_BUFFER, dyn.cb);
    if (mesh.cols.length > dyn.cap) {
      gl.bufferData(gl.ARRAY_BUFFER, dyn.cap * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.cols);
    if (dyn.nb && mesh.nrms) {
      gl.bindBuffer(gl.ARRAY_BUFFER, dyn.nb);
      if (mesh.nrms.length > (dyn.nbCap || dyn.cap)) {
        dyn.nbCap = Math.max(mesh.nrms.length, dyn.cap);
        gl.bufferData(gl.ARRAY_BUFFER, dyn.nbCap * 4, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.nrms);
    }
    dyn.count = mesh.count;
  }

  // the real platforms and footbridges from OSM (bake_platforms.py), in the
  // line's extras; a stop with none keeps the generic platform
  const platSecs = [];                  // every OSM platform's cross-sections (street furniture stands on them)
  let osmFor = null, footMesh = null;   // (osmFor is also where the waiting people stand)
  if (lineEx && (lineEx.platforms || []).length) {
    const xyOf = (T) => T.map(q => [q[0], q[1]]);
    const tracks = [xyOf(routeData.track_down), xyOf(routeData.track_up)]
      .concat(railWays.filter(w => w.cls < 2).map(w => xyOf(w.pts)));
    const railYXY = (x, y) => { const r = railDistAt(x, y); return r && isFinite(r.railY) ? r.railY : demAt(x, y); };
    const byStop = new Map();
    for (const pl of lineEx.platforms) {
      const c = pl.pts[Math.floor(pl.pts.length / 2)], r = railDistAt(c[0], c[1]);
      if (!r || !isFinite(r.m) || r.d > 40) continue;
      let best = null, bd = 400;
      for (const st of routeData.stops) { const d = Math.abs(st.km * 1000 - r.m); if (d < bd) { bd = d; best = st; } }
      if (!best) continue;
      const sec = osmPlatformSections(pl, tracks, railYXY);
      if (sec.rail.length < 3) continue;
      if (!byStop.has(best.name)) byStop.set(best.name, []);
      byStop.get(best.name).push(sec);
      for (const q of sec.rail) platSecs.push(q);
    }
    osmFor = (st) => byStop.get(st.name) || null;
    if ((lineEx.footbridges || []).length) footMesh = buildFootbridges(lineEx.footbridges, demAt, railYXY);
  }
  const stn = buildStations(routeData.stops, routeData.track_down,
                            routeData.track_up, demAt, MAJOR, osmFor);
  if (footMesh && footMesh.count) {
    const cat = (a, b) => { const o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
    stn.mesh = { verts: cat(stn.mesh.verts, footMesh.verts), cols: cat(stn.mesh.cols, footMesh.cols),
                 count: stn.mesh.count + footMesh.count };
  }
  const platMesh = colouredVao(stn.mesh);

  // name boards: one atlas row per board, drawn as instanced quads
  const boardNames = stn.boards.map(b => b.name);
  const atlasCanvas = boardAtlas(boardNames);
  const atlasTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const boardInst = new Float32Array(stn.boards.length * 6);
  stn.boards.forEach((b, i) => {
    boardInst[i*6+0] = b.x; boardInst[i*6+1] = b.y; boardInst[i*6+2] = b.h;
    boardInst[i*6+3] = i;   boardInst[i*6+4] = b.ang;
    boardInst[i*6+5] = stn.boards.length;
  });
  const brdVao = gl.createVertexArray();
  gl.bindVertexArray(brdVao);
  const brdQuad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, brdQuad);
  gl.bufferData(gl.ARRAY_BUFFER,
    new Float32Array([-1,0, 1,0, 1,2, -1,0, 1,2, -1,2]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const brdBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, brdBuf);
  gl.bufferData(gl.ARRAY_BUFFER, boardInst, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 24, 16); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

  {
    const hung = (ctx.landmarks || []).filter(a => a.key === "erzsebet");
    setNoPierAt(hung.length ? (x, y) => hung.some(a => {
      const dx = x - a.x, dy = y - a.y, ca = Math.cos(a.ang), sa = Math.sin(a.ang);
      return Math.abs(dx * ca + dy * sa) < a.hu && Math.abs(-dx * sa + dy * ca) < 25;
    }) : null);
  }
  const roadData = buildRoads(roadWays, (ctx.roads && ctx.roads.widths) ? ctx.roads.widths : [], demAt,
                              (north) => wA + wB * north, railDistAt);
  const roadMesh = colouredVao(roadData);
  // vehicles drive on the surface the road was laid on
  // the road surface under every car, every frame, was nine DEM samples and a
  // rail-grid search each: kept on a 1 m grid (the ground does not move)
  const surfMemo = new Map();
  const roadSurface = (x, y) => {
    const k = Math.round(x) * 400009 + Math.round(y);   // (frames reach ~150 km north)
    let v = surfMemo.get(k);
    if (v === undefined) {
      if (surfMemo.size > 400000) surfMemo.clear();
      v = roadSurfaceAt(demAt, railDistAt, x, y);
      surfMemo.set(k, v);
    }
    return v;
  };
  const streetLamps = roadData.lamps || [];

  // Spatial index for street & platform lamps for fast real-time culling
  const allLampsList = stn.lamps.concat(streetLamps);
  const lampGrid = new Map(), LAMP_CELL = 1000;
  for (let i = 0; i < allLampsList.length; i++) {
    const l = allLampsList[i];
    const k = Math.floor(l[0] / LAMP_CELL) + "," + Math.floor(l[2] / LAMP_CELL);
    let a = lampGrid.get(k); if (!a) lampGrid.set(k, a = []);
    a.push(l);
  }
  const slArr = new Float32Array(48 * 3); let slN = 0;
  const photoLightArr = new Float32Array(48 * 3);
  // the dark timeline's craters (?mode=dark): [x, z, radius, depth] each,
  // world coordinates; CRATER_GLSL in the terrain, ground and building shaders
  const craterArr = new Float32Array(16 * 4);
  state.craters = [];
  function setCraters(pr) {
    if (!pr.u.uCraterN) return;
    gl.uniform1i(pr.u.uCraterN, state.craters.length);
    if (state.craters.length) gl.uniform4fv(pr.u.uCrater, craterArr);
  }
  function addCrater(x, z, r, depth) {
    state.craters.push([x, z, r, depth]);
    if (state.craters.length > 16) state.craters.shift();
    craterArr.fill(0);
    state.craters.forEach((c, i) => craterArr.set(c, i * 4));
  }
  // the same dip as craterDip() in CRATER_GLSL, for whatever stands on the
  // ground on the JS side (the hero, thrown and driving cars): demAt knows
  // nothing of craters, so they stood on the old ground over the bowl
  // a point on a train, k metres back from its head: [x, n, rail y] and the
  // sideways unit vector (the same track arrays the trains are drawn on)
  function trainPoint(t, k) {
    const pts = t.dir > 0 ? routeData.track_down : routeData.track_up;
    const m = t.m - t.dir * k, f = (m - pts[0][3]) / 10;
    if (!(f >= 0 && f <= pts.length - 1)) return null;
    const i = Math.min(pts.length - 2, Math.floor(f)), u = f - i, a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dn = b[1] - a[1], L = Math.hypot(dx, dn) || 1;
    return { x: a[0] + dx * u, n: a[1] + dn * u, y: a[2] + (b[2] - a[2]) * u, nx: -dn / L, nn: dx / L };
  }
  // the roof under (x, n), if any: the train, how far back, how far across
  function roofUnder(x, n) {
    let best = null;
    for (const t of traffic.trains) {
      const len = t.length || 100, h = CAR_H[t.stock] || t.carH || 4;
      const head = trainPoint(t, 0);
      if (!head || Math.hypot(head.x - x, head.n - n) > len + 40) continue;
      for (let k = 0; k <= len; k += 2) {
        const q = trainPoint(t, k); if (!q) continue;
        const lat = (x - q.x) * q.nx + (n - q.n) * q.nn;
        const along = Math.hypot(x - q.x - q.nx * lat, n - q.n - q.nn * lat);
        if (Math.abs(lat) < 1.4 && along < 1.2 && (!best || Math.abs(lat) < Math.abs(best.lat)))
          best = { t, k, lat, y: q.y + h };
      }
    }
    return best;
  }
  function craterDipAt(x, north) {
    let h = 0;
    for (const c of state.craters) {
      const d = Math.hypot(x - c[0], -north - c[1]) / c[2];
      if (d < 1) h -= c[3] * (1 - d * d);
      else if (d < 1.7) h += c[3] * 0.22 * Math.sin((d - 1) / 0.7 * Math.PI);
    }
    return h;
  }
  function setStreetLights(pr) {
    setCraters(pr);
    if (!pr.u.uSL) return;
    // photo mode's own lamps, day or night, instead of the street's
    const PL = state.photo && state.photo.lights;
    if (PL && PL.length) {
      photoLightArr.fill(0);
      PL.forEach((p, i) => { photoLightArr[i*3] = p[0]; photoLightArr[i*3+1] = p[1]; photoLightArr[i*3+2] = p[2]; });
      gl.uniform3fv(pr.u.uSL, photoLightArr);
      gl.uniform1i(pr.u.uSLn, PL.length);
      gl.uniform1f(pr.u.uSLon, state.photo.lightI);
      return;
    }
    gl.uniform3fv(pr.u.uSL, slArr);
    gl.uniform1i(pr.u.uSLn, slN);
    gl.uniform1f(pr.u.uSLon, Math.max(0, Math.min(1, ((state.night || 0) - 0.25) * 1.6)));
  }
  function gatherLampsNear(ex, ez, rad) {
    const out = [];
    const c0 = Math.floor((ex - rad) / LAMP_CELL), c1 = Math.floor((ex + rad) / LAMP_CELL);
    const r0 = Math.floor((ez - rad) / LAMP_CELL), r1 = Math.floor((ez + rad) / LAMP_CELL);
    const r2 = rad * rad;
    for (let cx = c0; cx <= c1; cx++) {
      for (let cz = r0; cz <= r1; cz++) {
        const a = lampGrid.get(cx + "," + cz);
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const l = a[i];
          const dx = l[0] - ex, dz = l[2] - ez;
          if (dx * dx + dz * dz <= r2) out.push(l);
        }
      }
    }
    return out;
  }
  // real footprints for anything big enough that a box would be wrong
  // On a phone (a touch device) the whole line's detailed footprints and their
  // collision solids do not fit: loading reached about 700 MB and the browser
  // killed the tab, reloading in a loop (owner, Oct 2026). There, footprints
  // and solids are kept within about 1.6 km of the track; further out (the
  // Szentendre and Fót extracts, mostly) only the box buildings are drawn.
  const LITE = document.body.classList.contains("touch") || (navigator.deviceMemory || 8) <= 3;
  const nearLine = (() => {
    const CELLN = 400, set = new Set();
    for (let i = 0; i < routeData.track_down.length; i += 8) {
      const q = routeData.track_down[i], cx = Math.floor(q[0] / CELLN), cy = Math.floor(q[1] / CELLN);
      for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) set.add((cx + dx) * 100003 + (cy + dy));
    }
    return (x, y) => set.has(Math.floor(x / CELLN) * 100003 + Math.floor(y / CELLN));
  })();
  state.lite = LITE;
  let polyList = (ctx.polys && ctx.polys.data)
    ? unpackPolyBuildings(ctx.polys.data, ctx.polys.count, ctx.polys.colours) : [];
  if (LITE) polyList = polyList.filter(B => nearLine(B.cx, B.cy));


  // hand-modelled buildings, placed by their own OSM footprints
  // where a modelled railway bridge stands (its footprint in the anchor's own
  // frame), the extras layer must not lay a second deck
  const modelBridges = (ctx.landmarks || []).filter(a => a.key === "eszakivasut");
  const onModelBridge = (x, y) => modelBridges.some(a => {
    const dx = x - a.x, dy = y - a.y, ca = Math.cos(a.ang), sa = Math.sin(a.ang);
    return Math.abs(dx * ca + dy * sa) < a.hu + 30 && Math.abs(-dx * sa + dy * ca) < 14;
  });
  setLandmarkWater((x, n) => coverAt(x, n) === 9);
  const lmMesh = colouredVao(buildLandmarks(ctx.landmarks, demAt,
    (north) => ((world.water && world.water.a) || 104) + ((world.water && world.water.b) || 0) * north,
    (x, y) => {            // rail height of the player's line near a point, or null
      let best = 3600, h = null;
      for (const q of routeData.track_down) {
        const d = (q[0] - x) ** 2 + (q[1] - y) ** 2;
        if (d < best) { best = d; h = q[2]; }
      }
      return h;
    }));
  // every other track: throats, yards, loops and sidings
  const railYAt = (m) => ptAt(routeData.track_down,
    Math.max(routeData.track_down[0][3],
             Math.min(routeData.track_down[routeData.track_down.length-1][3], m)))[2];
  await step(tt("vonatforgalom", "train traffic"), 0.84);
  // ---- single track. A line whose up and down tracks are the same path
  // (line 2) is single track except where the data shows a second track
  // alongside, 3–7 m off: double-track sections and station loops. Those
  // ranges come from the yard-track layer (OSM, q_line2_rails.ql); a range
  // under 300 m is a siding, not a loop. The loop's side is the side the
  // second track is on.
  let loops = [];
  {
    const dn = routeData.track_down, up = routeData.track_up;
    const singleLine = dn.length === up.length && dn.length > 10 && dn[10][0] === up[10][0] && dn[10][1] === up[10][1];
    if (singleLine) {
      const B = 50, n = Math.ceil(dn[dn.length - 1][3] / B) + 2;
      const cnt = new Uint16Array(n), side = new Float32Array(n);
      for (const w of railWays) {
        if (w.cls !== 0) continue;
        // along each segment, not only at its nodes: a straight loop track
        // has a node at each end and nothing between
        for (let j = 0; j + 1 < w.pts.length; j++) {
          const q0 = w.pts[j], q1 = w.pts[j + 1];
          if (q0[3] < 3 || q0[3] > 7 || q1[3] < 3 || q1[3] > 7) continue;
          const steps = Math.max(1, Math.ceil(Math.abs(q1[2] - q0[2]) / 25));
          for (let st = 0; st <= steps; st++) {
            const f = st / steps;
            const x = q0[0] + (q1[0] - q0[0]) * f, y = q0[1] + (q1[1] - q0[1]) * f, c = q0[2] + (q1[2] - q0[2]) * f;
            const k = Math.floor(c / B);
            if (k < 0 || k >= n) continue;
            const a = route.at(c), tg = route.tangent(c);
            cnt[k]++; side[k] += Math.sign(tg[0] * (y - a[1]) - tg[1] * (x - a[0]));
          }
        }
      }
      for (let k = 0; k < n; k++) {
        if (!cnt[k]) continue;
        const last = loops[loops.length - 1];
        if (last && k * B - last.b <= 250) { last.b = (k + 1) * B; last.side += side[k]; }
        else loops.push({ a: k * B, b: (k + 1) * B, side: side[k] });
      }
      loops = loops.filter(l => l.b - l.a >= 300).map(l => ({ a: l.a, b: l.b, side: l.side >= 0 ? 1 : -1 }));
      const end = dn[dn.length - 1][3];
      const single = [];
      let at = 0;
      for (const l of loops) { if (l.a - at > 150) single.push([at, l.a]); at = Math.max(at, l.b); }
      if (end - at > 150) single.push([at, end]);
      // a "single" stretch under 1.2 km between two double ones is a gap in
      // the mapped second track (Kőbánya-Kispest came out single), not a real
      // single-track section: real ones run from loop to loop, kilometres
      for (let i = single.length - 1; i >= 0; i--) {
        const [a, b] = single[i];
        const inner = a > 0 && b < end;
        if (inner && b - a < 1200) single.splice(i, 1);
      }
      traffic.setSingleTrack(single);
      console.log("single track sections", single.map(q => q.map(v => (v / 1000).toFixed(2)).join("–")).join(", "));
    }
  }
  // which side a train is drawn on: in a loop, trains running against the
  // player's direction take the loop track, so a crossing is two trains
  // side by side; eased over 60 m at each end of the loop
  const trainSide = loops.length ? (t, m) => {
    if (t.dir === route.dir) return 0;
    for (const l of loops) {
      if (m > l.a && m < l.b) return l.side * 4.6 * Math.min(1, (m - l.a) / 60, (l.b - m) / 60);
    }
    return 0;
  } : null;
  // a siding's rail height: the line's, except on a raised stretch, where one
  // off the widened top stands on the slope or the ground, not in the air
  const yardYAt = (m, p) => {
    const y = railYAt(m);
    if (!p || !(routeData.raised || []).some(([a, , , d]) => m > a && m < d)) return y;
    return Math.min(y, roadSurfaceAt(demAt, railDistAt, p[0], p[1]) - 0.1);
  };
  const yardMesh = colouredVao(railWays.length
    ? buildYardTracks(railWays, demAt, yardYAt, trackDist)
    : { verts: new Float32Array(0), cols: new Float32Array(0), count: 0 });

  await step(tt("felsővezeték", "overhead line"), 0.87);
  // ---- the overhead line
  // Where the formation is wide the wire is carried on a portal rather than a
  // cantilever, so the yard tracks are reduced to how far they reach either
  // side of the down line. The bake packs the offset unsigned, so which side a
  // track is on is recovered here from the down line's own normal.
  //
  // Min and max is the wrong reduction and was the first thing tried: at
  // Nyugati the rails within 220 m of the line run from 49 m one side to 77 m
  // the other, because the throat, the Rákosrendező approach and line 2 are
  // all in there, and a portal drawn to that is 126 m wide. What a portal
  // actually spans is the group of roads the platforms are on, so the offsets
  // are clustered: start at the down line and grow outward while there is
  // another track within GAP, and stop.
  const yardSpan = (() => {
    const BUCKET = 60, GAP = 12, WIDEST = 34;
    const seen = new Map();                    // bucket -> offsets, unsorted
    for (const w of railWays) {
      if (w.cls !== 0) continue;               // running rails only
      for (const q of w.pts) {
        if (q[3] > 220) continue;              // too far out to be this yard
        const m = q[2];
        const c = ptAt(routeData.track_down, m), t = tanAt(routeData.track_down, m);
        const off = (q[0] - c[0]) * -t[1] + (q[1] - c[1]) * t[0];
        const k = Math.round(m / BUCKET);
        const a = seen.get(k);
        if (a) a.push(off); else seen.set(k, [off]);
      }
    }
    const span = new Map();
    for (const [k, offs] of seen) {
      offs.sort((a, b) => a - b);
      // the run of tracks that contains the down line itself
      let i0 = 0;
      while (i0 < offs.length && offs[i0] < -0.5) i0++;
      let lo = i0, hi = i0;
      while (lo > 0 && offs[lo] - offs[lo - 1] <= GAP) lo--;
      while (hi < offs.length - 1 && offs[hi + 1] - offs[hi] <= GAP) hi++;
      // A portal carries a track group, not a whole station: eight roads is
      // about the most one spans, so a wider cluster is trimmed from the far
      // end and the rest of the yard keeps its own masts. Clamping each side
      // to ±WIDEST instead — which is what this did first — allows twice
      // that, and Nyugati grew a 92 m gantry.
      let a = offs[lo], b = offs[hi];
      if (b - a > WIDEST) {
        if (Math.abs(a) < Math.abs(b)) b = a + WIDEST; else a = b - WIDEST;
      }
      if (b - a > 1) span.set(k, [a, b]);
    }
    // one bucket either side, so a portal does not appear and vanish over a
    // gap in the mapping
    const portal = (m) => {
      const k = Math.round(m / BUCKET);
      let lo = Infinity, hi = -Infinity;
      for (let j = k - 1; j <= k + 1; j++) {
        const e = span.get(j);
        if (e) { if (e[0] < lo) lo = e[0]; if (e[1] > hi) hi = e[1]; }
      }
      return lo < hi ? [lo, hi] : null;
    };
    // The clustering is right for a portal and wrong for a trainshed. At
    // Nyugati the roads OSM has run -21..-16 and 0..+5, and the gap between
    // them is 16 m, so a 12 m cluster keeps only half the station and the
    // shed comes out 30 m wide, sitting over the wrong roads. A shed spans
    // the platform group whether or not the mapping is continuous across it,
    // so this takes the plain reach of the roads near the line instead.
    const spread = (m, lim) => {
      const k = Math.round(m / BUCKET);
      let lo = Infinity, hi = -Infinity;
      for (let j = k - 1; j <= k + 1; j++) {
        for (const o of seen.get(j) || []) {
          if (Math.abs(o) > lim) continue;
          if (o < lo) lo = o; if (o > hi) hi = o;
        }
      }
      return lo < hi ? [lo, hi] : null;
    };
    return Object.assign(portal, { spread });
  })();
  const catMesh = (() => {
    // Where the line is wired. S21's Lajosmizse line has no overhead line
    // past Kőbánya-Kispest (hence the diesel 416s); the other lines are
    // electric end to end. The route data has no electrification field, so
    // this is set here by line.
    const lineC = new URLSearchParams(location.search).get("line") || "line70";
    const koki = lineC === "s21" ? (routeData.stops || []).find(s => /Kőbánya-Kispest/.test(s.name)) : null;
    const wiredTo = koki ? koki.km * 1000 + 250 : Infinity;
    const cut = pts => pts.filter(p => p[3] <= wiredTo);
    const run = buildCatenary(cut(routeData.track_down), cut(routeData.track_up), yardSpan);
    const yard = buildYardWires(wiredTo === Infinity ? railWays : railWays.filter(w => {
      const q = w.pts[(w.pts.length / 2) | 0], r = q && railDistAt(q[0], q[1]);
      return !r || r.m <= wiredTo;
    }), yardYAt);
    const V = new Float32Array(run.verts.length + yard.verts.length);
    const C = new Float32Array(run.cols.length + yard.cols.length);
    V.set(run.verts); V.set(yard.verts, run.verts.length);
    C.set(run.cols); C.set(yard.cols, run.cols.length);
    return colouredVao({ verts: V, cols: C, count: V.length / 3 });
  })();

  // ---- buffer stops
  // A way whose end has no other way's point within three metres has stopped
  // rather than continued — but so has a way the extraction box cut off, and
  // twelve of those share a chainage at Nyugati. Only ends within 60 m of the
  // start of the route are taken, which is the one place on this line where
  // track genuinely ends: the terminus.
  const bufferEnds = (() => {
    const CELL = 5, grid = new Map();
    const key = (x, y) => Math.floor(x / CELL) + "," + Math.floor(y / CELL);
    railWays.forEach((w, wi) => {
      for (const p of w.pts) {
        const k = key(p[0], p[1]);
        const a = grid.get(k);
        if (a) a.push([wi, p[0], p[1]]); else grid.set(k, [[wi, p[0], p[1]]]);
      }
    });
    const alone = (wi, p) => {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const [wj, qx, qy] of grid.get(
              key(p[0] + dx * CELL, p[1] + dy * CELL)) || []) {
          if (wj === wi) continue;
          if ((qx - p[0]) ** 2 + (qy - p[1]) ** 2 < 9) return false;
        }
      }
      return true;
    };
    const m0 = routeData.track_down[0][3], out = [];
    for (let wi = 0; wi < railWays.length; wi++) {
      const w = railWays[wi];
      if (w.cls !== 0 || w.pts.length < 2) continue;
      for (const [p, inward] of [[w.pts[0], w.pts[1]],
                                 [w.pts[w.pts.length-1], w.pts[w.pts.length-2]]]) {
        if (p[2] > m0 + 60 || p[3] > 60) continue;
        if (!alone(wi, p)) continue;
        const dx = inward[0] - p[0], dy = inward[1] - p[1];
        const L = Math.hypot(dx, dy) || 1;
        out.push({ x: p[0], z: p[1], fx: dx / L, fy: dy / L,
                   y: ptAt(routeData.track_down, Math.max(m0, p[2]))[2] });
      }
    }
    return out;
  })();
  const bufMesh = colouredVao(buildBufferStops(bufferEnds));

  await step(tt("épületek, nevezetességek", "buildings and landmarks"), 0.9);
  // ---- trainsheds
  // The bake gives every large station building a barrel vault over its whole
  // footprint. Nyugati's footprint is the entire station — 153 m by 122 m —
  // so that vault is a tunnel. These polygons keep their walls and hand the
  // roof to `buildTrainsheds`, which takes the span from the platform roads.
  const shedIdx = new Set(), sheds = [];
  polyList.forEach((B, i) => {
    if (B.cls !== 2) return;
    let area = 0;
    for (let k = 0; k < B.pts.length; k++) {
      const a = B.pts[k], b = B.pts[(k + 1) % B.pts.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (Math.abs(area) / 2 < 4000) return;         // a hall, not a booking office
    // the track frame at this building's own chainage
    let best = Infinity, bm = 0;
    for (const q of routeData.track_down) {
      const d = (q[0] - B.cx) ** 2 + (q[1] - B.cy) ** 2;
      if (d < best) { best = d; bm = q[3]; }
    }
    // Only the main Eiffel hall directly spanning the buffer tracks at Nyugati (km 0..0.3)
    if (Math.sqrt(best) > 50 || bm > 320) return;
    const c = ptAt(routeData.track_down, bm), t = tanAt(routeData.track_down, bm);
    if (Math.abs(B.cx - c[0]) > 42) return;
    // Which way does the shed run? The track tangent is the obvious answer and
    // it is wrong by ten degrees at Nyugati, where the platforms fan out in the
    // throat while the hall stands square to its own walls — so the vault sat
    // visibly skew to the building under it. The footprint knows better: take
    // the edge-length-weighted direction of its walls, in doubled angle so an
    // edge and the one opposite reinforce rather than cancel. For Nyugati that
    // is 32 degrees, and 99% of the perimeter agrees with it or its
    // perpendicular. Where a footprint is not rectilinear enough to be sure,
    // fall back to the track.
    let sx = 0, sy = 0, tot = 0;
    for (let k = 0; k < B.pts.length; k++) {
      const a = B.pts[k], b2 = B.pts[(k + 1) % B.pts.length];
      const ex = b2[0] - a[0], ey = b2[1] - a[1];
      const L = Math.hypot(ex, ey);
      if (L < 1) continue;
      const th = Math.atan2(ey, ex);
      sx += L * Math.cos(2 * th); sy += L * Math.sin(2 * th); tot += L;
    }
    let ang = 0.5 * Math.atan2(sy, sx);
    let agree = 0;
    for (let k = 0; k < B.pts.length; k++) {
      const a = B.pts[k], b2 = B.pts[(k + 1) % B.pts.length];
      const ex = b2[0] - a[0], ey = b2[1] - a[1];
      const L = Math.hypot(ex, ey);
      if (L < 1) continue;
      const th = Math.atan2(ey, ex);
      let off = Math.abs(((th - ang + Math.PI / 2) % Math.PI) - Math.PI / 2);
      if (off < 0.21 || Math.abs(off - Math.PI / 2) < 0.21) agree += L;
    }
    // Disambiguate cross-wall vs longitudinal axis with track tangent t
    const dotT = Math.cos(ang) * t[0] + Math.sin(ang) * t[1];
    const crossT = -Math.sin(ang) * t[0] + Math.cos(ang) * t[1];
    if (Math.abs(crossT) > Math.abs(dotT)) ang += Math.PI / 2;
    if (Math.cos(ang) * t[0] + Math.sin(ang) * t[1] < 0) ang += Math.PI;
    const tAng = Math.atan2(t[1], t[0]);
    if (Math.abs(((ang - tAng + Math.PI) % (2 * Math.PI)) - Math.PI) > 0.15) ang = tAng;
    const fx = t[0], fy = t[1];
    const nx = -fy, ny = fx;
    let u0 = Infinity, u1 = -Infinity;
    for (const q of B.pts) {
      const u = (q[0] - c[0]) * fx + (q[1] - c[1]) * fy;
      if (u < u0) u0 = u; if (u > u1) u1 = u;
    }
    // how wide the platform group is here — the number the footprint has not
    // got. Sampled along the shed, since one bucket can be a thin one.
    let vLo = Infinity, vHi = -Infinity;
    for (let u = u0; u <= u1; u += 30) {
      const e = yardSpan.spread(bm + u, 40);
      if (e) { vLo = Math.min(vLo, e[0]); vHi = Math.max(vHi, e[1]); }
    }
    if (!isFinite(vLo)) { vLo = -6; vHi = 6; }
    shedIdx.add(i);
    sheds.push({ c, fx, fy, nx, ny, u0, u1, vLo, vHi,
                 railY: c[2], eave: demAt(B.cx, B.cy) - 0.8 + B.h });
  });

  const shedMesh = colouredVao(buildTrainsheds(sheds));
  // chimneys, silos, tanks, water towers, masts — the vertical things that
  // are not buildings and so were never in the data until they were asked for
  const structList = (ctx.structs && ctx.structs.data) ? unpackStructures(ctx.structs.data, ctx.structs.count) : [];
  const stMesh = structList.length
    ? buildStructures(structList, demAt)
    : { verts: new Float32Array(0), cols: new Float32Array(0), count: 0 };
  const structMesh = colouredVao(stMesh);
  const polyB = polyList.length
    ? buildPolyBuildings(polyList, demAt, shedIdx)
    : { verts: new Float32Array(0), cols: new Float32Array(0), count: 0, cells: [] };
  const polyMesh = colouredVao(polyB);
  // OSM 3D building parts: the Parliament, the Bazilika, the Opera … from the data
  const partsMesh = colouredVao(buildParts(ctx.parts, demAt));

  // ---- the collision world (collide.js): the same footprints, parts and
  // structures, as solids the car, the plane and the drone run into
  const solids = new Solids();
  const groundSpan = (pts) => {
    let lo = Infinity, hi = -Infinity;
    const st = Math.max(1, (pts.length / 10) | 0);
    for (let k = 0; k < pts.length; k += st) {
      const d = demAt(pts[k][0], pts[k][1]);
      if (isFinite(d)) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
    }
    return [lo, hi];
  };
  const solidPolys = (polys, owner, skip) => polys.forEach((B, i) => {
    if (skip && skip.has(i)) return;
    const [lo, hi] = groundSpan(B.pts);
    if (isFinite(lo)) solids.addPoly(B.pts, lo - 2, hi + B.h + (B.rh || 0) * 0.5, owner);
  });
  const solidParts = (parts, owner) => (parts || []).forEach(p => {
    const pts = [];
    for (let i = 0; i < p.p.length; i += 2) pts.push([p.x + p.p[i] / 10, p.y + p.p[i + 1] / 10]);
    const [lo] = groundSpan(pts);
    if (!isFinite(lo)) return;
    solids.addPoly(pts, (p.mh || 0) > 2 ? lo + p.mh : lo - 2, lo + p.h, owner);
  });
  solidPolys(polyList, "base", shedIdx);
  solidParts(ctx.parts, "base");
  for (const q of structList) {
    const g = demAt(q.x, q.y);
    if (isFinite(g) && q.h > 3) solids.addCircle(q.x, q.y, Math.max(1.2, q.r), g - 1, g + q.h, "base");
  }

  await step("Budapest", 0.95);
  // ---- the city layer (city.js, tools/bake_city.py): 1 km tiles of the whole
  // of central Budapest, loaded around the camera. The line's own context
  // leaves the city box to them; its roads are listed by id so a tile does
  // not draw them twice.
  // ---- what the driveable car stands on. Bridges and underpasses from the
  // line's roads and every loaded city tile, on a 60 m grid; elsewhere the
  // road surface the road mesh is laid on (terrain graded near the line).
  const driveGrid = new Map();
  const addDriveWays = (ways) => {
    for (const w of ways) {
      const hw = (w.lanes ? Math.max(6, w.lanes * 3.25) : [11, 8.5, 7.5, 6.5, 5.5, 3.6, 3.2][w.cls] || 6) * 0.5 + 0.8;
      for (let k = 1; k < w.pts.length; k++) {
        const a = w.pts[k - 1], b = w.pts[k];
        const i0 = Math.floor(Math.min(a[0], b[0]) / 60), i1 = Math.floor(Math.max(a[0], b[0]) / 60);
        const j0 = Math.floor(Math.min(a[1], b[1]) / 60), j1 = Math.floor(Math.max(a[1], b[1]) / 60);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const key = i + "," + j;
          if (!driveGrid.has(key)) driveGrid.set(key, []);
          driveGrid.get(key).push([w, k, hw]);
        }
      }
    }
  };
  const removeDriveWays = (ways) => {
    const gone = new Set(ways);
    for (const w of ways) for (let k = 1; k < w.pts.length; k++) {
      const a = w.pts[k - 1], b = w.pts[k];
      const i0 = Math.floor(Math.min(a[0], b[0]) / 60), i1 = Math.floor(Math.max(a[0], b[0]) / 60);
      const j0 = Math.floor(Math.min(a[1], b[1]) / 60), j1 = Math.floor(Math.max(a[1], b[1]) / 60);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const key = i + "," + j, L = driveGrid.get(key);
        if (!L) continue;
        const keep = L.filter(e => !gone.has(e[0]));
        if (keep.length) driveGrid.set(key, keep); else driveGrid.delete(key);
      }
    }
  };
  const onRoadCarriageway = (x, y, margin = 0.5) => {
    const i = Math.floor(x / 60), j = Math.floor(y / 60);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const segs = driveGrid.get((i + di) + "," + (j + dj));
        if (!segs) continue;
        for (let s = 0; s < segs.length; s++) {
          const [w, k, hw] = segs[s];
          const a = w.pts[k - 1], b = w.pts[k];
          const ex = b[0] - a[0], ey = b[1] - a[1], ll = ex * ex + ey * ey || 1;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / ll));
          const dx = a[0] + ex * t - x, dy = a[1] + ey * t - y;
          if (dx * dx + dy * dy < (hw + margin) * (hw + margin)) return true;
        }
      }
    }
    return false;
  };
  window.__onRoadCarriageway = onRoadCarriageway;
  addDriveWays(roadWays);

  let city = null;
  const placeNames = new Set((routeData.places || []).map(p => p.name));
  const ctxRoadIds = new Set((ctx.roads && ctx.roads.ids) || []);
  try {
    const cityIndex = await fetch((window.DATA_BASE || "data/") + "city/index.json").then(r => r.ok ? r.json() : null);
    if (cityIndex) {
      const widths = cityIndex.widths;
      const waterAt = (north) => wA + wB * north;
      city = new CityTiles(cityIndex, assets.world.near, (T) => {
        const { body, tx, kx, ky } = T;
        const out = {};
        const polys = body.polys.count ? unpackPolyBuildings(body.polys.data, body.polys.count, body.polys.colours) : [];
        for (const p of polys) {
          [p.cx, p.cy] = tx(p.cx, p.cy);
          p.pts = p.pts.map(q => tx(q[0], q[1]));
        }
        if (polys.length) out.polys = colouredVao(buildPolyBuildings(polys, demAt, null));
        out.owner = T.t.file;
        solidPolys(polys, out.owner, null);
        if (body.parts && body.parts.length) {
          const parts = body.parts.map(p => {
            const [x, y] = tx(p.x, p.y);
            return { ...p, x, y, p: p.p.map((v, i) => v * (i % 2 ? ky : kx)) };
          });
          out.parts = colouredVao(buildParts(parts, demAt));
          solidParts(parts, out.owner);
        }
        if (body.roads.count) {
          const ways = unpackRoads(body.roads.data, body.roads.count, true);
          const keep = [];
          ways.forEach((w, i) => {
            if (ctxRoadIds.has(body.roads.ids[i])) return;
            w.pts = w.pts.map(q => tx(q[0], q[1]));
            keep.push(w);
          });
          if (keep.length) {
            out.roads = colouredVao(buildRoads(keep, widths, demAt, waterAt, railDistAt));
            out.ways = keep;
            if (roadTraffic && roadTraffic.addWays) roadTraffic.addWays(keep, T.t.file);
            addDriveWays(keep);
          }
        }
        // the extras (bake_cityx.py): rails, trams, pipelines, solar farms;
        // industrial structures and pylons; and names for the labels
        if (body.x) {
          const ex = buildCityExtras(body.x, tx, demAt, waterAt, railDistAt, onModelBridge);
          if (ex.count) out.x = colouredVao(ex);
          if (body.x.structs && body.x.structs.length) {
            const list = body.x.structs.map(([sx, sy, h, r, cls]) => { const [x, y] = tx(sx, sy); return { x, y, h, r, cls }; });
            out.st = colouredVao(buildStructures(list, demAt));
            for (const q of list) {
              const g = demAt(q.x, q.y);
              if (isFinite(g) && q.h > 3) solids.addCircle(q.x, q.y, Math.max(1.2, q.r), g - 1, g + q.h, out.owner || T.t.file);
            }
          }
          for (const [name, kind, lx, ly, rank] of body.x.labels || []) {
            if (placeNames.has(name)) continue;
            const [x, y] = tx(lx, ly);
            placeNames.add(name);
            routeData.places.push({ name, kind, rank: rank || 2, xy: [x, y], h: demAt(x, y) });
          }
        }
        // the city's own trees and park planting (BP Fatár, bake_trees.py)
        if (body.tr && body.tr.length) {
          const tr = body.tr, inst = new Float32Array(tr.length / 3 * 8);
          let n = 0;
          for (let i = 0; i < tr.length; i += 3) {
            const [x, y] = tx(tr[i] / 2, tr[i + 1] / 2);
            if (onRoadCarriageway(x, y, 1.2) || trackDist(x, y) < 3.5) continue;   // (nor on the running line)
            const g = demAt(x, y);
            if (!isFinite(g)) continue;
            const code = tr[i + 2], o = n * 8;
            inst[o] = x; inst[o + 1] = g; inst[o + 2] = -y; inst[o + 3] = code & 31;
            inst[o + 4] = ((code >> 5) & 63) / 2; inst[o + 5] = ((code >> 11) & 63) / 2;
            inst[o + 6] = (Math.sin(x * 3.17 + y * 7.91) * 43758.5453) % 1 * 0.5 + 0.5;
            n++;
          }
          if (n) out.tr = treeVao(inst.subarray(0, n * 8));
        }
        if (body.pk && body.pk.length) {
          const list = [];
          for (let i = 0; i < body.pk.length; i += 3) {
            const [x, y] = tx(body.pk[i] / 2, body.pk[i + 1] / 2);
            if (onRoadCarriageway(x, y, 0.8)) continue;
            list.push([x, y, body.pk[i + 2]]);
          }
          const m = buildParkThings(list, demAt);
          if (m.count) out.pk = colouredVao(m);
        }
        if (body.portals && body.portals.length) {
          const ps = body.portals.map(a => { const [x, y] = tx(a.x, a.y); return { ...a, x, y }; });
          out.lm = colouredVao(buildLandmarks(ps, demAt, waterAt, null));
        }
        return out;
      }, (m) => { freeVao(m.polys); freeVao(m.parts); freeVao(m.roads); freeVao(m.lm); freeVao(m.x); freeVao(m.st); freeVao(m.tr); freeVao(m.pk);
                  // the tile's roads leave the traffic and the car's grid too
                  // (they piled up for as long as you flew about)
                  if (m.ways) { if (roadTraffic && roadTraffic.removeOwner) roadTraffic.removeOwner(m.owner); removeDriveWays(m.ways); }
                  if (m.owner) solids.removeOwner(m.owner); });
      if (state.cityR) city.R = state.cityR;
      window.__setCityR = (r) => { city.R = r; };
    }
  } catch (e) { console.warn("city layer unavailable", e); }
  // the Királyréti kisvasút (kisvasut.js), where this line's world holds it
  let kisvasut = null, kisTrack = null;
  const kisDyn = dynamicVao();
  try {
    const kd = await fetch(`${window.DATA_BASE || "data/"}kisvasut.json`).then(r => r.ok ? r.json() : null);
    const lineK = new URLSearchParams(location.search).get("line") || "line70";
    if (kd && lineK === "line70") {
      kisvasut = new Kisvasut(kd, demAt);
      kisTrack = colouredVao(kisvasut.track());
      // nothing grows on its track: the cover texels along it get alpha 0,
      // which the vegetation reads as "cleared" (the cover image is RGB, so
      // alpha was spare)
      for (let s = 0; s <= kisvasut.len; s += 6) {
        const p = kisvasut.at(s);
        const u = (p.x / nearSpanX * texCover.w) | 0, v = ((1 - p.n / nearSpanY) * texCover.h) | 0;
        if (u >= 0 && v >= 0 && u < texCover.w && v < texCover.h) texCover.data[(v * texCover.w + u) * 4 + 3] = 0;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texCover.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, texCover.w, texCover.h, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                    new Uint8Array(texCover.data.buffer));
      for (const st of kisvasut.stops) {
        const p = kisvasut.at(st.s);
        routeData.places.push({ name: `${st.name} (kisvasút)`, kind: "landmark", rank: 2, xy: [p.x, p.n], h: p.y });
      }
    }
  } catch (e) { console.warn("kisvasút unavailable", e); }

  // Urban paved squares & plazas: stone paving (class 16), cleared of wild grass/trees
  try {
    const nr = assets.world.near;
    const [mlat, mlon] = metresPerDegree(nr.frame_lat ?? (nr.south + nr.north) / 2);
    const urbanPlazas = [
      { name: "Széll Kálmán tér", lat: 47.50745, lon: 19.02566, r: 135 },
      { name: "Déli pályaudvar", lat: 47.50058, lon: 19.02458, r: 90 },
      { name: "Nyugati tér", lat: 47.51080, lon: 19.05580, r: 85 },
      { name: "Blaha Lujza tér", lat: 47.49620, lon: 19.06990, r: 90 },
      { name: "Deák Ferenc tér", lat: 47.49810, lon: 19.05380, r: 110 },
      { name: "Batthyány tér", lat: 47.50650, lon: 19.03920, r: 85 },
      { name: "Móricz Zsigmond körtér", lat: 47.47740, lon: 19.04630, r: 95 },
      { name: "Szent Gellért tér", lat: 47.48360, lon: 19.05260, r: 75 },
      { name: "Fővám tér", lat: 47.48720, lon: 19.05690, r: 85 },
      { name: "Jászai Mari tér", lat: 47.51320, lon: 19.04780, r: 90 }
    ];
    for (const pl of urbanPlazas) {
      const px = (pl.lon - nr.west) * mlon, py = (pl.lat - nr.south) * mlat;
      const u0 = Math.max(0, Math.floor((px - pl.r) / nearSpanX * texCover.w));
      const u1 = Math.min(texCover.w - 1, Math.ceil((px + pl.r) / nearSpanX * texCover.w));
      const v0 = Math.max(0, Math.floor((1 - (py + pl.r) / nearSpanY) * texCover.h));
      const v1 = Math.min(texCover.h - 1, Math.ceil((1 - (py - pl.r) / nearSpanY) * texCover.h));
      for (let v = v0; v <= v1; v++) {
        const my = (1 - (v + 0.5) / texCover.h) * nearSpanY;
        for (let u = u0; u <= u1; u++) {
          const mx = (u + 0.5) / texCover.w * nearSpanX;
          if (Math.hypot(mx - px, my - py) <= pl.r) {
            const idx = (v * texCover.w + u) * 4;
            texCover.data[idx] = 16;     // class 16: paved plaza stone
            texCover.data[idx + 3] = 0; // cleared vegetation
          }
        }
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texCover.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, texCover.w, texCover.h, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                  new Uint8Array(texCover.data.buffer));
  } catch (e) { console.warn("urban plazas cover unavailable", e); }

  // Budapest's trams (trams.js): 1, 2, 3, 4, 6, 56, 61 on their OSM routes
  let trams = null;
  const tramDyn = dynamicVao();
  const tlDyn = dynamicVao();                 // traffic signals near the camera
  const walkDyn = dynamicVao();               // people walking near the camera
  try {
    const td = await fetch(`${window.DATA_BASE || "data/"}trams.json`).then(r => r.ok ? r.json() : null);
    if (td) trams = new Trams(td, assets.world.near, demAt, (n) => wA + wB * n, (x, n) => coverAt(x, n) === 9);
  } catch (e) { console.warn("trams unavailable", e); }
  // the line's own extras (bake_linex.py): names along the whole line, the
  // quarries, solar farms and pipelines outside the city
  // horses in their paddocks (tools/bake_horses.py), within 5 km of the line
  let horsesMesh = null;
  try {
    const hd = await fetch(`${window.DATA_BASE || "data/"}horses.json`).then(r => r.ok ? r.json() : null);
    if (hd) {
      const nr = assets.world.near, [mlat, mlon] = metresPerDegree(nr.frame_lat ?? (nr.south + nr.north) / 2);
      const pl = hd.places.map(([la, lo]) => ({ x: (lo - nr.west) * mlon, n: (la - nr.south) * mlat }))
        .filter(q => { const T = routeData.track_down;
          for (let i = 0; i < T.length; i += 25) if (Math.abs(T[i][0] - q.x) < 5000 && Math.abs(T[i][1] - q.n) < 5000) return true;
          return false; });
      const hm = buildHorses(pl, demAt, hd.mesh);
      if (hm.count) horsesMesh = colouredVao(hm);
      state.horsePlaces = pl;
    }
  } catch (e) { console.warn("horses unavailable", e); }
  // Authentic Budapest and regional streets spatial index (tools/bake_streets.py)
  let streetsIndex = null;
  try {
    const sd = await fetch(`${window.DATA_BASE || "data/"}streets.json`).then(r => r.ok ? r.json() : null);
    if (sd && sd.names && sd.pts) {
      const nr = assets.world.near, [mlat, mlon] = metresPerDegree(nr.frame_lat ?? (nr.south + nr.north) / 2);
      const cellSize = 250;
      const grid = new Map();
      for (const [nameIdx, la, lo] of sd.pts) {
        const x = (lo - nr.west) * mlon, n = (la - nr.south) * mlat;
        const cx = Math.floor(x / cellSize), cz = Math.floor(n / cellSize);
        const k = cx * 100003 + cz;
        let bucket = grid.get(k);
        if (!bucket) { bucket = []; grid.set(k, bucket); }
        bucket.push({ name: sd.names[nameIdx], x, n });
      }
      streetsIndex = {
        lookup: (x, n, maxDist = 95) => {
          const cx = Math.floor(x / cellSize), cz = Math.floor(n / cellSize);
          let best = null, bestD = maxDist;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              const bucket = grid.get((cx + dx) * 100003 + (cz + dz));
              if (!bucket) continue;
              for (const pt of bucket) {
                const d = Math.hypot(pt.x - x, pt.n - n);
                if (d < bestD) { bestD = d; best = pt.name; }
              }
            }
          }
          return best;
        }
      };
      window.__streetsIndex = streetsIndex;
    }
  } catch (e) { console.warn("streets unavailable", e); }
  // the walls beside the line (tools/bake_walls.py), and then the graffiti
  // on them and on the standing wagons
  let wallsMesh = null;
  try {
    if (lineEx && (lineEx.walls || []).length) {
      const wm = buildWalls(clearOfTrack(lineEx.walls, 2.6), demAt);
      if (wm.count) wallsMesh = colouredVao(wm);
    }
  } catch (e) { console.warn("walls unavailable", e); }
  makeGraffiti();
  // street furniture (tools/bake_street.py for the places, bake_props.py for
  // the models): OSM's benches, litter bins and vending machines within
  // 150 m of the line, as textured models drawn with the cars' program.
  // Built once. A bench with no OSM direction faces the track if it is near
  // one (a platform bench), else any way.
  let propSet = null;
  (async () => {
    try {
      const list = lineEx && lineEx.street;
      if (!list || !list.length) return;
      const base = (window.DATA_BASE || "data/") + "models/";
      const meta = await fetch(base + "props.json").then(r => r.json());
      const img = await loadImage(base + meta.atlas);
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);
      const KINDS = ["bench", "bin", "vending", "container", "clock", "fence", "person"];
      const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
      const inst = meta.models.map(() => []);
      list.forEach(([x, n, k, dir], i) => {
        const cand = []; meta.models.forEach((m, mi) => { if (m.kind === KINDS[k]) cand.push(mi); });
        if (!cand.length) return;
        let y = demAt(x, n); if (!isFinite(y)) return;
        let yaw = dir >= 0 ? dir * Math.PI / 180 : hash(i + 0.7) * 6.283;
        const rd = railDistAt(x, n);
        if (onRoadCarriageway(x, n, 0.8) && (!rd || rd.d >= 16)) return;
        if (rd && rd.d < 16) {
          // on or by a platform: at platform height, facing the track. OSM's
          // bench and our platform rarely agree to the metre, so it is moved
          // onto the nearest platform cross-section within 8 m.
          y = Math.max(y, rd.railY + 0.5);
          let best = null, bd = 8;
          for (const q of platSecs) {
            const wx = q[2] - q[0], wy = q[3] - q[1], L2 = wx * wx + wy * wy || 1;
            const t = Math.max(0.25, Math.min(0.75, ((x - q[0]) * wx + (n - q[1]) * wy) / L2));
            const d = Math.hypot(q[0] + wx * t - x, q[1] + wy * t - n);
            // (a bin goes a step along the platform, or it lands in the bench)
            const al = k === 1 ? 1.5 / Math.sqrt(L2) : 0;
            if (d < bd) { bd = d; best = [q[0] + wx * t - wy * al, q[1] + wy * t + wx * al, q[4]]; }
          }
          if (best) { x = best[0]; n = best[1]; y = best[2]; }
          if (dir < 0) { const q = route.at(rd.m); yaw = Math.atan2(q[0] - x, q[1] - n); }
        }
        inst[cand[Math.floor(hash(i + 0.3) * cand.length)]].push(x, y, -n, yaw, 1, 0, 0, 0);
      });

      // Populate platform furniture and passengers along station platforms lacking OSM nodes
      if (platSecs && platSecs.length) {
        const step = 6;
        for (let i = 2; i < platSecs.length; i += step) {
          const q = platSecs[i];
          const wx = q[2] - q[0], wy = q[3] - q[1], L2 = wx * wx + wy * wy || 1;
          const px = (q[0] + q[2]) * 0.5, pn = (q[1] + q[3]) * 0.5, py = q[4];
          let close = false;
          for (const arr of inst) {
            for (let j = 0; j < arr.length; j += 8) {
              if (Math.hypot(arr[j] - px, -arr[j + 2] - pn) < 14) { close = true; break; }
            }
            if (close) break;
          }
          if (!close) {
            const rd = railDistAt(px, pn);
            let yaw = 0;
            if (rd && isFinite(rd.m)) {
              const rpt = route.at(rd.m);
              yaw = Math.atan2(rpt[0] - px, rpt[1] - pn);
            }
            const benchCand = []; meta.models.forEach((m, mi) => { if (m.kind === "bench") benchCand.push(mi); });
            if (benchCand.length) {
              const mi = benchCand[Math.floor(hash(i + 0.1) * benchCand.length)];
              inst[mi].push(px, py, -pn, yaw, 1, 0, 0, 0);
            }
            const binCand = []; meta.models.forEach((m, mi) => { if (m.kind === "bin") binCand.push(mi); });
            if (binCand.length) {
              const al = 2.5 / Math.sqrt(L2);
              const bx = px - wy * al, bn = pn + wx * al;
              const bmi = binCand[Math.floor(hash(i + 0.8) * binCand.length)];
              inst[bmi].push(bx, py, -bn, yaw, 1, 0, 0, 0);
            }
            // Passengers waiting at station platforms
            const personCand = []; meta.models.forEach((m, mi) => { if (m.kind === "person") personCand.push(mi); });
            if (personCand.length) {
              const p1 = personCand[Math.floor(hash(i + 0.4) * personCand.length)];
              const p1Off = (hash(i + 0.5) - 0.5) * 2.2;
              const p1x = px + wy * (p1Off / Math.sqrt(L2)), p1n = pn - wx * (p1Off / Math.sqrt(L2));
              const p1Yaw = yaw + (hash(i + 0.6) - 0.5) * 0.8;
              inst[p1].push(p1x, py, -p1n, p1Yaw, 1, 0, 0, 0);
              if (hash(i + 0.9) > 0.45) {
                const p2 = personCand[Math.floor(hash(i + 0.7) * personCand.length)];
                const p2Off = p1Off + (hash(i + 0.8) > 0.5 ? 1.1 : -1.1);
                const p2x = px + wy * (p2Off / Math.sqrt(L2)), p2n = pn - wx * (p2Off / Math.sqrt(L2));
                const p2Yaw = p1Yaw + (hash(i + 0.95) - 0.5) * 1.6;
                inst[p2].push(p2x, py, -p2n, p2Yaw, 1, 0, 0, 0);
              }
            }
          }
        }
      }
      const f32 = b64 => new Float32Array(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
      meta.models.forEach((m, mi) => {
        m.n = inst[mi].length / 8;
        if (!m.n) return;
        m.vao = gl.createVertexArray(); gl.bindVertexArray(m.vao);
        for (const [loc, key, nn] of [[0, "pos", 3], [1, "uv", 2], [2, "nrm", 3]]) {
          const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
          gl.bufferData(gl.ARRAY_BUFFER, f32(m[key]), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, nn, gl.FLOAT, false, 0, 0);
        }
        const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(inst[mi]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(3, 1);
        gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(4, 1);
        gl.bindVertexArray(null);
      });
      meta.tex = tex;
      propSet = meta;
      state.propsN = meta.models.reduce((a, m) => a + (m.n || 0), 0);
      state.propList = list;
    } catch (e) { console.warn("street furniture unavailable", e); }
  })();
  function drawProps(vp, eye, sunDir, pal, lift) {
    if (!propSet) return;
    gl.useProgram(pMdl.p);
    gl.uniformMatrix4fv(pMdl.u.uVP, false, vp);
    gl.uniform3fv(pMdl.u.uEye, eye);
    gl.uniform2f(pMdl.u.uGrid, 1, 1);
    gl.uniform1f(pMdl.u.uPull, 0.003);
    gl.uniform3fv(pMdl.u.uSunDir, sunDir);
    gl.uniform3fv(pMdl.u.uSunCol, pal.sun);
    gl.uniform3fv(pMdl.u.uSkyCol, pal.zenith);
    gl.uniform3fv(pMdl.u.uFogCol, pal.horizon);
    gl.uniform1f(pMdl.u.uFogDensity, pal.fog);
    gl.uniform1f(pMdl.u.uLift, lift);
    gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D, propSet.tex);
    gl.uniform1i(pMdl.u.uTex, 12);
    for (const m of propSet.models) {
      if (!m.n) continue;
      gl.bindVertexArray(m.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, m.count, m.n);
    }
    gl.activeTexture(gl.TEXTURE0);
  }
  let lineExtras = null, lineStructs = null;
  try {
    const ex = lineEx;
    if (ex) {
      const waterAtL = (north) => wA + wB * north;
      const m = buildCityExtras(ex, (x, y) => [x, y], demAt, waterAtL, railDistAt, onModelBridge);
      if (m.count) lineExtras = colouredVao(m);
      // structures outside the city (the oil wells' pumpjacks by S21)
      if (ex.structs && ex.structs.length) {
        const list = ex.structs.map(([x, y, h, r, cls]) => ({ x, y, h, r, cls }));
        const sm = buildStructures(list, demAt);
        if (sm.count) lineStructs = colouredVao(sm);
      }
      for (const [name, kind, x, y, rank] of ex.labels || []) {
        if (placeNames.has(name)) continue;
        placeNames.add(name);
        routeData.places.push({ name, kind, rank: rank || 2, xy: [x, y], h: demAt(x, y) });
      }
    }
  } catch (e) { console.warn("line extras unavailable", e); }

  // ---- what the driveable car stands on (driveGrid hoisted above).
  const carSurf = (x, y, nearY) => {
    let best = null, onRoad = false;
    for (const [w, k, hw] of driveGrid.get(Math.floor(x / 60) + "," + Math.floor(y / 60)) || []) {
      const a = w.pts[k - 1], b = w.pts[k];
      const ex = b[0] - a[0], ey = b[1] - a[1], ll = ex * ex + ey * ey || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / ll));
      if (Math.hypot(a[0] + ex * t - x, a[1] + ey * t - y) > hw) continue;
      const h = w.deckAt ? w.deckAt(x, y) + 0.05 : w.floorAt ? w.floorAt(x, y) : null;
      if (h === null) { onRoad = true; continue; }
      // under a bridge and on it are the same x, y: take the one you are at
      if (!best || Math.abs(h - nearY) < Math.abs(best.y - nearY)) best = { y: h, bridge: !!w.deckAt };
    }
    // on a road: the surface the road is laid on; off it: the ground itself
    const g = onRoad ? roadSurfaceAt(demAt, railDistAt, x, y) : demAt(x, y) + 0.05;
    if (best && (!isFinite(nearY) || nearY === 0 || Math.abs(best.y - nearY) < Math.abs(g - nearY) + 1.5)) return best;
    const wl = wA + wB * y;
    return { y: g, water: coverAt(x, y) === 9 && g < wl + 0.8 };
  };
  const polyCells = polyB.cells;
  // vehicles on those same ways, which is what the crossing booms are for
  const roadTraffic = new RoadTraffic(
    roadWays, routeData.crossings,
    m => ptAt(routeData.track_down, m), demAt);
  roadTraffic.craterDip = craterDipAt;
  try {
    // traffic signals (tools/bake_traffic_lights.py), in this line's frame
    const tlD = await fetch(`${window.DATA_BASE || "data/"}traffic_lights.json`).then(r => r.ok ? r.json() : null);
    if (tlD) {
      const nr = assets.world.near, [mlat, mlon] = metresPerDegree(nr.frame_lat ?? (nr.south + nr.north) / 2);
      roadTraffic.setLights(tlD.lights.map(([la, lo, r]) => ({ x: (lo - nr.west) * mlon, n: (la - nr.south) * mlat, r })));
    }
  } catch (e) { console.warn("traffic lights unavailable", e); }
  roadTraffic.dipAt = (x, y) => underpassDip(railDistAt, x, y);
  let roadRepop = 0;
  // the Danube's fairway, worked out from the land cover, and what is on it
  const riverTraffic = new RiverTraffic(
    danubeLane(routeData.track_down, coverAt, demAt));
  // The Danube ferries along this stretch, by the chainage they sit at.
  // Only the ones whose fairway is actually in the baked section will take;
  // Göd and Dunakeszi are here so they appear when the Budapest half is
  // built, rather than being forgotten.
  for (const [km, name] of [
    [48.6, "Nagymaros – Visegrád"],
    [34.4, "Vác – Szentendrei-sziget"],
    [24.0, "Göd – Szentendrei-sziget"],
    [18.6, "Dunakeszi – Horány"],
  ]) {
    const from = routeData.track_down[0][3] / 1000;
    const to = routeData.track_down[routeData.track_down.length - 1][3] / 1000;
    if (km < from + 0.4 || km > to - 0.4) continue;
    const p0 = ptAt(routeData.track_down, km * 1000);
    riverTraffic.addFerry(p0[0], p0[1], name);
  }

  // buildings: instanced boxes, bucketed so only what is near gets uploaded
  const bld = (ctx.buildings && ctx.buildings.data) ? unpackBuildings(ctx.buildings.data, ctx.buildings.count) : [];
  for (let i = 0; i < (ctx.buildings.count || 0); i++) {
    const o = i * 8, cx = bld[o], cn = bld[o + 1], hu = bld[o + 2], hv = bld[o + 3], ang = bld[o + 4];
    const c = Math.cos(ang), sn = Math.sin(ang);
    if (LITE && !nearLine(cx, cn)) continue;            // (no collision solid far from the line on a phone)
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
      [cx + u * hu * c - v * hv * sn, cn + u * hu * sn + v * hv * c]);
    const [lo, hi] = groundSpan(pts);
    if (isFinite(lo)) solids.addPoly(pts, lo - 2, hi + bld[o + 5], "base");
  }
  const CELL = 1000, bcells = new Map();
  for (let i = 0; i < (ctx.buildings.count || 0); i++) {
    const k = Math.floor(bld[i * 8] / CELL) + "," + Math.floor(bld[i * 8 + 1] / CELL);
    let a = bcells.get(k); if (!a) bcells.set(k, a = []);
    a.push(i);
  }
  const BMAX = 48000;
  const bInst = new Float32Array(BMAX * 8);
  const bldVao = gl.createVertexArray();
  gl.bindVertexArray(bldVao);
  const bBox = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bBox);
  gl.bufferData(gl.ARRAY_BUFFER, boxMesh(), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const bBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bBuf);
  gl.bufferData(gl.ARRAY_BUFFER, BMAX * 8 * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
  gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

  function gatherBuildings(ex, ez, radius) {
    let n = 0;
    const c0 = Math.floor((ex - radius) / CELL), c1 = Math.floor((ex + radius) / CELL);
    const r0 = Math.floor((ez - radius) / CELL), r1 = Math.floor((ez + radius) / CELL);
    const r2 = radius * radius;
    for (let cx = c0; cx <= c1 && n < BMAX; cx++)
      for (let cz = r0; cz <= r1 && n < BMAX; cz++) {
        const a = bcells.get(cx + "," + cz);
        if (!a) continue;
        for (const i of a) {
          const dx = bld[i * 8] - ex, dz = bld[i * 8 + 1] - ez;
          if (dx * dx + dz * dz > r2) continue;
          bInst.set(bld.subarray(i * 8, i * 8 + 8), n * 8);
          if (++n >= BMAX) break;
        }
      }
    return n;
  }

  await step(tt("képernyő", "screen"), 0.98);
  // ---- offscreen target
  // A half-float target so the scene can hold values above 1.0 and the output
  // stage decides what that looks like. Without it the sun, a lit cloud top
  // and a snowfield all clip at white and the only way to see the sky is to
  // darken the ground. Falls back to 8-bit where the extension is missing.
  const hdrOK = !!(gl.getExtension("EXT_color_buffer_half_float")
                   || gl.getExtension("EXT_color_buffer_float"));
  const HDR_FMT = hdrOK ? gl.RGBA16F : gl.RGBA8;
  const HDR_TYPE = hdrOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  const fbo = gl.createFramebuffer();
  const colorTex = gl.createTexture();
  // (a depth TEXTURE, not a renderbuffer: photo mode's depth of field reads it)
  const depthTex = gl.createTexture();
  function sizeTarget(w, h) {
    gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, HDR_FMT, w, h, 0, gl.RGBA, HDR_TYPE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  sizeTarget(RES.w, RES.h);

  // a second, smaller target for the planar reflection
  const rfbo = gl.createFramebuffer();
  const reflTex = gl.createTexture();
  const reflDepth = gl.createRenderbuffer();
  function sizeReflect(w, h) {
    gl.bindTexture(gl.TEXTURE_2D, reflTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, HDR_FMT, w, h, 0, gl.RGBA, HDR_TYPE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, reflDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rfbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, reflTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, reflDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  const REFL = { w: 320, h: 180 };
  function fitReflect() {
    // half the main target, so the screen-space lookup is 1:1 in aspect
    REFL.w = Math.max(160, RES.w >> 1);
    REFL.h = Math.max(90, RES.h >> 1);
    sizeReflect(REFL.w, REFL.h);
  }
  fitReflect();

  // bloom: bright-pass into a quarter-size target, then a separable blur
  const BLOOM = { w: 1, h: 1 };
  const bloomFbo = [gl.createFramebuffer(), gl.createFramebuffer()];
  const bloomTex = [gl.createTexture(), gl.createTexture()];
  function sizeBloom(w, h) {
    BLOOM.w = Math.max(8, w >> 2); BLOOM.h = Math.max(8, h >> 2);
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, bloomTex[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, HDR_FMT, BLOOM.w, BLOOM.h, 0, gl.RGBA, HDR_TYPE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFbo[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bloomTex[i], 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  sizeBloom(RES.w, RES.h);

  // Sampling the reflection texture while rendering into it is a feedback
  // loop and the driver rejects the draw. During the reflection pass the
  // water samples this instead.
  const dummyTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, dummyTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([40, 70, 80, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const nearStep = world.near.step_m, farStep = world.far.step_m;
  const mlat = routeData.origin.mlat, mlon = routeData.origin.mlon;
  const farOffset = [
    (routeData.origin.lon - world.far.west) * mlon,
    (routeData.origin.lat - world.far.south) * mlat,
  ];
  // The Danube falls about 86 mm per kilometre — 96.0 m at Nyugati against
  // 100.1 m by Szob — fitted at bake time from the height of the pixels the
  // cover raster calls water. A single constant was 8 m too high at the
  // Budapest end, which put Margitsziget and both banks under the river.
  const WA = (world.water && world.water.a) || 104.0;
  const WB = (world.water && world.water.b) || 0.0;
  // The Danube's gauge is read against a datum, not against sea level, and
  // it genuinely goes negative in a dry summer — the Vác staff has read below
  // zero more than once. This is that: an offset on the fitted plane.
  const waterAt = (north) => WA + WB * north + (state.danube || 0);
  const WATER = waterAt(0);

  function ptAt(pts, m) {
    const f = (m - pts[0][3]) / 10;
    const i = Math.max(0, Math.min(pts.length - 2, Math.floor(f)));
    const u = f - i, a = pts[i], b = pts[i + 1];
    return [a[0] + u*(b[0]-a[0]), a[1] + u*(b[1]-a[1]), a[2] + u*(b[2]-a[2])];
  }
  function tanAt(pts, m) {
    const a = ptAt(pts, m - 10), b = ptAt(pts, m + 10);
    const dx = b[0]-a[0], dy = b[1]-a[1];
    const L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    hud.width = Math.round(w * dpr); hud.height = Math.round(h * dpr);
    hud.style.width = w + "px"; hud.style.height = h + "px";
    // The world renders small and is point-upscaled, which is the look. But
    // everything thin — a contact wire, a rail, a window, a road marking — is
    // below one pixel at 512 across, and below one pixel it is not detail any
    // more, it is noise. That is most of the speckle Mark has been seeing.
    // So the divisor is under his hand: 0.6 is chunkier than it was, 2.6 is
    // nearly native and the wires become wires.
    // state.dynRes (0.55..1) is the automatic part: it drops when frames get
    // slow and comes back when they recover, so a weaker machine stays smooth
    const scale = Math.max(0.6, Math.round(Math.min(w, h) / 300)
                                / ((state.sharp || 1.4) * (state.dynRes || 1)));
    RES.w = Math.max(320, Math.min(2600, Math.round(w / scale)));
    RES.h = Math.max(180, Math.min(1600, Math.round(h / scale)));
    sizeTarget(RES.w, RES.h);
    sizeBloom(RES.w, RES.h);
    fitReflect();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- input
  // The handlers live in input.js and are installed further down, once
  // everything they act on — the sound, the traffic, the menu — exists.
  const keys = new Set();
  // while a slider is held, nothing else may write to it
  let dragSlider = null;
  for (const id of ["timeSlider", "daySlider"]) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("pointerdown", () => dragSlider = el);
    addEventListener("pointerup", () => dragSlider = null);
  }
  window.__syncClock = () => syncClockLabels();
  function syncClockLabels() {
    const d = document.getElementById("dayOut"), t = document.getElementById("hourOut");
    if (d) d.textContent = tt(dateOfYear(state.day).hu, dateOfYear(state.day).en);
    if (t) t.textContent = fmtTime(state.hour);
  }

  // Every session starts with weather this season actually has, and a front
  // already a few kilometres off, so the sky develops while you drive instead
  // of holding one situation for ever. "Változékony" on the panel turns it off.
  state.wxId = pickSituation(state.day);
  state.wxInt = 0.7 + Math.random() * 0.6;
  state.wxChanging = true;
  state.front = queueFront(state.wxId, route.startM || 0, state.day, 5000 + Math.random() * 6000);
  // Picking a weather sets it HERE and NOW. It used to be overwritten on the
  // next frame by whatever the running front was bringing, which is why the
  // selector seemed to ignore you.
  function setWeather(id) {
    state.wxId = id;
    state.front = state.wxChanging
      ? queueFront(id, driver.m, state.day, 14000 + Math.random() * 10000) : null;
    syncWx(true);
  }
  window.__setWeather = setWeather;
  const sound = new Sound();
  sound.setVolume(state.volume);
  const wxSel = document.getElementById("wxSit");
  const cloudSel = document.getElementById("cloudType");
  if (wxSel) {
    wxSel.innerHTML = SITUATIONS.map(w =>
      `<option value="${w.id}">${tt(w.hu, w.en)}</option>`).join("");
    wxSel.value = state.wxId;
  }
  if (cloudSel) {
    cloudSel.innerHTML = `<option value="">${tt("— a helyzet szerint —", "— as the weather has it —")}</option>` +
      CLOUD_TYPES.filter(c => c.id !== "clear").map(c =>
      `<option value="${c.id}">${c.code} · ${tt(c.hu, c.la || c.hu)}</option>`).join("");
    cloudSel.value = state.cloudType;
  }
  // The panel says what the situation actually means: which decks are up,
  // what is falling, how hard it is blowing and how far you can see. The
  // intensity slider moves all of it together, which is the point of it.
  let wxNoteText = "";
  function syncWx(force) {
    const wxNote = document.getElementById("wxNote");
    if (!wxNote) return;
    // what is actually over the train: the blend at your position, not the
    // id of whatever the front will bring
    const w = (!force && state.wx) || (state.front
      ? weatherAt(state.front, state.wxId, state.wxInt, state.day, state.cloudType || null, driver.m)
      : resolveWeather(state.wxId, state.wxInt, state.day, state.cloudType || null));
    const lo = w.lowId ? (CLOUD_TYPES.find(c => c.id === w.lowId) || {}) : null;
    const hi = w.highId ? (CLOUD_TYPES.find(c => c.id === w.highId) || {}) : null;
    const decks = [lo && lo.code, hi && hi.code].filter(Boolean).join(" + ") || "—";
    const p = w.precip.kind && w.precip.rate > 0.02
      ? `${(LANG === "en" ? PRECIP_EN : PRECIP)[w.precip.kind]} ${(w.precip.rate * 100) | 0}%` : tt("száraz", "dry");
    const pal = weatherPalette(skyPalette(sunPosition(state.day, state.hour).alt),
                               w, state.fog);
    let next = "";
    if (state.front) {
      const f = state.front, dir = f.speed >= 0 ? 1 : -1;
      const d = dir * (driver.m - f.km);            // metres until the edge reaches you
      const nx = SITUATIONS.find(s => s.id === f.newId);
      if (nx && d > -2600) {
        const closing = Math.abs(f.speed) + dir * (-(driver.v || 0) * (route.dir || 1));
        next = d > 2600 ? `<br><b>${tt("jön:", "coming:")}</b> ${tt(nx.hu, nx.en)} · ${(d / 1000).toFixed(0)} km` +
                          (closing > 0.5 ? ` · ~${Math.max(1, Math.round(d / closing / 60))} ${tt("perc", "min")}` : "")
                        : `<br><b>${tt("átvonul:", "passing:")}</b> ${tt(nx.hu, nx.en)}`;
      }
    }
    const txt =
      `<b>${tt(w.sit.hu, w.sit.en)}</b> · ${w.tempC.toFixed(0)} °C<br>` +
      `${decks} · ${p}<br>` +
      `${tt("szél", "wind")} ${compass(w.wind.from)} ${w.wind.speed.toFixed(0)} m/s · ` +
      `${tt("látás", "visibility")} ${fmtVis(visibilityOf(pal.fog))}` + next;
    if (txt !== wxNoteText) { wxNote.innerHTML = txt; wxNoteText = txt; }
    const sel = document.getElementById("wxSit");
    if (sel && document.activeElement !== sel && sel.value !== w.sit.id) sel.value = w.sit.id;
  }
  window.__syncWx = syncWx;
  syncWx();

  // ---- the panel's two tabs
  // Everything you touch while driving on one, everything you set once on the
  // other. The list had grown to eleven sliders and the important ones were
  // getting lost among the ones you move twice a year.
  const tabRun = document.getElementById("tabRun");
  const tabSet = document.getElementById("tabSet");
  const paneRun = document.getElementById("paneRun");
  const paneSet = document.getElementById("paneSet");
  const showTab = (which) => {
    if (!tabRun) return;
    const run = which === "run";
    tabRun.classList.toggle("on", run); tabSet.classList.toggle("on", !run);
    paneRun.classList.toggle("on", run); paneSet.classList.toggle("on", !run);
  };
  if (tabRun) {
    tabRun.addEventListener("click", () => showTab("run"));
    tabSet.addEventListener("click", () => showTab("set"));
  }

  // ---- everything off
  // A view with nothing written on it. `U`, or the button, which stays faintly
  // visible so there is a way back.
  // U cycles three ways: everything; the names only (places, hills,
  // landmarks stay on the picture, the panels and read-outs go); nothing.
  const setBare = (level) => {
    level = level === true ? 2 : level === false ? 0 : level;
    state.bare = level > 0; state.bareLevel = level;
    document.body.classList.toggle("bare", level > 0);
    document.body.classList.toggle("bare2", level === 2);
  };
  const hideBtn = document.getElementById("hideHud");
  if (hideBtn) hideBtn.addEventListener("click", () => setBare(((state.bareLevel || 0) + 1) % 3));
  window.__setBare = setBare;
  bindSettings(state, {
    traffic,
    sound,
    routeData: routeData,
    onWeatherChange: syncWx,
    onStartRun: (dir, startKm, mode, scenario, env) => {
      selMode.value = mode;
      startRun(dir, startKm, scenario, env);
    }
  });

  // ---- sound (browsers require a gesture before audio may start)
  let soundArmed = false;
  const armSound = () => {
    if (soundArmed) return;
    soundArmed = true;
    if (state.sound) sound.start();
  };
  addEventListener("pointerdown", armSound);
  addEventListener("keydown", armSound);
  let jointPhase = 0, lastDwell = 0;

  // ---- menu and run control
  const menuEl = document.getElementById("menu");
  const selDir = document.getElementById("mDir");
  const selStart = document.getElementById("mStart");
  const selMode = document.getElementById("mMode");
  const inpHour = document.getElementById("mHour");
  const outHour = document.getElementById("mHourV");

  function toggleMenu(on) {
    if (on) {
      state.panel = false;
      document.getElementById("panel").style.display = "";
    }
    state.menu = on;
    menuEl.classList.toggle("on", on);
    state.paused = on;
  }
  window.__toggleMenu = toggleMenu;
  // ---- the car against the world (collide.js): building walls, the other
  // cars, and trains. A car standing on the line is seen by the trains,
  // which brake for it; a train that cannot stop in time hits it.
  function carWorld(car) {
    const fx = Math.sin(car.yaw), fn = Math.cos(car.yaw);
    let hit = null;
    for (const off of [1.3, -1.3]) {
      const r = solids.push(car.x + fx * off, car.n + fn * off, car.y, 0.95, 1.5);
      if (r.hit) { car.x = r.x - fx * off; car.n = r.n - fn * off; hit = r; }
    }
    const bump = (speed, text) => {
      if (speed > 3 && !(car.bumpT > 0)) {
        state.messages = state.messages || [];
        state.messages.push({ text: `${text} · ${Math.round(speed * 3.6)} km/h`, t: 3, tone: "bad" });
        car.bumps = (car.bumps || 0) + 1; car.bumpT = 1.0; car.shake = Math.min(1, speed / 12);
      }
    };
    car.bumpT = (car.bumpT || 0) - 1 / 60;
    car.shake = Math.max(0, (car.shake || 0) - 0.03);
    if (hit) {
      // into the wall: the speed along the wall's normal goes, what runs
      // along it stays — a glancing blow slides, a head-on one stops dead
      const dot = (fx * hit.nx + fn * hit.nn) * Math.sign(car.v);
      if (dot < -0.05) {
        bump(Math.abs(car.v) * -dot, tt("Falnak ütköztél", "You hit a wall"));
        car.v *= dot < -0.85 ? -0.12 : 1 + dot * 0.9;
      }
    }
    // the other cars: a disc each, and they stop where they are hit
    if (roadTraffic) {
      for (const v of roadTraffic.vehicles) {
        const q = roadTraffic.place(v);
        const dx = car.x - q.x, dn = car.n - q.z, d = Math.hypot(dx, dn);
        const min = 1.9 + Math.min(4, v.type.len * 0.22);
        if (d >= min || d < 1e-3) continue;
        car.x += dx / d * (min - d); car.n += dn / d * (min - d);
        bump(Math.abs(car.v - v.v * (q.fx * fx + q.fz * fn) * v.dir), tt("Koccanás", "Fender bender"));
        car.v *= 0.3; v.v = 0;
      }
      roadTraffic.obstacles = [{ x: car.x, n: car.n }];
    }
    // the railway: which chainage the car stands on, if it is on the line
    const rd = railDistAt(car.x, car.n);
    // a closed boom is a wall: coming towards the line within 9 m of it, at a
    // crossing whose booms are down, the car stops at the boom (7 m out)
    if (state.closedGates && state.closedGates.size && rd.d < 9 && rd.d > 4.5) {
      const was = car.lastRail == null ? rd.d : car.lastRail;
      if (rd.d < was - 1e-3 && rd.d < 7) {
        for (const i of state.closedGates) {
          const x = routeData.crossings[i];
          if (x && Math.abs(x.m - rd.m) < 18) {
            bump(Math.abs(car.v), tt("Sorompó", "Level crossing barrier"));
            car.x = car.px; car.n = car.pn; car.v = 0;
            break;
          }
        }
      }
    }
    car.lastRail = railDistAt(car.x, car.n).d; car.px = car.x; car.pn = car.n;
    const onLine = rd.d < 6.5 && Math.abs(car.y - rd.railY) < 3;
    traffic.obstacleM = onLine ? rd.m : null;
    if (onLine) {
      for (const t of traffic.trains) {
        const len = t.length || (t.cars ? t.cars * 26 : 120);
        const a = t.m, b = t.m - t.dir * len;
        if (rd.m < Math.min(a, b) - 3 || rd.m > Math.max(a, b) + 3 || t.v < 1) continue;
        // hit: thrown clear of the line, and a lesson
        const side = Math.sign((car.x - route.at(rd.m)[0]) * 1 + 1e-6);
        const p1 = route.at(rd.m + 5), p0 = route.at(rd.m - 5);
        const tx = p1[0] - p0[0], tn = p1[1] - p0[1], L = Math.hypot(tx, tn) || 1;
        const s2 = Math.sign((car.x - p0[0]) * (-tn) + (car.n - p0[1]) * tx) || side;
        car.x += -tn / L * 9 * s2; car.n += tx / L * 9 * s2;
        car.v = 0; car.wreck = 4; car.shake = 1;
        state.messages.push({ text: tt(`Elütött a vonat (${Math.round(t.v * 3.6)} km/h)! Soha ne állj meg a síneken.`, `Hit by a train (${Math.round(t.v * 3.6)} km/h)! Never stop on the tracks.`), t: 8, tone: "bad" });
        state.carTrainHits = (state.carTrainHits || 0) + 1;
        break;
      }
    }
  }
  // ---- photographs and the album. Z (or Fotó) takes one; the landmarks,
  // peaks and towns in the middle of the picture are "discovered", kept with
  // a thumbnail, the time, the weather and how you were travelling.
  const COLLECT = POIS.filter(p => p.lm ? p.w >= 3 : p.far ? p.w >= 2.45 : p.w >= 1.7);
  addEventListener("keydown", e => {
    if (e.code === "KeyZ" && e.shiftKey && !e.repeat && !state.menu) { photoMode(!state.photo); return; }
    if (e.code === "KeyZ" && !e.repeat && !state.menu) state.snapReq = true;
    if (e.code === "Escape" && state.photo) photoMode(false);
  });
  // ---- photo mode (⇧Z, or the Fotó button): time stops, the camera is
  // yours (WASD, R/F, drag to look, shift for speed), and a panel of lens and
  // colour settings, depth of field and the tilt-shift "miniature" among
  // them. Click the picture to focus on what is under the pointer. The
  // shutter saves a PNG and files any landmark in the frame in the album.
  const PHOTO0 = { dof: 0, focus: 120, aperture: 0.6, band: 0.45, hue: 0, sat: 1, contrast: 1, warm: 0,
                   orbit: null, lights: [], lightI: 1 };
  let photoSaved = null;
  function photoMode(on) {
    const ui = document.getElementById("photoUI");
    if (on && !state.photo) {
      photoSaved = { paused: state.paused, fov: state.fov, fly: state.fly, follow: state.follow,
                     exposure: state.exposure, vignette: state.vignette, grain: state.grain, yaw: state.yaw, pitch: state.pitch };
      const c = state.lastCam ? state.lastCam.eye : [0, 200, 0];
      state.photo = { ...PHOTO0, lights: [] };
      photoFx.show(true);
      document.getElementById("phCam").value = "free";
      state.paused = true;
      if (!state.fly) {
        // the free camera from where the view was, looking the same way
        state.fly = { p: [c[0], c[1], c[2]], speed: 10 };
        if (state.lastCam) {
          const P = (x, y) => { const m = state.lastCam.invVP;
            const v = [x, y, 1, 1], o = [0, 0, 0, 0];
            for (let i = 0; i < 4; i++) o[i] = m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3];
            return [o[0] / o[3], o[1] / o[3], o[2] / o[3]]; };
          const far = P(0, 0), d = norm(sub(far, c));
          state.yaw = Math.atan2(d[0], -d[2]); state.pitch = d[1] / Math.max(1e-3, Math.hypot(d[0], d[2]));
        }
      } else state.fly.speed = 10;
      state.follow = false;
      document.body.classList.add("photo");
      ui.classList.add("on");
      syncPhotoUI();
    } else if (!on && state.photo) {
      state.photo = null;
      photoFx.show(false); photoFx.clear();
      Object.assign(state, { paused: photoSaved.paused, fov: photoSaved.fov, fly: photoSaved.fly, follow: photoSaved.follow,
                             exposure: photoSaved.exposure, vignette: photoSaved.vignette, grain: photoSaved.grain });
      if (!photoSaved.fly) { state.yaw = photoSaved.yaw; state.pitch = photoSaved.pitch; }
      document.body.classList.remove("photo");
      ui.classList.remove("on");
    }
  }
  window.__photoMode = photoMode;
  // what is under a point of the picture: march the view ray over the ground
  // and the roofs (a depth read-back is not possible in WebGL)
  // The dark timeline, first step (docs/DARK_TIMELINE_DISASTER_SPEC.md; off
  // unless the address says ?mode=dark): K strikes where the middle of the
  // view meets the world. A fireball, sparks, a smoke column that burns for a
  // minute, the boom and the shake. No crater and no damage yet.
  // Second step: a strike leaves a crater, scorched ground and collapsed
  // buildings round it (CRATER_GLSL). Three sizes (J cycles them, shown in the
  // notice): a shell (6 m crater), a heavy bomb (14 m), a very heavy one
  // (30 m). Sizes are round numbers for the game, not ballistics. Up to 16
  // craters stay; the oldest goes first.
  const DARK_W = [
    { hu: "gránát", en: "shell", r: 6, depth: 2.5, fx: 3, burn: 25 },
    { hu: "nehézbomba", en: "heavy bomb", r: 14, depth: 6, fx: 6, burn: 60 },
    { hu: "igen nehéz bomba", en: "very heavy bomb", r: 30, depth: 11, fx: 10, burn: 120 },
  ];
  state.darkW = 1;
  if (new URLSearchParams(location.search).get("mode") === "dark") {
    state.dark = true;                    // (input.js: K and J belong to the weapons here)
    const say = (t) => { const n = document.getElementById("photoToast"); if (!n) return;
      n.innerHTML = `<div><b>${t}</b><span>${tt("K: csapás a kép közepére · J: másik fegyver", "K: strike the middle of the view · J: another weapon")}</span></div>`;
      n.classList.remove("on"); void n.offsetWidth; n.classList.add("on");
      clearTimeout(say.tm); say.tm = setTimeout(() => n.classList.remove("on"), 2500); };
    const pickW = (i) => { state.darkW = i; const w = DARK_W[i]; say(tt("Fegyver: ", "Weapon: ") + tt(w.hu, w.en)); syncDark(); };
    const strike = () => {
      const t = distanceAt(0, 0), L = state.lastCam;
      if (t == null || !L) return;
      const d = norm(sub(M4.apply(L.invVP, [0, 0, 1, 1]).slice(0, 3).map((v, i, a) => v / M4.apply(L.invVP, [0, 0, 1, 1])[3]), L.eye));
      const p = add(L.eye, scale(d, t));
      const w = DARK_W[state.darkW];
      vfx.explode(p[0], p[1], p[2], w.fx);
      vfx.burn(p[0], p[1], p[2], w.burn);
      addCrater(p[0], p[2], w.r, w.depth);
      state.shake = 0.6 + w.fx * 0.15;
      if (sound.boom) sound.boom(t);
      syncDark();
    };
    const clearAll = () => { state.craters.length = 0; craterArr.fill(0); vfx.emitters.length = 0; syncDark(); };
    // the panel: the weapon, the strike (a phone has no K) and "clear"
    const dp = document.getElementById("darkPanel");
    const syncDark = () => {
      if (!dp) return;
      dp.querySelectorAll("button[data-w]").forEach(b => b.classList.toggle("on", +b.dataset.w === state.darkW));
      const c = dp.querySelector(".cnt"); if (c) c.textContent = `${state.craters.length} / 16`;
    };
    if (dp) {
      dp.innerHTML = `<b>${tt("Sötét idővonal", "Dark timeline")}</b>` +
        DARK_W.map((w, i) => `<button data-w="${i}">${tt(w.hu, w.en)}</button>`).join("") +
        `<button class="go">${tt("CSAPÁS (K)", "STRIKE (K)")}</button><button class="clr">${tt("eltakarít", "clear")}</button><span class="cnt"></span>` +
        `<small>${tt("a kép közepére", "at the middle of the view")}</small>`;
      dp.classList.add("on");
      dp.querySelectorAll("button[data-w]").forEach(b => b.addEventListener("click", () => pickW(+b.dataset.w)));
      dp.querySelector(".go").addEventListener("click", strike);
      dp.querySelector(".clr").addEventListener("click", clearAll);
      syncDark();
    }
    addEventListener("keydown", e => {
      if (state.menu) return;
      if (e.code === "KeyJ") { pickW((state.darkW + 1) % DARK_W.length); return; }
      if (e.code === "KeyK") strike();
    });
  }
  // Skip to the next stop (owner, Oct 2026: "there was no skip-stop button"):
  // the train is put 450 m short of it at 50 km/h, and the clock moves on by
  // the time the run would have taken, so the timetable still fits.
  window.__skipStop = () => {
    const st = driver.nextStop(driver.m);
    if (!st || state.menu) return;
    const to = st.km * 1000 - route.dir * 450, d = (to - driver.m) * route.dir;
    if (d < 200) return;
    driver.m = to; driver.v = Math.min(driver.s.vMax, 14);
    state.hour = (state.hour + d / 22 / 3600) % 24;
    (state.messages = state.messages || []).push({ text: tt(`Ugrás: ${st.name} előtt 450 m-rel.`, `Skipped ahead: 450 m before ${st.name}.`), t: 5, tone: "" });
  };
  // board the tram nearest the camera (or leave it)
  // With a line number ("4", "56"…) it boards the nearest tram of that line
  // wherever it is; the same line again moves on to another tram of it.
  // Take over a train that is running (the map's train badges): you drive
  // that service from where it is, at its speed, on its booked path. Picking
  // one used to only follow it with the outside camera, while W/S went on
  // driving your own train somewhere else on the line.
  window.__takeOver = (t) => {
    if (!t || t.svc.id === "player") return;
    const svc = (assets.timetable.services || []).find(x => x.id === t.id) || null;
    const sc = t.stock === "FREIGHT" || /^teher/i.test(t.name) ? "Freight"
             : t.stock === "EC" ? "EC" : (t.name.match(/^[A-Z]+\d+/) || [state.scenario || "S70"])[0];
    const v = t.v, m = t.m;
    if (state.person) state.person.active = false;
    if (state.car) state.car.active = false;
    if (state.plane) state.plane.active = false;
    if (state.drone) state.drone.active = false;
    state.tram = null; state.tramBar = false; state.fly = null; state.tour = null; state.passenger = null;
    state.follow = false; state.followCarIdx = -1; state.followShipIdx = -1; state.cab = true;
    startRun(t.dir, m / 1000, sc, null, { path: svc });
    // seekTo has just put the same service back at its booked place: it is yours now
    traffic.trains = traffic.trains.filter(x => x === playerTrain || x.id !== t.id);
    driver.v = v; playerTrain.v = v;
    driver.setLever(0);
    (state.messages = state.messages || []).push({ text: tt(`Átvetted: ${t.name} · M: kézi vezetés`, `You took over the ${t.name} · M: drive by hand`), t: 5, tone: "good" });
  };
  window.__tram = (ref) => {
    if (ref === undefined && state.tram) { state.tram = null; state.yaw = 0; state.pitch = -0.02; return; }
    if (!trams) return;
    const L = state.lastCam; if (!L) return;
    const cur = state.tram;
    const only = ref === undefined ? -1
      : (ri, dep) => trams.routes[ri].ref === ref && (dep === undefined || !cur || ri !== cur.ri || Math.abs(dep - cur.dep) > 1);
    const nx = trams.nearest(state.hour * 3600, L.eye[0], -L.eye[2], only);
    const say = (a, b) => (state.messages = state.messages || []).push({ text: a, t: 7, tone: b || "" });
    if (!nx) { if (!cur) say(tt("Most nem jár villamos (4:30 és éjfél között közlekednek).", "No trams are running now (they run from 4:30 to midnight)."), "warn"); return; }
    if (ref === undefined && nx.dist > 6000) { say(tt(`A legközelebbi villamos ${(nx.dist / 1000).toFixed(0)} km-re van: válassz vonalat.`, `The nearest tram is ${(nx.dist / 1000).toFixed(0)} km away: pick a line.`), "warn"); return; }
    boardTram(nx.ri, nx.dep, !!(cur && cur.out));
  };
  // every way onto a tram (the Villamos button, the line bar, the map's tram
  // badges and its pin) ends here, so each leaves the other modes the same way
  function boardTram(ri, dep, out) {
    if (state.plane) state.plane.active = false;
    if (state.car) state.car.active = false;
    if (state.drone) state.drone.active = false;
    if (state.person) state.person.active = false;
    state.fly = null; state.tour = null; state.passenger = null; state.follow = false;
    state.followIdx = -1; state.followCarIdx = -1; state.followShipIdx = -1;
    state.map = false; state.mapPin = null;
    state.yaw = out ? 0.35 : 0; state.pitch = out ? -0.1 : -0.05; state.zoom = 1;
    state.tram = { ri, dep, out: !!out };
    const r = trams.routes[ri];
    (state.messages = state.messages || []).push({ t: 7, tone: "",
      text: tt(`${r.ref}-es villamos${r.to ? " → " + r.to : ""}. C: kívülről · Esc: vissza a vonathoz`, `Tram ${r.ref}${r.to ? " → " + r.to : ""}. C: from outside · Esc: back to the train`) });
  }
  window.__boardTram = (ri, dep, out = true) => { if (trams) boardTram(ri, dep, out); };
  // the nearest running tram to a point (the map's pin)
  window.__tramNear = (x, n) => {
    if (!trams) return false;
    const nx = trams.nearest(state.hour * 3600, x, n);
    if (!nx) { (state.messages = state.messages || []).push({ t: 6, tone: "warn",
      text: tt("Most nem jár villamos (4:30 és éjfél között közlekednek).", "No trams are running now (they run from 4:30 to midnight).") }); return false; }
    boardTram(nx.ri, nx.dep, true);
    return true;
  };
  // the line picker (owner, Oct 2026: "no way of switching between 4-6, 2,
  // 1, 3, 56, 61"): shown by the Villamos button and while riding
  {
    const tb = document.getElementById("tramBar");
    if (tb && trams) {
      const refs = [...new Set(trams.routes.map(r => r.ref))].sort((a, b) => a - b);
      tb.innerHTML = `<b>${tt("Villamos", "Tram")}</b>` + refs.map(r => `<button data-ref="${r}">${r}</button>`).join("") +
        `<button class="x">${tt("leszáll", "leave")}</button>`;
      tb.querySelectorAll("button[data-ref]").forEach(b => b.addEventListener("click", () => window.__tram(b.dataset.ref)));
      tb.querySelector(".x").addEventListener("click", () => { state.tramBar = false; if (state.tram) window.__tram(); });
      setInterval(() => {
        const on = !state.menu && (!!state.tram || !!state.tramBar);
        tb.classList.toggle("on", on);
        if (!on) return;
        const ref = state.tram ? trams.routes[state.tram.ri].ref : "";
        tb.querySelectorAll("button[data-ref]").forEach(b => b.classList.toggle("on", b.dataset.ref === ref));
      }, 250);
    }
    window.__tramBar = () => { state.tramBar = true; if (!state.tram) window.__tram(); };
  }
  addEventListener("keydown", e => {
    if (!state.tram || state.menu) return;
    if (e.code === "KeyC") { state.tram.out = !state.tram.out; state.yaw = state.tram.out ? 0.35 : 0; state.pitch = state.tram.out ? -0.1 : -0.05; e.stopImmediatePropagation(); }
    if (e.code === "Escape") { if (window.__toCab) window.__toCab(); else { state.tram = null; state.tramBar = false; } e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  window.__addCrater = addCrater;
  function distanceAt(sx, sy) {
    const L = state.lastCam; if (!L) return null;
    const m = L.invVP, P = (z) => { const v = [sx, sy, z, 1], o = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) o[i] = m[i] * v[0] + m[4 + i] * v[1] + m[8 + i] * v[2] + m[12 + i] * v[3];
      return [o[0] / o[3], o[1] / o[3], o[2] / o[3]]; };
    const a = L.eye, d = norm(sub(P(1), P(-1)));
    for (let t = 2; t < 20000; t *= 1.015, t += 0.5) {
      const x = a[0] + d[0] * t, y = a[1] + d[1] * t, n = -(a[2] + d[2] * t);
      const g = Math.max(demAt(x, n), solids.topAt(x, n));
      if (isFinite(g) && y <= g) return t;
      if (solids.at(x, y, n)) return t;
    }
    return 20000;
  }
  const cvPhoto = document.getElementById("gl");
  let downAt = null;
  cvPhoto.addEventListener("pointerdown", e => { if (state.photo) downAt = [e.clientX, e.clientY]; });
  cvPhoto.addEventListener("pointerup", e => {
    if (!state.photo || !downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
    if (moved > 4) return;                          // that was a drag to look around
    const r = cvPhoto.getBoundingClientRect();
    const t = distanceAt((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2);
    if (t == null) return;
    state.photo.focus = t;
    if (!state.photo.dof) state.photo.dof = 1;
    // in the miniature mode the sharp band goes where you clicked
    if (state.photo.dof === 2) state.photo.band = 1 - (e.clientY - r.top) / r.height;
    syncPhotoUI();
  });
  // the panel: each control writes state.photo (or state) and shows its value
  const PH = [
    ["phDof", v => { state.photo.dof = +v;
        if (+v === 2) { state.photo.sat = Math.max(state.photo.sat, 1.3); state.photo.contrast = Math.max(state.photo.contrast, 1.12); } },
        () => state.photo.dof, v => [tt("ki", "off"), tt("mélység", "depth"), tt("makett", "miniature")][v]],
    ["phFocus", v => { state.photo.focus = Math.pow(10, +v); }, () => Math.log10(state.photo.focus), () => `${Math.round(state.photo.focus)} m`],
    ["phAperture", v => { state.photo.aperture = +v; }, () => state.photo.aperture, v => (+v).toFixed(2)],
    ["phBand", v => { state.photo.band = +v; }, () => state.photo.band, v => `${Math.round(v * 100)}%`],
    ["phFov", v => { state.fov = +v; }, () => state.fov, v => `${Math.round(v)}°`],
    ["phExp", v => { state.exposure = +v; }, () => state.exposure, v => (+v).toFixed(2)],
    ["phHue", v => { state.photo.hue = +v; }, () => state.photo.hue, v => `${Math.round(v * 57.3)}°`],
    ["phSat", v => { state.photo.sat = +v; }, () => state.photo.sat, v => (+v).toFixed(2)],
    ["phCon", v => { state.photo.contrast = +v; }, () => state.photo.contrast, v => (+v).toFixed(2)],
    ["phWarm", v => { state.photo.warm = +v; }, () => state.photo.warm, v => (+v).toFixed(2)],
    ["phVig", v => { state.vignette = +v; }, () => state.vignette, v => (+v).toFixed(2)],
    ["phGrain", v => { state.grain = +v; }, () => state.grain, v => (+v).toFixed(2)],
    ["phHour", v => { state.hour = +v; const ts = document.getElementById("timeSlider"); if (ts) ts.value = v; }, () => state.hour, v => fmtTime(+v)],
  ];
  function syncPhotoUI() {
    for (const [id, , get, fmt] of PH) {
      const el = document.getElementById(id); if (!el) continue;
      el.value = get();
      const o = document.getElementById(id + "V"); if (o) o.textContent = fmt(el.value);
    }
    document.getElementById("photoUI").dataset.dof = state.photo ? state.photo.dof : 0;
  }
  for (const [id, set, , fmt] of PH) {
    const el = document.getElementById(id); if (!el) continue;
    el.addEventListener("input", () => { if (!state.photo) return; set(el.value); syncPhotoUI(); });
  }
  // stickers, caption and light effects on the picture (photofx.js)
  const photoFx = initPhotoFx(document.getElementById("photoStage"), document.getElementById("phPicker"));
  const tabs = document.querySelectorAll("#photoUI .row2.tabs button");
  tabs.forEach(b => b.addEventListener("click", e => {
    e.stopPropagation(); tabs.forEach(x => x.classList.toggle("on", x === b)); photoFx.fillPicker(b.dataset.k);
  }));
  const bindFx = (id, key, conv = v => +v, fmt) => {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener("input", () => { photoFx.fx[key] = el.type === "checkbox" ? el.checked : conv(el.value);
      const o = document.getElementById(id + "V"); if (o && fmt) o.textContent = fmt(el.value); photoFx.refresh(); });
    el.addEventListener("change", () => el.dispatchEvent(new Event("input")));
    el.addEventListener("keydown", e => e.stopPropagation());      // typing a caption is not driving
  };
  bindFx("phCap", "caption", v => v);
  bindFx("phCapS", "capStyle");
  bindFx("phLeak", "leak", v => +v, v => (+v).toFixed(2));
  bindFx("phFlare", "flare", v => +v, v => (+v).toFixed(2));
  bindFx("phBorder", "border");
  bindFx("phStamp", "stamp");
  // the camera: free, or round the point in focus
  document.getElementById("phCam").addEventListener("change", e => {
    if (!state.photo) return;
    if (e.target.value === "orbit") {
      const L = state.lastCam, t = Math.max(15, distanceAt(0, 0) || 120);
      const f = norm([Math.sin(state.yaw), state.pitch, -Math.cos(state.yaw)]);
      state.photo.orbit = { pivot: add(L.eye, scale(f, t)), dist: t };
      state.zoom = 1;
    } else state.photo.orbit = null;
  });
  // lights: placed at the point in focus, a few metres up
  document.getElementById("phLight").addEventListener("click", e => {
    e.stopPropagation(); if (!state.photo) return;
    const L = state.lastCam, t = state.photo.focus || distanceAt(0, 0) || 30;
    const f = norm([Math.sin(state.yaw), state.pitch, -Math.cos(state.yaw)]);
    const p = add(L.eye, scale(f, Math.max(4, t - 2)));
    const g = demAt(p[0], -p[2]);
    if (isFinite(g) && p[1] < g + 3) p[1] = g + 3;
    state.photo.lights.push(p);
    if (state.photo.lights.length > 16) state.photo.lights.shift();
  });
  document.getElementById("phLightClr").addEventListener("click", e => { e.stopPropagation(); if (state.photo) state.photo.lights = []; });
  document.getElementById("phLightI").addEventListener("input", e => { if (state.photo) state.photo.lightI = +e.target.value; });
  document.getElementById("phShoot").addEventListener("click", e => { e.stopPropagation(); state.snapReq = true; });
  document.getElementById("phReset").addEventListener("click", e => { e.stopPropagation();
    Object.assign(state.photo, PHOTO0, { lights: [] }); photoFx.clear(); state.fov = photoSaved.fov; state.exposure = photoSaved.exposure;
    state.vignette = photoSaved.vignette; state.grain = photoSaved.grain; syncPhotoUI(); });
  document.getElementById("phExit").addEventListener("click", e => { e.stopPropagation(); photoMode(false); });
  document.getElementById("phFocusC").addEventListener("click", e => { e.stopPropagation();
    const t = distanceAt(0, 0); if (t != null) { state.photo.focus = t; if (!state.photo.dof) state.photo.dof = 1; syncPhotoUI(); } });
  window.__photo = () => { state.snapReq = true; };
  function takePhoto(eye, f) {
    const hx0 = Math.hypot(f[0], f[2]) || 1, fx = f[0] / hx0, fn = -f[2] / hx0;
    const ex = eye[0], en = -eye[2];
    let subject = null, bs = 0;
    for (const p of COLLECT) {
      const dx = p.x - ex, dn = p.y - en, d = Math.hypot(dx, dn);
      const reach = p.far ? 16000 : p.w >= 3 ? 3500 : 5000;
      if (d > reach || d < 15) continue;
      const cosA = (dx * fx + dn * fn) / d;
      if (cosA < Math.cos(0.30)) continue;                  // within ±17° of the middle
      const sc = p.w * cosA / (1 + d / 1500);
      if (sc > bs) { bs = sc; subject = p; }
    }
    // the thumbnail, and the full picture for saving
    // in photo mode the saved picture carries the stickers, caption and effects
    const src = state.photo ? photoFx.compose(cv) : cv;
    const W = 280, H = Math.round(W * src.height / src.width);
    const tc = document.createElement("canvas"); tc.width = W; tc.height = H;
    tc.getContext("2d").drawImage(src, 0, 0, W, H);
    const thumb = tc.toDataURL("image/jpeg", 0.72);
    const full = src.toDataURL("image/png");
    const wx = (SITUATIONS.find(w => w.id === state.wxId) || {}).hu || "";
    const how = state.plane && state.plane.active ? tt("repülőből", "from a plane") : state.car && state.car.active ? tt("autóból", "from a car")
              : state.drone && state.drone.active ? tt("drónról", "from a drone") : state.passenger ? tt("az ablakból", "from the window")
              : state.fly ? tt("szabad kamerával", "free camera") : tt("a vonatról", "from the train");
    let isNew = false;
    if (subject) {
      const prefs = loadPrefs();
      prefs.album = prefs.album || {};
      if (!prefs.album[subject.name]) {
        isNew = true;
        prefs.album[subject.name] = { t: thumb, when: `${tt(dateOfYear(state.day).hu, dateOfYear(state.day).en)} ${fmtTime(state.hour)}`, wx, how,
                                      line: new URLSearchParams(location.search).get("line") || "line70" };
        savePrefs(prefs);
      }
    }
    const toast = document.getElementById("photoToast");
    toast.innerHTML = `<img src="${thumb}"><div><b>${subject ? subject.name : tt("Fénykép", "Photo")}</b>
      <span>${subject ? (isNew ? tt("új felfedezés az albumban!", "new in the album!") : tt("már az albumban van", "already in the album")) : tt("nincs nevezetesség a kép közepén", "no landmark in the middle of the picture")}</span>
      <a download="dunakanyar-${Date.now()}.png" href="${full}">${tt("Mentés PNG-ként", "Save as PNG")}</a></div>`;
    toast.classList.remove("on"); void toast.offsetWidth; toast.classList.add("on");
    document.getElementById("flash").classList.remove("on"); void document.getElementById("flash").offsetWidth;
    document.getElementById("flash").classList.add("on");
    clearTimeout(takePhoto.tm); takePhoto.tm = setTimeout(() => toast.classList.remove("on"), 6000);
  }
  function showAlbum() {
    const el = document.getElementById("album"), A = loadPrefs().album || {};
    const got = COLLECT.filter(p => A[p.name]).length;
    const cards = COLLECT.slice().sort((a, b) => (A[b.name] ? 1 : 0) - (A[a.name] ? 1 : 0) || b.w - a.w)
      .map(p => A[p.name]
        ? `<div class="ac"><img src="${A[p.name].t}"><b>${p.name}</b><span>${A[p.name].when} · ${A[p.name].wx} · ${A[p.name].how}</span></div>`
        : `<div class="ac lock"><div class="ph">?</div><b>${p.far ? tt("egy csúcs", "a peak") : p.w >= 3 ? tt("egy nevezetesség", "a landmark") : tt("egy település", "a town")}</b><span>${tt("még nem fényképezted le", "not photographed yet")}</span></div>`).join("");
    el.innerHTML = `<div class="card"><div class="mh"><h2>${tt("Fotóalbum", "Photo album")}</h2><span class="tot">${got} / ${COLLECT.length}</span>
      <button class="x">✕</button></div><p class="lede">${tt("Z: gyors kép · ⇧Z vagy a Fotó gomb: fotó mód. Ami a kép közepén van, az albumba kerül — a vonatról, repülőből, autóból.", "Z: a quick shot · ⇧Z or the Photo button: photo mode. What is in the middle of the picture goes into the album — from the train, a plane, a car.")}</p>
      <div class="ag">${cards}</div></div>`;
    el.querySelector(".x").addEventListener("click", () => el.classList.remove("on"));
    el.classList.add("on");
  }
  window.__album = showAlbum;
  // Station announcements, two and a half seconds after the chime, with the
  // sound on: the recordings made by tools/make_announcements.py (a local
  // Hungarian voice, data/audio/ann/), else the browser's own hu-HU voice.
  const annSlug = n => n.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
                        .replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");
  // kind: "" "Következő állomás: X." · "_veg" the same at the terminus ·
  // "_kov" "X következik." shortly before arriving
  async function announce(name, end, kind = end ? "_veg" : "") {
    if (!state.sound) return;
    const key = "ann_" + annSlug(name) + kind;
    if (sound.ctx && !sound.samples[key])
      await sound.loadSample(key, `${window.DATA_BASE || "data/"}audio/ann/${key.slice(4)}.m4a`).catch(() => {});
    if (sound.samples && sound.samples[key]) { setTimeout(() => sound.playSample(key, 0.9), 2500); return; }
    const text = kind === "_kov" ? `${name} következik.`
               : end ? `Következő állomás: ${name}, a vonat végállomása. Kérjük, minden utasunk szálljon ki.`
                     : `Következő állomás: ${name}.`;
    if (!window.speechSynthesis) return;
    const v = speechSynthesis.getVoices().find(v => /^hu/i.test(v.lang));
    if (!v) return;
    setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v; u.lang = v.lang; u.rate = 0.92; u.pitch = 1.0;
      u.volume = Math.min(1, state.volume == null ? 0.7 : state.volume);
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    }, 2500);
  }
  if (window.speechSynthesis) speechSynthesis.getVoices();      // (the list loads lazily)
  // ---- a derailment (wreck.js): the cars leave the track to the outside
  // of the curve, go over, slide and stay there; the end card comes once
  // they have come to rest.
  function startWreck(lat, h1, h2) {
    const dir = route.dir, m = driver.m;
    // the curve turns left if the heading (atan2 east, north) decreased
    let dh = h2 - h1; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI;
    const t = route.tangent(m), tx = t[0] * dir, ty = t[1] * dir;
    const outward = dh < 0 ? [ty, -tx] : [-ty, tx];          // right of travel on a left-hand curve
    const ground = trackGround(route, m, demAt);
    const w = new TrainWreck(route, dir, carLayout(playerTrain), driver.v, ground,
                             { severity: 0.25 + (lat - 2.6) / 2, outward });
    state.wreck = w; state.wreckT = 0; state.wreckRest = 0;
    playerTrain.wreck = w.poses;
    driver.v = 0; driver.emergency = true; driver.setLever(-LEVER_MAX);
    // the camera steps off the train to the outside of the curve, ahead,
    // where the cars are going
    const T = route.at(m + dir * 55), E = [T[0] + outward[0] * 60 + tx * 15, T[1] + outward[1] * 60 + ty * 15];
    const Ey = Math.max(T[2], demAt(E[0], E[1])) + 14;
    state.follow = false; state.followIdx = -1; state.passenger = null;
    state.fly = { p: [E[0], Ey, -E[1]], speed: 20 };
    state.wreckCam = state.fly;          // turned to follow the wreck until you move it
    aimAtWreck(w);
    state.shake = 1.2;
    if (sound && sound.boom) sound.boom(40);
  }
  // the camera turns to keep the cars that left the track in the middle
  function aimAtWreck(w) {
    if (!state.fly || state.fly !== state.wreckCam) return;
    // (the first three cars: the ones that go furthest)
    let x = 0, n = 0, y = 0, k = 0;
    for (let i = 0; i < Math.min(3, w.cars.length); i++)
      if (!w.cars[i].onRail || i === 0) { const p = w.poses[i]; x += p.x; n += p.n; y += p.y; k++; }
    if (!k) return;
    x /= k; n /= k; y /= k;
    const E = state.fly.p, dx = x - E[0], dz = -n - E[2];
    const yaw = Math.atan2(dx, -dz), pitch = (y - E[1]) / Math.hypot(dx, dz);
    let d = yaw - state.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    state.yaw += d * 0.15; state.pitch += (pitch - state.pitch) * 0.15;
  }
  function stepWreck(dt) {
    const w = state.wreck;
    driver.v = 0; driver.setLever(-LEVER_MAX);
    w.step(dt);
    aimAtWreck(w);
    wreckFx(w);
    state.wreckT += dt;
    if (w.settled) state.wreckRest = (state.wreckRest || 0) + dt;
    // the end card, once it has all come to rest (or after 14 s)
    if (!state.finished && state.wreckT > 4 && (state.wreckRest > 1.5 || state.wreckT > 14)) {
      state.shake = 0;
      finishRun();
    }
  }
  // what a wreck's events look like: dust, sparks, a thump, the camera shaking
  function wreckFx(w) {
    const cam = state.lastCam ? state.lastCam.eye : [0, 0, 0];
    const R = Math.random;
    for (const e of w.events) {
      const y = e.y ?? demAt(e.e, e.n);
      const dist = Math.hypot(e.e - cam[0], e.n + cam[2]);
      if (e.kind === "land") {
        // a car landing on its side: dust along it, and a thump
        const c = e.car, [a, b] = c.p;
        for (let i = 0; i < 12; i++) {
          const u = R(), x = a.e + (b.e - a.e) * u, n = a.n + (b.n - a.n) * u;
          vfx.spawn(0, x, c.y - 1, -n, (R() - 0.5) * 5, 1.5 + R() * 3, (R() - 0.5) * 5, 2.5, 8 + R() * 5, 3.5 + R() * 3, -1, 0.2);
        }
        state.shake = Math.max(state.shake || 0, Math.min(1.4, e.strength * 0.5) * Math.max(0.2, 1 - dist / 400));
        if (sound && sound.boom) sound.boom(dist);
      } else if (e.kind === "scrape") {
        // steel on rails and ballast: sparks; anything: dust behind it
        const k = Math.min(1, e.speed / 20);
        if (e.steel || R() < 0.3)
          for (let i = 0; i < 10 * k + 2; i++)
            vfx.spawn(2, e.e + (R() - 0.5) * 6, e.y, -(e.n + (R() - 0.5) * 6),
                      e.ve * 0.6 + (R() - 0.5) * 8, 2 + R() * 6, -(e.vn * 0.6) + (R() - 0.5) * 8, 0.3, 0.08, 0.4 + R() * 0.6, 3000, -12);
        if (R() < 0.6)
          vfx.spawn(0, e.e + (R() - 0.5) * 10, e.y, -(e.n + (R() - 0.5) * 10), (R() - 0.5) * 2, 1 + R() * 2, (R() - 0.5) * 2,
                    2, 6 + R() * 4, 2.5 + R() * 2, -1, 0.2);
        state.shake = Math.max(state.shake || 0, 0.25 * k * Math.max(0, 1 - dist / 300));
      } else if (e.kind === "derail" || e.kind === "tear") {
        for (let i = 0; i < 24; i++)
          vfx.spawn(2, e.e, y + 0.5, -e.n, (R() - 0.5) * 16, 3 + R() * 8, (R() - 0.5) * 16, 0.35, 0.08, 0.5 + R() * 0.8, 3200, -12);
      }
    }
    w.events.length = 0;
  }
  // AI trains a blast threw off the track (hero mode): taken out of the
  // timetable and left lying where they land, drawn from their wreck poses.
  // The four latest are kept.
  const aiWrecks = [];
  function blastTrains(x, n, R, power) {
    for (const t of traffic.trains.slice()) {
      if (t === playerTrain) continue;
      const pts = t.dir > 0 ? routeData.track_down : routeData.track_up;
      const lay = carLayout(t);
      if (!lay.some(L => { const q = ptAt(pts, L.c); return Math.hypot(q[0] - x, q[1] - n) < R; })) continue;
      const track = { at: m => ptAt(pts, m), tangent: m => tanAt(pts, m) };
      const w = new TrainWreck(track, t.dir, lay, t.v || 0, trackGround(track, t.m, demAt, 200 + (t.length || 300)), { derail: false });
      w.step(1 / 60);
      w.blast(x, n, R, power);
      traffic.trains = traffic.trains.filter(o => o !== t);
      aiWrecks.push({ t: { id: t.id, stock: t.stock, cars: t.cars, dir: t.dir, m: t.m, loco: t.loco, seed: t.seed, length: t.length, wreck: w.poses }, w });
      if (aiWrecks.length > 4) aiWrecks.shift();
    }
  }

  // The end of a run: the scorecard, and for a mission the personal best.
  function finishRun() {
    if (state.finished) return;
    state.finished = true;
    state.paused = true;
    const res = state.run.result();
    const m = state.mission;
    const prefs = loadPrefs();
    let extra = `<p class="note">${tt("Utasok a vonaton", "Passengers on board")}: ${driver.pax || 0}${res.whtkm ? ` · ${res.whtkm.toFixed(0)} Wh/tkm` : ""}</p>`;
    if (m && !res.assisted && !state.run.derailed) {
      prefs.missions = prefs.missions || {};
      const before = totalStars(prefs), old = prefs.missions[m.id];
      if (!old || res.total > old.total) {
        prefs.missions[m.id] = { stars: Math.max(res.stars, old ? old.stars : 0), total: res.total };
        savePrefs(prefs);
        extra += `<p class="note good">${old ? tt(`Új egyéni csúcs (előtte ${old.total}%)`, `New personal best (was ${old.total}%)`) : tt("Első teljesítés", "First completion")}</p>`;
      } else extra += `<p class="note">${tt("Egyéni csúcs", "Personal best")}: ${old.total}%</p>`;
      const after = totalStars(prefs);
      const t = TIERS.find(t => t.need > before && t.need <= after);
      if (t) extra += `<p class="note good">${tt("Új fokozat", "New grade")}: <b>${tierName(t)}</b> — ${tt("új feladatok nyíltak meg", "new missions unlocked")}</p>`;
    }
    document.getElementById("endTitle").textContent = state.run.derailed ? tt("Kisiklás", "Derailed") : m ? mTitle(m) : tt("Menet vége", "Run complete");
    document.getElementById("endStars").innerHTML = res.assisted ? "" : starStr(res.stars);
    document.getElementById("endStats").innerHTML = scorecardHTML(res, CATS, extra);
    document.getElementById("endModal").style.display = "block";
    document.getElementById("endRestart").onclick = () => {
      if (m) startMission(m);
      else startRun(state.runDir, state.runStart, state.scenario, "custom");
    };
    document.getElementById("endMenu").onclick = () => {
      document.getElementById("endModal").style.display = "none";
      toggleMenu(true);
      if (m) showMissions();
    };
  }
  // ---- the dispatcher game (Forgalmi szolgálat). On a single-track line you
  // decide, section by section, which direction goes next (click it on the
  // board). A unit fails and a train runs late, the same in both worlds: the
  // one you dispatch, and a shadow copy of the same traffic that the
  // automatic first-come-first-served rule dispatches. The score is your
  // total lateness against the shadow's.
  function startDispatch(m) {
    if (!traffic.single || !traffic.single.length) { console.warn("no single track here"); return; }
    const setIn = (id, v) => { const el = document.getElementById(id);
      if (el) { el.value = v; el.dispatchEvent(new Event("input")); } };
    setIn("daySlider", m.day); setIn("timeSlider", m.hour);
    if (window.__setWeather) window.__setWeather(m.wx);
    document.getElementById("endModal").style.display = "none";
    state.mission = m; state.run = null; state.finished = false; state.messages = [];
    const t0 = state.hour * 3600;
    let seed = [...m.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    // the failed unit: in the middle of one of the single-track sections
    const [a, b] = traffic.single[Math.floor(rnd() * traffic.single.length)];
    const bd = { m: (a + b) / 2, dir: rnd() < 0.5 ? 1 : -1, after: t0 + 300 + rnd() * 600, dur: 720 + rnd() * 360 };
    // late trains: one each way (a freight if there is one), so they arrive
    // at the single track when the timetable did not plan for them
    const inShift = traffic.services.filter(sv => sv.enter_s > t0 + 300 && sv.enter_s < t0 + m.dur * 60 - 1200);
    const delayed = new Map();
    let late = null;
    for (const dir of [1, -1]) {
      const cand = inShift.filter(sv => sv.dir === dir);
      const pick = cand.find(sv => /^teh|M44|1116/i.test(sv.name)) || cand[Math.floor(rnd() * cand.length)];
      if (pick) { delayed.set(pick.id, 420 + Math.round(rnd() * 480)); late = late || pick; }
    }
    const reset = (T) => {
      T.trains.length = 0; T.seekTo(t0); T.holds.clear();
      T.claim = T.single.map(() => null); T.prefer = T.single.map(() => 0);
      T.late = { sum: 0, n: 0, wait: 0 }; T.breakdown = { ...bd }; T.delayed = new Map(delayed);
    };
    reset(traffic);
    traffic.trains.push(playerTrain); playerTrain.m = -1e7; playerTrain.v = 0;
    const shadow = new Traffic(route, routeData.signals, assets.timetable);
    shadow.setSingleTrack(traffic.single);
    reset(shadow);
    const ghost = { dir: 1, m: -1e7, v: 0, length: 150, cars: 6, svc: { id: "player", pattern: "all" }, aspect: 3 };
    shadow.trains.push(ghost);
    state.dispatch = { m, t0, end: t0 + m.dur * 60, shadow, ghost, late, delay: late ? delayed.get(late.id) : 0, bd };
    driver.auto = true; state.manual = false;
    state.panel = true; state.speedMul = 2;
    toggleMenu(false);
    state.messages.push({ text: tt(`${m.title} — ${m.dur} perc. Kattints egy egyvágányú szakaszra: ki menjen előbb.`, `${mTitle(m)} — ${m.dur} min. Click a single-track section: who goes first.`), t: 10 });
    for (const [id, d] of delayed) {
      const sv = traffic.services.find(x => x.id === id);
      if (sv) state.messages.push({ text: tt(`${sv.name} (${sv.dir > 0 ? "kifelé" : "Budapest felé"}) ${Math.round(d / 60)} perc késéssel indul.`, `${sv.name} (${sv.dir > 0 ? "outbound" : "to Budapest"}) leaves ${Math.round(d / 60)} min late.`), t: 12, tone: "bad" });
    }
  }
  function finishDispatch() {
    const D = state.dispatch; if (!D) return;
    state.dispatch = null; state.paused = true; state.finished = true; state.panel = false;
    // trains held at red signals, in minutes: yours against the automatic
    // rule's. Matching it is one star; a quarter less waiting is three.
    const mine = traffic.late.wait / 60, auto = D.shadow.late.wait / 60;
    const ratio = (mine + 3) / (auto + 3);
    const total = Math.max(0, Math.min(100, Math.round(100 - (ratio - 0.65) * 100)));
    const stars = starsFor(total);
    const m = D.m;
    let extra = `<p class="note">${tt("Vonatok várakozása piros jelzőnél", "Trains waiting at red")}: <b>${tt("te", "you")} ${mine.toFixed(0)} min</b> · ${tt("automatika", "automatic")} ${auto.toFixed(0)} min<br>
      késés az indulásoknál: te ${(traffic.late.sum / 60).toFixed(0)} · automatika ${(D.shadow.late.sum / 60).toFixed(0)} perc · ${traffic.late.n} indulás</p>`;
    const prefs = loadPrefs();
    prefs.missions = prefs.missions || {};
    const old = prefs.missions[m.id];
    const before = totalStars(prefs);
    if (!old || total > old.total) {
      prefs.missions[m.id] = { stars: Math.max(stars, old ? old.stars : 0), total };
      savePrefs(prefs);
      extra += `<p class="note good">${old ? tt(`Új egyéni csúcs (előtte ${old.total}%)`, `New personal best (was ${old.total}%)`) : tt("Első teljesítés", "First completion")}</p>`;
    }
    const t = TIERS.find(t => t.need > before && t.need <= totalStars(prefs));
    if (t) extra += `<p class="note good">${tt("Új fokozat", "New grade")}: <b>${tierName(t)}</b></p>`;
    document.getElementById("endTitle").textContent = mTitle(m);
    document.getElementById("endStars").innerHTML = starStr(stars);
    document.getElementById("endStats").innerHTML = `<div class="tot">${total}%</div>${extra}`;
    document.getElementById("endModal").style.display = "block";
    document.getElementById("endRestart").onclick = () => startMission(m);
    document.getElementById("endMenu").onclick = () => {
      document.getElementById("endModal").style.display = "none";
      toggleMenu(true); showMissions();
    };
  }
  // A mission: its line (reloading onto it if need be), time, day and
  // weather, then the run from its stop, driven by hand.
  function startMission(m) {
    const line = new URLSearchParams(location.search).get("line") || "line70";
    if (m.line !== line) { location.search = `?line=${m.line}&mission=${m.id}`; return; }
    if (m.type === "dispatch") { startDispatch(m); return; }
    state.dispatch = null;
    const a = routeData.stops.find(x => x.name === m.from), b = routeData.stops.find(x => x.name === m.to);
    if (!a || !b) { console.warn("mission stops not on this line", m); return; }
    const setIn = (id, v) => { const el = document.getElementById(id);
      if (el) { el.value = v; el.dispatchEvent(new Event("input")); } };
    setIn("daySlider", m.day);
    setIn("timeSlider", m.hour);
    const wc = document.getElementById("wxChange");
    if (wc && wc.checked) { wc.checked = false; state.wxChanging = false; }
    selMode.value = "manual";
    startRun(b.km > a.km ? 1 : -1, a.km, m.scenario, "custom", { mission: m });
    if (window.__setWeather) window.__setWeather(m.wx);
    const ws = document.getElementById("wxSit"); if (ws) ws.value = m.wx;
    driver.auto = false; state.manual = true;
    state.messages.push({ text: tt(`${m.title}: ${m.from} → ${m.to}. Te vezetsz — W vontat, S fékez.`, `${mTitle(m)}: ${m.from} → ${m.to}. You drive — W power, S brake.`), t: 9, tone: "" });
  }
  const missionsEl = document.getElementById("missions");
  function showMissions() {
    renderMissions(missionsEl, loadPrefs(), m => { missionsEl.classList.remove("on"); startMission(m); });
    missionsEl.classList.add("on");
  }
  document.getElementById("mMission").style.display = "";
  document.getElementById("mAlbum").addEventListener("click", () => window.__album && window.__album());
  document.getElementById("mMission").addEventListener("click", showMissions);
  {
    const dm = dailyMission();
    const wxS = SITUATIONS.find(w => w.id === dm.wx) || {};
    const wxName = tt(wxS.hu, wxS.en) || dm.wx;
    const best = (loadPrefs().missions || {})[dm.id];
    document.getElementById("mDailySub").textContent =
      `${mTitle(dm).replace(/^.*? · /, "")} · ${dm.from} → ${dm.to} · ${fmtTime(dm.hour)} · ${wxName}${best ? ` · ${tt("ma", "today")}: ${best.total}%` : ""}`;
    document.getElementById("mDaily").addEventListener("click", () => startMission(dm));
  }
  {
    const want = new URLSearchParams(location.search).get("mission");
    const m = want && (want.startsWith("daily-") ? dailyMission() : [...MISSIONS, ...DISPATCH].find(x => x.id === want));
    if (m) setTimeout(() => startMission(m), 0);
  }

  // A link to this place and moment: the line, where the train is, the time,
  // the day, the weather, and the free camera if one is out. Opening it
  // starts a run there (see below). navigator.share on a phone, else the
  // clipboard.
  window.__share = () => {
    const q = new URLSearchParams();
    const line = new URLSearchParams(location.search).get("line");
    if (line) q.set("line", line);
    q.set("at", (driver.m / 1000).toFixed(2));
    q.set("h", state.hour.toFixed(2)); q.set("d", Math.round(state.day));
    if (state.wxId) q.set("wx", state.wxId);
    if (state.runDir < 0) q.set("dir", "-1");
    if (state.fly) q.set("cam", [...state.fly.p.map(v => v.toFixed(1)), state.yaw.toFixed(3), state.pitch.toFixed(3)].join(","));
    const url = location.origin + location.pathname + "?" + q.toString();
    const done = (t) => { const n = document.getElementById("photoToast"); if (!n) return;
      n.innerHTML = `<div><b>${t}</b><span>${url.replace(/^https?:\/\//, "")}</span></div>`;
      n.classList.remove("on"); void n.offsetWidth; n.classList.add("on");
      setTimeout(() => n.classList.remove("on"), 4000); };
    if (navigator.share && document.body.classList.contains("touch")) {
      navigator.share({ title: document.title, url }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => done(tt("A link a vágólapon", "Link copied")), () => done(tt("A link:", "The link:")));
    } else done(tt("A link:", "The link:"));
    return url;
  };
  {
    const q = new URLSearchParams(location.search);
    if (q.has("at") && !q.has("mission")) setTimeout(() => {
      const km = Math.max(route.m0 / 1000 + 0.06, Math.min(route.m1 / 1000 - 0.06, +q.get("at") || 0));
      const setIn = (id, v) => { const el = document.getElementById(id);
        if (el && isFinite(+v)) { el.value = v; el.dispatchEvent(new Event("input")); } };
      if (q.has("d")) setIn("daySlider", q.get("d"));
      if (q.has("h")) setIn("timeSlider", q.get("h"));
      const lineQ = q.get("line") || "line70";
      startRun(q.get("dir") === "-1" ? -1 : 1, km, lineQ === "s21" ? "S21" : lineQ === "line2" ? "S72" : "S70", "custom");
      if (q.has("wx") && window.__setWeather) {
        const wc = document.getElementById("wxChange"); if (wc && wc.checked) { wc.checked = false; state.wxChanging = false; }
        window.__setWeather(q.get("wx")); const ws = document.getElementById("wxSit"); if (ws) ws.value = q.get("wx");
      }
      toggleMenu(false);
      const c = (q.get("cam") || "").split(",").map(Number);
      if (c.length === 5 && c.every(isFinite)) { state.follow = false; state.fly = { p: [c[0], c[1], c[2]], speed: 30 }; state.yaw = c[3]; state.pitch = c[4]; }
    }, 0);
  }

  function startRun(dir, startKm, scenario, env, opts = {}) {
    state.runDir = dir; state.runStart = startKm;
    state.scenario = scenario || "S70";
    state.mission = opts.mission || null;
    document.getElementById("endModal").style.display = "none";
    // (out of the dispatcher game: its orders and disruptions go with it)
    state.dispatch = null;
    traffic.breakdown = null; traffic.delayed = new Map(); traffic.late = { sum: 0, n: 0 };
    if (traffic.single) traffic.prefer = traffic.single.map(() => 0);
    // what you drive depends on what you are running (a mission may say)
    const stk = opts.mission && opts.mission.stock ? STOCKS[opts.mission.stock]
              : state.scenario === "EC" ? STOCKS.EC
              : state.scenario === "Freight" ? STOCKS.FREIGHT
              : state.scenario === "S21" ? STOCKS.M416      // Lajosmizse: diesel, not wired past KÖKI
              : /^Z/.test(state.scenario) || state.scenario === "S72" ? STOCKS.FLIRT : STOCKS.KISS;
    driver.s = stk;
    sound.diesel = !!stk.diesel;         // the 416 has an engine, not an inverter
    playerTrain.stock = stk.stock; playerTrain.cars = stk.cars; playerTrain.length = stk.lengthM;
    driver.lever = 0; driver.emergency = false; driver.bcp = 0; driver.edb = 0;
    
    // (the start jingle is played once below as 'szignal_mav'; this call used a
    // name that is never loaded)

    if (env && env !== "custom") {
      if (env === "summer_morning") {
        state.day = 175; state.wxId = "derult"; state.fog = 1.0; state.wxInt = 0.2;
      } else if (env === "autumn_rain") {
        state.day = 295; state.wxId = "melegfront"; state.fog = 2.5; state.wxInt = 1.0;
      } else if (env === "winter_snow") {
        state.day = 15; state.wxId = "havazas"; state.fog = 1.8; state.wxInt = 1.5;
      } else if (env === "storm") {
        state.day = 190; state.wxId = "zivatar"; state.fog = 1.2; state.wxInt = 2.0;
      }
      // a preset is what you asked for: it holds until a front comes, later
      state.front = state.wxChanging
        ? queueFront(state.wxId, driver.m, state.day, 16000 + Math.random() * 8000) : null;
      syncWx();
    }

    route.setDirection(dir);
    driver.route = route;
    driver.m = startKm != null ? startKm * 1000 : route.startM;
    driver.v = 0; driver.dwell = 0; driver.doors = 0; driver.throttle = 0;
    driver.brake = 0; driver.pax = 90 + Math.round(Math.random() * 80);
    driver.terminated = false; driver.layover = 0;
    driver.boarding = 0; driver.lastStop = null; driver.t = 0;
    driver.stopIdx = Math.max(0, route.stops.findIndex(
      s => (s.km * 1000 - driver.m) * dir > 30));
    driver.auto = selMode.value === "auto";
    state.manual = !driver.auto;
    playerTrain.dir = dir; playerTrain.m = driver.m; playerTrain.v = 0;
    // a wreck from the last run is cleared away
    if (state.wreck) { state.wreck = null; playerTrain.wreck = null; state.fly = null; }
    aiWrecks.length = 0;
    playerTrain.svc.pattern = state.scenario === "EC" || state.scenario === "Freight" ? "none" : 
                              state.scenario === "G70" ? "fast" : "all";
    traffic.trains.length = 0; traffic.trains.push(playerTrain);
    traffic.seekTo(state.hour * 3600);
    // the player takes the next booked path in their direction
    const path = opts.path || (assets.timetable.services || []).find(
      sv => sv.dir === dir && sv.name.startsWith(state.scenario)
            && sv.enter_s >= state.hour * 3600 - 600);
    state.path = path || null;
    state.lateness = null;
    state.pathIdx = 0;
    // The booked path starts at the end of the line; the player may start
    // anywhere along it. Rebase so the first call at or beyond the chosen
    // start is due now, otherwise the figure is an hour and a half out.
    state.pathOffset = 0;
    state.pathOffset = 0;
    if (path) {
      const c0 = path.calls.find(c => (c[0] * 1000 - driver.m) * dir >= -40);
      if (c0) state.pathOffset = state.hour * 3600 - c0[1];
      state.pathIdx = Math.max(0, path.calls.indexOf(c0));
    }
    // The stops this train calls at: from its booked path, else from its
    // stopping pattern. A mission's hand-over stop is always one.
    driver.callsAt = null;
    if (path) {
      const names = new Set();
      for (const c of path.calls) {
        if (!c[3]) continue;
        const st = route.stops.find(x => Math.abs(x.km - c[0]) < 0.25);
        if (st) names.add(st.name);
      }
      if (names.size) driver.callsAt = names;
    } else if (playerTrain.svc.pattern !== "all") {
      driver.callsAt = new Set(traffic.stopsFor(playerTrain.svc).map(x => x.name));
    }
    if (driver.callsAt && state.mission) driver.callsAt.add(state.mission.to);
    driver.stopIdx = Math.max(0, route.stops.findIndex(s => (s.km * 1000 - driver.m) * dir > 30));
    state.followIdx = -1; state.yaw = 0; state.pitch = -0.02; state.zoom = 1;

    // the scorecard (score.js): only what you drive yourself counts
    state.run = new RunScore(driver);
    state.messages = state.run.messages;
    state.score = null;
    state.finished = false;
    state.last99SignalStation = null;
    state.sigIdx = null; state.sigM = null;
    
    // Play the starting signal
    if (sound.ctx) sound.playSample('szignal_mav');
    
    toggleMenu(false);
  }
  document.getElementById("mClose").addEventListener("click", () => toggleMenu(false));
  // the panel folds down to its title; remembered per browser
  {
    const pnl = document.getElementById("panel"), fb = document.getElementById("foldBtn");
    const setFold = (f, save) => { pnl.classList.toggle("folded", f); fb.textContent = f ? "▸" : "▾";
                           if (save) try { localStorage.setItem("szobPanelFolded", f ? "1" : "0"); } catch (e) {} };
    // folded to start with on a touch screen, where it would cover half the view
    let f0 = document.body.classList.contains("touch");
    try { const v = localStorage.getItem("szobPanelFolded"); if (v === "1" || v === "0") f0 = v === "1"; } catch (e) {}
    setFold(f0);
    fb.addEventListener("click", e => { e.stopPropagation(); setFold(!pnl.classList.contains("folded"), true); });
    const lineId = new URLSearchParams(location.search).get("line") || "line70";
    const t = document.getElementById("panelTitle"), bt = document.getElementById("buildTag");
    // the game's name on the panel; the line underneath it
    t.textContent = tt("Dunakanyar Szimulátor", "Dunakanyar Simulator");
    bt.textContent = lineId === "line2" ? "MÁV 2 · Nyugati – Pilis – Esztergom"
                   : lineId === "s21" ? "S21 · Nyugati – Kőbánya-Kispest – Lajosmizse"
                   : "MÁV 70 · Nyugati – Vác – Szob";
  }
  // (settings.js fills the start list, with last time's choice)
  outHour.textContent = fmtTime(+inpHour.value);
  state.runDir = 1; state.runStart = null;
  toggleMenu(true);
  // the loading screen goes once the first picture is on screen
  requestAnimationFrame(() => requestAnimationFrame(() => window.__loadDone && window.__loadDone()));
  setTimeout(() => window.__loadDone && window.__loadDone(), 2000);   // (a hidden tab runs no frames)

  installInput({ cv, hud, panelCanvas, keys, route, routeData, driver,
                 traffic, roadTraffic, riverTraffic, playerTrain, sound, startRun, toggleMenu });

  function buildHeroMesh(p) {
    const V = [], C = [];
    const push = (pt, col) => { V.push(pt[0], pt[1], -pt[2]); C.push(col[0], col[1], col[2]); };
    const quad = (a, b, c, d, col) => { push(a, col); push(b, col); push(c, col); push(a, col); push(c, col); push(d, col); };
    const yaw = p.yaw || 0;
    const fx = Math.sin(yaw), fy = -Math.cos(yaw);
    const rx = -fy, ry = fx;
    const P = (a, b, y) => [p.x + rx * a + fx * b, y, p.n + ry * a + fy * b];
    const box = (cx, cz, hw, hd, h0, h1, col) => {
      const b0 = (a, b, y) => [p.x + rx * (cx + a) + fx * (cz + b), y, p.n + ry * (cx + a) + fy * (cz + b)];
      const c = [b0(-hw, -hd, h0), b0(hw, -hd, h0), b0(hw, hd, h0), b0(-hw, hd, h0)];
      const t = [b0(-hw, -hd, h1), b0(hw, -hd, h1), b0(hw, hd, h1), b0(-hw, hd, h1)];
      for (let k = 0; k < 4; k++) quad(c[k], c[(k + 1) % 4], t[(k + 1) % 4], t[k], col);
      quad(t[0], t[1], t[2], t[3], col);
      quad(c[3], c[2], c[1], c[0], col);
    };
    const g = p.y, W = 0.22;
    const jacket = p.jacketCol || [0.15, 0.45, 0.88];
    const pants = p.pantsCol || [0.10, 0.12, 0.16];
    const skin = [0.86, 0.68, 0.55], hair = [0.12, 0.10, 0.08], boots = [0.08, 0.08, 0.09];

    // Legs & Boots
    for (const sd of [-1, 1]) {
      box(sd * W * 0.45, 0, W * 0.35, W * 0.38, g, g + 0.22, boots);
      box(sd * W * 0.45, 0, W * 0.35, W * 0.38, g + 0.22, g + 0.82, pants);
    }
    // Torso / Jacket
    box(0, 0, W * 1.05, W * 0.65, g + 0.82, g + 1.45, jacket);
    // Belt
    box(0, 0, W * 1.08, W * 0.68, g + 0.80, g + 0.88, [0.85, 0.70, 0.15]);
    // Arms (raised forward/angled when flying)
    for (const sd of [-1, 1]) {
      const armForward = p.flying ? 0.32 : 0;
      box(sd * W * 1.35, armForward, W * 0.22, W * 0.28, g + 0.88, g + 1.42, jacket);
      box(sd * W * 1.35, armForward * 1.3, W * 0.20, W * 0.22, g + 0.74, g + 0.88, skin);
    }
    // Head & Hair & Sunglasses/Visor
    box(0, 0, W * 0.45, W * 0.48, g + 1.45, g + 1.72, skin);
    box(0, -0.02, W * 0.48, W * 0.45, g + 1.62, g + 1.76, hair);
    box(0, 0.08, W * 0.42, W * 0.12, g + 1.56, g + 1.64, [0.08, 0.08, 0.10]);

    // Superhero Cape (flows behind dynamically when flying or running)
    const capeH0 = g + 1.40, capeH1 = p.flying ? g + 1.25 : g + 0.65;
    const capeBack = p.flying ? -0.80 : -0.25;
    const capeCol = [jacket[0] * 0.85, jacket[1] * 0.85, jacket[2] * 0.85];
    quad(P(-W * 0.95, -0.15, capeH0), P(W * 0.95, -0.15, capeH0),
         P(W * 1.15, capeBack, capeH1), P(-W * 1.15, capeBack, capeH1), capeCol);
    quad(P(-W * 1.15, capeBack, capeH1), P(W * 1.15, capeBack, capeH1),
         P(W * 0.95, -0.15, capeH0), P(-W * 0.95, -0.15, capeH0), capeCol);

    return { verts: new Float32Array(V), cols: new Float32Array(C), count: V.length / 3 };
  }

  // ---- loop
  let last = performance.now(), fps = 60, acc = 0;
  function frame(now, byHand) {
    const jsT0 = performance.now();
    // Clamped at zero as well as at the top: a timestamp that goes backwards
    // — a clock adjustment, a tab resuming, a hand-driven tick — would give a
    // negative dt and run the entire simulation in reverse, train, clock,
    // weather and all.
    const dtReal = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    fps += ((1 / Math.max(dtReal, 1e-4)) - fps) * 0.05;
    state.fps = fps;                               // (for the fps box, index.html)
    // automatic resolution: checked every two seconds, only while visible
    state.resT = (state.resT || 0) + dtReal;
    if (state.resT > 2 && !document.hidden) {
      state.resT = 0;
      const dr = state.dynRes || 1;
      if (fps < 40 && dr > 0.56) { state.dynRes = Math.max(0.55, dr * 0.88); resize(); }
      else if (fps > 57 && dr < 1) { state.dynRes = Math.min(1, dr * 1.07); resize(); }
    }
    // Kilátás: the camera director, and the place captions
    if (state.tour && !state.paused) stepDirector(state.tour, dtReal, { state, route, driver, demAt });
    // the weather note on the panel follows what is actually overhead
    state.wxNoteT = (state.wxNoteT || 0) + dtReal;
    if (state.wxNoteT > 1) { state.wxNoteT = 0; syncWx(); }

    if (!state.paused) {
      const dt = dtReal * state.speedMul;
      // manual driving is the master controller in input.js (W/S step the
      // lever, Backspace is the emergency brake) and Driver.controls()
      // The clock. Without this it never moved: the timetable was handed the
      // same instant every frame, so no service after the one you started
      // with was ever released onto the line, lateness was measured against a
      // frozen now, and the sun stood still for the whole run.
      state.hour += dt / 3600;
      if (state.hour >= 24) { state.hour -= 24; traffic.seekTo(state.hour * 3600); }
      // The clock drives the Hour slider, but writing to a control while it
      // is being dragged fights the drag, which is what made the two sliders
      // feel as though they were interfering with each other.
      {
        const ts = document.getElementById("timeSlider");
        if (ts && document.activeElement !== ts && !dragSlider
            && Math.abs(+ts.value - state.hour) > 0.004) ts.value = state.hour;
      }
      syncClockLabels();

      const sub = Math.ceil(state.speedMul);
      const D = state.dispatch;
      for (let k = 0; k < sub; k++) {
        if (D) { playerTrain.m = -1e7; playerTrain.v = 0; }       // (dispatching: your train is off the line)
        else { driver.step(dt / sub); playerTrain.m = driver.m; playerTrain.v = driver.v; }
        traffic.step(dt / sub, state.hour * 3600, playerTrain);
        if (D) D.shadow.step(dt / sub, state.hour * 3600, D.ghost);
      }
      if (D && state.hour * 3600 >= D.end) finishDispatch();
      playerTrain.aspect = traffic.aspectFor(playerTrain);
      // the automatic driver obeys a red: it did not look at signals at all
      {
        const ds = traffic.distanceToSignal(playerTrain);
        driver.signalStop = playerTrain.aspect === ASPECT.STOP && ds < 3000 ? driver.m + route.dir * ds : null;
        // a car on the line, seen from 700 m
        const ob = traffic.obstacleM;
        if (ob != null && driver.auto) {
          const d = (ob - driver.m) * route.dir;
          if (d > 0 && d < 700) {
            const at = ob - route.dir * 12;
            if (driver.signalStop == null || (at - driver.signalStop) * route.dir < 0) driver.signalStop = at;
          }
        }
      }

      // the scorecard, the arrival chime, and signals passed at danger
      if (state.run && !state.finished) {
        const run = state.run;
        run.step(dt, route.limitAt(driver.m));
        const nextStop = driver.targetStop();
        if (nextStop) {
          const dist = (nextStop.km * 1000 - driver.m) * route.dir;
          const last = route.stops[route.dir > 0 ? route.stops.length - 1 : 0];
          // Two announcements, as MÁV makes them: "Következő állomás: X"
          // once the train is under way from the last stop, and "X
          // következik" shortly before arriving (about 40 s, at least 350 m).
          // Each after the chime; a local recording, else the browser's own
          // Hungarian voice, else silence (never an English voice mangling
          // the names).
          if (dist > 350 && driver.v > 3 && state.lastAnnNext !== nextStop.name) {
            state.lastAnnNext = nextStop.name;
            if (sound.ctx) sound.playSample('szignal_99');
            announce(nextStop.name, nextStop === last);
          }
          if (dist > 0 && dist < Math.max(350, driver.v * 40) && state.last99SignalStation !== nextStop.name) {
            state.last99SignalStation = nextStop.name;
            if (sound.ctx) sound.playSample('szignal_99');
            announce(nextStop.name, false, "_kov");
          }
        }
        // Passing a signal at danger: the signal ahead changes (you went past
        // it) while it was showing stop. Restarts and station jumps excluded.
        {
          const idx = traffic.signalAhead(playerTrain);
          const jumped = state.sigM != null && Math.abs(driver.m - state.sigM) > 150;
          state.sigM = driver.m;
          if (!jumped && state.sigIdx != null && idx !== state.sigIdx && state.sigAspect === 0 && driver.v > 0.5) run.spad();
          state.sigIdx = idx; state.sigAspect = playerTrain.aspect;
        }
        // Derailment: the curve's radius from the track either side of the
        // train, and the sideways acceleration at this speed. The limits
        // carry a big margin, so it takes both: well over the posted speed
        // and more than 2.6 m/s² sideways (about 50% over the limit on a
        // typical curve).
        if (!driver.auto && driver.v > 8) {
          const a = route.at(driver.m - 25 * route.dir), b = route.at(driver.m), c = route.at(driver.m + 25 * route.dir);
          const h1 = Math.atan2(b[0] - a[0], b[1] - a[1]), h2 = Math.atan2(c[0] - b[0], c[1] - b[1]);
          let dh = Math.abs(h2 - h1); if (dh > Math.PI) dh = 2 * Math.PI - dh;
          const lat = dh > 1e-4 ? driver.v * driver.v * dh / 25 : 0;
          state.latAcc = lat;
          if (lat > 2.6 && driver.v * 3.6 > route.limitAt(driver.m) * 1.35 && !state.wreck) {
            run.derailed = true;
            run.say(tt(`Kisiklás! ${Math.round(driver.v * 3.6)} km/h egy ${Math.round(route.limitAt(driver.m))}-as ívben`, `Derailed! ${Math.round(driver.v * 3.6)} km/h in a ${Math.round(route.limitAt(driver.m))} curve`), 10, "bad");
            startWreck(lat, h1, h2);
          }
        }
        // the live figure, when you are the one driving
        state.score = driver.auto || run.manualM < 200 ? null : run.result().total;
        for (let i = run.messages.length - 1; i >= 0; i--) {
          run.messages[i].t -= dtReal;
          if (run.messages[i].t <= 0) run.messages.splice(i, 1);
        }
        // the end: a mission ends where you hand the train over, any run at
        // the end of the line
        const m = state.mission;
        const handed = m && driver.dwell > 0 && driver.lastStop === m.to;
        if (handed || (driver.terminated && driver.layover <= 0)) finishRun();
      }

      // road traffic: which booms are down, then everyone reacts to them
      {
        const closed = new Set();
        for (let i = 0; i < routeData.crossings.length; i++) {
          const x = routeData.crossings[i];
          if (!x.barrier || x.barrier === "no") continue;
          for (const tr of traffic.trains)
            if (Math.abs(tr.m - x.m) < 900 && tr.v > 1) { closed.add(i); break; }
        }
        state.closedGates = closed;
        const here = route.at(driver.m);
        // stream around the camera, not the train, so a chase or a follow
        // view is populated too
        if ((roadRepop -= dtReal) <= 0) {
          // last frame's camera: the physics runs before the view is built,
          // and at a second and a half between top-ups it makes no odds
          const c0 = state.camXZ || here;
          roadTraffic.closeTraffic = !!((state.person && state.person.active) || (state.car && state.car.active));
          roadTraffic.populate(c0[0], c0[1], Math.max(1200, (state.carReach || 0) + 300));
          roadRepop = 1.5;
        }
        roadTraffic.step(Math.min(dt, 0.4), closed);
        riverTraffic.step(Math.min(dt, 2.0));
      }
      // how are we doing against the booked path?
      const path = state.path;
      if (path) {
        const clock = state.hour * 3600;
        while (state.pathIdx < path.calls.length) {
          const c = path.calls[state.pathIdx];
          if ((c[0] * 1000 - driver.m) * route.dir > 0) break;
          const lateSeconds = clock - (c[1] + (state.pathOffset || 0));
          state.lateness = lateSeconds;
          
          if (c[3] && state.run) {
            const st = route.stops.find(x => Math.abs(x.km - c[0]) < 0.25);
            if (st) state.run.onCall(st.name, lateSeconds);
          }

          state.pathIdx++;
        }
      }
      // (the clock is advanced once, at the top of this block; it was also
      // advanced here, so game time ran at twice real time and every train,
      // yours included, drifted late against the timetable)
    }

    // ---- the animator
    //
    // Mark's idea, and it earns its keep the moment the panel has this many
    // dials on it: let the sky drive itself. The day runs, or the year runs,
    // or the weather turns, or all three at once, and you sit in the cab and
    // watch. It moves the same state the sliders do — there is no second path
    // through any of this — so everything downstream follows for free.
    if (state.cine && state.cine !== "off") {
      const r = (state.cineRate || 1.6) * dtReal;
      if (state.cine === "day" || state.cine === "all") {
        state.hour += r * 0.55;                    // a full day in about a minute
        const ts2 = document.getElementById("timeSlider");
        if (ts2) ts2.value = ((state.hour % 24) + 24) % 24;
        if (window.__syncWx) state.cineWx = (state.cineWx || 0) + 0;
      }
      if (state.cine === "year" || state.cine === "all") {
        state.day = ((state.day + r * 1.9 - 1) % 365) + 1;
        const ds = document.getElementById("daySlider");
        if (ds) ds.value = Math.round(state.day);
      }
      if (state.cine === "weather" || state.cine === "all") {
        // the animator runs the fronts about twenty times faster, so a sky
        // arrives while you are still looking at it (licence, deliberately)
        if (!state.front) state.front = queueFront(state.wxId, driver.m, state.day, 7000);
        state.front = stepFront(state.front, r * 20 * (state.cineRate || 1.6), driver.m, state.day);
      }
      // the read-outs on the panel would otherwise sit at their old values
      if (window.__syncClock) window.__syncClock();
    }
    
    // camera modes
    if (state.camMode === "orbit") {
      state.follow = true;
      state.cab = false;
      state.fly = false;
      if (state.drone) state.drone.active = false;
      state.yaw += dtReal * 0.4; // Orbit animation
      state.pitch = Math.max(-0.6, Math.min(0, state.pitch));
    } else if (state.camMode === "drone") {
      // A drone keeping pace with the train: high, off to one side, drifting
      // slowly round it and back. (It panned by state.t, which nothing ever
      // set: NaN angles, and the camera went nowhere.)
      state.follow = true;
      state.cab = false;
      state.fly = false;
      if (state.drone) state.drone.active = false;
      const tt0 = performance.now() * 0.001;
      const yawT = 0.9 + Math.sin(tt0 * 0.05) * 1.1, pitchT = -0.42 + Math.sin(tt0 * 0.071) * 0.12;
      state.yaw += (yawT - state.yaw) * Math.min(1, dtReal * 0.5);
      state.pitch += (pitchT - state.pitch) * Math.min(1, dtReal * 0.5);
      state.zoom += (0.55 - state.zoom) * Math.min(1, dtReal * 0.5);
    }

    if (keys.has("ArrowLeft")) state.yaw -= dtReal * 1.1;
    if (keys.has("ArrowRight")) state.yaw += dtReal * 1.1;

    // camera — either the cab, or riding with another service
    let subject = driver.m, subjDir = route.dir, subjPts = route.pts, followTrain = null;
    if (state.followIdx >= 0) {
      const list = traffic.trains.filter(t => t.svc.id !== "player");
      followTrain = list[state.followIdx % Math.max(1, list.length)];
      if (followTrain) {
        subject = followTrain.m; subjDir = followTrain.dir;
        subjPts = followTrain.dir > 0 ? routeData.track_down : routeData.track_up;
      } else {
        state.followIdx = -1;
      }
    }
    const p = state.followIdx >= 0 ? ptAt(subjPts, subject) : route.at(driver.m);
    const tan = state.followIdx >= 0 ? tanAt(subjPts, subject) : route.tangent(driver.m);
    let eye;
    if (state.followIdx >= 0 && !state.follow) {
      const stock = followTrain ? (followTrain.stock || "KISS") : "KISS";
      // Tailored driver eye position for each specific train cab:
      let noseOff = 0.88, eyeH = 2.65;
      if (stock === "KISS") {
        noseOff = 0.88; eyeH = 2.65;
      } else if (stock === "FLIRT") {
        noseOff = 0.78; eyeH = 2.50;
      } else if (stock === "EC" || stock === "FREIGHT" || stock === "LOCO") {
        noseOff = 0.92; eyeH = 2.58;
      }
      const cabM = subject - noseOff * subjDir;
      const cabP = ptAt(subjPts, cabM);
      eye = [cabP[0], cabP[2] + eyeH, -cabP[1]];
    } else {
      eye = [p[0], p[2] + 3.1, -p[1]];
    }
    // Passenger mode: a window seat on the upper deck of the third car of
    // your own train, looking out sideways. The train is drawn around you
    // with its glass left out (buildTrains hollow), so the windows are real.
    const seated = state.passenger && state.followIdx < 0 && !state.follow && !state.fly
                   && !(state.plane && state.plane.active)
                   && !(state.drone && state.drone.active) && state.followCarIdx < 0
                   && state.followShipIdx < 0 && !state.tram;
    if (seated) {
      const ps = state.passenger;
      // per stock: the KISS seats you upstairs; a FLIRT or an EC coach is
      // single-deck, and the upper-deck height put the eye in their roof
      const stk = driver.s.stock || "KISS";
      const carLen = CAR_LEN[stk] || 25.0;
      const eyeY = stk === "KISS" ? 3.15 : stk === "FLIRT" ? 1.78 : 2.22;
      // (a 416 has two cars: "car 2" was behind the train)
      const carI = Math.min(ps.car, Math.max(0, (driver.s.cars || 6) - 1));
      const mc = driver.m - route.dir * (carLen * carI + carLen * 0.5 + 1.5);
      const c = route.at(mc), t2 = route.tangent(mc);
      const tx = t2[0] * route.dir, ty = t2[1] * route.dir;
      const rx = ty, ry = -tx;                      // right of travel, east/north
      const off = ps.side * (stk === "KISS" ? 0.72 : 0.86);
      eye = [c[0] + rx * off, c[2] + eyeY, -(c[1] + ry * off)];   // seated eye at the window
    }
    const fwdBase = [tan[0] * subjDir, 0, -tan[1] * subjDir];
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    let fwd = state.fly
      ? norm([Math.sin(state.yaw), state.pitch, -Math.cos(state.yaw)])
      : norm([fwdBase[0]*cy - fwdBase[2]*sy, state.pitch,
              fwdBase[0]*sy + fwdBase[2]*cy]);
    let camEye = eye;
    let camRoll = 0;          // the view's bank (radians; + = right side down): the plane's
    // Zoom is two different things and only one of them was implemented. In
    // the cab it can only be the lens — you cannot lean out of the window —
    // and narrowing the field of view is right there. From outside it should
    // be the camera moving: a long lens flattens everything and reads as a
    // telescope rather than as getting closer, which is what Mark noticed.
    // So outside, the lens stays put and the stand-off shrinks instead.
    const flying = !!(state.plane && state.plane.active) || !!(state.car && state.car.active);
    const isSpecialView = state.fly || state.follow || flying || (state.drone && state.drone.active) || state.followCarIdx >= 0 || state.followShipIdx >= 0 || !!state.tram || !!(state.person && state.person.active);
    const lensZoom = isSpecialView ? 1 : state.zoom;
    const dolly = isSpecialView ? state.zoom : 1;

    // ---- your own car (car.js): chase camera, or the driver's seat on C
    // (the car marks itself as an obstacle for trains and traffic each
    // frame it is out; nothing is left behind once it is put away)
    traffic.obstacleM = null;
    if (roadTraffic) roadTraffic.obstacles = null;
    // photo mode's orbit: the free camera kept at its distance from the point
    // in focus, looking at it; the mouse turns it round, the wheel closes in
    if (state.photo && state.photo.orbit && state.fly) {
      const o = state.photo.orbit, f = norm([Math.sin(state.yaw), state.pitch, -Math.cos(state.yaw)]);
      const dd = o.dist / Math.max(0.2, state.zoom || 1);
      state.fly.p = sub(o.pivot, scale(f, dd));
      state.photo.focus = dd;
    }
    // ---- your own superhero / person mode (Hancock abilities)
    if (state.person && state.person.active && !state.photo) {
      const p = state.person;
      if (!p.v) p.v = [0, 0, 0];
      const gy = ((carSurf ? carSurf(p.x, p.n, p.y).y : demAt(p.x, p.n)) || 105) + craterDipAt(p.x, p.n);
      const isHero = p.heroAbilities !== false;

      const triggerHeroShockwave = (pX, pY, pN, power = 1.0) => {
        // 1. Physical ground crater deforming streets & structures in shaders
        addCrater(pX, -pN, 16 * power, 2.5 * power);

        // 2. High-energy expanding ground flash ring & electric blackbody sparks — ZERO blinding brown smoke!
        for (let i = 0; i < 36; i++) {
          const ang = i * Math.PI / 18;
          const spd = (30 + Math.random() * 20) * power;
          // Expanding ground spark ring
          vfx.spawn(2, pX, pY + 0.25, -pN, Math.cos(ang) * spd, 3 + Math.random() * 7, Math.sin(ang) * spd, 0.45 * power, 0.06, 0.75, 3800, -18);
          // Ground flash fire ring (short 0.35s life)
          vfx.spawn(1, pX, pY + 0.35, -pN, Math.cos(ang) * spd * 0.7, 3 + Math.random() * 4, Math.sin(ang) * spd * 0.7, 2.0 * power, 0.2, 0.35, 3400);
        }
        state.shake = Math.min(1.5, 1.1 * power);
        if (sound && sound.boom) sound.boom(32 * power);

        // 3. Launch nearby vehicles with violent ballistic trajectory & localized car flashes!
        const rt = roadTraffic;
        if (rt && rt.vehicles) {
          const blastRadius = 90 * power;
          for (const v of rt.vehicles) {
            const q = rt.place(v);
            const dx = q.x - pX;
            const dz = q.z - pN;
            const dist = Math.hypot(dx, dz);
            if (dist < blastRadius) {
              const factor = Math.max(0.3, 1 - dist / blastRadius);
              const dirX = dist > 0.1 ? dx / dist : (Math.random() - 0.5) * 2;
              const dirZ = dist > 0.1 ? dz / dist : (Math.random() - 0.5) * 2;
              const curY = v.blast ? v.blast.y : (roadSurface ? roadSurface(q.x, q.z) : demAt(q.x, q.z) + 0.4);
              v.blast = {
                x: q.x, y: curY + 0.5, z: q.z,
                vx: dirX * (32 + Math.random() * 24) * factor,
                vy: (24 + Math.random() * 18) * factor + 12,
                vz: dirZ * (32 + Math.random() * 24) * factor,
                spin: (Math.random() - 0.5) * 22,
                rot: 0,
                life: 6.0
              };
              v.free = null;
              v.wrecked = true;
              // Snappy localized car explosion flash (no lingering smoke)
              for (let k = 0; k < 12; k++) {
                const ca = Math.random() * 6.28;
                const cv_ = 8 + Math.random() * 14;
                vfx.spawn(2, q.x, curY + 1.2, -q.z, Math.cos(ca) * cv_, 4 + Math.random() * 8, Math.sin(ca) * cv_, 0.3, 0.05, 0.6, 3200, -14);
              }
              vfx.spawn(1, q.x, curY + 1.0, -q.z, (Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4, 2.2, 0.4, 0.4, 3600);
            }
          }
        }

        // 3b. Trains within reach are thrown off the track (wreck.js)
        blastTrains(pX, pN, 60 * power, power);

        // 4. Shove nearby pedestrians back
        if (typeof pplStand !== "undefined" && pplStand) {
          for (let i = 0; i < pplStand.length; i += 8) {
            const px_ = pplStand[i], pz_ = -pplStand[i + 2];
            const dx = px_ - pX, dz = pz_ - pN;
            const dist = Math.hypot(dx, dz);
            if (dist < 50 * power && dist > 0.1) {
              const push = (50 * power - dist) * 0.45;
              pplStand[i] += (dx / dist) * push;
              pplStand[i + 2] -= (dz / dist) * push;
            }
          }
        }

        state.messages = state.messages || [];
        state.messages.push({
          text: tt("💥 Hancock Szupererő Robbanás!", "💥 Hancock Super Shockwave Blast!"),
          t: 2.5, tone: "warn"
        });
      };

      if (!state.paused) {
        // on a moving train's roof: carried along with it first
        if (p.ride && traffic.trains.includes(p.ride.t)) {
          const q = trainPoint(p.ride.t, p.ride.k);
          if (q) { p.x = q.x + q.nx * p.ride.lat; p.n = q.n + q.nn * p.ride.lat; }
        }
        const isHero = p.heroAbilities !== false;
        if (p.triggerBlast && isHero) {
          p.triggerBlast = false;
          triggerHeroShockwave(p.x, p.y, p.n, 1.25);
        }
        const yaw = state.yaw || 0;
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        let mx = 0, mz = 0;
        if (keys.has("KeyW")) mz += 1;
        if (keys.has("KeyS")) mz -= 1;
        if (keys.has("KeyA")) mx -= 1;
        if (keys.has("KeyD")) mx += 1;
        const len = Math.hypot(mx, mz);
        if (len > 0) { mx /= len; mz /= len; }
        const fwdX = sy * mz + cy * mx;
        const fwdZ = -cy * mz + sy * mx;
        const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
        const dive = keys.has("KeyC") || keys.has("KeyX") || keys.has("ControlLeft") || keys.has("ControlRight");

        // Turning calculation: smoothly turn towards movement direction or camera
        let targetYaw = p.yaw !== undefined ? p.yaw : (state.yaw || 0);
        if (len > 0.01) {
          targetYaw = Math.atan2(fwdX, -fwdZ);
        } else {
          targetYaw = state.yaw || 0;
        }
        let diff = targetYaw - (p.yaw || 0);
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        const turnRate = len > 0.01 ? 16.0 : 10.0;
        p.yaw = (p.yaw || 0) + diff * Math.min(1.0, turnRate * dtReal);

        // Vertical movement / Jump / Hancock Takeoff:
        if (isHero) {
          if (keys.has("Space")) {
            if (p.onGround) {
              p.onGround = false;
              p.flying = true;
              const boost = sprint ? 80 : 45;
              p.v[1] = boost;
              // Clean sonic takeoff: ground shock impulse and blackbody spark ring (no lingering smoke)
              state.shake = 0.6;
              if (sound.boom) sound.boom(20);
              for (let i = 0; i < 24; i++) {
                const ang = i * Math.PI / 12;
                const spd = 22 + Math.random() * 12;
                vfx.spawn(2, p.x, gy + 0.2, -p.n, Math.cos(ang) * spd, 3 + Math.random() * 5, Math.sin(ang) * spd, 0.35, 0.08, 0.6, 3200, -18);
                vfx.spawn(1, p.x, gy + 0.3, -p.n, Math.cos(ang) * spd * 0.6, 2 + Math.random() * 3, Math.sin(ang) * spd * 0.6, 1.2, 0.2, 0.35, 2800);
              }
            } else {
              p.flying = true;
              p.v[1] = Math.min(85, (p.v[1] || 0) + (sprint ? 58 : 32) * dtReal);
            }
          }
          if (dive) {
            if (p.flying || p.y > gy + 0.5) {
              p.flying = true;
              p.onGround = false;
              if ((p.v[1] || 0) > -12) p.v[1] = -22;
              p.v[1] = Math.max(-85, (p.v[1] || 0) - (sprint ? 65 : 36) * dtReal);
              if (Math.random() < 0.35) {
                vfx.spawn(1, p.x + (Math.random() - 0.5) * 1.5, p.y + 0.8, -p.n + (Math.random() - 0.5) * 1.5,
                          (Math.random() - 0.5) * 4, 10, (Math.random() - 0.5) * 4, 0.6, 1.2, 0.3, 0, 0);
              }
            }
          }
        } else {
          // Civilian jump
          if (keys.has("Space") && p.onGround) {
            p.v[1] = 4.2;
            p.onGround = false;
          }
        }

        if (p.flying && isHero) {
          const pitch = state.pitch || 0;
          const speed = sprint ? 80 : 32;
          const cPitch = Math.cos(pitch), sPitch = Math.sin(pitch);
          const camFwdX = sy * cPitch;
          const camFwdY = sPitch;
          const camFwdZ = -cy * cPitch;

          // 3D camera-directed flight: W flies in camera crosshair direction!
          // Looking down at the street dives down; looking up flies up!
          if (keys.has("KeyW")) {
            p.x += camFwdX * speed * dtReal;
            p.n += (-camFwdZ) * speed * dtReal;
            p.v[1] = camFwdY * speed;
            p.pitchAngle = 1.35; // Superhero forward flight pose (face down, head forward)
          } else if (keys.has("KeyS")) {
            p.x -= camFwdX * speed * 0.7 * dtReal;
            p.n -= (-camFwdZ) * speed * 0.7 * dtReal;
            p.v[1] = -camFwdY * speed * 0.7;
            p.pitchAngle = -0.35;
          } else {
            // hovering: a slight lean, legs held mid-stride, a slow bob
            // (it was the standing pose, a figure standing on nothing)
            p.pitchAngle = 0.14 + Math.sin((p.hoverBob || 0) * 0.5) * 0.04;
            p.hoverBob = (p.hoverBob || 0) + dtReal * 2.8;
            p.y += Math.sin(p.hoverBob) * 0.35 * dtReal; // Gentle floating bob
            if (Math.random() < 0.25) {
              vfx.spawn(2, p.x + (Math.random() - 0.5) * 0.8, p.y + 0.1, -p.n + (Math.random() - 0.5) * 0.8,
                        (Math.random() - 0.5) * 0.6, -1.8, (Math.random() - 0.5) * 0.6, 0.22, 0.04, 0.45, 2900);
            }
          }

          // Strafe left/right (A/D)
          if (mx !== 0 && !keys.has("KeyW") && !keys.has("KeyS")) {
            p.x += cy * mx * speed * 0.7 * dtReal;
            p.n -= sy * mx * speed * 0.7 * dtReal;      // (right of the view is -sin yaw north; it was mirrored)
          }

          // Direct vertical ascend / descend keys:
          if (keys.has("Space")) {
            p.v[1] = (p.v[1] || 0) + (sprint ? 60 : 36) * dtReal;
            if (p.v[1] < 12) p.v[1] = 18;
          }
          if (dive) {
            p.v[1] = (p.v[1] || 0) - (sprint ? 70 : 42) * dtReal;
            if (p.v[1] > -12) p.v[1] = -22;
          }

          // Apply vertical velocity
          if (!keys.has("Space") && !dive && !keys.has("KeyW") && !keys.has("KeyS")) {
            p.v[1] *= Math.max(0, 1 - dtReal * 3.0);
          }
          p.y += (p.v[1] || 0) * dtReal;

          if (sprint || Math.abs(p.v[1] || 0) > 20) {
            vfx.spawn(4, p.x, p.y + 0.8, -p.n, -fwdX * 8, -(p.v[1] || 0) * 0.3, -fwdZ * 8, 0.8, 1.5, 0.4, 0, 0);
          }

          // Smooth automatic ground landing:
          if (p.y <= gy + 0.55 && ((p.v[1] || 0) <= 0 || dive)) {
            const impact = p.v[1] || 0;
            p.y = gy;
            p.onGround = true;
            p.flying = false;
            p.v = [0, 0, 0];
            p.pitchAngle = 0.0;
            // only a boosted dive (⇧C) strikes a crater; every C landing used
            // to, at 29 m and 4.5 m deep from 30 m up (holding C pulls at
            // 78 m/s², so any plain dive lands at 70-85 m/s and speed alone
            // cannot tell them apart)
            if (sprint && impact < -40) {
              triggerHeroShockwave(p.x, gy, p.n, Math.min(1.6, -impact / 50));
            } else if (impact < -12) {
              state.shake = Math.max(state.shake || 0, 0.25);
              for (let i = 0; i < 16; i++) {
                const ang = i * Math.PI / 8;
                vfx.spawn(2, p.x, gy + 0.2, -p.n, Math.cos(ang) * 9, 1.5 + Math.random() * 2, Math.sin(ang) * 9, 0.25, 0.05, 0.5, 3000, -18);
              }
            }
          }
          // held mid-stride in the air (the walk's frames are all there is)
          p.phase = keys.has("KeyW") ? 0.12 : 0.3 + Math.sin(p.hoverBob || 0) * 0.04;
        } else {
          // Ground walking / jogging / sprinting
          const moveSpeed = isHero ? (sprint ? 14.0 : 4.8) : (sprint ? 8.0 : 4.2);
          if (len > 0) {
            p.x += fwdX * moveSpeed * dtReal;
            p.n += (-fwdZ) * moveSpeed * dtReal;
            const stride = sprint ? 1.85 : 1.35;
            p.walkDist = (p.walkDist || 0) + moveSpeed * dtReal;
            p.phase = (p.walkDist / stride) % 1.0;
          } else {
            p.phase = -1.0;
          }
          if (p.y > gy + 0.15) {
            p.v[1] -= 26 * dtReal;
            p.y += p.v[1] * dtReal;
            p.onGround = false;
            if (p.y <= gy) { p.y = gy; p.v[1] = 0; p.onGround = true; }
          } else {
            p.y = gy;
            p.v[1] = 0;
            p.onGround = true;
          }
        }

        // Riding on a train's roof: you go with the train, can walk along it,
        // and jump or walk off. (It used to snap you to the nearest 10 m track
        // point every frame within 2 m of roof height, so once caught — and a
        // hero started in the cab is caught by the first jump — no key could
        // get you off: "the hero stopped moving".)
        const roof = roofUnder(p.x, p.n);
        if (roof && (p.v[1] || 0) <= 0.5 && p.y >= roof.y - 0.8 && p.y <= roof.y + 1.2) {
          p.y = roof.y; p.onGround = true; p.flying = false; p.v = [0, 0, 0];
          p.ride = { t: roof.t, k: roof.k, lat: roof.lat };
        } else p.ride = null;
      }

      if (p.firstPerson) {
        camEye = [p.x, p.y + 1.72, -p.n];
        fwd = norm([Math.sin(state.yaw || 0), state.pitch || 0, -Math.cos(state.yaw || 0)]);
      } else {
        // further back in the air, and free to look well down at the city
        // (it was held to ±43° from 3.6 m: you could not look down)
        const back = (p.flying ? 9 : 4.2) / Math.max(0.4, state.zoom || 1);
        const pitch = Math.max(-1.3, Math.min(0.75, state.pitch || 0));
        const sy = Math.sin(state.yaw || 0), cy = Math.cos(state.yaw || 0);
        camEye = [p.x - sy * back * Math.cos(pitch), p.y + 1.65 - back * Math.sin(pitch), -p.n + cy * back * Math.cos(pitch)];
        const gCam = demAt(camEye[0], -camEye[2]);
        if (isFinite(gCam) && camEye[1] < gCam + 0.5) camEye[1] = gCam + 0.5;
        fwd = norm(sub([p.x, p.y + 1.25, -p.n], camEye));
      }
    }
    // (photo mode: everything stands still where it is and the free camera
    // takes over, even from the car, the plane or the drone)
    else if (state.car && state.car.active && !state.photo) {
      const car = state.car;
      if (!state.paused) {
        if (car.wreck > 0) { car.wreck -= dtReal; car.v *= Math.max(0, 1 - dtReal * 3); }
        else stepCar(car, keys, dtReal, (x, y) => carSurf(x, y, car.y));
        carWorld(car);
      }
      const fx = Math.sin(car.yaw), fz = -Math.cos(car.yaw);
      if (car.cockpit) {
        camEye = [car.x + fx * 0.2 - fz * 0.35, car.y + 1.25, -car.n + fz * 0.2 + fx * 0.35];
        const yawL = car.yaw + (state.yaw || 0) * 0.0;
        fwd = norm([Math.sin(yawL), (state.pitch || 0) - 0.05 + Math.sin(car.pitch), -Math.cos(yawL)]);
      } else {
        // chase camera, and the mouse orbits it round the car
        const back = 8.5 / Math.max(0.4, state.zoom || 1);
        const a = car.yaw + (state.yaw || 0), el = Math.max(-0.05, Math.min(1.35, 0.33 - (state.pitch || 0)));
        const ox = Math.sin(a), oz = -Math.cos(a);
        camEye = [car.x - ox * back * Math.cos(el), car.y + 1.2 + back * Math.sin(el), -car.n - oz * back * Math.cos(el)];
        const gy = demAt(camEye[0], -camEye[2]);
        if (isFinite(gy) && camEye[1] < gy + 1.2) camEye[1] = gy + 1.2;
        fwd = norm(sub([car.x + ox * 2, car.y + 1.0, -car.n + oz * 2], camEye));
      }
      if (car.shake > 0) {
        const k = car.shake * 0.35;
        camEye = [camEye[0] + (Math.random() - 0.5) * k, camEye[1] + (Math.random() - 0.5) * k, camEye[2] + (Math.random() - 0.5) * k];
      }
    }
    // ---- your own plane (aircraft.js): chase camera, or the cockpit on C
    else if (state.plane && state.plane.active && !state.photo) {
      const pl = state.plane;
      const nose = stepPlane(pl, keys, dtReal, demAt, (x, n) => solids.topAt(x, n));
      if (pl.crashes !== pl.crashSeen) {
        pl.crashSeen = pl.crashes;
        if (pl.crashes) { state.messages = state.messages || [];
          state.messages.push({ text: `${pl.crashWhy || "Lezuhantál"} — újra a levegőben`, t: 4, tone: "bad" });
          // the boom: a fireball and sparks where it hit, a wreck that burns
          // and smokes for half a minute, and for the 2.5 s before the
          // restart the camera stays on it (it used to cut straight to 400 m up)
          if (pl.crashAt) {
            const [cx, cy, cz] = pl.crashAt, h = pl.crashHeading || [0, -1];
            vfx.explode(cx, cy, cz, pl.type === "gripen" ? 3.2 : 2.2);   // (1.0 was "minuscule")
            vfx.burn(cx, cy, cz, 30);
            let e = [cx - h[0] * 70 + h[1] * 25, cy + 28, cz - h[1] * 70 - h[0] * 25];
            const g0 = demAt(e[0], -e[2]);
            if (isFinite(g0) && e[1] < g0 + 12) e[1] = g0 + 12;
            pl.crashCam = e;
            state.shake = 0.8;
            if (sound.boom) sound.boom(Math.hypot(e[0] - cx, e[1] - cy, e[2] - cz));
          }
        }
      }
      // afterburner: the Gripen's flame out of the nozzle, full throttle
      if (!state.paused && pl.type === "gripen" && pl.throttle > 0.92 && !(pl.crashed > 0)) {
        for (let i = 0; i < 6; i++) {
          const b = 6.6 + Math.random() * 0.6, jet = 25 + Math.random() * 20;
          vfx.spawn(1, pl.p[0] - nose[0] * b, pl.p[1] - nose[1] * b, pl.p[2] - nose[2] * b,
                    pl.vel[0] - nose[0] * jet, pl.vel[1] - nose[1] * jet, pl.vel[2] - nose[2] * jet,
                    1.3, 0.45, 0.08 + Math.random() * 0.07, 3900, 0);
        }
      }
      // vapour off the wingtips in a hard, fast pull (the nose swinging
      // round quickly at speed)
      {
        const sp = Math.hypot(pl.vel[0], pl.vel[1], pl.vel[2]);
        const prev = pl.noseWas || nose, turn = Math.acos(Math.max(-1, Math.min(1,
          prev[0] * nose[0] + prev[1] * nose[1] + prev[2] * nose[2]))) / Math.max(1e-3, dtReal);
        pl.noseWas = nose;
        if (!state.paused && sp > 60 && turn > 0.20 && !(pl.crashed > 0)) {
          // the wingtips where they are: banked with the aeroplane at the exact trailing edge
          const r0 = norm(cross(nose, [0, 1, 0])), u0 = norm(cross(r0, nose));
          const cr = Math.cos(pl.roll), sr = Math.sin(pl.roll);
          const rt = [r0[0] * cr - u0[0] * sr, r0[1] * cr - u0[1] * sr, r0[2] * cr - u0[2] * sr];
          const up = [r0[0] * sr + u0[0] * cr, r0[1] * sr + u0[1] * cr, r0[2] * sr + u0[2] * cr];
          const isGripen = pl.type === "gripen";
          const span = isGripen ? 4.3 : 5.4, k = Math.min(1, (turn - 0.2) * 2);
          const wingBack = isGripen ? 5.9 : 0.6;
          const wingUp = isGripen ? 0.0 : 0.72;
          for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) {
            const back = wingBack + i * 0.5;
            vfx.spawn(4, pl.p[0] + rt[0] * span * sg + up[0] * wingUp - nose[0] * back,
                      pl.p[1] + rt[1] * span * sg + up[1] * wingUp - nose[1] * back,
                      pl.p[2] + rt[2] * span * sg + up[2] * wingUp - nose[2] * back,
                      0, 0, 0, 0.45 + k * 0.4, 1.8 + 1.6 * k, 0.6 + 0.5 * k, 0, 0);
          }
        }
      }
      if (pl.crashed > 0 && pl.crashCam && pl.crashAt) {
        camEye = pl.crashCam.slice();
        fwd = norm(sub([pl.crashAt[0], pl.crashAt[1] + 6, pl.crashAt[2]], camEye));
      } else if (pl.cockpit) {
        camEye = [pl.p[0] + nose[0] * 1.6, pl.p[1] + 0.55, pl.p[2] + nose[2] * 1.6];
        fwd = norm([nose[0], nose[1] + (state.pitch || 0), nose[2]]);
        camRoll = pl.roll;     // in the cockpit the world banks with the aeroplane
        {
          // the aeroplane's own axes, banked, for the cockpit mesh
          const bf = norm(nose), br0 = norm(cross(bf, [0, 1, 0])), bu0 = norm(cross(br0, bf));
          const cr = Math.cos(pl.roll), sr = Math.sin(pl.roll);
          const bu = [bu0[0] * cr + br0[0] * sr, bu0[1] * cr + br0[1] * sr, bu0[2] * cr + br0[2] * sr];
          pl.cockBasis = { f: bf, r: norm(cross(bf, bu)), u: bu, eye: camEye.slice() };
        }
      } else {
        // chase camera, orbited by the mouse; back to straight behind when
        // the drag is let go of for long enough (the plane is steered by keys)
        const back = 20 / Math.max(0.4, state.zoom || 1);
        const a = Math.atan2(nose[0], -nose[2]) + (state.yaw || 0);
        const el = Math.max(-0.4, Math.min(1.35, 0.27 - (state.pitch || 0)));
        const ox = Math.sin(a), oz = -Math.cos(a);
        camEye = [pl.p[0] - ox * back * Math.cos(el), pl.p[1] + back * Math.sin(el), pl.p[2] - oz * back * Math.cos(el)];
        fwd = (state.yaw || state.pitch) ? norm(sub(pl.p, camEye)) : norm(sub(add(pl.p, scale(nose, 25)), camEye));
        // the chase camera leans a third of the bank: enough to feel the
        // turn, not so much that the horizon swings with every correction
        if (!state.yaw && !state.pitch) camRoll = pl.roll * 0.33;
      }
    }
    // ---- FPV Drone Flight Simulator Mode
    else if (state.drone && state.drone.active && !state.photo) {
      const dr = state.drone;
      const k = (a) => keys.has(a);
      const isBoost = k("ShiftLeft") || k("ShiftRight");
      const boostMul = isBoost ? 2.4 : 1.0;
      let pitchCmd = 0, rollCmd = 0, yawCmd = 0, thrustCmd = 0;
      if (k("KeyW") || k("ArrowUp")) pitchCmd += 1.8;
      if (k("KeyS") || k("ArrowDown")) pitchCmd -= 1.8;
      if (k("KeyA") || k("ArrowLeft")) rollCmd -= 2.0;
      if (k("KeyD") || k("ArrowRight")) rollCmd += 2.0;
      if (k("KeyQ")) yawCmd -= 1.8;
      if (k("KeyE")) yawCmd += 1.8;
      if (k("Space")) thrustCmd += 36.0 * boostMul;
      if (k("ControlLeft") || k("ControlRight") || k("KeyC")) thrustCmd -= 24.0;

      dr.pitch += (pitchCmd - dr.pitch * 2.8) * dtReal * 4.5;
      dr.roll += (rollCmd - dr.roll * 3.2) * dtReal * 5.0;
      dr.yaw += (yawCmd + dr.roll * 0.8) * dtReal * 2.2;

      const cyD = Math.cos(dr.yaw), syD = Math.sin(dr.yaw);
      const cpD = Math.cos(dr.pitch), spD = Math.sin(dr.pitch);
      const crD = Math.cos(dr.roll), srD = Math.sin(dr.roll);

      const fwdSpeed = (pitchCmd > 0 ? 52.0 : (pitchCmd < 0 ? -28.0 : 0.0)) * boostMul;
      const strafeSpeed = (rollCmd !== 0 ? rollCmd * 16.0 : 0.0) * boostMul;
      const targetVx = (syD * cpD) * fwdSpeed + cyD * strafeSpeed;
      const targetVz = (-cyD * cpD) * fwdSpeed + syD * strafeSpeed;
      const targetVy = thrustCmd;

      dr.v[0] += (targetVx - dr.v[0] * 1.2) * dtReal * 3.5;
      dr.v[1] += (targetVy - dr.v[1] * 1.2) * dtReal * 3.5;
      dr.v[2] += (targetVz - dr.v[2] * 1.2) * dtReal * 3.5;

      dr.p[0] += dr.v[0] * dtReal;
      dr.p[1] += dr.v[1] * dtReal;
      dr.p[2] += dr.v[2] * dtReal;

      // walls stop it (and hold it off by its own size); roofs are ground
      {
        const r = solids.push(dr.p[0], -dr.p[2], dr.p[1] - 0.3, 0.6, 0.6);
        if (r.hit) {
          const vn = dr.v[0] * r.nx - dr.v[2] * r.nn;            // velocity into the wall (z is south)
          if (vn < 0) { dr.v[0] -= vn * r.nx * 1.3; dr.v[2] += vn * r.nn * 1.3; }
          dr.p[0] = r.x; dr.p[2] = -r.n;
        }
      }
      const gH = Math.max(demAt(dr.p[0], -dr.p[2]), solids.topAt(dr.p[0], -dr.p[2]));
      if (isFinite(gH) && dr.p[1] < gH + 1.6) {
        dr.p[1] = gH + 1.6;
        if (dr.v[1] < 0) dr.v[1] = 0;
      }

      camEye = [dr.p[0], dr.p[1], dr.p[2]];
      fwd = norm([syD * cpD, -spD, -cyD * cpD]);
    }
    // ---- Riding a tram (⇧T, or "Villamos"): the nearest one is boarded. It
    // keeps its timetable (trams.js runs them off the clock), so this is a
    // ride, not driving: from the driver's place looking ahead, or from
    // outside (C). The mouse looks round; at the terminus you are on the
    // next one out.
    else if (state.tram && trams) {
      const T = state.tram, r = trams.routes[T.ri], tNow = state.hour * 3600;
      let age = tNow - T.dep;
      if (age < 0) age += 86400;
      if (!r || (!T.manual && age > r.run + 1)) {
        const nx = r ? trams.nearest(tNow, r.P[0][0], r.P[0][1], T.ri) : null;
        if (nx) { T.dep = nx.dep; age = tNow - T.dep; } else { state.tram = null; }
      }
      if (state.tram) {
        let front;
        if (T.manual) {
          if (T.s == null) T.s = trams.sAt(r, Math.max(0, age));
          if (T.v == null) T.v = 0;
          if (!state.paused) {
            if (T.doors) {
              T.throttle = 0;
              T.v = 0;
              T.boarding = (T.boarding || 12) + (Math.random() < 0.2 ? 1 : 0);
            } else {
              const thr = T.throttle || 0;
              const brk = T.brake || 0;
              // Acceleration up to 50 km/h (13.8 m/s)
              const targetAcc = thr * 1.25 - brk * 1.65 - (T.v > 0.1 ? 0.08 : 0);
              T.v = Math.max(0, Math.min(13.8, T.v + targetAcc * dtReal));
              T.s += T.v * dtReal;
              if (T.s >= r.len) {
                T.s = 0;
                T.v = 0;
                T.throttle = 0;
                T.brake = 1.0;
              }
            }
          }
          front = T.s;
        } else {
          if (!state.paused) {
            front = trams.sAt(r, Math.max(0, age));
            const prevFront = T.s != null ? T.s : front;
            T.v = Math.max(0, (front - prevFront) / Math.max(0.001, dtReal));
            if (T.v > 15) T.v = 9.0;
            T.s = front;
            const stops = r.stopList || [];
            let dwelling = false;
            for (const st of stops) {
              if (Math.abs(front - st.s) < 2.0 && T.v < 0.2) {
                dwelling = true; break;
              }
            }
            T.doors = dwelling;
          } else {
            front = T.s != null ? T.s : trams.sAt(r, Math.max(0, age));
            T.v = 0;
          }
        }

        const q = trams.at(r, Math.max(0.5, front - (T.out ? 22 : 0.6)));   // (outside: look at its middle)
        const at = norm([q.fx, 0, -q.fn]);
        const yaw0 = Math.atan2(at[0], -at[2]) + (state.yaw || 0);
        const pitch = Math.max(-1.3, Math.min(1.3, state.pitch || 0));
        if (T.out) {
          const tgt = [q.x, q.y + 1.8, -q.n];
          for (let dist = 38 / dolly; dist > 7; dist *= 0.8) {
            camEye = add(tgt, [-Math.sin(yaw0) * Math.cos(pitch) * dist, 9 / dolly + Math.sin(pitch) * dist, Math.cos(yaw0) * Math.cos(pitch) * dist]);
            camEye[1] = Math.max(camEye[1], demAt(camEye[0], -camEye[2]) + 1.5);
            if (!solids.at(camEye[0], camEye[1], -camEye[2])) break;
          }
          fwd = norm(sub(tgt, camEye));
        } else {
          camEye = [q.x + q.fx * 0.9, q.y + 2.25, -(q.n + q.fn * 0.9)];
          fwd = norm([Math.sin(yaw0) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw0) * Math.cos(pitch)]);
        }

        // next stop determination
        const stops = r.stopList || [];
        let next = null;
        for (const st of stops) {
          if (st.s >= front - 15) {
            next = { name: st.name, dist: Math.max(0, st.s - front) };
            break;
          }
        }
        T.nextStop = next || (stops.length ? { name: stops[stops.length - 1].name, dist: 0 } : null);
      }
    }
    // ---- Follow Road Vehicle / Bus Mode
    else if (state.followCarIdx >= 0) {
      const cars = roadTraffic ? roadTraffic.vehicles : [];
      const car = cars[state.followCarIdx % Math.max(1, cars.length)];
      if (car) {
        const q = roadTraffic.place(car);
        const gY = demRidge(demAt, q.x, q.z) + 0.35;
        const carEye = [q.x, gY + 1.2, -q.z];
        const carFwd = [q.fx * car.dir, 0, -q.fz * car.dir];
        const carAt = norm(carFwd);
        const baseDist = 12.0 / dolly, baseH = 4.2 / dolly;
        const totalYaw = Math.atan2(carAt[0], -carAt[2]) + (state.yaw || 0);
        const pitch = Math.max(-1.4, Math.min(1.4, state.pitch || 0));
        const camOff = [
          -Math.sin(totalYaw) * Math.cos(pitch) * baseDist,
          baseH + Math.sin(pitch) * baseDist,
          Math.cos(totalYaw) * Math.cos(pitch) * baseDist
        ];
        camEye = add(carEye, camOff);
        fwd = norm(sub(carEye, camEye));
      } else state.followCarIdx = -1;
    }
    // ---- Follow Danube Ship / Ferry Mode
    else if (state.followShipIdx >= 0) {
      const ships = riverTraffic ? [...(riverTraffic.ferries || []), ...(riverTraffic.ships || [])] : [];
      const sh = ships[state.followShipIdx % Math.max(1, ships.length)];
      if (sh) {
        let pos;
        if (sh.name) {
          // Nagymaros–Visegrád Ferry
          const fx = sh.x + sh.nx * sh.u * sh.halfW;
          const fz = sh.z + sh.nz * sh.u * sh.halfW;
          pos = { x: fx, z: fz, fx: sh.nx * sh.dir, fz: sh.nz * sh.dir };
        } else {
          // River cargo barge / cruise ship
          pos = riverTraffic.place(sh);
        }
        const wY = waterAt ? waterAt(pos.z) : ((state.danube || 0) + 104.5);
        const shEye = [pos.x, wY + 2.8, -pos.z];
        const shAt = norm([pos.fx, 0, -pos.fz]);
        const baseDist = 48.0 / dolly, baseH = 18.0 / dolly;
        const totalYaw = Math.atan2(shAt[0], -shAt[2]) + (state.yaw || 0);
        const pitch = Math.max(-1.4, Math.min(1.4, state.pitch || 0));
        const camOff = [
          -Math.sin(totalYaw) * Math.cos(pitch) * baseDist,
          baseH + Math.sin(pitch) * baseDist,
          Math.cos(totalYaw) * Math.cos(pitch) * baseDist
        ];
        camEye = add(shEye, camOff);
        fwd = norm(sub(shEye, camEye));
      } else state.followShipIdx = -1;
    }
    // ---- the free camera
    else if (state.fly) {
      const f = state.fly;
      const k = (a) => keys.has(a);
      const boost = k("ShiftLeft") || k("ShiftRight") ? 6.0 : 1.0;
      const sp = f.speed * boost * dtReal;
      const right = [Math.cos(Math.atan2(fwd[0], fwd[2])), 0,
                     -Math.sin(Math.atan2(fwd[0], fwd[2]))];
      const rt = norm([fwd[2], 0, -fwd[0]]);
      if (k("KeyW") || k("ArrowUp"))   { f.p = add(f.p, scale(fwd, sp)); }
      if (k("KeyS") || k("ArrowDown")) { f.p = add(f.p, scale(fwd, -sp)); }
      if (k("KeyA")) f.p = add(f.p, scale(rt, -sp));
      if (k("KeyD")) f.p = add(f.p, scale(rt, sp));
      if (k("KeyR")) f.p = add(f.p, [0, sp, 0]);
      if (k("KeyF")) f.p = add(f.p, [0, -sp, 0]);
      const g = demAt(f.p[0], -f.p[2]);
      if (isFinite(g) && f.p[1] < g + 1.6) f.p[1] = g + 1.6;
      camEye = [f.p[0], f.p[1], f.p[2]];
    }
    else if (state.follow) {
      const shown = state.followIdx >= 0
        ? traffic.trains.filter(t => t.svc.id !== "player")[state.followIdx] : null;
      const len = (shown ? shown.length : driver.s.lengthM) || 160;
      const back = Math.max(95, len * 0.80 + 55) / dolly;
      camEye = add(eye, add(scale(fwd, -back), [0, (26 + len * 0.05) / dolly, 0]));
      // never under the ground: behind a train on an embankment or along a
      // hillside the camera sank toward the terrain and the rail looked too
      // high (owner, 25 Sep: "move it up a notch")
      const g = demAt(camEye[0], -camEye[2]);
      if (isFinite(g) && camEye[1] < g + 8) camEye[1] = g + 8;
    }
    state.camXZ = [camEye[0], -camEye[2]];
    if (city) city.update(camEye[0], -camEye[2]);
    state.camY = camEye[1];

    // Authentic Budapest street / square name plaque determination
    if (!state._lastStreetCheck || performance.now() - state._lastStreetCheck > 300) {
      state._lastStreetCheck = performance.now();
      const cx = camEye[0], cz = -camEye[2];
      let bestPlace = null;
      if (state.tram && state.tram.nextStop && state.tram.nextStop.dist < 80) {
        bestPlace = state.tram.nextStop.name;
      } else if (streetsIndex) {
        bestPlace = streetsIndex.lookup(cx, cz, 85);
      }
      if (!bestPlace) {
        let bestDist = 180;
        const places = routeData.places || [];
        for (let i = 0; i < places.length; i++) {
          const p = places[i];
          if (!p.xy || !isAuthenticStreetOrSquare(p.name)) continue;
          const d = Math.hypot(p.xy[0] - cx, p.xy[1] - cz);
          const weight = (p.kind === "square" || p.kind === "station" || p.kind === "suburb") ? 0.75 : 1.0;
          if (d * weight < bestDist) {
            bestDist = d * weight;
            bestPlace = p.name;
          }
        }
      }
      state.currentStreet = bestPlace;
    }
    if (state.shake > 0) {
      const k = state.shake * 0.9;
      camEye = [camEye[0] + (Math.random() - 0.5) * k, camEye[1] + (Math.random() - 0.5) * k, camEye[2] + (Math.random() - 0.5) * k];
      state.shake = Math.max(0, state.shake - dtReal * 0.6);
    }
    const at = add(camEye, fwd);
    let camUp = [0, 1, 0];
    if (camRoll) {
      const rt = norm(cross(fwd, [0, 1, 0])), up0 = norm(cross(rt, fwd));
      const cr = Math.cos(camRoll), sr = Math.sin(camRoll);
      camUp = [up0[0] * cr + rt[0] * sr, up0[1] * cr + rt[1] * sr, up0[2] * cr + rt[2] * sr];
    }
    const view = M4.lookAt(camEye, at, camUp);
    // inside a carriage the walls are half a metre away, inside the usual
    // 1.2 m near plane
    const nearZ = seated ? 0.12 : 1.2;
    const proj = M4.perspective(state.fov / lensZoom * Math.PI / 180,
                                RES.w / RES.h, nearZ, 62000);
    const vp = M4.mul(proj, view);
    const invVP = M4.invert(vp);
    state.lastCam = { eye: camEye, invVP };

    const insideTrain = !state.follow && state.followIdx < 0 && state.followCarIdx < 0 && state.followShipIdx < 0 && !(state.drone && state.drone.active) && !state.fly && !flying && !state.tram && !(state.person && state.person.active);
    const inCab = state.cab && insideTrain && !seated;

    const sp = sunPosition(state.day, state.hour);
    const sunDir = sunVector(Math.max(sp.alt, -0.4), sp.az);

    // ---- weather
    // The sky runs on its own clock so that time compression boils the cloud
    // field as well as moving the trains: at x16 a front crosses in minutes.
    if (!state.paused) state.wxT += dtReal * Math.min(state.speedMul, 8);
    // A front, if one is running: it walks along the line and the weather you
    // get is the blend at your own chainage. Everything downstream reads the
    // one resolved object, so the sky, the ground, the audio and the drag on
    // the train all follow without knowing a front exists.
    if (state.front && !state.paused) {
      state.front = stepFront(state.front, dtReal * state.speedMul, driver.m, state.day);
    }
    const wx = state.front
      ? weatherAt(state.front, state.wxId, state.wxInt, state.day,
                  state.cloudType || null, driver.m)
      : resolveWeather(state.wxId, state.wxInt, state.day, state.cloudType || null);
    const decks = weatherDecks(wx);
    // wipers on their own until the driver touches the switch
    if (state.wiperAuto)
      state.wiper = wx.precip.rate > 0.35 ? 2 : wx.precip.rate > 0.03 ? 1 : 0;
    state.wx = wx;

    // lightning: a strike is several return strokes a few hundredths apart,
    // which is why it flickers rather than flashing once
    if (!state.paused) {
      state.flashPulses = state.flashPulses.filter(f => (f.t -= dtReal) > -0.12);
      if (wx.storm > 0 && Math.random() < dtReal * wx.storm * 0.75) {
        const km = 0.4 + Math.random() * Math.random() * 14;
        const n = 1 + (Math.random() * 3 | 0);
        for (let i = 0; i < n; i++)
          state.flashPulses.push({ t: -i * (0.04 + Math.random() * 0.09),
                                   a: 0.55 + Math.random() * 0.45 });
        state.strike = { km, at: 0 };
        if (state.sound && soundArmed && state.speedMul <= 2) {
          const id = setTimeout(() => sound.thunder(km), km / 0.343 * 1000);
          sound.timers.add(id);
        }
      }
      state.flash = state.flashPulses.reduce(
        (m, f) => Math.max(m, f.t <= 0 ? f.a * Math.exp(f.t * 18) : 0), 0);
      // The falling particles are placed by hashing a world grid, and the
      // grid is walked at the particle velocity. Left to run, the coordinate
      // outgrows float precision and the pattern coarsens, so the clock is
      // restarted whenever nothing is falling — and, failing that, after a
      // quarter of an hour of continuous rain, when it reshuffles once.
      state.precipT += dtReal * Math.min(state.speedMul, 4);
      // The drop field is advanced by an offset that is wrapped into the box
      // each frame, so the coordinate never grows and nothing ever reshuffles.
      {
        const tv0 = route.tangent(driver.m);
        const v0 = precipVelocity(wx, [tv0[0] * route.dir * driver.v, 0,
                                       -tv0[1] * route.dir * driver.v]);
        const box = PRECIP_BOX * 2, dts = dtReal * Math.min(state.speedMul, 4);
        for (let i = 0; i < 3; i++)
          state.precipOff[i] = ((state.precipOff[i] + v0[i] * dts) % box + box) % box;
      }
    }
    const flash = state.flash;

    const pal0 = skyPalette(sp.alt);
    const pal = weatherPalette(pal0, wx, state.fog);
    if (flash > 0.002) {
      // the strike lights the whole landscape, not just the cloud it is in
      pal.sun = pal.sun.map((v, i) => v + flash * [1.5, 1.55, 1.75][i]);
      pal.zenith = pal.zenith.map((v, i) => v + flash * [0.20, 0.22, 0.30][i]);
      pal.horizon = pal.horizon.map((v, i) => v + flash * [0.16, 0.18, 0.26][i]);
    }
    const sn = seasonOf(state.day);
    const season4 = [sn.leaf, sn.autumn, sn.fresh, sn.crop];
    const snowCover = wx.snow, wetGround = wx.wet;
    // how much of the lighting has moved from the beam into the dome
    const lift = Math.min(1.2, wx.gloom * 0.95 + wx.snow * 0.45);
    // wet rail, and worse with snow or ice on it
    driver.adhesion = 1 - wx.wet * 0.22 - wx.snow * 0.30
                        - (wx.precip.kind === 6 ? 0.22 : 0);
    // the driven train's headlight, on after dark or in anything murky
    const lampPower = state.lights === 0 ? 0
      : Math.max(0, Math.min(1, (0.14 - sp.alt) / 0.22))
        * 0.75 + Math.min(0.55, wx.gloom * 0.6);
    const lampPt = route.at(driver.m);
    const lampTan = route.tangent(driver.m);
    const lamp = [lampPt[0], lampPt[2] + 2.6, -lampPt[1],
                  Math.min(1, lampPower * (state.lights === 2 ? 1.35 : 1))];
    const lampDir = norm([lampTan[0] * route.dir, -0.055, -lampTan[1] * route.dir]);
    // Cloud shadow only means anything while there is a beam to interrupt.
    // Under a closed base everything is already in shadow and adding more
    // would just be a second, wrong darkening.
    // A cloud shadow removes the beam, not the daylight. At 0.92 it was
    // punching holes in a sunny day; the sky still lights what is under it.
    const cloudShadow = 0.70 * Math.max(0, 1 - wx.gloom * 1.35);
    // the wind the train is actually driving into, along the rails
    {
      const tw = route.tangent(driver.m);
      const fx = tw[0] * route.dir, fz = -tw[1] * route.dir;
      const wv = windVector(wx.wind.from);
      driver.headwind = -(wv[0] * wx.wind.speed * fx + wv[1] * wx.wind.speed * fz);
    }
    const hazeMul = state.fog;
    const right = norm(cross(fwd, [0, 1, 0]));

    // build the moving geometry once per frame, then draw it in both passes
    {
      const occ0 = traffic.occupied(1), occU0 = traffic.occupied(-1);
      // the lamps show what the trains obey: traffic.signalAspectAt
      const aspectOf0 = (m, dir) => traffic.signalAspectAt(m, dir, dir > 0 ? occ0 : occU0);
      upload(sigDyn, buildSignals(
        traffic.sig.filter(m => Math.abs(m - driver.m) < 3200),
        routeData.track_down, routeData.track_up, aspectOf0));
      // lights come on as the sun goes down, which is also when the bloom
      // has something to do
      const night = Math.max(0, Math.min(1, (0.10 - sp.alt) / 0.20));
      state.night = night;
      if (!state.paused) air.step(dtReal * Math.min(state.speedMul, 4), camEye);
      upload(airDyn, buildAircraft(air, state.plane, state.car && state.car.active && !carModels ? state.car : null));
      if (dobogo && Math.hypot(dobogo.xy[0] - camEye[0], dobogo.xy[1] + camEye[2]) < 9000)
        upload(heartDyn, buildHeart(dobogo.xy[0], dobogo.ele + 34, -dobogo.xy[1], performance.now() * 0.001));
      else heartDyn.count = 0;
      if (trams && city) upload(tramDyn, trams.build(state.hour * 3600, camEye[0], -camEye[2], state.lite ? 1400 : 3000, night));
      else tramDyn.count = 0;
      // (the lamps change every few seconds: rebuilt every 6th frame; on a
      // phone the walkers every 2nd, and fewer of them, nearer)
      const fN = state.frameN || 0;
      if (!(roadTraffic && roadTraffic.lights && state.show.roads)) tlDyn.count = 0;
      else if (fN % 6 === 0) upload(tlDyn, buildTrafficLights(roadTraffic, camEye[0], -camEye[2], roadSurface, state.lite ? 260 : 420));
      pplWalk.length = 0;
      if (!(roadTraffic && state.show.roads)) walkDyn.count = 0;
      else if (!state.lite || fN % 2 === 0) upload(walkDyn, buildWalkers(roadTraffic, camEye[0], -camEye[2], state.hour, roadSurface,
                                                     !!(state.wx && state.wx.precip.kind && state.wx.precip.rate > 0.1), state.lite,
                                                     people3d ? pplWalk : null));
      if (kisvasut && Math.hypot(kisvasut.pts[0][0] - camEye[0], kisvasut.pts[0][1] + camEye[2]) < 16000)
        upload(kisDyn, kisvasut.train(state.hour * 3600));
      else kisDyn.count = 0;
      if (state.person && state.person.active && !state.person.firstPerson) {
        if (!people3d || !people3d.people || !people3d.people.length) {
          upload(heroDyn, buildHeroMesh(state.person));
        } else {
          heroDyn.count = 0;
        }
      } else heroDyn.count = 0;
      upload(trainDyn, buildTrains(aiWrecks.length ? { trains: traffic.trains.concat(aiWrecks.map(a => a.t)) } : traffic, routeData.track_down,
                                   routeData.track_up,
                                   insideTrain ? playerTrain : null,
                                   night, seated, trainSide));
      // The higher the camera, the further the cars have to go on. At rail
      // level 560 m is past the point of seeing them; from the free camera at
      // two hundred metres they were stopping in a visible circle.
      const groundY = demAt(camEye[0], -camEye[2]);
      const upBy = isFinite(groundY) ? Math.max(0, camEye[1] - groundY) : 0;
      const reach = Math.min(2600, 560 + upBy * 9);
      state.carReach = reach;
      {
        const snowy = !!(state.wx && state.wx.precip.kind === 2) || (state.wx && state.wx.snow > 0.3);
        const rtm = state.show.roads
          ? buildRoadTraffic(roadTraffic, camEye[0], -camEye[2], demAt, state.night || 0, reach, roadSurface,
                             carModels ? carModels.models : null, snowy)
          : { verts: new Float32Array(0), cols: new Float32Array(0), count: 0 };
        upload(carDyn, rtm);
        // your own car is one of the pack's models too (the red hatchback),
        // not the box it used to be (owner, Oct 2026)
        if (carModels && state.car && state.car.active && !state.car.cockpit) {
          const mi = carModels.models.findIndex(m => m.name === "Car 03");
          if (mi >= 0) {
            const inst = rtm.inst || (rtm.inst = carModels.models.map(() => []));
            const c = state.car, m = carModels.models[mi];
            inst[mi].push(c.x, c.y + 0.05, -c.n, c.yaw, 4.1, m.skins[1] ?? m.skins[0], 0, 0);
          }
        }
        uploadModelInstances(rtm.inst);
      }
      // people on the platforms; rebuilt rarely, since only the hour matters
      if (!state.pplHour || Math.abs(state.pplHour - state.hour) > 0.25) {
        state.pplHour = state.hour;
        pplStand.length = 0;
        upload(peopleDyn, buildPlatformPeople(routeData.stops, routeData.track_down,
               routeData.track_up, demAt, state.hour, MAJOR,
               !!(state.wx && state.wx.precip.kind && state.wx.precip.rate > 0.1), osmFor, null, people3d ? pplStand : null));
      }
      uploadPeople(camEye[0], -camEye[2]);
      // and the street & platform lamps: rebuilt when darkness changes or camera moves
      const nightNow = state.night || 0;
      const camX = camEye[0], camZ = -camEye[2];
      if (state.lampNight === undefined || Math.abs(state.lampNight - nightNow) > 0.04
          || !state.lampCam || Math.hypot(camX - state.lampCam[0], camZ - state.lampCam[1]) > 100) {
        state.lampNight = nightNow;
        state.lampCam = [camX, camZ];
        const nearLamps = gatherLampsNear(camX, camZ, 3200);
        upload(lampDyn, buildPlatformLamps(nearLamps, nightNow));
      }
      // the 48 lamps nearest the camera light the ground (STREETLIGHT_GLSL)
      if (!state.slCam || Math.hypot(camX - state.slCam[0], camZ - state.slCam[1]) > 12) {
        state.slCam = [camX, camZ];
        const near = gatherLampsNear(camX, camZ, 450)
          .map(l => [l, (l[0] - camX) ** 2 + (l[2] - camZ) ** 2])
          // (each lamp is a loop step in every lit fragment at night: fewer on
          // the lower quality settings, which is what phones start on)
          .sort((a, b) => a[1] - b[1]).slice(0, (state.cityR || 3200) <= 1900 ? 12 : (state.cityR || 3200) <= 3200 ? 24 : 48);
        slArr.fill(0);
        near.forEach(([l], i) => { slArr[i*3] = l[0]; slArr[i*3+1] = l[1]; slArr[i*3+2] = -l[2]; });
        slN = near.length;
      }
      upload(shipDyn, buildRiverTraffic(riverTraffic, camEye[0], -camEye[2],
                                        waterAt(-camEye[2]), state.night || 0));
      upload(xingDyn, buildCrossings(
        routeData.crossings.filter(x => Math.abs(x.m - driver.m) < 2600),
        routeData.track_down, demAt, traffic.trains));
    }

    function drawWorld(vp, camEye, opts) {
      const refl = opts.reflect ? 1.0 : 0.0;
    gl.clearColor(pal.horizon[0], pal.horizon[1], pal.horizon[2], 1);
      gl.clearDepth(1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);

      // sky
      if (state.show.sky) {
      gl.useProgram(pSky.p);
      gl.bindVertexArray(quadVao);
      gl.uniformMatrix4fv(pSky.u.uInvVP, false, opts.invVP);
      gl.uniform3fv(pSky.u.uSunDir, sunDir);
      gl.uniform3fv(pSky.u.uZenith, pal.zenith);
      gl.uniform3fv(pSky.u.uHorizon, pal.horizon);
      gl.uniform3fv(pSky.u.uGround, pal.ground);
      gl.uniform3fv(pSky.u.uSunCol, pal.sun);
      gl.uniform1f(pSky.u.uDither, 1.0 / 220.0);
      gl.uniform1f(pSky.u.uTime, state.wxT);
      gl.uniform4fv(pSky.u.uDeckA, decks.a);
      gl.uniform4fv(pSky.u.uShapeA, decks.aShape);
      gl.uniform4fv(pSky.u.uMoodA, decks.aMood);
      gl.uniform4fv(pSky.u.uDeckB, decks.b);
      gl.uniform4fv(pSky.u.uShapeB, decks.bShape);
      gl.uniform4fv(pSky.u.uMoodB, decks.bMood);
      gl.uniform4fv(pSky.u.uWind, decks.wind);
      gl.uniform4fv(pSky.u.uAnvil, decks.anvil);
      gl.uniform1f(pSky.u.uFlash, flash);

      // 3D Moon position, phase & lunar illumination
      const moonPhase = ((state.day % 29.53) / 29.53);
      const moonAlt = -sp.alt + 0.18;
      const moonAz = sp.az + Math.PI;
      const moonDir = norm([Math.sin(moonAz)*Math.cos(moonAlt), Math.sin(moonAlt), -Math.cos(moonAz)*Math.cos(moonAlt)]);
      const moonCol = [0.78, 0.88, 1.05];
      gl.uniform3fv(pSky.u.uMoonDir, moonDir);
      gl.uniform3fv(pSky.u.uMoonCol, moonCol);
      gl.uniform1f(pSky.u.uMoonPhase, moonPhase);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);

      // terrain rings
      if (state.show.terrain) {
      gl.useProgram(pTer.p);
      gl.uniformMatrix4fv(pTer.u.uVP, false, vp);
      gl.uniform1f(pTer.u.uClipBelow, refl);
      gl.uniform2f(pTer.u.uWaterAB, WA + (state.danube || 0), WB);
      gl.uniform2f(pTer.u.uViewport, opts.reflect ? REFL.w : RES.w,
                                     opts.reflect ? REFL.h : RES.h);
      gl.uniform1i(pTer.u.uReflect, 4);
      if (pTer.u.uDanube) gl.uniform1f(pTer.u.uDanube, state.danube || 0);
      gl.uniform3fv(pTer.u.uEye, camEye);
      gl.uniform3fv(pTer.u.uSunDir, sunDir);
      gl.uniform3fv(pTer.u.uSunCol, pal.sun);
      gl.uniform3fv(pTer.u.uSkyCol, pal.zenith);
      gl.uniform3fv(pTer.u.uFogCol, pal.horizon);
      gl.uniform1f(pTer.u.uFogDensity, pal.fog);
      gl.uniform1f(pTer.u.uDither, 1.0 / 200.0);
      gl.uniform4fv(pTer.u.uSeason, season4);
      gl.uniform1f(pTer.u.uSnow, snowCover);
      gl.uniform1f(pTer.u.uWet, wetGround);
      gl.uniform1f(pTer.u.uLift, lift);
      gl.uniform4fv(pTer.u.uCloudDeck, decks.a);
      gl.uniform4fv(pTer.u.uCloudShape, decks.aShape);
      gl.uniform4fv(pTer.u.uCloudWind, decks.wind);
      gl.uniform1f(pTer.u.uCloudT, state.wxT);
      gl.uniform1f(pTer.u.uCloudShadow, cloudShadow);
      gl.uniform4fv(pTer.u.uLamp, lamp);
      gl.uniform3fv(pTer.u.uLampDir, lampDir);
      setStreetLights(pTer);
      gl.uniform1f(pTer.u.uCorridorCut, 86.0);
      gl.uniform1f(pTer.u.uTime, now * 0.001);
      gl.uniform3fv(pTer.u.uEye, camEye);
      gl.uniform2f(pTer.u.uWaterAB, WA + (state.danube || 0), WB);
      gl.uniform2f(pTer.u.uNearSize, texNear.w, texNear.h);
      gl.uniform2f(pTer.u.uFarSize, texFar.w, texFar.h);
      gl.uniform2f(pTer.u.uNearStep, nearStep, nearStep);
      gl.uniform2f(pTer.u.uFarStep, farStep, farStep);
      gl.uniform2f(pTer.u.uFarOffset, farOffset[0], farOffset[1]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texNear.tex);
      gl.uniform1i(pTer.u.uHeightNear, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texFar.tex);
      gl.uniform1i(pTer.u.uHeightFar, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texCover.tex);
      gl.uniform1i(pTer.u.uCover, 2);
      gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, lakeLevels.tex);
      gl.uniform1i(pTer.u.uLake, 13);
      gl.activeTexture(gl.TEXTURE0);
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const cell = (r.half * 2) / r.n;
        const ox = Math.round(camEye[0] / cell) * cell;
        const oz = Math.round(camEye[2] / cell) * cell;
        gl.uniform2f(pTer.u.uOrigin, ox, oz);
        gl.uniform1f(pTer.u.uHalf, r.half);
        gl.uniform1f(pTer.u.uCell, cell);
        gl.bindVertexArray(r.mesh.vao);
        gl.drawElements(gl.TRIANGLES, r.mesh.count, r.mesh.type, 0);
      }
      }

      // track
      if (state.show.track) {
      gl.useProgram(pTrk.p);
      gl.uniformMatrix4fv(pTrk.u.uVP, false, vp);
      gl.uniform3fv(pTrk.u.uEye, camEye);
      gl.uniform3fv(pTrk.u.uSunDir, sunDir);
      gl.uniform3fv(pTrk.u.uSunCol, pal.sun);
      gl.uniform3fv(pTrk.u.uSkyCol, pal.zenith);
      gl.uniform3fv(pTrk.u.uFogCol, pal.horizon);
      gl.uniform1f(pTrk.u.uFogDensity, pal.fog);
      gl.uniform1f(pTrk.u.uDither, 1.0 / 220.0);
      gl.uniform1f(pTrk.u.uSnow, snowCover);
      gl.uniform1f(pTrk.u.uWet, wetGround);
      gl.uniform1f(pTrk.u.uLift, lift);
      gl.uniform4fv(pTrk.u.uCloudDeck, decks.a);
      gl.uniform4fv(pTrk.u.uCloudShape, decks.aShape);
      gl.uniform4fv(pTrk.u.uCloudWind, decks.wind);
      gl.uniform1f(pTrk.u.uCloudT, state.wxT);
      gl.uniform1f(pTrk.u.uCloudShadow, cloudShadow);
      gl.uniform4fv(pTrk.u.uLamp, lamp);
      gl.uniform3fv(pTrk.u.uLampDir, lampDir);
      setStreetLights(pTrk);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2.0, -4.0);
      if (pTrk.u.uSeason) gl.uniform4fv(pTrk.u.uSeason, season4);
      if (pTrk.u.uGround) gl.uniform1f(pTrk.u.uGround, 1);
      gl.bindVertexArray(corridor.vao);
      gl.drawArrays(gl.TRIANGLES, 0, corridor.count);
      if (pTrk.u.uGround) gl.uniform1f(pTrk.u.uGround, 0);
      if (state.show.roads) {
        gl.polygonOffset(-9.0, -18.0);
        gl.bindVertexArray(roadMesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, roadMesh.count);
        if (city) city.each(m => { if (m.roads && m.roads.count) {
          gl.bindVertexArray(m.roads.vao); gl.drawArrays(gl.TRIANGLES, 0, m.roads.count); } });
      }
      if (yardMesh.count) {
        gl.polygonOffset(-2.2, -4.4);
        gl.bindVertexArray(yardMesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, yardMesh.count);
      }
      if (bufMesh.count) {
        gl.bindVertexArray(bufMesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, bufMesh.count);
      }
      gl.polygonOffset(-2.6, -5.0);
      gl.bindVertexArray(platMesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, platMesh.count);
      gl.polygonOffset(-3.0, -6.0);
      for (const t of [trkDown, trkUp]) {
        gl.bindVertexArray(t.vao);
        gl.drawArrays(gl.TRIANGLES, 0, t.count);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      if (catMesh.count && state.show.catenary) {
        gl.bindVertexArray(catMesh.vao);
        gl.drawArrays(gl.TRIANGLES, 0, catMesh.count);
      }
      }

      // Trains, signals and level crossings. These share the track shader's
      // vertex format — position and colour, flat shaded off the screen-space
      // derivatives — so they ride along with the same program.
      gl.useProgram(pTrk.p);
      gl.uniformMatrix4fv(pTrk.u.uVP, false, vp);
      gl.uniform3fv(pTrk.u.uEye, camEye);
      gl.uniform3fv(pTrk.u.uSunDir, sunDir);
      gl.uniform3fv(pTrk.u.uSunCol, pal.sun);
      gl.uniform3fv(pTrk.u.uSkyCol, pal.zenith);
      gl.uniform3fv(pTrk.u.uFogCol, pal.horizon);
      gl.uniform1f(pTrk.u.uFogDensity, pal.fog);
      gl.uniform1f(pTrk.u.uDither, 0.0);
      gl.uniform1f(pTrk.u.uLift, lift);
      gl.uniform1f(pTrk.u.uWet, wetGround);
      gl.uniform4fv(pTrk.u.uCloudDeck, decks.a);
      gl.uniform4fv(pTrk.u.uCloudShape, decks.aShape);
      gl.uniform4fv(pTrk.u.uCloudWind, decks.wind);
      gl.uniform1f(pTrk.u.uCloudT, state.wxT);
      gl.uniform1f(pTrk.u.uCloudShadow, cloudShadow);
      // snow lies on the ballast but not on a train that has been running,
      // and a signal head is heated
      gl.uniform1f(pTrk.u.uSnow, 0);
      for (const d of [trainDyn, airDyn, sigDyn, xingDyn, carDyn, shipDyn, peopleDyn, lampDyn, heartDyn, bulbDyn, kisDyn, tramDyn, tlDyn, walkDyn, heroDyn]) {
        if (!d.count) continue;
        if (pTrk.u.uPull) gl.uniform1f(pTrk.u.uPull, d === carDyn || d === peopleDyn || d === walkDyn || d === heroDyn ? 0.005 : 0.0);
        // The roads are drawn with a strong polygon offset (to win over the
        // ground), which at a distance put them IN FRONT of the cars on them:
        // the cars sank into the road seen from above. The cars get more.
        if (d === carDyn) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-12.0, -26.0); }
        gl.bindVertexArray(d.vao);
        gl.drawArrays(gl.TRIANGLES, 0, d.count);
        if (d === carDyn) gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      if (pTrk.u.uPull) gl.uniform1f(pTrk.u.uPull, 0.0);
      drawModels(vp, camEye, sunDir, pal, lift);
      drawPeople(vp, camEye, sunDir, pal, lift);
      drawProps(vp, camEye, sunDir, pal, lift);
      drawGraffiti(vp, camEye, pal, lift);
      gl.uniform1f(pTrk.u.uSnow, snowCover);

      // buildings: the real footprints first, by kilometre cell
      if (state.show.buildings && state.show.polys && polyMesh.count) {
        gl.useProgram(pTrk.p);
        gl.uniformMatrix4fv(pTrk.u.uVP, false, vp);
        gl.uniform3fv(pTrk.u.uEye, camEye);
        gl.uniform3fv(pTrk.u.uSunDir, sunDir);
        gl.uniform3fv(pTrk.u.uSunCol, pal.sun);
        gl.uniform3fv(pTrk.u.uSkyCol, pal.zenith);
        gl.uniform3fv(pTrk.u.uFogCol, pal.horizon);
        gl.uniform1f(pTrk.u.uFogDensity, pal.fog);
        gl.uniform1f(pTrk.u.uDither, 1.0 / 220.0);
        gl.uniform1f(pTrk.u.uLift, lift);
        gl.uniform1f(pTrk.u.uWet, wetGround * 0.5);
        gl.uniform1f(pTrk.u.uSnow, snowCover * 0.8);
        gl.uniform4fv(pTrk.u.uCloudDeck, decks.a);
        gl.uniform4fv(pTrk.u.uCloudShape, decks.aShape);
        gl.uniform4fv(pTrk.u.uCloudWind, decks.wind);
        gl.uniform1f(pTrk.u.uCloudT, state.wxT);
        gl.uniform1f(pTrk.u.uCloudShadow, cloudShadow);
        gl.uniform4fv(pTrk.u.uLamp, lamp);
        gl.uniform3fv(pTrk.u.uLampDir, lampDir);
        setStreetLights(pTrk);
        gl.bindVertexArray(polyMesh.vao);
        const kx = Math.floor(camEye[0] / 1000), kz = Math.floor(-camEye[2] / 1000);
        for (const c of polyCells) {
          if (Math.abs(c.cx - kx) > 8 || Math.abs(c.cy - kz) > 8) continue;
          gl.drawArrays(gl.TRIANGLES, c.start, c.count);
        }
        if (lmMesh.count) {
          gl.bindVertexArray(lmMesh.vao);
          gl.drawArrays(gl.TRIANGLES, 0, lmMesh.count);
        }
        if (city) city.each(m => {
          for (const k of ["polys", "parts", "lm", "x", "st", "pk"]) if (m[k] && m[k].count) {
            gl.bindVertexArray(m[k].vao); gl.drawArrays(gl.TRIANGLES, 0, m[k].count);
          }
        });
        if (lineExtras) { gl.bindVertexArray(lineExtras.vao); gl.drawArrays(gl.TRIANGLES, 0, lineExtras.count); }
        if (lineStructs) { gl.bindVertexArray(lineStructs.vao); gl.drawArrays(gl.TRIANGLES, 0, lineStructs.count); }
        if (horsesMesh) { gl.bindVertexArray(horsesMesh.vao); gl.drawArrays(gl.TRIANGLES, 0, horsesMesh.count); }
        if (wallsMesh) { gl.bindVertexArray(wallsMesh.vao); gl.drawArrays(gl.TRIANGLES, 0, wallsMesh.count); }
        if (kisTrack && kisTrack.count) { gl.bindVertexArray(kisTrack.vao); gl.drawArrays(gl.TRIANGLES, 0, kisTrack.count); }
        if (partsMesh.count) {
          gl.bindVertexArray(partsMesh.vao);
          gl.drawArrays(gl.TRIANGLES, 0, partsMesh.count);
        }
        if (shedMesh.count) {
          gl.bindVertexArray(shedMesh.vao);
          gl.drawArrays(gl.TRIANGLES, 0, shedMesh.count);
        }
        if (structMesh.count && state.show.structs) {
          gl.bindVertexArray(structMesh.vao);
          gl.drawArrays(gl.TRIANGLES, 0, structMesh.count);
        }
      }

      // buildings
      if (state.show.buildings && state.show.boxes) {
        const n = gatherBuildings(camEye[0], -camEye[2], 5800);
        if (n > 0) {
          gl.useProgram(pBld.p);
          gl.uniformMatrix4fv(pBld.u.uVP, false, vp);
          gl.uniform3fv(pBld.u.uEye, camEye);
          gl.uniform3fv(pBld.u.uSunDir, sunDir);
          gl.uniform3fv(pBld.u.uSunCol, pal.sun);
          gl.uniform3fv(pBld.u.uSkyCol, pal.zenith);
          gl.uniform3fv(pBld.u.uFogCol, pal.horizon);
          gl.uniform1f(pBld.u.uFogDensity, pal.fog);
          gl.uniform1f(pBld.u.uDither, 1.0 / 220.0);
          gl.uniform1f(pBld.u.uSnow, snowCover);
          gl.uniform1f(pBld.u.uWet, wetGround);
          gl.uniform1f(pBld.u.uNight, state.night || 0);
          setStreetLights(pBld);
          gl.uniform1f(pBld.u.uLift, lift);
          // the same field the sky draws, so a building stands in the shadow of
          // the cloud that is actually over it
          gl.uniform4fv(pBld.u.uCloudDeck, decks.a);
          gl.uniform4fv(pBld.u.uCloudShape, decks.aShape);
          gl.uniform4fv(pBld.u.uCloudWind, decks.wind);
          gl.uniform1f(pBld.u.uCloudT, state.wxT);
          gl.uniform1f(pBld.u.uCloudShadow, cloudShadow);
          gl.uniform3fv(pBld.u.uEye, camEye);
          gl.uniform2f(pBld.u.uNearSize, texNear.w, texNear.h);
          gl.uniform2f(pBld.u.uNearStep, nearStep, nearStep);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texNear.tex);
          gl.uniform1i(pBld.u.uHeightNear, 0);
          gl.bindVertexArray(bldVao);
          gl.bindBuffer(gl.ARRAY_BUFFER, bBuf);
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, bInst, 0, n * 8);
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 54, n);
        }
      }

      // vegetation
      if (state.show.veg) {
      gl.useProgram(pVeg.p); setCraters(pVeg);
      gl.uniformMatrix4fv(pVeg.u.uVP, false, vp);
      gl.uniform1f(pVeg.u.uClipBelow, refl);
      gl.uniform2f(pVeg.u.uWaterAB, WA + (state.danube || 0), WB);
      gl.uniform3fv(pVeg.u.uEye, camEye);
      gl.uniform3fv(pVeg.u.uRight, right);
      gl.uniform3fv(pVeg.u.uSunDir, sunDir);
      gl.uniform3fv(pVeg.u.uSunCol, pal.sun);
      gl.uniform3fv(pVeg.u.uSkyCol, pal.zenith);
      gl.uniform3fv(pVeg.u.uFogCol, pal.horizon);
      gl.uniform1f(pVeg.u.uFogDensity, pal.fog);
      gl.uniform4fv(pVeg.u.uSeason, season4);
      gl.uniform1f(pVeg.u.uSnow, snowCover);
      gl.uniform1f(pVeg.u.uLift, lift);
      // the same field the sky draws, so a tree stands in the shadow of
      // the cloud that is actually over it
      gl.uniform4fv(pVeg.u.uCloudDeck, decks.a);
      gl.uniform4fv(pVeg.u.uCloudShape, decks.aShape);
      gl.uniform4fv(pVeg.u.uCloudWind, decks.wind);
      gl.uniform1f(pVeg.u.uCloudT, state.wxT);
      gl.uniform1f(pVeg.u.uCloudShadow, cloudShadow);
      gl.uniform2f(pVeg.u.uNearSize, texNear.w, texNear.h);
      gl.uniform2f(pVeg.u.uNearStep, nearStep, nearStep);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texNear.tex);
      gl.uniform1i(pVeg.u.uHeightNear, 0);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texCover.tex);
      gl.uniform1i(pVeg.u.uCover, 2);
      gl.bindVertexArray(vegVao);
      // the two passes, plus the close forest pass (woodland only, a tree
      // every 7 m, lower: the understorey the woods were missing) — not at
      // the lowest quality
      const passes = [[16, 150, 1300, 0], [46, 120, 4200, 0]];
      if ((state.cityR || 3200) > 2000) passes.push([7, 170, 560, 1]);
      for (const [spacing, side, maxd, dense] of passes) {
        const ox = Math.round(camEye[0] / spacing) * spacing;
        const oz = Math.round(camEye[2] / spacing) * spacing;
        gl.uniform1f(pVeg.u.uDense, dense);
        gl.uniform4fv(pVeg.u.uCityBox, cityBoxLine);
        gl.uniform2f(pVeg.u.uOrigin, ox, oz);
        gl.uniform1f(pVeg.u.uSpacing, spacing);
        gl.uniform1i(pVeg.u.uSide, side);
        gl.uniform1f(pVeg.u.uMaxDist, maxd);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 18, side * side);
      }
      // Budapest's own trees, from the cadastre, per loaded city tile
      if (city) {
        gl.useProgram(pTree.p); setCraters(pTree);
        const U = pTree.u;
        gl.uniformMatrix4fv(U.uVP, false, vp);
        gl.uniform1f(U.uClipBelow, refl);
        gl.uniform2f(U.uWaterAB, WA + (state.danube || 0), WB);
        gl.uniform3fv(U.uEye, camEye);
        gl.uniform3fv(U.uSunDir, sunDir);
        gl.uniform3fv(U.uSunCol, pal.sun);
        gl.uniform3fv(U.uSkyCol, pal.zenith);
        gl.uniform3fv(U.uFogCol, pal.horizon);
        gl.uniform1f(U.uFogDensity, pal.fog);
        gl.uniform4fv(U.uSeason, season4);
        gl.uniform1f(U.uSnow, snowCover);
        gl.uniform1f(U.uLift, lift);
        gl.uniform4fv(U.uCloudDeck, decks.a);
        gl.uniform4fv(U.uCloudShape, decks.aShape);
        gl.uniform4fv(U.uCloudWind, decks.wind);
        gl.uniform1f(U.uCloudT, state.wxT);
        gl.uniform1f(U.uCloudShadow, cloudShadow);
        gl.uniform1f(U.uMaxDist, (state.cityR || 3200) > 2000 ? 2400 : 1300);
        city.each(m => { if (m.tr) { gl.bindVertexArray(m.tr.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 18, m.tr.n); } });
      }
      }

    }

    // ---- reflection
    // Reflect the WORLD about the water plane, not the camera. The previous
    // version mirrored the eye and the target and then called lookAt with an
    // unreflected up vector — but reflecting a camera flips its handedness,
    // and passing [0,1,0] as up makes lookAt rebuild the basis with the right
    // vector inverted, so the image came out mirrored left-to-right as well
    // as top-to-bottom. That is why it never sat still: every sample was
    // taken from the wrong side of the screen, and turning your head moved
    // the error rather than the reflection.
    //
    // Rendering the unreflected geometry through vp * R puts the mirror image
    // directly into the real camera's screen space, which makes the correct
    // sample coordinate the fragment's own screen position — no offset, no
    // guesswork, and stable under any head movement.
    {
      // one plane for the reflection, taken under the camera
      const W = waterAt(-camEye[2]);
      const R = new Float32Array([1,0,0,0,  0,-1,0,0,  0,0,1,0,  0,2*W,0,1]);
      const mVP = M4.mul(vp, R);
      // fog and the normal flip want the distance from the mirrored eye,
      // which is the true length of the light path object → water → eye
      const mEye = [camEye[0], 2 * W - camEye[1], camEye[2]];
      gl.bindFramebuffer(gl.FRAMEBUFFER, rfbo);
      gl.viewport(0, 0, REFL.w, REFL.h);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, dummyTex);
      drawWorld(mVP, mEye, { reflect: true, invVP: M4.invert(mVP) });
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, RES.w, RES.h);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, reflTex);
    drawWorld(vp, camEye, { reflect: false, invVP });

    // station name boards
    gl.useProgram(pBrd.p);
    gl.uniformMatrix4fv(pBrd.u.uVP, false, vp);
    gl.uniform3fv(pBrd.u.uEye, camEye);
    gl.uniform3fv(pBrd.u.uRight, right);
    gl.uniform3fv(pBrd.u.uSunCol, pal.sun);
    gl.uniform3fv(pBrd.u.uSkyCol, pal.zenith);
    gl.uniform3fv(pBrd.u.uFogCol, pal.horizon);
    gl.uniform1f(pBrd.u.uFogDensity, pal.fog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.uniform1i(pBrd.u.uAtlas, 0);
    gl.bindVertexArray(brdVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, stn.boards.length);

    // ---- particles: fire, smoke, sparks, vapour (vfx.js)
    // ---- heavy weather (Settings): spray behind wheels on a wet road, and
    // splashes where the rain lands round the camera. Rain only: snow and a
    // dry road throw nothing. The phone build spawns a third as many.
    if (state.gfx && state.gfx.heavy && !state.paused && !state.photo && vfx.n < VFX_MAX - 600) {   // (room kept for a crash)
      const k = wx.precip.kind, rain = k === 1 || k === 3 || k === 4 || k === 5 || k === 6;
      const dtv = Math.min(dtReal, 0.1) * Math.min(state.speedMul || 1, 4);
      const R = Math.random, thin = state.lite ? 0.35 : 1;
      const wetRoad = Math.max(wx.wet || 0, rain ? wx.precip.rate : 0);
      if (wetRoad > 0.15 && wx.snow < 0.3) {
        // a car: two plumes off the rear wheels, more the faster it goes
        const A = RT_SPRAY.a;
        for (let i = 0; i < RT_SPRAY.n; i++) {
          const o = i * 8, x = A[o], y = A[o + 1], n = A[o + 2], fx = A[o + 3], fz = A[o + 4];
          const v = A[o + 5], hw = A[o + 6], hl = A[o + 7];
          let want = dtv * wetRoad * thin * Math.min(1, (v - 4) / 14) * (hw > 0.6 ? 45 : 10);
          while (want > 0 && (want >= 1 || R() < want)) {
            want -= 1;
            const sd = R() < 0.5 ? -1 : 1, back = hl * (0.75 + R() * 0.3);
            const px = x - fx * back - fz * hw * 0.8 * sd, pn = n - fz * back + fx * hw * 0.8 * sd;
            const kick = v * (0.25 + R() * 0.25);
            vfx.spawn(6, px, y + 0.25, -pn, fx * kick * 0.3 + (R() - 0.5) * 1.5, 0.8 + R() * 1.6,
                      -(fz * kick * 0.3) + (R() - 0.5) * 1.5, 0.6, 2.2 + hw * 1.4 + v * 0.06, 0.8 + R() * 0.6, 0, -0.6);
          }
        }
        // a train: mist off the bogies along its length, and a wake behind it
        const trs = traffic.trains.concat(insideTrain ? [] : [playerTrain]);
        for (const t of trs) {
          const v = Math.abs(t.v || 0);
          if (v < 8) continue;
          const head = trainPoint(t, 0);
          if (!head || Math.hypot(head.x - camEye[0], head.n + camEye[2]) > (t.length || 100) + 220) continue;
          let want = dtv * wetRoad * thin * Math.min(1, (v - 8) / 20) * 75 * Math.max(0.5, (t.length || 100) / 100);
          while (want > 0 && (want >= 1 || R() < want)) {
            want -= 1;
            const len = t.length || 100, kk = R() < 0.4 ? len : R() * len;
            const q = trainPoint(t, kk); if (!q) continue;
            const sd = R() < 0.5 ? -1 : 1;
            const fx = q.nn, fz = -q.nx;           // along the track, east/north
            vfx.spawn(6, q.x + q.nx * 1.3 * sd, q.y + 0.4, -(q.n + q.nn * 1.3 * sd),
                      -fx * t.dir * v * 0.15 + (R() - 0.5) * 2, 0.6 + R() * 1.4, (fz * t.dir * v * 0.15) + (R() - 0.5) * 2,
                      0.8, 2.4 + v * 0.07 + R() * 1.8, 0.9 + R() * 0.7, 0, -0.4);
          }
        }
      }
      if (rain && wx.precip.rate > 0.05 && camEye[1] - demAt(camEye[0], -camEye[2]) < 60) {
        // splashes on the ground within ~22 m of the camera, where it can see
        let want = dtv * wx.precip.rate * thin * (k === 4 ? 120 : 520);
        while (want > 0 && (want >= 1 || R() < want)) {
          want -= 1;
          const a = R() * 6.2832, d = 2 + Math.sqrt(R()) * 20;
          const sx = camEye[0] + Math.cos(a) * d, sn = -camEye[2] + Math.sin(a) * d;
          // only in front of the camera (the half behind it would be wasted)
          if ((sx - camEye[0]) * fwd[0] - (sn + camEye[2]) * fwd[2] < -2) continue;
          let gy = demAt(sx, sn);
          if (!isFinite(gy)) continue;
          const top = solids.topAt ? solids.topAt(sx, sn) : null;
          if (top != null && isFinite(top) && top > gy && top < camEye[1] + 30) gy = top;
          else { const rs = roadSurface(sx, sn); if (isFinite(rs) && Math.abs(rs - gy) < 1.5) gy = Math.max(gy, rs); }
          vfx.spawn(7, sx, gy + 0.02, -sn, 0, 0, 0, 0.30 + R() * 0.15, 0.50 + R() * 0.20, 0.22 + R() * 0.12, 0, 0);
        }
      }
    }
    if (state.wreck && !state.paused && !state.photo) stepWreck(Math.min(dtReal, 0.1));
    if (!state.paused && !state.photo) for (const a of aiWrecks) { a.w.step(Math.min(dtReal, 0.1)); wreckFx(a.w); }
    if (!state.paused && !state.photo) vfx.step(Math.min(dtReal, 0.1) * Math.min(state.speedMul || 1, 4));
    // the starlings over Kispest: autumn and winter, at dusk (the owner saw
    // them once and never forgot it). Placed from lat/lon, so any line's
    // world that reaches Kispest has them.
    let vfxN = vfx.count;
    {
      const d = state.day, h = state.hour;
      const season = d >= 270 || d <= 60, dusk = h > 15.5 && h < 18.5;
      if (season && dusk) {
        if (!murm) {
          const W = assets.world.near, [mla, mlo] = [111132.92 - 559.82 * Math.cos(2 * (W.frame_lat ?? (W.south + W.north) / 2) * Math.PI / 180),
            111412.84 * Math.cos((W.frame_lat ?? (W.south + W.north) / 2) * Math.PI / 180)];
          const mx = (19.140 - W.west) * mlo, mn = (47.452 - W.south) * mla, g = demAt(mx, mn);
          if (isFinite(g)) murm = new Murmuration(mx, g + 140, -mn, 900);
        }
        if (murm && Math.hypot(murm.home[0] - camEye[0], murm.home[2] - camEye[2]) < 7000) {
          if (!state.paused && !state.photo) murm.step(Math.min(dtReal, 0.05));
          vfxN = murm.pack(vfx.out, vfx.count, VFX_MAX);
        }
      }
    }
    if (vfxN) {
      gl.useProgram(pVfx.p);
      gl.uniformMatrix4fv(pVfx.u.uVP, false, vp);
      gl.uniform3fv(pVfx.u.uEye, camEye);
      gl.uniform3f(pVfx.u.uCamRight, view[0], view[4], view[8]);
      gl.uniform3f(pVfx.u.uCamUp, view[1], view[5], view[9]);
      gl.uniform3fv(pVfx.u.uSunDir, sunDir);
      gl.uniform3fv(pVfx.u.uSunCol, pal.sun);
      gl.uniform3fv(pVfx.u.uSkyCol, pal.zenith);
      gl.uniform3fv(pVfx.u.uFogCol, pal.horizon);
      gl.uniform1f(pVfx.u.uFogDensity, pal.fog);
      gl.bindBuffer(gl.ARRAY_BUFFER, vfxInst);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vfx.out.subarray(0, vfxN * 12));
      gl.bindVertexArray(vfxVao);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, vfxN);
      gl.disable(gl.BLEND); gl.depthMask(true);
    }

    // ---- flood: the raised Danube over everything lower than it (FLOOD_VS)
    if ((state.danube || 0) > 0.25) {
      gl.useProgram(pFlood.p);
      gl.bindVertexArray(floodVao);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniformMatrix4fv(pFlood.u.uVP, false, vp);
      gl.uniform3fv(pFlood.u.uEye, camEye);
      gl.uniform2f(pFlood.u.uWaterAB, WA + state.danube, WB);
      gl.uniform1f(pFlood.u.uHalf, 9000);
      gl.uniform3fv(pFlood.u.uSunDir, sunDir);
      gl.uniform3fv(pFlood.u.uSunCol, pal.sun);
      gl.uniform3fv(pFlood.u.uSkyCol, pal.zenith);
      gl.uniform3fv(pFlood.u.uFogCol, pal.horizon);
      gl.uniform1f(pFlood.u.uFogDensity, pal.fog);
      gl.uniform1f(pFlood.u.uTime, now * 0.001);
      gl.uniform1f(pFlood.u.uDepthFade, Math.min(1, (state.danube - 0.25) * 2));
      gl.uniform1i(pFlood.u.uReflect, 4);
      gl.uniform2f(pFlood.u.uViewport, RES.w, RES.h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }

    // ---- precipitation
    // Drawn after the world, depth-tested against it so a shower is properly
    // hidden behind a hillside, and before the cab, which is the glass you
    // are looking through.
    if (wx.precip.kind && wx.precip.rate > 0.004) {
      const tan0 = route.tangent(driver.m);
      const trainVel = [tan0[0] * route.dir * driver.v, 0,
                        -tan0[1] * route.dir * driver.v];
      const vel = precipVelocity(wx, trainVel);
      const k = wx.precip.kind;
      const tint = [
        Math.min(1.4, pal.horizon[0] * 0.85 + pal.sun[0] * 0.22 + 0.05),
        Math.min(1.4, pal.horizon[1] * 0.88 + pal.sun[1] * 0.22 + 0.05),
        Math.min(1.4, pal.horizon[2] * 0.92 + pal.sun[2] * 0.22 + 0.06)];
      // snow and hail are big and bright, drizzle is a mist of nothing
      const radius = k === 2 ? 0.055 : k === 5 ? 0.030 : k === 4 ? 0.006 : 0.010;
      const expo   = k === 2 ? 0.020 : k === 5 ? 0.030 : k === 4 ? 0.020 : 0.045;
      const white  = k === 2 ? 0.55 : k === 5 ? 0.60 : k === 3 ? 0.30 : 0.0;
      const n = Math.round(PRECIP_MAX * Math.min(1, wx.precip.rate)
                           * (k === 4 ? 1.3 : 1));
      gl.useProgram(pPre.p);
      gl.bindVertexArray(dropVao);
      gl.uniformMatrix4fv(pPre.u.uVP, false, vp);
      gl.uniform3fv(pPre.u.uCam, camEye);
      gl.uniform3fv(pPre.u.uVel, vel);
      gl.uniform3fv(pPre.u.uOffset, state.precipOff);
      gl.uniform4f(pPre.u.uPrecip, k, wx.precip.rate, radius, expo);
      gl.uniform1f(pPre.u.uHalf, PRECIP_BOX);
      gl.uniform1f(pPre.u.uPy, proj[5]);
      gl.uniform1f(pPre.u.uMinW, 1.3 / RES.h);
      gl.uniform1f(pPre.u.uAspect, RES.w / RES.h);
      gl.uniform1f(pPre.u.uTime, state.precipT);
      gl.uniform3fv(pPre.u.uTint, tint.map(v => v + (1 - v) * white));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
      gl.depthMask(true);
      gl.disable(gl.BLEND);

    }

    // ---- water on the glass, and the wiper. Separate from the rain: a
    // wiper sweeps a dry screen too, and you want to see it do that.
    if (insideTrain && (wx.precip.rate > 0.004 || state.wiper > 0)
        && wx.precip.kind !== 2) {
      const tan1 = route.tangent(driver.m);
      const tf = [tan1[0] * route.dir, 0, -tan1[1] * route.dir];
      const ahead = Math.max(0, fwd[0] * tf[0] + fwd[2] * tf[2]);
      const look = Math.max(0, Math.min(1, (ahead - 0.45) / 0.35));
      if (look > 0.004) {
        const sweep = state.wiper === 0 ? 0 : state.wiper === 1 ? 0.55 : 1.05;
        const tint = [
          Math.min(1.4, pal.horizon[0] * 0.85 + pal.sun[0] * 0.22 + 0.05),
          Math.min(1.4, pal.horizon[1] * 0.88 + pal.sun[1] * 0.22 + 0.05),
          Math.min(1.4, pal.horizon[2] * 0.92 + pal.sun[2] * 0.22 + 0.06)];
        gl.useProgram(pGls.p);
        gl.bindVertexArray(quadVao);
        gl.uniform3fv(pGls.u.uTint, tint);
        gl.uniform4f(pGls.u.uGlass, wx.precip.kind === 2 ? 0 : wx.precip.rate,
                     Math.min(1, driver.v / 26), look, RES.w / RES.h);
        gl.uniform3f(pGls.u.uWiper, sweep, 0.80, 0);
        gl.uniform1f(pGls.u.uTime, state.precipT);
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
      }
    }

    // the aeroplane's cockpit (aircraft.js buildCockpit), through the cab's program
    {
      const pl = state.plane;
      if (!inCab && pl && pl.active && pl.cockpit && pl.cockBasis && !state.photo && !(pl.crashed > 0)) {
        const b = pl.cockBasis;
        const mesh = buildCockpit(b.eye, b.f, b.r, b.u, pl.type);
        gl.bindVertexArray(cabVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, cabPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.verts);
        gl.bindBuffer(gl.ARRAY_BUFFER, cabCol); gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.cols);
        gl.bindBuffer(gl.ARRAY_BUFFER, cabUv); gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.uvs);
        const cp = M4.mul(M4.perspective(state.fov * Math.PI / 180, RES.w / RES.h, 0.05, 80), view);
        gl.useProgram(pCab.p);
        gl.uniformMatrix4fv(pCab.u.uVP, false, cp);
        if (pCab.u.uOrigin) gl.uniform3fv(pCab.u.uOrigin, camEye);
        gl.uniform3fv(pCab.u.uSunCol, pal.sun);
        gl.uniform3fv(pCab.u.uSkyCol, pal.zenith);
        gl.uniform3fv(pCab.u.uSunDir, sunDir);
        gl.uniform1i(pCab.u.uPanel, 5);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      }
    }
    // the cab, riding with the train
    if (inCab) {
      const railPt = route.at(driver.m);
      const railTan = route.tangent(driver.m);
      const f = [railTan[0] * route.dir, 0, -railTan[1] * route.dir];
      const rgt = norm(cross(f, [0, 1, 0]));
      const eyeC = [railPt[0], railPt[2] + 3.1, -railPt[1]];
      const mesh = buildCab(eyeC, f, rgt, [0, 1, 0], driver.s.stock);
      cabCount = mesh.count;
      gl.bindVertexArray(cabVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, cabPos);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.verts);
      gl.bindBuffer(gl.ARRAY_BUFFER, cabCol);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.cols);
      gl.bindBuffer(gl.ARRAY_BUFFER, cabUv);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.uvs);

      const nextS = driver.targetStop();
      const dd = nextS ? (nextS.km * 1000 - driver.m) * route.dir : 0;
      const L = state.lateness;
      const asp = playerTrain.aspect;
      const cabSt = {
        kmh: driver.v * 3.6, limit: route.limitAt(driver.m),
        throttle: driver.throttle, brake: driver.brake,
        aspect: asp, aspectName: ASPECT_NAME[asp],
        nextName: driver.terminated ? "végállomás" : (nextS ? nextS.name : "—"),
        nextDist: driver.terminated
          ? `fordulás ${Math.max(0, driver.layover) | 0} s`
          : `${(dd / 1000).toFixed(2)} km`,
        km: route.officialKm(driver.m).toFixed(2),
        clock: fmtTime(state.hour), pax: driver.pax,
        lights: state.lights, wiper: state.wiper, horn: !!state.horn,
        hornMode: state.hornMode,
        sand: driver.sand, doors: !!driver.doors,
        vigilance: driver.vigWarn > 0 || driver.vigPenalty > 0,
        vigAck: driver.vigAck > 0,
        clockMs: now,
        // 25 kV nominal, sagging a little with what the line is pulling
        kv: 25.0 - Math.min(3.4, traffic.trains.length * 0.19
                                 + driver.throttle * 1.1),
        lateText: L == null ? null
          : `${L < 0 ? "−" : "+"}${Math.floor(Math.abs(L)/60)}:`
            + `${String(Math.floor(Math.abs(L)%60)).padStart(2,"0")}`,
        lateCol: L == null ? "" : Math.abs(L) < 60 ? "rgba(69,217,131,.95)"
                 : L < 0 ? "rgba(140,190,240,.95)" : "rgba(243,196,82,.95)",
        lever: driver.auto ? null : driver.emergency ? "EB"
               : driver.lever > 0 ? `P${driver.lever}` : driver.lever < 0 ? `B${-driver.lever}` : "0",
        pipe: 5.0 - (driver.bcp != null ? driver.bcp : driver.brake) * 1.6,
        hits: [],
      };
      drawInstruments(panelCtx, panelCanvas, cabSt);
      // keep what a click needs: the switch rects and the face they sit on
      state.cabHits = cabSt.hits;
      state.cabFace = mesh.face;
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, panelTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, panelCanvas);

      // The world is drawn with a 1.2 m near plane so that 62 km of depth
      // still resolves. A cab interior lives inside 1.6 m of the eye and was
      // being clipped away entirely, so it gets its own short projection.
      const cabProj = M4.perspective(state.fov / state.zoom * Math.PI / 180,
                                     RES.w / RES.h, 0.05, 80);
      const cabVP = M4.mul(cabProj, view);
      state.invVPCab = M4.invert(cabVP);
      state.vpCab = cabVP;
      gl.useProgram(pCab.p);
      gl.uniformMatrix4fv(pCab.u.uVP, false, cabVP);
      if (pCab.u.uOrigin) gl.uniform3fv(pCab.u.uOrigin, camEye);
      gl.uniform3fv(pCab.u.uSunCol, pal.sun);
      gl.uniform3fv(pCab.u.uSkyCol, pal.zenith);
      gl.uniform3fv(pCab.u.uSunDir, sunDir);
      gl.uniform1i(pCab.u.uPanel, 5);
      gl.clear(gl.DEPTH_BUFFER_BIT);        // the cab is always nearest
      gl.bindVertexArray(cabVao);
      gl.drawArrays(gl.TRIANGLES, 0, cabCount);
      state.dbgCab = { count: cabCount, err: gl.getError(),
                       attrs: Object.keys(pCab.a).join(","),
                       unis: Object.keys(pCab.u).join(","),
                       eye: eyeC.map(v => +v.toFixed(1)),
                       v0: [mesh.verts[0], mesh.verts[1], mesh.verts[2]].map(v => +v.toFixed(1)) };
    }

    // ---- output: bright pass, blur, then tone map to the screen
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(quadVao);
    const expo = state.exposure;
    {
      gl.viewport(0, 0, BLOOM.w, BLOOM.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFbo[0]);
      gl.useProgram(pBright.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, colorTex);
      gl.uniform1i(pBright.u.uTex, 0);
      gl.uniform1f(pBright.u.uThreshold, 0.85);
      gl.uniform1f(pBright.u.uExposure, expo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.useProgram(pBlur.p);
      for (const [src, dst, sx, sy] of [
        [0, 1, 1 / BLOOM.w, 0], [1, 0, 0, 1 / BLOOM.h]]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFbo[dst]);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bloomTex[src]);
        gl.uniform1i(pBlur.u.uTex, 0);
        gl.uniform2f(pBlur.u.uStep, sx, sy);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.useProgram(pBlit.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.uniform1i(pBlit.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomTex[0]);
    gl.uniform1i(pBlit.u.uBloom, 1);
    gl.uniform1f(pBlit.u.uBloomAmt, hdrOK ? state.bloom : 0);
    gl.uniform1f(pBlit.u.uExposure, expo);
    gl.uniform1f(pBlit.u.uVignette, state.vignette !== undefined ? state.vignette : 0.28);
    gl.uniform1f(pBlit.u.uGrain, state.grain !== undefined ? state.grain : 0.35);
    gl.uniform1f(pBlit.u.uChroma, state.chroma !== undefined ? state.chroma : 0.40);
    gl.uniform1f(pBlit.u.uTime, performance.now() * 0.001);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, depthTex);
    gl.uniform1i(pBlit.u.uDepth, 2);
    gl.uniform2f(pBlit.u.uNF, nearZ, 62000);
    const ph = state.photo;
    // depth of field outside the photo mode: in the outside views and
    // sightseeing only (never over the cab desk), focused on what is in the
    // middle of the picture
    const G = state.gfx || {};
    const outside = state.follow || state.fly || state.tour || state.followIdx >= 0 || flying
                    || (state.drone && state.drone.active) || state.followCarIdx >= 0 || state.followShipIdx >= 0 || !!state.tram;
    const playDof = !ph && G.dof && outside;
    // focus on what the camera follows (the ray used to miss the train and
    // hunt between the ground behind it and the ballast in front); only the
    // free views and sightseeing look for it along the middle of the picture
    const tgt = state.car && state.car.active ? [state.car.x, state.car.y + 1, -state.car.n]
              : state.plane && state.plane.active ? state.plane.p
              : state.drone && state.drone.active ? null
              : state.follow && state.followIdx < 0 ? eye : null;
    if (playDof && tgt) state.focusWant = Math.hypot(tgt[0] - camEye[0], tgt[1] - camEye[1], tgt[2] - camEye[2]);
    else if (playDof && (state.focusT = (state.focusT || 0) - dtReal) <= 0) {
      state.focusT = 0.3;
      const t = distanceAt(0, -0.05);
      if (t != null) state.focusWant = t;
    }
    state.focus = state.focus ? state.focus + ((state.focusWant || 300) - state.focus) * Math.min(1, dtReal * 3) : (state.focusWant || 300);
    if (ph) gl.uniform4f(pBlit.u.uDof, ph.dof, ph.focus, ph.aperture, ph.band);
    else gl.uniform4f(pBlit.u.uDof, playDof ? 1 : 0, state.focus, G.dofAmt || 0.12, 0.45);
    gl.uniform3f(pBlit.u.uFx, G.motion && !ph ? (G.motionAmt || 1.0) : 0.0, G.ao ? (G.aoAmt || 1.0) : 0.0, ph ? 0.0 : 3.0);
    gl.uniformMatrix4fv(pBlit.u.uInvVP, false, invVP);
    gl.uniformMatrix4fv(pBlit.u.uPrevVP, false, state.prevVP || vp);
    state.prevVP = vp;
    gl.uniform4f(pBlit.u.uGrade, ph ? ph.hue : 0, ph ? ph.sat : 1, ph ? ph.contrast : 1, ph ? ph.warm : 0);
    // Heavy weather: water on an outside camera's lens. Not in the cab or a
    // carriage (the windscreen and its wipers do that) nor in a car's or a
    // plane's cockpit. The lens gets wetter while it rains and dries slowly.
    {
      const k = wx.precip.kind, rain = k === 1 || k === 3 || k === 4 || k === 5 || k === 6;
      const lensOn = G.heavy && !insideTrain && !ph && !(state.car && state.car.active && state.car.cockpit)
                     && !(state.plane && state.plane.active && state.plane.cockpit);
      const tgtW = lensOn && rain ? Math.min(1, 0.25 + wx.precip.rate * (k === 4 ? 0.5 : 1.0)) : 0;
      const dtl = state.paused ? 0 : Math.min(dtReal, 0.1);
      const lw = state.lensWet || 0;
      state.lensWet = !lensOn ? 0 : tgtW > lw ? Math.min(tgtW, lw + dtl * 0.35) : Math.max(tgtW, lw - dtl * 0.05);
      const pe = state.lensPrevEye || camEye;
      const cs = dtReal > 0 ? Math.hypot(camEye[0] - pe[0], camEye[1] - pe[1], camEye[2] - pe[2]) / dtReal : 0;
      state.lensPrevEye = camEye.slice();
      state.lensSpd = (state.lensSpd || 0) + (Math.min(1, cs / 30) - (state.lensSpd || 0)) * Math.min(1, dtReal * 2);
      if (!state.paused) state.lensT = (state.lensT || 0) + dtl;
      gl.uniform4f(pBlit.u.uLens, state.lensWet, state.lensT || 0, state.lensSpd, RES.w / RES.h);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);

    // sound follows the train, not the frame rate
    if (state.sound && soundArmed) {
      sound.update(driver.v, driver.throttle, driver.brake, sp.alt, state.day, dtReal);
      sound.weather(wx.precip.kind, wx.precip.rate, wx.wind.speed,
                    wx.wind.gust, driver.v);
      sound.setCurve(driver.v, route.curvatureAt(driver.m));
      if (state.drone && state.drone.active) {
        const drV = state.drone.v;
        const drSpd = Math.hypot(drV[0], drV[1], drV[2]);
        sound.updateDrone(true, Math.min(1.0, drSpd / 30.0 + (keys.has("Space") || keys.has("ShiftLeft") ? 0.4 : 0.0)), drSpd);
      } else {
        sound.updateDrone(false);
      }
      if (state.hornUntil && now > state.hornUntil) state.hornUntil = 0;
      state.horn = (keys.has("KeyH") || !!state.hornUntil) && !state.menu;
      sound.setHorn(state.horn, state.hornMode);
      // Line 70 is continuously welded, so there is no constant clacking.
      // What you hear is the wheels over level crossings and pointwork.
      if (!state.paused && driver.v > 2) {
        for (const x of routeData.crossings) {
          const passed = (x.m - driver.m) * route.dir;
          if (passed < 0 && passed > -driver.v * dtReal * 1.05 - 1) {
            sound.bogiePair(driver.v, 0.34);
            break;
          }
        }
        jointPhase += driver.v * dtReal;
        if (jointPhase > 260) {          // an occasional weld or joint
          jointPhase -= 260 + Math.random() * 180;
          sound.click(0.03 + Math.min(0.07, driver.v / 400), 95 + Math.random() * 40);
        }
      }
      if (state.speedMul <= 2) {
        if (driver.dwell > 0 && lastDwell <= 0) sound.chime();
        if (lastDwell > 0 && driver.dwell <= 0) sound.hiss(1.1, 0.22);
        // birdsong: daylight, and only where there is something to sit in
        const cov = coverAt(route.at(driver.m)[0], route.at(driver.m)[1]);
        const wooded = cov === 1 || cov === 2 || cov === 5 || cov === 3;
        // nothing sings in a downpour
        if (wooded && sp.alt > 0.02 && driver.v < 22 && wx.precip.rate < 0.18
            && Math.random() < dtReal * (sp.alt < 0.25 ? 1.1 : 0.45)) sound.bird();
      }
      lastDwell = driver.dwell;
    }

    if (state.panel) {
      const D = state.dispatch;
      const hit = { route, traffic, driver, clockSec: state.hour * 3600,
                    view: state.panelView, lateness: state.lateness,
                    dispatching: D ? { left: Math.max(0, D.end - state.hour * 3600), mine: traffic.late.wait || 0,
                                       auto: D.shadow.late.wait || 0, broken: traffic.breakdown && traffic.breakdown.train } : null };
      drawPanel(hx, hud, hit);
      state.hit = hit;
    } else {
      drawHud(hx, hud, { route, driver, vp, camEye, pal, sp, fps, traffic, playerTrain, fwd, state, inCab },
              { imgMap, routeData, mapMeta, geo: geoToFrame });
    }
    // a photograph is taken here, straight after the picture is drawn: the
    // drawing buffer is cleared once the frame is handed to the page
    if (state.snapReq) { state.snapReq = false; takePhoto(camEye, fwd); }
    // how long this frame's own work took (the fps box shows it: if it is most
    // of the frame, the phone is short of processor, not of graphics)
    // recorded loops (owner's asset library; credits in the README): birds
    // and air outside the train, a car's cabin, music on the menu
    if (state.sound && sound.setLoop) {
      const A = `${window.DATA_BASE || "data/"}audio/amb/`;
      const inCar = !!(state.car && state.car.active);
      const out = !state.menu && !inCar && (state.follow || state.fly || state.tram || state.tour || (state.drone && state.drone.active));
      sound.setLoop("amb_out", A + "outdoors.m4a", out ? 0.5 * (1 - Math.min(1, (state.night || 0) * 0.7)) : 0);
      sound.setLoop("amb_car", A + "car.m4a", inCar && !state.menu ? 0.45 : 0);
      sound.setLoop("amb_menu", A + "menu.m4a", state.menu ? 0.5 : 0);
    }
    state.jsMs = (state.jsMs || 0) * 0.9 + (performance.now() - jsT0) * 0.1;
    state.frameN = (state.frameN || 0) + 1;
    if (!byHand) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // For tests in a hidden tab, where requestAnimationFrame never fires:
  // SIM.tick(t) runs one frame at timestamp t, SIM.step(n, ms) runs n frames
  // ms apart. Neither schedules another frame (tick used to be the frame
  // function itself, and every call queued one more loop for when the tab
  // came back).
  const tick = (t) => frame(t, true);
  const stepFrames = (n = 1, ms = 50) => { for (let i = 0; i < n; i++) frame(last + ms, true); };
  state.bootMs = Math.round(performance.now() - t0);
  // demAt and coverAt are exposed for the same reason tick is: when a thing
  // does not appear, the first question is always where the ground under it
  // is, and there is no other way to ask from outside.
  const multiRoute = new MultiRoute();
  multiRoute.register(lineLine, route);
  window.SIM = { tick, step: stepFrames, blastTrains, aiWrecks, solids, lakes: lakeLevels, kisvasut: () => kisvasut, trams: () => trams, demAt, vfx, carModels: () => carModels, railDistAt, res: RES, driver, route, state, data: routeData, stations: stn, PLANES, roadWays, city: () => city, carSurf, cityTiles: () => city,
                 demAt, coverAt, multiRoute,
                 unified: { frame: UNIFIED_FRAME, localToUnified, unifiedToLocal, geoToUnified, unifiedToGeo, offsets: LINE_OFFSETS },
                 traffic, playerTrain, sound, roadTraffic,
                 riverTraffic,
                 dyn: () => ({ trains: trainDyn.count, signals: sigDyn.count,
                               crossings: xingDyn.count, cars: carDyn.count,
                               vehicles: roadTraffic.vehicles.length,
                               ships: shipDyn.count,
                               ferries: riverTraffic.ferries.length }) };
}
