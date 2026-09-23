[out:json][timeout:300];
// The OSM geometry the hand-modelled landmarks are anchored to: the bridge
// ways (chained by name) and the outlines of the two big buildings.
(
  way(47.45,18.60,47.85,19.30)["bridge"]["name"~"^(Széchenyi lánchíd|Margit híd|Árpád híd|Megyeri híd|Mária Valéria híd)$"];
  way(47.45,18.60,47.85,19.30)["railway"="rail"]["bridge"]["name"~"összekötő|Újpesti vasúti híd"];
  way(47.45,18.60,47.85,19.30)["building"]["name"~"^(Országház|Szent István-bazilika)$"];
  relation(47.45,18.60,47.85,19.30)["building"]["name"~"^(Országház|Szent István-bazilika)$"];
);
out geom;
