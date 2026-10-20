import { C, bg, title, footer, card, label, pill, notes } from "./theme.mjs";

export async function slide09(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "Web-App & API", "Die Demo ist kein Skript, sondern eine bedienbare Anwendung", "Frontend, REST-API und Worker-Zustand sind sichtbar und nachvollziehbar.");

  card(slide, ctx, 76, 184, 686, 430, { fill: "#FDFDFB", line: "#BFC8D2" });
  ctx.addShape(slide, { x: 76, y: 184, w: 686, h: 44, fill: C.ink2 });
  label(slide, ctx, "Pharma Logistics CH", 102, 194, 260, 24, { fontSize: 15, bold: true, color: C.white });
  card(slide, ctx, 102, 254, 420, 310, { fill: "#E6EFEA", line: "#C8D8D1" });
  ctx.addShape(slide, { x: 150, y: 336, w: 280, h: 4, fill: C.teal });
  ctx.addShape(slide, { x: 208, y: 392, w: 260, h: 4, fill: C.red });
  ctx.addShape(slide, { x: 168, y: 468, w: 244, h: 4, fill: C.blue });
  for (const [x, y, c] of [[176, 335, C.red], [356, 390, C.teal], [288, 466, C.blue], [438, 342, C.amber], [244, 512, C.violet]]) {
    ctx.addShape(slide, { x, y, w: 16, h: 16, geometry: "ellipse", fill: c });
  }
  card(slide, ctx, 548, 254, 184, 310, { fill: C.white, line: "#D8DEE4" });
  pill(slide, ctx, "Pipeline", 572, 276, 88, C.red, C.paleRed);
  label(slide, ctx, "1 Demand\n2 Hubs\n3 Assignment\n4 Routing", 572, 326, 120, 120, { fontSize: 18, color: C.ink });
  pill(slide, ctx, "Analyse", 572, 484, 88, C.teal, C.paleTeal);
  label(slide, ctx, "Kosten / Zeit / CO₂", 572, 528, 130, 28, { fontSize: 14, color: C.muted });

  card(slide, ctx, 820, 210, 350, 360, { fill: C.white });
  label(slide, ctx, "Wichtige REST-Endpunkte", 850, 238, 280, 30, { fontSize: 22, bold: true, color: C.ink });
  label(slide, ctx, "GET  /api/health\nGET  /api/settings\nPOST /api/pipeline/run\nGET  /api/pipeline/status\nGET  /api/results/routes\nGET  /api/results/summary", 852, 298, 280, 180, {
    fontSize: 18,
    color: C.ink2,
    typeface: ctx.fonts.mono,
  });
  label(slide, ctx, "Swagger UI: http://localhost:8000/docs", 852, 510, 280, 30, { fontSize: 15, bold: true, color: C.red });

  footer(slide, ctx, 9);
  notes(slide, "Produktbeweis: Die Demo nutzt die echte Web-App. Auf der Karte sieht man Hubs und Routen, im Panel startet man die Pipeline, das Dashboard zeigt Ergebnisse. Die API ist über Swagger nachvollziehbar.");
  return slide;
}
