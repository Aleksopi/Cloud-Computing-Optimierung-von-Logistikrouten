import { C, bg, title, footer, card, label, bulletList, smallCode, notes } from "./theme.mjs";

export async function slide07(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "Algorithmen", "Kurz erklärt: Standortwahl + Tourenplanung", "Beide Kernprobleme sind NP-schwer, deshalb arbeitet der Prototyp mit schnellen Heuristiken.");

  card(slide, ctx, 82, 190, 330, 302, { fill: C.white, line: C.teal });
  label(slide, ctx, "1 / Demand & p-Median", 110, 218, 270, 30, { fontSize: 21, bold: true, color: C.teal });
  bulletList(slide, ctx, [
    "Bedarf aus Bevölkerung im Catchment",
    "Kandidaten werden nach Nachfrage gewichtet",
    "Hubs nahe an hoher Nachfrage gewinnen",
  ], 112, 276, 245, { fontSize: 15, gap: 52, dot: C.teal });

  card(slide, ctx, 474, 190, 330, 302, { fill: C.white, line: C.blue });
  label(slide, ctx, "2 / Assignment", 502, 218, 270, 30, { fontSize: 21, bold: true, color: C.blue });
  bulletList(slide, ctx, [
    "OSRM liefert Fahrzeitmatrix",
    "Nächster Hub ist nur gültig, wenn Kapazität reicht",
    "HQ beliefert nahe Apotheken direkt",
  ], 504, 276, 245, { fontSize: 15, gap: 52, dot: C.blue });

  card(slide, ctx, 866, 190, 330, 302, { fill: C.white, line: C.red });
  label(slide, ctx, "3 / Greedy-VRP", 894, 218, 270, 30, { fontSize: 21, bold: true, color: C.red });
  bulletList(slide, ctx, [
    "Nächster Stopp mit bestem Score",
    "Kapazität, Reichweite und Schicht als harte Grenzen",
    "Kosten, Zeit und CO₂ als steuerbare Ziele",
  ], 896, 276, 245, { fontSize: 15, gap: 52, dot: C.red });

  smallCode(slide, ctx, "Score = w_cost * cost_norm\n      + w_time * time_norm\n      + w_co2  * co2_norm\n\nStandard: 0.40 / 0.35 / 0.25", 216, 530, 848, 112);
  footer(slide, ctx, 7);
  notes(slide, "Algorithmen kurz: Demand kommt aus einem geometrischen Catchment-Modell. Die Standortwahl ist ein nachfragegewichteter p-Median. Die Zuordnung nutzt OSRM-Fahrzeiten und Kapazitäten. Die Touren entstehen durch ein Greedy-Mehrziel-VRP mit verallgemeinerten Kosten.");
  return slide;
}
