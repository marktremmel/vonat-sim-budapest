import { tt } from "./i18n.js";
// Szolgálat: missions. Each one is a real service on a real stretch — a
// line, a train, where you take it over and where you hand it back, the
// time, the season and the weather — and ends with the scorecard (score.js).
// Stars unlock the next licence grade; the best result per mission is kept
// in the browser (settings.js prefs).

export const TIERS = [
  { name: "Gyakornok", en: "Trainee", need: 0 },
  { name: "Segédmozdonyvezető", en: "Assistant driver", need: 3 },
  { name: "Mozdonyvezető", en: "Driver", need: 7 },
  { name: "Főmozdonyvezető", en: "Senior driver", need: 12 },
];
export const tierName = t => tt(t.name, t.en);
export const mTitle = m => tt(m.title, m.title_en || m.title);
export const mText = m => tt(m.text, m.text_en || m.text);

export const MISSIONS = [
  { id: "m70-elso", tier: 0, line: "line70", scenario: "S70", stock: "FLIRT", from: "Budapest-Nyugati", to: "Rákospalota-Újpest",
    hour: 10, day: 140, wx: "derult", title: "Első kör", title_en: "First run",
    text: "Egy FLIRT, három megálló a városban. W vontat, S fékez: állj meg a megállóhely jelénél, ne előtte, ne utána.",
    text_en: "A FLIRT, three stops in the city. W for power, S to brake: stop at the platform mark, not before it, not after it." },
  { id: "m70-dunakeszi", tier: 0, line: "line70", scenario: "S70", from: "Rákospalota-Újpest", to: "Göd",
    hour: 7.5, day: 110, wx: "gomolyos", title: "Reggeli ingázók", title_en: "Morning commuters",
    text: "A KISS 344 tonna: korán kell fékezni. Hat megálló Dunakeszin át, a menetrendet tartva.",
    text_en: "The KISS weighs 344 tonnes: brake early. Six stops through Dunakeszi, on time." },
  { id: "m2-hegyek", tier: 1, line: "line2", scenario: "S72", from: "Budapest-Nyugati", to: "Pilisvörösvár",
    hour: 8, day: 250, wx: "oszi", title: "Fel a budai hegyekbe", title_en: "Up into the Buda hills",
    text: "Óbuda után végig emelkedő, Solymár fölött egyvágányú szakasz. A jelzők most számítanak.",
    text_en: "Climbing all the way after Óbuda, single track beyond Solymár. The signals matter now." },
  { id: "m70-esti", tier: 1, line: "line70", scenario: "S70", from: "Göd", to: "Vác",
    hour: 19.5, day: 290, wx: "melegfront", title: "Esős este Vác felé", title_en: "A wet evening to Vác",
    text: "Nedves sín: hosszabb a fékút, és megcsúszhat a kerék. J a homokszórás.",
    text_en: "Wet rails: longer braking, and the wheels can slip. J is the sander." },
  { id: "m70-kanyar", tier: 2, line: "line70", scenario: "S70", from: "Vác", to: "Szob",
    hour: 16.5, day: 200, wx: "anticiklon", title: "A Dunakanyar", title_en: "The Danube Bend",
    text: "Nyári délután a Duna mentén Szobig. Szép, de a sebességkorlátok sűrűn változnak.",
    text_en: "A summer afternoon along the Danube to Szob. Beautiful, but the speed limits change often." },
  { id: "m2-kod", tier: 2, line: "line2", scenario: "Z72", from: "Pilisvörösvár", to: "Esztergom",
    hour: 6.7, day: 320, wx: "kod", title: "Ködös Pilis", title_en: "Fog in the Pilis",
    text: "Hajnali köd a völgyekben, egyvágányú pálya, keresztezések a kitérőkben. A jelzőt csak közelről látod.",
    text_en: "Dawn fog in the valleys, single track, crossings in the loops. You see each signal only up close." },
  { id: "s21-alfold", tier: 2, line: "s21", scenario: "S21", from: "Kőbánya-Kispest", to: "Dabas",
    hour: 12, day: 180, wx: "derult", title: "Alföldi egyenes", title_en: "On the Great Plain",
    text: "Hosszú egyenesek, sűrű megállók: itt a pontos megállás és az energia a tét.",
    text_en: "Long straights and close stops: accurate stopping and energy are what count here." },
  { id: "m70-ho", tier: 3, line: "line70", scenario: "S70", from: "Budapest-Nyugati", to: "Vác",
    hour: 6.5, day: 20, wx: "havazas", title: "Havas reggel", title_en: "Snowy morning",
    text: "Hó a sínen, sötét reggel, tele vonat. Harminchárom kilométer, tizenegy megálló.",
    text_en: "Snow on the rails, a dark morning, a full train. Thirty-three kilometres, eleven stops." },
  { id: "m70-teher", tier: 3, line: "line70", scenario: "Freight", from: "Vác", to: "Rákospalota-Újpest",
    hour: 13, day: 230, wx: "szitalas", title: "Tehervonat", title_en: "Freight",
    text: "V43 és húsz kocsi, 1280 tonna. A légfék későn fog és későn old: számold ki előre.",
    text_en: "A V43 and twenty wagons, 1,280 tonnes. The air brake bites late and lets go late: plan ahead." },
  { id: "m70-ec", tier: 3, line: "line70", scenario: "EC", from: "Szob", to: "Budapest-Nyugati",
    hour: 17, day: 150, wx: "zapor", title: "EuroCity Budapestre", title_en: "EuroCity to Budapest",
    text: "V43 öt kocsival, csak Nagymaros-Visegrádon és Vácon áll meg. A menetrend szoros.",
    text_en: "A V43 and five coaches, calling only at Nagymaros-Visegrád and Vác. The timetable is tight." },
];

// The dispatcher game (main.js startDispatch): a prototype, not in the
// mission list. At today's timetable density (line 2 at 7:00 has three
// trains on 52 km) trains rarely meet on the single track, so the
// automatic first-come-first-served rule has nothing to get wrong and a
// shift cannot be won or lost. Reachable as ?line=line2&mission=d2-csucs.
export const DISPATCH = [
  { id: "d2-csucs", tier: 1, type: "dispatch", line: "line2", scenario: "S72", from: "Pilisvörösvár", to: "Esztergom",
    hour: 6.5, dur: 50, day: 95, wx: "szitalas", title: "Forgalmi szolgálat: reggeli csúcs", title_en: "Dispatcher: morning peak",
    text: "Te vagy a forgalomirányító Pilisvörösvár és Esztergom között. Te döntöd el, ki megy előbb az egyvágányú szakaszokon. Egy motorvonat meghibásodik, egy vonat késik. Legyen kevesebb a késés, mint az automatikáé.",
    text_en: "You dispatch Pilisvörösvár to Esztergom and decide who goes first on the single track. A unit fails, a train runs late. Beat the automatic rule." },
  { id: "d21-este", tier: 2, type: "dispatch", line: "s21", scenario: "S21", from: "Ócsa", to: "Lajosmizse",
    hour: 16, dur: 60, day: 300, wx: "oszi", title: "Forgalmi szolgálat: az S21 délutánja", title_en: "Dispatcher: S21 afternoon",
    text: "Óránként egy vonat mindkét irányban, hosszú egyvágányú szakaszok az Alföldön. Egy hiba elég, hogy az egész vonal összecsússzon.",
    text_en: "One train an hour each way, long single-track sections on the plain. One mistake and the whole line slips." },
];

export function totalStars(prefs) {
  const b = (prefs && prefs.missions) || {};
  return Object.entries(b).reduce((a, [id, r]) => a + (id.startsWith("daily-") ? 0 : r.stars || 0), 0);
}
/** Today's challenge: one of the missions, with the date choosing it, its
 *  time and its weather, so everyone driving today drives the same thing. */
export function dailyMission(date = new Date()) {
  const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate();
  let seed = y * 10000 + mo * 100 + d;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  rnd(); rnd();
  const base = MISSIONS[Math.floor(rnd() * MISSIONS.length)];
  const WX = ["derult", "gomolyos", "zapor", "kod", "melegfront", "szitalas", "oszi", "havazas", "zivatar", "anticiklon"];
  const doy = Math.round((date - new Date(y, 0, 1)) / 864e5) + 1;
  const tag = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { ...base, id: `daily-${tag}`, tier: 0, title: `Napi kihívás · ${base.title}`,
           title_en: `Daily challenge · ${base.title_en}`, daily: tag,
           wx: WX[Math.floor(rnd() * WX.length)], hour: Math.round((5.5 + rnd() * 15) * 4) / 4, day: doy };
}
export function unlocked(m, prefs) { return totalStars(prefs) >= TIERS[m.tier].need; }

const fmtHM = h => String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.round((h % 1) * 60)).padStart(2, "0");
const starStr = (n, of = 3) => "★".repeat(n) + `<i>${"★".repeat(of - n)}</i>`;

/** Fill the mission list overlay. onPick(mission) when one is chosen. */
export function renderMissions(el, prefs, onPick) {
  const got = totalStars(prefs);
  const best = (prefs && prefs.missions) || {};
  let html = `<div class="mh"><h2>${tt("Szolgálat", "Missions")}</h2><span class="tot">★ ${got} / ${MISSIONS.length * 3}</span>
    <button class="x" data-close>✕</button></div>`;
  TIERS.forEach((t, i) => {
    const open = got >= t.need;
    html += `<h3>${tierName(t)}${open ? "" : ` <em>— ${tt(`${t.need} csillagtól`, `from ${t.need} stars`)}</em>`}</h3><div class="ml">`;
    for (const m of MISSIONS.filter(m => m.tier === i)) {
      const b = best[m.id];
      html += `<button class="mc${open ? "" : " lock"}" data-id="${m.id}" ${open ? "" : "disabled"}>
        <div class="t"><b>${mTitle(m)}</b><span class="st">${starStr(b ? b.stars : 0)}</span></div>
        <div class="r">${m.type === "dispatch" ? `${tt("Forgalomirányítás", "Dispatching")} · ${m.from} – ${m.to} · ${fmtHM(m.hour)}, ${m.dur} min`
          : `${m.scenario === "Freight" ? tt("Tehervonat", "Freight") : m.scenario} · ${m.from} → ${m.to} · ${fmtHM(m.hour)}`}</div>
        <div class="d">${mText(m)}</div>
        ${b ? `<div class="b">${tt("legjobb", "best")}: ${b.total}%</div>` : ""}</button>`;
    }
    html += `</div>`;
  });
  el.innerHTML = `<div class="card">${html}</div>`;
  el.querySelectorAll("button.mc").forEach(b => b.addEventListener("click", () =>
    onPick(MISSIONS.find(m => m.id === b.dataset.id))));
  el.querySelector("[data-close]").addEventListener("click", () => el.classList.remove("on"));
}

/** The scorecard's inner HTML. */
export function scorecardHTML(res, cats, extra) {
  const bar = (label, v) => v == null ? "" :
    `<div class="sc"><span>${label}</span><div class="sb"><div style="width:${Math.round(v)}%"></div></div><b>${Math.round(v)}</b></div>`;
  return `${cats.map(([k, l]) => bar(l, res.cats[k])).join("")}
    <div class="tot">${res.total}%</div>
    ${res.why ? `<p class="note">${res.why}</p>` : ""}
    ${extra || ""}`;
}
export { starStr };
