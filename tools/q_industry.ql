[out:json][timeout:600];
// Industrial buildings within 3 km of line 70, fresh: the Samsung SDI plant
// at Göd has been extended and mapped since the first corridor extract,
// which had 13 small buildings on a site OSM now fills with its halls.
rel(11547066);
way(r)->.l70;
(
  way(around.l70:3000)["building"~"^(industrial|warehouse|factory|manufacture|hangar|service|storage_tank|silo)$"];
  relation(around.l70:3000)["building"~"^(industrial|warehouse|factory|manufacture|hangar)$"];
);
out body;
>;
out skel qt;
