# The Dark Timeline: High-Impact Events & Disaster Simulation Spec
*Dunakanyar Szimulátor — Physics, Apocalypse Scenarios & Destruction Engine Architecture*
*Date: 25 September 2026*

---

## 1. Executive Summary & Creative Vision

### 1.1. Why High-Impact Events Belong in *Dunakanyar Szimulátor*
The folder housing this project is named:
```
vasút copy 4 - the dark timeline - antigravity
```
For weeks, the project has meticulously modeled the peaceful, sunny, real-world reality of MÁV lines 70, 2, and S21: real timetables, gentle Danube morning mists, accurate signals, and the serene flight of a Cessna over the Börzsöny hills.

Yet in the grand tradition of simulation gaming—pioneered by Will Wright in *SimCity (1989)* and continued through *SimCity 2000/4*, *Cities: Skylines - Natural Disasters*, *Teardown*, and *Nuclear War Simulator / NUKEMAP*—the ultimate test of an intricate, living civil system is **what happens when catastrophe strikes**.

Simulating disaster is not morbid—it is the foundational discipline of **civil defense, structural engineering, and disaster management (Katasztrófavédelem)**. It asks:
* What forces does it take to physically alter geography (e.g. move a mountain into the Danube)?
* How resilient is Budapest’s infrastructure when the Danube surges by 12 meters, or when an earthquake liquifies the alluvial silt of Pest?
* How does an electric railway network behave when an EMP or a 160 km/h derecho storm snaps overhead catenary wires?
* And on the playful side: what happens when classic late-90s *SimCity* absurdity (orbital lasers, giant river monsters, meteor strikes) meets our retro WebGL2 procedural world?

This document outlines the **geotechnical physics**, the **scenario catalog**, and the **exact WebGL2 / Web Audio shader and code architecture** to introduce high-impact events non-destructively into the simulator.

---

## 2. Geotechnical & Physics Deep Dive: "How Much Does It Take to Move a Hill?"

A central question in high-impact scenario modeling is the physical energy budget required to deform terrain, blast a crater, or trigger a mountain flank collapse.

### 2.1. Case Study 1: Moving or Leveling Gellért-hegy (Buda)

#### Physical Dimensions & Mass:
* **Height**: $\approx 130\text{ m}$ above the Danube surface ($235\text{ m}$ a.s.l.).
* **Footprint**: $\approx 800\text{ m} \text{ (long axis)} \times 500\text{ m} \text{ (short axis)}$.
* **Geometric Approximation**: Elliptic semi-cone.
  $$V \approx \frac{1}{3} \pi a b h = \frac{1}{3} \pi (400) (250) (130) \approx 1.36 \times 10^7\text{ m}^3 \quad (13.6\text{ million cubic meters})$$
* **Geological Composition**: Triassic dolomite, dolomitic marl.
* **Density ($\rho$)**: $\approx 2,650\text{ kg/m}^3$.
* **Total Mass ($M$)**:
  $$M = \rho \cdot V \approx 2,650 \times 1.36 \times 10^7 \approx 3.60 \times 10^{10}\text{ kg} \quad (36\text{ million metric tons})$$

#### Energy Budget to Displace / Excavate:
1. **Gravitational Potential Energy Alone** (raising/scattering the mass by its center of mass height $\Delta h \approx 100\text{ m}$):
   $$E_\text{grav} = M g \Delta h = (3.6 \times 10^{10}\text{ kg}) \times (9.81\text{ m/s}^2) \times (100\text{ m}) \approx 3.53 \times 10^{13}\text{ Joules}$$
   $$\text{Equivalent TNT Yield} = \frac{3.53 \times 10^{13}\text{ J}}{4.184 \times 10^{12}\text{ J/kt}} \approx 8.44\text{ Kilotons of TNT}$$
2. **Rock Fracture & Pulverization Work** (cohesive shear strength and comminution of dolomite rock mass, specific fracture energy $\approx 5 \times 10^5\text{ J/m}^3$):
   $$E_\text{fracture} = V \times 5 \times 10^5\text{ J/m}^3 \approx 6.8 \times 10^{12}\text{ Joules} \approx 1.6\text{ Kilotons of TNT}$$
3. **Kinetic Ejection Energy** (scattering debris over a 1–2 km radius at $v \approx 150\text{ m/s}$):
   $$E_\text{kin} = \frac{1}{2} M v^2 = \frac{1}{2} (3.6 \times 10^{10}) \times (150)^2 \approx 4.05 \times 10^{14}\text{ Joules} \approx 96.8\text{ Kilotons of TNT}$$

#### Physics Conclusion for Gellért-hegy:
To completely obliterate or "move" Gellért-hegy requires **$\approx 100\text{ to } 150\text{ Kilotons of TNT}$** of coupled ground-burst energy (approx. 7–10 Hiroshima-class weapons, or a single standard modern W76 warhead detonated as a subsurface ground penetrator). Alternatively, it corresponds to the kinetic energy of a **$25\text{-meter diameter iron meteorite}$** impacting at $20\text{ km/s}$.

---

### 2.2. Case Study 2: The Szent Mihály-hegy Flank Collapse (Dunakanyar - Line 70)

Unlike Gellért-hegy in the city, the Danube Bend (Dunakanyar) possesses massive **inherent gravitational instability** along the Börzsöny volcanic andesite formations.

#### Historical Precedent:
In **June 2020**, torrential rainfall saturated the slopes of Szent Mihály-hegy at Dömösi átkelés. Over $10,000\text{ m}^3$ of mud, andesite boulders, and trees broke loose, completely burying MÁV Line 70, pushing one track toward the river, and suspending international EuroCity traffic to Bratislava/Prague for weeks.

#### The Mega-Landslide Scenario ("A Börzsönyi Hegyomlás"):
* **Flank Volume**: $1.5 \times 10^8\text{ m}^3$ ($150\text{ million m}^3$ of volcanic rock).
* **Mass**: $\approx 4.05 \times 10^{11}\text{ kg}$ (400 million tons).
* **Trigger Mechanism**: It does **not** take a nuclear blast to move this mountain! The potential energy is already stored in the mountain ($E_\text{pot} \approx 1.2 \times 10^{15}\text{ Joules}$). A **Magnitude 5.8 earthquake** along the Mid-Hungarian Fault Zone or a 200 mm cloudburst lubricating the bentonitic tuff boundary layer can trigger a catastrophic shear failure.
* **Cascading Chain Reaction**:
  1. The entire riverfront wall collapses into the 350-meter-wide Danube gorge at Dömös.
  2. The slide creates a **natural rockfill dam $60\text{ meters high}$** across the Danube.
  3. **Upstream Inundation**: Within 36 hours, the Danube backs up into an inland sea, completely drowning Nagymaros, Zebegény, Szob, and Štúrovo/Esztergom.
  4. **The Outburst Flood (Cunami)**: When the water overtops the loose rock dam, hydraulic piping causes a catastrophic dam breach. A **$15\text{-meter wall of water}$** surges down through Vác, Dunakeszi, and slams into Budapest, overtopping the Margaret Island dikes and flooding the Pest riverbank up to the Grand Boulevard (Nagykörút).

---

## 3. The Disaster Catalog: "The Dark Timeline" Scenarios

Here are six high-impact scenarios designed for *Dunakanyar Szimulátor*, ranging from hyper-realistic civil engineering crises to retro *SimCity*-style fun.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        THE DARK TIMELINE: EXPANDED SCENARIO MATRIX                     │
├────────────────────────┬──────────────────────────┬────────────────────────────────────┤
│ Conventional Ordnance  │ Sub-Strategic & Nuclear  │ Extreme Geophysical / Sci-Fi       │
├────────────────────────┼──────────────────────────┼────────────────────────────────────┤
│ • GBU-31 JDAM (2000lb) │ • 1 kt Tactical (B61)    │ • Szent Mihály Megalandslide & Dam │
│ • Spice 2000 / GBU-28  │ • 10 kt Iskander-M / W76 │ • 160 km/h Derecho Gale            │
│   Bunker Buster        │ • 100 kt Ground Burst    │ • M6.5 Pannonian Earthquake        │
│ • FAB-1500 / FAB-3000  │ • 500 kt Thermonuclear   │ • Orbital Kinetic Rod ("Gods")     │
│   UMPK Glide Bombs     │   Airburst (Topol/Sarmat)│ • Alien Orbital Plasma Beam        │
│ • ODAB-1500 Thermobaric│ • High-Altitude EMP /    │ • Danube Subsurface Radiological   │
│ • MOAB / FOAB Superbomb│   Carrington Geomagnetic │   Torpedo Surge                    │
└────────────────────────┴──────────────────────────┴────────────────────────────────────┘
```

---

### 3.1. Conventional Ordnance Modeling (US, Israeli & Russian Arsenals)

Conventional munitions are modeled using the **Hopkinson-Cranz Blast Scaling Law** ($Z = R / W^{1/3}$) and empirical ground-shock excavation equations.

```
                      CONVENTIONAL WEAPONS BLAST DAMAGE COMPARISON
  Munition        Explosive Mass    Crater Diam.   5 psi Radius   Fragmentation
  ─────────────────────────────────────────────────────────────────────────────
  GBU-39 SDB          16 kg           3.2 m           18 m           120 m
  GBU-31 JDAM        428 kg          13.5 m           65 m           350 m
  Spice 2000 / BLU   430 kg          Penetrates 3m concrete / tunnel collapse
  GBU-28 Buster      295 kg PBX      Excavates 30m earth / caverns collapse
  FAB-1500 UMPK      675 kg          20.0 m          150 m           600 m
  FAB-3000 UMPK    1,400 kg          30.0 m          230 m         1,100 m
  ODAB-1500 Fuel   Fuel-air cloud     3.0 m (flat)   320 m (vacuum)  No shrapnel
  GBU-43/B MOAB    8,482 kg H6       38.0 m          480 m         1,500 m
```

#### 1. Precision Penetrator: GBU-31 JDAM & Spice 2000 (US / Israeli Air Forces)
* **Payload**: 2,000 lb (907 kg) total weight, 428 kg Tritonal explosive.
* **Infrastructure Target**: Bridge decks (e.g. Északi összekötő, Megyeri Bridge) and railway terminal switch throats.
* **Physics & Damage**:
  * Direct hit on a double-track bridge span shears the steel truss or post-tensioned concrete box girder, dropping the span into the Danube.
  * In ballast, it creates an excavation crater $\varnothing 13.5\text{ m} \times 4.2\text{ m}$ deep, snapping rails in both directions and tossing 50-ton wagons onto their sides.
* **Spice 2000 / GBU-28 Bunker Buster Variant**: Equipped with a hardened nickel-chromium steel casing. Penetrates $30\text{ m}$ of alluvial silt or $4\text{ m}$ of reinforced concrete before detonation. Targeted at the **Castle Hill tunnel**, the **Kelenföld–Keleti railway connection**, or the **Batthyány tér underground HÉV terminal**, causing catastrophic roof cave-ins and surface subsidence sinkholes.

#### 2. Heavy Glide Bombs: FAB-1500 & FAB-3000 UMPK (Russian Aerospace Forces)
* **Payload**: 1,500 kg to 3,000 kg total weight, 675 kg to 1,400 kg high-explosive cast TNT/RDX filler.
* **Physics & Damage**:
  * **Ground Shock**: Detonation couples into the earth like an $M_L \approx 3.2 - 3.8$ local seismic event.
  * **Crater**: $\varnothing 25 - 32\text{ m}$, depth $8 - 12\text{ m}$. In Budapest’s dense urban fabric (e.g. Terézváros / Podmaniczky utca), a single FAB-1500 completely levels three adjacent 4-story historic tenement blocks.
  * **Overpressure Wave**: At $150\text{ m}$, overpressure exceeds $5\text{ psi}$ ($34.5\text{ kPa}$), peeling exterior walls off steel-frame buildings, shattering every catenary mast in the line-of-sight, and crushing the cab shells of KISS and FLIRT trainsets.

#### 3. Thermobaric / Fuel-Air Aerosol: ODAB-1500 (Vacuum Bomb)
* **Physics**:
  * Phase 1: A dispersal charge aerosolizes volatile ethylene oxide / propylene oxide into a dense flammable vapor cloud covering a $500\text{ m}$ diameter footprint.
  * Phase 2: A delayed detonator ignites the cloud, creating a uniform, sustained deflagration fireball.
* **The Vacuum Pulse**: Unlike conventional explosives that produce a sharp spike followed by immediate decay, thermobaric bombs consume atmospheric oxygen, producing a prolonged negative pressure wave.
* **Railway & Tunnel Mechanics**:
  * Blast waves funnel into subway stations, underpasses, and passenger rail coaches like an acoustic waveguide.
  * Structures suffer total internal failure while leaving relatively small ground craters. Instanced trees are stripped of all leaves and fine branches, left standing as eerie scorched poles.

#### 4. The Superbomb: GBU-43/B MOAB & Russian FOAB
* **Yield**: 11 to 44 tons TNT equivalent.
* **Effect**: Delivered at ground level. Clears entire railway yards (e.g. all 30 tracks of Rákosrendező or Ferencváros) in a single detonation, flattening buildings over a 1 km diameter circle.

---

### 3.2. Nuclear Weapon Scaling & Radiation Physics

Based on Glasstone & Dolan (*The Effects of Nuclear Weapons*) and Kingery-Bulmash blast equations, mapped directly onto Budapest and the Dunakanyar coordinates:

```
                            NUCLEAR BLAST RADIUS SCALING MATRIX
  Yield / Weapon         Fireball     20 psi (Destruction)   5 psi (Collapse)   Thermal 3rd Deg.
  ──────────────────────────────────────────────────────────────────────────────────────────────
  1 kt (Tactical B61)      55 m              140 m                 320 m             500 m
  10 kt (Iskander / W76)  160 m              420 m                 850 m           1,400 m
  100 kt (Ground Penet.)  420 m            1,100 m               2,300 m           4,500 m
  500 kt (Topol Airburst) 950 m            1,850 m               4,600 m           8,200 m
```

#### 1. The 1 kt "Dial-a-Yield" Tactical Strike (B61 Mod 12)
* **Scenario**: Precision low-yield tactical warhead targeted at the Nyugati railway junction throat.
* **Effects**:
  * Fireball radius: $55\text{ m}$. All tracks, signals, and trains inside the fireball are vaporized into incandescent gas.
  * 5 psi overpressure: $320\text{ m}$ (covers the Nyugati train shed, WestEnd mall, and Nagykörút intersection). The Eiffel-designed train shed glass and steel roof collapses into the tracks.
  * Prompt neutron/gamma radiation ($> 500\text{ rem}$): $650\text{ m}$ lethal radius.

#### 2. The 10 kt Battlefield Tactical Strike (Iskander-M 9M723 / W76-2)
* **Scenario**: Detonated over the Északi összekötő (Northern Railway Bridge) to sever trans-Danubian logistics.
* **Effects**:
  * Bridge completely severed; steel spans hurled hundreds of meters downstream.
  * 5 psi radius ($850\text{ m}$) wipes out the southern tip of Népsziget, the Aquincum rail station on Line 2, and the Újpest riverbank factories.
  * Ships on the Danube are capsized by the blast wave; river water boils in the immediate vicinity.

#### 3. The 100 kt Ground Burst (Strategic Counter-Force)
* **Scenario**: Ground-level impact on Csepel Island or Gellért-hegy.
* **Effects**:
  * **Crater**: $\varnothing 240\text{ m} \times 50\text{ m}$ deep, excavating 3 million cubic meters of rock.
  * **Seismic Pulse**: Magnitude 4.9 ground tremor felt throughout the Dunakanyar basin.
  * **Fallout Plume**: Heavy lethal fallout carried eastward across Pest and the S21 corridor toward Cegléd.

#### 4. The 500 kt Strategic Thermonuclear Airburst (Topol-M / Sarmat / Trident D5)
* **Scenario**: Airburst at $1,800\text{ m}$ optimal height over Deák Ferenc tér / Parliament.
* **Effects**:
  * **20 psi Radius ($1.85\text{ km}$)**: Total structural pulverization from Margaret Island to Gellért-hegy. The Parliament, Bazilika, and Buda Castle are reduced to rubble.
  * **5 psi Radius ($4.6\text{ km}$)**: Every typical multi-story residential building collapses across all of central Pest (reaching Hungária körút) and Buda (reaching Hűvösvölgyi út).
  * **Thermal Pulse ($8.2\text{ km}$)**: Spontaneous ignition of all wooden roofs, fabrics, and trees across the entire Budapest administrative boundary, initiating an unstoppable firestorm.

---

### 3.3. Exotic & "Absolute Dark Timeline" Scenarios

#### 1. Orbital Kinetic Impactor ("Rods from God" / Project Thor)
* **Concept**: A 6.1m $\times$ 0.3m solid tungsten telephone pole dropped from low Earth orbit, striking at Mach 10 ($3,500\text{ m/s}$).
* **Physics**:
  * Mass: $8,200\text{ kg}$ of pure tungsten ($\rho = 19,300\text{ kg/m}^3$).
  * Kinetic Energy:
    $$E_k = \frac{1}{2} m v^2 = 0.5 \times 8,200 \times (3,500)^2 \approx 5.02 \times 10^{10}\text{ Joules} \approx 12\text{ tons TNT eq.}$$
  * Zero explosive chemical filler, but all energy is released within **milliseconds** through hypervelocity penetration. It punches $40\text{ m}$ into bedrock before explosive decompression, triggering structural liquefaction and collapsing underground cavern networks (e.g. Buda Castle caves, Pál-völgyi cave system).

#### 2. The Danube Subsurface Radiological Torpedo
* **Concept**: An underwater high-yield autonomous drone (Poseidon-analogue) detonates submerged in the deep Danube navigation channel between the Chain Bridge and Parliament.
* **Effects**:
  * An incandescent bubble expands underwater, creating a water geyser $800\text{ m}$ high.
  * As the geyser collapses, a hyper-radioactive "base surge" mist sweeps inland at $100\text{ km/h}$, submerging the lower riverbanks under contaminated mud and inundating the metro Line M2 river crossing tubes.

#### 3. Cascading Catenary EMP & Substation Overload (Carrington Event)
* **Concept**: A coronal mass ejection (CME) or high-altitude exo-atmospheric burst (HEMP) induces massive Geomagnetically Induced Currents (GIC) into Hungary's 25 kV AC railway grid.
* **Effects**:
  * Continuous 50,000-volt surge currents saturate the magnetic cores of railway traction transformers.
  * Substations at Istvántelek, Dunakeszi, and Vác erupt into catastrophic mineral-oil fires.
  * All rolling stock pantographs glow with blue corona discharge; electronic EVM cab repeaters melt; every line goes completely dead simultaneously.

---

### 3.4. Impact on Key Tram Corridors (Tram 3 & Tram 56/61)

The addition of **Tram 3** and **Tram 56/61** to the Unified Engine creates profound disaster gameplay dynamics:

#### Tram 3: The Pest Orbital Lifeline (Mexikói út M ⇄ Kőbánya ⇄ Gubacsi út)
* **Strategic Role**: Tram line 3 skirts the outer industrial and residential ring of Pest along Nagy Lajos király útja, Kőbánya (Élessarok), and Határ út.
* **Disaster Dynamics**:
  * When central Budapest (Nyugati, Deák tér, Keleti) is struck or flooded, the radial heavy rail lines collapse.
  * **Tram 3 becomes the sole surviving circumferential evacuation corridor**, ferrying refugees across Pest between the undamaged outer districts.
  * Driving a rugged twin-car Hannoveri (TW 6000) tram through power-rationed, rubble-strewn intersections around Élessarok while navigating around stalled road traffic.

#### Tram 56 / 56A / 61: The Buda Greenway & Forest Escape (Kelenföld ⇄ Hűvösvölgy)
* **Strategic Role**: Connects Kelenföld railway station through Déli pályaudvar and Széll Kálmán tér, ascending the winding, tree-canopied valley along Szilágyi Erzsébet fasor into the deep forests of Hűvösvölgy.
* **Disaster Dynamics**:
  * **The Tree Canopy Hazard**: In a 160 km/h derecheo or blast overpressure event, the dense roadside plane trees, chestnuts, and poplars (rendered via our BP Fatár registry) are blown down across the tram tracks.
  * **Forest Fire Corridor**: In thermal blast scenarios, the Buda hills ignite, turning the narrow Hűvösvölgy ravine into a canyon of smoke and flame.
  * Driving a Tatra T5C5 or CAF tram uphill into the green mountain sanctuary to evacuate passengers beyond the blast shadow of the city.

---

## 4. WebGL2 & Web Audio Implementation Architecture

The beauty of this engine is that **disaster effects can be implemented completely non-destructively**. When no disaster is active, the performance overhead is **$0.00\text{ ms}$**.

### 4.1. Global Disaster State (`state.disaster`)

In `web/src/main.js`:
```javascript
export const disaster = {
  active: false,
  type: 'none',          // 'wind', 'flood', 'landslide', 'quake', 'laser', 'blast'
  epicenter: [0, 0],     // [X, Z] in engine coordinates (meters)
  radius: 0.0,           // Current radius of effect (meters)
  maxRadius: 2500.0,
  intensity: 1.0,        // 0.0 to 1.0
  elapsed: 0.0,          // Seconds since trigger
  craterDepth: 35.0,
  empActive: false,
  flashIntensity: 0.0,
  shockwaveDist: 0.0,
};
```

---

### 4.2. Shader-Based Terrain Deformation (Zero CPU Buffer Overhead!)

Instead of recalculating megabytes of DEM heightmaps on the CPU, we can perform **analytical vertex displacement directly in `TERRAIN_VS`** (`web/src/shaders.js`):

```glsl
// Uniforms passed to TERRAIN_VS
uniform vec4 uDisasterPos;  // x: center.x, y: center.z, z: radius, w: intensity
uniform vec4 uDisasterParams; // x: crater depth, y: quake frequency, z: quake time, w: mode (0=none, 1=blast, 2=quake, 3=slide)

void applyDisasterDeformation(inout vec3 pos, inout vec3 normal) {
    if (uDisasterParams.w < 0.5) return; // Inactive
    
    vec2 d = pos.xz - uDisasterPos.xy;
    float dist = length(d);
    
    // Mode 1: Blast Crater & Ejecta Lip
    if (uDisasterParams.w > 0.5 && uDisasterParams.w < 1.5) {
        float r = uDisasterPos.z;
        if (dist < r) {
            float normDist = dist / r;
            // Parabolic crater bowl
            float depth = (1.0 - normDist * normDist) * uDisasterParams.x;
            pos.y -= depth;
        } else if (dist < r * 1.35) {
            // Ejecta rim
            float rimDist = (dist - r) / (r * 0.35);
            float rimHeight = sin(rimDist * 3.14159) * (uDisasterParams.x * 0.22);
            pos.y += rimHeight;
        }
    }
    
    // Mode 2: Earthquake Seismic Ground Waves
    else if (uDisasterParams.w > 1.5 && uDisasterParams.w < 2.5) {
        float wave = sin(dist * 0.02 - uDisasterParams.z * uDisasterParams.y) * 
                     exp(-dist * 0.0005) * uDisasterPos.w * 4.5;
        pos.y += wave;
    }
    
    // Mode 3: Landslide Bulge (Szent Mihály-hegy)
    else if (uDisasterParams.w > 2.5 && uDisasterParams.w < 3.5) {
        if (dist < uDisasterPos.z) {
            float f = (1.0 - dist / uDisasterPos.z);
            pos.y += f * f * 45.0; // Bulge of displaced rock
        }
    }
}
```

---

### 4.3. Instanced Tree Blast Physics in `VEG_VS`

In `web/src/shaders.js`, trees are drawn via GPU instancing (`aPos`, `aScale`). We can make them dynamically bend in high wind or blow flat in a blast shockwave:

```glsl
uniform vec4 uDisasterPos; // x, y, radius, intensity
uniform float uWindBlast;  // 0.0 to 1.0

void main() {
    vec3 worldPos = aPos;
    vec2 toTree = worldPos.xz - uDisasterPos.xy;
    float dist = length(toTree);
    
    // If caught in blast or severe wind
    if (dist < uDisasterPos.z && dist > 1.0) {
        vec2 blastDir = toTree / dist;
        float blastFactor = (1.0 - dist / uDisasterPos.z) * uDisasterPos.w;
        
        // Tilt top vertices outward away from blast center
        if (position.y > 0.1) {
            worldPos.xz += blastDir * (position.y * blastFactor * 1.8);
            worldPos.y -= position.y * blastFactor * 0.65; // flatten downward
        }
    }
    // ... normal projection ...
}
```

---

### 4.4. Screen-Space Shockwave & Refraction Lens in `COMPOSITE_FS`

In `web/src/shaders.js`:
The composite post-processing shader handles depth-of-field, bloom, and grain. Adding a shockwave refraction ring is a standard high-performance post-process technique:

```glsl
uniform vec3 uShockwave; // x: screen_x (0..1), y: screen_y (0..1), z: radius (0..2), w: intensity

vec2 applyShockwaveDistortion(vec2 uv) {
    if (uShockwave.z <= 0.0 || uShockwave.w <= 0.0) return uv;
    
    vec2 diff = uv - uShockwave.xy;
    diff.x *= uAspect; // Correct for widescreen aspect ratio
    float dist = length(diff);
    
    float ringWidth = 0.06;
    if (dist >= uShockwave.z - ringWidth && dist <= uShockwave.z + ringWidth) {
        float edge = (dist - uShockwave.z) / ringWidth; // -1 to +1
        float bump = cos(edge * 1.57079); // peak at wave crest
        vec2 dir = normalize(diff);
        return uv - dir * (bump * 0.04 * uShockwave.w);
    }
    return uv;
}
```

---

### 4.5. Audio Synthesis in `audio.js` (Web Audio API)

No external audio samples needed! Our existing Web Audio engine already synthesizes traction hum, flange squeal, and wind from pure oscillators and noise buffers:

1. **Seismic Earthquake Rumble**:
   * Generate continuous Brownian / Pink noise.
   * Pass through a 2-pole lowpass biquad filter with cutoff at $38\text{ Hz}$ and resonant $Q = 4.0$.
   * Modulate amplitude with a slow $0.3\text{ Hz}$ LFO.
2. **Explosion / Kinetic Impact**:
   * White noise burst with instantaneous attack ($1\text{ ms}$) and long exponential decay ($4.5\text{ s}$).
   * Sub-bass sine wave oscillator sweeping downwards from $120\text{ Hz} \to 25\text{ Hz}$ over $800\text{ ms}$.
3. **Catenary High-Voltage Arc Flash**:
   * High-gain filtered noise + $100\text{ Hz}$ harmonic buzz (double European $50\text{ Hz}$ AC power frequency).
4. **Hungarian Civil Defense Alert Siren (Katasztrófavédelmi Sziréna)**:
   * Two detuned triangle oscillators alternating between $415\text{ Hz}$ and $460\text{ Hz}$ with a $4\text{-second}$ sweep cycle ("figyelmeztetés" / warning signal).

---

## 5. Gameplay Modes: Missions in the Dark Timeline

Disasters are not just passive eye-candy; they form the basis for thrilling high-stakes driving and emergency response missions:

### Mission D-1: "Menekülés a Víz Elől" (Escape the Rising Danube)
* **Context**: A flash flood has breached the dikes north of Vác. Floodwaters are rising at $15\text{ cm/minute}$.
* **Objective**: Drive a 6-car FLIRT commuter train (S70) packed with evacuees from Vác to Rákosrendező.
* **Complication**: Water covers the tracks at Dunakeszi up to the railhead ($8\text{ cm}$). Speed must be restricted to $40\text{ km/h}$ to prevent traction motor short-circuits and hydroplaning; signals are flickering amber; oncoming traffic has stalled on track 1.

### Mission D-2: "Dízel Segélymenet" (Diesel Rescue in the Blackout)
* **Context**: An EMP / severe storm has collapsed the overhead catenary across Line 70. All electric KISS and FLIRT units are dead.
* **Objective**: Take a venerable diesel MÁV Class M62 "Szergej" or M44 "Bobó" locomotive out of Istvántelek yard, couple to a stranded EuroCity train, and tow it to safety.
* **Challenge**: The line is completely signal-dark (all signals unlit). You must drive strictly by sight and radio dispatch orders under $15\text{ km/h}$ over unpowered level crossings.

### Mission D-3: "Légimentés a Dunakanyarban" (Danube Air Rescue)
* **Context**: The Szent Mihály-hegy landslide has cut off the road and rail connection to Zebegény and Nagymaros.
* **Objective**: Pilot the flyable helicopter from Budaörs Airport through turbulent gale winds, land on the narrow soccer pitch in Nagymaros to deliver emergency radio relays, and return.

---

## 6. UI & Sandbox Controls ("A Sötét Idővonal" Panel)

To maintain the pristine realism of the simulator by default, all disaster options will live under a dedicated **"Dark Timeline / Katasztrófa"** tab inside the Settings panel (`#panel`), toggled on request or via the URL parameter `?mode=dark`:

```
┌─────────────────────────────────────────────────────────────────┐
│               A SÖTÉT IDŐVONAL (DISASTER SANDBOX)               │
├─────────────────────────────────────────────────────────────────┤
│ Forgatókönyv:  [ Szent Mihály hegyomlás ▾ ]                      │
│                                                                 │
│ Intenzitás:    ───●──────────────────────  75%                  │
│ Duna vízállás: ────────────●─────────────  +8.5 m (Árvíz)       │
│ Szélerősség:   ──────────────────●───────  140 km/h             │
│                                                                 │
│ [⚡ Kábel szakadás]  [🌊 Gátszakadás]  [☄ Becsapódás]           │
│                                                                 │
│ ☑ Felsővezeték áramtalanítás (EMP / Áramszünet)                 │
│ ☑ Pályatest deformáció (Hőtágulás / Földrengés)                 │
│ ☑ Fa dőlések engedélyezése                                      │
│                                                                 │
│ [ 🔥 KATASZTRÓFA INDÍTÁSA ]       [ ↺ ALAPHELYZET (BEKÉTÖBB) ]  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Safety, Performance & Non-Destructive Integrity

1. **Zero Runtime Impact on Standard Runs**:
   When `state.disaster.active == false`, the shader branches skip all disaster calculations via static early returns (`if (uDisasterParams.w < 0.5) return;`), maintaining current $60\text{ FPS}$ frame budgets on mobile and integrated GPUs.
2. **Deterministic Reset**:
   Clicking "Alaphelyzet" instantly clears `state.disaster`, restoring standard water levels, tree orientations, track splines, and catenary power without requiring a page reload.
3. **Tasteful Aesthetic Consistency**:
   All visual effects respect the simulator's signature **late-90s PC simulation aesthetic**: ordered $4\times 4$ Bayer matrix dithering, chunky low-poly particle billboards, and rich procedural sky gradients.
