[out:json][timeout:600];
// Named places, structures and the level crossings on S21 itself.
rel(14995078);
way(r:"")->.l;
node(w.l)["railway"="level_crossing"]->.x;
(
  node(46.95,18.95,47.60,19.66)["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter|island|islet)$"]["name"];
  node(46.95,18.95,47.60,19.66)["amenity"~"^(place_of_worship|townhall|school|university|hospital|museum|castle|theatre)$"]["name"];
  node(46.95,18.95,47.60,19.66)["historic"~"^(castle|monument|ruins|memorial)$"]["name"];
  way(46.95,18.95,47.60,19.66)["historic"="castle"]["name"];
  way(46.95,18.95,47.60,19.66)["amenity"~"^(place_of_worship|university|hospital|museum)$"]["name"];
  way(46.95,18.95,47.60,19.66)["building"~"^(train_station|cathedral|basilica)$"]["name"];
  nwr(46.95,18.95,47.60,19.66)["man_made"~"^(chimney|tower|silo|storage_tank|gasometer|crane|mast|communications_tower|water_tower)$"];
  .x;
);
out center;
