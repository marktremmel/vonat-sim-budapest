[out:json][timeout:600];
// Freestanding structures. Every context query filters on ["building"], so
// nothing OSM maps as a bare man_made feature was ever downloaded — which is
// why the cement works had no chimney and Hősök tere no column. This asks
// for the vertical things a train window actually picks out of a skyline.
// Nodes and ways both: a chimney is usually a node, a silo often a way.
(
  nwr(47.44,18.76,47.89,19.30)["man_made"~"^(chimney|tower|silo|storage_tank|gasometer|crane|mast|communications_tower|lighthouse|windmill|water_tower)$"];
  nwr(47.44,18.76,47.89,19.30)["historic"~"^(monument|memorial)$"]["name"];
  nwr(47.44,18.76,47.89,19.30)["power"="tower"](if: count_tags() > 1);
);
out geom tags;
