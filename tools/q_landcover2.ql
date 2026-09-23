[out:json][timeout:900];
// The whole line, and more classes than the Bend needed: a city is parks,
// brownfield, railway land, retail sheds and sports pitches, none of which
// exist between Vác and Szob.
(
  way(47.44,18.76,47.89,19.30)["landuse"~"^(forest|vineyard|orchard|meadow|farmland|allotments|cemetery|quarry|residential|industrial|commercial|retail|railway|brownfield|construction|grass|village_green|recreation_ground|greenhouse_horticulture|farmyard|military)$"];
  way(47.44,18.76,47.89,19.30)["natural"~"^(wood|scrub|grassland|wetland|bare_rock|cliff|heath|sand|beach)$"];
  way(47.44,18.76,47.89,19.30)["leisure"~"^(park|garden|pitch|golf_course|sports_centre|stadium|nature_reserve)$"];
  rel(47.44,18.76,47.89,19.30)["landuse"~"^(forest|vineyard|orchard|meadow|farmland|allotments|cemetery|quarry|residential|industrial|commercial|retail|railway|brownfield|construction|grass|recreation_ground|military)$"];
  rel(47.44,18.76,47.89,19.30)["natural"~"^(wood|scrub|grassland|wetland|bare_rock|cliff|heath)$"];
  rel(47.44,18.76,47.89,19.30)["leisure"~"^(park|golf_course|nature_reserve)$"];
);
out geom;
