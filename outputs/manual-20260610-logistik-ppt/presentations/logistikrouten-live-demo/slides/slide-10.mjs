import { C, bg, title, footer, card, label, metric, bulletList, notes } from "./theme.mjs";

export async function slide10(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "Ergebnisnachweis", "Der Nutzen wird gegen eine naive Baseline gemessen", "Vergleich: konsolidierte Mehrstopp-Routen vs. Einzelfahrt je Apotheke.");

  metric(slide, ctx, "km", "Strecke reduziert", 118, 210, 180, C.blue);
  metric(slide, ctx, "CHF", "Transportkosten reduziert", 338, 210, 210, C.red);
  metric(slide, ctx, "h", "Fahrzeit bewertet", 588, 210, 180, C.amber);
  metric(slide, ctx, "kg", "CO₂ transparent", 808, 210, 180, C.green);

  card(slide, ctx, 116, 368, 472, 182, { fill: C.white });
  label(slide, ctx, "Dashboard zeigt", 146, 394, 370, 30, { fontSize: 22, bold: true, color: C.ink });
  bulletList(slide, ctx, ["Gesamtkosten und Einsparung", "Last-Mile und Hauptlauf getrennt", "Hub-Auslastung, Verkehr, CO₂"], 148, 444, 360, { fontSize: 16, gap: 38, dot: C.red });

  card(slide, ctx, 690, 368, 472, 182, { fill: C.paleTeal, line: "#B9DFD8" });
  label(slide, ctx, "Warum das überzeugt", 720, 394, 370, 30, { fontSize: 22, bold: true, color: C.teal });
  bulletList(slide, ctx, ["Quantitativ statt nur visuell", "Konfiguration ändert die Kennzahlen", "Jede Route bleibt auf der Karte prüfbar"], 722, 444, 360, { fontSize: 16, gap: 38, dot: C.teal });

  footer(slide, ctx, 10);
  notes(slide, "Ergebnisnachweis: Wichtig ist der Vergleich zur Baseline. Nicht nur schöne Karten, sondern Einsparungen in Strecke, Kosten, Zeit und CO₂. Die konkreten Werte hängen von der Konfiguration ab und werden im Dashboard berechnet.");
  return slide;
}
