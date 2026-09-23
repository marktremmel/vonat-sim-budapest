[out:json][timeout:600];
// A 2.6 km ring around the whole 63 km line is too heavy for the public
// mirrors, and it is only the Budapest end that needs the extra width. This
// is a plain bounding box over Margitsziget, Újlipótváros and Angyalföld —
// everything west of the line that you can see across the city from a train.
(
  way(47.498,19.028,47.566,19.078)["building"];
);
out geom tags;
