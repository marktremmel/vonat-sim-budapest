[out:json][timeout:900];
// Line 2 (Rákosrendező–Esztergom): buildings, including multipolygon
// relations, within 1600 m, and roads within 900 m. Node-resolved output
// ("out body; >; out skel") like the downtown extract, which bake_context
// already knows how to read.
rel(73117);
way(r)->.l;
(
  way(around.l:1600)["building"];
  relation(around.l:1600)["building"];
  way(around.l:900)["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track)$"];
);
out body;
>;
out skel qt;
