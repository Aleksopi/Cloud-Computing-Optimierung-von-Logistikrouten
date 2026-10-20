const C = {
  ink: "#1E293B",
  ink2: "#334155",
  muted: "#64748B",
  blue: "#0F4C81",
  navy: "#2E3B4E",
  teal: "#0D9488",
  amber: "#D97706",
  green: "#16A34A",
  violet: "#6D28D9",
  red: "#B91C1C",
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

async function containerBox(slide, ctx, item) {
  shadowCard(slide, ctx, item.x, item.y, item.w, item.h, item.fill ?? C.white);
  frame(slide, ctx, item.x, item.y, item.w, 7, item.color, "none", "roundRect");
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + 18,
    y: item.y + 23,
    w: 25,
    h: 25,
    color: item.color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, item.title, item.x + 52, item.y + 18, item.w - 70, 23, {
    size: item.titleSize ?? 15.2,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, item.subtitle, item.x + 52, item.y + 43, item.w - 70, 18, {
    size: 10.7,
    bold: true,
    color: item.color,
  });
  if (item.port) {
    frame(slide, ctx, item.x + 18, item.y + item.h - 30, item.w - 36, 20, C.white, "#D8E4EE", "roundRect");
    label(slide, ctx, item.port, item.x + 26, item.y + item.h - 26, item.w - 52, 13, {
      size: 9.7,
      bold: true,
      color: C.ink2,
      align: "center",
    });
  }
}

async function smallPill(slide, ctx, item) {
  frame(slide, ctx, item.x, item.y, item.w, item.h, item.fill, item.color, "roundRect");
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + 14,
    y: item.y + 11,
    w: 20,
    h: 20,
    color: item.color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, item.text, item.x + 42, item.y + 10, item.w - 54, 19, {
    size: 11.4,
    bold: true,
    color: item.color,
    valign: "middle",
  });
}

async function roleLine(slide, ctx, x, y, color, icon, head, body) {
  frame(slide, ctx, x, y + 6, 8, 8, color, "none", "ellipse");
  await ctx.addLucideIcon(slide, {
    icon,
    x: x + 22,
    y: y,
    w: 18,
    h: 18,
    color,
    strokeWidth: 2.1,
  });
  label(slide, ctx, head, x + 48, y - 1, 116, 18, {
    size: 12.5,
    bold: true,
    color: C.ink,
  });
  label(slide, ctx, body, x + 162, y - 1, 218, 18, {
    size: 12.2,
    color: C.ink2,
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);
  frame(slide, ctx, 68, 76, 16, 16, C.violet);
  label(slide, ctx, "SYSTEMARCHITEKTUR", 94, 73, 220, 24, {
    size: 13,
    bold: true,
    color: C.violet,
  });

  label(slide, ctx, "Container-Aufbau im Docker-Compose-Stack", 68, 116, 980, 44, {
    size: 35,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Sieben produktive Container teilen ein internes Netzwerk. Nach außen ist nur Nginx sichtbar; Datenbank, Queue, Worker und OSRM bleiben interne Services.",
    68,
    172,
    1040,
    40,
    { size: 17.2, color: C.ink2 },
  );

  const panel = { x: 68, y: 224, w: 730, h: 414 };
  shadowCard(slide, ctx, panel.x, panel.y, panel.w, panel.h, C.white);
  label(slide, ctx, "Docker Compose: 7 Container · 1 internes Netzwerk", panel.x + 28, panel.y + 20, 380, 18, {
    size: 12.8,
    bold: true,
    color: C.ink,
  });
  frame(slide, ctx, panel.x + 520, panel.y + 17, 164, 24, C.softViolet, C.violet, "roundRect");
  label(slide, ctx, "prod: + nginx edge", panel.x + 534, panel.y + 21, 136, 12, {
    size: 10.5,
    bold: true,
    color: C.violet,
    align: "center",
  });

  const browser = { x: panel.x + 255, y: panel.y + 54, w: 220, h: 44 };
  frame(slide, ctx, browser.x, browser.y, browser.w, browser.h, C.softBlue, C.blue, "roundRect");
  await ctx.addLucideIcon(slide, {
    icon: "Monitor",
    x: browser.x + 20,
    y: browser.y + 11,
    w: 22,
    h: 22,
    color: C.blue,
    strokeWidth: 2,
  });
  label(slide, ctx, "Browser / VPN", browser.x + 54, browser.y + 12, 136, 18, {
    size: 13,
    bold: true,
    color: C.blue,
    align: "center",
  });

  const nginx = { x: panel.x + 228, y: panel.y + 120, w: 274, h: 58 };
  frame(slide, ctx, nginx.x, nginx.y, nginx.w, nginx.h, C.navy, "none", "roundRect");
  await ctx.addLucideIcon(slide, {
    icon: "ShieldCheck",
    x: nginx.x + 24,
    y: nginx.y + 18,
    w: 23,
    h: 23,
    color: C.white,
    strokeWidth: 2.1,
  });
  label(slide, ctx, "pharma-nginx", nginx.x + 60, nginx.y + 13, 170, 18, {
    size: 14,
    bold: true,
    color: C.white,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "/api -> backend · / -> frontend", nginx.x + 60, nginx.y + 34, 178, 14, {
    size: 10.5,
    bold: true,
    color: "#DCE6F2",
  });

  line(slide, ctx, { x: browser.x + browser.w / 2, y: browser.y + browser.h + 6 }, { x: nginx.x + nginx.w / 2, y: nginx.y - 8 }, "#9AA8BB", 2);
  await ctx.addLucideIcon(slide, {
    icon: "ArrowDown",
    x: nginx.x + nginx.w / 2 - 10,
    y: nginx.y - 25,
    w: 20,
    h: 20,
    color: "#7A8CA3",
    strokeWidth: 2.2,
  });

  const frontend = {
    x: panel.x + 62,
    y: panel.y + 216,
    w: 206,
    h: 88,
    color: C.teal,
    fill: C.softTeal,
    icon: "PanelsTopLeft",
    title: "frontend",
    subtitle: "React + MapLibre",
    port: "intern 80 · dev 5173",
  };
  const backend = {
    x: panel.x + 462,
    y: panel.y + 216,
    w: 206,
    h: 88,
    color: C.blue,
    fill: C.softBlue,
    icon: "ServerCog",
    title: "backend",
    subtitle: "FastAPI REST",
    port: "intern 8000",
  };
  await containerBox(slide, ctx, frontend);
  await containerBox(slide, ctx, backend);

  line(slide, ctx, { x: nginx.x + 54, y: nginx.y + nginx.h + 2 }, { x: frontend.x + frontend.w / 2, y: frontend.y - 10 }, "#8495AA", 2);
  line(slide, ctx, { x: nginx.x + nginx.w - 54, y: nginx.y + nginx.h + 2 }, { x: backend.x + backend.w / 2, y: backend.y - 10 }, "#8495AA", 2);
  line(slide, ctx, { x: frontend.x + frontend.w + 14, y: frontend.y + 44 }, { x: backend.x - 16, y: backend.y + 44 }, "#8495AA", 2);
  await ctx.addLucideIcon(slide, {
    icon: "ArrowRight",
    x: panel.x + 348,
    y: frontend.y + 31,
    w: 30,
    h: 30,
    color: "#6F8198",
    strokeWidth: 2.2,
  });

  const postgres = {
    x: panel.x + 36,
    y: panel.y + 326,
    w: 166,
    h: 70,
    color: C.navy,
    fill: C.soft,
    icon: "Database",
    title: "postgres",
    titleSize: 13.3,
    subtitle: "PostGIS",
    port: "5432 intern",
  };
  const redis = {
    x: panel.x + 222,
    y: panel.y + 326,
    w: 150,
    h: 70,
    color: C.red,
    fill: "#FFF1F2",
    icon: "MessageSquare",
    title: "redis",
    titleSize: 13.3,
    subtitle: "Broker",
    port: "6379 intern",
  };
  const worker = {
    x: panel.x + 392,
    y: panel.y + 326,
    w: 150,
    h: 70,
    color: C.amber,
    fill: C.softAmber,
    icon: "Cpu",
    title: "worker",
    titleSize: 13.3,
    subtitle: "Celery",
    port: "async pipeline",
  };
  const osrm = {
    x: panel.x + 562,
    y: panel.y + 326,
    w: 132,
    h: 70,
    color: C.violet,
    fill: C.softViolet,
    icon: "Route",
    title: "osrm",
    titleSize: 13.3,
    subtitle: "Routing",
    port: "5000 intern",
  };
  for (const item of [postgres, redis, worker, osrm]) {
    await containerBox(slide, ctx, item);
  }

  const busY = panel.y + 304;
  const centers = [postgres, redis, worker, osrm].map((item) => item.x + item.w / 2);
  frame(slide, ctx, backend.x + backend.w / 2 - 1, backend.y + backend.h + 4, 2, busY - (backend.y + backend.h + 4), "#A3B2C5");
  frame(slide, ctx, centers[0], busY, centers[3] - centers[0], 2, "#A3B2C5");
  for (const item of [postgres, redis, worker, osrm]) {
    frame(slide, ctx, item.x + item.w / 2 - 1, busY, 2, item.y - busY - 8, "#A3B2C5");
  }
  line(slide, ctx, { x: redis.x + redis.w, y: redis.y + 36 }, { x: worker.x - 10, y: worker.y + 36 }, "#C37B7B", 2);
  line(slide, ctx, { x: worker.x + worker.w, y: worker.y + 36 }, { x: osrm.x - 10, y: osrm.y + 36 }, "#C6A1E8", 2);

  await smallPill(slide, ctx, {
    x: panel.x + 476,
    y: panel.y + 392,
    w: 218,
    h: 30,
    color: C.violet,
    fill: C.softViolet,
    icon: "Map",
    text: "OSRM-Datenvolumen",
  });

  label(slide, ctx, "Rollen im Stack", 832, 238, 320, 28, {
    size: 22,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  const roles = [
    [C.violet, "ShieldCheck", "nginx", "Reverse Proxy, VPN-Edge"],
    [C.teal, "PanelsTopLeft", "frontend", "Karte, Dashboard, Pipeline UI"],
    [C.blue, "ServerCog", "backend", "REST-API und Orchestrierung"],
    [C.amber, "Cpu", "worker", "lange Pipeline-Läufe async"],
    [C.red, "MessageSquare", "redis", "Broker und Task-Status"],
    [C.navy, "Database", "postgres", "PostGIS, Hubs, Routen, KPIs"],
    [C.violet, "Route", "osrm", "Straßendistanzen und Fahrzeiten"],
  ];
  for (let i = 0; i < roles.length; i += 1) {
    await roleLine(slide, ctx, 832, 282 + i * 35, ...roles[i]);
  }

  shadowCard(slide, ctx, 824, 536, 392, 104, C.softTeal, "#B6E5DE");
  frame(slide, ctx, 824, 536, 8, 104, C.teal);
  label(slide, ctx, "Warum diese Trennung?", 852, 553, 260, 22, {
    size: 17,
    bold: true,
    color: "#0F5D56",
    face: ctx.fonts.title,
  });
  label(
    slide,
    ctx,
    "Pipeline-Läufe dauern Minuten: FastAPI nimmt den Auftrag an, Redis puffert ihn, Celery rechnet im Hintergrund und PostgreSQL speichert jedes Ergebnis.",
    852,
    584,
    334,
    48,
    { size: 12.7, color: C.ink },
  );

  frame(slide, ctx, 68, 652, 1104, 1, "#D7DEE8");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 672, 240, 18, { size: 9.5, color: "#486078" });
  label(slide, ctx, "08", 1200, 672, 24, 18, { size: 9.5, color: "#486078", align: "right" });
}
