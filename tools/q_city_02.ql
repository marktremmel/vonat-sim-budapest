[out:json][timeout:900];
// Budapest city layer (bake_city.py): buildings, building relations and
// roads in one ninth of the city box 47.39,18.93 – 47.58,19.25
(
  way(47.3900,19.1433,47.4533,19.2500)["building"];
  relation(47.3900,19.1433,47.4533,19.2500)["building"];
  way(47.3900,19.1433,47.4533,19.2500)["building:part"];
  relation(47.3900,19.1433,47.4533,19.2500)["building:part"];
  way(47.3900,19.1433,47.4533,19.2500)["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
  way(47.3900,19.1433,47.4533,19.2500)["man_made"="bridge"];
);
out body;
>;
out skel qt;
