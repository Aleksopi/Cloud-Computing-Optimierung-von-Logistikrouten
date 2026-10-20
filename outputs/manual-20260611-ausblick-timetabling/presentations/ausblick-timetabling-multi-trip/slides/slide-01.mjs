const C = {
  bg: "#082945",
  bg2: "#0B3452",
  teal: "#11A39A",
  teal2: "#1BC4B8",
  blue: "#2B74B8",
  blue2: "#15558C",
  amber: "#E28700",
  green: "#22A65A",
  violet: "#8B5CF6",
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

function card(slide, ctx, x, y, w, h, fill = C.card, line = "#2A6688") {
  frame(slide, ctx, x + 5, y + 7, w, h, "#061D31", "none", "roundRect");
  frame(slide, ctx, x, y, w, h, fill, line, "roundRect");
}

async function icon(slide, ctx, name, x, y, w, h, color = C.teal2) {
  await ctx.addLucideIcon(slide, { icon: name, x, y, w, h, color, strokeWidth: 2.25 });
}

function segment(slide, ctx, x1, y1, x2, y2, color = C.teal2, width = 3) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const shape = frame(slide, ctx, x1, y1, len, width, color, "none", "roundRect");
  shape.rotation = angle;
}

function chip(slide, ctx, text, x, y, w, color, fill = "#0A2E4B") {
  frame(slide, ctx, x, y, w, 26, fill, color, "roundRect");
  label(slide, ctx, text, x + 12, y + 7, w - 24, 10, {
    size: 10.8,
    bold: true,
    color,
    align: "center",
  });
}

function miniNode(slide, ctx, x, y, text, fill, line = "#FFFFFF", color = C.white, geometry = "ellipse") {
  frame(slide, ctx, x - 11, y - 11, 22, 22, fill, line, geometry);
  label(slide, ctx, text, x - 9, y - 7, 18, 12, {
    size: 9,
    bold: true,
    color,
    align: "center",
  });
}

async function multiTripCard(slide, ctx, x, y, w, h) {
  card(slide, ctx, x, y, w, h, C.card2);
  await icon(slide, ctx, "RefreshCw", x + 24, y + 22, 28, 28, C.teal2);
  label(slide, ctx, "Was wird erweitert?", x + 66, y + 18, w - 92, 22, {
    size: 20,
    bold: true,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Ein Fahrzeug kann nach Rückkehr wieder beladen werden und am selben Tag eine weitere Tour fahren.", x + 66, y + 46, w - 92, 34, {
    size: 12.8,
    color: C.muted,
  });

  const routeX = x + 40;
  const routeY = y + 128;
  const hub = { x: routeX + 22, y: routeY + 60 };
  const a = { x: routeX + 86, y: routeY + 18 };
  const b = { x: routeX + 154, y: routeY + 42 };
  const c = { x: routeX + 222, y: routeY + 22 };
  const d = { x: routeX + 302, y: routeY + 60 };
  segment(slide, ctx, hub.x, hub.y, a.x, a.y, C.teal2, 3);
  segment(slide, ctx, a.x, a.y, b.x, b.y, C.teal2, 3);
  segment(slide, ctx, b.x, b.y, hub.x, hub.y, "#7BA3BC", 3);
  segment(slide, ctx, hub.x + 8, hub.y + 4, c.x, c.y, C.green, 3);
  segment(slide, ctx, c.x, c.y, d.x, d.y, C.green, 3);
  segment(slide, ctx, hub.x + 8, hub.y + 4, d.x, d.y, "#7BA3BC", 3);
  miniNode(slide, ctx, hub.x, hub.y, "H", C.blue, "#FFFFFF", C.white, "roundRect");
  [a, b].forEach((p, i) => miniNode(slide, ctx, p.x, p.y, String(i + 1), C.white, C.teal2, C.teal2));
  [c, d].forEach((p, i) => miniNode(slide, ctx, p.x, p.y, String(i + 3), C.white, C.green, C.green));
  label(slide, ctx, "Tour 1", routeX + 74, routeY + 78, 70, 14, { size: 11.2, bold: true, color: C.teal2, align: "center" });
  label(slide, ctx, "Tour 2", routeX + 240, routeY + 78, 70, 14, { size: 11.2, bold: true, color: C.green, align: "center" });

  const barX = x + 38;
  const barY = y + h - 86;
  frame(slide, ctx, barX, barY + 36, w - 76, 3, "#6D91AA", "none", "roundRect");
  const blocks = [
    { x: barX + 10, w: 126, c: C.teal2, t: "Tour 1" },
    { x: barX + 154, w: 62, c: C.amber, t: "Laden" },
    { x: barX + 236, w: 126, c: C.green, t: "Tour 2" },
    { x: barX + 382, w: 66, c: C.violet, t: "Puffer" },
  ];
  blocks.forEach((b) => {
    frame(slide, ctx, b.x, barY, b.w, 31, b.c, "none", "roundRect");
    label(slide, ctx, b.t, b.x + 8, barY + 10, b.w - 16, 10, {
      size: 10.2,
      bold: true,
      align: "center",
    });
  });
  ["08:00", "10:30", "11:00", "13:00", "14:00"].forEach((t, i) => {
    const tx = [barX + 12, barX + 150, barX + 232, barX + 360, barX + 448][i];
    frame(slide, ctx, tx, barY + 32, 2, 11, "#9AB8CA");
    label(slide, ctx, t, tx - 20, barY + 49, 42, 10, { size: 8.8, color: C.muted, align: "center" });
  });
}

async function timetableCard(slide, ctx, x, y, w, h) {
  card(slide, ctx, x, y, w, h, "#0F3858");
  await icon(slide, ctx, "CalendarDays", x + 24, y + 22, 28, 28, C.violet);
  label(slide, ctx, "Analogie: Timetabling Problem", x + 66, y + 18, w - 92, 22, {
    size: 19,
    bold: true,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Wie beim Stundenplan werden begrenzte Ressourcen festen Zeitfenstern zugeordnet.", x + 66, y + 46, w - 92, 34, {
    size: 12.6,
    color: C.muted,
  });

  const gx = x + 34;
  const gy = y + 100;
  const labelW = 74;
  const colW = 76;
  const rowH = 38;
  const cols = ["08", "10", "12", "14", "16"];
  const rows = ["Fzg 1", "Fzg 2", "Hub"];
  frame(slide, ctx, gx, gy, labelW + colW * cols.length, 154, "#0A2E4B", "#2A6688", "roundRect");
  cols.forEach((c, i) => label(slide, ctx, c + ":00", gx + labelW + i * colW, gy + 15, colW, 12, {
    size: 9.4,
    bold: true,
    color: C.muted,
    align: "center",
  }));
  rows.forEach((r, i) => {
    label(slide, ctx, r, gx + 14, gy + 44 + i * rowH, 48, 12, {
      size: 9.8,
      bold: true,
      color: C.soft,
    });
    frame(slide, ctx, gx + labelW, gy + 38 + i * rowH, colW * cols.length - 12, 1, "#244E6D");
  });
  cols.forEach((_, i) => frame(slide, ctx, gx + labelW + i * colW, gy + 38, 1, 114, "#244E6D"));

  const block = (bx, by, bw, color, text) => {
    frame(slide, ctx, bx, by, bw, 26, color, "none", "roundRect");
    label(slide, ctx, text, bx + 8, by + 8, bw - 16, 9, { size: 8.6, bold: true, align: "center" });
  };
  block(gx + labelW + 8, gy + 45, 128, C.teal2, "Tour A");
  block(gx + labelW + 152, gy + 45, 54, C.amber, "Laden");
  block(gx + labelW + 222, gy + 45, 126, C.green, "Tour B");
  block(gx + labelW + 84, gy + 83, 150, C.blue, "Tour C");
  block(gx + labelW + 244, gy + 83, 64, C.violet, "Puffer");
  block(gx + labelW + 148, gy + 121, 72, C.amber, "Slots");

  label(slide, ctx, "Timetabling ist ein NP-schweres Scheduling-/Constraint-Satisfaction-Problem.", x + 34, y + h - 86, w - 68, 24, {
    size: 13,
    bold: true,
    color: C.white,
  });
  label(slide, ctx, "Übertragen auf Logistik: Tour, Fahrzeug, Startzeit und Nebenbedingungen müssen gleichzeitig passen.", x + 34, y + h - 54, w - 68, 30, {
    size: 11.7,
    color: C.muted,
  });
}

async function takeaway(slide, ctx, x, y, w, h) {
  card(slide, ctx, x, y, w, h, "#0B314F", "#3282A1");
  await icon(slide, ctx, "BrainCircuit", x + 24, y + 18, 28, 28, "#A78BFA");
  label(slide, ctx, "Mathematischer Kern", x + 66, y + 16, 210, 20, {
    size: 16,
    bold: true,
    color: C.teal2,
    face: ctx.fonts.title,
  });
  chip(slide, ctx, "Routing", x + 298, y + 17, 118, C.teal2);
  await icon(slide, ctx, "Plus", x + 426, y + 20, 18, 18, C.muted);
  chip(slide, ctx, "Scheduling", x + 454, y + 17, 130, C.amber);
  await icon(slide, ctx, "Plus", x + 594, y + 20, 18, 18, C.muted);
  chip(slide, ctx, "Constraints", x + 622, y + 17, 132, C.violet);
  await icon(slide, ctx, "ArrowRight", x + 774, y + 17, 28, 28, C.muted);
  chip(slide, ctx, "NP-schwer", x + 816, y + 17, 134, "#FFFFFF", "#7C3AED");
  label(slide, ctx, "Mehrere Routen pro Tag koppeln Reihenfolge, Startzeiten, Rückkehr, Ladepausen, Kapazität, Schichtfenster sowie Kosten/Zeit/CO₂.", x + 66, y + 48, w - 112, 18, {
    size: 12.1,
    color: C.soft,
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.bg);
  frame(slide, ctx, 0, 0, 38, ctx.H, C.teal);
  frame(slide, ctx, 38, 0, 2, ctx.H, "#57D2C9");
  frame(slide, ctx, 14, 18, ctx.W - 28, ctx.H - 36, "#00000000", "#D8EEF4");

  label(slide, ctx, "AUSBLICK", 88, 82, 180, 24, {
    size: 15,
    bold: true,
    color: C.teal2,
  });
  label(slide, ctx, "Ausblick: Multi-Trip-VRP", 88, 124, 700, 50, {
    size: 40,
    bold: true,
    color: C.white,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Fahrzeuge sollen mehrere Routen an einem Tag fahren können - das macht aus der Routenplanung ein kombiniertes Routing- und Scheduling-Problem.", 88, 184, 850, 42, {
    size: 16.3,
    color: C.soft,
  });

  await multiTripCard(slide, ctx, 88, 252, 516, 324);
  await timetableCard(slide, ctx, 638, 220, 544, 356);
  await takeaway(slide, ctx, 88, 602, 1094, 72);

  frame(slide, ctx, 88, 688, 1126, 1, "#2D7894");
  label(slide, ctx, "Optimierung von Logistikrouten", 88, 702, 260, 12, {
    size: 8.8,
    color: C.muted,
  });
  label(slide, ctx, "14", 1200, 702, 24, 12, { size: 8.8, color: C.muted, align: "right" });
}
