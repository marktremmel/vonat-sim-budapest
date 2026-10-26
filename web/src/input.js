import { makePlane, PLANES, PLANE_ORDER } from "./aircraft.js";
import { makeCar } from "./car.js";
import { LAYERS, CHAR_MODELS } from "./hud.js";
import { M4, norm, cross, add, scale, sub } from "./engine.js";

// Keyboard, pointer and wheel. Everything here reads or writes `state`,
// the driver and the traffic; nothing draws. `ctx` carries the handful of
// objects the handlers act on, so this file owns no state of its own
// beyond the two drag anchors.

export function installInput(ctx) {
  const { cv, hud, panelCanvas, keys, route, routeData, driver,
          traffic, roadTraffic, riverTraffic, playerTrain, sound, startRun, toggleMenu } = ctx;
  // Esc from any mode: back to the driver's seat, desk and all (index.html
  // toCab, the same as the Fülke button). Each mode used to clear only
  // itself, so after the hero you were on the train with no cab.
  const backToCab = () => {
    if (window.__toCab) { window.__toCab(); return; }
    if (state.person) state.person.active = false;
    if (state.car) state.car.active = false;
    if (state.plane) state.plane.active = false;
    state.tram = null; state.tour = null; state.passenger = null; state.follow = false; state.fly = null;
    state.cab = true; state.yaw = 0; state.pitch = -0.02; state.zoom = 1;
  };
  addEventListener("keydown", e => {
    keys.add(e.code);
    // photo mode (main.js) owns Esc, Space and Z; the rest of its keys are the
    // free camera's
    if (state.photo) {
      if (e.code === "Escape" || e.code === "Space" || e.code === "KeyZ") return;
      if (e.shiftKey && ["KeyC", "KeyP", "KeyA", "KeyD"].includes(e.code)) return;   // no changing modes mid-photo
    }

    // Fly a plane: shift+P. Starts 300 m above where the camera is, heading
    // the way it looks. W/S pitch, A/D roll, Q/E rudder, R/F throttle,
    // C cockpit or chase. shift+P again lands you back in the cab.
    if (e.code === "KeyP" && e.shiftKey) {
      if (state.plane && state.plane.active) { state.plane.active = false; }
      else {
        const c = state.camXZ || route.at(driver.m);
        const g = window.SIM ? SIM.demAt(c[0], c[1]) : 110;
        state.plane = makePlane([c[0], (isFinite(g) ? g : 110) + 300, -c[1]], state.yaw || 0,
                                state.planeType || "cessna");
        state.fly = null; state.follow = false; state.followIdx = -1; state.passenger = null;
        state.followCarIdx = -1; state.followShipIdx = -1;
        if (state.drone) state.drone.active = false;
        if (state.car) state.car.active = false;
        state.pitch = 0; state.yaw = 0; state.zoom = 1;     // (yaw is the orbit round the plane now)
      }
      return;
    }
    // Drive a car: shift+A. It starts on the road nearest the camera (the
    // line's roads and the loaded city tiles), pointing along it.
    if (e.code === "KeyA" && e.shiftKey) {
      if (state.car && state.car.active) { state.car.active = false; return; }
      const c = state.camXZ || route.at(driver.m);
      let best = null, bd = 900;
      const consider = (w) => {
        if (w.cls > 5) return;
        for (let k = 1; k < w.pts.length; k++) {
          const a = w.pts[k - 1], b = w.pts[k];
          const d = Math.hypot((a[0] + b[0]) / 2 - c[0], (a[1] + b[1]) / 2 - c[1]);
          if (d < bd) { bd = d; best = { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) }; }
        }
      };
      if (window.SIM) {
        (SIM.roadWays || []).forEach(consider);
        const cty = SIM.city && SIM.city();
        if (cty) cty.each(m => (m.ways || []).forEach(consider));
      }
      const at = best || { x: c[0], y: c[1], yaw: state.yaw || 0 };
      const startY = (window.SIM && SIM.carSurf) ? SIM.carSurf(at.x, at.y, 110).y : 110;
      state.car = makeCar(at.x, at.y, at.yaw, startY);
      if (state.plane) state.plane.active = false;
      if (state.drone) state.drone.active = false;
      if (state.person) state.person.active = false;
      state.fly = null; state.follow = false; state.followIdx = -1; state.passenger = null;
      state.followCarIdx = -1; state.followShipIdx = -1; state.tour = null;
      state.yaw = 0; state.pitch = 0; state.zoom = 1;
      return;
    }
    // Person / Superhero (Hancock) Mode: shift+H
    if (e.code === "KeyH" && e.shiftKey) {
      if (state.person && state.person.active) {
        backToCab();
        state.messages = state.messages || [];
        state.messages.push({ text: "Vissza a vonathoz", t: 2.5, tone: "info" });
      } else {
        const c = state.camXZ || route.at(driver.m);
        const gy = (window.SIM && SIM.carSurf) ? SIM.carSurf(c[0], c[1], 110).y : 110;
        const selIdx = state.selectedCharIdx !== undefined ? state.selectedCharIdx : 0;
        const curModel = CHAR_MODELS[selIdx] || CHAR_MODELS[0];
        state.person = {
          x: c[0], n: c[1], y: gy + 0.2,
          yaw: state.yaw || 0, pitch: 0,
          v: [0, 0, 0],
          onGround: true, flying: false,
          charIdx: selIdx,
          height: 1.82,
          tintScale: state.selectedCharTint !== undefined ? state.selectedCharTint : 1.0,
          heroAbilities: true,
          walkDist: 0, phase: -1.0,
          active: true, firstPerson: false
        };
        if (state.plane) state.plane.active = false;
        if (state.drone) state.drone.active = false;
        if (state.car) state.car.active = false;
        state.tram = null; state.fly = null; state.follow = false; state.followIdx = -1; state.cab = false; state.passenger = null;
        state.yaw = 0; state.pitch = 0; state.zoom = 1;
        state.messages = state.messages || [];
        state.messages.push({
          text: `🦸 Hancock Hős aktív · ${curModel.name} · Space: repülés, E: robbanás, C/X: süllyedés, V: karakterváltás`,
          t: 4.5, tone: "good"
        });
      }
      return;
    }

    if (state.person && state.person.active) {
      if (e.code === "Escape") {
        backToCab();
        e.preventDefault(); return;
      }
      if (e.code === "KeyE" && state.person.heroAbilities) {
        state.person.triggerBlast = true;
        e.preventDefault(); return;
      }
      if (e.code === "KeyF") {
        state.person.firstPerson = !state.person.firstPerson;
        state.messages = state.messages || [];
        state.messages.push({
          text: state.person.firstPerson ? "Kamera: Belső nézet (FPS)" : "Kamera: Külső nézet (3rd Person)",
          t: 2.5, tone: "info"
        });
        e.preventDefault(); return;
      }
      if (e.code === "KeyP") {
        state.paused = !state.paused;
        e.preventDefault(); return;
      }
      if (e.code === "KeyV") {
        state.person.charIdx = ((state.person.charIdx || 0) + 1) % CHAR_MODELS.length;
        state.selectedCharIdx = state.person.charIdx;
        const cur = CHAR_MODELS[state.person.charIdx];
        state.messages = state.messages || [];
        state.messages.push({
          text: `Karakter: ${cur.name} (${cur.gender === "m" ? "👨 Férfi" : "👩 Nő"}) [${state.person.charIdx + 1}/24]`,
          t: 3, tone: "good"
        });
        e.preventDefault(); return;
      }
      if (["Space", "KeyW", "KeyS", "KeyA", "KeyD", "KeyC", "KeyX", "KeyE", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight"].includes(e.code)) {
        e.preventDefault(); return;
      }
    }
    if (state.car && state.car.active) {
      if (e.code === "Escape") {
        backToCab();
        e.preventDefault(); return;
      }
      if (e.code === "KeyC") { state.car.cockpit = !state.car.cockpit; return; }
      if (e.code === "KeyP") { state.paused = !state.paused; e.preventDefault(); return; }
      if (["Space", "KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "KeyX",
           "KeyJ", "KeyM", "KeyB", "KeyV", "KeyI", "KeyY", "ArrowUp", "ArrowDown", "ArrowLeft",
           "ArrowRight", "Backspace", "KeyH"].includes(e.code)) { e.preventDefault(); return; }
    }
    if (state.tram) {
      if (e.code === "Escape") {
        backToCab();
        e.preventDefault(); return;
      }
      if (e.code === "KeyP") {
        state.paused = !state.paused;
        e.preventDefault(); return;
      }
      if (e.code === "KeyT" && e.shiftKey) {
        if (window.__tram) window.__tram();
        e.preventDefault(); return;
      }
      if (e.code === "KeyC") {
        state.tram.out = !state.tram.out;
        state.yaw = state.tram.out ? 0.35 : 0; state.pitch = state.tram.out ? -0.1 : -0.05;
        e.preventDefault(); return;
      }
      if (e.code === "KeyW") {
        state.tram.manual = true;
        state.tram.throttle = Math.min(1.0, (state.tram.throttle || 0) + 0.25);
        state.tram.brake = 0;
        e.preventDefault(); return;
      }
      if (e.code === "KeyS") {
        state.tram.manual = true;
        state.tram.brake = Math.min(1.0, (state.tram.brake || 0) + 0.25);
        state.tram.throttle = 0;
        e.preventDefault(); return;
      }
      if (e.code === "Space") {
        state.paused = !state.paused;
        state.messages = state.messages || [];
        state.messages.push({
          text: state.paused ? (state.lang === "hu" ? "SZÜNET (Pause)" : "PAUSED") : (state.lang === "hu" ? "FOLYTATÁS (Resume)" : "RESUMED"),
          t: 1.8, tone: "info"
        });
        e.preventDefault(); return;
      }
      if (e.code === "KeyB") {
        state.tram.manual = true;
        state.tram.throttle = 0;
        state.tram.brake = 1.0;
        e.preventDefault(); return;
      }
      if (e.code === "KeyE" || e.code === "KeyD") {
        if ((state.tram.v || 0) < 0.4) {
          state.tram.doors = !state.tram.doors;
          if (state.tram.doors) { state.tram.throttle = 0; state.tram.brake = 1.0; }
        }
        e.preventDefault(); return;
      }
      if (e.code === "KeyM") {
        state.tram.manual = !state.tram.manual;
        e.preventDefault(); return;
      }
      if (["Space", "KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "KeyX",
           "KeyJ", "KeyM", "KeyB", "KeyV", "KeyI", "KeyY", "ArrowUp", "ArrowDown", "ArrowLeft",
           "ArrowRight", "Backspace"].includes(e.code)) {
        e.preventDefault(); return;
      }
    }
    // Esc from any flying camera, or the sightseeing director, goes straight
    // back to the train
    if (e.code === "Escape" && ((state.plane && state.plane.active) || state.fly || state.tour)) {
      backToCab();
      e.preventDefault(); return;
    }
    if (state.plane && state.plane.active) {
      if (e.code === "KeyC") state.plane.cockpit = !state.plane.cockpit;
      // 1 / 2 / 3: Cessna, Gripen, helicopter — in place, at a sensible speed
      const ti = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
      if (ti >= 0) {
        const pl = state.plane, type = PLANE_ORDER[ti];
        state.planeType = type;
        const np = makePlane(pl.p, pl.yaw, type);
        np.cockpit = pl.cockpit;
        if (pl.ground) np.p[1] += 1;
        state.plane = np;
        e.preventDefault(); return;
      }
      if (["Space", "KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "KeyC", "KeyX",
           "KeyJ", "KeyM", "KeyB", "KeyV", "KeyI", "KeyY", "ArrowUp", "ArrowDown", "ArrowLeft",
           "ArrowRight", "Backspace"].includes(e.code)) { e.preventDefault(); return; }
    }

    // Drone Flying Simulator Mode: shift+D
    if (e.code === "KeyD" && e.shiftKey) {
      if (!state.drone) state.drone = { p: [0, 150, 0], v: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, active: false };
      state.drone.active = !state.drone.active;
      if (state.drone.active) {
        state.fly = null; state.followIdx = -1; state.followCarIdx = -1; state.followShipIdx = -1;
        const p = state.camXZ ? [state.camXZ[0], (state.camY || 120) + 15, -state.camXZ[1]] : [0, 150, 0];
        state.drone.p = [p[0], p[1], p[2]];
        state.drone.v = [0, 0, 0];
        state.drone.yaw = state.yaw || 0;
        state.drone.pitch = 0;
        state.drone.roll = 0;
      }
      return;
    }

    if (state.drone && state.drone.active) {
      if (e.code === "Escape") {
        state.drone.active = false;
        return;
      }
      if (["Space", "KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF", "KeyC", "KeyX", "KeyJ", "KeyM", "KeyB", "KeyV", "KeyI", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
        return;
      }
    }

    // Y: sit in the train as a passenger (upper deck, by a window); shift+Y
    // moves you to the other side of the aisle
    if (e.code === "KeyY") {
      if (e.shiftKey && state.passenger) {
        state.passenger.side = -state.passenger.side;
        state.yaw = state.passenger.side * Math.PI / 2;
      } else if (state.passenger) {
        state.passenger = null; state.yaw = 0; state.pitch = -0.02;
      } else {
        state.passenger = { car: 2, side: 1 };
        state.follow = false; state.fly = null; state.followIdx = -1;
        state.followCarIdx = -1; state.followShipIdx = -1;
        state.yaw = Math.PI / 2; state.pitch = -0.04; state.zoom = 1;
      }
    }
    if (e.code === "KeyM") {
      state.manual = !state.manual; driver.auto = !state.manual;
      // take over at whatever the automatic driver was doing
      if (state.manual)
        driver.lever = driver.brake > 0.05 ? -Math.round(driver.brake * 8) : Math.round(driver.throttle * 8);
    }
    // The master controller. One notch per press; held, it steps every
    // 0.18 s rather than at the keyboard's repeat rate.
    // In the free camera W A S D R F Q E fly it. They used to fall through
    // to their train meanings as well: R hid the track, F jumped to following
    // another train, Q opened the dispatcher board.
    if (state.fly && !e.shiftKey && ["KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyF", "KeyQ", "KeyE"].includes(e.code)) return;
    const freeCam = state.fly || (state.drone && state.drone.active);
    if (state.manual && !freeCam && ["KeyW", "ArrowUp", "KeyS", "ArrowDown"].includes(e.code)) {
      const t = performance.now();
      if (!e.repeat || t - (state.leverT || 0) > 180) {
        state.leverT = t;
        const up = e.code === "KeyW" || e.code === "ArrowUp";
        driver.setLever(driver.lever + (up ? 1 : -1));
      }
    }
    if (state.manual && !freeCam && e.code === "Digit0" && e.shiftKey) driver.setLever(0);
    if (state.manual && e.code === "Backspace") {
      driver.emergency = true; driver.setLever(-8); driver.emergency = true;
    }
    if (e.code === "KeyL" && !e.shiftKey) state.labels = !state.labels;
    if (e.code === "F3") { state.debugHud = !state.debugHud; e.preventDefault(); }
    if (e.code === "KeyC" && !e.shiftKey) state.follow = !state.follow;
    // shift+C detaches the camera from the train and hands it to you. It
    // starts where the train is and keeps whatever you were looking at.
    if (e.code === "KeyC" && e.shiftKey) {
      if (state.fly) { state.fly = null; }
      else {
        const c = state.camXZ || [0, 0];
        state.fly = { p: [c[0], (state.camY || 0) + 4, -c[1]], speed: 34 };
      }
    }
    // Orbit camera toggle
    if (e.code === "KeyO" && e.shiftKey) {
      state.orbitCamera = !state.orbitCamera;
      if (state.orbitCamera) {
        state.follow = true;
        if (state.drone) state.drone.active = false;
        state.fly = null;
      }
    }
    // off / slow / fast, the three positions a real wiper switch has
    if (e.code === "KeyX") { state.wiperAuto = false; state.wiper = (state.wiper + 1) % 3; }
    if (e.code === "KeyE") driver.acknowledge();
    if (e.code === "KeyJ" && !state.dark) driver.sand = !driver.sand;
    // Comma and full stop jump to the previous or next stop. Sixty-three
    // kilometres is a long way to drive to look at one bridge.
    if (e.code === "Comma" || e.code === "Period") {
      const dirN = e.code === "Period" ? 1 : -1;
      const list = route.stops.slice().sort((a, b) => a.km - b.km);
      const here = driver.m / 1000;
      const to = dirN > 0 ? list.find(x => x.km > here + 0.3)
                          : list.reverse().find(x => x.km < here - 0.3);
      if (to) {
        driver.m = to.km * 1000;
        driver.v = 0; driver.dwell = 0; driver.doors = 0;
        driver.stopIdx = Math.max(0, route.stops.findIndex(
          x => (x.km * 1000 - driver.m) * route.dir > 30));
        playerTrain.m = driver.m; playerTrain.v = 0;
        traffic.seekTo(state.hour * 3600);
        state.jumpedTo = to.name;
        state.jumpedToUntil = performance.now() + 3500;
      }
    }
    if (e.code === "Space") { state.paused = !state.paused; e.preventDefault(); }
    if (e.code === "Digit1") state.speedMul = 1;
    if (e.code === "Digit2") state.speedMul = 4;
    if (e.code === "Digit3") state.speedMul = 16;
    if (e.code === "KeyT" && e.shiftKey) { if (state.tram) window.__tram(); else if (window.__tramBar) window.__tramBar(); }
    if (e.code === "KeyN" && e.shiftKey) { if (window.__skipStop) window.__skipStop(); return; }
    // (⇧T used to fall through to this and switch the ground off as you
    // boarded a tram; ⇧O turned the wires off with the orbit camera; in the
    // dark timeline K and J also switched the sky and the sander)
    if (e.code === "KeyT" && !e.shiftKey) state.show.terrain = !state.show.terrain;
    if (e.code === "KeyR" && !e.shiftKey) state.show.track = !state.show.track;
    if (e.code === "KeyK" && !e.shiftKey && !state.dark) state.show.sky = !state.show.sky;
    if (e.code === "KeyB" && !e.shiftKey) {
      if (riverTraffic) {
        const allShips = [...(riverTraffic.ferries || []), ...(riverTraffic.ships || [])];
        if (allShips.length) {
          state.followShipIdx = (state.followShipIdx + 1 >= allShips.length) ? -1 : state.followShipIdx + 1;
          state.followIdx = -1; state.followCarIdx = -1; state.fly = null;
          if (state.drone) state.drone.active = false;
          state.yaw = 0; state.pitch = -0.05;
        }
      }
    }
    if (e.code === "KeyV" && !e.shiftKey) {
      if (roadTraffic && roadTraffic.vehicles.length) {
        state.followCarIdx = (state.followCarIdx + 1 >= roadTraffic.vehicles.length) ? -1 : state.followCarIdx + 1;
        state.followIdx = -1; state.followShipIdx = -1; state.fly = null;
        if (state.drone) state.drone.active = false;
        state.yaw = 0; state.pitch = -0.05;
      }
    }
    if (e.code === "KeyN") state.show.roads = !state.show.roads;
    if (e.code === "KeyO" && !e.shiftKey) state.show.catenary = !state.show.catenary;
    // everything off: no panel, no read-outs, just the railway
    if (e.code === "KeyU" && window.__setBare) window.__setBare(((state.bareLevel || 0) + 1) % 3);
    if (e.code === "Tab") { state.map = !state.map; e.preventDefault(); }
    if (e.code === "KeyP" && !e.shiftKey) state.layer = (state.layer + 1) % LAYERS.length;
    if (e.code === "BracketLeft") state.zoom = Math.max(0.35, state.zoom / 1.25);
    if (e.code === "BracketRight") state.zoom = Math.min(4.0, state.zoom * 1.25);
    if (e.code === "Digit0") { state.zoom = 1; state.yaw = 0; state.pitch = -0.02; }
    if (e.code === "Escape") {
      if (state.followIdx >= 0 || state.followCarIdx >= 0 || state.followShipIdx >= 0 || (state.drone && state.drone.active)) {
        state.followIdx = -1; state.followCarIdx = -1; state.followShipIdx = -1;
        if (state.drone) state.drone.active = false;
      } else {
        toggleMenu(!state.menu);
      }
    }
    if (e.code === "KeyQ") {
      state.panel = !state.panel; state.map = false;
      document.getElementById("panel").style.display = state.panel ? "none" : "";
    }
    if (e.code === "KeyR" && e.shiftKey) startRun(state.runDir, state.runStart);
    if (e.code === "KeyI") state.cab = !state.cab;
    // FÉNY: off / normal / full beam
    if (e.code === "KeyF" && e.shiftKey) state.lights = (state.lights + 1) % 3;
    if (e.code === "KeyG") {
      state.sound = !state.sound;
      if (state.sound) sound.start(); else sound.stop();
    }
    if (e.code === "KeyF" && !e.shiftKey) {
      const n = traffic.trains.filter(t => t.svc.id !== "player").length;
      state.followIdx = state.followIdx + 1 >= n ? -1 : state.followIdx + 1;
      state.followCarIdx = -1; state.followShipIdx = -1;
      if (state.drone) state.drone.active = false;
      state.yaw = 0; state.pitch = -0.02;
    }
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].includes(e.code))
      e.preventDefault();
  });
  addEventListener("keyup", e => keys.delete(e.code));
  let drag = null, panDrag = null, mapDrag = null;
  // dragged "the window away" instead of turning the view)
  cv.addEventListener("dragstart", e => e.preventDefault());
  cv.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (!state.map && state.mapTransform) {
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) * (hud.width / r.width);
      const py = (e.clientY - r.top) * (hud.height / r.height);
      const { mx, my, mw, mh } = state.mapTransform;
      if (px >= mx && px <= mx + mw && py >= my && py <= my + mh) {
        state.map = true;
        state.mapZoom = 2.2;
        state.mapPanX = 0;
        state.mapPanY = 0;
        return;
      }
    }
    if (state.map) {
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) * (hud.width / r.width);
      const py = (e.clientY - r.top) * (hud.height / r.height);

      // 1. Spawner action buttons inside the dropped pin card
      if (state.hitMapSpawnBtns && state.hitMapSpawnBtns.length) {
        for (const btn of state.hitMapSpawnBtns) {
          if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
            if (btn.act === "close_pin") {
              state.mapPin = null;
              return;
            }
            // Model customization buttons (do not close map)
            if (btn.act === "char_prev") {
              state.selectedCharIdx = ((state.selectedCharIdx !== undefined ? state.selectedCharIdx : 0) + 23) % CHAR_MODELS.length;
              if (state.person) state.person.charIdx = state.selectedCharIdx;
              return;
            }
            if (btn.act === "char_next") {
              state.selectedCharIdx = ((state.selectedCharIdx !== undefined ? state.selectedCharIdx : 0) + 1) % CHAR_MODELS.length;
              if (state.person) state.person.charIdx = state.selectedCharIdx;
              return;
            }
            if (btn.act === "char_male") {
              state.selectedCharIdx = 0;
              if (state.person) state.person.charIdx = 0;
              return;
            }
            if (btn.act === "char_female") {
              state.selectedCharIdx = 15;
              if (state.person) state.person.charIdx = 15;
              return;
            }
            if (btn.act.startsWith("tint_")) {
              state.selectedCharTint = parseFloat(btn.act.slice(5));
              if (state.person) state.person.tintScale = state.selectedCharTint;
              return;
            }

            const pin = state.mapPin;
            if (pin) {
              const gy = (window.SIM && SIM.carSurf) ? SIM.carSurf(pin.x, pin.y, 110).y : 110;
              const selIdx = state.selectedCharIdx !== undefined ? state.selectedCharIdx : 0;
              const selTint = state.selectedCharTint !== undefined ? state.selectedCharTint : 1.0;
              if (btn.act === "hero" || btn.act === "walk") {
                const isHero = btn.act === "hero";
                state.person = {
                  x: pin.x, n: pin.y, y: gy + 0.2,
                  yaw: 0, pitch: 0, v: [0, 0, 0],
                  onGround: true, flying: false,
                  charIdx: selIdx,
                  height: 1.82,
                  tintScale: selTint,
                  heroAbilities: isHero,
                  walkDist: 0, phase: -1.0,
                  active: true, firstPerson: false
                };
                if (state.car) state.car.active = false;
                if (state.plane) state.plane.active = false;
                if (state.drone) state.drone.active = false;
                state.tram = null; state.tramBar = false; state.fly = null; state.follow = false; state.followIdx = -1; state.tour = null; state.passenger = null; if (state.drone) state.drone.active = false;
                state.messages = state.messages || [];
                const m = CHAR_MODELS[selIdx] || CHAR_MODELS[0];
                state.messages.push({
                  text: isHero ? `🦸 Hancock Hős aktív · ${m.name}` : `🚶 Városi Séta aktív · ${m.name}`,
                  t: 3.5, tone: "good"
                });
              } else if (btn.act === "car") {
                state.car = makeCar(pin.x, pin.y, 0, gy);
                if (state.person) state.person.active = false;
                if (state.plane) state.plane.active = false;
                if (state.drone) state.drone.active = false;
                state.tram = null; state.tramBar = false; state.fly = null; state.follow = false; state.followIdx = -1; state.tour = null; state.passenger = null; if (state.drone) state.drone.active = false;
              } else if (btn.act === "tram") {
                if (window.__tramNear) window.__tramNear(pin.x, pin.y);
              } else if (btn.act === "plane") {
                state.plane = makePlane([pin.x, gy + 320, -pin.y], 0, "cessna");
                if (state.person) state.person.active = false;
                if (state.car) state.car.active = false;
                state.tram = null; state.tramBar = false; state.fly = null; state.follow = false; state.followIdx = -1; state.tour = null; state.passenger = null; if (state.drone) state.drone.active = false;
              }
            }
            state.map = false;
            state.mapPin = null;
            return;
          }
        }
      }

      // a click on the pin's card that misses its buttons does nothing (it
      // used to drop a new pin under the card, which looked like a lost click)
      const pc = state.mapPinCard;
      if (state.mapPin && pc && px >= pc.x && px <= pc.x + pc.w && py >= pc.y && py <= pc.y + pc.h) return;

      // 2. Interactive Map HUD buttons: [+] [-] [Reset] [🎯]
      if (state.hitMapControls && state.hitMapControls.length) {
        for (const ctl of state.hitMapControls) {
          if (px >= ctl.x && px <= ctl.x + ctl.w && py >= ctl.y && py <= ctl.y + ctl.h) {
            if (ctl.act === "zoom_in") state.mapZoom = Math.min(6.0, (state.mapZoom || 2.2) * 1.35);
            if (ctl.act === "zoom_out") state.mapZoom = Math.max(1.0, (state.mapZoom || 2.2) / 1.35);
            if (ctl.act === "reset") { state.mapZoom = 2.2; state.mapPanX = 0; state.mapPanY = 0; }
            if (ctl.act === "center") { state.mapPanX = 0; state.mapPanY = 0; }
            return;
          }
        }
      }

      // 3. Initiate map panning drag (clicks without movement trigger pin/boarding on release)
      mapDrag = {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        initPanX: state.mapPanX || 0,
        initPanY: state.mapPanY || 0,
        moved: false,
        px, py
      };
      cv.setPointerCapture(e.pointerId);
      return;
    }
    if (state.panel && state.hit) {
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) * (hud.width / r.width);
      const py = (e.clientY - r.top) * (hud.height / r.height);
      for (const t of state.hit.hitTrains || []) {
        if (px >= t.x0 && px <= t.x1 && py >= t.y0 && py <= t.y1) {
          const list = traffic.trains.filter(x => x.svc.id !== "player");
          const i = list.indexOf(t.train);
          state.followIdx = i;             // -1 lands back in the cab
          state.panel = false;
          return;
        }
      }
      for (const q of state.hit.hitSections || []) {
        if (px >= q.x0 && px <= q.x1 && Math.abs(py - q.y) < 14 * (hud.width / 1200)) {
          // ▶, then ◀, then back to first come, first served
          const p = traffic.prefer[q.i] || 0;
          traffic.prefer[q.i] = p === 0 ? 1 : p === 1 ? -1 : 0;
          return;
        }
      }
      for (const g of state.hit.hitSignals || []) {
        if (Math.hypot(px - g.x, py - g.y) <= g.r) {
          const key = Math.round(g.m);
          if (traffic.holds.has(key)) traffic.holds.delete(key);
          else traffic.holds.add(key);
          return;
        }
      }
      panDrag = [e.clientX, e.clientY];
      cv.setPointerCapture(e.pointerId);
      return;
    }
    // A click on the desk. The instrument face is one quad with a known UV,
    // so the ray hits the plane, the plane position gives u and v, and u,v
    // is the same canvas pixel the switch was drawn at.
    if (state.cabFace && state.cabHits && state.cabHits.length && state.invVPCab) {
      const r = cv.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = 1 - ((e.clientY - r.top) / r.height) * 2;
      const un = (z) => {
        const p = M4.apply(state.invVPCab, [nx, ny, z, 1]);
        return [p[0]/p[3], p[1]/p[3], p[2]/p[3]];
      };
      const o = un(-1), f = norm(sub(un(1), o));
      const [A, B, D] = [state.cabFace[0], state.cabFace[1], state.cabFace[3]];
      const e1 = sub(B, A), e2 = sub(D, A);
      const nrm = cross(e1, e2);
      const den = f[0]*nrm[0] + f[1]*nrm[1] + f[2]*nrm[2];
      if (Math.abs(den) > 1e-6) {
        const ao = sub(A, o);
        const t = (ao[0]*nrm[0] + ao[1]*nrm[1] + ao[2]*nrm[2]) / den;
        if (t > 0) {
          const p = add(o, scale(f, t)), rp = sub(p, A);
          const u = (rp[0]*e1[0] + rp[1]*e1[1] + rp[2]*e1[2])
                  / (e1[0]*e1[0] + e1[1]*e1[1] + e1[2]*e1[2]);
          const v = (rp[0]*e2[0] + rp[1]*e2[1] + rp[2]*e2[2])
                  / (e2[0]*e2[0] + e2[1]*e2[1] + e2[2]*e2[2]);
          if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
            const px = u * panelCanvas.width, py = v * panelCanvas.height;
            for (const h of state.cabHits) {
              if (px < h.x || px > h.x + h.w || py < h.y || py > h.y + h.h) continue;
              if (h.id === "feny")  state.lights = (state.lights + 1) % 3;
              if (h.id === "torlo") { state.wiperAuto = false; state.wiper = (state.wiper + 1) % 3; }
              // the switch selects which horn; H sounds whichever is chosen
              if (h.id === "kurt") {
                state.hornMode = (state.hornMode + 1) % 4;
                state.hornUntil = performance.now() + 700;
              }
              if (h.id === "eber")  driver.acknowledge();
              // a driver can open the doors whenever the train is standing
              if (h.id === "ajto" && driver.v < 0.3) driver.doors = driver.doors ? 0 : 1;
              if (h.id === "homok") driver.sand = !driver.sand;
              state.cabClick = { id: h.id, at: performance.now() };
              return;
            }
          }
        }
      }
    }
    drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId);
  });
  // A drag ends however it ends — a release outside the window, a lost
  // capture, the tab switching — or it stayed "stuck" until the next click
  const endDrag = () => {
    if (mapDrag) {
      if (!mapDrag.moved && state.map) {
        const px = mapDrag.px, py = mapDrag.py;
        // 1. Click on a live tram badge or signboard on the map
        if (state.hitMapTrams && state.hitMapTrams.length) {
          for (const ht of state.hitMapTrams) {
            const inBox = (ht.bx !== undefined)
              ? (px >= ht.bx && px <= ht.bx + ht.w && py >= ht.by && py <= ht.by + ht.h)
              : (Math.hypot(px - ht.x, py - ht.y) <= ht.r);
            if (inBox || Math.hypot(px - ht.x, py - ht.y) <= ht.r) {
              if (window.__boardTram) window.__boardTram(ht.ri, ht.dep, true);
              mapDrag = null;
              return;
            }
          }
        }

        // 2. Click on a live train badge or signboard on the map
        if (state.hitMapTrains && state.hitMapTrains.length) {
          for (const ht of state.hitMapTrains) {
            const inBox = (ht.bx !== undefined)
              ? (px >= ht.bx && px <= ht.bx + ht.w && py >= ht.by && py <= ht.by + ht.h)
              : (Math.hypot(px - ht.x, py - ht.y) <= ht.r);
            if (inBox || Math.hypot(px - ht.x, py - ht.y) <= ht.r) {
              if (traffic.trains.includes(ht.train) && window.__takeOver) {
                state.map = false; state.mapPin = null;
                window.__takeOver(ht.train);
                mapDrag = null;
                return;
              }
            }
          }
        }

        // 3. Drop pin anywhere on the map
        if (state.mapTransform && state.mapTransform.full && state.mapTransform.fromMap) {
          const { mx, my, mw, mh } = state.mapTransform;
          if (px >= mx && px <= mx + mw && py >= my && py <= my + mh) {
            const [wx, wy] = state.mapTransform.fromMap(px, py);
            let bestPlace = null, bestDist = 650;
            for (const p of routeData.places || []) {
              if (!p.xy) continue;
              const d = Math.hypot(p.xy[0] - wx, p.xy[1] - wy);
              if (d < bestDist) { bestDist = d; bestPlace = p.name; }
            }
            state.mapPin = { x: wx, y: wy, name: bestPlace || (wy < 5000 ? "Budaörs / Dél-Buda" : "Budapest") };
          }
        }
      }
      mapDrag = null;
    }
    drag = null; panDrag = null;
  };
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);
  cv.addEventListener("lostpointercapture", endDrag);
  addEventListener("blur", endDrag);
  // Two fingers pinch the zoom, the way the wheel does. While two are down
  // the one-finger look-around is off, or the view would spin as you pinch.
  const fingers = new Map();
  let pinch0 = 0;
  cv.addEventListener("pointerdown", e => {
    if (e.pointerType !== "touch") return;
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size === 2) { const [a, b] = [...fingers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); drag = null; }
  });
  cv.addEventListener("pointermove", e => {
    if (!fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fingers.size !== 2 || pinch0 <= 0) return;
    const [a, b] = [...fingers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    drag = null;
    if (state.panel) {
      const v = state.panelView;
      v.zoom = Math.max(1, Math.min(14, v.zoom * d / pinch0));
    } else state.zoom = Math.max(0.35, Math.min(6.0, state.zoom * d / pinch0));
    pinch0 = d;
  });
  const lift = e => { fingers.delete(e.pointerId); if (fingers.size < 2) pinch0 = 0; };
  cv.addEventListener("pointerup", lift);
  cv.addEventListener("pointercancel", lift);
  cv.addEventListener("wheel", e => {
    e.preventDefault();
    if (state.map) {
      const zoomSpeed = 1.18;
      const curZoom = state.mapZoom || 1.0;
      state.mapZoom = Math.max(1.0, Math.min(6.0, curZoom * (e.deltaY < 0 ? zoomSpeed : 1 / zoomSpeed)));
      return;
    }
    if (state.panel) {
      const v = state.panelView;
      v.zoom = Math.max(1, Math.min(14, v.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      return;
    }
    // zoom the view itself, which is what a wheel is for
    const k = Math.exp(-e.deltaY * 0.0016);
    state.zoom = Math.max(0.35, Math.min(6.0, state.zoom * k));
  }, { passive: false });
  cv.addEventListener("pointermove", e => {
    if (mapDrag) {
      const dx = e.clientX - mapDrag.startX;
      const dy = e.clientY - mapDrag.startY;
      if (Math.hypot(dx, dy) > 4) {
        mapDrag.moved = true;
      }
      // by steps from the last position (drawMap holds the pan to the map's
      // edges each frame, so there is no dead zone to drag back through)
      const k = hud.width / cv.getBoundingClientRect().width;
      state.mapPanX = (state.mapPanX || 0) + (e.clientX - mapDrag.lastX) * k;
      state.mapPanY = (state.mapPanY || 0) + (e.clientY - mapDrag.lastY) * k;
      mapDrag.lastX = e.clientX; mapDrag.lastY = e.clientY;
      return;
    }
    if (panDrag) {
      const v = state.panelView;
      const td = routeData.track_down;
      const span = (td[td.length - 1][3] - td[0][3]) / 1000 / v.zoom;
      v.pan -= (e.clientX - panDrag[0]) / cv.clientWidth * span;
      panDrag = [e.clientX, e.clientY];
      return;
    }
    if (!drag) return;
    if (e.buttons === 0) { drag = null; return; }       // released where we did not hear it
    state.wreckCam = null;                               // (you take the camera from the wreck's)
    state.yaw += (e.clientX - drag[0]) * 0.004;
    state.pitch = Math.max(-1.1, Math.min(1.1, state.pitch - (e.clientY - drag[1]) * 0.003));
    drag = [e.clientX, e.clientY];
  });
}
