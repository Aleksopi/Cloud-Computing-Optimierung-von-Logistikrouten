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
    x, y, w, h, geometry, fill,
    line: line === "none" ? ctx.line("#00000000", 0) : ctx.line(line, 1),
  });
}

function label(slide, ctx, text, x, y, w, h, opts = {}) {
  return ctx.addText(slide, {
    text, x, y, w, h,
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

async function stepCard(slide, ctx, item) {
  shadowCard(slide, ctx, item.x, item.y, item.w, item.h, item.fill);
  frame(slide, ctx, item.x, item.y, 7, item.h, item.color);
  frame(slide, ctx, item.x + 24, item.y + 23, 42, 42, item.color, "none", "ellipse");
  label(slide, ctx, String(item.n), item.x + 24, item.y + 26, 42, 34, {
    size: 18, bold: true, color: C.white, align: "center", valign: "middle", face: ctx.fonts.title,
  });
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + item.w - 54,
    y: item.y + 24,
    w: 28,
    h: 28,
    color: item.color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, item.title, item.x + 84, item.y + 22, item.w - 144, 28, {
    size: 19, bold: true, color: C.ink, face: ctx.fonts.title,
  });
  label(slide, ctx, item.body, item.x + 84, item.y + 56, item.w - 110, item.h - 64, {
    size: 13.2, color: C.muted,
  });
}

function formula(slide, ctx, text, x, y, w, h) {
  frame(slide, ctx, x, y, w, h, "#101826", "none", "roundRect");
  label(slide, ctx, text, x + 16, y + 10, w - 32, h - 14, {
    size: 15.5, bold: true, color: "#D7E2F1", face: ctx.fonts.mono, valign: "middle",
  });
}

function pharmacyPoints() {
  const file = path.resolve(process.cwd(), "backend/data/apotheken.geojson");
  const geo = JSON.parse(fs.readFileSync(file, "utf8"));
  return geo.features
    .filter((feature) => feature.geometry?.type === "Point")
    .map((feature) => ({ lon: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] }));
}

function project({ lon, lat }, bounds, box) {
  return {
    x: box.x + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * box.w,
    y: box.y + ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * box.h,
  };
}

function line(slide, ctx, a, b, color, width = 2) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const l = frame(slide, ctx, a.x, a.y, len, width, color);
  l.rotation = angle;
}

function drawMatrix(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "OSRM-Zeitmatrix", x + 22, y + 14, 220, 22, {
    size: 18, bold: true, color: C.ink, face: ctx.fonts.title,
  });
  label(slide, ctx, "400 × alle Hubs", x + 220, y + 18, 140, 16, {
    size: 11.5, color: C.muted, align: "right",
  });

  const gx = x + 64;
  const gy = y + 48;
  const cell = 14;
  const values = [
    [0.22, 0.50, 0.35, 0.74, 0.42],
    [0.44, 0.31, 0.64, 0.28, 0.69],
    [0.63, 0.45, 0.18, 0.54, 0.37],
    [0.29, 0.73, 0.51, 0.40, 0.26],
    [0.58, 0.34, 0.49, 0.22, 0.62],
  ];
  label(slide, ctx, "Apotheken", x + 22, y + 68, 28, 60, {
    size: 10, color: C.muted,
  });
  label(slide, ctx, "Hubs", gx + 34, y + 34, 80, 12, {
    size: 10, color: C.muted, align: "center",
  });
  values.forEach((row, r) => {
    row.forEach((v, c) => {
      const fill = v < 0.30 ? C.teal : v < 0.45 ? "#8FD8D0" : v < 0.60 ? "#D8E9F4" : "#EEF2F7";
      frame(slide, ctx, gx + c * (cell + 6), gy + r * (cell + 6), cell, cell, fill, "#FFFFFF", "roundRect");
    });
  });
  frame(slide, ctx, gx - 5, gy - 5, 5 * (cell + 6) + 4, 5 * (cell + 6) + 4, "#00000000", "#CBD5E1", "roundRect");
  label(slide, ctx, "Ein Request ersetzt viele Einzelabfragen.", x + 178, y + 78, 174, 32, {
    size: 12.5, color: C.muted,
  });
}

function drawAssignmentMap(slide, ctx, x, y, w, h) {
  const points = pharmacyPoints();
  const bounds = { minLon: 5.96, maxLon: 10.12, minLat: 45.72, maxLat: 47.86 };
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Hub-Zuordnung", x + 24, y + 18, w - 48, 24, {
    size: 18, bold: true, color: C.ink, face: ctx.fonts.title,
  });
  label(slide, ctx, "Linie = echte OSRM-Route", x + 24, y + 43, w - 48, 18, {
    size: 11.5, color: C.muted,
  });

  const box = { x: x + 30, y: y + 70, w: w - 60, h: h - 122 };
  frame(slide, ctx, box.x, box.y, box.w, box.h, C.mapFill, "#DDE7F0", "roundRect");

  for (const p of points) {
    const q = project(p, bounds, box);
    frame(slide, ctx, q.x - 1.25, q.y - 1.25, 2.5, 2.5, "#A6BBD2", "none", "ellipse");
  }

  const hubs = [
    { name: "HQ", lon: 7.4474, lat: 46.948, color: C.amber },
    { name: "VZ", lon: 8.54, lat: 47.38, color: C.blue },
    { name: "VZ", lon: 6.14, lat: 46.20, color: C.blue },
    { name: "mVZ", lon: 7.79, lat: 47.21, color: C.teal },
    { name: "mVZ", lon: 8.95, lat: 46.02, color: C.teal },
  ].map((h) => ({ ...h, p: project(h, bounds, box) }));

  const sampleTargets = [
    { lon: 8.72, lat: 47.25, hub: 1 },
    { lon: 8.31, lat: 47.05, hub: 3 },
    { lon: 6.63, lat: 46.52, hub: 2 },
    { lon: 9.52, lat: 46.85, hub: 4 },
    { lon: 7.52, lat: 46.98, hub: 0 },
    { lon: 8.95, lat: 47.43, hub: 1 },
  ];
  sampleTargets.forEach((t) => {
    const q = project(t, bounds, box);
    line(slide, ctx, hubs[t.hub].p, q, t.hub === 0 ? "#E9B96F" : t.hub > 2 ? "#7BCFC6" : "#8CB6DB", 2);
    frame(slide, ctx, q.x - 4, q.y - 4, 8, 8, "#FFFFFF", hubs[t.hub].color, "ellipse");
  });

  hubs.forEach((hub) => {
    frame(slide, ctx, hub.p.x - 9, hub.p.y - 9, 18, 18, hub.color, "#FFFFFF", hub.name === "VZ" ? "roundRect" : "ellipse");
    label(slide, ctx, hub.name === "HQ" ? "H" : "", hub.p.x - 8, hub.p.y - 6, 16, 12, {
      size: 9, bold: true, color: C.white, align: "center",
    });
  });

  const ly = y + h - 38;
  frame(slide, ctx, x + 30, ly, 12, 12, C.amber, "none", "ellipse");
  label(slide, ctx, "HQ direkt ≤20 km", x + 48, ly - 2, 106, 16, { size: 11.5, color: C.muted });
  frame(slide, ctx, x + 174, ly, 12, 12, C.blue, "none", "roundRect");
  label(slide, ctx, "VZ", x + 192, ly - 2, 38, 16, { size: 11.5, color: C.muted });
  frame(slide, ctx, x + 240, ly + 1, 10, 10, C.teal, "none", "ellipse");
  label(slide, ctx, "mVZ", x + 257, ly - 2, 44, 16, { size: 11.5, color: C.muted });
}

function drawRules(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.soft);
  label(slide, ctx, "Zuweisungsregeln", x + 22, y + 16, w - 44, 24, {
    size: 18, bold: true, color: C.ink, face: ctx.fonts.title,
  });
  const rules = [
    ["Sortierung", "Apotheken mit kürzester bester Fahrzeit zuerst"],
    ["Kapazität", "nächster Hub mit freier Lagerkapazität"],
    ["HQ-Sperre", "HQ nur innerhalb 20 km Straßendistanz"],
    ["Geometrie", "Route wird gespeichert"],
  ];
  rules.forEach(([head, body], i) => {
    const yy = y + 48 + i * 22;
    frame(slide, ctx, x + 22, yy + 5, 7, 7, i === 2 ? C.amber : C.teal, "none", "ellipse");
    label(slide, ctx, head, x + 42, yy, 82, 18, { size: 12.5, bold: true, color: C.ink });
    label(slide, ctx, body, x + 126, yy, w - 146, 18, { size: 11.2, color: C.muted });
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);
  frame(slide, ctx, 68, 76, 16, 16, C.teal);
  label(slide, ctx, "EINZUGSGEBIETE", 94, 73, 250, 24, {
    size: 13, bold: true, color: C.teal,
  });

  label(slide, ctx, "Jede Apotheke dem besten erreichbaren Hub zuordnen", 68, 116, 940, 46, {
    size: 34, bold: true, color: C.ink, face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Nach dem Hub Placement wird entschieden, welcher Hub welche Apotheke beliefert. Grundlage sind echte OSRM-Straßenfahrzeiten, nicht Luftlinien.",
    68,
    178,
    900,
    48,
    { size: 18, color: C.ink2 },
  );

  const cards = [
    {
      n: 1, x: 68, y: 252, w: 344, h: 102, color: C.blue, fill: C.softBlue,
      icon: "Table2", title: "Matrix berechnen",
      body: "OSRM liefert Distanz und Fahrzeit von jeder Apotheke zu jedem Hub.",
    },
    {
      n: 2, x: 68, y: 376, w: 344, h: 102, color: C.amber, fill: C.softAmber,
      icon: "CircleOff", title: "HQ begrenzen",
      body: "Direktlieferung vom HQ nur bis 20 km Straßendistanz.",
    },
    {
      n: 3, x: 68, y: 500, w: 344, h: 108, color: C.teal, fill: C.softTeal,
      icon: "GitBranch", title: "Zuordnen",
      body: "Jede Apotheke geht zum schnellsten Hub mit verbleibender Kapazität.",
    },
  ];
  for (const card of cards) {
    await stepCard(slide, ctx, card);
  }

  formula(slide, ctx, "choice = min(Fahrzeit), wenn load + demand ≤ capacity", 454, 252, 378, 56);
  drawMatrix(slide, ctx, 454, 328, 378, 126);
  drawRules(slide, ctx, 454, 476, 378, 132);
  drawAssignmentMap(slide, ctx, 872, 252, 340, 356);

  frame(slide, ctx, 68, 642, 1104, 1, "#D7DEE8");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 650, 360, 18, {
    size: 10, color: C.muted,
  });
  label(slide, ctx, "05", 1136, 650, 36, 18, {
    size: 10, color: C.muted, align: "right",
  });

  slide.speakerNotes.setText(
    "Diese Folie erklärt Step 3, die Einzugsgebiete. Nach dem Hub Placement wird für jede Apotheke entschieden, welcher Hub sie beliefert. Dafür ruft das System einmal die OSRM-Table-Matrix ab: alle Apotheken gegen alle Hubs, mit Straßendistanz und Fahrzeit. Das HQ darf nur Apotheken innerhalb von 20 Kilometern Straßendistanz direkt beliefern. Dann werden Apotheken nach bester Fahrzeit sortiert und jeweils dem schnellsten Hub mit freier Kapazität zugewiesen. Anschließend werden die echten OSRM-Routengeometrien gespeichert, damit die Hub-Apotheke-Linien auf der Karte nachvollziehbar sind.",
  );
  return slide;
}
