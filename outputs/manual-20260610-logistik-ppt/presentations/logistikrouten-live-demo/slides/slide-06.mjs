import { C, bg, title, footer, card, label, connector, notes } from "./theme.mjs";

function step(slide, ctx, n, head, body, x, color) {
  card(slide, ctx, x, 254, 246, 184, { fill: C.white, line: color });
  ctx.addShape(slide, { x: x + 20, y: 220, w: 54, h: 54, geometry: "ellipse", fill: color });
  label(slide, ctx, String(n), x + 20, 231, 54, 30, { fontSize: 24, bold: true, color: C.white, align: "center" });
  label(slide, ctx, head, x + 22, 284, 200, 34, { fontSize: 21, bold: true, color });
  label(slide, ctx, body, x + 22, 328, 200, 76, { fontSize: 14.5, color: C.muted });
}

export async function slide06(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "Pipeline", "Vier Schritte vom Rohdatensatz zur Route", "Die Reihenfolge ist fachlich wichtig: Nachfrage zuerst, dann Netzwerk, dann Tour.");

  step(slide, ctx, 1, "Warenbedarf", "Catchment-Modell auf Basis von Eurostat-Bevölkerungszellen.", 72, C.teal);
  step(slide, ctx, 2, "Hub Placement", "Nachfragegewichteter p-Median platziert HQ, VZ und mVZ.", 364, C.blue);
  step(slide, ctx, 3, "Einzugsgebiete", "Apotheken werden kapazitätsbewusst Hubs zugeordnet.", 656, C.violet);
  step(slide, ctx, 4, "Routen", "Mehrziel-VRP konstruiert Fahrzeugtouren mit Restriktionen.", 948, C.red);
  connector(slide, ctx, 318, 346, 364, 346, C.line);
  connector(slide, ctx, 610, 346, 656, 346, C.line);
  connector(slide, ctx, 902, 346, 948, 346, C.line);

  card(slide, ctx, 168, 512, 944, 82, { fill: C.paleAmber, line: "#F3D48D" });
  label(slide, ctx, "Asynchroner Ablauf", 202, 532, 230, 26, { fontSize: 20, bold: true, color: "#8A5A00" });
  label(slide, ctx, "FastAPI startet Pipeline-Jobs; Celery Worker berechnen sie im Hintergrund. Die UI fragt Status und Ergebnisse über REST-Endpunkte ab.", 430, 531, 640, 38, { fontSize: 17, color: C.ink });

  footer(slide, ctx, 6);
  notes(slide, "Pipeline: Schritt eins berechnet Nachfrage, Schritt zwei platziert Hubs, Schritt drei ordnet Apotheken den Hubs zu, Schritt vier optimiert die Touren. Alles läuft asynchron, damit die Web-App reaktionsfähig bleibt.");
  return slide;
}
