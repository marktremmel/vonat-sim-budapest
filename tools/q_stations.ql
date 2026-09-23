[out:json][timeout:240];
(
  node(47.45,18.60,47.90,19.30)["railway"~"^(station|halt|stop)$"];
  way(47.45,18.60,47.90,19.30)["railway"~"^(station|halt)$"];
  relation(47.45,18.60,47.90,19.30)["railway"~"^(station|halt)$"];
);
out center tags;
