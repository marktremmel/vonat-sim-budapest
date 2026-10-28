# Façade kit: generated façade tiles for the buildings

Started 27 Oct 2026. An image model (ChatGPT) draws straight-on façade sheets
in a fixed layout; `tools/bake_facade_kit.py` cuts them into one atlas and
works out where the windows and the plaster are; the building shader repeats
the pieces along each wall and paints each building its own colour. Nobody
paints a building by hand.

Four families, each a folder in `szob-fele/art/facade_kit/`:

| folder | what it is | which buildings (shader kind) | sheets now |
| --- | --- | --- | --- |
| `tenement/` | Pest bérház, 1880–1914 | tenements, kind 2, 7 m and taller | 15 |
| `interwar/` | 1930s modern blocks (Újlipótváros, Pasarét) | modern flats (kind 10) and 12% of tenements | 16 |
| `cube/` | kockaház, 1960s–80s family house | houses (kind 1) 5.6 m and taller | 17 |
| `village/` | one-storey village house (Göd, Verőce, Zebegény) | houses (kind 1) under 5.6 m | 15 |

A family with no sheets stays procedural.

Six more families (villa, mav, oldtown, garden, civic, szocreal) came in
on 28 Oct: 68 sheets, so all ten families now have sheets. Which building gets which
family, district by district and town by town, is decided in the bake from
`tools/facade_zones.json` (`docs/FACADE_PLAN.md`).

## What you do

1. **Look at real buildings** (optional, for your own eye, to make the prompt
   better). Google Street View and Apple Look Around are fine to *look at*.
   Their terms forbid making content from their pictures, so do not paste
   them into ChatGPT or the project. Pictures you may feed in: your own
   photos, Mapillary (CC BY-SA), Wikimedia Commons (check each licence).
2. **Generate sheets** with the family's prompt below, one image per sheet,
   square or landscape (ChatGPT's 1536 × 1024 works). Send the prompt as it
   stands, then repeat it with a different line from its variety list each
   time. Aim for 8–12 sheets a family (24 at most). Throw away any with perspective, shadows, people,
   cars, trees or signs.
3. **Save them** as PNG in the family's folder, any names. Duplicates are
   fine; the cutter skips them.
4. Tell Claude, who runs the cutter, looks at the cut and the masks, and
   checks the result in the game.

What makes a sheet usable, in order of importance: straight-on, the rows the
prompt asks for, four equal bays lined up, no shadows, a pale wall, and the
glass a plain dark grey-blue (that is how the cutter finds the windows).
Exact metres do not matter: the shader stretches each row to fit.

## Prompt: tenement (`tenement/`)

> An architectural elevation drawing rendered as a photographic texture: the
> street façade of a Budapest eclectic apartment building (bérház) from about
> 1890–1910. Perfectly straight-on orthographic view, no perspective, no
> vanishing point, the façade fills the whole image edge to edge.
>
> Exactly three storeys, stacked: at the bottom the ground floor (rusticated
> stone-look plaster, shop windows and one arched wooden gate), in the
> middle one typical upper floor, at the top the top floor with the main
> cornice and its brackets. Exactly 4 window bays across, evenly spaced, the
> same width each, the windows on every floor in line vertically. Every bay
> is cut at the same point at the left and right edges so the strip can
> repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue). Plaster in a pale neutral
> warm grey, not a strong colour. No people, no cars, no trees, no street
> signs, no shop names, no text, no graffiti, no wires, no sky, no pavement.
> Clean, slightly worn, high detail.

Variety lines:
- "Secessionist (Lechner style), wavy window surrounds, a band of green
  Zsolnay ceramic tiles under the cornice."
- "Neo-Renaissance, pilasters between the bays, triangular pediments over the
  windows."
- "Wrought-iron balconies on bays 2 and 3 of the upper floor."
- "Plain late-historicist, simple flat window frames, renovated."
- "Neo-Baroque, heavy window crowns with shells, rich stucco."
- "1920s–30s simplified, almost no ornament, tall casement windows."
- "Brick-faced upper floor with plaster window surrounds."
- "Worn and unrenovated, plaster patches, but no graffiti."

## Prompt: interwar block (`interwar/`)

> An architectural elevation drawing rendered as a photographic texture: the
> street façade of a 1930s Budapest modernist apartment block, as in
> Újlipótváros or Pasarét. Perfectly straight-on orthographic view, no
> perspective, no vanishing point, the façade fills the whole image edge to
> edge.
>
> Exactly three storeys, stacked: at the bottom the ground floor (a glazed
> entrance door with a slim steel frame, shop or office windows, a smooth
> stone or travertine-clad base), in the middle one typical upper floor, at
> the top the top floor finished with a thin flat parapet and a slim
> cornice, no brackets, no roof visible. Exactly 4 window bays across,
> evenly spaced, the same width each, the windows on every floor in line
> vertically; wide windows, horizontal proportions. Every bay is cut at the
> same point at the left and right edges so the strip can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue). Smooth render in a pale
> neutral off-white, not a strong colour. No people, no cars, no trees, no
> street signs, no shop names, no text, no graffiti, no wires, no sky, no
> pavement. Clean, slightly worn, high detail.

Variety lines:
- "Shallow balconies with thin tubular steel railings on bays 2 and 3."
- "Windows joined into continuous horizontal bands with white frames."
- "Travertine slabs on the whole ground floor, the entrance in bay 1."
- "Small round porthole windows beside the main windows."
- "Brown brick facing between the windows, white render bands at the floors."
- "Grey ceramic tile cladding on the ground floor, a recessed entrance."
- "Late 1940s, very plain, small square windows with simple sills."
- "Worn grey render with patches, original wooden window frames."

## Prompt: cube house (`cube/`)

> An architectural elevation drawing rendered as a photographic texture: the
> street side of a Hungarian "kockaház", a square family house from the
> 1960s–1980s. Perfectly straight-on orthographic view, no perspective, no
> vanishing point, the wall fills the whole image edge to edge.
>
> Exactly two storeys, stacked: at the bottom a raised ground floor on a high
> plinth (small basement windows in the plinth, the front door with a few
> steps in one bay), at the top the upper floor ending at the underside of
> the eaves; show only a thin strip of the eaves board at the very top, no
> roof surface. Exactly 4 bays across, evenly spaced, the same width each,
> the windows of both floors in line vertically: double casement windows
> with brown wooden roller-shutter boxes above them. Every bay is cut at the
> same point at the left and right edges so the strip can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue; roller shutters, if
> lowered, are brown). Rough dashed render in a pale neutral warm grey, not
> a strong colour. No people, no cars, no trees, no fence, no gate, no
> signs, no text, no graffiti, no wires, no sky, no garden. Clean, slightly
> worn, high detail.

Variety lines:
- "Roller shutters half lowered on some windows."
- "A geometric pattern of pale diamonds and lines worked into the render
  between the floors."
- "The plinth faced with irregular stone slabs."
- "A small balcony with a plain steel railing over bays 2 and 3."
- "Renovated: smooth new render, white plastic windows, no roller shutters."
- "Red brick plinth and brick window sills."
- "A brown garage door in the plinth of bay 4 instead of a basement window."
- "Unrenovated: grey pebble-dash render, faded brown woodwork."

## Prompt: village house (`village/`)

This one is laid out differently: three different houses stacked in one
image, each strip one storey.

> A texture sheet of three different Hungarian village house walls, stacked
> one above the other, each strip exactly one third of the image height,
> separated by a thin straight horizontal dark grey line. Each strip is the
> long street-facing wall of a one-storey house from about 1900–1950, as in
> the villages of the Danube Bend: from the dark plinth at the bottom of the
> strip to the eaves line at the top, no roof visible. Perfectly straight-on
> orthographic view, no perspective, every strip fills the full image width.
>
> Each strip has exactly 4 bays, evenly spaced, the same width each: in each
> bay one window (double casement, white frame, the panes plain dark
> grey-blue) or, in one bay, a plain wooden door. Every strip is cut at the
> same point at the left and right edges so it can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun. Lime-washed plaster in
> white or a very pale neutral, not a strong colour; shutters, if any, in
> brown wood. No people, no animals, no cars, no trees, no flowers, no
> fence, no signs, no text, no wires, no sky, no ground. Slightly worn, high
> detail.

Variety lines (each image can mix them across its three strips):
- "One strip with a tornác: a covered porch with plain white columns in front
  of the wall."
- "Brown wooden shutters beside the windows."
- "A painted ochre band around each window."
- "Exposed brick plinth, rough lime plaster above."
- "Small square windows high in the wall, an older cottage."
- "A renovated house: smooth render, white plastic windows."
- "Decorative plaster mouldings over the windows (a 1920s village house)."
- "Worn plaster showing the adobe underneath in patches."

## More families: villa, MÁV colony, old town, garden city, civic, 1950s

Generate these whenever you like and save them in the folder named, then
tell Claude, who runs the cutter and checks them. The routing is already
there: buildings zoned for a family without sheets keep the old rule until
its sheets are in. Same rules as above:
straight-on, four equal bays, plain dark grey-blue glass, no shadows.
"Layout" is how the cutter reads the sheet: **stack** = three storeys (top,
typical, ground), **two** = two storeys, **strips** = three one-storey fronts
stacked.

### Buda villa (`villa/`), layout two

For the villas of the Buda hills (Rózsadomb, Pasarét, Svábhegy, Zugló's
villa quarter), Budafok and the better streets of Vác and Esztergom.

> An architectural elevation drawing rendered as a photographic texture: the
> street side of a Budapest villa from about 1900–1930, as in the Buda hills.
> Perfectly straight-on orthographic view, no perspective, no vanishing
> point, the wall fills the whole image edge to edge.
>
> Exactly two storeys, stacked: at the bottom the raised ground floor over a
> stone or rubble plinth with small cellar windows and the entrance with a
> few steps in one bay, at the top the upper floor ending at the eaves; show
> only a thin strip of the eaves and the tiled roof edge at the very top.
> Exactly 4 bays across, evenly spaced, the same width each, the windows of
> both floors in line vertically: tall double casement windows with wooden
> frames. Every bay is cut at the same point at the left and right edges so
> the strip can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue). Smooth render in a pale
> neutral warm white, not a strong colour. No people, no cars, no trees, no
> fence, no gate, no signs, no text, no graffiti, no wires, no sky, no
> garden. Clean, slightly worn, high detail.

Variety lines:
- "Ochre stucco, white window surrounds, a small wooden balcony on bay 2."
- "Exposed brick and dark timber details, a Swiss-chalet style villa."
- "Secession style: green glazed tiles under the eaves, curved window heads."
- "Grey render, faded and cracked, a neglected villa with old shutters."
- "Tall French windows and wrought-iron balconettes on the upper floor."
- "Plain 1920s classicist villa with flat pilasters between the bays."
- "A glazed winter-garden bay with small panes across bays 3 and 4."
- "Renovated 2000s: smooth new render, dark grey window frames."

### MÁV railway colony house (`mav/`), layout strips

The railway's own housing (MÁV-telep, vasutastelep), built from the 1890s to
the 1920s to standard designs near stations and works: one storey, a few
two-storey, plastered walls with exposed brick on the plinth, the corners,
the cornice and round the windows, stone plinths, wooden shutters. On our
lines: the Rákospalota and Kőbánya colonies, Istvántelek, the Dunakeszi
works, by Vác station (MÁV telep utca), and the mining colonies (Bányatelep)
at Szob and in the Pilis, which look much the same.

> A texture sheet of three different Hungarian railway workers' houses
> (MÁV colony houses, about 1895–1925), stacked one above the other, each
> strip exactly one third of the image height, separated by a thin straight
> horizontal dark grey line. Each strip is the long street-facing wall of a
> one-storey house, from the stone or brick plinth at the bottom of the
> strip to the cornice at the top, no roof visible. Perfectly straight-on
> orthographic view, no perspective, every strip fills the full image width.
>
> Each strip has exactly 4 bays, evenly spaced, the same width each: in each
> bay one tall window (double casement, wooden frame, the panes plain dark
> grey-blue) or, in one bay, a wooden door. Pale plaster walls framed with
> exposed red brick: brick corner strips, a brick band under the cornice,
> brick surrounds round every window and door, a brick or rough stone
> plinth. Every strip is cut at the same point at the left and right edges
> so it can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun. No people, no animals, no
> cars, no trees, no fence, no signs, no text, no wires, no sky, no ground.
> Slightly worn, high detail.

Variety lines (each image can mix them across its three strips):
- "Yellow brick instead of red, plaster in pale ochre."
- "Brown wooden shutters folded beside each window."
- "A 1910s strip with a small gable over the door and a timber porch hood."
- "Worn: plaster falling off in patches, the brick showing through."
- "Renovated: the brick painted over, plastic windows, new render."
- "Brick segmental arches over the windows, a dog-tooth brick cornice."
- "A mining colony house: rougher plaster, a rubble-stone plinth."
- "A two-family house: two doors, in bays 1 and 4."

### Old town house, baroque and copf (`oldtown/`), layout two

For the old cores: Vác's main square and Káptalan utca, Esztergom's
Víziváros and town centre, the Castle District, old Óbuda, Budafok,
Szentendre's edge on line 70's context, Nagymaros' centre. Mostly 1750–1850,
one or two storeys, thick walls, a gateway.

> An architectural elevation drawing rendered as a photographic texture: the
> street façade of a Hungarian small-town burgher house from about
> 1750–1850, baroque or copf (Louis XVI) style, as on the main square of Vác
> or in Esztergom's Víziváros. Perfectly straight-on orthographic view, no
> perspective, no vanishing point, the façade fills the whole image edge to
> edge.
>
> Exactly two storeys, stacked: at the bottom the ground floor with a wide
> arched wooden carriage gate in one bay and small barred windows in the
> others, at the top the upper floor with tall windows under the main
> cornice; show only the cornice at the very top, no roof surface. Exactly 4
> bays across, evenly spaced, the same width each, the windows of both floors
> in line vertically. Every bay is cut at the same point at the left and
> right edges so the strip can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue). Lime plaster in a pale
> neutral, not a strong colour; plaster window surrounds in white. No people,
> no cars, no trees, no signs, no shop names, no text, no graffiti, no wires,
> no sky, no pavement. Slightly worn, high detail.

Variety lines:
- "Copf garlands and small urns over the upper windows."
- "Baroque window crowns with curved tops, a rusticated ground floor."
- "Flat pilasters between the bays, a plain triangular pediment in the middle."
- "Classicist 1830s, very plain, fine horizontal bands in the plaster."
- "A shop on the ground floor: two wooden shop doors with glazed tops."
- "Old and worn: uneven walls, faded paint, the plaster thin."
- "Wooden shutters on the upper windows, painted dark green-grey."
- "A corner niche with a small statue in bay 3, between the floors."

### Garden city (`garden/`), layout two

Wekerletelep in Kispest (built 1909–1926, folk-romantic, on the S21 side),
the Tisztviselőtelep, Kertváros-type estates and the bigger houses of the
1910s–30s suburbs (Pestszentlőrinc, Rákosszentmihály, Mátyásföld).

> An architectural elevation drawing rendered as a photographic texture: the
> street side of a house in a Budapest garden city of about 1910–1930, as in
> Wekerletelep, Hungarian folk-romantic style. Perfectly straight-on
> orthographic view, no perspective, no vanishing point, the wall fills the
> whole image edge to edge.
>
> Exactly two storeys, stacked: at the bottom the ground floor with the
> entrance in one bay and small-paned windows, at the top the upper floor
> under a steep roof whose eaves edge shows as a thin strip at the very top;
> no roof surface. Exactly 4 bays across, evenly spaced, the same width each,
> the windows of both floors in line vertically. Every bay is cut at the same
> point at the left and right edges so the strip can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue, in small panes). Rough
> render in a pale neutral, not a strong colour. No people, no cars, no
> trees, no fence, no gate, no signs, no text, no graffiti, no wires, no sky,
> no garden. Slightly worn, high detail.

Variety lines:
- "Dark-stained timber framing on the upper floor, white render between."
- "Carved wooden window boxes and a timber porch over the door."
- "Red brick ground floor, render above."
- "Small round-arched windows in pairs, Transylvanian motifs in the plaster."
- "Plain 1930s version, smooth render, square windows with shutters."
- "A row of three narrow attic dormer bases at the top edge."
- "Worn: weathered timber, patched render."
- "Renovated: new white render, the timber painted dark brown."

### Public building (`civic/`), layout stack

Schools, town halls, post offices, courts, hospitals, barracks from about
1880–1930: in every district and in Vác and Esztergom. Today these are
procedural "civic" walls.

> An architectural elevation drawing rendered as a photographic texture: the
> street façade of a Hungarian public building from about 1890–1914, a
> school or a town hall, eclectic style with plaster and red brick.
> Perfectly straight-on orthographic view, no perspective, no vanishing
> point, the façade fills the whole image edge to edge.
>
> Exactly three storeys, stacked: at the bottom a high ground floor with
> large round-arched windows and one arched entrance door, in the middle one
> typical upper floor with tall windows, at the top the top floor with the
> main cornice. Exactly 4 window bays across, evenly spaced, the same width
> each, the windows on every floor in line vertically; large windows.
> Every bay is cut at the same point at the left and right edges so the
> strip can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue). Pale plaster with red
> brick panels between the windows. No people, no cars, no trees, no signs,
> no lettering, no text, no flags, no graffiti, no wires, no sky, no
> pavement. Clean, slightly worn, high detail.

Variety lines:
- "All plaster, pale ochre, white window surrounds, no brick."
- "Yellow brick facing, white stone window surrounds."
- "Secession school: Zsolnay tile bands, wavy window heads."
- "Neo-Renaissance town hall: rusticated ground floor, pediments."
- "1920s neo-baroque, heavy window crowns, a balcony on bays 2 and 3."
- "Plain 1930s school, smooth render, big steel-framed windows."
- "Worn: faded plaster, old wooden windows, a barracks."
- "Brick everywhere except the cornice and the window sills."

### 1950s block, socialist realist (`szocreal/`), layout stack

The blocks of 1949–1958 before the panels: Angyalföld (Lehel, Béke tér),
Kőbánya, Csepel, Óbuda, Újpest, Vác's and Esztergom's first estates. Plain
render, a classical cornice, small windows, sometimes a stone-look base.

> An architectural elevation drawing rendered as a photographic texture: the
> street façade of a Hungarian 1950s socialist realist apartment block.
> Perfectly straight-on orthographic view, no perspective, no vanishing
> point, the façade fills the whole image edge to edge.
>
> Exactly three storeys, stacked: at the bottom the ground floor with a plain
> stone-look base and an entrance door with a simple canopy in one bay, in
> the middle one typical upper floor, at the top the top floor under a heavy
> classical cornice. Exactly 4 window bays across, evenly spaced, the same
> width each, the windows on every floor in line vertically; modest double
> casement windows with simple plaster surrounds. Every bay is cut at the
> same point at the left and right edges so the strip can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue). Render in a pale neutral
> warm grey, not a strong colour. No people, no cars, no trees, no signs,
> no stars or emblems, no text, no graffiti, no wires, no sky, no pavement.
> Slightly worn, high detail.

Variety lines:
- "Small balconies with solid plaster parapets on bays 2 and 3."
- "Pale ochre render, white bands at each floor."
- "Rough grey dash render, very plain, a workers' block."
- "Shops on the ground floor with large steel-framed windows."
- "Stone-look rustication on the ground floor, pilasters on the corners."
- "Renovated: insulated, smooth pastel render, plastic windows."
- "Worn: stained render, old wooden windows, rusty railings."
- "A brick-faced ground floor, render above."

## Round 3 prompts (28 Oct): not wired yet

Three more families for buildings that have no kit today. Generate them
when you like and save them in the folder named. They are **not wired
yet**: each needs a family slot (the byte has room for five more), and the
hall family a new "hall" category in `tools/facade_zones.py`; that is a
small step once the sheets are in. Also wanted: **more `szocreal/` sheets**
(only 4 now), with the prompt above.

### New-build flats, 2000s–2020s (`lakopark/`), layout stack

The lakóparks and new blocks: Váci út corridor, Kelenföld, Óbuda's river
bank, the new estates in Göd, Vác, Dunakeszi. Today these are drawn as
procedural "modern flats".

> An architectural elevation drawing rendered as a photographic texture: the
> street façade of a Hungarian residential block built 2005–2022, as in a
> Budapest "lakópark". Perfectly straight-on orthographic view, no
> perspective, no vanishing point, the façade fills the whole image edge to
> edge.
>
> Exactly three storeys, stacked: at the bottom the ground floor with a
> glazed entrance and a dark grey plinth, in the middle one typical upper
> floor, at the top the top floor with a thin flat parapet. Exactly 4 bays
> across, evenly spaced, the same width each, in line vertically: large
> windows with dark grey aluminium frames, glass balcony balustrades on some
> bays. Every bay is cut at the same point at the left and right edges so
> the strip can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue). Smooth render in white
> or pale grey, with one accent panel colour. No people, no cars, no trees,
> no plants on the balconies, no signs, no text, no graffiti, no wires, no
> sky, no pavement. Clean, high detail.

Variety lines:
- "Accent panels in anthracite grey on bays 2 and 3."
- "Wood-look cladding strips between the windows."
- "Deep loggias recessed into the façade on bays 2 and 3."
- "Terracotta-red fibre-cement panels, white window reveals."
- "Very plain, white render, square windows in a strict grid."
- "Pale yellow render, white balcony slabs with steel railings."
- "Floor-to-ceiling windows with sliding doors onto balconies."
- "Brick-slip cladding on the ground floor, render above."

### 1960s brick block (`teglablokk/`), layout stack

The brick-built blocks of about 1958–1970, before the panels: three or four
storeys, plain, pitched roofs, in every outer district and in Vác, Göd,
Dunakeszi, Esztergom.

> An architectural elevation drawing rendered as a photographic texture: the
> street façade of a Hungarian 1960s brick-built apartment block, plain and
> modest. Perfectly straight-on orthographic view, no perspective, no
> vanishing point, the façade fills the whole image edge to edge.
>
> Exactly three storeys, stacked: at the bottom the ground floor with a
> plain entrance door under a small concrete canopy in one bay and a low
> plinth with cellar windows, in the middle one typical upper floor, at the
> top the top floor ending at a plain eaves line (no roof surface). Exactly 4
> bays across, evenly spaced, the same width each, in line vertically:
> double casement windows with wooden frames, a small balcony with a steel
> railing on some bays. Every bay is cut at the same point at the left and
> right edges so the strip can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue). Rough render in a pale
> neutral, not a strong colour. No people, no cars, no trees, no signs, no
> text, no graffiti, no wires, no sky, no pavement. Slightly worn, high
> detail.

Variety lines:
- "Pale yellow render, grey plinth."
- "Exposed red brick between the windows, render bands at each floor."
- "Rough grey pebble-dash, very plain."
- "Renovated: insulated, pastel render, white plastic windows."
- "Brown roller-shutter boxes over every window."
- "Balconies with corrugated plastic panels, worn."
- "Narrow stairwell windows in bay 1, a column of small panes."
- "Faded pink render with patches."

### Industrial brick hall (`hall/`), layout stack

Workshops, depots, breweries, mills and warehouses of about 1880–1940:
Kőbánya, Angyalföld, Soroksári út, the railway works at Dunakeszi and
Istvántelek, Vác's riverside. Today these are procedural halls or blank
sheds.

> An architectural elevation drawing rendered as a photographic texture: the
> long side of a Hungarian industrial brick hall from about 1890–1930, a
> railway workshop or a brewery. Perfectly straight-on orthographic view, no
> perspective, no vanishing point, the wall fills the whole image edge to
> edge.
>
> Exactly three horizontal tiers, stacked: at the bottom a low plinth of dark
> brick or stone with small windows or a large wooden gate in one bay, in
> the middle tall round-arched or segmental-arched steel windows with many
> small panes, at the top a row of small windows under a corbelled brick
> cornice. Exactly 4 bays across, evenly spaced, the same width each,
> separated by brick pilasters. Every bay is cut at the same point at the
> left and right edges so the strip can repeat sideways.
>
> Flat overcast daylight, no cast shadows, no sun, no reflections of a sky in
> the glass (the panes are a plain dark grey-blue). Red or yellow brick. No
> people, no vehicles, no trees, no signs, no lettering, no text, no
> graffiti, no wires, no sky, no ground. Slightly worn, high detail.

Variety lines:
- "Yellow brick with red brick bands and arches."
- "Red brick, white plastered panels between the pilasters."
- "Some panes broken or boarded, an abandoned hall."
- "Renovated as offices: new dark window frames, cleaned brick."
- "Large sliding wooden doors in bays 2 and 3 of the plinth."
- "Plastered hall, pale grey, brick only round the arches."
- "Round windows in the top tier instead of small square ones."
- "Soot-stained dark red brick, a railway depot."

## What the cutter does (`tools/bake_facade_kit.py`)

    python3 tools/bake_facade_kit.py          # -> web/data/facade_kit.webp, _mask.png, .json

- Reads every image in each family folder, in the order tenement, interwar,
  cube, village (the shader knows the families by that order). A file
  identical to an earlier one is used once.
- **Finds the rows and bays from the windows** (`find_boxes`): the panes are
  a cool grey-blue, the stucco's shading warm, so the cool dark pixels form
  three bands (top floor, typical floor, ground floor). The typical row is
  cut exactly one storey tall (window top to window top) at a string course,
  so it stacks without a seam; the bays are cut pier-middle to pier-middle
  over the four window centres, which drops the side margins. Where this
  fails it falls back to three equal rows (the run prints which), and
  `kit.json` can give the boxes by hand (see the file's header).
  - A cube-house sheet has two storeys: it is cut at the strongest line
    between them, and the upper floor is used as the typical row too. The
    cellar windows in the plinth form a thin third band; it is left with
    the ground floor.
  - A village sheet is three houses: it is cut at the strongest horizontal
    line within 8% of each third, the whole width, and each strip's wall
    colour is measured on its own.
- Evens out the lighting (divides by a heavy blur of the brightness) and
  scales the sheet so the median wall is the same brightness on every sheet.
- **Masks**, written to `facade_kit_mask.png`:
  - red = glass: cool grey-blue pixels darker than the wall (not wooden
    doors or frames), and pale panes (light grey-blue glass, net curtains)
    that are no darker than the wall but clearly bluer. These light up at night
    and are where the "rooms behind the windows" will go later.
  - blue = relief, guessed (`relief()`): 0.5 is the wall's plane, the range
    ±0.4 m. Glass 28 cm back, the reveal round it 20 cm, large dark warm
    areas (gates, wooden doors) 40 cm back, carved or bright parts that are
    not plain wall (cornices, window crowns, stucco) 6 cm out. A sheet's own
    `_mask.png` gives red and green only; the relief is still guessed.
  - green = paint: pixels near the wall colour, except brick (a brick wall,
    or brick showing through worn plaster), which keeps its own colour. The shader recolours these
    with the building's palette colour or its OSM `building:colour`, and
    leaves stone, ironwork and frames as they are.
  - A sheet's own `<name>_mask.png` (same size as the sheet, red and green
    as above) replaces the guessed one where the guess is wrong.
- Atlas: each sheet is a block of 4 bays × 3 rows at 64 × 80 px a cell
  (256 × 240), eight blocks to an atlas row, 2048 px wide and as tall as
  the rows used (63 sheets: 2048 × 1920). `facade_kit.json` gives each
  family's first sheet and count. The colour is lossy WebP; the masks are a
  separate PNG, because WebP's colour subsampling would smear masks kept in
  colour channels.

## How the game uses it (`shaders.js FACADE_GLSL`)

- Loaded on texture units 14 (colour) and 15 (masks) by `main.js`; each
  family's first sheet and count go to `uKitFam[10]`.
- The family comes from the bake (`tools/facade_zones.json`, by district,
  town and colony; `docs/FACADE_PLAN.md`) when that family has sheets.
  Otherwise the old rule: about 70% of each kind takes its family's kit (by
  seed), the rest keep the procedural variants, and 12% of tenements take an
  interwar sheet.
- Tenements, interwar blocks and cube houses (`kitStack`): the wall is split
  into a ground floor and whole upper storeys stretched to fill the rest;
  the last one is the top-floor row. Ground floor / storey / bay: tenement
  4.4 / 3.6 / 2.9 m, interwar 3.8 / 3.2 / 3.0 m, cube house 3.0 / 2.9 / 2.8 m.
  The ground floor and the floors above come from different sheets (each by
  its own seed), so 10 sheets give 100 combinations before colour.
- Village houses: one of the sheet's three strips, stretched from the
  ground to the eaves, in 3 m bays.
- Colour: tenements and houses take the existing palettes (the village
  houses their own pale one), interwar blocks a muted one (white, grey,
  cream, ochre, sage, pink), and OSM's `building:colour` wins where it is set.
- Night: the glass mask lights up in the same pattern of lit rooms as the
  procedural windows.
- Depth (28 Oct): the caller gives `facade()` the wall's frame (`kitFrame`:
  the eye and the sun along the wall, up, out of it). The sheet is looked up
  three times, each moved along the eye ray by the relief found at the last
  one (parallax), so glass and gates sit back behind their reveals and shift
  as you move. The relief is shaded against the sun from its slope (screen
  derivatives) and recesses are darker inside. The glass reflects the sky
  (the street when looking down) by a Fresnel term and catches the sun's
  glint; each pane leans a little its own way. The reflection is added after
  lighting (`gKitRefl`). Lite (`state.lite`, `uKitPom` 0) skips the parallax
  steps and keeps the shading and the reflection. The parallax fades out
  with `detail` on far walls.

## What was checked (27 Oct)

**The real sheets.** The owner generated 16 files in ChatGPT; two were the
same image, so 15 sheets are in the atlas (one slot left). The cutter found
the rows and bays on all 15 by itself (no `kit.json`). Checked by eye:
- the atlas, and walls stacked from it: the storeys repeat upwards and the
  bays sideways without a visible seam;
- the masks: whole panes and shopfronts are glass, wooden gates and frames
  are not; the brick sheet's brick and the brick under the worn plaster are
  not repainted.

In the running build on Andrássy út by the Opera, at noon and at 22:30:
cornices, pediments and arched gates on the walls, each building in its own
colour, scattered lit windows at night. At 22:30 almost every shopfront was
lit, so the ground floor's lit share went from 0.60 to 0.40 (not looked at
again after the change).

That check found that inner Pest hardly had any tenements to put the kit
on: see NOTES.md Trap 19. The city tiles were rebaked with the fix (same
252,046 buildings).

Before that, the pipeline was checked with six drawn stand-in sheets, which
are removed. Tests 35/35. Not checked: phones. The line contexts were
rebaked with the new tenement rule later that evening (line 70: 8 buildings
changed, line 2: 19, S21: none).

**The other three families (same day)**, before any real sheets: two
tenement sheets were copied into each of `interwar/`, `cube/` and `village/`
as stand-ins. The cutter put them in the right atlas slots with the right
layout (two-storey cut for the cube folder, thirds for the village folder),
the build loaded with no shader errors, and in Göd the houses, both one- and
two-storey, showed the stand-in texture. That shows the routing works, not
how real sheets of those families will look. The modern-flats (kind 10) path
was not looked at in the game. The stand-ins are removed.

**Depth and reflections (28 Oct).** Andrássy út by the Opera, about 50° to
a wall, with the parallax on and off (`uKitPom` switched in the browser):
with it the shop windows and upper windows sit behind their reveals and the
frames shift inside the openings, the cornice reads as standing out; without
it the same wall is flat. At dusk the upper panes take the sky at a glancing
angle (toned down after the first look, where some went nearly white). No
shader errors; tests 36/36. Not seen: a phone, the lite path on a device,
motion (stills only).

**The last six families (28 Oct).** 20 villa (one duplicate skipped), 12
mav, 11 oldtown, 11 garden, 10 civic, 4 szocreal. The cutter found the rows
on all but one old-town sheet ("Weathered Four-Bay European Townhouse
Facade", cut in thirds). Many mav and oldtown sheets get little paint mask,
so they keep their own colours. In the build, the Rákospalota colony's row
houses show the MÁV sheets; no shader errors; tests 35/35.

**The real sheets of the other three families (27 Oct, evening).** The
owner added 16 interwar, 17 cube-house and 15 village sheets, all
1536 × 1024. First run: 5 interwar and 7 cube sheets fell back to thirds,
and the cube sheets that were "found" were cut above the plinth (the cellar
windows counted as a storey). Fixed in the cutter: the ground band may end
at 75% of the height (interwar sheets have a tall base under the shop
windows), and the cellar band is dropped in the two-storey cut. After that
all 63 are found. The masks missed pale glass (an interwar sheet, the
curtained cube windows), so pale bluish panes count as glass too; checked on
twelve blocks old against new, and the tenement masks did not get worse.

In the build:
- Göd at 13:00 and 21:30: village houses with porches and columns,
  shutters, plinths and their own colours; the windows light at night, the
  shutters do not. Two-storey houses show the cube rows.
- Andrássy út with the tenement slot pointed at the interwar sheets (in the
  browser only, put back after): travertine ground floor, balcony rails,
  lit panes at night.
- No console errors; tests 35/35.

## Limits now

- Walls do not know their own length, so a wall may end in the middle of a
  bay (as with all façades today).
- Churches, halls, shops and panel blocks have no kit family.
- The atlas is 2048 × 4080 with 131 sheets: one more row of eight passes the
  4096 px texture limit. More sheets need a second atlas page or smaller
  cells. About 90 MB of GPU memory with mipmaps; a half-size atlas for lite
  mode is not done.
- The szocreal family has 4 sheets (the owner was rate-limited), so its
  blocks repeat more.
- A family takes 24 sheets at most; the atlas grows a row per eight sheets.
  Now 63 sheets, 2048 × 1920: about 42 MB of GPU memory for the colour and
  the mask with mipmaps, which matters on phones (not tried on one). A
  lite-mode half-size atlas would be the fix if phones struggle.
- The modern-flats (kind 10) path has not been seen in the game: no such
  building was found on camera. The interwar sheets were seen only by
  pointing the tenement slot at them for a test (below).
- The relief is guessed from colour. On the cube houses the brown roller-
  shutter boxes count as set back, and so do parts of the dark brick bands
  on the MÁV houses; carved and plain stucco differ by texture only, so a
  rough render can read as slightly raised.
- Parallax is an illusion inside the wall: nothing stands past the
  building's outline, and close up at a steep angle the layers smear.
- Interior mapping (rooms behind the windows) is the next step and needs the
  glass mask from this one.
