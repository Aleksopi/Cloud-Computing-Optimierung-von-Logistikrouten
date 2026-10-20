const C = {
  bg: "#082945",
  bg2: "#0B3452",
  teal: "#11A39A",
  teal2: "#1BC4B8",
  blue: "#2B74B8",
  amber: "#E28700",
  green: "#22A65A",
  white: "#FFFFFF",
  soft: "#D7E5F0",
  muted: "#9FB5C8",
  card: "#103A5C",
  card2: "#0E314E",
  line: "#2F6687",
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
    color: opts.color ?? C.white,
    align: opts.align ?? "left",
    valign: opts.valign ?? "top",
    typeface: opts.face ?? ctx.fonts.body,
    insets: opts.insets ?? { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

function card(slide, ctx, x, y, w, h, fill = C.card, line = "#275A79") {
  frame(slide, ctx, x + 4, y + 6, w, h, "#061D31", "none", "roundRect");
  frame(slide, ctx, x, y, w, h, fill, line, "roundRect");
}

async function icon(slide, ctx, name, x, y, w, h, color = C.teal2) {
  await ctx.addLucideIcon(slide, { icon: name, x, y, w, h, color, strokeWidth: 2.2 });
}

function line(slide, ctx, x1, y1, x2, y2, color = C.teal2, width = 3) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const shape = frame(slide, ctx, x1, y1, len, width, color, "none", "roundRect");
  shape.rotation = angle;
}

function timeline(slide, ctx, x, y, w, h) {
  card(slide, ctx, x, y, w, h, C.card2, "#2A6688");
  label(slide, ctx, "Tagesumlauf eines Fahrzeugs", x + 24, y + 18, w - 48, 22, {
    size: 18,
    bold: true,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Aus einer Tour wird eine Sequenz aus Touren und Ladepausen.", x + 24, y + 45, w - 48, 18, {
    size: 12.2,
    color: C.muted,
  });

  const baseY = y + 118;
  frame(slide, ctx, x + 44, baseY, w - 88, 3, "#5B86A2", "none", "roundRect");
  const marks = [
    ["08:00", x + 46],
    ["10:15", x + 184],
    ["10:45", x + 268],
    ["13:10", x + 414],
    ["14:00", x + 508],
  ];
  marks.forEach(([t, mx]) => {
    frame(slide, ctx, mx, baseY - 5, 2, 13, "#8DB6CE");
    label(slide, ctx, t, mx - 18, baseY + 13, 44, 12, { size: 9.4, color: C.muted, align: "center" });
  });

  const blocks = [
    { x: x + 58, w: 126, color: C.teal2, title: "Tour 1", sub: "Stopps A-B-C" },
    { x: x + 202, w: 56, color: C.amber, title: "Laden", sub: "Hub" },
    { x: x + 284, w: 126, color: C.green, title: "Tour 2", sub: "Stopps D-E" },
    { x: x + 432, w: 72, color: C.amber, title: "Reserve", sub: "Puffer" },
  ];
  blocks.forEach((b) => {
    frame(slide, ctx, b.x, baseY - 36, b.w, 34, b.color, "none", "roundRect");
    label(slide, ctx, b.title, b.x + 8, baseY - 30, b.w - 16, 10, {
      size: 10.2,
      bold: true,
      align: "center",
    });
    label(slide, ctx, b.sub, b.x + 8, baseY - 16, b.w - 16, 9, {
      size: 8.2,
      align: "center",
    });
  });
}

async function miniRoute(slide, ctx, x, y, color, labelText) {
  frame(slide, ctx, x, y, 112, 92, "#0A2E4B", "#265B7A", "roundRect");
  const hub = { x: x + 22, y: y + 66 };
  const a = { x: x + 46, y: y + 24 };
  const b = { x: x + 84, y: y + 36 };
  const c = { x: x + 80, y: y + 68 };
  line(slide, ctx, hub.x, hub.y, a.x, a.y, color, 2.5);
  line(slide, ctx, a.x, a.y, b.x, b.y, color, 2.5);
  line(slide, ctx, b.x, b.y, c.x, c.y, color, 2.5);
  line(slide, ctx, c.x, c.y, hub.x, hub.y, "#8DAAC0", 2.5);
  frame(slide, ctx, hub.x - 8, hub.y - 8, 16, 16, C.blue, "#FFFFFF", "roundRect");
  label(slide, ctx, "H", hub.x - 6, hub.y - 5, 12, 8, { size: 7.5, bold: true, align: "center" });
  [a, b, c].forEach((p, i) => {
    frame(slide, ctx, p.x - 7, p.y - 7, 14, 14, i === 2 ? C.amber : C.white, i === 2 ? "#FFFFFF" : color, "ellipse");
  });
  label(slide, ctx, labelText, x + 8, y + 8, 96, 10, { size: 8.6, bold: true, color: C.soft, align: "center" });
}

async function reason(slide, ctx, x, y, iconName, title, body, color) {
  card(slide, ctx, x, y, 350, 66, "#0F3858", "#2A6688");
  await icon(slide, ctx, iconName, x + 20, y + 20, 24, 24, color);
  label(slide, ctx, title, x + 58, y + 13, 250, 18, {
    size: 15,
    bold: true,
    face: ctx.fonts.title,
  });
  label(slide, ctx, body, x + 58, y + 36, 264, 18, {
    size: 10.8,
    color: C.muted,
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.bg);
  frame(slide, ctx, 0, 0, 38, ctx.H, C.teal);
  frame(slide, ctx, 38, 0, 2, ctx.H, "#57D2C9");
  frame(slide, ctx, 14, 18, ctx.W - 28, ctx.H - 36, "#00000000", "#D8EEF4");

  label(slide, ctx, "AUSBLICK", 88, 108, 180, 24, {
    size: 15,
    bold: true,
    color: C.teal2,
  });
  label(slide, ctx, "Ausblick", 88, 166, 390, 56, {
    size: 44,
    bold: true,
    color: C.white,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Mehrere Touren pro Fahrzeug am selben Tag", 88, 254, 760, 34, {
    size: 25,
    bold: true,
    color: C.white,
    face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Aktuell fährt ein Fahrzeug eine Tour und kehrt zurück. Der nächste Ausbau wäre: nach Rückkehr neu beladen, erneut starten und so die verfügbare Flotte besser ausnutzen.",
    88,
    306,
    500,
    48,
    { size: 17, color: C.soft },
  );

  frame(slide, ctx, 88, 394, 470, 1, C.line);
  await miniRoute(slide, ctx, 88, 428, C.teal2, "heute: 1 Tour");
  await icon(slide, ctx, "ArrowRight", 218, 456, 34, 34, C.muted);
  await miniRoute(slide, ctx, 274, 428, C.green, "Ausblick: Tour 2");
  await icon(slide, ctx, "RefreshCw", 416, 456, 34, 34, C.amber);
  label(slide, ctx, "Fahrzeug wird nach Rückkehr wieder verfügbar.", 88, 540, 390, 20, {
    size: 13.5,
    bold: true,
    color: C.muted,
  });

  timeline(slide, ctx, 630, 142, 554, 220);

  label(slide, ctx, "Warum ist das mathematisch schwerer?", 630, 398, 460, 28, {
    size: 24,
    bold: true,
    color: C.white,
    face: ctx.fonts.title,
  });
  await reason(
    slide,
    ctx,
    630,
    436,
    "Route",
    "Routing-Entscheidung",
    "Welche Stopps gehören in welche Tour und in welcher Reihenfolge?",
    C.teal2,
  );
  await reason(
    slide,
    ctx,
    630,
    514,
    "Clock3",
    "Umlauf- und Zeitplanung",
    "Wann kommt das Fahrzeug zurück, wann kann es erneut beladen werden?",
    C.amber,
  );
  await reason(
    slide,
    ctx,
    630,
    592,
    "BrainCircuit",
    "Kombinatorische Optimierung",
    "Multi-Trip-VRP mit Zeitfenstern und Kapazitäten ist NP-schwer.",
    "#A78BFA",
  );

  card(slide, ctx, 88, 594, 470, 62, "#0F3858", "#2A6688");
  label(slide, ctx, "Nächster Schritt", 116, 610, 160, 18, {
    size: 14,
    bold: true,
    color: C.teal2,
  });
  label(slide, ctx, "Multi-Trip-VRP: Route + Ladepause + Schichtplan gemeinsam optimieren.", 116, 632, 380, 14, {
    size: 12.4,
    bold: true,
    color: C.soft,
  });

  frame(slide, ctx, 88, 676, 1126, 1, "#2D7894");
  label(slide, ctx, "Vielen Dank - Fragen willkommen.", 88, 692, 360, 18, {
    size: 14,
    bold: true,
    color: C.muted,
  });
  label(slide, ctx, "14", 1200, 692, 24, 18, { size: 9.5, color: C.muted, align: "right" });
}
