[out:json][timeout:900];
// S21 buildings (incl. relations) and roads along the line, in two halves
// (the whole line in one query timed out on every mirror)
rel(14995078);
way(r:"")->.l;
(
  way(around.l:1200)(47.40,18.90,47.60,19.70)["building"];
  relation(around.l:1200)(47.40,18.90,47.60,19.70)["building"];
  way(around.l:700)(47.40,18.90,47.60,19.70)["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track)$"];
);
out body;
>;
out skel qt;
