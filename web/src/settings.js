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
      if (o) o.textContent = new Date(2024, 0, state.day).toLocaleDateString("hu-HU", {month:"long", day:"numeric"});
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
    ["sharpSel", el => {
      state.sharp = +el.value;
      window.dispatchEvent(new Event("resize"));
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

  for (const [id, fn] of bindings) {
    const el = document.getElementById(id);
    if (el) { el.addEventListener("input", () => fn(el)); fn(el); }
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
  
  if (selNetwork) {
    selNetwork.value = currentLine;
    selNetwork.addEventListener("change", () => {
      window.location.search = `?line=${selNetwork.value}`;
    });
  }
  
  if (selScenario) {
    let options = "";
    if (currentLine === "line70") {
      options = `
        <option value="S70">S70 (Minden állomáson megáll)</option>
        <option value="G70">G70 (Gyorsított személy)</option>
        <option value="Z70">Z70 (Zónázó)</option>
        <option value="EC">EuroCity (Metropolitan)</option>
        <option value="Freight">Tehervonat (Bypass)</option>
      `;
    } else if (currentLine === "line2") {
      options = `
        <option value="S72">S72 (Minden állomáson megáll)</option>
        <option value="Z72">Z72 (Gyorsított személy)</option>
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

  const btnGo = document.getElementById("mGo");
  if (btnGo) {
    btnGo.addEventListener("click", () => {
      if (onStartRun && selDir && selStart) {
        const scenario = selScenario ? selScenario.value : (currentLine === "line70" ? "S70" : currentLine === "line2" ? "S72" : currentLine === "s21" ? "S21" : "S71");
        const env = selEnv ? selEnv.value : "custom";
        const mode = selMode ? selMode.value : "manual";
        
        onStartRun(+selDir.value, +selStart.value, mode, scenario, env);
      }
    });
  }

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
