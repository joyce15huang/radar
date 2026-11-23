// Bay Area areas for the Today filter. Pure and client-safe.

export type AreaKey = "sf" | "eastbay" | "peninsula" | "southbay";
export const AREAS: { key: AreaKey | "all"; label: string }[] = [
  { key: "all", label: "All Bay Area" },
  { key: "sf", label: "San Francisco" },
  { key: "eastbay", label: "East Bay" },
  { key: "peninsula", label: "Peninsula" },
  { key: "southbay", label: "South Bay" },
];
export const isAreaKey = (v: unknown): v is AreaKey => v === "sf" || v === "eastbay" || v === "peninsula" || v === "southbay";

// Checked in order: Peninsula first so "South San Francisco" isn't read as SF;
// SF's Richmond District before the East Bay city of Richmond.
const RULES: [RegExp, AreaKey][] = [
  [/\b(south san francisco|daly city|colma|brisbane|pacifica|san bruno|millbrae|burlingame|hillsborough|san mateo|foster city|belmont|san carlos|redwood city|redwood shores|atherton|menlo park|east palo alto|palo alto|half moon bay|stanford)\b/i, "peninsula"],
  [/\b(san francisco|sf|soma|mission|embarcadero|financial district|fidi|castro|noe valley|haight|marina|presidio|nob hill|russian hill|north beach|chinatown|dogpatch|bernal|potrero|tenderloin|hayes valley|golden gate park|ocean beach|lands end|ferry building|fisherman'?s wharf|twin peaks|excelsior|bayview|glen park|inner sunset|outer sunset|sunset district|inner richmond|outer richmond|richmond district|crissy field|fort mason|japantown|union square|cole valley|west portal|stow lake|mission bay)\b/i, "sf"],
  [/\b(oakland|berkeley|alameda|emeryville|albany|el cerrito|richmond|san leandro|hayward|fremont|union city|newark|castro valley|walnut creek|lafayette|orinda|moraga|concord|pleasant hill|danville|san ramon|pleasanton|dublin|livermore|lake merritt|temescal|rockridge|jack london)\b/i, "eastbay"],
  [/\b(san jose|santa clara|sunnyvale|mountain view|cupertino|campbell|los gatos|saratoga|milpitas|los altos|morgan hill|gilroy|willow glen)\b/i, "southbay"],
];

/** Which area a city / neighborhood / place string is in, if any. */
export function areaOf(...texts: (string | null | undefined)[]): AreaKey | null {
  for (const t of texts) {
    if (!t) continue;
    for (const [re, key] of RULES) if (re.test(t)) return key;
  }
  return null;
}

/** "Embarcadero, San Francisco" → "Embarcadero" (the city is implied by the area filter). */
export function shortPlace(place: string | null | undefined): string {
  return (place ?? "").split(",")[0].trim();
}
