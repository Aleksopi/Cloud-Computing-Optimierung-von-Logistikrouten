export const C = {
  ink: "#162033",
  ink2: "#26384F",
  paper: "#F7F5EF",
  soft: "#ECEFF1",
  white: "#FFFFFF",
  red: "#E23D35",
  teal: "#1E9A8A",
  green: "#4E9A51",
  amber: "#F2B84B",
  blue: "#3573B7",
  violet: "#6C5EA8",
  line: "#CBD5DC",
  muted: "#667487",
  paleRed: "#FBE7E5",
  paleTeal: "#DFF3EF",
  paleAmber: "#FFF1D0",
  darkPanel: "#20314B",
};

export function bg(slide, ctx, color = C.paper) {
  ctx.addShape(slide, { x: 0, y: 0, w: ctx.W, h: ctx.H, fill: color });
}

export function notes(slide, text) {
  slide.speakerNotes.setText(text);
}

export function title(slide, ctx, kicker, heading, sub = "") {
  ctx.addShape(slide, { x: 56, y: 44, w: 8, h: 40, fill: C.red });
  ctx.addText(slide, {
    text: kicker.toUpperCase(),
    x: 78,
    y: 41,
    w: 360,
    h: 28,
    fontSize: 12,
    bold: true,
    color: C.red,
    typeface: ctx.fonts.body,
    valign: "middle",
  });
  ctx.addText(slide, {
    text: heading,
    x: 78,
    y: 68,
    w: 1080,
    h: 52,
    fontSize: 36,
    bold: true,
    color: C.ink,
    typeface: ctx.fonts.title,
  });
  if (sub) {
    ctx.addText(slide, {
      text: sub,
      x: 80,
      y: 122,
      w: 1040,
      h: 34,
      fontSize: 18,
      color: C.muted,
      typeface: ctx.fonts.body,
    });
  }
}

export function footer(slide, ctx, n) {
  ctx.addShape(slide, { x: 56, y: 684, w: 1080, h: 1, fill: "#D7DCE1" });
  ctx.addText(slide, {
    text: "Pharma Logistics CH / Cloud Computing / DHBW",
    x: 56,
    y: 690,
    w: 500,
    h: 20,
    fontSize: 10,
    color: "#8A96A5",
  });
  ctx.addText(slide, {
    text: String(n).padStart(2, "0"),
    x: 1160,
    y: 690,
    w: 60,
    h: 20,
    fontSize: 10,
    bold: true,
    color: "#8A96A5",
    align: "right",
  });
}

export function card(slide, ctx, x, y, w, h, opts = {}) {
  return ctx.addShape(slide, {
    x,
    y,
    w,
    h,
    geometry: opts.round ? "roundRect" : "rect",
    fill: opts.fill || C.white,
    line: ctx.line(opts.line || C.line, opts.lineWidth ?? 1),
  });
}

export function label(slide, ctx, text, x, y, w, h, opts = {}) {
  return ctx.addText(slide, {
    text,
    x,
    y,
    w,
    h,
    fontSize: opts.fontSize || 16,
    bold: opts.bold || false,
    color: opts.color || C.ink,
    align: opts.align || "left",
    valign: opts.valign || "top",
    typeface: opts.typeface || ctx.fonts.body,
    fill: opts.fill || "#00000000",
    line: ctx.line("#00000000", 0),
    insets: opts.insets || { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

export function pill(slide, ctx, text, x, y, w, color, fill = C.white) {
  card(slide, ctx, x, y, w, 30, { fill, line: color });
  label(slide, ctx, text, x, y + 5, w, 20, {
    fontSize: 12,
    bold: true,
    color,
    align: "center",
    valign: "middle",
  });
}

export function bulletList(slide, ctx, items, x, y, w, opts = {}) {
  const gap = opts.gap || 42;
  items.forEach((item, i) => {
    const top = y + i * gap;
    ctx.addShape(slide, { x, y: top + 7, w: 7, h: 7, geometry: "ellipse", fill: opts.dot || C.red });
    label(slide, ctx, item, x + 22, top, w - 22, opts.itemH || 34, {
      fontSize: opts.fontSize || 17,
      color: opts.color || C.ink,
    });
  });
}

export async function iconTile(slide, ctx, icon, titleText, body, x, y, w, h, color) {
  card(slide, ctx, x, y, w, h, { fill: C.white, line: "#D8DEE4" });
  ctx.addShape(slide, { x, y, w: 7, h, fill: color });
  await ctx.addLucideIcon(slide, { icon, x: x + 24, y: y + 24, w: 34, h: 34, color, strokeWidth: 2.1 });
  label(slide, ctx, titleText, x + 72, y + 22, w - 92, 30, { fontSize: 18, bold: true, color: C.ink });
  label(slide, ctx, body, x + 72, y + 58, w - 92, h - 76, { fontSize: 13.5, color: C.muted });
}

export function metric(slide, ctx, value, caption, x, y, w, color, dark = false) {
  card(slide, ctx, x, y, w, 96, { fill: dark ? C.darkPanel : C.white, line: dark ? C.darkPanel : "#D8DEE4" });
  label(slide, ctx, value, x + 18, y + 14, w - 36, 40, {
    fontSize: 30,
    bold: true,
    color: dark ? C.white : color,
    align: "center",
  });
  label(slide, ctx, caption, x + 16, y + 58, w - 32, 28, {
    fontSize: 12.5,
    color: dark ? "#C9D6E6" : C.muted,
    align: "center",
    valign: "middle",
  });
}

export function connector(slide, ctx, x1, y1, x2, y2, color = C.line) {
  if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) {
    const x = Math.min(x1, x2);
    ctx.addShape(slide, { x, y: y1 - 1, w: Math.abs(x2 - x1), h: 2, fill: color });
  } else {
    const y = Math.min(y1, y2);
    ctx.addShape(slide, { x: x1 - 1, y, w: 2, h: Math.abs(y2 - y1), fill: color });
  }
}

export function smallCode(slide, ctx, text, x, y, w, h) {
  card(slide, ctx, x, y, w, h, { fill: "#101826", line: "#101826" });
  label(slide, ctx, text, x + 18, y + 18, w - 36, h - 30, {
    fontSize: 15,
    color: "#D7E2F1",
    typeface: ctx.fonts.mono,
  });
}
