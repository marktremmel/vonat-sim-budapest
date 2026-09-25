[out:json][timeout:600];
// Named places and a few kinds of thing along line70 (bake_linex.py): sights
// for the labels, quarries, solar farms, pipelines above ground.
(
  node(47.4565,18.7729,47.8813,19.2382)["tourism"~"^(viewpoint|attraction|museum|alpine_hut)$"]["name"];
  way(47.4565,18.7729,47.8813,19.2382)["tourism"~"^(attraction|museum|zoo|theme_park)$"]["name"];
  node(47.4565,18.7729,47.8813,19.2382)["historic"~"^(monument|castle|ruins|memorial|archaeological_site)$"]["name"];
  way(47.4565,18.7729,47.8813,19.2382)["historic"~"^(monument|castle|ruins|building|archaeological_site)$"]["name"];
  node(47.4565,18.7729,47.8813,19.2382)["man_made"~"^(tower|water_tower|communications_tower)$"]["name"];
  way(47.4565,18.7729,47.8813,19.2382)["landuse"="quarry"];
  way(47.4565,18.7729,47.8813,19.2382)["power"~"^(plant|generator)$"]["plant:source"="solar"];
  way(47.4565,18.7729,47.8813,19.2382)["power"="generator"]["generator:source"="solar"];
  way(47.4565,18.7729,47.8813,19.2382)["man_made"="pipeline"]["location"~"^(overground|overhead)$"];
  way(47.4565,18.7729,47.8813,19.2382)["amenity"~"^(place_of_worship|monastery|prison|hospital)$"]["name"];
  way(47.4565,18.7729,47.8813,19.2382)["landuse"="industrial"]["name"];
);
out body geom;
