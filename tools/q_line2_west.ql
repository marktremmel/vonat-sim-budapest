[out:json][timeout:900];
// The strip west of the line 70 extracts (which stop at 18.76-18.77 E):
// the Pilis and Esztergom end of line 2. Land cover, named places and
// freestanding structures, in the same shapes as q_landcover2 / q_places /
// q_structures so the same bakes read them.
(
  way(47.52,18.58,47.90,18.80)["landuse"~"^(forest|vineyard|orchard|meadow|farmland|allotments|cemetery|quarry|residential|industrial|commercial|retail|railway|brownfield|construction|grass|village_green|recreation_ground|greenhouse_horticulture|farmyard|military)$"];
  way(47.52,18.58,47.90,18.80)["natural"~"^(wood|scrub|grassland|wetland|bare_rock|cliff|heath|sand|beach)$"];
  way(47.52,18.58,47.90,18.80)["leisure"~"^(park|garden|pitch|golf_course|sports_centre|stadium|nature_reserve)$"];
  rel(47.52,18.58,47.90,18.80)["landuse"~"^(forest|vineyard|orchard|meadow|farmland|allotments|cemetery|quarry|residential|industrial|commercial|retail|railway|brownfield|construction|grass|recreation_ground|military)$"];
  rel(47.52,18.58,47.90,18.80)["natural"~"^(wood|scrub|grassland|wetland|bare_rock|cliff|heath)$"];
  rel(47.52,18.58,47.90,18.80)["leisure"~"^(park|golf_course|nature_reserve)$"];
);
out geom;
