import { C, bg, title, footer, card, label, pill, bulletList, smallCode, notes } from "./theme.mjs";

export async function slide05(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "Docker & Server", "Vom lokalen Dev-Setup zum Ubuntu-Server", "Docker Compose beschreibt die komplette Umgebung als Infrastruktur-Code.");

  card(slide, ctx, 78, 190, 500, 310, { fill: C.white });
  pill(slide, ctx, "Development", 108, 218, 130, C.teal, C.paleTeal);
  label(slide, ctx, "docker-compose.yml", 108, 266, 390, 32, { fontSize: 26, bold: true, color: C.ink });
  bulletList(
    slide,
    ctx,
    [
      "Ports offen: 5173, 8000, 5001, 5433",
      "Bind-Mounts für Live-Reload im Backend und Frontend",
      "Postgres Healthcheck vor Backend-/Worker-Start",
      "Apple Silicon: OSRM/PostGIS via linux/amd64",
    ],
    112,
    324,
    410,
    { fontSize: 15.5, gap: 40, dot: C.teal },
  );

  card(slide, ctx, 700, 190, 500, 310, { fill: C.white });
  pill(slide, ctx, "Production", 730, 218, 126, C.red, C.paleRed);
  label(slide, ctx, "docker-compose.prod.yml", 730, 266, 410, 32, { fontSize: 26, bold: true, color: C.ink });
  bulletList(
    slide,
    ctx,
    [
      "Nginx auf 10.0.0.1:80 als einziger Einstieg",
      "Backend/Redis/OSRM ohne öffentliche Ports",
      "restart: always und uvicorn mit 2 Workern",
      "Serverpfad: /opt/pharma-logistics/",
    ],
    734,
    324,
    410,
    { fontSize: 15.5, gap: 40, dot: C.red },
  );

  smallCode(slide, ctx, "docker-compose up --build\n\ndocker-compose -f docker-compose.yml \\\n  -f docker-compose.prod.yml up -d", 166, 536, 948, 100);
  footer(slide, ctx, 5);
  notes(slide, "Docker/Server: In Entwicklung sind Ports und Bind-Mounts bewusst offen. In Produktion übernimmt Nginx die öffentliche Kante, interne Dienste bleiben im Docker-Netz. Compose macht das Setup reproduzierbar.");
  return slide;
}
