import { C, addIcon, frame, label, shadowCard, title } from "./shared.mjs";

function table(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Beispiel: drei mögliche nächste Stopps", x + 20, y + 16, w - 40, 20, {
    size: 17,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Sprinter, Default-Gewichte: Kosten 40 %, Zeit 35 %, Umwelt 25 %", x + 20, y + 42, w - 40, 14, {
    size: 10.8,
    color: C.muted,
  });
  const headers = ["Kandidat", "Δkm", "Δh", "ΔCHF", "ΔCO2", "Score", "Entscheid"];
  const widths = [96, 62, 62, 72, 72, 72, 96];
  let cx = x + 20;
  const hy = y + 78;
  headers.forEach((head, i) => {
    frame(slide, ctx, cx, hy, widths[i], 28, C.blue, i === 0 ? "none" : "#FFFFFF");
    label(slide, ctx, head, cx + 6, hy + 8, widths[i] - 12, 10, {
      size: 9.7,
      bold: true,
      color: C.white,
      align: i === 0 || i === 6 ? "left" : "center",
    });
    cx += widths[i];
  });
  const rows = [
    ["A Stadt", "8 km", "0,33 h", "17,89", "1,48 kg", "0,75", ""],
    ["B Autobahn", "14 km", "0,22 h", "15,22", "2,59 kg", "0,25", "gewählt"],
    ["C Umweg", "11 km", "0,30 h", "17,68", "2,04 kg", "0,75", ""],
  ];
  rows.forEach((row, r) => {
    let xx = x + 20;
    row.forEach((cell, i) => {
      const selected = r === 1;
      frame(slide, ctx, xx, hy + 28 + r * 34, widths[i], 34, selected ? C.softTeal : (r % 2 === 0 ? "#FBFDFF" : C.white), selected ? "#8FD8D0" : "#E7EDF4");
      label(slide, ctx, cell, xx + 6, hy + 40 + r * 34, widths[i] - 12, 10, {
        size: 10.3,
        bold: selected && (i === 0 || i === 5 || i === 6),
        color: selected && i === 6 ? C.teal : C.ink,
        align: i === 0 || i === 6 ? "left" : "center",
      });
      xx += widths[i];
    });
  });
  label(slide, ctx, "B hat mehr Kilometer als A, aber weniger Fahrzeit und geringere CHF-Grenzkosten. Der Score macht diesen Zielkonflikt sichtbar.", x + 20, y + h - 36, w - 40, 22, {
    size: 12,
    bold: true,
    color: C.ink2,
  });
}

function liveBox(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Was Live Traffic verändert", x + 22, y + 16, w - 44, 22, {
    size: 17,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  const bars = [
    ["A Stadt", 0.33, 0.50, C.red],
    ["B Autobahn", 0.22, 0.24, C.teal],
    ["C Umweg", 0.30, 0.34, C.amber],
  ];
  bars.forEach(([name, free, live, color], i) => {
    const yy = y + 58 + i * 48;
    label(slide, ctx, name, x + 24, yy, 82, 16, { size: 11.2, bold: true, color: C.ink });
    frame(slide, ctx, x + 112, yy + 4, 150, 9, "#E8EEF5", "none", "roundRect");
    frame(slide, ctx, x + 112, yy + 4, 150 * free / 0.55, 9, "#9DB6D0", "none", "roundRect");
    frame(slide, ctx, x + 112, yy + 19, 150, 9, "#E8EEF5", "none", "roundRect");
    frame(slide, ctx, x + 112, yy + 19, 150 * live / 0.55, 9, color, "none", "roundRect");
    label(slide, ctx, `${String(free).replace(".", ",")} h`, x + 270, yy - 1, 46, 12, { size: 9.8, color: C.muted });
    label(slide, ctx, `${String(live).replace(".", ",")} h`, x + 270, yy + 15, 46, 12, { size: 9.8, bold: true, color });
  });
  frame(slide, ctx, x + 24, y + h - 54, 12, 7, "#9DB6D0", "none", "roundRect");
  label(slide, ctx, "OSRM Free Flow", x + 44, y + h - 58, 110, 12, { size: 10, color: C.muted });
  frame(slide, ctx, x + 166, y + h - 54, 12, 7, C.red, "none", "roundRect");
  label(slide, ctx, "Live/Traffic-Zeit", x + 186, y + h - 58, 110, 12, { size: 10, color: C.muted });
}

export async function slide04(presentation, ctx) {
  const slide = presentation.slides.add();
  title(
    slide,
    ctx,
    "ROUTENBERECHNUNG",
    "Mini-Beispiel: so wird der nächste Stopp ausgewählt",
    "Die Route entsteht aus wiederholten lokalen Entscheidungen. Pro Kandidat werden echte Grenzwerte berechnet, normalisiert und gewichtet.",
    C.amber,
    "13",
  );

  table(slide, ctx, 68, 246, 640, 302);
  liveBox(slide, ctx, 748, 246, 466, 302);

  shadowCard(slide, ctx, 68, 580, 1146, 46, C.softAmber, "#EFD5AA");
  frame(slide, ctx, 68, 580, 7, 46, C.amber);
  await addIcon(slide, ctx, "CheckCircle2", 92, 592, 22, 22, C.amber);
  label(slide, ctx, "In der nächsten Iteration startet die Berechnung bei Stopp B: neue Kandidaten, neue Δkm/Δh, neuer Score. So wächst die Tour bis kein zulässiger Stopp mehr übrig ist.", 126, 592, 950, 18, {
    size: 13,
    bold: true,
    color: C.ink2,
  });
}
