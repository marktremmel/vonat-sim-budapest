[out:json][timeout:600];
// Budapest tram routes (trams.js): the route relations for 1, 2, 3, 4, 6,
// 56, 61 with their ways (geometry) and stop positions, in order.
(
  relation(47.35,18.90,47.62,19.30)["type"="route"]["route"="tram"]["ref"~"^(1|2|3|4|6|56|61)$"];
);
out body geom;
