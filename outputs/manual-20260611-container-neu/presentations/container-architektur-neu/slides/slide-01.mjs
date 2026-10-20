const C = {
  ink: "#1E293B",
  ink2: "#334155",
  muted: "#64748B",
  line: "#DCE5EF",
  paper: "#FFFFFF",
  panel: "#F8FBFE",
  softBlue: "#EAF3FA",
  softTeal: "#EAFBF7",
  softAmber: "#FFF5E4",
  softRed: "#FFF1F2",
  softViolet: "#F3ECFF",
  blue: "#0F4C81",
  navy: "#243247",
  teal: "#0D9488",
  purple: "#6D28D9",
  amber: "#D97706",
  red: "#B91C1C",
  green: "#0F766E",
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
  frame(slide, ctx, x + 5, y + 7, w, h, "#D7E0EA", "none", "roundRect");
  frame(slide, ctx, x, y, w, h, fill, line, "roundRect");
}

async function icon(slide, ctx, iconName, x, y, w, h, color = C.blue) {
  await ctx.addLucideIcon(slide, { icon: iconName, x, y, w, h, color, strokeWidth: 2.2 });
}

function segment(slide, ctx, x1, y1, x2, y2, color = "#8A9CAF", width = 2.4) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const shape = frame(slide, ctx, x1, y1, len, width, color, "none", "roundRect");
  shape.rotation = angle;
}

async function arrowIcon(slide, ctx, name, x, y, color = "#7E91A7") {
  await ctx.addLucideIcon(slide, { icon: name, x, y, w: 24, h: 24, color, strokeWidth: 2.4 });
}

function pill(slide, ctx, text, x, y, w, color, fill = C.white) {
  frame(slide, ctx, x, y, w, 28, fill, color, "roundRect");
  label(slide, ctx, text, x + 12, y + 8, w - 24, 9, {
    size: 9.3,
    bold: true,
    color,
    align: "center",
  });
}

async function serviceBox(slide, ctx, opts) {
  const { x, y, w, h, color, fill, iconName, title, tech, detail, port } = opts;
  frame(slide, ctx, x + 4, y + 6, w, h, "#CFDAE5", "none", "roundRect");
  frame(slide, ctx, x, y, w, h, fill, "#CAD8E5", "roundRect");
  frame(slide, ctx, x, y, w, 8, color, "none", "roundRect");
  await icon(slide, ctx, iconName, x + 18, y + 23, 30, 30, color);
  label(slide, ctx, title, x + 58, y + 20, w - 76, 16, {
    size: 14.6,
    bold: true,
    face: ctx.fonts.title,
  });
  label(slide, ctx, tech, x + 58, y + 42, w - 76, 12, {
    size: 9.8,
    bold: true,
    color,
  });
  if (detail) {
    label(slide, ctx, detail, x + 58, y + 58, w - 76, 12, {
      size: 8.6,
      color: C.muted,
    });
  }
  if (port) {
    pill(slide, ctx, port, x + 18, y + h - 28, w - 36, "#A9B8C8", C.white);
  }
}

async function smallService(slide, ctx, opts) {
  const { x, y, w, color, fill, iconName, title, port } = opts;
  frame(slide, ctx, x + 4, y + 6, w, 58, "#CFDAE5", "none", "roundRect");
  frame(slide, ctx, x, y, w, 58, fill, "#CAD8E5", "roundRect");
  frame(slide, ctx, x, y, w, 7, color, "none", "roundRect");
  await icon(slide, ctx, iconName, x + 14, y + 21, 24, 24, color);
  label(slide, ctx, title, x + 44, y + 19, w - 52, 14, {
    size: 11.8,
    bold: true,
    face: ctx.fonts.title,
  });
  label(slide, ctx, port, x + 44, y + 38, w - 52, 9, {
    size: 8.3,
    color: C.muted,
    bold: true,
  });
}

async function architectureDiagram(slide, ctx, x, y, w, h) {
  card(slide, ctx, x, y, w, h, C.paper);
  label(slide, ctx, "Datenfluss im internen Docker-Netzwerk", x + 24, y + 20, 360, 20, {
    size: 15.5,
    bold: true,
    face: ctx.fonts.title,
  });
  pill(slide, ctx, "extern sichtbar: nur nginx", x + w - 238, y + 17, 200, C.purple, "#F4EEFF");

  const browser = { x: x + 244, y: y + 54, w: 250, h: 44 };
  frame(slide, ctx, browser.x, browser.y, browser.w, browser.h, C.softBlue, C.blue, "roundRect");
  await icon(slide, ctx, "Monitor", browser.x + 25, browser.y + 10, 25, 25, C.blue);
  label(slide, ctx, "Browser", browser.x + 74, browser.y + 14, 132, 14, {
    size: 13.5,
    bold: true,
    color: C.blue,
    align: "center",
    face: ctx.fonts.title,
  });

  const net = { x: x + 26, y: y + 112, w: w - 52, h: h - 120 };
  frame(slide, ctx, net.x, net.y, net.w, net.h, "#FBFDFF", "#DDE8F3", "roundRect");
  label(slide, ctx, "internes Netzwerk", net.x + 18, net.y + 15, 150, 14, {
    size: 10.5,
    bold: true,
    color: C.muted,
  });

  const nginx = { x: x + 214, y: y + 142, w: 310, h: 62 };
  segment(slide, ctx, browser.x + 125, browser.y + 44, nginx.x + 155, nginx.y - 4);
  await arrowIcon(slide, ctx, "ArrowDown", browser.x + 113, browser.y + 51);
  frame(slide, ctx, nginx.x, nginx.y, nginx.w, nginx.h, C.navy, "none", "roundRect");
  await icon(slide, ctx, "Shield", nginx.x + 24, nginx.y + 19, 26, 26, C.white);
  label(slide, ctx, "pharma-nginx", nginx.x + 66, nginx.y + 17, 182, 15, {
    size: 14.2,
    bold: true,
    color: C.white,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "/api → backend    / → frontend", nginx.x + 66, nginx.y + 38, 210, 11, {
    size: 9.7,
    bold: true,
    color: "#D8E4F0",
  });

  const frontend = { x: x + 54, y: y + 210, w: 218, h: 72 };
  const backend = { x: x + 454, y: y + 210, w: 218, h: 72 };
  segment(slide, ctx, nginx.x + 70, nginx.y + 62, frontend.x + 108, frontend.y - 6);
  segment(slide, ctx, nginx.x + 240, nginx.y + 62, backend.x + 110, backend.y - 6);
  label(slide, ctx, "/  ", frontend.x + 120, frontend.y - 28, 38, 12, { size: 10, bold: true, color: C.teal, align: "center" });
  label(slide, ctx, "/api", backend.x + 82, backend.y - 28, 46, 12, { size: 10, bold: true, color: C.blue, align: "center" });
  await serviceBox(slide, ctx, {
    x: frontend.x,
    y: frontend.y,
    w: frontend.w,
    h: frontend.h,
    color: C.teal,
    fill: C.softTeal,
    iconName: "LayoutDashboard",
    title: "frontend",
    tech: "React + MapLibre",
    detail: "Karte, Dashboard, Pipeline-UI",
    port: "Port 80 intern / 5173 dev",
  });
  await serviceBox(slide, ctx, {
    x: backend.x,
    y: backend.y,
    w: backend.w,
    h: backend.h,
    color: C.blue,
    fill: C.softBlue,
    iconName: "ServerCog",
    title: "backend",
    tech: "FastAPI REST",
    detail: "API + Orchestrierung",
    port: "Port 8000 intern",
  });

  segment(slide, ctx, frontend.x + frontend.w, frontend.y + 38, backend.x - 16, backend.y + 38, "#8AA0B6", 2.4);
  await arrowIcon(slide, ctx, "ArrowRight", x + 352, frontend.y + 26);
  label(slide, ctx, "Status-Polling", x + 310, frontend.y + 56, 100, 10, { size: 8.3, bold: true, color: C.muted, align: "center" });

  const baseY = y + 292;
  const postgres = { x: x + 30, y: baseY, w: 142 };
  const redis = { x: x + 204, y: baseY, w: 142 };
  const worker = { x: x + 378, y: baseY, w: 142 };
  const osrm = { x: x + 552, y: baseY, w: 142 };
  [postgres, redis, worker, osrm].forEach((svc) => {
    segment(slide, ctx, backend.x + backend.w / 2, backend.y + backend.h, svc.x + svc.w / 2, svc.y - 5, "#B8C7D6", 1.8);
  });
  segment(slide, ctx, redis.x + redis.w, redis.y + 29, worker.x - 8, worker.y + 29, C.red, 2);
  segment(slide, ctx, worker.x + worker.w, worker.y + 29, osrm.x - 8, osrm.y + 29, C.purple, 2);
  segment(slide, ctx, worker.x, worker.y + 29, postgres.x + postgres.w + 8, postgres.y + 29, C.navy, 2);
  await smallService(slide, ctx, {
    ...postgres,
    color: C.navy,
    fill: "#F2F7FB",
    iconName: "Database",
    title: "postgres",
    port: "PostGIS / KPIs",
  });
  await smallService(slide, ctx, {
    ...redis,
    color: C.red,
    fill: C.softRed,
    iconName: "MessageSquare",
    title: "redis",
    port: "Broker + Status",
  });
  await smallService(slide, ctx, {
    ...worker,
    color: C.amber,
    fill: C.softAmber,
    iconName: "Cpu",
    title: "worker",
    port: "Celery async",
  });
  await smallService(slide, ctx, {
    ...osrm,
    color: C.purple,
    fill: C.softViolet,
    iconName: "Route",
    title: "osrm",
    port: "Port 5000 intern",
  });
}

function roleTable(slide, ctx, x, y, w, h) {
  card(slide, ctx, x, y, w, h, C.paper);
  label(slide, ctx, "Die 7 Container und ihre Rollen", x + 20, y + 18, w - 40, 22, {
    size: 21,
    bold: true,
    face: ctx.fonts.title,
  });
  const tx = x + 20;
  const ty = y + 56;
  const tw = w - 40;
  const headerH = 26;
  const rowH = 34;
  const c1 = 82;
  const c2 = 98;
  frame(slide, ctx, tx, ty, tw, headerH, C.blue, "none", "roundRect");
  label(slide, ctx, "Container", tx + 8, ty + 8, c1 - 12, 8, { size: 8.4, bold: true, color: C.white });
  label(slide, ctx, "Technologie", tx + c1 + 8, ty + 8, c2 - 12, 8, { size: 8.4, bold: true, color: C.white });
  label(slide, ctx, "Aufgabe", tx + c1 + c2 + 8, ty + 8, tw - c1 - c2 - 16, 8, { size: 8.4, bold: true, color: C.white });

  const rows = [
    ["nginx", "-", "VPN-Edge; leitet Requests weiter", C.purple],
    ["frontend", "React + MapLibre", "Karte, Dashboard, Pipeline-UI", C.teal],
    ["backend", "FastAPI", "REST-API, Orchestrierung", C.blue],
    ["worker", "Celery", "Lange Pipeline-Läufe async", C.amber],
    ["redis", "-", "Message-Broker + Task-Status", C.red],
    ["postgres", "PostGIS", "Hubs, Routen, KPI-Ergebnisse", C.navy],
    ["osrm", "-", "Straßendistanzen & Fahrzeiten", C.purple],
  ];

  rows.forEach((r, i) => {
    const ry = ty + headerH + i * rowH;
    frame(slide, ctx, tx, ry, tw, rowH, i % 2 === 0 ? "#FFFFFF" : "#F7FAFC", "#EEF3F8");
    frame(slide, ctx, tx + 7, ry + 12, 8, 8, r[3], "none", "ellipse");
    label(slide, ctx, r[0], tx + 22, ry + 10, c1 - 24, 10, { size: 8.8, bold: true, color: C.ink });
    label(slide, ctx, r[1], tx + c1 + 8, ry + 10, c2 - 12, 10, { size: 8.4, color: C.ink2 });
    label(slide, ctx, r[2], tx + c1 + c2 + 8, ry + 9, tw - c1 - c2 - 12, 12, { size: 8.2, color: C.ink2 });
  });
}

async function asyncCallout(slide, ctx, x, y, w, h) {
  card(slide, ctx, x, y, w, h, "#EAFBF7", "#9FE1D9");
  frame(slide, ctx, x, y, 9, h, C.teal, "none");
  label(slide, ctx, "Warum diese Trennung?", x + 28, y + 16, 210, 18, {
    size: 15.8,
    bold: true,
    color: C.green,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Routenoptimierungen dauern Minuten: FastAPI gibt sofort eine Task-ID zurück; Redis puffert den Job; Celery rechnet im Hintergrund; PostgreSQL speichert das Ergebnis.", x + 28, y + 40, 660, 14, {
    size: 10.5,
    color: C.ink,
  });

  const sx = x + 720;
  const sy = y + 22;
  const steps = [
    ["Auftrag", C.blue],
    ["Task-ID", C.teal],
    ["Redis", C.red],
    ["Worker", C.amber],
    ["Postgres", C.navy],
  ];
  steps.forEach((s, i) => {
    const bx = sx + i * 82;
    frame(slide, ctx, bx, sy, 66, 28, C.white, s[1], "roundRect");
    label(slide, ctx, s[0], bx + 8, sy + 8, 50, 8, {
      size: 8.3,
      bold: true,
      color: s[1],
      align: "center",
    });
    if (i < steps.length - 1) {
      label(slide, ctx, "→", bx + 70, sy + 6, 14, 10, { size: 12, bold: true, color: C.muted, align: "center" });
    }
  });
  label(slide, ctx, "Frontend pollt den Task-Status über die API, bis das Ergebnis fertig ist.", sx, sy + 40, 390, 10, {
    size: 8.8,
    bold: true,
    color: C.green,
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);

  frame(slide, ctx, 68, 78, 16, 16, C.purple);
  label(slide, ctx, "SYSTEMARCHITEKTUR", 92, 77, 220, 18, {
    size: 13,
    bold: true,
    color: C.purple,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Container-Aufbau im Docker-Compose-Stack", 68, 122, 870, 46, {
    size: 34,
    bold: true,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Die Architektur besteht aus sieben Containern in einem internen Netzwerk. Von außen erreichbar ist nur nginx; Datenbank, Queue, Worker und OSRM bleiben interne Services.", 68, 184, 1040, 36, {
    size: 16.6,
    color: C.ink2,
  });

  await architectureDiagram(slide, ctx, 68, 238, 728, 350);
  roleTable(slide, ctx, 824, 238, 388, 350);
  await asyncCallout(slide, ctx, 68, 606, 1144, 72);

  frame(slide, ctx, 68, 690, 1144, 1, "#DDE6EF");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 704, 250, 11, {
    size: 8.4,
    bold: true,
    color: C.muted,
  });
  label(slide, ctx, "08", 1190, 704, 22, 11, { size: 8.4, color: C.muted, align: "right" });
}
