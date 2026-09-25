[out:json][timeout:300];
// Oil and gas wells (the Ócsa – Inárcs – Dabas field by S21, and anything
// else in the region): pumpjacks for structures.js (class 9), via bake_linex.py
(
  node(46.90,18.50,48.10,19.75)["man_made"="petroleum_well"];
  way(46.90,18.50,48.10,19.75)["man_made"="petroleum_well"];
  node(46.90,18.50,48.10,19.75)["man_made"="pumpjack"];
);
out body center;
