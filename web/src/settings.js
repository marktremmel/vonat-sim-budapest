import { tt, LANG } from "./i18n.js";
export function bindSettings(state, {
  onWeatherChange,
  onStartRun,
  traffic,
  sound,
  routeData
}) {
  function syncWx() {
    if (onWeatherChange) onWeatherChange();
  }
  
  function syncClockLabels() {
    const o = document.getElementById("hourOut");
    if (o) {
      const t = ((state.hour % 24) + 24) % 24;
      o.textContent = String(Math.floor(t)).padStart(2, "0") + ":" +
                      String(Math.floor((t % 1) * 60)).padStart(2, "0");
    }
    const mi = document.getElementById("mHour");
    const mo = document.getElementById("mHourV");
    const el = document.getElementById("timeSlider");
    if (mi && el && mi.value !== el.value) { mi.value = el.value; if (mo) mo.textContent = o.textContent; }
  }

  const bindings = [
    ["timeSlider", el => {
      state.hour = +el.value;
      if (traffic) traffic.seekTo(state.hour * 3600);
      syncClockLabels();
    }],
    ["daySlider", el => {
      state.day = +el.value;
      const o = document.getElementById("dayOut");
      if (o) o.textContent = new Date(2024, 0, state.day).toLocaleDateString(LANG === "en" ? "en-GB" : "hu-HU", {month:"long", day:"numeric"});
      if (window.__syncWx) window.__syncWx();
    }],
    ["wxSit", el => {
      if (!el.__armed) { el.__armed = true; return; }      // not on binding
      state.cloudType = "";
      const cs = document.getElementById("cloudType");
      if (cs) cs.value = "";
      if (window.__setWeather) window.__setWeather(el.value); else { state.wxId = el.value; syncWx(); }
    }],
    ["fogSlider", el => { state.fog = +el.value; syncWx(); }],
    ["volSlider", el => { state.volume = +el.value; if (sound) sound.setVolume(state.volume); }],
    ["danSlider", el => {
      state.danube = +el.value;
      const o = document.getElementById("danOut");
      if (o) o.textContent = (state.danube >= 0 ? "+" : "\u2212") + Math.abs(state.danube).toFixed(1) + " m";
    }],
    // Élesség: the internal resolution (main.js resize). This was bound to
    // "sharpSel", an element that does not exist, so the slider did nothing.
    ["resSlider", el => {
      state.sharp = +el.value;
      window.dispatchEvent(new Event("resize"));
      const o = document.getElementById("resOut");
      if (o && window.SIM && SIM.res) o.textContent = `${SIM.res.w}×${SIM.res.h}`;
    }],
    ["wxChange", el => {
      state.wxChanging = el.checked;
      if (!el.__armed) { el.__armed = true; return; }
      if (window.__setWeather) window.__setWeather(state.wxId);
    }],
    ["cineSel", el => state.cine = el.value],
    ["camSel", el => state.camMode = el.value],
    ["cineRate", el => state.cineRate = +el.value],
    ["expSlider", el => state.exposure = +el.value],
    ["bloomSlider", el => state.bloom = +el.value],
    ["grainSlider", el => state.grain = +el.value],
    ["chromaSlider", el => state.chroma = +el.value],
    ["vigSlider", el => state.vignette = +el.value],
    ["wxInt", el => { state.wxInt = +el.value; syncWx(); }],
    ["cloudType", el => { state.cloudType = el.value; syncWx(); }],
  ];

  // Picture and sound settings are remembered per browser (localStorage can
  // be missing or throw: private windows, blocked storage; then nothing is kept).
  // Minőség: the internal resolution and how far round the camera the
  // city is loaded, in one choice (a phone starts on low)
  const QUAL = { low: [0.9, 1900], med: [1.4, 3200], high: [2.0, 4300] };
  bindings.unshift(["qualSel", el => {
    const q = QUAL[el.value] || QUAL.med;
    state.cityR = q[1];
    if (window.__setCityR) window.__setCityR(q[1]);
    if (!el.__armed) { el.__armed = true; return; }       // (the resolution slider keeps its own saved value)
    const rs = document.getElementById("resSlider");
    if (rs) { rs.value = q[0]; rs.dispatchEvent(new Event("input")); }
  }]);
  // graphics switches (Beállítás): remembered like the sliders
  state.gfx = state.gfx || {};
  for (const [id, key] of [["gfxDof", "dof"], ["gfxMotion", "motion"], ["gfxAO", "ao"]]) {
    const el = document.getElementById(id); if (!el) continue;
    const p0 = loadPrefs();
    if (p0.gfx && p0.gfx[key] != null) el.checked = !!p0.gfx[key];
    state.gfx[key] = el.checked;
    el.addEventListener("change", () => {
      state.gfx[key] = el.checked;
      const p = loadPrefs(); p.gfx = p.gfx || {}; p.gfx[key] = el.checked; savePrefs(p);
    });
  }
  // and how strong each is (DOF as the aperture, motion blur and AO as a gain)
  for (const [id, key] of [["gfxDofAmt", "dofAmt"], ["gfxMotionAmt", "motionAmt"], ["gfxAOAmt", "aoAmt"]]) {
    const el = document.getElementById(id); if (!el) continue;
    const p0 = loadPrefs();
    if (p0.gfx && p0.gfx[key] != null) el.value = p0.gfx[key];
    state.gfx[key] = +el.value;
    el.addEventListener("input", () => {
      state.gfx[key] = +el.value;
      const p = loadPrefs(); p.gfx = p.gfx || {}; p.gfx[key] = +el.value; savePrefs(p);
    });
  }
  const qs0 = document.getElementById("qualSel");
  if (qs0 && document.body.classList.contains("touch")) qs0.value = "low";
  const KEPT = ["qualSel", "resSlider", "expSlider", "bloomSlider", "grainSlider", "chromaSlider",
                "vigSlider", "volSlider", "fogSlider", "cineRate"];
  const prefs = loadPrefs();
  for (const id of KEPT) {
    const el = document.getElementById(id);
    if (el && prefs.ui && prefs.ui[id] != null) el.value = prefs.ui[id];
  }
  if (document.body.classList.contains("touch") && !(prefs.ui && prefs.ui.resSlider)) {
    const rs = document.getElementById("resSlider"); if (rs) rs.value = QUAL.low[0];
  }
  for (const [id, fn] of bindings) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("input", () => {
      fn(el);
      if (KEPT.includes(id)) { prefs.ui = prefs.ui || {}; prefs.ui[id] = el.value; savePrefs(prefs); }
    });
    fn(el);
  }

  const selDir = document.getElementById("mDir");
  const selStart = document.getElementById("mStart");
  const selMode = document.getElementById("mMode");
  const selScenario = document.getElementById("mScenario");
  const selEnv = document.getElementById("mEnv");
  const inpHour = document.getElementById("mHour");

  // Populate direction based on route stops
  if (selDir && routeData && routeData.stops && routeData.stops.length >= 2) {
    const stops = routeData.stops.slice().sort((a, b) => a.km - b.km);
    const first = stops[0].name;
    const last = stops[stops.length - 1].name;
    selDir.innerHTML = `
      <option value="1">${first} → ${last}</option>
      <option value="-1">${last} → ${first}</option>
    `;
  }

  function fillStarts(dir) {
    if (!selStart) return;
    const list = routeData.stops.slice().sort((a, b) => (a.km - b.km) * dir);
    selStart.innerHTML = list
      .map(s => `<option value="${s.km}">${s.name}</option>`).join("");
  }

  if (selDir) {
    selDir.addEventListener("change", () => fillStarts(+selDir.value));
    fillStarts(+selDir.value);
  }

  if (inpHour) {
    inpHour.addEventListener("input", () => {
      const ts = document.getElementById("timeSlider");
      if (ts) {
        ts.value = inpHour.value;
        ts.dispatchEvent(new Event("input"));
      }
    });
  }

  const selNetwork = document.getElementById("mNetwork");
  
  // Check if we need to switch lines
  const params = new URLSearchParams(window.location.search);
  const currentLine = params.get("line") || "line70";
  
  const goLine = (id) => {
    prefs.line = id; savePrefs(prefs);
    window.location.search = `?line=${id}`;
  };
  if (selNetwork) {
    selNetwork.value = currentLine;
    selNetwork.addEventListener("change", () => goLine(selNetwork.value));
  }
  const TITLES = {
    line70: [tt("Szob felé", "To Szob"), "MÁV 70 · Nyugati – Vác – Szob"],
    line2: [tt("Esztergom felé", "To Esztergom"), "MÁV 2 · Nyugati – Pilisvörösvár – Esztergom"],
    s21: [tt("Lajosmizse felé", "To Lajosmizse"), "S21 · Nyugati – Kőbánya-Kispest – Lajosmizse"],
  };
  const [ttl, sub] = TITLES[currentLine] || TITLES.line70;
  const mt = document.getElementById("menuTitle"), ms = document.getElementById("menuSubtitle");
  if (mt) mt.textContent = ttl;
  if (ms) ms.textContent = sub;
  const banner = document.getElementById("mBanner");
  // the logo over a faded strip of the cover
  if (banner) banner.src = (window.DATA_BASE || "data/") + "logo.webp";
  const menuEl = document.getElementById("menu");
  if (menuEl) menuEl.style.backgroundImage =
    `linear-gradient(rgba(9,17,24,.30), rgba(9,17,24,.97) 200px), url(${(window.DATA_BASE || "data/") + "menu_bg.webp"})`;
  // (a strip of the cover below its own logo: the train and the river)
  if (menuEl) { menuEl.style.backgroundSize = "100% 100%, 100% auto"; menuEl.style.backgroundPosition = "0 0, 50% 0"; }
  // HU / EN: saved, and the page reloads in the other language
  const langBtn = document.getElementById("mLang");
  if (langBtn) {
    langBtn.textContent = LANG === "en" ? "HU" : "EN";
    langBtn.addEventListener("click", () => {
      prefs.lang = LANG === "en" ? "hu" : "en"; savePrefs(prefs); location.reload();
    });
  }
  document.querySelectorAll("#mLines button").forEach(b => {
    b.classList.toggle("on", b.dataset.line === currentLine);
    b.addEventListener("click", () => { if (b.dataset.line !== currentLine) goLine(b.dataset.line); });
  });
  
  if (selScenario) {
    let options = "";
    if (currentLine === "line70") {
      options = `
        <option value="S70">S70 (${tt("minden megállóban megáll", "stopping")})</option>
        <option value="G70">G70 (${tt("gyorsított", "semi-fast")})</option>
        <option value="Z70">Z70 (${tt("zónázó", "zonal")})</option>
        <option value="EC">EuroCity (Metropolitan)</option>
        <option value="Freight">${tt("Tehervonat", "Freight")}</option>
      `;
    } else if (currentLine === "line2") {
      options = `
        <option value="S72">S72 (${tt("minden megállóban megáll", "stopping")})</option>
        <option value="Z72">Z72 (${tt("gyorsított", "semi-fast")})</option>
      `;
    } else if (currentLine === "s21") {
      options = `
        <option value="S21">S21 (Nyugati – Kőbánya-Kispest – Lajosmizse)</option>
      `;
    } else if (currentLine === "line71") {
      options = `
        <option value="S71">S71 (Minden állomáson megáll)</option>
        <option value="G71">G71 (Gyorsított személy)</option>
      `;
    }
    selScenario.innerHTML = options;
  }

  // what was chosen last time on this line
  const last = (prefs.runs || {})[currentLine];
  if (last) {
    const has = (sel, v) => sel && [...sel.options].some(o => o.value === String(v));
    if (has(selScenario, last.scenario)) selScenario.value = last.scenario;
    if (has(selDir, last.dir)) { selDir.value = last.dir; fillStarts(+selDir.value); }
    if (has(selStart, last.start)) selStart.value = last.start;
    if (has(selEnv, last.env)) selEnv.value = last.env;
    if (has(selMode, last.mode)) selMode.value = last.mode;
    if (inpHour && last.hour != null) inpHour.value = last.hour;
  }
  const setHour = (h) => {
    const ts = document.getElementById("timeSlider");
    if (ts) { ts.value = h; ts.dispatchEvent(new Event("input")); }
    if (inpHour) inpHour.value = h;
  };
  const start = (dir, startKm, mode, scenario, env, hour) => {
    prefs.runs = prefs.runs || {};
    prefs.runs[currentLine] = { scenario, dir, start: startKm, env, mode, hour };
    savePrefs(prefs);
    if (hour != null) setHour(hour);
    onStartRun(dir, startKm, mode, scenario, env);
  };
  const btnGo = document.getElementById("mGo");
  if (btnGo) {
    btnGo.addEventListener("click", () => {
      if (onStartRun && selDir && selStart) {
        start(+selDir.value, +selStart.value, selMode ? selMode.value : "manual",
              selScenario ? selScenario.value : "S70", selEnv ? selEnv.value : "custom",
              inpHour ? +inpHour.value : null);
      }
    });
  }
  // Indulás: the next stopping train from the Budapest end, in daylight (the
  // real time of day if it is daytime now, else half past ten), the
  // automatic driver at the controls. One click and you are on your way.
  const quickHour = () => {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    return h >= 6 && h <= 19.5 ? Math.round(h * 4) / 4 : 10.5;
  };
  const stopsUp = routeData.stops.slice().sort((a, b) => a.km - b.km);
  const quickScenario = selScenario && selScenario.options.length ? selScenario.options[0].value : "S70";
  const fmt = h => String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.round((h % 1) * 60)).padStart(2, "0");
  const qs = document.getElementById("mQuickSub");
  if (qs) qs.textContent = `${quickScenario} · ${stopsUp[0].name} → ${stopsUp[stopsUp.length - 1].name} · ${fmt(quickHour())} · ${tt("automata, M-mel átveszed", "automatic, M to take over")}`;
  const btnQuick = document.getElementById("mQuick");
  if (btnQuick) btnQuick.addEventListener("click", () => {
    if (selMode) selMode.value = "auto";
    start(1, stopsUp[0].km, "auto", quickScenario, "custom", quickHour());
    if (window.__intro) window.__intro();
  });

  // Auto-start if URL parameters exist
  if (params.has("scenario") && onStartRun) {
    const scenario = params.get("scenario");
    const env = params.get("env") || "custom";
    const dir = params.get("dir") || "1";
    const start = params.get("start") || routeData.startM;
    const mode = params.get("mode") || "manual";
    
    if (selScenario) selScenario.value = scenario;
    if (selEnv) selEnv.value = env;
    if (selDir) selDir.value = dir;
    if (selStart) selStart.value = start;
    if (selMode) selMode.value = mode;

    // Trigger the run immediately
    onStartRun(+dir, +start, mode, scenario, env);
  }
}

/** The remembered settings: {ui: {sliderId: value}, line, runs: {line: {...}}}. */
export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem("szobPrefs") || "{}") || {}; } catch (e) { return {}; }
}
export function savePrefs(p) {
  try { localStorage.setItem("szobPrefs", JSON.stringify(p)); } catch (e) {}
}
