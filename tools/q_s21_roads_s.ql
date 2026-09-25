[out:json][timeout:600];
// S21 roads out to 1.5 km (the context query took them only to 800 m, so the
// towns along the line — Dabas, Ócsa, Gyón — ended at the buildings' edge)
rel(14995078);
way(r:"")->.l;
(
  way(around.l:1500)(46.95,18.90,47.40,19.70)["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street)$"];
);
out body;
>;
out skel qt;
