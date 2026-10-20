import { C, bg, title, footer, card, label, connector, notes } from "./theme.mjs";

function box(slide, ctx, x, y, w, h, head, body, color) {
  card(slide, ctx, x, y, w, h, { fill: C.white, line: color });
  ctx.addShape(slide, { x, y, w, h: 8, fill: color });
  label(slide, ctx, head, x + 18, y + 20, w - 36, 28, { fontSize: 20, bold: true, color });
  label(slide, ctx, body, x + 18, y + 58, w - 36, h - 70, { fontSize: 13.5, color: C.muted });
}

export async function slide04(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "Architektur", "Containerisierte Systemarchitektur", "Nginx trennt die öffentliche Kante von den internen Diensten.");

  box(slide, ctx, 510, 174, 260, 78, "Browser", "User nutzt Web-App und API-Doku", C.ink2);
  box(slide, ctx, 492, 292, 296, 84, "Nginx Reverse Proxy", "/api -> Backend / sonst Frontend", C.red);
  connector(slide, ctx, 640, 252, 640, 292, C.red);

  box(slide, ctx, 112, 428, 250, 96, "React Frontend", "MapLibre-Karte, Pipeline Panel, Dashboard", C.teal);
  box(slide, ctx, 514, 428, 250, 96, "FastAPI Backend", "REST-Endpunkte, Settings, Pipeline-Start", C.blue);
  box(slide, ctx, 916, 428, 250, 96, "Celery Worker", "Führt Demand, Placement, Assignment, Routing aus", C.amber);
  connector(slide, ctx, 520, 376, 237, 428, C.line);
  connector(slide, ctx, 640, 376, 640, 428, C.line);
  connector(slide, ctx, 758, 476, 916, 476, C.amber);

  box(slide, ctx, 258, 568, 220, 82, "PostgreSQL/PostGIS", "Persistenz und Geodaten", C.violet);
  box(slide, ctx, 530, 568, 220, 82, "Redis", "Broker und Queue", C.red);
  box(slide, ctx, 804, 568, 220, 82, "OSRM", "Distanzmatrix und Routen", C.green);
  connector(slide, ctx, 640, 524, 368, 568, C.violet);
  connector(slide, ctx, 640, 524, 640, 568, C.red);
  connector(slide, ctx, 640, 524, 914, 568, C.green);
  connector(slide, ctx, 1040, 524, 914, 568, C.green);

  footer(slide, ctx, 4);
  notes(slide, "Architektur: Öffentlich sichtbar ist nur Nginx. Das Frontend wird direkt ausgeliefert, API-Aufrufe gehen an FastAPI. Schwere Berechnungen laufen über Celery im Worker; PostGIS speichert, Redis vermittelt Jobs, OSRM liefert Straßenrouting.");
  return slide;
}
