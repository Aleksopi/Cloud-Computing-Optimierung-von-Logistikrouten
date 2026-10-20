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
  frame(slide, ctx, item.x + 24, item.y + 22, 40, 40, item.color, "none", "ellipse");
  label(slide, ctx, String(item.n), item.x + 24, item.y + 25, 40, 32, {
    size: 17, bold: true, color: C.white, align: "center", valign: "middle", face: ctx.fonts.title,
  });
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + item.w - 52,
    y: item.y + 23,
    w: 28,
    h: 28,
    color: item.color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, item.title, item.x + 82, item.y + 21, item.w - 140, 26, {
    size: 18.5, bold: true, color: C.ink, face: ctx.fonts.title,
  });
  label(slide, ctx, item.body, item.x + 82, item.y + 54, item.w - 106, item.h - 60, {
    size: 12.9, color: C.muted,
  });
}

function formula(slide, ctx, lines, x, y, w, h) {
  frame(slide, ctx, x, y, w, h, "#101826", "none", "roundRect");
  label(slide, ctx, lines.join("\n"), x + 16, y + 12, w - 32, h - 20, {
    size: 14.1, bold: true, color: "#D7E2F1", face: ctx.fonts.mono, valign: "middle",
  });
}

function drawConstraints(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.soft);
  label(slide, ctx, "Zulässige Kandidaten", x + 22, y + 15, w - 44, 22, {
    size: 18, bold: true, color: C.ink, face: ctx.fonts.title,
  });
  const rules = [
    ["Kapazität", "demand ≤ items_loaded"],
    ["Reichweite", "km + hin + zurück ≤ range"],
    ["Schicht", "Fahrzeit + Service ≤ shift"],
    ["Öffnung", "Ankunft liegt im Zeitfenster"],
  ];
  rules.forEach(([head, body], i) => {
    const yy = y + 50 + i * 24;
    frame(slide, ctx, x + 22, yy + 5, 7, 7, i < 2 ? C.teal : C.amber, "none", "ellipse");
    label(slide, ctx, head, x + 42, yy, 78, 18, { size: 12.4, bold: true, color: C.ink });
    label(slide, ctx, body, x + 124, yy, w - 142, 18, { size: 11.6, color: C.muted });
  });
}

function line(slide, ctx, a, b, color, width = 3) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const l = frame(slide, ctx, a.x, a.y, len, width, color, "none", "roundRect");
  l.rotation = angle;
}

function drawRoute(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Greedy-Tour pro Hub", x + 24, y + 18, w - 48, 24, {
    size: 18, bold: true, color: C.ink, face: ctx.fonts.title,
  });
  label(slide, ctx, "Hub → Stop → Stop → zurück", x + 24, y + 43, w - 48, 18, {
    size: 11.5, color: C.muted,
  });

  const box = { x: x + 30, y: y + 72, w: w - 60, h: h - 126 };
  frame(slide, ctx, box.x, box.y, box.w, box.h, "#F7FAFC", "#DDE7F0", "roundRect");

  const pts = {
    hub: { x: box.x + 50, y: box.y + box.h - 42 },
    a: { x: box.x + 118, y: box.y + 54 },
    b: { x: box.x + 202, y: box.y + 78 },
    c: { x: box.x + 255, y: box.y + 144 },
    d: { x: box.x + 150, y: box.y + 165 },
  };
  const seq = [pts.hub, pts.a, pts.b, pts.c, pts.d, pts.hub];
  for (let i = 0; i < seq.length - 1; i += 1) {
    line(slide, ctx, seq[i], seq[i + 1], i === seq.length - 2 ? "#B8C7D8" : C.teal, 3);
  }

  frame(slide, ctx, pts.hub.x - 12, pts.hub.y - 12, 24, 24, C.blue, "#FFFFFF", "roundRect");
  label(slide, ctx, "H", pts.hub.x - 10, pts.hub.y - 8, 20, 14, {
    size: 10, bold: true, color: C.white, align: "center",
  });
  [pts.a, pts.b, pts.c, pts.d].forEach((p, i) => {
    frame(slide, ctx, p.x - 10, p.y - 10, 20, 20, i === 2 ? C.amber : C.white, i === 2 ? "#FFFFFF" : C.teal, "ellipse");
    label(slide, ctx, String(i + 1), p.x - 8, p.y - 7, 16, 12, {
      size: 9, bold: true, color: i === 2 ? C.white : C.teal, align: "center",
    });
  });

  frame(slide, ctx, box.x + 18, box.y + 18, 116, 34, C.softGreen, "#B9E7C9", "roundRect");
  label(slide, ctx, "nächster Stop = kleinster Score", box.x + 28, box.y + 25, 96, 18, {
    size: 10.5, bold: true, color: C.green, align: "center",
  });

  const ly = y + h - 38;
  frame(slide, ctx, x + 30, ly, 12, 12, C.blue, "none", "roundRect");
  label(slide, ctx, "Hub", x + 48, ly - 2, 38, 16, { size: 11.5, color: C.muted });
  frame(slide, ctx, x + 108, ly, 12, 12, C.white, C.teal, "ellipse");
  label(slide, ctx, "Apotheke", x + 126, ly - 2, 72, 16, { size: 11.5, color: C.muted });
  frame(slide, ctx, x + 214, ly, 12, 12, C.amber, "none", "ellipse");
  label(slide, ctx, "gewählt", x + 232, ly - 2, 62, 16, { size: 11.5, color: C.muted });
}

function drawVehicleOrder(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Fahrzeugreihenfolge", x + 22, y + 13, 174, 20, {
    size: 15.5, bold: true, color: C.ink, face: ctx.fonts.title,
  });
  label(slide, ctx, "Kosten: günstig · Zeit: schnell · Umwelt: CO2-arm", x + 204, y + 16, w - 224, 18, {
    size: 10.8, color: C.muted,
  });
  [C.blue, C.amber, C.green].forEach((color, i) => {
    frame(slide, ctx, x + 204 + i * 48, y + 38, 34, 6, color, "none", "roundRect");
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);
  frame(slide, ctx, 68, 76, 16, 16, C.amber);
  label(slide, ctx, "ROUTENOPTIMIERUNG", 94, 73, 290, 24, {
    size: 13, bold: true, color: C.amber,
  });

  label(slide, ctx, "Fahrzeugtouren mit verallgemeinerten Kosten bauen", 68, 116, 960, 46, {
    size: 34, bold: true, color: C.ink, face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Pro Hub entsteht eine Mehrstopp-Tour. Der Greedy-VRP wählt immer den nächsten zulässigen Stopp mit den geringsten normierten Grenzkosten aus Kosten, Zeit und CO₂.",
    68,
    178,
    930,
    48,
    { size: 18, color: C.ink2 },
  );

  const cards = [
    {
      n: 1, x: 68, y: 252, w: 344, h: 94, color: C.blue, fill: C.softBlue,
      icon: "Table2", title: "OSRM pro Depot",
      body: "Distanz und Fahrzeit für Hub + alle zugewiesenen Apotheken.",
    },
    {
      n: 2, x: 68, y: 366, w: 344, h: 94, color: C.teal, fill: C.softTeal,
      icon: "Filter", title: "Kandidaten filtern",
      body: "Nur Stopps, die Kapazität, Reichweite, Schicht und Öffnung erfüllen.",
    },
    {
      n: 3, x: 68, y: 480, w: 344, h: 128, color: C.amber, fill: C.softAmber,
      icon: "Route", title: "Stopp wählen",
      body: "Kleinster gewichteter Score gewinnt; danach sinkt Restkapazität und der nächste Stopp wird gesucht.",
    },
  ];
  for (const card of cards) {
    await stepCard(slide, ctx, card);
  }

  formula(slide, ctx, [
    "Δkm, Δh = zusätzliche Strecke und Zeit",
    "ΔCHF = Δkm·CHF/km + Δh·Fahrerlohn",
    "score = wc·norm(ΔCHF) + wt·norm(Δh) + we·norm(ΔCO2)",
  ], 454, 252, 378, 116);
  drawConstraints(slide, ctx, 454, 388, 378, 132);
  drawVehicleOrder(slide, ctx, 454, 542, 378, 66);
  drawRoute(slide, ctx, 872, 252, 340, 356);

  frame(slide, ctx, 68, 642, 1104, 1, "#D7DEE8");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 650, 360, 18, {
    size: 10, color: C.muted,
  });
  label(slide, ctx, "06", 1136, 650, 36, 18, {
    size: 10, color: C.muted, align: "right",
  });

  slide.speakerNotes.setText(
    "Diese Folie erklärt Step 4, die Routenoptimierung. Für jeden Hub wird ein Vehicle Routing Problem gelöst. OSRM liefert Distanz und Fahrzeit zwischen Depot und Stopps. Für jeden möglichen nächsten Stopp werden die Grenzgrößen berechnet: zusätzliche Kilometer, zusätzliche Fahrzeit und daraus Kosten sowie CO2. Nur zulässige Stopps werden betrachtet: Kapazität, Reichweite, Schichtdauer und Öffnungszeiten. Der Stopp mit dem kleinsten gewichteten, normierten Score wird angefahren. Die gleichen Gewichte steuern auch, welcher Fahrzeugtyp zuerst eingesetzt wird: Kostenfokus günstig, Zeitfokus schnell, Umweltfokus emissionsarm.",
  );
  return slide;
}
