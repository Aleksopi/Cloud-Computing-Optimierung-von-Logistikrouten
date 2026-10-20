const C = {
  ink: "#1E293B",
  ink2: "#334155",
  muted: "#64748B",
  blue: "#0F4C81",
  teal: "#0D9488",
  amber: "#D97706",
  green: "#16A34A",
  violet: "#6D28D9",
  red: "#DC2626",
  white: "#FFFFFF",
  paper: "#FFFFFF",
  soft: "#F4F8FB",
  softBlue: "#EAF3FA",
  softTeal: "#ECFBF8",
  softAmber: "#FFF7E8",
  softViolet: "#F3ECFF",
  line: "#E2E8F0",
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

function line(slide, ctx, a, b, color = "#94A3B8", width = 2) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const shape = frame(slide, ctx, a.x, a.y, len, width, color, "none", "roundRect");
  shape.rotation = angle;
}

async function arrow(slide, ctx, x, y, color = "#7A8CA3") {
  await ctx.addLucideIcon(slide, {
    icon: "ArrowRight",
    x,
    y,
    w: 28,
    h: 28,
    color,
    strokeWidth: 2.2,
  });
}

async function miniStep(slide, ctx, item) {
  shadowCard(slide, ctx, item.x, item.y, item.w, item.h, item.fill, item.border ?? C.line);
  frame(slide, ctx, item.x, item.y, 7, item.h, item.color);
  frame(slide, ctx, item.x + 18, item.y + 18, 34, 34, item.color, "none", "ellipse");
  label(slide, ctx, String(item.n), item.x + 18, item.y + 21, 34, 27, {
    size: 14,
    bold: true,
    color: C.white,
    align: "center",
    valign: "middle",
    face: ctx.fonts.title,
  });
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + item.w - 44,
    y: item.y + 21,
    w: 22,
    h: 22,
    color: item.color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, item.title, item.x + 62, item.y + 16, item.w - 112, 20, {
    size: 14.4,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, item.body, item.x + 62, item.y + 41, item.w - 86, item.h - 46, {
    size: 10.7,
    color: C.muted,
  });
}

function drawMatrix(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "OSRM /table pro Depot", x + 18, y + 14, w - 36, 20, {
    size: 16,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "annotations = distance,duration", x + 18, y + 38, w - 36, 14, {
    size: 10.5,
    bold: true,
    color: C.violet,
  });

  const gx = x + 58;
  const gy = y + 72;
  const cell = 20;
  const values = [
    [0.05, 0.34, 0.62, 0.47, 0.78],
    [0.31, 0.04, 0.44, 0.70, 0.58],
    [0.65, 0.39, 0.05, 0.28, 0.43],
    [0.52, 0.73, 0.25, 0.05, 0.35],
    [0.82, 0.55, 0.41, 0.32, 0.05],
  ];
  label(slide, ctx, "Depot + Stopps", x + 18, y + 58, 108, 12, { size: 9.4, color: C.muted });
  values.forEach((row, r) => {
    row.forEach((v, c) => {
      const fill = v < 0.12 ? "#D9F7EF" : v < 0.35 ? "#72D0C3" : v < 0.55 ? "#CFE5F5" : v < 0.70 ? "#F5D5A3" : "#FBE8E8";
      frame(slide, ctx, gx + c * (cell + 7), gy + r * (cell + 7), cell, cell, fill, "#FFFFFF", "roundRect");
    });
  });
  frame(slide, ctx, gx - 6, gy - 6, 5 * (cell + 7) + 5, 5 * (cell + 7) + 5, "#00000000", "#CBD5E1", "roundRect");
  label(slide, ctx, "Distanzmatrix", x + 204, y + 74, 112, 16, { size: 10.4, bold: true, color: C.ink });
  label(slide, ctx, "km fuer Kosten,\nReichweite und CO2", x + 204, y + 96, 122, 36, { size: 10.1, color: C.muted });
  frame(slide, ctx, x + 204, y + 142, 104, 24, C.softViolet, "#CEB6F5", "roundRect");
  label(slide, ctx, "Zeitmatrix", x + 216, y + 148, 82, 10, { size: 10.2, bold: true, color: C.violet, align: "center" });
  label(slide, ctx, "h fuer Score", x + 214, y + 174, 94, 12, { size: 10, color: C.muted, align: "center" });
}

function drawRouteExample(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Warum OSRM wichtig ist", x + 20, y + 16, w - 40, 22, {
    size: 16.5,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Zeit ist nicht proportional zur Distanz.", x + 20, y + 42, w - 40, 16, {
    size: 11,
    bold: true,
    color: C.muted,
  });

  const box = { x: x + 28, y: y + 76, w: w - 56, h: 176 };
  frame(slide, ctx, box.x, box.y, box.w, box.h, "#F7FAFC", "#DDE7F0", "roundRect");
  const hseg = (x1, y1, x2, color, width = 3) => frame(slide, ctx, Math.min(x1, x2), y1, Math.abs(x2 - x1), width, color, "none", "roundRect");
  const vseg = (x1, y1, y2, color, width = 3) => frame(slide, ctx, x1, Math.min(y1, y2), width, Math.abs(y2 - y1), color, "none", "roundRect");
  const depot = { x: box.x + 44, y: box.y + 128 };
  const a = { x: box.x + 110, y: box.y + 50 };
  const b = { x: box.x + 214, y: box.y + 50 };
  const c = { x: box.x + 258, y: box.y + 128 };
  hseg(depot.x, depot.y, c.x, "#93A7BD", 3);
  vseg(a.x, box.y + 50, box.y + 118, C.red, 3);
  hseg(a.x, box.y + 50, b.x, C.red, 3);
  vseg(b.x, box.y + 50, box.y + 118, C.red, 3);
  hseg(a.x, box.y + 118, b.x, C.red, 3);
  frame(slide, ctx, depot.x - 11, depot.y - 11, 22, 22, C.blue, "#FFFFFF", "roundRect");
  label(slide, ctx, "H", depot.x - 9, depot.y - 7, 18, 12, { size: 9.5, bold: true, color: C.white, align: "center" });
  [a, b].forEach((p, i) => {
    frame(slide, ctx, p.x - 10, p.y - 10, 20, 20, C.white, C.teal, "ellipse");
    label(slide, ctx, String(i + 1), p.x - 8, p.y - 7, 16, 12, { size: 9, bold: true, color: C.teal, align: "center" });
  });
  frame(slide, ctx, c.x - 11, c.y - 11, 22, 22, C.amber, "#FFFFFF", "ellipse");
  label(slide, ctx, "3", c.x - 9, c.y - 7, 18, 12, { size: 9.5, bold: true, color: C.white, align: "center" });
  frame(slide, ctx, box.x + 18, box.y + 16, 128, 30, "#FFF5F5", "#F3C2C2", "roundRect");
  label(slide, ctx, "kuerzeste Strecke ≠ schnellste Route", box.x + 28, box.y + 23, 108, 10, { size: 8.8, bold: true, color: C.red, align: "center" });
  frame(slide, ctx, box.x + 156, box.y + 136, 122, 28, C.softBlue, "#CADAEA", "roundRect");
  label(slide, ctx, "OSRM bewertet echte Straßenzeit", box.x + 168, box.y + 143, 98, 10, { size: 8.8, bold: true, color: C.blue, align: "center" });

  label(slide, ctx, "Rueckgabe: GeoJSON-Route", x + 20, y + h - 44, 170, 16, {
    size: 11.3,
    bold: true,
    color: C.ink,
  });
  label(slide, ctx, "Die finale Tour wird mit /route als echte Liniengeometrie gespeichert.", x + 20, y + h - 25, w - 40, 16, {
    size: 10.2,
    color: C.muted,
  });
}

function formulaBand(slide, ctx, x, y, w, h) {
  frame(slide, ctx, x, y, w, h, "#101826", "none", "roundRect");
  label(slide, ctx, "Insertions-Delta fuer jeden Kandidaten", x + 22, y + 16, 260, 18, {
    size: 13.2,
    bold: true,
    color: "#D7E2F1",
    face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Δkm = d(hier->Stop) + d(Stop->Depot) - d(hier->Depot)\nΔh  = t(hier->Stop) + t(Stop->Depot) - t(hier->Depot)",
    x + 22,
    y + 42,
    390,
    34,
    { size: 11.4, bold: true, color: "#D7E2F1", face: ctx.fonts.mono },
  );
  label(
    slide,
    ctx,
    "Score = wc·norm(ΔCHF) + wt·norm(Δh) + we·norm(ΔCO2)",
    x + 470,
    y + 35,
    500,
    22,
    { size: 14.4, bold: true, color: C.white, face: ctx.fonts.mono, align: "center" },
  );
  label(slide, ctx, "kleinster Score = naechster Stopp", x + 1010, y + 35, 150, 22, {
    size: 12.2,
    bold: true,
    color: "#FFDC9B",
    align: "center",
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);
  frame(slide, ctx, 68, 76, 16, 16, C.amber);
  label(slide, ctx, "ROUTENOPTIMIERUNG", 94, 73, 260, 24, {
    size: 13,
    bold: true,
    color: C.amber,
  });

  label(slide, ctx, "OSRM im Greedy-VRP: echte Straßenzeiten statt Luftlinie", 68, 116, 1080, 44, {
    size: 33,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Für jeden Hub fragt Step 4 eine Straßenmatrix ab. Der Algorithmus testet danach alle zulässigen nächsten Stopps und wählt den mit den geringsten normierten Grenzkosten.",
    68,
    174,
    1050,
    42,
    { size: 17, color: C.ink2 },
  );

  drawMatrix(slide, ctx, 68, 246, 360, 276);
  await arrow(slide, ctx, 438, 366);

  const steps = [
    {
      n: 1,
      x: 474,
      y: 246,
      w: 354,
      h: 74,
      color: C.violet,
      fill: C.softViolet,
      icon: "Table2",
      title: "Matrix laden",
      body: "Knoten = Depot + alle zugewiesenen Apotheken; OSRM liefert km und h in einem /table-Aufruf.",
    },
    {
      n: 2,
      x: 474,
      y: 338,
      w: 354,
      h: 74,
      color: C.teal,
      fill: C.softTeal,
      icon: "Filter",
      title: "Kandidaten filtern",
      body: "Kapazität, Reichweite, Schichtzeit und Öffnungszeit entscheiden, welche Stopps zulässig bleiben.",
    },
    {
      n: 3,
      x: 474,
      y: 430,
      w: 354,
      h: 92,
      color: C.amber,
      fill: C.softAmber,
      icon: "Calculator",
      title: "Grenzkosten bewerten",
      body: "Für jeden Kandidaten wird das Insertions-Delta berechnet: zusätzliche km, zusätzliche h und zusätzlicher CO2-Ausstoß.",
    },
  ];
  for (const step of steps) {
    await miniStep(slide, ctx, step);
  }

  await arrow(slide, ctx, 838, 366);
  drawRouteExample(slide, ctx, 874, 246, 340, 276);

  formulaBand(slide, ctx, 68, 552, 1146, 72);

  frame(slide, ctx, 68, 652, 1104, 1, "#D7DEE8");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 672, 240, 18, { size: 9.5, color: "#486078" });
  label(slide, ctx, "10", 1200, 672, 24, 18, { size: 9.5, color: "#486078", align: "right" });
}
