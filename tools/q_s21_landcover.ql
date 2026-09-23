[out:json][timeout:900];




(
  way(46.95,18.95,47.60,19.66)["landuse"~"^(forest|vineyard|orchard|meadow|farmland|allotments|cemetery|quarry|residential|industrial|commercial|retail|railway|brownfield|construction|grass|village_green|recreation_ground|greenhouse_horticulture|farmyard|military)$"];
  way(46.95,18.95,47.60,19.66)["natural"~"^(wood|scrub|grassland|wetland|bare_rock|cliff|heath|sand|beach)$"];
  way(46.95,18.95,47.60,19.66)["leisure"~"^(park|garden|pitch|golf_course|sports_centre|stadium|nature_reserve)$"];
  rel(46.95,18.95,47.60,19.66)["landuse"~"^(forest|vineyard|orchard|meadow|farmland|allotments|cemetery|quarry|residential|industrial|commercial|retail|railway|brownfield|construction|grass|recreation_ground|military)$"];
  rel(46.95,18.95,47.60,19.66)["natural"~"^(wood|scrub|grassland|wetland|bare_rock|cliff|heath)$"];
  rel(46.95,18.95,47.60,19.66)["leisure"~"^(park|golf_course|nature_reserve)$"];
);
out geom;
