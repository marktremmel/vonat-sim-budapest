// The ten base types of the International Cloud Atlas, with the Hungarian
// names and the height bands used for Hungary: low under 2 km, middle 2–7 km,
// high above that. Each is a deck at a real altitude, so the projection in the
// sky shader does the perspective honestly.
//
// deck  = [altitude m, feature scale m, coverage 0..1, opacity]
// shape = [sharpness, fibrousness, vertical build, self-shadow]
export const CLOUD_TYPES = [
  { id: "clear", hu: "derült ég", la: "", code: "", band: "",
    deck: [1000, 1000, 0, 0], shape: [0, 0, 0, 0] },

  { id: "cu", hu: "gomolyfelhő", la: "cumulus", code: "Cu", band: "alacsony, függőleges",
    deck: [1300, 850, 0.44, 0.96], shape: [0.86, 0.02, 1.00, 0.55],
    hi: "ci", hiAmt: 0.35 },
  { id: "sc", hu: "gomolyos rétegfelhő", la: "stratocumulus", code: "Sc", band: "alacsony",
    deck: [1500, 1700, 0.74, 0.90], shape: [0.52, 0.06, 0.45, 0.42] },
  { id: "st", hu: "rétegfelhő", la: "stratus", code: "St", band: "alacsony",
    deck: [520, 4200, 0.94, 0.92], shape: [0.10, 0.18, 0.05, 0.18] },

  { id: "ac", hu: "párnafelhő", la: "altocumulus", code: "Ac", band: "középmagas",
    deck: [4200, 1050, 0.64, 0.82], shape: [0.58, 0.12, 0.34, 0.36] },
  { id: "as", hu: "lepelfelhő", la: "altostratus", code: "As", band: "középmagas",
    deck: [4800, 6200, 0.92, 0.76], shape: [0.08, 0.38, 0.03, 0.12] },

  { id: "ci", hu: "pehelyfelhő", la: "cirrus", code: "Ci", band: "magas",
    deck: [9200, 3200, 0.34, 0.55], shape: [0.30, 0.92, 0.05, 0.04] },
  { id: "cc", hu: "bárányfelhő", la: "cirrocumulus", code: "Cc", band: "magas",
    deck: [8200, 620, 0.52, 0.62], shape: [0.62, 0.26, 0.16, 0.20] },
  { id: "cs", hu: "fátyolfelhő", la: "cirrostratus", code: "Cs", band: "magas",
    deck: [8600, 9000, 0.90, 0.34], shape: [0.05, 0.62, 0.02, 0.03] },

  { id: "ns", hu: "esőrétegfelhő", la: "nimbostratus", code: "Ns", band: "függőleges",
    deck: [1400, 7000, 1.00, 1.00], shape: [0.05, 0.20, 0.02, 0.86] },
  { id: "cb", hu: "zivatarfelhő", la: "cumulonimbus", code: "Cb", band: "függőleges",
    deck: [900, 2600, 0.70, 1.00], shape: [0.90, 0.05, 1.25, 0.82],
    hi: "cs", hiAmt: 0.7 },
];

export const CLOUD_BY_ID = Object.fromEntries(CLOUD_TYPES.map(c => [c.id, c]));

/** Resolve a selection into the two decks the shader wants. */
export function cloudUniforms(id) {
  const t = CLOUD_BY_ID[id] || CLOUD_BY_ID.clear;
  const hi = t.hi ? CLOUD_BY_ID[t.hi] : null;
  const hiDeck = hi ? hi.deck.slice() : [9000, 3000, 0, 0];
  if (hi) hiDeck[3] = hi.deck[3] * (t.hiAmt || 0.4);
  return {
    a: t.deck, aShape: t.shape,
    b: hiDeck, bShape: hi ? hi.shape : [0, 0, 0, 0],
    label: t.id === "clear" ? "derült ég"
         : `${t.hu} · ${t.la} (${t.code}) · ${t.band}`,
  };
}
