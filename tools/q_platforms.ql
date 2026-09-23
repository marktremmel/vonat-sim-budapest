[out:json][timeout:300];
rel(11547066);
way(r)->.l70;
(
  way(around.l70:500)["railway"="platform"];
  node(around.l70:500)["railway"="platform"];
  way(around.l70:500)["public_transport"="platform"];
  way(around.l70:500)["railway"="station"];
  way(around.l70:500)["landuse"="railway"];
);
out geom tags;
