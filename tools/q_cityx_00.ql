[out:json][timeout:600];
// The city's extras (bake_cityx.py): every railway, tram and light rail;
// industrial structures; power lines; solar farms; things worth a label.
// One ninth of the city box.
(
  way(47.3900,18.9300,47.4533,19.0367)["railway"~"^(rail|light_rail|tram|narrow_gauge|subway|funicular)$"];
  node(47.3900,18.9300,47.4533,19.0367)["man_made"~"^(chimney|tower|mast|storage_tank|silo|water_tower|gasometer|crane|communications_tower|lighthouse)$"];
  way(47.3900,18.9300,47.4533,19.0367)["man_made"~"^(chimney|tower|storage_tank|silo|water_tower|gasometer|pipeline|communications_tower)$"];
  way(47.3900,18.9300,47.4533,19.0367)["power"="line"];
  node(47.3900,18.9300,47.4533,19.0367)["power"="tower"];
  way(47.3900,18.9300,47.4533,19.0367)["power"~"^(plant|generator)$"]["plant:source"="solar"];
  way(47.3900,18.9300,47.4533,19.0367)["power"="generator"]["generator:source"="solar"];
  node(47.3900,18.9300,47.4533,19.0367)["tourism"~"^(viewpoint|attraction|museum)$"]["name"];
  way(47.3900,18.9300,47.4533,19.0367)["tourism"~"^(attraction|museum|zoo|theme_park)$"]["name"];
  node(47.3900,18.9300,47.4533,19.0367)["historic"~"^(monument|memorial|castle|ruins)$"]["name"];
  way(47.3900,18.9300,47.4533,19.0367)["historic"~"^(monument|castle|ruins|building)$"]["name"];
  way(47.3900,18.9300,47.4533,19.0367)["amenity"~"^(place_of_worship|hospital|university|prison|grave_yard|marketplace|townhall)$"]["name"];
  way(47.3900,18.9300,47.4533,19.0367)["landuse"~"^(cemetery|industrial)$"]["name"];
  way(47.3900,18.9300,47.4533,19.0367)["aeroway"~"^(runway|terminal|apron|taxiway)$"];
);
out body geom;
