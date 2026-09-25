[out:json][timeout:600];
// Named places and a few kinds of thing along s21 (bake_linex.py): sights
// for the labels, quarries, solar farms, pipelines above ground.
(
  node(46.9721,18.9774,47.5756,19.6245)["tourism"~"^(viewpoint|attraction|museum|alpine_hut)$"]["name"];
  way(46.9721,18.9774,47.5756,19.6245)["tourism"~"^(attraction|museum|zoo|theme_park)$"]["name"];
  node(46.9721,18.9774,47.5756,19.6245)["historic"~"^(monument|castle|ruins|memorial|archaeological_site)$"]["name"];
  way(46.9721,18.9774,47.5756,19.6245)["historic"~"^(monument|castle|ruins|building|archaeological_site)$"]["name"];
  node(46.9721,18.9774,47.5756,19.6245)["man_made"~"^(tower|water_tower|communications_tower)$"]["name"];
  way(46.9721,18.9774,47.5756,19.6245)["landuse"="quarry"];
  way(46.9721,18.9774,47.5756,19.6245)["power"~"^(plant|generator)$"]["plant:source"="solar"];
  way(46.9721,18.9774,47.5756,19.6245)["power"="generator"]["generator:source"="solar"];
  way(46.9721,18.9774,47.5756,19.6245)["man_made"="pipeline"]["location"~"^(overground|overhead)$"];
  way(46.9721,18.9774,47.5756,19.6245)["amenity"~"^(place_of_worship|monastery|prison|hospital)$"]["name"];
  way(46.9721,18.9774,47.5756,19.6245)["landuse"="industrial"]["name"];
);
out body geom;
