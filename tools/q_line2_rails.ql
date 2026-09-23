[out:json][timeout:300];
// Every track along line 2, not just the relation's running line: the
// passing loops and sidings of its stations, so the single-track line can
// cross trains where the real one does, and the loops are drawn.
rel(73117);
way(r)->.l;
way(around.l:70)["railway"~"^(rail|disused|construction)$"];
out geom;
