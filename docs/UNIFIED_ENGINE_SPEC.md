# Unified "One World" Multi-Modal Engine Specification
*Dunakanyar Szimulátor — Architectural Blueprint & Engineering Design*
*Target Audience: Future developers, session continuations, and automated coding agents*

---

## 1. Vision & Core Philosophy

The goal of the **Unified Engine** is to dissolve the artificial boundaries between isolated line sandboxes (`line70`, `line2`, `s21`) and bring the entire Budapest agglomeration, the Danube Bend, and the surrounding mountain ranges into **one continuous, living, multi-modal world**.

### Core Tenets:
1. **Zero Runtime Dependencies**: Hand-written WebGL2, zero external 3D frameworks.
2. **One Shared Coordinate Space**: Every railway line, tram line, road, building, and tree references a single global metric frame.
3. **Simultaneous Multi-Modal Transit**: Heavy suburban rail (MÁV Lines 70, 2, 71, S21), suburban rapid transit (MÁV-HÉV H5), urban trams (BKK 4/6, 1, 2), and narrow-gauge forestry rail (Királyréti kisvasút) run concurrently to their real timetables.
4. **Instant Vehicle Hopping**: The player can switch cabs, passenger seats, or fly/drive modes between any active vehicle across the region at any second.
5. **Data over Invention**: Geometry is synthesized directly from OpenStreetMap, SRTM elevation models, MÁV official timetables, and the Budapest BP Fatár tree cadastre.

---

## 2. Master Geodesic Projection & Coordinate System

### 2.1. The Single Global Origin $(W_0, S_0)$
All spatial data across the entire simulation is mapped using a single standard meridian and reference parallel:
*   $\text{FRAME\_LAT} = 47.5000^\circ\text{ N}$ (Budapest central latitude)
*   $W_0 = 18.6500^\circ\text{ E}$ (Western boundary, covering Esztergom and western Pilis)
*   $S_0 = 46.9500^\circ\text{ N}$ (Southern boundary, south of Lajosmizse)
*   $E_1 = 19.6500^\circ\text{ E}$ (Eastern boundary, east of Vácrátót and Cegléd)
*   $N_1 = 47.9500^\circ\text{ N}$ (Northern boundary, north of Szob and Királyrét)

Total regional coverage: $\approx 75\text{ km} \times 111\text{ km} = 8,325\text{ km}^2$.

### 2.2. Metric Conversion Formulas
Using the WGS84 geodesic constants from `tools/geo.py`:
$$\begin{aligned}
M_\text{lat} &= 111,183.844\text{ m/degree} \\
M_\text{lon} &= 75,101.611\text{ m/degree}
\end{aligned}$$

Every geographic coordinate $(\text{lat}, \text{lon})$ transforms directly to WebGL world coordinates $(x, y, z)$:
$$\begin{aligned}
x &= (\text{lon} - W_0) \times M_\text{lon} \quad &&(\text{East}) \\
y &= \text{ASL Elevation} \quad &&(\text{Up}) \\
z &= -(\text{lat} - S_0) \times M_\text{lat} \quad &&(\text{South, negative North})
\end{aligned}$$

*Benefit*: Zero frame shifts, zero origin rebaking issues (NOTES Trap 3 and Trap 14 eliminated permanently).

---

## 3. Multi-Modal Network Graph

### 3.1. Route Topology
The simulation maintains a collection of named `RouteSpline` instances:

```
[Master Network Graph]
  ├── Heavy Rail
  │     ├── Line 70 (Nyugati ⇄ Szob) [Double track, 25 kV AC]
  │     ├── Line 2  (Nyugati ⇄ Esztergom) [Single/double track, 25 kV AC]
  │     ├── Line 71 (Rákospalota-Újpest ⇄ Vác) [Single track, 25 kV AC]
  │     ├── Line S21 (Nyugati ⇄ Lajosmizse) [Single/double, Diesel past KÖKI]
  │     └── Körvasút & Ferencváros Connection (Keleti / Rákosrendező ⇄ Kelenföld)
  ├── Suburban HÉV
  │     └── H5 (Batthyány tér ⇄ Szentendre) [Double track, 1000 V DC]
  ├── BKK Urban Trams
  │     ├── Tram 4/6 (Nagykörút: Széll Kálmán tér ⇄ Móricz / Fehérvári út) [Combino Supra]
  │     ├── Tram 1 (Hungária ring: Bécsi út ⇄ Árpád híd ⇄ Rákóczi híd ⇄ Kelenföld) [CAF Urbos 54m]
  │     ├── Tram 2 (Danube bank: Jászai Mari tér ⇄ Kossuth tér ⇄ Közvágóhíd) [KCSV-7 / Ganz ICS]
  │     ├── Tram 3 (Outer Pest ring: Mexikói út M ⇄ Nagy Lajos király útja ⇄ Kőbánya ⇄ Ecseri út ⇄ Gubacsi út) [TW 6000 "Hannoveri" / CAF]
  │     └── Tram 56/56A/61 (Buda greenway: Kelenföld vasútállomás M / Móricz ⇄ Déli pu. ⇄ Széll Kálmán tér ⇄ Pasarét ⇄ Hűvösvölgy) [Tatra T5C5 / CAF]
  └── Forestry Narrow Gauge
        └── Királyréti Erdei Vasút (Kismaros ⇄ Királyrét) [760 mm gauge, diesel]
```

### 3.2. Data Structure: `MultiRoute`
```javascript
export class MultiRoute {
  constructor() {
    this.routes = new Map(); // id -> Route
  }
  register(id, routeData) {
    this.routes.set(id, new Route(routeData));
  }
  get(id) {
    return this.routes.get(id);
  }
}
```

---

## 4. Fleet Management & Vehicle Entity Model

### 4.1. The `Vehicle` Class
Every active train, tram, diesel railcar, and AI traffic unit is an instance of `Vehicle`:

```javascript
export class Vehicle {
  constructor({ id, lineId, route, stock, dir = 1, startM = 0, isPlayer = false }) {
    this.id = id;
    this.lineId = lineId;
    this.route = route;
    this.stock = stock;
    this.dir = dir;
    this.m = startM;
    this.v = 0;
    this.isPlayer = isPlayer;
    this.driver = new Driver(route, stock);
    this.driver.m = startM;
    this.driver.dir = dir;
    this.driverMode = isPlayer ? "MANUAL" : "AUTO";
  }

  step(dt, headwind) {
    if (this.driverMode === "AUTO") {
      this.driver.stepAuto(dt, headwind);
    } else {
      this.driver.stepManual(dt, headwind);
    }
    this.m = this.driver.m;
    this.v = this.driver.v;
  }

  get position() {
    return this.route.at(this.m);
  }

  get tangent() {
    return this.route.tangent(this.m);
  }
}
```

### 4.2. Fleet Manager
```javascript
export class FleetManager {
  constructor(multiRoute) {
    this.multiRoute = multiRoute;
    this.vehicles = [];
    this.playerVehicle = null;
  }

  addVehicle(v) {
    this.vehicles.push(v);
    if (v.isPlayer) this.playerVehicle = v;
  }

  hopTo(vehicleId, asDriver = true) {
    const target = this.vehicles.find(v => v.id === vehicleId);
    if (!target) return false;
    
    // Hand old vehicle back to AI timetable
    if (this.playerVehicle) {
      this.playerVehicle.isPlayer = false;
      this.playerVehicle.driverMode = "AUTO";
    }

    // Assume control of new vehicle
    this.playerVehicle = target;
    target.isPlayer = true;
    target.driverMode = asDriver ? "MANUAL" : "AUTO";
    return true;
  }
}
```

---

## 5. The "Hop" Mechanics: UI & Interaction

### 5.1. Live Radar Map (`TAB` Key)
*   Pressing `TAB` toggles the full agglomeration radar overlay.
*   The map displays all tracks and all moving entities in real-time.
*   Entity markers are clickable:
    *   **Clicking a marker** opens a popover showing:
        *   Line name & Destination (e.g., `S70 · Vác felé`, `4-es villamos · Széll Kálmán tér`)
        *   Speed & Current Lateness (`82 km/h · +1:15`)
        *   Rolling stock type (`Stadler KISS`, `MÁV 416 Uzsgyi`, `Combino`)
        *   Actions: `[ Vezetés / Cab ]` (sets driver mode), `[ Utazás / Passenger ]` (sets passenger view), `[ Kilátás / Chase ]`.

### 5.2. Walk & Hop (Proximity Boarding)
*   When standing on a station platform (e.g. Nyugati platform 4) or on the street:
*   Pressing `F` or clicking an on-screen prompt when within 15 meters of an idle or calling train/tram immediately boards that vehicle.

### 5.3. Hotkey Vehicle Cycling
*   `[` / `]`: Cycle between vehicles within 5 km of the player.
*   `Shift + [` / `Shift + ]`: Filter by type (Train ⇄ Tram ⇄ Car ⇄ Plane).

---

## 6. Terrain & Geometry Streaming Architecture

### 6.1. Two-Tier Terrain
1.  **Macro Regional DEM**:
    *   Single $2048 \times 2048$ 16-bit texture covering the entire $8,325\text{ km}^2$ bounding box at $\approx 40\text{ m}$ per pixel.
    *   Always bound on texture unit 1. Provides distant skyline (Visegrád, Pilis, Börzsöny, Naszály).
2.  **Streamed Micro DEM & Land Cover Tiles**:
    *   $4\text{ km} \times 4\text{ km}$ tiles matching the existing `CityTiles` grid.
    *   Carries high-resolution ($10\text{ m}$) filtered ground elevation and 16-class land cover.
    *   Loaded within $8\text{ km}$ of the active camera.

### 6.2. City & Infrastructure Streaming
*   The existing [city.js](../web/src/city.js) `CityTiles` manager already streams buildings, building parts, BP Fatár trees, and extra infrastructure.
*   In the unified engine, `CityTiles` coordinates are expressed directly in master world meters $(x, z)$ with zero coordinate conversion factors (`kx = 1, ky = 1`).

---

## 7. Performance Budget & Level-of-Detail (LOD)

To maintain 60 FPS across the entire agglomeration:

| Distance from Camera | Track & Corridor | Train / Tram Meshes | Physics & Simulation | Audio |
| :--- | :--- | :--- | :--- | :--- |
| **0 – 3.5 km** | Full 3D rails, sleepers, ballast, catenary wires | Detailed multi-car procedural mesh, illuminated windows | 60 Hz kinematic integration, adhesion, EVM | Full synthesized audio (VVVF, horn, joints) |
| **3.5 – 10 km** | Simplified ballast ribbon, no overhead wires | Low-poly instanced silhouette box | 10 Hz block progression | Silent |
| **> 10 km** | Discarded | Discarded (radar map icon only) | Mathematical schedule interpolation | Silent |

---

## 8. Implementation Steps for Next Session

1.  **Run `tools/geo.py` verification** to establish official master constants $W_0, S_0, \text{FRAME\_LAT}$.
2.  **Create `tools/bake_unified_world.py`** to output the regional macro DEM.
3.  **Refactor `route.js` and `traffic.js`** to introduce `MultiRoute` and `FleetManager`.
4.  **Extract Tram 4/6 and Tram 1** centerlines from existing `data/raw/city/` Overpass extracts.
5.  **Hook the `TAB` radar UI** to allow clicking any vehicle to hop.
