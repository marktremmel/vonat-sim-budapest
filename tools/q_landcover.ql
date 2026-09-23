[out:json][timeout:300];
rel(11547066);
way(r)->.l70;
(
  way(around.l70:2500)["landuse"~"^(forest|vineyard|orchard|meadow|farmland|residential|industrial|allotments|cemetery|quarry)$"];
  way(around.l70:2500)["natural"~"^(wood|scrub|grassland|wetland|bare_rock|cliff)$"];
);
out geom tags;
