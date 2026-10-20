const C = {
  ink: "#1E293B",
  ink2: "#334155",
  muted: "#64748B",
  blue: "#0F4C81",
  deepBlue: "#2454D6",
  teal: "#0D9488",
  amber: "#D97706",
  green: "#16A34A",
  violet: "#6D28D9",
  red: "#C81E1E",
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

async function hubNode(slide, ctx, item) {
  shadowCard(slide, ctx, item.x, item.y, item.w, item.h, item.fill, item.line ?? C.line);
  frame(slide, ctx, item.x, item.y, item.w, 6, item.color, "none", "roundRect");
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + 14,
    y: item.y + 14,
    w: 22,
    h: 22,
    color: item.color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, item.title, item.x + 44, item.y + 12, item.w - 58, 20, {
    size: item.size ?? 14,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
    align: "center",
  });
  label(slide, ctx, item.sub, item.x + 44, item.y + 34, item.w - 58, 14, {
    size: 9.6,
    bold: true,
    color: item.color,
    align: "center",
  });
}

function pharmacyDot(slide, ctx, x, y, color = C.blue) {
  frame(slide, ctx, x - 5, y - 5, 10, 10, color, "#FFFFFF", "ellipse");
}

function drawCluster(slide, ctx, root, points, color) {
  points.forEach((p) => {
    line(slide, ctx, root, p, "#8DB5CF", 1);
    pharmacyDot(slide, ctx, p.x, p.y, color);
  });
}

async function explainCard(slide, ctx, item) {
  shadowCard(slide, ctx, item.x, item.y, item.w, item.h, item.fill, item.border);
  frame(slide, ctx, item.x, item.y, 7, item.h, item.color);
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + 22,
    y: item.y + 18,
    w: 24,
    h: 24,
    color: item.color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, item.title, item.x + 58, item.y + 14, item.w - 78, 22, {
    size: 16.5,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, item.body, item.x + 58, item.y + 42, item.w - 78, item.h - 48, {
    size: 12.2,
    color: C.ink2,
  });
}

function vehicleTable(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Fahrzeuge nach Ebene", x + 18, y + 14, w - 36, 18, {
    size: 15.5,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  const headers = ["Fahrzeug", "Rolle", "Kap.", "CO2/km"];
  const widths = [102, 116, 58, 72];
  let xx = x + 18;
  const hy = y + 40;
  headers.forEach((head, i) => {
    frame(slide, ctx, xx, hy, widths[i], 22, C.blue, i === 0 ? "none" : "#FFFFFF");
    label(slide, ctx, head, xx + 5, hy + 6, widths[i] - 10, 10, {
      size: 9.4,
      bold: true,
      color: C.white,
      align: i >= 2 ? "center" : "left",
    });
    xx += widths[i];
  });
  const rows = [
    ["Sprinter", "Last-Mile + Backbone", "15", "185 g"],
    ["Klein-LKW", "Last-Mile + Backbone", "40", "230 g"],
    ["LKW", "Backbone", "200", "280 g"],
    ["Zug", "Backbone", "1.000", "520 g"],
  ];
  rows.forEach((row, r) => {
    let cx = x + 18;
    row.forEach((cell, i) => {
      frame(slide, ctx, cx, hy + 22 + r * 17, widths[i], 17, r % 2 === 0 ? "#FBFDFF" : C.white, "#E7EDF4");
      label(slide, ctx, cell, cx + 5, hy + 26 + r * 17, widths[i] - 10, 9, {
        size: i === 1 ? 7.6 : 9,
        color: C.ink,
        align: i >= 2 ? "center" : "left",
      });
      cx += widths[i];
    });
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);
  frame(slide, ctx, 68, 76, 16, 16, C.blue);
  label(slide, ctx, "LIEFERKETTE", 94, 73, 170, 24, {
    size: 13,
    bold: true,
    color: C.blue,
  });

  label(slide, ctx, "Aufbau der Lieferkette: Backbone und Last-Mile", 68, 116, 1010, 44, {
    size: 34,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Alle Waren starten im HQ Bern. Die Backbone-Ebene versorgt regionale und lokale Hubs; die Last-Mile bringt die Ware von dort zu den Apotheken.",
    68,
    174,
    1040,
    38,
    { size: 17.2, color: C.ink2 },
  );

  const panel = { x: 68, y: 232, w: 760, h: 394 };
  shadowCard(slide, ctx, panel.x, panel.y, panel.w, panel.h, C.white);
  label(slide, ctx, "Warenfluss im Netz", panel.x + 28, panel.y + 20, 250, 18, {
    size: 13,
    bold: true,
    color: C.ink,
  });
  const legend = [
    [C.red, "HQ -> VZ"],
    [C.teal, "VZ -> mVZ"],
    [C.blue, "Hub -> Apotheke"],
    [C.amber, "HQ direkt"],
  ];
  legend.forEach(([color, text], i) => {
    const lx = panel.x + 332 + i * 100;
    frame(slide, ctx, lx, panel.y + 24, 22, 4, color, "none", "roundRect");
    label(slide, ctx, text, lx + 30, panel.y + 17, 70, 16, { size: 9.6, bold: true, color: C.muted });
  });

  const hq = { x: panel.x + 300, y: panel.y + 54, w: 160, h: 58 };
  const vz = [
    { x: panel.x + 112, y: panel.y + 158, w: 136, h: 54, title: "VZ 1" },
    { x: panel.x + 312, y: panel.y + 158, w: 136, h: 54, title: "VZ 2" },
    { x: panel.x + 512, y: panel.y + 158, w: 136, h: 54, title: "VZ 3" },
  ];
  const mvz = [
    { x: panel.x + 70, y: panel.y + 264, w: 104, h: 48, title: "mVZ" },
    { x: panel.x + 196, y: panel.y + 264, w: 104, h: 48, title: "mVZ" },
    { x: panel.x + 328, y: panel.y + 264, w: 104, h: 48, title: "mVZ" },
    { x: panel.x + 462, y: panel.y + 264, w: 104, h: 48, title: "mVZ" },
    { x: panel.x + 588, y: panel.y + 264, w: 104, h: 48, title: "mVZ" },
  ];

  const hqCenter = { x: hq.x + hq.w / 2, y: hq.y + hq.h };
  vz.forEach((node) => {
    line(slide, ctx, hqCenter, { x: node.x + node.w / 2, y: node.y - 8 }, C.red, 2.5);
  });
  line(slide, ctx, { x: vz[0].x + vz[0].w / 2, y: vz[0].y + vz[0].h + 4 }, { x: mvz[0].x + mvz[0].w / 2, y: mvz[0].y - 8 }, C.teal, 2);
  line(slide, ctx, { x: vz[0].x + vz[0].w / 2, y: vz[0].y + vz[0].h + 4 }, { x: mvz[1].x + mvz[1].w / 2, y: mvz[1].y - 8 }, C.teal, 2);
  line(slide, ctx, { x: vz[1].x + vz[1].w / 2, y: vz[1].y + vz[1].h + 4 }, { x: mvz[2].x + mvz[2].w / 2, y: mvz[2].y - 8 }, C.teal, 2);
  line(slide, ctx, { x: vz[2].x + vz[2].w / 2, y: vz[2].y + vz[2].h + 4 }, { x: mvz[3].x + mvz[3].w / 2, y: mvz[3].y - 8 }, C.teal, 2);
  line(slide, ctx, { x: vz[2].x + vz[2].w / 2, y: vz[2].y + vz[2].h + 4 }, { x: mvz[4].x + mvz[4].w / 2, y: mvz[4].y - 8 }, C.teal, 2);

  await hubNode(slide, ctx, {
    ...hq,
    color: C.violet,
    fill: C.softViolet,
    icon: "PackageCheck",
    title: "HQ Bern",
    sub: "Ursprung aller Waren",
    size: 14.5,
  });
  for (const node of vz) {
    await hubNode(slide, ctx, {
      ...node,
      color: C.deepBlue,
      fill: C.softBlue,
      icon: "Warehouse",
      sub: "regional · 600 Einh.",
      size: 13.6,
    });
  }
  for (const node of mvz) {
    await hubNode(slide, ctx, {
      ...node,
      color: C.amber,
      fill: C.softAmber,
      icon: "MapPinned",
      sub: "lokal · 125 Einh.",
      size: 12.8,
    });
  }

  const roots = mvz.map((node) => ({ x: node.x + node.w / 2, y: node.y + node.h + 4 }));
  const clusters = [
    [{ x: panel.x + 86, y: panel.y + 352 }, { x: panel.x + 112, y: panel.y + 340 }, { x: panel.x + 143, y: panel.y + 356 }],
    [{ x: panel.x + 210, y: panel.y + 350 }, { x: panel.x + 235, y: panel.y + 362 }, { x: panel.x + 266, y: panel.y + 346 }],
    [{ x: panel.x + 342, y: panel.y + 356 }, { x: panel.x + 372, y: panel.y + 342 }, { x: panel.x + 402, y: panel.y + 356 }],
    [{ x: panel.x + 477, y: panel.y + 348 }, { x: panel.x + 506, y: panel.y + 362 }, { x: panel.x + 536, y: panel.y + 346 }],
    [{ x: panel.x + 604, y: panel.y + 352 }, { x: panel.x + 634, y: panel.y + 340 }, { x: panel.x + 666, y: panel.y + 356 }],
  ];
  clusters.forEach((points, i) => drawCluster(slide, ctx, roots[i], points, C.blue));

  frame(slide, ctx, panel.x + 30, panel.y + 310, 112, 24, C.softAmber, "#F0C98D", "roundRect");
  label(slide, ctx, "HQ direkt <=20 km", panel.x + 42, panel.y + 316, 86, 10, {
    size: 8.8,
    bold: true,
    color: C.amber,
    align: "center",
  });
  [{ x: panel.x + 44, y: panel.y + 354 }, { x: panel.x + 62, y: panel.y + 366 }].forEach((p) => {
    pharmacyDot(slide, ctx, p.x, p.y, C.amber);
  });

  frame(slide, ctx, panel.x + 302, panel.y + 368, 10, 10, C.blue, "none", "ellipse");
  label(slide, ctx, "400 Apotheken als Zielpunkte", panel.x + 318, panel.y + 365, 180, 14, {
    size: 10.4,
    bold: true,
    color: C.blue,
  });

  await explainCard(slide, ctx, {
    x: 860,
    y: 236,
    w: 356,
    h: 80,
    color: C.red,
    fill: "#FFF5F5",
    border: "#F2C9C9",
    icon: "GitBranch",
    title: "1 Backbone",
    body: "Bulk-Transport von HQ -> VZ und VZ -> mVZ. Hier fahren vor allem kapazitaetsstarke Fahrzeuge.",
  });
  await explainCard(slide, ctx, {
    x: 860,
    y: 330,
    w: 356,
    h: 80,
    color: C.blue,
    fill: C.softBlue,
    border: "#C9DBEC",
    icon: "Route",
    title: "2 Last-Mile",
    body: "Vom Hub zur Apotheke. Jede Hub-Zone wird separat optimiert; Sprinter und Klein-LKW bedienen die Stopps.",
  });
  await explainCard(slide, ctx, {
    x: 860,
    y: 424,
    w: 356,
    h: 74,
    color: C.amber,
    fill: C.softAmber,
    border: "#F1D5AA",
    icon: "MapPin",
    title: "3 HQ-Direkt",
    body: "Apotheken im 20-km-Radius koennen direkt aus Bern beliefert werden.",
  });

  vehicleTable(slide, ctx, 860, 516, 356, 124);

  frame(slide, ctx, 68, 652, 1104, 1, "#D7DEE8");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 672, 240, 18, { size: 9.5, color: "#486078" });
  label(slide, ctx, "09", 1200, 672, 24, 18, { size: 9.5, color: "#486078", align: "right" });
}
