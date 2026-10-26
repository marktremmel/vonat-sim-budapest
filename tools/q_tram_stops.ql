[out:json][timeout:300];
// The stop nodes of the tram routes in q_trams.ql, with their tags (names):
// `out geom` on the relations gives the members' positions but not their tags.
relation(47.35,18.90,47.62,19.30)["type"="route"]["route"="tram"]["ref"~"^(1|2|3|4|6|56|61)$"];
node(r:"stop");
out tags;
relation(47.35,18.90,47.62,19.30)["type"="route"]["route"="tram"]["ref"~"^(1|2|3|4|6|56|61)$"];
node(r:"stop_entry_only");
out tags;
relation(47.35,18.90,47.62,19.30)["type"="route"]["route"="tram"]["ref"~"^(1|2|3|4|6|56|61)$"];
node(r:"stop_exit_only");
out tags;
