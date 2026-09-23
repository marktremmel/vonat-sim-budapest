[out:json][timeout:900];
rel(11547066);
way(r)->.l70;
(
  // Widened from 1400 m. Margitsziget sits about two kilometres off the line
  // opposite Újlipótváros and was falling outside the ring entirely, along
  // with most of what you can actually see across a city from a train.
  way(around.l70:2600)["building"];
  way(around.l70:900)["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track)$"];
);
out geom tags;
