[out:json][timeout:900];
// Budapest city layer (bake_city.py): buildings, building relations and
// roads in one ninth of the city box 47.39,18.93 – 47.58,19.25
(
  way(47.4533,19.0367,47.5167,19.1433)["building"];
  relation(47.4533,19.0367,47.5167,19.1433)["building"];
  way(47.4533,19.0367,47.5167,19.1433)["building:part"];
  relation(47.4533,19.0367,47.5167,19.1433)["building:part"];
  way(47.4533,19.0367,47.5167,19.1433)["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
  way(47.4533,19.0367,47.5167,19.1433)["man_made"="bridge"];
);
out body;
>;
out skel qt;
