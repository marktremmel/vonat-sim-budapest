[out:json][timeout:600];
// Fót and the M0/M3 junction east of Dunakeszi (owner: "Fót infrastructure:
// logistics warehouses & highway interchanges"): 3–5 km off line 70, outside
// both the city box and the line's 2.4 km building ring. Merged into line
// 70's context by bake_context.py (EXTRA), with its own radius there.
(
  way(47.585,19.120,47.645,19.235)["building"];
  relation(47.585,19.120,47.645,19.235)["building"];
  way(47.585,19.120,47.645,19.235)["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|unclassified|residential)$"];
);
out body;
>;
out skel qt;
