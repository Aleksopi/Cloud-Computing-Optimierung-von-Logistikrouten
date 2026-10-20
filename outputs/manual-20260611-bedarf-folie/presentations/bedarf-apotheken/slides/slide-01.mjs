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
  softGreen: "#ECFDF3",
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

function formula(slide, ctx, text, x, y, w, h, color = C.ink) {
  frame(slide, ctx, x, y, w, h, "#101826", "none", "roundRect");
  label(slide, ctx, text, x + 16, y + 13, w - 32, h - 20, {
    size: 17,
    bold: true,
    color: color === C.ink ? "#D7E2F1" : color,
    face: ctx.fonts.mono,
    valign: "middle",
  });
}

async function stepCard(slide, ctx, item) {
  shadowCard(slide, ctx, item.x, item.y, item.w, item.h, item.fill);
  frame(slide, ctx, item.x, item.y, 7, item.h, item.color);
  frame(slide, ctx, item.x + 24, item.y + 24, 42, 42, item.color, "none", "ellipse");
  label(slide, ctx, String(item.n), item.x + 24, item.y + 27, 42, 34, {
    size: 18,
    bold: true,
    color: C.white,
    align: "center",
    valign: "middle",
    face: ctx.fonts.title,
  });
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + item.w - 56,
    y: item.y + 24,
    w: 30,
    h: 30,
    color: item.color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, item.title, item.x + 84, item.y + 23, item.w - 150, 28, {
    size: 20,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, item.body, item.x + 84, item.y + 58, item.w - 112, 50, {
    size: 13.5,
    color: C.muted,
  });
}

function drawCatchment(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Einzugsgebiet einer Apotheke", x + 24, y + 18, w - 48, 24, {
    size: 18,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  frame(slide, ctx, x + 58, y + 48, 84, 84, "#DFF6F1", "#A7DED5", "ellipse");
  frame(slide, ctx, x + 92, y + 82, 18, 18, C.teal, "none", "ellipse");
  label(slide, ctx, "A", x + 92, y + 84, 18, 14, {
    size: 12,
    bold: true,
    color: C.white,
    align: "center",
  });

  const competitors = [
    [x + 244, y + 78],
    [x + 38, y + 90],
    [x + 205, y + 112],
  ];
  competitors.forEach(([cx, cy]) => {
    frame(slide, ctx, cx, cy, 12, 12, C.blue, "none", "ellipse");
  });
  frame(slide, ctx, x + 108, y + 91, 140, 2, C.amber);
  label(slide, ctx, "nächste Konkurrenz", x + 190, y + 65, 130, 18, {
    size: 11,
    color: C.amber,
  });
}

function drawPopulationGrid(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Bevölkerung summieren", x + 24, y + 18, w - 48, 24, {
    size: 18,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });

  const gridX = x + 36;
  const gridY = y + 52;
  const cell = 10;
  const pops = [
    0, 120, 220, 410, 650, 0, 80, 240, 900, 760,
    100, 330, 1100, 1400, 980, 220, 640, 1800, 1600, 620,
    0, 210, 760, 1240, 540, 0, 80, 390, 650, 230,
  ];
  pops.forEach((pop, i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const shade = pop === 0 ? "#EEF2F7" : pop > 1200 ? "#0D9488" : pop > 700 ? "#72CFC5" : "#C7EEE9";
    frame(slide, ctx, gridX + col * (cell + 6), gridY + row * (cell + 6), cell, cell, shade, "#FFFFFF", "roundRect");
  });
  frame(slide, ctx, x + 96, y + 42, 86, 86, "#00000000", C.amber, "ellipse");
  label(slide, ctx, "1-km²-Zellen", x + 220, y + 82, 100, 18, {
    size: 11,
    bold: true,
    color: C.teal,
  });
}

function drawDistribution(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Ergebnis im Datensatz", x + 24, y + 18, w - 48, 24, {
    size: 18,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });

  const bars = [
    ["1", 281],
    ["2", 74],
    ["3", 24],
    ["4", 9],
    ["5+", 12],
  ];
  const max = 281;
  bars.forEach(([bucket, count], i) => {
    const top = y + 54 + i * 16;
    label(slide, ctx, bucket, x + 24, top - 2, 26, 16, {
      size: 12,
      bold: true,
      color: C.ink,
      align: "right",
    });
    frame(slide, ctx, x + 58, top + 1, 150, 10, "#E8EEF5", "none", "roundRect");
    frame(slide, ctx, x + 58, top + 1, Math.max(8, (count / max) * 150), 10, i === 0 ? C.blue : C.teal, "none", "roundRect");
    label(slide, ctx, String(count), x + 216, top - 3, 36, 16, {
      size: 11,
      color: C.muted,
    });
  });

  label(slide, ctx, "610", x + 272, y + 52, 74, 36, {
    size: 30,
    bold: true,
    color: C.blue,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "gesamt", x + 273, y + 88, 82, 16, {
    size: 12,
    color: C.muted,
  });
  label(slide, ctx, "1-12 je Apotheke", x + 273, y + 108, 92, 16, {
    size: 12,
    color: C.muted,
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);
  frame(slide, ctx, 68, 76, 16, 16, C.teal);
  label(slide, ctx, "BEDARFSMODELL", 94, 73, 250, 24, {
    size: 13,
    bold: true,
    color: C.teal,
  });

  label(slide, ctx, "Warenbedarf je Apotheke aus Bevölkerung ableiten", 68, 116, 900, 46, {
    size: 34,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Nicht jede Apotheke erhält pauschal dieselbe Menge: Das System schätzt pro Standort ein Einzugsgebiet und wandelt die dortige Bevölkerung in Wareneinheiten um.",
    68,
    178,
    930,
    48,
    {
      size: 18,
      color: C.ink2,
    },
  );

  const steps = [
    {
      n: 1,
      x: 68,
      y: 252,
      w: 348,
      h: 116,
      color: C.teal,
      fill: C.softTeal,
      icon: "Radius",
      title: "Einzugsgebiet",
      body: "Je Apotheke: 2/3 der Distanz zur nächsten Konkurrenz, gedeckelt auf 10 km.",
    },
    {
      n: 2,
      x: 466,
      y: 252,
      w: 348,
      h: 116,
      color: C.blue,
      fill: C.softBlue,
      icon: "Grid3X3",
      title: "Bevölkerung",
      body: "Alle Eurostat-Zellen innerhalb dieses Radius werden aufsummiert.",
    },
    {
      n: 3,
      x: 864,
      y: 252,
      w: 348,
      h: 116,
      color: C.amber,
      fill: C.softAmber,
      icon: "PackageCheck",
      title: "Bedarf",
      body: "Aus der Einwohnerzahl entsteht ein ganzzahliger demand-Wert je Apotheke.",
    },
  ];
  for (const step of steps) {
    await stepCard(slide, ctx, step);
  }

  formula(slide, ctx, "radius = min(2/3 × nächste Apotheke, 10 km)", 92, 392, 440, 54);
  formula(slide, ctx, "demand = max(1, ceil(Bevölkerung / 12.000))", 564, 392, 520, 54);

  drawCatchment(slide, ctx, 68, 474, 344, 134);
  drawPopulationGrid(slide, ctx, 452, 474, 344, 134);
  drawDistribution(slide, ctx, 836, 474, 376, 134);

  frame(slide, ctx, 68, 642, 1104, 1, "#D7DEE8");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 650, 360, 18, {
    size: 10,
    color: C.muted,
  });
  label(slide, ctx, "03", 1136, 650, 36, 18, {
    size: 10,
    color: C.muted,
    align: "right",
  });

  slide.speakerNotes.setText(
    "Diese Folie erklärt die Warenbedarf-Berechnung. Für jede Apotheke wird zuerst ein Einzugsgebiet bestimmt: zwei Drittel der Distanz zur nächsten konkurrierenden Apotheke, maximal zehn Kilometer. Anschließend werden alle Eurostat-Bevölkerungszellen innerhalb dieses Radius summiert. Der Warenbedarf ist max(1, ceil(Bevölkerung / 12000)). Im aktuellen Datensatz ergeben sich daraus 610 Wareneinheiten über 400 Apotheken, mit einem Bedarf von 1 bis 12 Einheiten je Apotheke.",
  );
  return slide;
}
