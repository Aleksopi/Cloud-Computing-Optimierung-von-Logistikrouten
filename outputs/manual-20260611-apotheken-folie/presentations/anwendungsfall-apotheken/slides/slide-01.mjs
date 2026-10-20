import fs from "node:fs";
import path from "node:path";

const C = {
  ink: "#1E293B",
  ink2: "#334155",
  muted: "#64748B",
  blue: "#0F4C81",
  teal: "#0D9488",
  amber: "#D97706",
  green: "#16A34A",
  violet: "#6D28D9",
  white: "#FFFFFF",
  paper: "#FFFFFF",
  soft: "#F4F8FB",
  softBlue: "#EAF3FA",
  softTeal: "#ECFBF8",
  softAmber: "#FFF7E8",
  line: "#E2E8F0",
  mapFill: "#F7FAFC",
};

function frame(slide, ctx, x, y, w, h, fill, line = "none", geometry = "rect") {
  return ctx.addShape(slide, {
    x,
    y,
    w,
    h,
    geometry,
    fill,
    line: line === "none" ? ctx.line("#00000000", 0) : ctx.line(line, 1),
  });
}

function label(slide, ctx, text, x, y, w, h, opts = {}) {
  return ctx.addText(slide, {
    text,
    x,
    y,
    w,
    h,
    fontSize: opts.size ?? 16,
    bold: opts.bold ?? false,
    color: opts.color ?? C.ink,
    align: opts.align ?? "left",
    valign: opts.valign ?? "top",
    typeface: opts.face ?? ctx.fonts.body,
    insets: opts.insets ?? { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

function shadowCard(slide, ctx, x, y, w, h, fill = C.white, line = C.line) {
  frame(slide, ctx, x + 4, y + 6, w, h, "#D6DEE8", "none", "roundRect");
  frame(slide, ctx, x, y, w, h, fill, line, "roundRect");
}

async function insightCard(slide, ctx, { x, y, w, h, color, icon, title, body, fill }) {
  shadowCard(slide, ctx, x, y, w, h, fill);
  frame(slide, ctx, x, y, 7, h, color);
  frame(slide, ctx, x + 24, y + 26, 42, 42, color, "none", "ellipse");
  await ctx.addLucideIcon(slide, {
    icon,
    x: x + 34,
    y: y + 36,
    w: 22,
    h: 22,
    color: C.white,
    strokeWidth: 2.3,
  });
  label(slide, ctx, title, x + 84, y + 25, w - 110, 28, {
    size: 18,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, body, x + 84, y + 58, w - 112, h - 66, {
    size: 13.5,
    color: C.muted,
  });
}

function pharmacyData() {
  const file = path.resolve(process.cwd(), "backend/data/apotheken.geojson");
  const geo = JSON.parse(fs.readFileSync(file, "utf8"));
  return geo.features
    .filter((feature) => feature.geometry?.type === "Point")
    .map((feature) => ({
      lon: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
      name: feature.properties?.name || "Apotheke",
    }));
}

function project({ lon, lat }, bounds, box) {
  const x = box.x + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * box.w;
  const y = box.y + ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * box.h;
  return { x, y };
}

function drawMap(slide, ctx, points, box) {
  const bounds = {
    minLon: 5.96,
    maxLon: 10.12,
    minLat: 45.72,
    maxLat: 47.86,
  };

  shadowCard(slide, ctx, box.x, box.y, box.w, box.h, C.white);
  frame(slide, ctx, box.x + 22, box.y + 56, box.w - 44, box.h - 88, C.mapFill, "#DDE7F0", "roundRect");

  const map = { x: box.x + 54, y: box.y + 86, w: box.w - 108, h: box.h - 144 };
  label(slide, ctx, "Reale Standortverteilung", box.x + 32, box.y + 24, 300, 24, {
    size: 18,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "400 OSM-Apotheken", box.x + 336, box.y + 27, 210, 20, {
    size: 12.5,
    color: C.muted,
    align: "right",
  });

  const cities = [
    { name: "Basel", lon: 7.59, lat: 47.56 },
    { name: "Zürich", lon: 8.54, lat: 47.38 },
    { name: "Bern", lon: 7.45, lat: 46.95 },
    { name: "Genf", lon: 6.14, lat: 46.20 },
    { name: "Tessin", lon: 8.95, lat: 46.02 },
  ];

  for (const city of cities) {
    const p = project(city, bounds, map);
    frame(slide, ctx, p.x - 2, p.y - 2, 4, 4, "#94A3B8", "none", "ellipse");
    label(slide, ctx, city.name, p.x + 7, p.y - 7, 70, 14, {
      size: 10.5,
      color: "#7A8798",
    });
  }

  for (const point of points) {
    const p = project(point, bounds, map);
    frame(slide, ctx, p.x - 1.9, p.y - 1.9, 3.8, 3.8, C.blue, "none", "ellipse");
  }

  const bern = project({ lon: 7.4474, lat: 46.948 }, bounds, map);
  frame(slide, ctx, bern.x - 10, bern.y - 10, 20, 20, "#FFFFFF", C.amber, "ellipse");
  frame(slide, ctx, bern.x - 5, bern.y - 5, 10, 10, C.amber, "none", "ellipse");
  label(slide, ctx, "HQ Bern", bern.x + 14, bern.y - 5, 80, 18, {
    size: 12.5,
    bold: true,
    color: C.amber,
  });

  frame(slide, ctx, box.x + 32, box.y + box.h - 58, 18, 18, C.blue, "none", "ellipse");
  label(slide, ctx, "Apothekenstandort", box.x + 58, box.y + box.h - 59, 160, 20, {
    size: 12.5,
    color: C.muted,
  });
  frame(slide, ctx, box.x + 250, box.y + box.h - 58, 18, 18, C.amber, "none", "ellipse");
  label(slide, ctx, "Hauptsitz Bern", box.x + 276, box.y + box.h - 59, 160, 20, {
    size: 12.5,
    color: C.muted,
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  const pharmacies = pharmacyData();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);
  frame(slide, ctx, 68, 78, 16, 16, C.blue);
  label(slide, ctx, "ANWENDUNGSFALL", 94, 75, 250, 24, {
    size: 13,
    bold: true,
    color: C.blue,
  });

  label(slide, ctx, "Pharma-Distribution beginnt bei 400 Apotheken", 68, 118, 780, 44, {
    size: 34,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Ein Distributionsunternehmen mit Hauptsitz in Bern beliefert reale Apothekenstandorte in der ganzen Schweiz. Bevor Hubs und Fahrzeuge optimiert werden, definiert diese Standortbasis das Versorgungsproblem.",
    68,
    190,
    612,
    64,
    {
      size: 18,
      color: C.ink2,
    },
  );

  shadowCard(slide, ctx, 68, 294, 286, 184, C.softBlue);
  label(slide, ctx, "400", 94, 316, 230, 72, {
    size: 62,
    bold: true,
    color: C.blue,
    align: "center",
    face: ctx.fonts.title,
  });
  label(slide, ctx, "reale Apotheken", 104, 394, 210, 26, {
    size: 20,
    bold: true,
    color: C.ink,
    align: "center",
  });
  label(slide, ctx, "OpenStreetMap-Standorte als Stopps der späteren Optimierung", 102, 428, 218, 36, {
    size: 13,
    color: C.muted,
    align: "center",
  });

  await insightCard(slide, ctx, {
    x: 68,
    y: 510,
    w: 286,
    h: 104,
    color: C.teal,
    icon: "MapPin",
    title: "Verteilung",
    body: "Stadt und Land in einem gemeinsamen Straßennetz.",
    fill: C.softTeal,
  });

  await insightCard(slide, ctx, {
    x: 384,
    y: 510,
    w: 286,
    h: 104,
    color: C.amber,
    icon: "UsersRound",
    title: "Bedarf",
    body: "Nachfrage wird je Apotheke aus dem Umfeld abgeleitet.",
    fill: C.softAmber,
  });

  drawMap(slide, ctx, pharmacies, { x: 716, y: 206, w: 476, h: 398 });

  frame(slide, ctx, 384, 294, 286, 184, C.soft, C.line, "roundRect");
  await ctx.addLucideIcon(slide, {
    icon: "Cross",
    x: 497,
    y: 326,
    w: 54,
    h: 54,
    color: C.green,
    strokeWidth: 2.2,
  });
  label(slide, ctx, "Apotheken als Stopps", 410, 398, 232, 28, {
    size: 19,
    bold: true,
    color: C.ink,
    align: "center",
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Jeder Standort wird später einem Gebiet, Hub und einer Route zugeordnet.", 413, 432, 228, 38, {
    size: 13,
    color: C.muted,
    align: "center",
  });

  frame(slide, ctx, 68, 642, 1104, 1, "#D7DEE8");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 650, 360, 18, {
    size: 10,
    color: C.muted,
  });
  label(slide, ctx, "02", 1136, 650, 36, 18, {
    size: 10,
    color: C.muted,
    align: "right",
  });

  slide.speakerNotes.setText(
    "Diese Folie fokussiert den Anwendungsfall auf die Apotheken: 400 reale OpenStreetMap-Standorte bilden die Stopps im späteren Logistikproblem. Der Hauptsitz liegt in Bern, versorgt wird die ganze Schweiz. Wichtig ist: Die Optimierung startet mit echten Lieferzielen und deren räumlicher Verteilung; Hubs, Pipeline und Fahrzeugtypen kommen erst danach.",
  );
  return slide;
}
