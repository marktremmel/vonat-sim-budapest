[out:json][timeout:120];
// Where horses are kept, in the region of the three lines (bake_horses.py)
(
  nwr(46.95,18.30,47.95,19.75)["leisure"="horse_riding"];
  nwr(46.95,18.30,47.95,19.75)["landuse"="animal_keeping"]["animal_keeping"="horse"];
  nwr(46.95,18.30,47.95,19.75)["landuse"="paddock"];
  nwr(46.95,18.30,47.95,19.75)["sport"="equestrian"]["leisure"~"pitch|track|sports_centre"];
);
out center tags;
