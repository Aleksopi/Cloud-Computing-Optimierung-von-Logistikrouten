const C = {
  ink: "#1E293B",
  ink2: "#334155",
  muted: "#64748B",
  line: "#E2E8F0",
  paper: "#FFFFFF",
  soft: "#F7FAFC",
  softBlue: "#EAF3FA",
  softTeal: "#ECFBF8",
  softAmber: "#FFF7E8",
  softViolet: "#F3ECFF",
  blue: "#0F4C81",
  teal: "#0D9488",
  amber: "#D97706",
  green: "#16A34A",
  violet: "#6D28D9",
  navy: "#27364A",
  white: "#FFFFFF",
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

function card(slide, ctx, x, y, w, h, fill = C.paper, line = C.line) {
  frame(slide, ctx, x + 4, y + 6, w, h, "#D7E0EA", "none", "roundRect");
  frame(slide, ctx, x, y, w, h, fill, line, "roundRect");
}

async function icon(slide, ctx, name, x, y, w, h, color) {
  await ctx.addLucideIcon(slide, { icon: name, x, y, w, h, color, strokeWidth: 2.2 });
}

function segment(slide, ctx, x1, y1, x2, y2, color = "#A7B4C3", width = 2.5) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const shape = frame(slide, ctx, x1, y1, len, width, color, "none", "roundRect");
  shape.rotation = angle;
}

async function agendaItem(slide, ctx, item) {
  card(slide, ctx, item.x, item.y, item.w, item.h, item.fill, item.border ?? C.line);
  frame(slide, ctx, item.x, item.y, 7, item.h, item.color);
  frame(slide, ctx, item.x + 22, item.y + 22, 38, 38, item.color, "none", "ellipse");
  label(slide, ctx, String(item.n), item.x + 22, item.y + 27, 38, 20, {
    size: 14.5,
    bold: true,
    color: C.white,
    align: "center",
    valign: "middle",
    face: ctx.fonts.title,
  });
  await icon(slide, ctx, item.icon, item.x + item.w - 48, item.y + 24, 25, 25, item.color);
  label(slide, ctx, item.title, item.x + 76, item.y + 20, item.w - 130, 20, {
    size: 15.6,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, item.body, item.x + 76, item.y + 48, item.w - 100, 36, {
    size: 11.2,
    color: C.ink2,
  });
}

async function drawFlow(slide, ctx, items) {
  const centersTop = items.slice(0, 3).map((i) => ({ x: i.x + i.w + 11, y: i.y + i.h / 2 }));
  const startsTop = items.slice(1, 3).map((i) => ({ x: i.x - 23, y: i.y + i.h / 2 }));
  segment(slide, ctx, centersTop[0].x, centersTop[0].y, startsTop[0].x, startsTop[0].y);
  segment(slide, ctx, centersTop[1].x, centersTop[1].y, startsTop[1].x, startsTop[1].y);
  await icon(slide, ctx, "ArrowRight", startsTop[0].x - 20, startsTop[0].y - 12, 24, 24, "#8798AA");
  await icon(slide, ctx, "ArrowRight", startsTop[1].x - 20, startsTop[1].y - 12, 24, 24, "#8798AA");

  const p3 = items[2];
  const p4 = items[3];
  segment(slide, ctx, p3.x + p3.w / 2, p3.y + p3.h + 8, p3.x + p3.w / 2, p4.y - 30);
  segment(slide, ctx, p3.x + p3.w / 2, p4.y - 30, p4.x + p4.w / 2, p4.y - 30);
  segment(slide, ctx, p4.x + p4.w / 2, p4.y - 30, p4.x + p4.w / 2, p4.y - 8);
  await icon(slide, ctx, "ArrowDown", p4.x + p4.w / 2 - 12, p4.y - 30, 24, 24, "#8798AA");

  const centersBottom = items.slice(3, 5).map((i) => ({ x: i.x + i.w + 11, y: i.y + i.h / 2 }));
  const startsBottom = items.slice(4, 6).map((i) => ({ x: i.x - 23, y: i.y + i.h / 2 }));
  segment(slide, ctx, centersBottom[0].x, centersBottom[0].y, startsBottom[0].x, startsBottom[0].y);
  segment(slide, ctx, centersBottom[1].x, centersBottom[1].y, startsBottom[1].x, startsBottom[1].y);
  await icon(slide, ctx, "ArrowRight", startsBottom[0].x - 20, startsBottom[0].y - 12, 24, 24, "#8798AA");
  await icon(slide, ctx, "ArrowRight", startsBottom[1].x - 20, startsBottom[1].y - 12, 24, 24, "#8798AA");
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);

  frame(slide, ctx, 68, 72, 16, 16, C.blue);
  label(slide, ctx, "ÜBERBLICK", 92, 71, 170, 18, {
    size: 13,
    bold: true,
    color: C.blue,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Gliederung", 68, 116, 430, 46, {
    size: 38,
    bold: true,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Vom Pharma-Anwendungsfall zur optimierten Route: Bedarf, Optimierung, Architektur, Ergebnis und Ausblick.", 68, 176, 760, 42, {
    size: 16.5,
    color: C.ink2,
  });

  card(slide, ctx, 932, 108, 280, 100, "#EAFBF7", "#A7E2DB");
  frame(slide, ctx, 932, 108, 8, 100, C.teal);
  label(slide, ctx, "Leitfrage", 956, 126, 110, 18, {
    size: 14,
    bold: true,
    color: C.teal,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Wie lassen sich Apotheken in der Schweiz effizient, pünktlich und CO₂-bewusst beliefern?", 956, 151, 224, 36, {
    size: 12.1,
    color: C.ink,
  });

  const x0 = 68;
  const y0 = 262;
  const gap = 28;
  const w = 356;
  const h = 104;
  const items = [
    {
      n: 1,
      x: x0,
      y: y0,
      w,
      h,
      color: C.blue,
      fill: C.softBlue,
      icon: "MapPinned",
      title: "Anwendungsfall & Ziel",
      body: "Pharma-Distribution, Apothekenfokus und Optimierungsziel.",
    },
    {
      n: 2,
      x: x0 + w + gap,
      y: y0,
      w,
      h,
      color: C.teal,
      fill: C.softTeal,
      icon: "Database",
      title: "Datenbasis & Bedarf",
      body: "Apotheken, Bevölkerung, Nachfrage und reale Straßendaten.",
    },
    {
      n: 3,
      x: x0 + (w + gap) * 2,
      y: y0,
      w,
      h,
      color: C.amber,
      fill: C.softAmber,
      icon: "GitBranch",
      title: "Optimierungs-Pipeline",
      body: "Bedarf, Hub-Placement, Einzugsgebiete und Routen.",
    },
    {
      n: 4,
      x: x0,
      y: y0 + h + 78,
      w,
      h,
      color: C.green,
      fill: "#EEFBEF",
      icon: "Route",
      title: "Routenberechnung",
      body: "OSRM, Live Traffic, Fahrzeugauswahl, Kosten, Zeit und CO₂.",
    },
    {
      n: 5,
      x: x0 + w + gap,
      y: y0 + h + 78,
      w,
      h,
      color: C.violet,
      fill: C.softViolet,
      icon: "Network",
      title: "Systemarchitektur",
      body: "Docker-Compose, nginx, FastAPI, Celery, Redis, PostGIS und OSRM.",
    },
    {
      n: 6,
      x: x0 + (w + gap) * 2,
      y: y0 + h + 78,
      w,
      h,
      color: C.navy,
      fill: C.soft,
      icon: "TrendingUp",
      title: "Ergebnis & Ausblick",
      body: "Interpretation, Grenzen und Multi-Trip-VRP als nächster Schritt.",
    },
  ];

  await drawFlow(slide, ctx, items);
  for (const item of items) {
    await agendaItem(slide, ctx, item);
  }

  frame(slide, ctx, 68, 690, 1144, 1, "#DDE6EF");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 704, 250, 11, {
    size: 8.4,
    bold: true,
    color: C.muted,
  });
  label(slide, ctx, "02", 1190, 704, 22, 11, { size: 8.4, color: C.muted, align: "right" });
}
