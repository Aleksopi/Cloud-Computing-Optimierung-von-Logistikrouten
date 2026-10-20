import { C, bg, title, footer, iconTile, label, notes } from "./theme.mjs";

export async function slide03(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "Tools", "Toolchain: von Karte bis Serverbetrieb", "Jedes Tool hat im System eine klar abgegrenzte Aufgabe.");

  await iconTile(slide, ctx, "MapPinned", "React + MapLibre GL", "Interaktive Karte, Layer-Toggles, Pipeline-Steuerung und Ergebnis-Dashboard.", 80, 190, 330, 126, C.teal);
  await iconTile(slide, ctx, "Server", "FastAPI", "REST-API, Swagger-Doku, Validierung, Pipeline-Orchestrierung und GeoJSON-Ausgabe.", 460, 190, 330, 126, C.blue);
  await iconTile(slide, ctx, "Workflow", "Celery + Redis", "Rechenintensive Schritte laufen asynchron im Worker statt die API zu blockieren.", 840, 190, 330, 126, C.red);
  await iconTile(slide, ctx, "Database", "PostgreSQL + PostGIS", "Persistente Speicherung von Apotheken, Hubs, Routen, Metriken und Einstellungen.", 80, 370, 330, 126, C.violet);
  await iconTile(slide, ctx, "Route", "OSRM", "Selbst gehostete Routing Engine für echte Straßendistanzen und Fahrzeiten in der Schweiz.", 460, 370, 330, 126, C.green);
  await iconTile(slide, ctx, "Container", "Docker Compose + Nginx", "Reproduzierbare Container, interne Service-Namen, Reverse Proxy im Produktionsbetrieb.", 840, 370, 330, 126, C.amber);

  label(slide, ctx, "Merksatz: Frontend zeigt, Backend steuert, Worker rechnet, PostGIS speichert, OSRM routet, Docker betreibt.", 98, 560, 1040, 36, {
    fontSize: 18,
    bold: true,
    color: C.ink2,
    align: "center",
  });
  footer(slide, ctx, 3);
  notes(slide, "Tools kurz erklären: React/MapLibre für die Visualisierung, FastAPI für die Schnittstellen, Celery/Redis für asynchrone Jobs, PostGIS für Geodaten, OSRM für Routing, Docker Compose und Nginx für Betrieb.");
  return slide;
}
