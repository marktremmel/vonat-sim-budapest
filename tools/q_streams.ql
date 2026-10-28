[out:json][timeout:600];
// Streams, ditches, drains and small canals (bake_streams.py): the Rákos-patak,
// the Szilas-patak, the ditches along the fields. Two boxes: line 70, line 2
// and the city; and S21's plain.
(
  way(47.38,18.62,47.92,19.26)["waterway"~"^(stream|ditch|drain|canal)$"];
  way(46.96,18.97,47.58,19.63)["waterway"~"^(stream|ditch|drain|canal)$"];
);
out geom;
