[out:json][timeout:300];
// OSM "Simple 3D Buildings": building:part outlines with their own height,
// min_height and roof shape. Where mappers have modelled a landmark in 3D
// (domes, towers, spires) this is the shape from the data, not from us.
// Inner Budapest, Vác and Esztergom old towns.
(
  way(47.470,19.020,47.530,19.090)["building:part"];
  relation(47.470,19.020,47.530,19.090)["building:part"];
  way(47.770,19.120,47.790,19.140)["building:part"];
  way(47.785,18.725,47.805,18.750)["building:part"];
  way(47.470,19.020,47.530,19.090)["attraction"="big_wheel"];
);
out geom;
