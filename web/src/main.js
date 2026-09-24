import * as S from "./shaders.js";
import { Sound } from "./audio.js";
import { drawPanel } from "./panel.js";
import { buildLandmarks, buildTrainsheds } from "./landmarks.js";
import { buildParts } from "./parts.js";
import { CityTiles } from "./city.js";
import { makeCar, stepCar, carGeometry } from "./car.js";
import { drawInstruments, buildCab } from "./cab.js";
import { CLOUD_TYPES } from "./clouds.js";
import { SITUATIONS, resolveWeather, weatherAt, stepFront, weatherPalette, weatherDecks,
         precipVelocity, windVector, compass, visibilityOf, fmtVis,
         PRECIP, pickSituation, queueFront } from "./weather.js";
import { compile, texFromImage, gridMesh, M4, norm, cross, add, scale, sub } from "./engine.js";
import { LAYERS, drawHud } from "./hud.js";
import { installInput } from "./input.js";
import { Route, Driver, KISS, STOCKS, LEVER_MAX } from "./route.js";
import { AirTraffic, makePlane, stepPlane, buildAircraft, PLANES } from "./aircraft.js";
import { buildPOIs, pickPOI, stepDirector } from "./tour.js";
import { sunPosition, sunVector, skyPalette, dateOfYear, seasonOf } from "./env.js";
import { buildTrack, buildCorridor, buildRoads, unpackBuildings, unpackRoads,
         unpackPolyBuildings, buildPolyBuildings, prepareUnderpasses, unpackRails, buildYardTracks,
         boxMesh, buildStations, boardAtlas, buildSignals, buildCrossings,
         buildPlatformPeople, buildPlatformLamps,
         buildBufferStops, roadSurfaceAt, underpassDip } from "./geom.js";
import { buildTrains } from "./trains.js";
import { buildCatenary, buildYardWires } from "./catenary.js";
import { unpackStructures, buildStructures } from "./structures.js";
import { Traffic, ASPECT, ASPECT_NAME, RoadTraffic, buildRoadTraffic,
         danubeLane, RiverTraffic, buildRiverTraffic } from "./traffic.js";
import { bindSettings } from "./settings.js";

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
  // Two 90-degree intersecting quads (X-cross billboard, 12 vertices total)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    // Plane 0 (angle theta)
    -1, 0, 0,   1, 0, 0,   1, 1, 0,  -1, 0, 0,   1, 1, 0,  -1, 1, 0,
    // Plane 1 (angle theta + 90 deg)
    -1, 0, 1,   1, 0, 1,   1, 1, 1,  -1, 0, 1,   1, 1, 1,  -1, 1, 1
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

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
  function demAt(wx, wy) {
    let u = wx / nearSpanX * texNear.w;
    let v = (1 - wy / nearSpanY) * texNear.h;
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
      let best = Infinity, y0 = NaN;
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        for (const i of grid.get((cx+dx) + "," + (cy+dy)) || []) {
          const p = D2[i];
          const d = Math.hypot(p[0]-x, p[1]-y);
          if (d < best) { best = d; y0 = p[2]; }
        }
      }
      return { d: best, railY: y0 };
    };
  })();
  // roads that pass under the line: their floor (geom.js prepareUnderpasses),
  // which the corridor digs its cutting to and the road and the cars use
  const underpasses = prepareUnderpasses(roadWays, (ctx.roads && ctx.roads.widths) ? ctx.roads.widths : [], demAt, railDistAt);
  const corridor = colouredVao(buildCorridor(routeData.track_down, demAt, coverAt, 1, routeData.bridges || [], underpasses));

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
  const trainDyn = dynamicVao(true);
  const airDyn = dynamicVao(true);
  const air = new AirTraffic(demAt);
  const xingDyn = dynamicVao();
  const carDyn = dynamicVao();
  const shipDyn = dynamicVao();
  const lampDyn = dynamicVao();      // the lit heads of the platform lamps

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
  gl.bufferData(gl.ARRAY_BUFFER, 3 * 4 * 600, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const cabCol = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cabCol);
  gl.bufferData(gl.ARRAY_BUFFER, 3 * 4 * 600, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const cabUv = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cabUv);
  gl.bufferData(gl.ARRAY_BUFFER, 2 * 4 * 600, gl.DYNAMIC_DRAW);
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

  const stn = buildStations(routeData.stops, routeData.track_down,
                            routeData.track_up, demAt, MAJOR);
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

  const roadData = buildRoads(roadWays, (ctx.roads && ctx.roads.widths) ? ctx.roads.widths : [], demAt,
                              (north) => wA + wB * north, railDistAt);
  const roadMesh = colouredVao(roadData);
  // vehicles drive on the surface the road was laid on
  const roadSurface = (x, y) => roadSurfaceAt(demAt, railDistAt, x, y);
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
  function setStreetLights(pr) {
    if (!pr.u.uSL) return;
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
  const polyList = (ctx.polys && ctx.polys.data)
    ? unpackPolyBuildings(ctx.polys.data, ctx.polys.count) : [];


  // hand-modelled buildings, placed by their own OSM footprints
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
  const railWays = (ctx.rails && ctx.rails.data) ? unpackRails(ctx.rails.data, ctx.rails.count) : [];
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
  const yardMesh = colouredVao(railWays.length
    ? buildYardTracks(railWays, demAt, railYAt)
    : { verts: new Float32Array(0), cols: new Float32Array(0), count: 0 });

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
    const run = buildCatenary(routeData.track_down, routeData.track_up, yardSpan);
    const yard = buildYardWires(railWays, railYAt);
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
  const stMesh = (ctx.structs && ctx.structs.data)
    ? buildStructures(unpackStructures(ctx.structs.data, ctx.structs.count), demAt)
    : { verts: new Float32Array(0), cols: new Float32Array(0), count: 0 };
  const structMesh = colouredVao(stMesh);
  const polyB = polyList.length
    ? buildPolyBuildings(polyList, demAt, shedIdx)
    : { verts: new Float32Array(0), cols: new Float32Array(0), count: 0, cells: [] };
  const polyMesh = colouredVao(polyB);
  // OSM 3D building parts: the Parliament, the Bazilika, the Opera … from the data
  const partsMesh = colouredVao(buildParts(ctx.parts, demAt));

  // ---- the city layer (city.js, tools/bake_city.py): 1 km tiles of the whole
  // of central Budapest, loaded around the camera. The line's own context
  // leaves the city box to them; its roads are listed by id so a tile does
  // not draw them twice.
  let city = null;
  const ctxRoadIds = new Set((ctx.roads && ctx.roads.ids) || []);
  try {
    const cityIndex = await fetch((window.DATA_BASE || "data/") + "city/index.json").then(r => r.ok ? r.json() : null);
    if (cityIndex) {
      const widths = cityIndex.widths;
      const waterAt = (north) => wA + wB * north;
      city = new CityTiles(cityIndex, assets.world.near, (T) => {
        const { body, tx, kx, ky } = T;
        const out = {};
        const polys = body.polys.count ? unpackPolyBuildings(body.polys.data, body.polys.count) : [];
        for (const p of polys) {
          [p.cx, p.cy] = tx(p.cx, p.cy);
          p.pts = p.pts.map(q => tx(q[0], q[1]));
        }
        if (polys.length) out.polys = colouredVao(buildPolyBuildings(polys, demAt, null));
        if (body.parts && body.parts.length) {
          const parts = body.parts.map(p => {
            const [x, y] = tx(p.x, p.y);
            return { ...p, x, y, p: p.p.map((v, i) => v * (i % 2 ? ky : kx)) };
          });
          out.parts = colouredVao(buildParts(parts, demAt));
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
            if (roadTraffic && roadTraffic.addWays) roadTraffic.addWays(keep);
            addDriveWays(keep);
          }
        }
        if (body.portals && body.portals.length) {
          const ps = body.portals.map(a => { const [x, y] = tx(a.x, a.y); return { ...a, x, y }; });
          out.lm = colouredVao(buildLandmarks(ps, demAt, waterAt, null));
        }
        return out;
      }, (m) => { freeVao(m.polys); freeVao(m.parts); freeVao(m.roads); freeVao(m.lm); });
    }
  } catch (e) { console.warn("city layer unavailable", e); }

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
  addDriveWays(roadWays);
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
  const depthRb = gl.createRenderbuffer();
  function sizeTarget(w, h) {
    gl.bindTexture(gl.TEXTURE_2D, colorTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, HDR_FMT, w, h, 0, gl.RGBA, HDR_TYPE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
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
    if (d) d.textContent = dateOfYear(state.day).hu;
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
      `<option value="${w.id}">${w.hu}</option>`).join("");
    wxSel.value = state.wxId;
  }
  if (cloudSel) {
    cloudSel.innerHTML = `<option value="">— a helyzet szerint —</option>` +
      CLOUD_TYPES.filter(c => c.id !== "clear").map(c =>
      `<option value="${c.id}">${c.code} · ${c.hu}</option>`).join("");
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
      ? `${PRECIP[w.precip.kind]} ${(w.precip.rate * 100) | 0}%` : "száraz";
    const pal = weatherPalette(skyPalette(sunPosition(state.day, state.hour).alt),
                               w, state.fog);
    let next = "";
    if (state.front) {
      const f = state.front, dir = f.speed >= 0 ? 1 : -1;
      const d = dir * (driver.m - f.km);            // metres until the edge reaches you
      const nx = SITUATIONS.find(s => s.id === f.newId);
      if (nx && d > -2600) {
        const closing = Math.abs(f.speed) + dir * (-(driver.v || 0) * (route.dir || 1));
        next = d > 2600 ? `<br><b>jön:</b> ${nx.hu} · ${(d / 1000).toFixed(0)} km` +
                          (closing > 0.5 ? ` · ~${Math.max(1, Math.round(d / closing / 60))} perc` : "")
                        : `<br><b>átvonul:</b> ${nx.hu}`;
      }
    }
    const txt =
      `<b>${w.sit.hu}</b> · ${w.tempC.toFixed(0)} °C<br>` +
      `${decks} · ${p}<br>` +
      `szél ${compass(w.wind.from)} ${w.wind.speed.toFixed(0)} m/s · ` +
      `látás ${fmtVis(visibilityOf(pal.fog))}` + next;
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
  const setBare = (on) => {
    state.bare = on;
    document.body.classList.toggle("bare", on);
  };
  const hideBtn = document.getElementById("hideHud");
  if (hideBtn) hideBtn.addEventListener("click", () => setBare(!state.bare));
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

  function fillStarts(dir) {
    const list = routeData.stops.slice().sort((a, b) => (a.km - b.km) * dir);
    selStart.innerHTML = list
      .map(s => `<option value="${s.km}">${s.name}</option>`).join("");
  }
  function toggleMenu(on) {
    if (on) {
      state.panel = false;
      document.getElementById("panel").style.display = "";
    }
    state.menu = on;
    menuEl.classList.toggle("on", on);
    state.paused = on;
  }
  function startRun(dir, startKm, scenario, env) {
    state.runDir = dir; state.runStart = startKm;
    state.scenario = scenario || "S70";
    // what you drive depends on what you are running
    const stk = state.scenario === "EC" ? STOCKS.EC
              : state.scenario === "Freight" ? STOCKS.FREIGHT
              : /^Z/.test(state.scenario) || state.scenario === "S72" || state.scenario === "S21" ? STOCKS.FLIRT : STOCKS.KISS;
    driver.s = stk;
    playerTrain.stock = stk.stock; playerTrain.cars = stk.cars; playerTrain.length = stk.lengthM;
    driver.lever = 0; driver.emergency = false; driver.bcp = 0; driver.edb = 0;
    
    sound.playSample("mav-szignal", 0.8);

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
    playerTrain.svc.pattern = state.scenario === "EC" || state.scenario === "Freight" ? "none" : 
                              state.scenario === "G70" ? "fast" : "all";
    traffic.trains.length = 0; traffic.trains.push(playerTrain);
    traffic.seekTo(state.hour * 3600);
    // the player takes the next booked path in their direction
    const path = (assets.timetable.services || []).find(
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
    state.followIdx = -1; state.yaw = 0; state.pitch = -0.02; state.zoom = 1;
    
    // Gamification state
    state.score = 0;
    state.messages = [];
    state.playedMavSignal = true; // Mark as played for this run
    state.last99SignalStation = null;
    state.overspeedPenaltyTimer = 0;
    state.gamificationActive = true;
    
    // Play the starting signal
    if (sound.ctx) sound.playSample('szignal_mav');
    
    toggleMenu(false);
  }
  selDir.addEventListener("change", () => fillStarts(+selDir.value));
  document.getElementById("mClose").addEventListener("click", () => toggleMenu(false));
  // the panel folds down to its title; remembered per browser
  {
    const pnl = document.getElementById("panel"), fb = document.getElementById("foldBtn");
    const setFold = f => { pnl.classList.toggle("folded", f); fb.textContent = f ? "▸" : "▾";
                           try { localStorage.setItem("szobPanelFolded", f ? "1" : ""); } catch (e) {} };
    let f0 = false; try { f0 = localStorage.getItem("szobPanelFolded") === "1"; } catch (e) {}
    setFold(f0);
    fb.addEventListener("click", e => { e.stopPropagation(); setFold(!pnl.classList.contains("folded")); });
    const lineId = new URLSearchParams(location.search).get("line") || "line70";
    const t = document.getElementById("panelTitle"), bt = document.getElementById("buildTag");
    if (lineId === "line2") { t.textContent = "Esztergom felé"; bt.textContent = "MÁV 2 · Nyugati – Pilis – Esztergom"; }
    else if (lineId === "line71") { t.textContent = "Veresegyház felé"; bt.textContent = "MÁV 71"; }
    else if (lineId === "s21") { t.textContent = "Lajosmizse felé"; bt.textContent = "S21 · Nyugati – Kőbánya-Kispest – Lajosmizse"; }
    else bt.textContent = "MÁV 70 · Nyugati – Vác – Szob";
  }
  fillStarts(1);
  outHour.textContent = fmtTime(+inpHour.value);
  state.runDir = 1; state.runStart = null;
  toggleMenu(true);

  installInput({ cv, hud, panelCanvas, keys, route, routeData, driver,
                 traffic, roadTraffic, riverTraffic, playerTrain, sound, startRun, toggleMenu });

  // ---- loop
  let last = performance.now(), fps = 60, acc = 0;
  function frame(now) {
    // Clamped at zero as well as at the top: a timestamp that goes backwards
    // — a clock adjustment, a tab resuming, a hand-driven tick — would give a
    // negative dt and run the entire simulation in reverse, train, clock,
    // weather and all.
    const dtReal = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    fps += ((1 / Math.max(dtReal, 1e-4)) - fps) * 0.05;
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
      for (let k = 0; k < sub; k++) {
        driver.step(dt / sub);
        playerTrain.m = driver.m; playerTrain.v = driver.v;
        traffic.step(dt / sub, state.hour * 3600, playerTrain);
      }
      playerTrain.aspect = traffic.aspectFor(playerTrain);
      // the automatic driver obeys a red: it did not look at signals at all
      {
        const ds = traffic.distanceToSignal(playerTrain);
        driver.signalStop = playerTrain.aspect === ASPECT.STOP && ds < 3000 ? driver.m + route.dir * ds : null;
      }

      // Gamification & Audio Logic
      if (state.gamificationActive) {
        const lim = route.limitAt(driver.m);
        const kmh = driver.v * 3.6;
        
        if (kmh > lim + 2) {
          state.overspeedPenaltyTimer += dt;
          if (state.overspeedPenaltyTimer > 2.0) {
            state.score -= 10;
            state.messages.push({ text: "-10 Túl gyorshajtás (Overspeeding)", t: 3.0 });
            state.overspeedPenaltyTimer = 0;
          }
        } else {
          state.overspeedPenaltyTimer = 0;
        }

        const nextStop = route.nextStop(driver.m);
        if (nextStop) {
          const dist = (nextStop.km * 1000 - driver.m) * route.dir;
          // Play 99 signal 1.5km before stop
          if (dist > 0 && dist < 1500 && state.last99SignalStation !== nextStop.name) {
            state.last99SignalStation = nextStop.name;
            if (sound.ctx) sound.playSample('szignal_99');
          }
          
          // Score stopping precision
          if (driver.dwell > 0 && driver.v < 0.1 && !state.scoredStop) {
            state.scoredStop = true;
            if (Math.abs(dist) < 5) {
              state.score += 500;
              state.messages.push({ text: "+500 Tökéletes megállás! (Perfect Stop)", t: 5.0 });
            } else if (Math.abs(dist) < 20) {
              state.score += 100;
              state.messages.push({ text: "+100 Jó megállás (Good Stop)", t: 5.0 });
            } else {
              state.score -= 50;
              state.messages.push({ text: "-50 Pontatlan megállás (Poor Stop)", t: 5.0 });
            }
          } else if (driver.v > 1) {
            state.scoredStop = false;
          }
        }
        
        // Red signal violation
        if (playerTrain.aspect === 0 && traffic.distanceToSignal(playerTrain) < 5 && driver.v > 1 && !state.scoredRedSignal) {
           state.scoredRedSignal = true;
           state.score -= 1000;
           state.messages.push({ text: "-1000 Tilos jelzés meghaladása! (SPAD)", t: 8.0 });
        } else if (playerTrain.aspect !== 0) {
           state.scoredRedSignal = false;
        }
        
        // Fade messages
        for (let i = state.messages.length - 1; i >= 0; i--) {
          state.messages[i].t -= dtReal;
          if (state.messages[i].t <= 0) state.messages.splice(i, 1);
        }
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
          roadTraffic.populate(c0[0], c0[1], Math.max(1200, (state.carReach || 0) + 300));
          roadRepop = 1.5;
        }
        roadTraffic.step(Math.min(dt, 0.4), closed);
        riverTraffic.step(Math.min(dt, 2.0));
      }
      if (driver.terminated && driver.layover <= 0) {
        // Show End Modal instead of automatic restart!
        state.paused = true;
        const endModal = document.getElementById("endModal");
        if (endModal && endModal.style.display === "none") {
          endModal.style.display = "block";
          document.getElementById("endPax").textContent = driver.pax || 0;
          
          let acc = 100;
          if (state.totalStations && state.totalStations > 0) {
             acc = Math.round((state.onTimeStations / state.totalStations) * 100);
          }
          document.getElementById("endTimeAcc").textContent = acc + "%";
          document.getElementById("endPenalties").textContent = state.penalties || 0;
          document.getElementById("endScore").textContent = state.score || 0;
          
          document.getElementById("endRestart").onclick = () => {
            endModal.style.display = "none";
            state.paused = false;
            const here = route.stops[route.stops.length - 1];
            startRun(-route.dir, here ? here.km : null);
          };
          document.getElementById("endMenu").onclick = () => {
            endModal.style.display = "none";
            document.getElementById("menu").style.display = "block";
            state.paused = true;
          };
        }
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
          
          if (!state.totalStations) { state.totalStations = 0; state.onTimeStations = 0; }
          state.totalStations++;
          if (lateSeconds < 120) {
             state.onTimeStations++;
             state.score += 200;
          } else if (lateSeconds < 300) {
             state.score += 50;
          } else {
             state.score -= Math.floor(lateSeconds/60)*10;
          }
          
          state.pathIdx++;
        }
      }
      state.hour += dt / 3600;
      const ts = document.getElementById("timeSlider");
      if (ts) ts.value = ((state.hour % 24) + 24) % 24;
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
      state.follow = true;
      state.cab = false;
      state.fly = false;
      if (state.drone) state.drone.active = false;
      state.yaw += Math.sin(state.t * 0.2) * dtReal * 0.3; // Drone panning
      state.pitch = Math.max(-0.6, Math.min(0.2, state.pitch + Math.cos(state.t * 0.15) * dtReal * 0.16)); // Drone tilt
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
                   && state.followShipIdx < 0;
    if (seated) {
      const ps = state.passenger;
      const carLen = 25.0;
      const mc = driver.m - route.dir * (carLen * ps.car + carLen * 0.5 + 1.5);
      const c = route.at(mc), t2 = route.tangent(mc);
      const tx = t2[0] * route.dir, ty = t2[1] * route.dir;
      const rx = ty, ry = -tx;                      // right of travel, east/north
      const off = ps.side * 0.72;
      eye = [c[0] + rx * off, c[2] + 3.15, -(c[1] + ry * off)];   // upper-deck window height
    }
    const fwdBase = [tan[0] * subjDir, 0, -tan[1] * subjDir];
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    let fwd = state.fly
      ? norm([Math.sin(state.yaw), state.pitch, -Math.cos(state.yaw)])
      : norm([fwdBase[0]*cy - fwdBase[2]*sy, state.pitch,
              fwdBase[0]*sy + fwdBase[2]*cy]);
    let camEye = eye;
    // Zoom is two different things and only one of them was implemented. In
    // the cab it can only be the lens — you cannot lean out of the window —
    // and narrowing the field of view is right there. From outside it should
    // be the camera moving: a long lens flattens everything and reads as a
    // telescope rather than as getting closer, which is what Mark noticed.
    // So outside, the lens stays put and the stand-off shrinks instead.
    const flying = !!(state.plane && state.plane.active) || !!(state.car && state.car.active);
    const isSpecialView = state.fly || state.follow || flying || (state.drone && state.drone.active) || state.followCarIdx >= 0 || state.followShipIdx >= 0;
    const lensZoom = isSpecialView ? 1 : state.zoom;
    const dolly = isSpecialView ? state.zoom : 1;

    // ---- your own car (car.js): chase camera, or the driver's seat on C
    if (state.car && state.car.active) {
      const car = state.car;
      if (!state.paused) stepCar(car, keys, dtReal, (x, y) => carSurf(x, y, car.y));
      const fx = Math.sin(car.yaw), fz = -Math.cos(car.yaw);
      if (car.cockpit) {
        camEye = [car.x + fx * 0.2 - fz * 0.35, car.y + 1.25, -car.n + fz * 0.2 + fx * 0.35];
        const yawL = car.yaw + (state.yaw || 0) * 0.0;
        fwd = norm([Math.sin(yawL), (state.pitch || 0) - 0.05 + Math.sin(car.pitch), -Math.cos(yawL)]);
      } else {
        const back = 8.5 / Math.max(0.4, state.zoom || 1);
        camEye = [car.x - fx * back, car.y + back * 0.34 + 1.2, -car.n - fz * back];
        const gy = demAt(camEye[0], -camEye[2]);
        if (isFinite(gy) && camEye[1] < gy + 1.2) camEye[1] = gy + 1.2;
        fwd = norm(sub([car.x + fx * 6, car.y + 1.0, -car.n + fz * 6], camEye));
      }
    }
    // ---- your own plane (aircraft.js): chase camera, or the cockpit on C
    else if (state.plane && state.plane.active) {
      const pl = state.plane;
      const nose = stepPlane(pl, keys, dtReal, demAt);
      if (pl.cockpit) {
        camEye = [pl.p[0] + nose[0] * 1.6, pl.p[1] + 0.55, pl.p[2] + nose[2] * 1.6];
        fwd = norm([nose[0], nose[1] + (state.pitch || 0), nose[2]]);
      } else {
        const back = 20 / Math.max(0.4, state.zoom || 1);
        const hz = Math.hypot(nose[0], nose[2]) || 1;
        camEye = [pl.p[0] - nose[0] / hz * back, pl.p[1] + back * 0.28, pl.p[2] - nose[2] / hz * back];
        fwd = norm(sub(add(pl.p, scale(nose, 25)), camEye));
      }
    }
    // ---- FPV Drone Flight Simulator Mode
    else if (state.drone && state.drone.active) {
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

      const gH = demAt(dr.p[0], -dr.p[2]);
      if (isFinite(gH) && dr.p[1] < gH + 1.6) {
        dr.p[1] = gH + 1.6;
        if (dr.v[1] < 0) dr.v[1] = 0;
      }

      camEye = [dr.p[0], dr.p[1], dr.p[2]];
      fwd = norm([syD * cpD, -spD, -cyD * cpD]);
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
      camEye = add(eye, add(scale(fwd, -back), [0, (22 + len * 0.05) / dolly, 0]));
    }
    state.camXZ = [camEye[0], -camEye[2]];
    if (city) city.update(camEye[0], -camEye[2]);
    state.camY = camEye[1];
    const at = add(camEye, fwd);
    const view = M4.lookAt(camEye, at, [0, 1, 0]);
    // inside a carriage the walls are half a metre away, inside the usual
    // 1.2 m near plane
    const proj = M4.perspective(state.fov / lensZoom * Math.PI / 180,
                                RES.w / RES.h, seated ? 0.12 : 1.2, 62000);
    const vp = M4.mul(proj, view);
    const invVP = M4.invert(vp);

    const insideTrain = !state.follow && state.followIdx < 0 && state.followCarIdx < 0 && state.followShipIdx < 0 && !(state.drone && state.drone.active) && !state.fly && !flying;
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
      upload(airDyn, buildAircraft(air, state.plane, state.car && state.car.active ? state.car : null));
      upload(trainDyn, buildTrains(traffic, routeData.track_down,
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
      upload(carDyn, state.show.roads
        ? buildRoadTraffic(roadTraffic, camEye[0], -camEye[2], demAt,
                           state.night || 0, reach, roadSurface)
        : { verts: new Float32Array(0), cols: new Float32Array(0), count: 0 });
      // people on the platforms; rebuilt rarely, since only the hour matters
      if (!state.pplHour || Math.abs(state.pplHour - state.hour) > 0.25) {
        state.pplHour = state.hour;
        upload(peopleDyn, buildPlatformPeople(routeData.stops, routeData.track_down,
               routeData.track_up, demAt, state.hour, MAJOR,
               !!(state.wx && state.wx.precip.kind && state.wx.precip.rate > 0.1)));
      }
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
          .sort((a, b) => a[1] - b[1]).slice(0, 48);
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
      gl.bindVertexArray(corridor.vao);
      gl.drawArrays(gl.TRIANGLES, 0, corridor.count);
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
      for (const d of [trainDyn, airDyn, sigDyn, xingDyn, carDyn, shipDyn, peopleDyn, lampDyn]) {
        if (!d.count) continue;
        if (pTrk.u.uPull) gl.uniform1f(pTrk.u.uPull, d === carDyn || d === peopleDyn ? 0.003 : 0.0);
        gl.bindVertexArray(d.vao);
        gl.drawArrays(gl.TRIANGLES, 0, d.count);
      }
      if (pTrk.u.uPull) gl.uniform1f(pTrk.u.uPull, 0.0);
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
          for (const k of ["polys", "parts", "lm"]) if (m[k] && m[k].count) {
            gl.bindVertexArray(m[k].vao); gl.drawArrays(gl.TRIANGLES, 0, m[k].count);
          }
        });
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
      gl.useProgram(pVeg.p);
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
      for (const [spacing, side, maxd] of [[16, 150, 1300], [46, 120, 4200]]) {
        const ox = Math.round(camEye[0] / spacing) * spacing;
        const oz = Math.round(camEye[2] / spacing) * spacing;
        gl.uniform2f(pVeg.u.uOrigin, ox, oz);
        gl.uniform1f(pVeg.u.uSpacing, spacing);
        gl.uniform1i(pVeg.u.uSide, side);
        gl.uniform1f(pVeg.u.uMaxDist, maxd);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 12, side * side);
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

    // the cab, riding with the train
    if (inCab) {
      const railPt = route.at(driver.m);
      const railTan = route.tangent(driver.m);
      const f = [railTan[0] * route.dir, 0, -railTan[1] * route.dir];
      const rgt = norm(cross(f, [0, 1, 0]));
      const eyeC = [railPt[0], railPt[2] + 3.1, -railPt[1]];
      const mesh = buildCab(eyeC, f, rgt, [0, 1, 0]);
      cabCount = mesh.count;
      gl.bindVertexArray(cabVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, cabPos);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.verts);
      gl.bindBuffer(gl.ARRAY_BUFFER, cabCol);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.cols);
      gl.bindBuffer(gl.ARRAY_BUFFER, cabUv);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.uvs);

      const nextS = route.nextStop(driver.m);
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
    gl.drawArrays(gl.TRIANGLES, 0, 3);

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
      const hit = { route, traffic, driver, clockSec: state.hour * 3600,
                    view: state.panelView, lateness: state.lateness };
      drawPanel(hx, hud, hit);
      state.hit = hit;
    } else {
      drawHud(hx, hud, { route, driver, vp, camEye, pal, sp, fps, traffic, playerTrain, fwd, state, inCab },
              { imgMap, routeData, mapMeta });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // `tick` lets the simulation be stepped without waiting on the frame
  // callback, which a browser throttles to nothing in a hidden tab. It is
  // for testing; nothing in the running game calls it.
  state.bootMs = Math.round(performance.now() - t0);
  // demAt and coverAt are exposed for the same reason tick is: when a thing
  // does not appear, the first question is always where the ground under it
  // is, and there is no other way to ask from outside.
  window.SIM = { driver, route, state, data: routeData, stations: stn, PLANES, roadWays, city: () => city, carSurf, cityTiles: () => city,
                 demAt, coverAt,
                 traffic, playerTrain, sound, tick: frame, roadTraffic,
                 riverTraffic,
                 dyn: () => ({ trains: trainDyn.count, signals: sigDyn.count,
                               crossings: xingDyn.count, cars: carDyn.count,
                               vehicles: roadTraffic.vehicles.length,
                               ships: shipDyn.count,
                               ferries: riverTraffic.ferries.length }) };
}
