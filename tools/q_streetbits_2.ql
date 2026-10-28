[out:json][timeout:600];
// Stops, shelters, platforms, bins, benches and fences in the city box
// (bake_streetbits.py), one third of it (47.5167–47.5800 N).
(
  node(47.5167,18.93,47.5800,19.25)["highway"="bus_stop"];
  node(47.5167,18.93,47.5800,19.25)["railway"="tram_stop"];
  node(47.5167,18.93,47.5800,19.25)["public_transport"="platform"];
  way(47.5167,18.93,47.5800,19.25)["public_transport"="platform"];
  way(47.5167,18.93,47.5800,19.25)["railway"="platform"];
  nwr(47.5167,18.93,47.5800,19.25)["amenity"="shelter"];
  node(47.5167,18.93,47.5800,19.25)["amenity"~"^(waste_basket|bench|recycling)$"];
  way(47.5167,18.93,47.5800,19.25)["barrier"~"^(fence|hedge|guard_rail)$"];
);
out geom;
