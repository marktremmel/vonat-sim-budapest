# Landmarks: what they look like, and where the sim gets them

Reference for anyone changing a landmark. The owner cares about these places,
and prefers the OSM data over hand models when the data exists.

Order of preference:

1. OSM 3D parts (`building:part`).
2. The plain OSM outline with a corrected height.
3. A hand model placed on OSM geometry.
4. A hand model at a typed coordinate. Avoid this.

The real-world descriptions are general knowledge; check them against photos
before modelling detail. The project folder has aerials of Nyugati.

| Place | In reality | Here | Source |
| --- | --- | --- | --- |
| **Országház** (Parliament) | Neo-Gothic, 268 m along the Danube. Central dome 96 m, many pinnacles, light stone, red-brown roofs. | Drawn from 112 OSM `building:part`s (dome 96 m, spires, roofs). Hand model dropped. | data |
| **Szent István-bazilika** | Neoclassical. Dome 96 m, two front bell towers, faces west onto Szent István tér. | 16 OSM parts. Hand model dropped. | data |
| **Budavári Palota** (Royal Palace, Buda Castle) | Long palace on the south end of Castle Hill. About six storeys on the Danube side. Green copper dome over the central wing, lantern and crown on top. | OSM relation outline, raised to 24 m (OSM says 3 levels). Dome model (`budavar`) at the coordinate Wikipedia gives, 47.49611 N 19.03972 E: drum with columns, ribbed dome, lantern, cross. | outline data + dome model |
| **Mátyás-templom** (Matthias Church) | Gothic. Tall south-west tower (~78 m), Zsolnay tile roofs. | Church outline plus its OSM tower part (76.6 m, pyramidal). | data |
| **Halászbástya** (Fisherman's Bastion) | White terraces and seven conical towers, east of Matthias Church. | OSM outline only, low. The towers are not modelled. | data (poor) |
| **Budapest Óriáskereke** (Budapest Eye) | 65 m ferris wheel on Erzsébet tér. | OSM maps it as a 65 m "building"; it was drawn as a tower block. Now a wheel model (`bigwheel`) in the plane of its footprint. | model on data |
| **Széchenyi Lánchíd** (Chain Bridge) | 1849 suspension bridge. Two stone towers with arched gateways 202 m apart, 89 m side spans, iron chains, lions at both ends. | Deck and approaches from the OSM road ways. Towers on the two OSM `bridge:support=pylon` outlines (202.0 m apart); chains and lions are the model. The pylons are no longer extruded as buildings; that was the "plattenbau" second bridge. | model on data |
| **Margit híd** | Six arches, with a ~30° bend at the Margitsziget spur. | OSM road ways: one continuous deck with river piers (geom.js). The straight hand model was dropped. Arch ribs are not drawn yet. | data |
| **Árpád híd** | Long plain girder bridge crossing Margitsziget's north end. | OSM ways, deck and piers. Model dropped. | data |
| **Megyeri híd** (M0) | Cable-stayed over the main (Pest) branch: two ~99 m inverted-Y pylons, 300 m main span, fans of stays; long viaducts over Szentendrei-sziget. | Deck from OSM. Pylons and stays (model) placed ±150 m from the middle of the longest river run under the bridge axis. | model on data |
| **Északi összekötő vasúti híd** (Újpesti vasúti híd) | Two structures: the Danube crossing (Óbuda – Népsziget, ~700 m) and a separate bridge over the Újpest bay (öböl) to Angyalföld (~250 m). Steel truss. | One truss model per chain of line 2's OSM bridge ways (697 m and 246 m). On line 2 the deck is at rail level. | model on data |
| **Nyugati pályaudvar** | Eiffel company's 1877 iron-and-glass hall. Glass gable to Teréz körút between two stone pavilions with domes. | Hand model on the OSM station outline (`buildTrainsheds`). Checked against the aerials in the project folder. | model on data |
| **Mária Valéria híd** (Esztergom – Párkány) | Steel arch-truss bridge, five spans. | Model sized to the OSM way chain. | model on data |
| **Esztergomi Bazilika** | Hungary's largest church. Central dome ~100 m, colonnaded portico, two bell towers, on the castle hill above the Danube. | Hand model anchored to its OSM outline. | model on data |
| **Hősök tere** | Millennium Monument: 36 m column and two curved colonnades. | Hand model, typed coordinate (Gemini). | typed |
| **Gellért-hegy, Szabadság-szobor** | Citadel on the hill, Liberty Statue ~40 m with its pedestal. | Hand model, typed coordinate (Gemini). | typed |
| **Visegrádi Fellegvár, Salamon-torony** | Upper castle on the hilltop; hexagonal keep by the river. | Hand models at typed coordinates. OSM has both; the Salamon outline is also drawn. | typed (to redo) |
| **Váci Diadalív** | 1764 stone triumphal arch in Vác. | Hand model, typed coordinate (Gemini). | typed (to check) |
| Hulladékhasznosító Mű, Újpesti Erőmű, Szennyvíztisztító | Real plants. | Gemini's invented models removed (23 Sep); the plants' own OSM buildings and stacks stay. | data |
| Samsung SDI Göd, Dunakeszi Járműjavító | Real plants. | Real OSM halls at true size (`industry_osm.json`). | data |
| Naszály quarry (Sejce) | Big pale limestone scar on the Naszály's west face. | Land-cover `quarry` with bench shading. | data |

## How the data pieces work

- **OSM 3D parts:**
  - `q_building_parts.ql` downloads to `data/raw/building_parts.json`.
  - `bake_context.py` writes `context.parts`, and `web/src/parts.js` draws them.
  - An outline is skipped when parts cover 55% of it.
  - Roof shapes handled: flat, pyramidal/cone, dome/round/onion. Everything else becomes a hip on the principal axis.
- **Bridge supports:** `bridge:support=*`, `building=bridge` and `man_made=bridge` are never extruded as buildings. Pylons go to the bridge models.
- **Bridge decks** (`geom.js buildRoads`):
  - Touching bridge ways form one structure with one deck function: a plateau for what it crosses, and ramps to the approach roads.
  - Cars ride the same function (`way.deckAt`).

## To do

- Margit arches.
- Halászbástya towers.
- Fellegvár and Salamon from their OSM outlines.
- Check the Diadalív position against OSM.
- Szabadság híd pylons: its two `bridge:support` pylons are in the data, but there is no model.
