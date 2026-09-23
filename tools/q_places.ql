[out:json][timeout:300];
// The whole line, Budapest-Nyugati to Szob, not just the Bend. The Budapest
// end needs more than villages and churches: it is parks, stations, stadiums,
// the zoo and the industrial works that actually name the view from a train.
(
  node(47.44,18.77,47.89,19.30)["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter|island|islet)$"]["name"];
  node(47.44,18.77,47.89,19.30)["amenity"~"^(place_of_worship|townhall|school|university|hospital|museum|castle|theatre)$"]["name"];
  node(47.44,18.77,47.89,19.30)["historic"~"^(castle|monument|ruins|memorial)$"]["name"];
  way(47.44,18.77,47.89,19.30)["historic"="castle"]["name"];
  way(47.44,18.77,47.89,19.30)["amenity"~"^(place_of_worship|university|hospital|museum)$"]["name"];
  way(47.44,18.77,47.89,19.30)["leisure"~"^(park|stadium|sports_centre|marina)$"]["name"];
  way(47.44,18.77,47.89,19.30)["tourism"~"^(zoo|theme_park|attraction|museum)$"]["name"];
  way(47.44,18.77,47.89,19.30)["landuse"~"^(industrial|railway)$"]["name"];
  way(47.44,18.77,47.89,19.30)["man_made"="works"]["name"];
  way(47.44,18.77,47.89,19.30)["building"~"^(train_station|stadium|industrial)$"]["name"];
  way(47.44,18.77,47.89,19.30)["natural"="water"]["name"];
);
out center tags;
