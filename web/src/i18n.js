// Two languages: Hungarian and English. The page decides once, before the
// game starts (index.html sets window.LANG: the saved choice, else the
// browser's language), and switching reloads the page, so nothing has to
// redraw itself in the other language.
//
//   tt("Indulás", "Depart")    the string in the current language
//
// Place and station names stay as they are in either language.

export const LANG = (typeof window !== "undefined" && window.LANG) || "hu";
export const tt = (hu, en) => (LANG === "en" ? en : hu);
