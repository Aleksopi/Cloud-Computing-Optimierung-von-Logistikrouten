import { C, bg, card, label, smallCode, notes } from "./theme.mjs";

function demoStep(slide, ctx, n, head, body, x, y, color) {
  ctx.addShape(slide, { x, y, w: 42, h: 42, geometry: "ellipse", fill: color });
  label(slide, ctx, String(n), x, y + 9, 42, 24, { fontSize: 19, bold: true, color: C.white, align: "center" });
  label(slide, ctx, head, x + 58, y - 2, 300, 28, { fontSize: 21, bold: true, color: C.white });
  label(slide, ctx, body, x + 58, y + 32, 330, 44, { fontSize: 14.5, color: "#C6D5E8" });
}

export async function slide11(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx, C.ink);
  ctx.addShape(slide, { x: 0, y: 0, w: ctx.W, h: 10, fill: C.red });
  label(slide, ctx, "LIVE-DEMO", 76, 72, 280, 26, { fontSize: 14, bold: true, color: C.amber });
  label(slide, ctx, "Zum Schluss: kurzer Demo-Run", 76, 112, 760, 56, {
    fontSize: 42,
    bold: true,
    color: C.white,
    typeface: ctx.fonts.title,
  });
  label(slide, ctx, "Ziel: in 3-4 Minuten zeigen, dass Container, API, Pipeline und Visualisierung zusammenarbeiten.", 78, 174, 800, 34, {
    fontSize: 19,
    color: "#D4E0EF",
  });

  demoStep(slide, ctx, 1, "Stack starten", "docker-compose up --build; Healthcheck im Browser prüfen.", 92, 268, C.red);
  demoStep(slide, ctx, 2, "App öffnen", "http://localhost:5173: Karte, Sidebar und Pipeline Panel zeigen.", 92, 372, C.teal);
  demoStep(slide, ctx, 3, "Pipeline ausführen", "Demand, Hubs, Assignment und Routing nacheinander starten.", 92, 476, C.amber);
  demoStep(slide, ctx, 4, "Ergebnis erklären", "Route anklicken, Hub-Kette zeigen, Dashboard-Kennzahlen nennen.", 92, 580, C.green);

  card(slide, ctx, 764, 282, 392, 240, { fill: "#243855", line: "#304761" });
  label(slide, ctx, "Fallback, falls Docker noch lädt", 792, 310, 330, 26, { fontSize: 20, bold: true, color: C.white });
  label(slide, ctx, "API-Doku und vorbereitete Ergebnisse zeigen; danach die UI-Interaktion an einem bestehenden Pipeline-Result demonstrieren.", 792, 354, 320, 72, { fontSize: 16, color: "#C6D5E8" });
  smallCode(slide, ctx, "http://localhost:5173\nhttp://localhost:8000/docs\nhttp://localhost:8000/api/health", 792, 446, 322, 92);

  label(slide, ctx, "Danke / Fragen", 784, 610, 320, 38, { fontSize: 26, bold: true, color: C.white, align: "center" });
  notes(slide, "Live-Demo: Erst zeigen, dass der Stack läuft. Dann App öffnen, Pipeline kurz starten oder vorhandene Ergebnisse zeigen, eine Route anklicken und im Dashboard Kosten/Zeit/CO₂ erklären. Bei Ladezeit Swagger und vorbereitete Ergebnisse als Fallback nutzen.");
  return slide;
}
