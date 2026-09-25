# Implementation Plan: 25 Sep Prenight Feedback
*Detailed Technical Breakdown & Code Diffs for `feedback-0925prenight-dev.md`*
*Target Audience: Developer / Coding Agent resuming session*

---

## 1. Overview of Feedback Items

This plan breaks down each of the 19 points raised in [feedback-0925prenight-dev.md](file:///Users/marktremmel/Downloads/vas%C3%BAt%20copy%204%20-%20the%20dark%20timeline%20-%20antigravity/feedback-0925prenight-dev.md), identifies the root cause in the current codebase, and provides exact implementation instructions.

---

## 2. High-Impact Fixes (Game Breaking or Visual Bugs)

### Item 1: Full Screen Mode Missing
*   **The Issue**: No fullscreen button or keyboard shortcut exists in the UI. Promotional video/screenshots have browser UI chrome.
*   **Root Cause**: `requestFullscreen()` is never called in `web/index.html` or `web/src/input.js`.
*   **Implementation**:
    1.  Add `F11` key handler and `⛶` button to `#modebar`:
    ```javascript
    // In web/src/input.js or web/index.html
    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
    // Bind to KeyF11 or dedicated button
    if (e.code === "F11") { e.preventDefault(); toggleFullscreen(); }
    ```
    2.  Add a `⛶` button to `#modebar` in `web/index.html`:
    ```html
    <button id="fsBtn" title="Teljes képernyő (F11)" data-en-title="Fullscreen (F11)">⛶</button>
    ```

---

### Item 2: FLIRT Passenger Window Seat Looks into Emptiness
*   **The Issue**: In passenger mode (`Y`), FLIRT has no windows and looks into emptiness or solid roof.
*   **Root Cause**: In [main.js (lines 2435-2441)](../web/src/main.js), the passenger eye position is hardcoded for the double-decker KISS:
    *   `carLen = 25.0` (KISS length; FLIRT is $18.5\text{ m}$)
    *   `eye = c[2] + 3.15` (KISS upper-deck window height; FLIRT is single-deck with window band at $1.22\text{ m} - 2.22\text{ m}$)
    At $3.15\text{ m}$, the camera inside a FLIRT sits above the ceiling ($CAR\_H[FLIRT] = 4.12\text{ m}$, roof chamfer at $3.80\text{ m}$) looking through the roof.
*   **Implementation**:
    In `main.js`:
    ```javascript
    const stockName = driver.stock.stock; // "KISS", "FLIRT", "EC", "FREIGHT"
    const isDoubleDeck = stockName === "KISS";
    const carLen = CAR_LEN[stockName] || 25.0;
    const windowH = isDoubleDeck ? 3.15 : (stockName === "FLIRT" ? 1.75 : 2.10);
    const off = ps.side * (stockName === "FLIRT" ? 0.88 : 0.72);
    eye = [c[0] + rx * off, c[2] + windowH, -(c[1] + ry * off)];
    ```

---

### Item 3: Népsziget Bridge Duplication & Underwater Pillars
*   **The Issue**: Two bridges glitching over Népsziget bay; pillars of the Northern Railway Bridge (Északi összekötő) appear sticking out of dry ground or out of water.
*   **Root Cause**:
    1.  In `bake_context.py` (lines 1241-1249), `q_landmark_ways.ql` extracts both the Danube spans and the bay spans. If a road or rail bridge way exists in both OSM context and `anchors`, `buildRoads` in `geom.js` draws an extruded concrete deck while `landmarks.js` draws the green steel Warren truss `eszakivasut` on top.
    2.  In [landmarks.js line 780](../web/src/landmarks.js):
        `box(x0 - 5.0, x0 + 5.0, -7.5, 7.5, 0, 10.5, PIER, PIER)`
        Pier bases start at $w = 0$, which evaluates to $g = \text{waterAt} - 2.78\text{ m}$. In shallow water or riverbed shelves, this does not sink deep enough into the riverbed sediment.
*   **Implementation**:
    1.  Deduplicate: Ensure railway ways tagged `railway=bridge` in `context.json` are skipped by `buildRoads` when an `anchor.key === "eszakivasut"` covers that range.
    2.  Deepen the piers: extend pier base down to $w = -8.0\text{ m}$ below the water plane:
        ```javascript
        box(x0 - 5.0, x0 + 5.0, -7.5, 7.5, -8.0, 10.5, PIER, PIER);
        ```

---

### Item 4: Flying Plane Doesn't Tilt / Roll & Lacks Crash Effects
*   **The Issue**: When banking the aircraft with A/D, the world and cockpit do not roll. Crashing into a building or mountain triggers a text message without visual impact.
*   **Root Cause**:
    1.  In [main.js line 2669](../web/src/main.js), the camera view matrix hardcodes world-up:
        `const view = M4.lookAt(camEye, at, [0, 1, 0]);`
        It completely ignores `pl.roll` from `aircraft.js`.
    2.  Crash handling only sets `state.messages.push(...)`.
*   **Implementation**:
    1.  Apply roll to the camera's `up` vector when flying:
        ```javascript
        let camUp = [0, 1, 0];
        if (state.plane && state.plane.active && !state.photo) {
          const roll = state.plane.roll;
          const rcy = Math.cos(roll), rsy = Math.sin(roll);
          // Rotate up vector about camera forward axis
          const right = norm(cross(fwd, [0, 1, 0]));
          camUp = norm(add(scale([0, 1, 0], rcy), scale(right, rsy)));
        }
        const view = M4.lookAt(camEye, at, camUp);
        ```
    2.  Add crash visual FX: trigger a red vignette flash (`#flash` element) and camera vibration shake for 0.8 seconds on impact.

---

### Item 5: Sightseeing vs. Settings Tab Overlap
*   **The Issue**: Clicking simulator dropdowns or settings tabs in the panel is impossible because sightseeing / camera view controls overlap the `#tabs` header.
*   **Root Cause**: In [web/index.html line 85 and 267](../web/index.html), `#modebar` has `z-index: 7` while `#panel` has `z-index: 5`. When `#modebar` wraps or is displayed on screens $< 1100\text{px}$, it covers `#panel`'s tab bar.
*   **Implementation**:
    1.  Raise `#panel`'s `z-index` to `15` so panel tabs and dropdowns always sit above the background modebar:
        ```css
        #panel { position: absolute; left: 14px; top: 12px; z-index: 15; ... }
        ```
    2.  Add CSS margin to prevent `#modebar` from drifting into the left 320px column occupied by `#panel`.

---

### Item 6: Ground Color Never Changes Across Seasons
*   **The Issue**: Driving through autumn or winter, the ground alongside the train stays lush summer green.
*   **Root Cause**:
    *   The corridor mesh ($124\text{ m}$ each side of the track) is rendered with `TRACK_VS` / `TRACK_FS`.
    *   In [shaders.js line 1143](../web/src/shaders.js), `TRACK_FS` **does not have the `uSeason` uniform**!
    *   Vertices are baked with static `COVER_COL` and never receive the autumn copper or winter frost color modulation that `TERRAIN_FS` receives.
*   **Implementation**:
    1.  Add `uniform vec4 uSeason;` to `TRACK_FS`.
    2.  In `TRACK_FS`, apply seasonal color blending to ground fragments:
        ```glsl
        // Autumn copper/gold tint
        col = mix(col, col * vec3(1.10, 1.02, 0.80), uSeason.y * 0.85);
        // Winter dormancy / desaturation
        col = mix(col, col * vec3(0.86, 0.88, 0.94), (1.0 - uSeason.x) * 0.55);
        // Spring freshness
        col = mix(col, col * vec3(1.02, 1.14, 0.86), uSeason.z * 0.40);
        ```
    3.  In `main.js`, upload `gl.uniform4fv(pTrk.u.uSeason, season4);` in the track rendering pass.

---

### Item 7: Tree Variety & Crown Shape (Poplar "Spike" Issue)
*   **The Issue**: Certain trees look like tall cylindrical columns or spikes (especially apparent at the Zoo and along roads); trunks and branches lack visual separation from leaves.
*   **Root Cause**:
    *   Species 6 (poplar) in [shaders.js lines 1528-1530](../web/src/shaders.js) has `canopyFrom = 0.10`, making it a solid green billboard down to the ground.
    *   Branches only render when `leaf < 0.75` (autumn/winter). In summer, no branch network is visible inside the canopy.
*   **Implementation**:
    1.  Increase poplar `canopyFrom` to `0.22` so the grey-white trunk is visible below the crown.
    2.  Add a gentle flame-shaped taper with vertical fluttering lobes:
        ```glsl
        } else if (sp == 6) { // Poplar (jegenyenyár)
          base_ = 0.28; tip = 0.04; power = 1.65; lobeAmp = 0.045; lobeFreq = 18.0;
          canopyFrom = 0.22; trunkW = 0.042;
        }
        ```
    3.  Give the canopy an internal branch shadow lattice even in summer so trees look structured, not flat green billboards.

---

## 3. Data & Feature Enhancements

### Item 8: Ócsa Hydrocarbon Extraction Wells (*Szénhidrogén kút*)
*   **Context**: The oil/gas fields around Ócsa, Inárcs, and Dabas have genuine operating beam pumps (pumpjacks / *bókoló kút*) operated by MOL.
*   **Task**:
    1.  Update `tools/q_structures.ql` and `q_s21_extras.ql` to include:
        `node["man_made"="petroleum_well"](area.a);`
        `node["industrial"="well"](area.a);`
    2.  In `structures.js`, add a dedicated animated or static pumpjack 3D mesh (steel A-frame walking beam, counterweight, horse-head, wellhead).

---

### Item 9: Fót Infrastructure & Highway Logistics
*   **Context**: Fót hosts major logistics centers (East Gate Business Park, HelloParks Fót) along the M0/M3 junction.
*   **Task**:
    1.  Ensure `q_industry.ql` extracts industrial halls with footprint $> 20,000\text{ m}^2$ in the Fót area with 14m-18m modern logistics cladding.
    2.  Ensure M0 and M3 highway ways carry `lanes=3` or `4` with wide dual-carriageway road meshes and overhead gantry signage.

---

### Item 10: Western Danube Bank (Szentendre & Pilis Villages)
*   **Context**: Szentendre, Leányfalu, and Tahitótfalu on the west bank of the Danube are currently outside Line 70's extraction bounds.
*   **Task**:
    *   Include them in the master dataset defined in `UNIFIED_ENGINE_SPEC.md` ($W_0 = 18.65^\circ\text{ E}$).
    *   Extract HÉV H5 track geometry connecting Batthyány tér to Szentendre.

---

### Item 11: Touch & Mobile Controls Polish
*   **Tasks**:
    1.  Replace OS emoji arrows (`◀`, `▶`) in `#touch` with crisp SVG chevrons or font icons (`&lsaquo;`, `&rsaquo;`).
    2.  Add a touch plane selector button cycling through Cessna, Gripen, and Helicopter without needing keyboard keys `1`, `2`, `3`.
    3.  Add 2-finger pinch gesture in `web/src/input.js` to adjust `state.zoom`.

---

## 4. Execution Sequence for Resuming Session

When the next development session begins:
1.  **Apply Immediate Quick Wins (15 mins)**:
    *   Add Fullscreen toggle (Item 1).
    *   Fix FLIRT passenger window camera height and car length (Item 2).
    *   Add `uSeason` to `TRACK_FS` (Item 6).
    *   Fix UI `#panel` z-index (Item 5).
2.  **Apply Flight & Visual Fixes (20 mins)**:
    *   Add aircraft roll to camera up-vector (Item 4).
    *   Refine tree shader poplar shape and trunk visibility (Item 7).
    *   Deepen bridge piers in `eszakivasut` (Item 3).
3.  **Run Pipeline Tests**:
    *   Execute `python3 tools/build_sim.py` and `node tools/test_sim.mjs`.
    *   Verify all 28 automated checks continue passing cleanly.
