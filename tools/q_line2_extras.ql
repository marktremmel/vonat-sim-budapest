[out:json][timeout:600];
// Named places, structures and the level crossings on line 2 itself.
rel(73117);
way(r)->.l;
node(w.l)["railway"="level_crossing"]->.x;
(
  node(47.52,18.58,47.90,18.80)["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter|island|islet)$"]["name"];
  node(47.52,18.58,47.90,18.80)["amenity"~"^(place_of_worship|townhall|school|university|hospital|museum|castle|theatre)$"]["name"];
  node(47.52,18.58,47.90,18.80)["historic"~"^(castle|monument|ruins|memorial)$"]["name"];
  way(47.52,18.58,47.90,18.80)["historic"="castle"]["name"];
  way(47.52,18.58,47.90,18.80)["amenity"~"^(place_of_worship|university|hospital|museum)$"]["name"];
  way(47.52,18.58,47.90,18.80)["building"~"^(train_station|cathedral|basilica)$"]["name"];
  nwr(47.52,18.58,47.90,18.80)["man_made"~"^(chimney|tower|silo|storage_tank|gasometer|crane|mast|communications_tower|water_tower)$"];
  .x;
);
out center;
