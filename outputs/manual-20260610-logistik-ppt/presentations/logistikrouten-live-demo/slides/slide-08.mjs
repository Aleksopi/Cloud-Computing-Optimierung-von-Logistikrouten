import { C, bg, title, footer, card, label, bulletList, notes } from "./theme.mjs";

export async function slide08(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "Optimierungsfaktoren", "Entfernung, Verkehr und Kapazität in der Entscheidung", "Die Faktoren sind nicht nur Folienpunkte, sondern Teil des Scores und der Constraints.");

  const cols = [
    [92, C.blue, "Entfernung", ["OSRM-Straßendistanz statt Luftlinie", "Treibt Kilometerkosten und CO₂", "Basis für Einzelfahrten-Baseline"]],
    [474, C.amber, "Verkehr / Zeit", ["OSRM-Fahrzeit unterscheidet Stadt und Autobahn", "Tageszeit-Modell für Live-Traffic-Simulation", "Optional TomTom API über API-Key"]],
    [856, C.teal, "Kapazität", ["Fahrzeugladung als harte Restriktion", "Hub-Lagerkapazität begrenzt Zuordnung", "Reichweite, Schicht und Öffnungszeit zusätzlich"]],
  ];
  for (const [x, color, head, items] of cols) {
    card(slide, ctx, x, 205, 330, 318, { fill: C.white, line: color });
    ctx.addShape(slide, { x, y: 205, w: 330, h: 64, fill: color });
    label(slide, ctx, head, x + 24, 219, 284, 34, { fontSize: 24, bold: true, color: color === C.amber ? C.ink : C.white, valign: "middle" });
    bulletList(slide, ctx, items, x + 28, 306, 258, { fontSize: 16, gap: 58, dot: color });
  }

  card(slide, ctx, 214, 560, 850, 58, { fill: C.darkPanel, line: C.darkPanel });
  label(slide, ctx, "Präsentationspunkt: Eine andere Gewichtung verändert messbar Fahrzeugwahl, Stoppreihenfolge und Ergebniskennzahlen.", 238, 573, 804, 26, {
    fontSize: 17,
    bold: true,
    color: C.white,
    align: "center",
  });
  footer(slide, ctx, 8);
  notes(slide, "Hier die drei geforderten Faktoren zeigen: Entfernung als echte Straßendistanz, Verkehr bzw. Zeit als echte Fahrzeit plus optionales Live-Traffic-Modell, Kapazität als harte Restriktion für Fahrzeuge und Hubs.");
  return slide;
}
