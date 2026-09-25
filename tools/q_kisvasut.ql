[out:json][timeout:300];
// Királyréti Erdei Vasút (Kismaros – Szokolya – Királyrét): its narrow-gauge
// track and stops (bake_kisvasut.py)
(
  way(47.815,18.93,47.905,19.04)["railway"="narrow_gauge"];
  node(47.815,18.93,47.905,19.04)["railway"~"^(station|halt|stop)$"];
  relation(47.815,18.93,47.905,19.04)["route"~"^(train|railway)$"]["name"~"Királyr"];
);
out body geom;
