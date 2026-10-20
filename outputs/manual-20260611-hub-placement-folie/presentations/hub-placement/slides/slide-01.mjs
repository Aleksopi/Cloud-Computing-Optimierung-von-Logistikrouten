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
  softGreen: "#ECFDF3",
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

async function methodCard(slide, ctx, item) {
  shadowCard(slide, ctx, item.x, item.y, item.w, item.h, item.fill);
  frame(slide, ctx, item.x, item.y, 7, item.h, item.color);
  frame(slide, ctx, item.x + 24, item.y + 23, 42, 42, item.color, "none", "ellipse");
  label(slide, ctx, String(item.n), item.x + 24, item.y + 26, 42, 34, {
    size: 18,
    bold: true,
    color: C.white,
    align: "center",
    valign: "middle",
    face: ctx.fonts.title,
  });
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + item.w - 54,
    y: item.y + 23,
    w: 30,
    h: 30,
    color: item.color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, item.title, item.x + 84, item.y + 22, item.w - 144, 28, {
    size: 19,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, item.body, item.x + 84, item.y + 56, item.w - 108, item.h - 64, {
    size: 13.2,
    color: C.muted,
  });
}

function formula(slide, ctx, text, x, y, w, h) {
  frame(slide, ctx, x, y, w, h, "#101826", "none", "roundRect");
  label(slide, ctx, text, x + 16, y + 10, w - 32, h - 14, {
    size: 15.5,
    bold: true,
    color: "#D7E2F1",
    face: ctx.fonts.mono,
    valign: "middle",
  });
}

function pharmacyPoints() {
  const file = path.resolve(process.cwd(), "backend/data/apotheken.geojson");
  const geo = JSON.parse(fs.readFileSync(file, "utf8"));
  return geo.features
    .filter((feature) => feature.geometry?.type === "Point")
    .map((feature) => ({
      lon: feature.geometry.coordinates[0],
      lat: feature.geometry.coordinates[1],
    }));
}

function project({ lon, lat }, bounds, box) {
  return {
    x: box.x + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * box.w,
    y: box.y + ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * box.h,
  };
}

function connector(slide, ctx, a, b, color, width = 2) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const line = frame(slide, ctx, a.x, a.y, len, width, color);
  line.rotation = angle;
}

function drawHubMap(slide, ctx, x, y, w, h) {
  const points = pharmacyPoints();
  const bounds = { minLon: 5.96, maxLon: 10.12, minLat: 45.72, maxLat: 47.86 };
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Zielbild des Hub Placement", x + 26, y + 20, 280, 24, {
    size: 18,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "schematisch auf echten Apothekenpunkten", x + 26, y + 44, 250, 16, {
    size: 11.5,
    color: C.muted,
  });

  const box = { x: x + 34, y: y + 70, w: w - 68, h: h - 124 };
  frame(slide, ctx, box.x, box.y, box.w, box.h, C.mapFill, "#DDE7F0", "roundRect");

  for (const p of points) {
    const q = project(p, bounds, box);
    frame(slide, ctx, q.x - 1.5, q.y - 1.5, 3, 3, "#9AB6D2", "none", "ellipse");
  }

  const hq = project({ lon: 7.4474, lat: 46.948 }, bounds, box);
  const vz = [
    project({ lon: 6.14, lat: 46.2 }, bounds, box),
    project({ lon: 7.59, lat: 47.56 }, bounds, box),
    project({ lon: 8.54, lat: 47.38 }, bounds, box),
    project({ lon: 9.37, lat: 47.43 }, bounds, box),
  ];
  const mvz = [
    project({ lon: 6.63, lat: 46.52 }, bounds, box),
    project({ lon: 8.31, lat: 47.05 }, bounds, box),
    project({ lon: 8.95, lat: 46.02 }, bounds, box),
    project({ lon: 7.79, lat: 47.21 }, bounds, box),
    project({ lon: 8.72, lat: 47.25 }, bounds, box),
    project({ lon: 9.52, lat: 46.85 }, bounds, box),
  ];

  vz.forEach((p) => {
    frame(slide, ctx, p.x - 38, p.y - 38, 76, 76, "#EAF3FA66", "#C9DBEC", "ellipse");
  });
  mvz.forEach((p) => {
    frame(slide, ctx, p.x - 18, p.y - 18, 36, 36, "#ECFBF866", "#B9E7DF", "ellipse");
  });

  frame(slide, ctx, hq.x - 11, hq.y - 11, 22, 22, C.amber, "#FFFFFF", "ellipse");
  label(slide, ctx, "HQ", hq.x - 12, hq.y - 7, 24, 14, {
    size: 10,
    bold: true,
    color: C.white,
    align: "center",
  });
  vz.forEach((p, i) => {
    frame(slide, ctx, p.x - 9, p.y - 9, 18, 18, C.blue, "#FFFFFF", "roundRect");
    label(slide, ctx, String(i + 1), p.x - 8, p.y - 7, 16, 12, {
      size: 9,
      bold: true,
      color: C.white,
      align: "center",
    });
  });
  mvz.forEach((p) => {
    frame(slide, ctx, p.x - 5, p.y - 5, 10, 10, C.teal, "#FFFFFF", "ellipse");
  });

  const ly = y + h - 42;
  frame(slide, ctx, x + 34, ly, 14, 14, "#9AB6D2", "none", "ellipse");
  label(slide, ctx, "Apotheke", x + 54, ly - 1, 70, 18, { size: 11.5, color: C.muted });
  frame(slide, ctx, x + 144, ly, 14, 14, C.amber, "none", "ellipse");
  label(slide, ctx, "HQ Bern", x + 164, ly - 1, 72, 18, { size: 11.5, color: C.muted });
  frame(slide, ctx, x + 254, ly, 14, 14, C.blue, "none", "roundRect");
  label(slide, ctx, "VZ", x + 274, ly - 1, 40, 18, { size: 11.5, color: C.muted });
  frame(slide, ctx, x + 330, ly + 2, 10, 10, C.teal, "none", "ellipse");
  label(slide, ctx, "mVZ", x + 348, ly - 1, 48, 18, { size: 11.5, color: C.muted });
}

function drawConstraints(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.soft);
  label(slide, ctx, "Nebenbedingungen", x + 22, y + 16, w - 44, 22, {
    size: 18,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  const items = [
    ["VZ", "4-6 Standorte, mind. 40 km Abstand"],
    ["mVZ", "bedarfsabhängig, mind. 18 km Abstand"],
    ["Kapazität", "VZ 600, mVZ 125 Einheiten"],
    ["Auslastung", "Hubs unter 10 % werden entfernt"],
  ];
  items.forEach(([head, body], i) => {
    const yy = y + 52 + i * 29;
    frame(slide, ctx, x + 22, yy + 4, 7, 7, i < 2 ? C.teal : C.amber, "none", "ellipse");
    label(slide, ctx, head, x + 42, yy, 80, 18, {
      size: 12.5,
      bold: true,
      color: C.ink,
    });
    label(slide, ctx, body, x + 116, yy, w - 134, 18, {
      size: 12.5,
      color: C.muted,
    });
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);
  frame(slide, ctx, 68, 76, 16, 16, C.blue);
  label(slide, ctx, "HUB PLACEMENT", 94, 73, 250, 24, {
    size: 13,
    bold: true,
    color: C.blue,
  });

  label(slide, ctx, "Verteilzentren dort platzieren, wo Bedarf Wege spart", 68, 116, 900, 46, {
    size: 34,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Aus Apothekenstandorten und demand-Werten entsteht ein mehrstufiges Netz aus HQ, regionalen VZ und lokalen mVZ. Greedy-p-Median minimiert die gewichtete Entfernung zu den Apotheken.",
    68,
    178,
    900,
    48,
    { size: 18, color: C.ink2 },
  );

  const cards = [
    {
      n: 1,
      x: 68,
      y: 252,
      w: 344,
      h: 110,
      color: C.teal,
      fill: C.softTeal,
      icon: "Scale",
      title: "Gewichten",
      body: "Jede Apotheke zählt proportional zu ihrem Bedarf: demand / Durchschnitt.",
    },
    {
      n: 2,
      x: 68,
      y: 386,
      w: 344,
      h: 110,
      color: C.blue,
      fill: C.softBlue,
      icon: "MapPinned",
      title: "Greedy wählen",
      body: "Der nächste Hub ist der Kandidat mit dem größten gewichteten Distanzgewinn.",
    },
    {
      n: 3,
      x: 68,
      y: 520,
      w: 344,
      h: 88,
      color: C.amber,
      fill: C.softAmber,
      icon: "Warehouse",
      title: "Bereinigen",
      body: "Kapazität und Mindestauslastung entscheiden, welche Hubs bleiben.",
    },
  ];
  for (const card of cards) {
    await methodCard(slide, ctx, card);
  }

  formula(slide, ctx, "score = gewichteter Distanzgewinn - Lagerkosten-Penalty", 454, 252, 372, 56);
  formula(slide, ctx, "HQ-Kapazität = 1,30 × Gesamtbedarf", 454, 328, 372, 52);
  drawConstraints(slide, ctx, 454, 402, 372, 206);
  drawHubMap(slide, ctx, 866, 252, 346, 356);

  frame(slide, ctx, 68, 642, 1104, 1, "#D7DEE8");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 650, 360, 18, {
    size: 10,
    color: C.muted,
  });
  label(slide, ctx, "04", 1136, 650, 36, 18, {
    size: 10,
    color: C.muted,
    align: "right",
  });

  slide.speakerNotes.setText(
    "Diese Folie erklärt Hub Placement. Nach der Bedarfsermittlung werden Apotheken nach demand gewichtet. Der Greedy-p-Median wählt iterativ den Standort, der die gewichtete Entfernung zu den Apotheken am stärksten reduziert. Zusätzlich gibt es reale Nebenbedingungen: VZ sind auf 4 bis 6 begrenzt, müssen voneinander Abstand halten und Kapazität besitzen; mVZ werden bedarfsabhängig als lokale Hubs platziert. Hubs mit weniger als 10 Prozent Auslastung werden entfernt und die Apotheken neu zugeordnet.",
  );
  return slide;
}
