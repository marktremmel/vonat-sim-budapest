[out:json][timeout:300];
// Esztergom and Párkány (Štúrovo) across the river: the old town and the Castle Hill with the Basilica stand 1.5-2.5 km
// north of the station at the end of line 2 — past the 1600 m corridor, and
// the one view on this line nobody should miss.
(
  way(47.770,18.690,47.825,18.775)["building"];
  relation(47.770,18.690,47.825,18.775)["building"];
  way(47.770,18.690,47.825,18.775)["highway"~"^(primary|secondary|tertiary|unclassified|residential)$"];
  way(47.770,18.690,47.825,18.775)["bridge"="yes"];
);
out body;
>;
out skel qt;
