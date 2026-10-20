export const C = {
  ink: "#1E293B",
  ink2: "#334155",
  muted: "#64748B",
  blue: "#0F4C81",
  deepBlue: "#2454D6",
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
  softViolet: "#F3ECFF",
  line: "#E2E8F0",
};

export function frame(slide, ctx, x, y, w, h, fill, line = "none", geometry = "rect") {
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

export function label(slide, ctx, text, x, y, w, h, opts = {}) {
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

export function shadowCard(slide, ctx, x, y, w, h, fill = C.white, line = C.line) {
  frame(slide, ctx, x + 4, y + 6, w, h, "#D6DEE8", "none", "roundRect");
  frame(slide, ctx, x, y, w, h, fill, line, "roundRect");
}

export function line(slide, ctx, a, b, color = "#94A3B8", width = 2) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const shape = frame(slide, ctx, a.x, a.y, len, width, color, "none", "roundRect");
  shape.rotation = angle;
}

export async function addIcon(slide, ctx, icon, x, y, w, h, color, strokeWidth = 2.1) {
  await ctx.addLucideIcon(slide, { icon, x, y, w, h, color, strokeWidth });
}

export async function arrow(slide, ctx, x, y, color = "#7A8CA3") {
  await addIcon(slide, ctx, "ArrowRight", x, y, 28, 28, color, 2.2);
}

export function title(slide, ctx, kicker, heading, sub, color = C.amber, page = "00") {
  frame(slide, ctx, 0, 0, ctx.W, ctx.H, C.paper);
  frame(slide, ctx, 68, 76, 16, 16, color);
  label(slide, ctx, kicker, 94, 73, 260, 24, { size: 13, bold: true, color });
  label(slide, ctx, heading, 68, 116, 1080, 44, {
    size: 33,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, sub, 68, 174, 1060, 42, { size: 17, color: C.ink2 });
  frame(slide, ctx, 68, 652, 1104, 1, "#D7DEE8");
  label(slide, ctx, "Optimierung von Logistikrouten", 68, 672, 240, 18, { size: 9.5, color: "#486078" });
  label(slide, ctx, page, 1200, 672, 24, 18, { size: 9.5, color: "#486078", align: "right" });
}

export async function pill(slide, ctx, x, y, w, h, icon, text, color, fill) {
  frame(slide, ctx, x, y, w, h, fill, color, "roundRect");
  await addIcon(slide, ctx, icon, x + 13, y + 10, 19, 19, color);
  label(slide, ctx, text, x + 40, y + 10, w - 50, h - 16, {
    size: 11,
    bold: true,
    color,
    valign: "middle",
  });
}

export async function numberedCard(slide, ctx, item) {
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
  if (item.icon) {
    await addIcon(slide, ctx, item.icon, item.x + item.w - 44, item.y + 20, 22, 22, item.color);
  }
  label(slide, ctx, item.title, item.x + 62, item.y + 15, item.w - 112, 21, {
    size: item.titleSize ?? 14.5,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, item.body, item.x + 62, item.y + 41, item.w - 84, item.h - 46, {
    size: item.bodySize ?? 10.8,
    color: C.muted,
  });
}

export function formulaBox(slide, ctx, x, y, w, h, text, titleText = "Formel") {
  frame(slide, ctx, x, y, w, h, "#101826", "none", "roundRect");
  label(slide, ctx, titleText, x + 18, y + 14, w - 36, 16, {
    size: 12.2,
    bold: true,
    color: "#D7E2F1",
    face: ctx.fonts.title,
  });
  label(slide, ctx, text, x + 18, y + 38, w - 36, h - 44, {
    size: 12.2,
    bold: true,
    color: C.white,
    face: ctx.fonts.mono,
  });
}
