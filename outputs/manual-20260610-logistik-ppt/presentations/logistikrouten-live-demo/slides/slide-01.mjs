import { C, bg, card, label, metric, notes } from "./theme.mjs";

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx, C.ink);
  ctx.addShape(slide, { x: 0, y: 0, w: ctx.W, h: 10, fill: C.red });
  ctx.addShape(slide, { x: 78, y: 150, w: 110, h: 8, fill: C.amber });
  label(slide, ctx, "DHBW / CLOUD COMPUTING / 4. SEMESTER", 78, 108, 560, 28, {
    fontSize: 14,
    bold: true,
    color: "#AFC0D4",
  });
  label(slide, ctx, "Optimierung von Logistikrouten", 76, 176, 900, 118, {
    fontSize: 54,
    bold: true,
    color: C.white,
    typeface: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Cloudbasierter Prototyp für die Schweizer Apothekenlogistik: Hub-Placement, Nachfrage, Routing und CO₂-Nachweis auf realen Daten.",
    80,
    314,
    910,
    74,
    { fontSize: 21, color: "#D8E2F0" },
  );
  card(slide, ctx, 80, 438, 400, 96, { fill: "#243855", line: "#304761" });
  label(slide, ctx, "Pharma Logistics CH", 106, 460, 340, 28, { fontSize: 22, bold: true, color: C.white });
  label(slide, ctx, "Präsentationsfassung mit Live-Demo-Finale", 106, 494, 340, 24, {
    fontSize: 14,
    color: "#B9C8DA",
  });
  metric(slide, ctx, "400", "Apotheken", 720, 432, 140, C.red, true);
  metric(slide, ctx, "58k", "Bevölkerungszellen", 882, 432, 170, C.teal, true);
  metric(slide, ctx, "6+1", "Container im Prod-Betrieb", 1074, 432, 170, C.amber, true);
  label(slide, ctx, "Name / Kurs / Datum: bitte vor Abgabe ergänzen", 80, 642, 600, 24, {
    fontSize: 13,
    color: "#8EA0B7",
  });
  notes(
    slide,
    "Einstieg: Ich zeige einen lauffähigen Cloud-Prototypen für die Schweizer Apothekenlogistik. Das System optimiert Standortwahl und Routen nach Kosten, Zeit und CO₂ und endet mit einer kurzen Live-Demo.",
  );
  return slide;
}
