[out:json][timeout:600];
// Szentendre, the Szentendre island's south end and Budakalász (owner:
// "more detail on Szentendre island and Szentendre itself, flying greatly
// increases the possible paths"). Across the river from line 70, past its
// building ring; merged by bake_context.py with its own radius (SZENTENDRE box).
(
  way(47.585,19.020,47.720,19.110)["building"];
  relation(47.585,19.020,47.720,19.110)["building"];
  way(47.585,19.020,47.720,19.110)["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link)$"];
);
out body;
>;
out skel qt;
