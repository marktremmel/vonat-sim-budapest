[out:json][timeout:300];
// Signals, stations and km posts on S21's own ways.
rel(14995078);
way(r:"")->.l;
(
  node(w.l)["railway"="signal"];
  node(w.l)["railway"="milestone"];
  node(around.l:250)["railway"~"^(station|halt|stop)$"];
  node(around.l:250)["public_transport"="station"]["train"="yes"];
);
out body;
