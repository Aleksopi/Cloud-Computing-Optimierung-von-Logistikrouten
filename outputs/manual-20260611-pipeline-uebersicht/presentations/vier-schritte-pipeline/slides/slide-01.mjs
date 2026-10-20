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

async function stepCard(slide, ctx, item) {
  shadowCard(slide, ctx, item.x, item.y, item.w, item.h, item.fill);
  frame(slide, ctx, item.x, item.y, item.w, 7, item.color, "none", "roundRect");
  frame(slide, ctx, item.x + 22, item.y + 24, 38, 38, item.color, "none", "ellipse");
  label(slide, ctx, String(item.n), item.x + 22, item.y + 27, 38, 30, {
    size: 16.5,
    bold: true,
    color: C.white,
    align: "center",
    valign: "middle",
    face: ctx.fonts.title,
  });
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + item.w - 50,
    y: item.y + 27,
    w: 26,
    h: 26,
    color: item.color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, item.title, item.x + 72, item.y + 24, item.w - 122, 38, {
    size: 15.6,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, item.method, item.x + 22, item.y + 69, item.w - 44, 16, {
    size: 10.9,
    bold: true,
    color: item.color,
    align: "center",
  });
  label(slide, ctx, item.body, item.x + 22, item.y + 94, item.w - 44, 38, {
    size: 11.15,
    color: C.muted,
  });
  frame(slide, ctx, item.x + 22, item.y + item.h - 32, item.w - 44, 21, C.white, "#D8E4EE", "roundRect");
  label(slide, ctx, item.output, item.x + 30, item.y + item.h - 28, item.w - 60, 14, {
    size: 10.7,
    bold: true,
    color: C.ink2,
    align: "center",
  });
}

async function arrowRight(slide, ctx, x, y, color = "#7A8CA3") {
  await ctx.addLucideIcon(slide, {
    icon: "ArrowRight",
    x,
    y,
    w: 32,
    h: 32,
    color,
    strokeWidth: 2.4,
  });
}

async function smallUp(slide, ctx, x, y, color = "#94A3B8") {
  await ctx.addLucideIcon(slide, {
    icon: "ArrowUp",
    x,
    y,
    w: 20,
    h: 20,
    color,
    strokeWidth: 2.1,
  });
}

async function dbChip(slide, ctx, x, y, w, h, text, color, fill) {
  frame(slide, ctx, x, y, w, h, fill, color, "roundRect");
  await ctx.addLucideIcon(slide, {
    icon: "Database",
    x: x + 18,
    y: y + 13,
    w: 22,
    h: 22,
    color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, text, x + 50, y + 12, w - 68, 22, {
    size: 13.5,
    bold: true,
    color,
    valign: "middle",
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);
  frame(slide, ctx, 68, 76, 16, 16, C.blue);
  label(slide, ctx, "ABLAUF", 94, 73, 140, 24, {
    size: 13,
    bold: true,
    color: C.blue,
  });

  label(slide, ctx, "Die vierstufige Optimierungs-Pipeline", 68, 114, 950, 44, {
    size: 36,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Vom Apothekenbedarf bis zur konkreten Fahrzeugtour: Jeder Schritt erzeugt ein klares Zwischenergebnis und wird in PostgreSQL nachvollziehbar gespeichert.",
    68,
    168,
    990,
    42,
    { size: 17.5, color: C.ink2 },
  );

  const panel = { x: 82, y: 238, w: 1116, h: 354 };
  shadowCard(slide, ctx, panel.x, panel.y, panel.w, panel.h, C.white);
  frame(slide, ctx, panel.x + 26, panel.y + 26, panel.w - 52, 54, "#2E3B4E", "none", "roundRect");
  await ctx.addLucideIcon(slide, {
    icon: "Database",
    x: panel.x + 48,
    y: panel.y + 42,
    w: 22,
    h: 22,
    color: C.white,
    strokeWidth: 2.1,
  });
  label(slide, ctx, "PostgreSQL", panel.x + 82, panel.y + 40, 120, 22, {
    size: 14.5,
    bold: true,
    color: C.white,
    valign: "middle",
  });
  label(slide, ctx, "persistiert Eingangsdaten, Zwischenergebnisse und finale Routen", panel.x + 202, panel.y + 40, 700, 22, {
    size: 13.5,
    bold: true,
    color: "#DCE6F2",
    valign: "middle",
  });

  const steps = [
    {
      n: 1,
      x: panel.x + 42,
      y: panel.y + 124,
      w: 232,
      h: 158,
      color: C.teal,
      fill: C.softTeal,
      icon: "PackageCheck",
      title: "Warenbedarf",
      method: "Catchment-Modell",
      body: "Einwohner im Umfeld werden je Apotheke in Nachfrage übersetzt.",
      output: "Output: Bedarf je Apotheke",
    },
    {
      n: 2,
      x: panel.x + 306,
      y: panel.y + 124,
      w: 232,
      h: 158,
      color: C.blue,
      fill: C.softBlue,
      icon: "Warehouse",
      title: "Hub-\nPlacement",
      method: "Greedy-p-Median",
      body: "VZ und mVZ werden nach Nachfrage und Abdeckung gesetzt.",
      output: "Output: Hub-Standorte",
    },
    {
      n: 3,
      x: panel.x + 570,
      y: panel.y + 124,
      w: 232,
      h: 158,
      color: "#2454D6",
      fill: "#EEF4FF",
      icon: "MapPinned",
      title: "Einzugs-\ngebiete",
      method: "OSRM-Zeitmatrix",
      body: "Jede Apotheke wird dem schnellsten zulässigen Hub zugeordnet.",
      output: "Output: Apotheke -> Hub",
    },
    {
      n: 4,
      x: panel.x + 834,
      y: panel.y + 124,
      w: 232,
      h: 158,
      color: C.amber,
      fill: C.softAmber,
      icon: "Route",
      title: "Routen-\noptimierung",
      method: "Multi-Ziel-VRP",
      body: "Pro Hub entstehen Touren mit Kosten-, Zeit- und CO2-Score.",
      output: "Output: Touren + KPIs",
    },
  ];

  for (const step of steps) {
    await stepCard(slide, ctx, step);
    await smallUp(slide, ctx, step.x + step.w / 2 - 10, panel.y + 90, "#9AA8BB");
  }

  await arrowRight(slide, ctx, panel.x + 270, panel.y + 185);
  await arrowRight(slide, ctx, panel.x + 536, panel.y + 185);
  await arrowRight(slide, ctx, panel.x + 802, panel.y + 185);

  await dbChip(
    slide,
    ctx,
    panel.x + 42,
    panel.y + 300,
    482,
    50,
    "Geodaten + Bedarf treiben Step 1 und Step 2",
    C.teal,
    C.softTeal,
  );
  await dbChip(
    slide,
    ctx,
    panel.x + 566,
    panel.y + 300,
    482,
    50,
    "OSRM liefert echte Straßenzeiten für Step 3 und Step 4",
    C.violet,
    C.softViolet,
  );

  label(
    slide,
    ctx,
    "Leselogik: berechnen -> speichern -> nächster Schritt. So bleiben Ergebnisse reproduzierbar und einzelne Schritte wiederholbar.",
    150,
    612,
    980,
    20,
    { size: 15.5, bold: true, color: C.muted, align: "center" },
  );

  frame(slide, ctx, 68, 642, 1104, 1, "#D7DEE8");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 662, 240, 18, { size: 9.5, color: "#486078" });
  label(slide, ctx, "07", 1200, 662, 24, 18, { size: 9.5, color: "#486078", align: "right" });
}
