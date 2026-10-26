#!/usr/bin/env node
/**
 * Picture tests (visual regression harness) for Dunakanyar Szimulátor.
 * 
 * Renders fixed camera spots across Line 70, Line 2, Line S21, and Budapest
 * using headless Chrome with WebGL2, comparing pixel buffers against baselines.
 * 
 * Usage:
 *   node tools/picture_tests.mjs --record           # record/update baseline pictures
 *   node tools/picture_tests.mjs                    # compare all spots against baseline
 *   node tools/picture_tests.mjs --spot=l70_nyugati # run a single spot
 *   node tools/picture_tests.mjs --list             # list all defined spots
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const PICS_DIR = path.join(ROOT_DIR, "tests", "fixtures", "pictures");

// Ensure pictures directory exists
fs.mkdirSync(PICS_DIR, { recursive: true });

const SPOTS = [
  // --- Line 70 (Nyugati - Vác - Szob) ---
  {
    id: "l70_nyugati_hall",
    line: "line70",
    desc: "Line 70 km 0.05: Nyugati trainshed hall buffer stops & platform",
    setup: { m: 50, eyeH: 2.2, eyeSide: 5, targetM: 250, targetH: 8 }
  },
  {
    id: "l70_nyugati_throat",
    line: "line70",
    desc: "Line 70 km 0.55: Ferdinánd híd over throat looking at WestEnd & hall",
    setup: { m: 550, eyeH: 18, eyeSide: 0, targetM: 100, targetH: 4 }
  },
  {
    id: "l70_rakosrendezo",
    line: "line70",
    desc: "Line 70 km 2.9: Rákosrendező junction & sidings",
    setup: { m: 2900, eyeH: 14, eyeSide: -15, targetM: 3200, targetH: 3 }
  },
  {
    id: "l70_ujpest_station",
    line: "line70",
    desc: "Line 70 km 7.8: Rákospalota-Újpest station platforms & canopy",
    setup: { m: 7750, eyeH: 4.5, eyeSide: 8, targetM: 7850, targetH: 3 }
  },
  {
    id: "l70_dunakeszi_jarmu",
    line: "line70",
    desc: "Line 70 km 16.5: Dunakeszi Járműjavító halls & tracks",
    setup: { m: 16500, eyeH: 12, eyeSide: -25, targetM: 16750, targetH: 4 }
  },
  {
    id: "l70_god_samsung",
    line: "line70",
    desc: "Line 70 km 23.5: Göd industrial plant & line",
    setup: { m: 23500, eyeH: 10, eyeSide: 20, targetM: 23800, targetH: 3 }
  },
  {
    id: "l70_vac_station",
    line: "line70",
    desc: "Line 70 km 33.3: Vác station platforms, catenary & canopy",
    setup: { m: 33200, eyeH: 5, eyeSide: 7, targetM: 33400, targetH: 3 }
  },
  {
    id: "l70_vac_cementgyar",
    line: "line70",
    desc: "Line 70 km 39.2: Váci cementgyár chimney, silos & quarry",
    setup: { m: 39100, eyeH: 18, eyeSide: -35, targetM: 39500, targetH: 25 }
  },
  {
    id: "l70_dunakanyar_bend",
    line: "line70",
    desc: "Line 70 km 51.5: Danube Bend panorama looking at Visegrád",
    setup: { m: 51500, eyeH: 15, eyeSide: -30, targetM: 52200, targetH: 10 }
  },
  {
    id: "l70_szob_terminus",
    line: "line70",
    desc: "Line 70 km 62.8: Szob station & line end",
    setup: { m: 62650, eyeH: 6, eyeSide: 10, targetM: 62850, targetH: 3 }
  },

  // --- Line 2 (Nyugati - Pilis - Esztergom) ---
  {
    id: "l2_eszaki_hid",
    line: "line2",
    desc: "Line 2 km 8.8: Északi összekötő vasúti híd Danube crossing",
    setup: { m: 8750, eyeH: 12, eyeSide: -15, targetM: 9200, targetH: 6 }
  },
  {
    id: "l2_aquincum_walls",
    line: "line2",
    desc: "Line 2 km 10.1: Aquincum station, walls & graffiti",
    setup: { m: 10050, eyeH: 4.5, eyeSide: 8, targetM: 10200, targetH: 3 }
  },
  {
    id: "l2_obuda_station",
    line: "line2",
    desc: "Line 2 km 11.3: Óbuda station & sidings",
    setup: { m: 11200, eyeH: 6, eyeSide: -12, targetM: 11400, targetH: 3 }
  },
  {
    id: "l2_kopar_tunnel",
    line: "line2",
    desc: "Line 2 km 27.5: Kopár-hágói vasúti alagút portal & cutting",
    setup: { m: 27500, eyeH: 7, eyeSide: -6, targetM: 27650, targetH: 3 }
  },
  {
    id: "l2_pazmaneum_stop",
    line: "line2",
    desc: "Line 2 km 28.9: Pázmáneum university halt",
    setup: { m: 28900, eyeH: 4.5, eyeSide: 6, targetM: 29050, targetH: 3 }
  },
  {
    id: "l2_piliscsaba",
    line: "line2",
    desc: "Line 2 km 31.7: Piliscsaba station in the hills",
    setup: { m: 31650, eyeH: 5, eyeSide: 8, targetM: 31850, targetH: 3 }
  },
  {
    id: "l2_piliscsév_horses",
    line: "line2",
    desc: "Line 2 km 38.3: Piliscsév landscape & horse paddocks",
    setup: { m: 38250, eyeH: 10, eyeSide: 25, targetM: 38550, targetH: 4 }
  },
  {
    id: "l2_dorog_works",
    line: "line2",
    desc: "Line 2 km 45.4: Dorog station, industrial works & lake",
    setup: { m: 45250, eyeH: 14, eyeSide: -20, targetM: 45600, targetH: 6 }
  },
  {
    id: "l2_esztergom_terminus",
    line: "line2",
    desc: "Line 2 km 52.8: Esztergom station & Bazilika vista",
    setup: { m: 52650, eyeH: 8, eyeSide: 12, targetM: 52950, targetH: 15 }
  },

  // --- Line S21 (Nyugati - Lajosmizse) ---
  {
    id: "s21_zuglo_bank",
    line: "s21",
    desc: "S21 km 4.1: Zugló station raised embankment over Thököly út",
    setup: { m: 4050, eyeH: 8, eyeSide: -15, targetM: 4250, targetH: 4 }
  },
  {
    id: "s21_kobanya_also",
    line: "s21",
    desc: "S21 km 7.9: Kőbánya alsó elevated station over the road",
    setup: { m: 7800, eyeH: 8, eyeSide: 12, targetM: 8000, targetH: 4 }
  },
  {
    id: "s21_koki_terminal",
    line: "s21",
    desc: "S21 km 10.7: Kőbánya-Kispest terminal & M3 yard tracks",
    setup: { m: 10650, eyeH: 12, eyeSide: -20, targetM: 10950, targetH: 4 }
  },
  {
    id: "s21_kispest_island",
    line: "s21",
    desc: "S21 km 13.2: Kispest narrow island platform & footbridge",
    setup: { m: 13100, eyeH: 5, eyeSide: 7, targetM: 13300, targetH: 4 }
  },
  {
    id: "s21_airport_cutting",
    line: "s21",
    desc: "S21 km 11.5: Airport road overpass bridge & railway cutting",
    setup: { m: 11450, eyeH: 6, eyeSide: -10, targetM: 11650, targetH: 3 }
  },
  {
    id: "s21_ocsa_plain",
    line: "s21",
    desc: "S21 km 31.9: Ócsa station on the great plain",
    setup: { m: 31750, eyeH: 7, eyeSide: 10, targetM: 32050, targetH: 3 }
  },
  {
    id: "s21_dabas",
    line: "s21",
    desc: "S21 km 47.5: Dabas rural railway halt",
    setup: { m: 47400, eyeH: 6, eyeSide: 8, targetM: 47650, targetH: 3 }
  },
  {
    id: "s21_lajosmizse",
    line: "s21",
    desc: "S21 km 72.8: Lajosmizse southern terminus",
    setup: { m: 72700, eyeH: 6, eyeSide: 10, targetM: 72950, targetH: 3 }
  },

  // --- City, Landmarks & Atmosphere ---
  {
    id: "city_parliament",
    line: "line70",
    desc: "Budapest: Parliament across the Danube from the Batthyány tér bank",
    // (it used to stand 1.1 km south looking up the river, and showed water)
    coords: { eye: [20121, 122, -5416], target: [20490, 130, -5633] }
  },
  {
    id: "city_margitsziget",
    line: "line70",
    desc: "Budapest: Margaret Island aerial view (dry & green)",
    coords: { eye: [20900, 260, -7600], target: [20850, 100, -6800] }
  }
];

// CLI arguments
const args = process.argv.slice(2);
const isRecord = args.includes("--record");
const isList = args.includes("--list");
const spotFilter = args.find(a => a.startsWith("--spot="))?.split("=")[1];

if (isList) {
  console.log(`Defined ${SPOTS.length} visual regression camera spots:`);
  for (const s of SPOTS) {
    console.log(`  [${s.id}] (${s.line}) ${s.desc}`);
  }
  process.exit(0);
}

const activeSpots = spotFilter ? SPOTS.filter(s => s.id === spotFilter) : SPOTS;
if (!activeSpots.length) {
  console.error(`Error: No spot matched filter "${spotFilter}"`);
  process.exit(1);
}

// ---------------------------------------------------------------- HTTP Server
const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split("?")[0]);
  if (reqPath === "/" || reqPath === "") reqPath = "/szob-fele.html";
  const filePath = path.join(DIST_DIR, reqPath);
  
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found: " + reqPath);
    return;
  }
  
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".webp": "image/webp",
    ".bin": "application/octet-stream",
    ".m4a": "audio/mp4",
    ".css": "text/css"
  };
  
  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
});

// Perceptual raw pixel comparison on 320x180 RGBA buffers
function compareRawBuffers(bufA, bufB) {
  if (bufA.length !== bufB.length) return 1.0;
  let diffs = 0;
  const pixels = bufA.length / 4;
  for (let i = 0; i < bufA.length; i += 4) {
    const dr = Math.abs(bufA[i] - bufB[i]);
    const dg = Math.abs(bufA[i+1] - bufB[i+1]);
    const db = Math.abs(bufA[i+2] - bufB[i+2]);
    if (dr + dg + db > 30) diffs++;
  }
  return diffs / pixels;
}

const HTTP_PORT = 8185;
const CDP_PORT = 9225;

server.listen(HTTP_PORT, async () => {
  const userDataDir = path.join(os.tmpdir(), "chrome-picture-tests");
  const chromeArgs = [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    "--use-gl=angle",
    "--use-angle=metal",
    "--window-size=1280,720",
    "--disable-web-security"
  ];
  
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", chromeArgs);
  chrome.stderr.on("data", d => {
    const s = d.toString();
    if (!s.includes("cv_display_link_mac") && !s.includes("PHONE_REGISTRATION_ERROR")) {
      process.stderr.write(s);
    }
  });
  
  let version = null;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      version = await res.json();
      break;
    } catch (e) {}
  }
  
  if (!version) {
    console.error("Failed to connect to headless Chrome CDP");
    chrome.kill();
    server.close();
    process.exit(1);
  }

  // Group spots by line to minimize page reloads
  const byLine = new Map();
  for (const s of activeSpots) {
    if (!byLine.has(s.line)) byLine.set(s.line, []);
    byLine.get(s.line).push(s);
  }

  let totalPassed = 0, totalFailed = 0;

  for (const [lineId, spots] of byLine.entries()) {
    const lineParam = lineId === "line70" ? "" : `?line=${lineId}`;
    const targetUrl = `http://127.0.0.1:${HTTP_PORT}/szob-fele.html${lineParam}`;
    
    // Create new tab
    const tabRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${targetUrl}`, { method: "PUT" });
    const tab = await tabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    
    let msgId = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
    
    await new Promise(r => ws.onopen = r);
    await send("Page.enable");
    await send("Runtime.enable");
    
    // Wait for boot
    let booted = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 400));
      const res = await send("Runtime.evaluate", {
        expression: "Boolean(window.SIM && window.SIM.state && window.SIM.state.bootMs)"
      });
      if (res?.result?.value) { booted = true; break; }
    }
    
    if (!booted) {
      console.error(`Failed to boot line ${lineId}`);
      ws.close();
      continue;
    }

    // Prepare simulation: hide overlays and UI
    await send("Runtime.evaluate", {
      expression: `(() => {
        if (window.__loadDone) window.__loadDone();
        for (const id of ["loader", "menu", "intro", "panel", "modebar", "hud", "moreSheet", "darkPanel", "tramBar", "photoToast"]) {
          const el = document.getElementById(id);
          if (el) el.style.display = "none";
        }
        SIM.state.menu = false;
        SIM.state.paused = true;
        SIM.state.front = null;
        SIM.state.wxChanging = false;
        SIM.state.wxId = "derult";
        SIM.state.wxInt = 1.0;
        SIM.state.day = 200;
        SIM.state.hour = 12.0;
        const wxSel = document.getElementById("wxSit");
        if (wxSel) {
          wxSel.value = "derult";
          wxSel.dispatchEvent(new Event("change"));
        }
        SIM.state.front = null;
        if (window.__syncWx) window.__syncWx(true);
        if (SIM.traffic) SIM.traffic.seekTo(12.0 * 3600);
      })()`
    });

    // Capture each spot on this line
    for (const spot of spots) {
      const posCode = spot.coords
        ? `(() => {
            const Eye = [${spot.coords.eye.join(",")}];
            const Target = [${spot.coords.target.join(",")}];
            SIM.state.camMode = "fly";
            SIM.state.fly = { p: Eye, speed: 0 };
            const dx = Target[0] - Eye[0], dz = Target[2] - Eye[2];
            SIM.state.yaw = Math.atan2(dx, -dz);
            SIM.state.pitch = (Target[1] - Eye[1]) / Math.max(1, Math.hypot(dx, dz));
          })()`
        : `(() => {
            const pE = SIM.route.at(${spot.setup.m});
            const pT = SIM.route.at(${spot.setup.targetM});
            const Eye = [pE[0] + ${spot.setup.eyeSide || 0}, pE[2] + ${spot.setup.eyeH || 8}, -pE[1]];
            const Target = [pT[0], pT[2] + ${spot.setup.targetH || 3}, -pT[1]];
            SIM.state.camMode = "fly";
            SIM.state.fly = { p: Eye, speed: 0 };
            const dx = Target[0] - Eye[0], dz = Target[2] - Eye[2];
            SIM.state.yaw = Math.atan2(dx, -dz);
            SIM.state.pitch = (Target[1] - Eye[1]) / Math.max(1, Math.hypot(dx, dz));
          })()`;

      await send("Runtime.evaluate", { expression: posCode });
      // Wait for the Budapest tiles round the camera: they are fetched three
      // at a time and built a few per frame, and a shot taken before they
      // are all in draws a different city every run.
      for (let i = 0; i < 80; i++) {
        const r = await send("Runtime.evaluate", {
          expression: `(() => {
            SIM.step(2, 50);
            const c = SIM.cityTiles && SIM.cityTiles();
            if (!c) return true;
            const x = SIM.state.fly.p[0], y = -SIM.state.fly.p[2];
            return !c.pending.size && !c.queue.length &&
              !c.tiles.some(t => Math.hypot(t.cx - x, t.cy - y) < c.R && !c.loaded.has(t.file));
          })()`
        });
        if (r?.result?.value) break;
        await new Promise(r => setTimeout(r, 150));
      }
      // Settle lod & meshes, then read pixels synchronously from WebGL framebuffer.
      // The frames run at fixed timestamps (SIM.tick), not SIM.step's
      // last-frame-plus-50 ms: the water's waves and glints run on the frame
      // time, and on the wall clock they never matched between runs.
      const rawRes = await send("Runtime.evaluate", {
        expression: `(() => {
          SIM.state.front = null;
          SIM.state.hour = 12.0;
          if (SIM.traffic) SIM.traffic.seekTo(12.0 * 3600);
          for (let i = 0; i < 12; i++) SIM.tick(100000 + i * 50);
          const cv = document.getElementById("gl");
          const gl = cv.getContext("webgl2");
          const W = cv.width, H = cv.height;
          const full = new Uint8Array(W * H * 4);
          gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, full);
          // Downsample to 320x180
          const tw = 320, th = 180;
          const thumb = new Uint8Array(tw * th * 4);
          for (let ty = 0; ty < th; ty++) {
            const sy = Math.floor(ty * H / th);
            for (let tx = 0; tx < tw; tx++) {
              const sx = Math.floor(tx * W / tw);
              const srcI = (sy * W + sx) * 4;
              const dstI = (ty * tw + tx) * 4;
              thumb[dstI] = full[srcI];
              thumb[dstI + 1] = full[srcI + 1];
              thumb[dstI + 2] = full[srcI + 2];
              thumb[dstI + 3] = 255;
            }
          }
          let bin = "";
          for (let i = 0; i < thumb.length; i += 8192) {
            bin += String.fromCharCode.apply(null, thumb.subarray(i, Math.min(i + 8192, thumb.length)));
          }
          return btoa(bin);
        })()`
      });
      const rawBuf = Buffer.from(rawRes.result.value, "base64");
      const shot = await send("Page.captureScreenshot", { format: "png" });
      const imgBuf = Buffer.from(shot.data, "base64");
      const refPath = path.join(PICS_DIR, `${spot.id}.png`);
      const rawPath = path.join(PICS_DIR, `${spot.id}.raw`);

      if (isRecord) {
        fs.writeFileSync(refPath, imgBuf);
        fs.writeFileSync(rawPath, rawBuf);
        console.log(`  [RECORD] ${spot.id} -> ${refPath} (${(imgBuf.length / 1024).toFixed(0)} KB)`);
        totalPassed++;
      } else {
        if (!fs.existsSync(rawPath)) {
          console.log(`  MISSING  ${spot.id} (no baseline; run with --record to create)`);
          totalFailed++;
        } else {
          const baselineRaw = fs.readFileSync(rawPath);
          const diff = compareRawBuffers(rawBuf, baselineRaw);
          // 2.5% everywhere: the city spots had 6% for the river's moving
          // glints, which the fixed frame times above now hold still
          // (Parliament 7-11% -> 1.3%, Margitsziget 4-5% -> 1.0%, 26 Oct)
          const maxDiff = 0.025;
          if (diff <= maxDiff) {
            console.log(`  ok       ${spot.id} — ${spot.desc} (diff ${(diff * 100).toFixed(2)}%)`);
            totalPassed++;
          } else {
            console.log(`  FAIL     ${spot.id} — ${spot.desc} (diff ${(diff * 100).toFixed(2)}%)`);
            fs.writeFileSync(path.join(PICS_DIR, `${spot.id}.diff.png`), imgBuf);
            totalFailed++;
          }
        }
      }
    }

    ws.close();
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`);
  }

  chrome.kill();
  server.close();

  console.log(`\nPicture tests finished: ${totalPassed} passed, ${totalFailed} failed.`);
  process.exit(totalFailed > 0 ? 1 : 0);
});
